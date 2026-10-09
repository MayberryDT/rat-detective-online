import { PICKUP_COPY } from '../shared/pickups';
import { MAX_OBSERVERS, observationAllowed } from '../shared/observation';
import {RoundAwards} from './RoundAwards';
import type {Award,RoundReport} from '../shared/networkProtocol';
import { RECONNECT_GRACE_MS, SESSION_REPLACED_CLOSE_CODE } from '../shared/reconnect';
import { newStreakTitle } from '../shared/streak';
import { codeOnlyRound, type Personality } from '../shared/bots/intent';
import { ChaosDelivery } from './ChaosDelivery';
import { ConnectionDelivery } from './ConnectionDelivery';
import { wireBytes } from '../shared/networkProtocol';
import { movementRow, serializeMovement } from '../shared/movementWire';
import { CHAOS_WIRE_MODE, prepareChaos, type PreparedChaos } from '../shared/chaosWire';
import { ChaosSimulation, type ChaosHit } from '../shared/ChaosSimulation';
import type { WeaponKind } from '../shared/pickups';
import { serializeServerMessage } from './serializeServerMessage';
import { type ChaosState } from '../shared/chaosState';
import { shootRate } from '../shared/shotTiming';
import { GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { sharedGrayboxBoxes } from '../shared/sharedLayout';
import { drowned } from '../shared/city/kit/city';
import { ASSIGNMENT_IDS, ASSIGNMENTS, createAssignment, isAssignmentId, nextAssignment, type AssignmentId, type AssignmentRotation, type AssignmentState } from '../shared/assignments';
import { incidentInfo, incidentRoster, isEvidenceMode, isIncidentId, parseIncidentList, type EvidenceMode, type IncidentId } from '../shared/incidentCatalog';
import { DurableObject } from 'cloudflare:workers';
import {
  MAX_CONNECTIONS,
  MAX_SERVER_MESSAGE_BYTES,
  MAX_PLAYERS,
  MAX_HP,
  DEFAULT_ROOM_NAME,
  PROTOCOL_VERSION,
  READING_CAP_MS,
  RESPAWN_DELAY_MS,
  WIN_DISPLAY_MS,
  type ClientMessage,
  type EnvironmentCause,
  type PlayerData,
  type PublicRoomStatus,
  type RoundState,
  type ServerMessage,
} from '../shared/networkProtocol';
import { createSafeSpawn, createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import {
  applyHit,
  buildScoreboard,
  clearRecord,
  createPlayer,
  playingRound,
  resetRoundForWorld,
  respawnPlayer,
  spawnForWorld,
  wonRound,
} from './gameState';
import { log } from './logging';
import { RoomDiagnostics } from './RoomDiagnostics';
import { ServerBotController } from './ServerBotController';
import { JevClient, JEV_MODEL } from './bots/jevClient';
import { JevMind } from './bots/jevMind';
import { JevBudget, JEV_LEDGER } from './bots/jevBudget';
import { createRoundBotRoster, dealPersonalities, fillBotRoster, nextRoundBotRoster, MAX_PERSISTENT_BOTS, MIN_PERSISTENT_BOTS, PERSISTENT_BOT_IDS, PERSISTENT_BOT_ROSTER, type PersistentBot } from '../shared/botRoster';
import { NAME_MAX_LENGTH } from '../shared/ratNames';
import { HEAT_CELL } from './HeatMap';
import { aggregateMode, buildName, CityStore, COPY_STEPS, type AggregateMode, type CopyChunk, type Filter, type Range, type UnpackResult } from './city/CityStore';
import { CityArchive } from './city/CityArchive';
import { CityRecorder } from './city/CityRecorder';
import { HighlightDetector } from './HighlightDetector';
import { SpatialRayQuery } from '../shared/SpatialRayQuery';
import * as CANNON from 'cannon-es';
import { logClientDiagnostics, allowsLocalDiagnostics } from './clientDiagnostics';
import { verifyBearerToken } from './auth';
import type { AdminCommand, AdminResult, AdminStatus, AdminVia } from '../shared/admin';
import { companionProjectionDue, companionProjectionSignature, projectCompanionRoom } from './companionStatus';
import {
  clampPosition,
  EXHIBIT_RATE,
  HIT_RATE,
  JOIN_RATE,
  MOVEMENT_RATE,
  PING_RATE,
  PERF_RATE,
  RateLimiter,
  createMovementAllowance,
  consumeMovementAllowance,
  MOVEMENT_ENVELOPE,
  type MovementAllowance,
  isPlausibleShot,
  parseClientMessage,
} from './validation';

interface SocketAttachment {
  connectionId?: string;
  observer?: boolean;
  /** Local camera avatar only: never inserted in players, sessions or physics. */
  observerPlayer?: PlayerData;
  playerId?: string;
  /** Extra local bot connections consume the human socket's shared world feed. */
  receiveMode?: 'welcome-only';
  localDiagnostics?: boolean;
  compactChaos?: boolean;
  compactChaosDelta?: boolean;
  batchMovement?: boolean;
  tupleMovement?: boolean;
  delivery?: boolean;
  delivered?: boolean;
  admissionUntil?: number;
  titleUntil?: number;
  /** Pressed Enter City (a held join): the room wakes for this seat while its browser finishes loading; the welcome
   * waits for the real join. Counts as a human for the bots until then (`admissionUntil` is its lease). */
  held?: true;
  /** Joined with `agent=1`: a headless agent browser, recorded as `agent`, never `human` (docs/city-map.md). */
  agent?: boolean;
  /** Proved the room's `ADMIN_TOKEN` in an `admin` message; the token itself is never kept. */
  admin?: boolean;
}

interface StoredPlayerRow extends Record<string, SqlStorageValue> {
  id: string;
  data: string;
  updated_at: number;
  last_active_at: number;
}

interface PendingEventRow extends Record<string, SqlStorageValue> {
  id: string;
  /** `continue`: a held reader's spawn at `READING_CAP_MS` if they have not continued before. */
  type: 'respawn' | 'reset' | 'continue';
  player_id: string | null;
  due_at: number;
}

const WORLD_KEY = 'world';
/** City layouts the room upgrades from on load (layout 3 added the harbour, docks and precinct; layout 4 moved the supplies; layout 5 added Stakeout;
 * layout 6 added the weapon sites). */
const PREVIOUS_GRAYBOX_VERSIONS: readonly number[] = [2, 3, 4, 5, 6];
const ROUND_KEY = 'round';
const ASSIGNMENT_ROTATION_KEY = 'assignment-rotation-v1';
const PERSISTENT_BOTS_KEY = 'persistent-bots-v1';
const BOT_ROSTER_KEY = 'persistent-bot-roster-v1';
const ROUND_BOT_COUNT_KEY = 'round-bot-count-v1';
const MATCH_ROOM_KEY = 'match-room-v1';
const EVIDENCE_MODE_KEY = 'evidence-mode-v1';
const FORCED_INCIDENT_KEY = 'incident-forced-v1';
const COMPANION_GENERATION_KEY = 'companion-generation-v1';
const COMPANION_REVISION_KEY = 'companion-revision-v1';
const COMPANION_ACTIVE_KEY = 'companion-active-v1';
/** How far copying the old public room's history has got (`cityCopy`). */
const CITY_COPY_KEY = 'city-copy-v1';
const COMPANION_REFRESH_MS = 20_000;
export const BOT_REFILL_MS = 10_000;
const JOIN_LEASE_MS = 10_000;
/** How long a held join (Enter pressed, browser still loading) keeps its seat before the real join must come. */
const HELD_JOIN_MS = 20_000;
export const BOT_HEARTBEAT_MS = 15_000;
export const STALE_PLAYER_MS = 2 * 60_000;
export const CHECKPOINT_MS = 2_500;
/** How often a playing room writes its routine state (chaos, rats due a checkpoint). */
export const ROUTINE_CHECKPOINT_MS = 3_000;
const RECENT_SHOT_LIMIT = 24;
/** A human counts as present for Jev while they played this recently; a `minds` fact covers this long. */
const JEV_PRESENCE_MS = 60_000, JEV_REPORT_MS = 60_000;
const POSE_FIELDS = ['x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'meshQx', 'meshQy', 'meshQz', 'meshQw'] as const;
type MovementPose = Extract<ServerMessage, { type: 'playerMoved' }>['player'];

export class GameRoom extends DurableObject<Env> {
  private readonly diagnostics = new RoomDiagnostics();
  private readonly socketAttachments = new WeakMap<WebSocket, SocketAttachment>();
  private readonly chaosDelivery=new WeakMap<WebSocket,ChaosDelivery>();
  private readonly connectionDelivery=new WeakMap<WebSocket,ConnectionDelivery>();
  private readonly failedSockets=new WeakSet<WebSocket>();
  private audience: WebSocket[] | null = null;
  private readonly joining = new WeakSet<WebSocket>();
  private batchScoreboards = false;
  private transportEventAt = Date.now();
  private noteTransportActivity(): void {
    const now=Date.now();
    if(this.chaosTimer && now-this.transportEventAt>1000)for(const ws of this.recipients()){
      this.connectionDelivery.get(ws)?.resumed(now);this.chaosDelivery.get(ws)?.resumed(now);
    }
    this.transportEventAt=now;
  }
  private chaos:ChaosSimulation|null=null;
  private chaosTimer:ReturnType<typeof setInterval>|null=null;
  private chaosLast=0;
  private chaosAccumulator=0;
  private chaosSavedAt=0;
  private chaosSignature='';
  private checkpointProbePending = false;
  private persistentBots = false;
  private matchRoom: string | null = null;
  private matchPool: string | null = null;
  private refillAt = 0;
  private botRoster: PersistentBot[] = [];
  private roundBotCount = 0;
  private serverBots: ServerBotController | null = null;
  private preparedBots: ServerBotController | null = null;
  private preparedUntil = 0;
  private botState: ChaosState | undefined;
  private nextBotHeartbeat = 0;
  private players = new Map<string, PlayerData>();
  /** `agent`: the rat is an agent browser's (`agent=1`); kept with the seat so a reconnect or an eviction keeps it. */
  private readonly sessions = new Map<string, {token:string; until:number | null; agent?: true}>();
  private round: RoundState = playingRound();
  private assignmentRotation: AssignmentRotation = { remaining: [] };
  /** The standard roster ships; `classic` adds the retired Evidence Tampering missile incident (private practice only). */
  private evidenceMode: EvidenceMode = 'standard';
  /** Practice-only: force every Dispatch roll to one incident. Null = normal shuffle. */
  private forcedIncident: IncidentId | null = null;
  private world: WorldSpec = createWorldSpec();
  /** The stored world was an older city layout: its checkpoint and positions belong to streets that moved. */
  private layoutChanged = false;
  private lastCheckpointAt = new Map<string, number>();
  /** Routine pose checkpoints waiting for the next chaos checkpoint transaction. */
  private readonly dueCheckpoints = new Set<string>();
  /** Polish 19: cosmetic per-round Case File tallies (memory only). */
  private readonly awards = new RoundAwards();
  /** Results (protocol 28): the humans the round-end frame reached; at the reset, those still reading sit the new round
   * out (`holdReader`). Memory only: a restart before the reset starts everyone. */
  private readers = new Set<string>();
  /** Held readers: dead, out of everyone else's city and the welcome, until they continue. Rebuilt from `continue` rows. */
  private readonly hidden = new Set<string>();
  /** The city map's recorder (docs/city-map.md); built on first use from this room's world. */
  private cityRecorder: CityRecorder | null = null;
  /** Highlight replays (docs/replay/detection.md): the moments sent to every player as `highlight` markers. */
  private readonly highlights = new HighlightDetector({
    send: marker => this.broadcast(marker),
    record: marker => this.city.highlight(marker, this.now()),
    isHuman: id => !this.isManagedBot(id) && !this.sessions.get(id)?.agent,
    corpseAt: id => this.chaos?.corpseAt(id),
  });
  /** The Jev mind for this room's server bots, and the day's budget (docs/bot-overhaul.md, B4). */
  private jevMind: JevMind | null = null;
  private jevBudgetState: JevBudget | null = null;
  /** The current `minds` window: when it started (0 while Jev is off) and when it is reported. */
  private jevWindowStart = 0;
  private jevReportAt = 0;
  /** When each human last played (moved, turned, fired, took a pickup, joined): only recent play keeps Jev on. */
  private lastInputAt = new Map<string, number>();
  /** Tests replace these: the TypeSafe key (a Worker secret), the transport, and how long play counts as presence. */
  private jevKey: () => string | undefined = () => this.env.TYPESAFE_API_KEY;
  private jevFetch: typeof fetch = (input, init) => fetch(input, init);
  private jevPresenceMs = JEV_PRESENCE_MS;
  private readonly cityStore: CityStore;
  private sightQuery: { world: CANNON.World; query: SpatialRayQuery; refreshedAt: number } | null = null;
  private lastActiveAt = new Map<string, number>();
  private recentShots = new Map<string, string[]>();
  private lastMovementSequence = new Map<string, number>();
  private movementAllowances = new Map<string, MovementAllowance>();
  private readonly shotAcceptedAt = new Map<string, number>();
  private lastMovementBroadcast = new Map<string, { pose: MovementPose; at: number; stationary: boolean }>();
  private readonly rateLimiter = new RateLimiter();
  private messagesIn = 0;
  private broadcasts = 0;
  /** Each rat's latest look (camera for a player, aim for a bot), broadcast with its pose for replays. */
  private readonly looks=new Map<string,{lookYaw:number;lookPitch:number}>();
  private readonly pendingMovement=new Map<string,Extract<ServerMessage,{type:'playersMoved'}>['players'][number]>();
  private lastSnapshotAt = 0;
  private reconnects = 0;
  private companionGeneration = 0;
  private companionRevision = 0;
  private companionActive = false;
  private companionLastPublishedAt = 0;
  private companionLastProjectedAt = 0;
  private companionSignature = '';
  /** Tests replace this to age checkpoints without waiting real time. */
  private clock: () => number = () => Date.now();

  /** The Cloudflare data centre this room runs in (latency diagnosis; in each diagnostics line). */
  private copying = false;
  private where = '?';
  private coloReady?: Promise<void>;
  /** Where this room runs (`/status`, and staging's `/status?colo=<room>`): a room lives where it was first reached,
   * and its distance from the players is their ping floor. */
  async colo(): Promise<string> { await Promise.race([this.coloReady, new Promise(resolve => setTimeout(resolve, 500))]); return this.where; }
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Where this room runs (latency diagnosis): Cloudflare's trace names the data centre the object lives in.
    this.coloReady = fetch('https://www.cloudflare.com/cdn-cgi/trace').then(r => r.text()).then(text => { this.where = /colo=(\w+)/.exec(text)?.[1] ?? '?'; }).catch(() => undefined);
    this.cityStore = new CityStore(ctx.storage.sql, fn => ctx.storage.transactionSync(fn), aggregateMode(env.CITY_AGGREGATES));
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      this.hydrate();
      if (this.persistentBots) {
        if (this.matchRoom) this.rebalanceBots();
        else this.activatePersistentBots();
      }
      if (this.isPublicMatchRoom() && [...this.players.keys()].some(id => !this.isManagedBot(id))) this.activateCompanion();
      await this.scheduleNextAlarm({ preserveExisting: true });
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ error: 'Expected WebSocket upgrade' }, { status: 400 });
    }
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) {
      return Response.json({ error: 'This room is full' }, { status: 503 });
    }

    // Opt-in graybox rooms keep the existing public world's identity intact.
    const requestUrl = new URL(request.url);
    const observing=requestUrl.searchParams.get('observe')==='1';
    if(observing && !observationAllowed(requestUrl,this.env as Env & {CAPACITY_FIXTURE_ID?:string;CAPACITY_EXPIRES_AT?:string}))
      return new Response('Observation requires an active private bot fixture',{status:403});
    if(observing && this.ctx.getWebSockets().filter(ws=>ws.readyState===WebSocket.OPEN&&this.getAttachment(ws).observer).length>=MAX_OBSERVERS)
      return new Response('Observer places full',{status:503});
    const resuming=!observing&&requestUrl.searchParams.get('resume')==='1';
    const preparing=resuming || this.matchRoom && requestUrl.searchParams.get('prepare')==='1';
    if(preparing && this.ctx.getWebSockets().filter(ws=>!this.getPlayerId(ws)&&this.getAttachment(ws).titleUntil!==undefined).length>=16)
      return new Response('Title connections busy',{status:503});
    const admissionDeadline = Number(request.headers.get('x-rat-admission-deadline')) || Infinity;
    if (this.matchRoom && Date.now() >= admissionDeadline) return new Response('Admission expired',{status:503});
    const roomName = requestUrl.searchParams.get('room') || '';
    if (roomName.startsWith('graybox-') && this.world.version !== GRAYBOX_VERSION &&
        this.players.size === 0 && this.ctx.getWebSockets().length === 0) {
      this.world = { ...createWorldSpec(), version: GRAYBOX_VERSION };
      this.persistWorld();
    }

    if (this.matchRoom) {
      this.expireAdmissions();
      if (!observing && !preparing && this.humanSlots() >= MAX_PLAYERS) return Response.json({ error: 'This room is full' }, { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.setAttachment(server, { connectionId: crypto.randomUUID(),
      ...(observing ? {observer:true,titleUntil:this.now()+30_000} : preparing ? {titleUntil:this.now()+30_000} : this.matchRoom ? { admissionUntil: this.now() + JOIN_LEASE_MS } : {}),
      localDiagnostics: allowsLocalDiagnostics(request),
      ...([CHAOS_WIRE_MODE,'compact-v1'].includes(requestUrl.searchParams.get('chaos')??'')?{compactChaos:true}:{}),
      ...(requestUrl.searchParams.get('chaos')===CHAOS_WIRE_MODE?{compactChaosDelta:true}:{}),
      ...(['batch-v1','tuple-v1'].includes(requestUrl.searchParams.get('movement')??'')?{batchMovement:true}:{}),
      ...(requestUrl.searchParams.get('movement')==='tuple-v1'?{tupleMovement:true}:{}),
      ...(requestUrl.searchParams.get('receive') === 'welcome-only' ? { receiveMode: 'welcome-only' as const } : {}),
      ...(requestUrl.searchParams.get('agent') === '1' ? { agent: true } : {}),
    });
    this.ctx.acceptWebSocket(server);
    this.audience = null;
    if (this.matchRoom || observing) await this.scheduleNextAlarm();
    if (this.matchRoom && Date.now() >= admissionDeadline) {
      server.close(1001,'Admission expired');return new Response('Admission expired',{status:503});
    }

    return new Response(null, { status: 101, webSocket: client, headers: this.matchRoom ? {'x-rat-slots': String(this.humanSlots())} : {} });
  }

  /** Trusted local/private entry points only. An announced active assignment
   * never changes in response to another participant's connection. */
  configureAssignment(id: AssignmentId | null): boolean {
    if (id !== null && !isAssignmentId(id)) return false;
    if (this.assignmentRotation.forced === (id ?? undefined)) return true;
    if (this.players.size || this.ctx.getWebSockets().length) return false;
    this.assignmentRotation = { remaining: [], last: this.assignmentRotation.last, ...(id ? { forced: id } : {}) };
    this.chaos?.reset();
    this.round = playingRound(this.now());
    if(this.chaos)this.beginAssignment();
    this.checkpointGame();
    return true;
  }

  /** Private-room opt-in for the retired missile incident (`classic`); `standard` is the shipped roster.
   * A live room must be empty so every client agrees on the mode. */
  configureIncidents(mode: EvidenceMode): boolean {
    if (!isEvidenceMode(mode)) return false;
    if (this.evidenceMode === mode) return true;
    if (this.players.size || this.ctx.getWebSockets().length) return false;
    this.evidenceMode = mode;
    this.writeRoomState(EVIDENCE_MODE_KEY, mode);
    this.chaos?.reset();
    this.round = playingRound(this.now());
    this.checkpointGame();
    return true;
  }

  /** Practice-only pin so a reviewer can evaluate one incident without waiting
   * for the shuffle. Never available on a public room (see index.ts gating). */
  configureIncident(id: IncidentId | null): boolean {
    if (id !== null && !isIncidentId(id)) return false;
    if (this.forcedIncident === id) return true;
    if (this.players.size || this.ctx.getWebSockets().length) return false;
    this.forcedIncident = id;
    if (id) this.writeRoomState(FORCED_INCIDENT_KEY, id);
    else this.ctx.storage.sql.exec('DELETE FROM room_state WHERE key = ?', FORCED_INCIDENT_KEY);
    this.chaos?.reset();
    this.round = playingRound(this.now());
    this.checkpointGame();
    return true;
  }

  /** Trusted matchmaker RPC. Fixed benchmark rooms retain their separate roster policy. */
  async enableMatchmaking(name: string, pool = name): Promise<void> {
    if (!this.matchRoom) {
      this.writeRoomState(MATCH_ROOM_KEY, name);
      this.matchRoom = name;
      this.matchPool = pool;
      this.writeRoomState('match-pool-v1',pool);
    }
    await this.ensurePersistentBots();
  }

  async occupiedSlots(): Promise<number> { this.reconcileLiveness(); this.expireAdmissions(); return this.humanSlots(); }

  /** Humans holding a seat: joined, inside the reconnect grace, or admitted and joining. A room plays only while
   * this is above zero; at zero it stops the tick and the bots, checkpoints once and sets no wake, so it hibernates. */
  private humanSlots(): number {
    const humanIds = new Set([...this.players.keys()].filter(id => !this.isManagedBot(id)));
    let pending = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.getAttachment(ws);
      if (!a.playerId && (a.admissionUntil ?? 0) > this.now()) pending++;
    }
    return humanIds.size + pending;
  }

  /** Seats held by a pressed Enter City, not joined yet, inside their lease. */
  private heldSeats(): number {
    let held = 0;
    for (const ws of this.ctx.getWebSockets()) { const a = this.getAttachment(ws); if (a.held && !a.playerId && (a.admissionUntil ?? 0) > this.now()) held++; }
    return held;
  }

  private writeRoundBotCount(): void {
    this.writeRoomState(ROUND_BOT_COUNT_KEY, String(this.roundBotCount));
  }

  private ensureRoundBotRoster(humans: number): number {
    if (!this.roundBotCount) {
      const rolled = createRoundBotRoster([...this.players.values()].map(player => player.name));
      this.roundBotCount = rolled.length;
      this.writeRoundBotCount();
      if (!this.botRoster.length) this.botRoster = rolled.slice(0, Math.max(0, MAX_PLAYERS - humans));
    }
    return this.roundBotCount;
  }

  private expireAdmissions(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.getAttachment(ws);
      const deadline=a.admissionUntil??a.titleUntil;
      if (!a.playerId && deadline !== undefined && deadline <= this.now()) {
        ws.close(1008, 'Joining timed out');
      }
    }
  }

  private rebalanceBots(): void {
    if (!this.matchRoom) return;
    const wasRunning = this.chaosTimer !== null || this.botRoster.length > 0;
    // A held seat (Enter pressed, browser still loading) brings the round's bots like a joined human.
    const humans = [...this.players.keys()].filter(id => !this.isManagedBot(id)).length + this.heldSeats();
    const previousLength = this.botRoster.length;
    const target = humans ? Math.min(this.ensureRoundBotRoster(humans), MAX_PLAYERS - humans) : 0;
    if (target > this.botRoster.length && this.refillAt > this.now()) return;
    if (this.refillAt) { this.refillAt = 0; this.writeRoomState('bot-refill-at', '0'); }
    const rosterChanged = previousLength !== target;
    if (this.botRoster.length > target) {
      const removed = this.botRoster.slice(target);
      for (const {id} of removed) this.removePlayerById(id, true);
      this.botRoster = this.botRoster.slice(0, target);
    } else if (this.botRoster.length < target) {
      this.botRoster = fillBotRoster(this.botRoster, target, [...this.players.values()].map(player => player.name));
    }
    if (rosterChanged) this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(this.botRoster));
    if (humans) { if (rosterChanged || !this.serverBots) this.activatePersistentBots(); }
    else {
      this.stopPlaying();
      if (this.chaos && wasRunning) this.checkpointGame();
      if (this.roundBotCount) { this.roundBotCount = 0; this.writeRoundBotCount(); }
      if (wasRunning && this.matchPool && !this.humanSlots()) this.retireFromMatchmaker();
    }
  }

  /** Stop the tick and the bots' minds; the caller checkpoints. */
  private stopPlaying(): void {
    this.serverBots?.dispose(); this.serverBots = null; this.botState = undefined; this.updateJev(this.now());
    if (this.chaosTimer) { clearInterval(this.chaosTimer); this.chaosTimer = null; this.cityRecorder?.flush(this.now(), true); }
    this.nextBotHeartbeat = 0;
  }

  /** Trusted Worker RPC (via `enableMatchmaking`): sets up the managed roster. Bots join and play only with a human. */
  async ensurePersistentBots(): Promise<void> {
    if (!this.persistentBots) {
      this.reconcileLiveness();
      if (!this.matchRoom && this.players.size > MAX_PLAYERS - MAX_PERSISTENT_BOTS) {
        throw new Error('The room has too many human players to enable its persistent roster');
      }
      if (this.world.version !== GRAYBOX_VERSION) {
        this.world = { ...this.world, version: GRAYBOX_VERSION };
        this.persistWorld();
      }
      const roster = this.matchRoom ? [] : createRoundBotRoster([...this.players.values()].map(player => player.name));
      this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(roster));
      this.writeRoomState(PERSISTENT_BOTS_KEY, 'true');
      this.botRoster = roster;
      this.persistentBots = true;
    }
    if (this.matchRoom) this.rebalanceBots();
    else this.activatePersistentBots();
    await this.scheduleNextAlarm();
  }

  private isManagedBot(id: string): boolean {
    return this.persistentBots && this.botRoster.some(bot => bot.id === id);
  }

  /** Prepare expensive geometry while the title is visible. No participant,
   * simulation interval, assignment clock or reserved admission is created. */
  async prepareEntry():Promise<void> {
    if(!this.matchRoom||this.serverBots||this.players.size)return;
    this.startChaos(true);
    if(!this.preparedBots)this.preparedBots=this.createBotController();
    this.preparedUntil=this.now()+30_000;
    await this.scheduleNextAlarm();
  }

  private createBotController():ServerBotController {
    return new ServerBotController(this.world, this.matchRoom ? PERSISTENT_BOT_IDS : this.botRoster.map(bot => bot.id), {
        recover: id => this.recoverManagedBot(id),
        recoverCase: () => { this.chaos?.recoverLooseCase(); },
        move: (id, position, facing, at, look) => {
          this.handleMovement(id, { type: 'updateMovement', position, rotation: { x: 0, y: 0, z: 0, w: 1 },
            meshRotation: { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) }, ...(look ? { aim: look } : {}) }, at);
        },
        shoot: (id, origin, direction) => {
          if (!this.admitShot(id)) return;
          this.handleShoot(id, { type: 'shoot', shotId: crypto.randomUUID(), origin, direction });
        },
        decide: (id, decision, now) => {
          const player = this.players.get(id), jev = this.jevMind;
          if (player) this.city.decision(player, decision, now, jev?.enabled && decision.answer.source === 'code' ? jev.outcome(id) : undefined);
        },
        controls: (id, controls, now) => { this.city.botControls(id, controls, now); },
      }, id => { const bot = this.botRoster.find(entry => entry.id === id); if (!bot) return undefined;
        this.dealtPersonalities = dealPersonalities(this.botRoster.map(entry => entry.name), this.dealtPersonalities);
        return this.dealtPersonalities.get(bot.name); }, this.jev);
  }
  /** Each roster bot's dealt archetype, kept while it stays (`dealPersonalities`). */
  private dealtPersonalities = new Map<string, Personality>();

  private get jev(): JevMind {
    return this.jevMind ??= new JevMind({ waitUntil: work => this.ctx.waitUntil(work),
      client: new JevClient({ key: () => this.jevKey(), model: this.env.JEV_MODEL || JEV_MODEL, fetch: (input, init) => this.jevFetch(input, init), clock: () => this.now() }),
      // A reply that lands after Jev switched off (or its bots were disposed) is reported at once.
      spend: dollars => { const budget = this.jevBudget; budget.add(dollars); if (!this.jevMind?.enabled) budget.tick(this.now(), true); } });
  }

  private get jevBudget(): JevBudget {
    const ledger = () => this.env.MATCHMAKER.getByName(JEV_LEDGER), room = this.matchRoom ?? this.ctx.id.name ?? 'room';
    return this.jevBudgetState ??= new JevBudget({ spend: (dollars, now) => ledger().jevSpend(room, dollars, now), read: now => ledger().jevBudget(now) },
      work => this.ctx.waitUntil(work), () => this.now());
  }

  /** Jev thinks for the server bots only while a human is playing (connected, and moved, fired or took a pickup
   * within `JEV_PRESENCE_MS`), the key is set and the day's budget is open; otherwise the code mind does, so the
   * empty city and an idle tab cost nothing. Switching resets no bot or route. Spend is reported about every
   * 30 s and whenever Jev switches off; a `minds` fact and a log line cover every minute Jev is on. */
  private updateJev(now: number): void {
    const jev = this.jevMind;
    if (!jev) return;
    let human = false;
    if (this.serverBots && this.jevKey()) for (const id of this.players.keys()) {
      // Agent browsers (`agent=1`) are not people: they never switch Jev on or spend its budget.
      const session = this.sessions.get(id);
      if (!this.isManagedBot(id) && !session?.agent && session?.until == null && now - (this.lastInputAt.get(id) ?? -Infinity) < this.jevPresenceMs) { human = true; break; }
    }
    // Code-only rounds keep Jev off with humans playing: the fair comparison with Jev (the bot learning plan, L5).
    const codeRound = codeOnlyRound(this.chaos?.assignmentState?.roundId);
    const budget = this.jevBudget, on = human && !codeRound && budget.allows(now), off = jev.enabled && !on;
    budget.tick(now, off);
    if (on && !jev.enabled) { this.jevWindowStart = now; this.jevReportAt = now + JEV_REPORT_MS; }
    jev.enabled = on;
    if (off || on && now >= this.jevReportAt) this.reportJev(jev, now, on);
  }
  private reportJev(jev: JevMind, now: number, on: boolean): void {
    const { stats, latencies } = jev.takeWindow(), ms = now - this.jevWindowStart;
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length / 2)], p90 = latencies[Math.floor(latencies.length * .9)];
    log('info', 'jev', { on, ms, ...stats, latencyP50: p50, latencyP90: p90 });
    this.city.minds({ ms, stats, latencies, ...(p50 === undefined || p90 === undefined ? {} : { p50, p90 }) }, now);
    this.jevWindowStart = now; this.jevReportAt = now + JEV_REPORT_MS;
  }

  private activatePersistentBots(): void {
    if (!this.humanSlots()) return;
    const added: string[] = [];
    for (const entry of this.botRoster) {
      if (this.players.has(entry.id)) continue;
      const player = createPlayer(entry.id, entry.name, entry.appearance,
        spawnForWorld(this.world, Math.random, this.players.values(), undefined, this.chaos?.assignmentState));
      this.players.set(entry.id, player);
      added.push(entry.id);
      this.persistPlayer(player, true);
      this.broadcast({ type: 'playerJoined', player });
    }
    if (!this.serverBots) {
      this.serverBots = this.preparedBots ?? this.createBotController();
      this.preparedBots = null;this.preparedUntil = 0;
      for (const { id } of this.botRoster) {
        const player = this.players.get(id)!;
        this.serverBots.reset(id, { x: player.x, y: player.y, z: player.z });
      }
    }
    for (const id of added) this.serverBots.reset(id, this.players.get(id)!);
    if (!this.nextBotHeartbeat) this.nextBotHeartbeat = this.now() + BOT_HEARTBEAT_MS;
    this.startChaos();
  }

  private restoreBotRoster(): void {
    const raw = this.readRoomState(BOT_ROSTER_KEY);
    if (raw) {
      try {
        const roster = JSON.parse(raw) as PersistentBot[];
        if (Array.isArray(roster) && roster.length >= (this.matchRoom ? 0 : MIN_PERSISTENT_BOTS) && roster.length <= MAX_PERSISTENT_BOTS &&
            new Set(roster.map(bot => bot.id)).size === roster.length &&
            new Set(roster.map(bot => bot.name)).size === roster.length &&
            roster.every(bot => PERSISTENT_BOT_IDS.includes(bot.id) && typeof bot.name === 'string' &&
              bot.name.length > 0 && bot.name.length <= NAME_MAX_LENGTH)) {
          this.botRoster = roster;
          return;
        }
      } catch { /* Recover the pre-roster deployment without rerolling its round. */ }
    }
    this.botRoster = PERSISTENT_BOT_ROSTER.map(entry => ({ ...entry }));
    this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(this.botRoster));
  }

  private replaceRoundBots(): void {
    const humans = [...this.players.keys()].filter(id => !this.isManagedBot(id)).length;
    const names = [...this.players.values()].map(player => player.name);
    let roster = nextRoundBotRoster(this.botRoster, names);
    if (this.matchRoom && !humans) {
      roster = [];
      this.roundBotCount = 0;
    } else {
      this.roundBotCount = roster.length;
      if (this.matchRoom) roster = roster.slice(0, Math.max(0, MAX_PLAYERS - humans));
    }
    this.writeRoundBotCount();
    const nextIds = new Set(roster.map(bot => bot.id));
    const removed = this.botRoster.filter(bot => !nextIds.has(bot.id));
    const keptIds = this.botRoster.filter(bot => nextIds.has(bot.id)).map(bot => bot.id);
    this.serverBots?.dispose();
    this.serverBots = null;
    this.botState = undefined;
    // Stable IDs need leave/join events: respawns do not refresh client nameplates.
    this.batchScoreboards = true;
    try { for (const { id } of removed) this.removePlayerById(id, true); }
    finally { this.batchScoreboards = false; }
    this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(roster));
    this.botRoster = roster;
    for (const id of [...removed.map(bot => bot.id), ...keptIds]) {
      this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE player_id = ?', id);
    }
    for (const id of keptIds) {
      const player = this.players.get(id);
      if (!player) continue;
      clearRecord(player);
      respawnPlayer(player, spawnForWorld(this.world, Math.random, this.players.values(), id, this.chaos?.assignmentState));
      this.persistPlayer(player, true);
      this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
    }
    this.activatePersistentBots();
  }

  private recoverManagedBot(id:string):void {
    const player=this.players.get(id);
    if(!this.isManagedBot(id)||!player||player.hp<=0||this.round.phase!=='playing')return;
    this.chaos?.recoverCarrierCase(id);
    const from={x:Math.round(player.x*10)/10,y:Math.round(player.y*10)/10,z:Math.round(player.z*10)/10};
    this.city.rescue(player,this.now());
    // Rescue is not a death, heal or score reset. Use ordinary clear spawn selection.
    Object.assign(player,spawnForWorld(this.world,Math.random,this.players.values(),id,this.chaos?.assignmentState));
    this.serverBots?.reset(id,player);
    this.lastMovementBroadcast.delete(id);this.movementAllowances.set(id,createMovementAllowance(this.now()));this.persistPlayer(player,true);
    this.broadcast({type:'playerRespawn',id,x:player.x,y:player.y,z:player.z,hp:player.hp});
    log('info','stranded bot recovered',{playerId:id,from});
  }

  /** Public city board includes managed rats, with names/scores but no positions. */
  async status(): Promise<Omit<PublicRoomStatus, 'room'> & { bots: number; world: WorldSpec }> {
    const attached = this.attachedPlayerIds();
    const live = Array.from(this.players.values()).filter((player) => attached.has(player.id) || this.isManagedBot(player.id));
    return {
      world: { ...this.world },
      players: live.length,
      bots: live.filter(player => this.isManagedBot(player.id)).length,
      phase: this.round.phase,
      startedAt: this.round.startedAt ?? this.now(),
      ...(this.round.resetAt !== undefined ? { resetAt: this.round.resetAt } : {}),
      ...(this.round.winnerName ? { winnerName: this.round.winnerName } : {}),
      scores: buildScoreboard(live).map(({ name, kills, deaths }) => ({ name, kills, deaths })),
    };
  }

  private isPublicMatchRoom(): boolean {
    return this.matchPool === DEFAULT_ROOM_NAME && this.matchRoom !== null;
  }

  private activateCompanion(): void {
    if (!this.isPublicMatchRoom()) return;
    if (!this.companionActive) {
      this.companionGeneration++;
      this.companionRevision = 0;
      this.companionActive = true;
      this.ctx.storage.transactionSync(() => {
        this.writeRoomState(COMPANION_GENERATION_KEY, String(this.companionGeneration));
        this.writeRoomState(COMPANION_REVISION_KEY, '0');
        this.writeRoomState(COMPANION_ACTIVE_KEY, 'true');
      });
      this.companionSignature = '';
      this.companionLastPublishedAt = 0;
      this.companionLastProjectedAt = 0;
    }
    this.publishCompanion(true);
  }

  private publishCompanion(force = false): void {
    if (!this.companionActive || !this.isPublicMatchRoom() || !this.chaos?.assignmentState) return;
    const room = this.matchRoom!;
    const pool = this.matchPool!;
    const now = this.now();
    if (!companionProjectionDue(now, this.companionLastProjectedAt, force)) return;
    this.companionLastProjectedAt = now;
    const retainedHumanIds = new Set([...this.players.keys()].filter(id => !this.isManagedBot(id)));
    if (!retainedHumanIds.size) return;
    const humanIds = new Set([...this.attachedPlayerIds()].filter(id => retainedHumanIds.has(id)));
    const nextRevision = this.companionRevision + 1;
    const publication = projectCompanionRoom({
      room,
      pool,
      generation: this.companionGeneration,
      revision: nextRevision,
      observedAt: now,
      round: this.currentRound(),
      assignment: this.chaos.assignmentState,
      players: this.players.values(),
      humanIds,
      holderId: this.chaos.caseHolderId,
    });
    const signature = companionProjectionSignature(publication);
    const changed = signature !== this.companionSignature;
    if (!force && !changed && now - this.companionLastPublishedAt < COMPANION_REFRESH_MS) return;
    this.companionRevision = nextRevision;
    this.companionSignature = signature;
    this.companionLastPublishedAt = now;
    this.writeRoomState(COMPANION_REVISION_KEY, String(this.companionRevision));
    this.ctx.waitUntil(this.env.MATCHMAKER.getByName(pool).publishCompanion(publication));
  }

  private deactivateCompanion(): void {
    if (!this.companionActive || !this.isPublicMatchRoom()) return;
    const room = this.matchRoom!;
    const pool = this.matchPool!;
    this.companionActive = false;
    this.companionRevision++;
    this.ctx.storage.transactionSync(() => {
      this.writeRoomState(COMPANION_ACTIVE_KEY, 'false');
      this.writeRoomState(COMPANION_REVISION_KEY, String(this.companionRevision));
    });
    this.ctx.waitUntil(this.env.MATCHMAKER.getByName(pool)
      .removeCompanion(room, this.companionGeneration, this.companionRevision));
  }

  private retireFromMatchmaker(): void {
    if (!this.matchRoom || !this.matchPool) return;
    this.deactivateCompanion();
    this.ctx.waitUntil(this.env.MATCHMAKER.getByName(this.matchPool)
      .retire(this.matchRoom, this.matchPool, this.companionGeneration, this.companionRevision));
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    this.noteTransportActivity();
    this.diagnostics.event(this.now(), true);
    this.messagesIn += 1;
    if (this.failedSockets.has(ws)) return;
    const connectionId = this.getAttachment(ws).connectionId ?? 'unknown';
    // Above the sum of legitimate movement, firing, ping and ACK bursts. Runs
    // before parsing, including pre-join traffic and malformed input.
    if (!this.rateLimiter.allow(`${connectionId}:ingress`, 240, 1000, this.now())) {
      this.failSocket(ws, 'Inbound message budget exceeded', 1008); return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      this.rejectMessage(ws, connectionId, 'Invalid message');
      return;
    }

    if(message.deliveryAck){this.ackDelivery(ws,{type:'deliveryAck',...message.deliveryAck});if(this.failedSockets.has(ws))return;}
    if (message.type === 'join') {
      if (!this.rateLimiter.allow(`${connectionId}:join`, JOIN_RATE.limit, JOIN_RATE.windowMs, this.now())) {
        this.rejectMessage(ws, connectionId, 'Too many join attempts');
        return;
      }
      this.handleJoin(ws, message);
      const joined = this.getPlayerId(ws);
      if (joined) this.lastInputAt.set(joined, this.now());
      return;
    }

    if (message.type === 'ping') {
      if (!this.rateLimiter.allow(`${connectionId}:ping`, PING_RATE.limit, PING_RATE.windowMs, this.now())) return;
      this.touchActivity(this.getPlayerId(ws));
      this.send(ws, { type: 'pong', sentAt: message.sentAt, receivedAt: this.now() });
      return;
    }

    if (message.type === 'deliveryAck') {this.ackDelivery(ws,message);return;}

    const observer=this.getAttachment(ws);
    if(observer.observer){
      if(message.type==='chaosAck' && observer.observerPlayer)
        this.chaosDelivery.get(ws)?.acknowledge(message);
      // Observers can acknowledge playback, but never submit game actions.
      return;
    }
    const playerId = this.getPlayerId(ws);
    if (!playerId || !this.players.has(playerId)) {
      this.rejectMessage(ws, connectionId, 'Join before sending game messages');
      return;
    }

    if(message.type==='chaosAck'){
      if(this.rateLimiter.allow(`${playerId}:chaosAck`,120,1000,this.now()))this.chaosDelivery.get(ws)?.acknowledge(message);
      return;
    }

    if (message.type === 'diagnostics') {
      if (this.getAttachment(ws).localDiagnostics &&
          this.rateLimiter.allow(`${playerId}:diagnostics`, 1, 4_000, this.now())) {
        logClientDiagnostics(message.report);
      }
      return;
    }

    if (message.type === 'perf') {
      if (this.rateLimiter.allow(`${playerId}:perf`, PERF_RATE.limit, PERF_RATE.windowMs, this.now())) this.city.perf(playerId, message.report, this.now());
      return;
    }

    if (message.type === 'exhibit') {
      if (this.rateLimiter.allow(`${playerId}:exhibit`, EXHIBIT_RATE.limit, EXHIBIT_RATE.windowMs, this.now())) this.city.exhibit(playerId, message, this.now());
      return;
    }

    if (message.type === 'updateMovement') {
      if (!this.rateLimiter.allow(`${playerId}:move`, MOVEMENT_RATE.limit, MOVEMENT_RATE.windowMs, this.now())) return;
      this.noteMovementInput(playerId, message);
      this.handleMovement(playerId, message);
      this.touchActivity(playerId);
      return;
    }

    if(message.type==='pickupIntent'){
      this.touchActivity(playerId); this.lastInputAt.set(playerId, this.now());
      if(!this.rateLimiter.allow(`${playerId}:pickup`,20,1000,this.now())){
        const state=this.chaos?.snapshot(false),at=this.now();
        this.sendToPlayer(playerId,{type:'pickupResult',interactionId:message.interactionId,target:message.target,targetId:message.targetId,
          accepted:false,at,tick:state?.tick??0,epoch:state?.epoch??'room',playerId,reason:'rate-limited'});
        this.diagnostics.netplay('pickup','rate-limited',0);return;
      }
      this.handlePickupIntent(playerId,message);return;
    }

    if (message.type === 'admin') {
      if (this.rateLimiter.allow(`${playerId}:admin`, 6, 10_000, this.now())) await this.handleAdminMessage(ws, playerId, message);
      else this.sendToPlayer(playerId, { type: 'adminResult', ok: false, message: 'Too many admin commands; wait a moment.' });
      return;
    }

    this.touchActivity(playerId);
    // Shots and hit claims are play; a background tab sends neither.
    if (message.type === 'shoot' || message.type === 'hit') this.lastInputAt.set(playerId, this.now());

    if (message.type === 'ready') {
      if (this.rateLimiter.allow(`${playerId}:ready`, 4, 1000, this.now())) this.continueReading(playerId);
      return;
    }

    if (message.type === 'shoot') {
      if (!this.admitShot(playerId)) {
        this.diagnostics.shot('rateLimited');
        this.sendShotRejection(playerId,message.shotId,'rate-limited');
        return;
      }
      this.handleShoot(playerId, message);
      return;
    }

    if (message.type === 'hit') {
      if (!this.rateLimiter.allow(`${playerId}:hit`, HIT_RATE.limit, HIT_RATE.windowMs, this.now())) return;
      if(this.world.version!==GRAYBOX_VERSION)await this.handleHit(playerId, message);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try { ws.close(); } catch { /* Already gone. Cleanup still runs. */ }
    this.removePlayer(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    log('warn', 'websocket error', { error: error instanceof Error ? error.message : String(error) });
    this.removePlayer(ws);
  }

  async alarm(): Promise<void> {
    try {
      if(this.preparedBots&&this.now()>=this.preparedUntil){
        this.preparedBots.dispose();this.preparedBots=null;this.preparedUntil=0;
      }
      this.reconcileLiveness();
      if (this.matchRoom) {
        this.expireAdmissions(); this.rebalanceBots();
        if (!this.humanSlots() && this.matchPool) this.retireFromMatchmaker();
      }
      if (this.persistentBots && this.humanSlots()) {
        this.activatePersistentBots();
        this.nextBotHeartbeat = this.now() + BOT_HEARTBEAT_MS;
      }
      await this.processDueEvents();
    } catch (error) {
      // Success already schedules from processDueEvents. A failed alarm while
      // humans play needs a bounded future wake so six retries cannot strand
      // their match; an empty room keeps the ordinary platform retry.
      if (this.persistentBots && this.humanSlots()) {
        try { await this.scheduleNextAlarm({ ignorePastDue: true }); }
        catch (reschedule) { log('error', 'alarm reschedule failed', { error: reschedule instanceof Error ? reschedule.message : String(reschedule) }); }
      }
      throw error;
    }
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS reconnect_sessions (
        player_id TEXT PRIMARY KEY, token TEXT NOT NULL, disconnected_until INTEGER
      );
      CREATE TABLE IF NOT EXISTS room_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        player_id TEXT,
        due_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pending_events_due_at ON pending_events(due_at);
    `);
    this.cityStore.migrate();

    const columns = this.ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(players)')
      .toArray()
      .map((row) => row.name);
    if (!columns.includes('last_active_at')) {
      this.ctx.storage.sql.exec('ALTER TABLE players ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0');
    }
    if (!this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(reconnect_sessions)').toArray().some(row => row.name === 'agent')) {
      this.ctx.storage.sql.exec('ALTER TABLE reconnect_sessions ADD COLUMN agent INTEGER NOT NULL DEFAULT 0');
    }

    const currentVersion = this.ctx.storage.sql
      .exec<{ version: number }>('SELECT COALESCE(MAX(id), 0) as version FROM _sql_schema_migrations')
      .one().version;
    if (currentVersion < 1) {
      this.ctx.storage.sql.exec('INSERT INTO _sql_schema_migrations (id) VALUES (1)');
    }
  }

  private hydrate(): void {
    try {
      const saved:unknown=JSON.parse(this.readRoomState(ASSIGNMENT_ROTATION_KEY)??'null',(_key,value)=>value==='misfiled-evidence'?'excessive-force':value);
      if(saved&&typeof saved==='object'&&'remaining' in saved&&Array.isArray(saved.remaining)&&
          saved.remaining.length<=ASSIGNMENT_IDS.length&&saved.remaining.every(isAssignmentId)&&new Set(saved.remaining).size===saved.remaining.length){
        this.assignmentRotation={remaining:[...saved.remaining],
          ...('last' in saved&&isAssignmentId(saved.last)?{last:saved.last}:{}),
          ...('forced' in saved&&isAssignmentId(saved.forced)?{forced:saved.forced}:{})};
      }
    }catch{/* A missing legacy bag starts a fresh cycle; never replace a valid active assignment. */}
    this.matchRoom = this.readRoomState(MATCH_ROOM_KEY) ?? null;
    const evidenceMode = this.readRoomState(EVIDENCE_MODE_KEY);
    if (isEvidenceMode(evidenceMode)) this.evidenceMode = evidenceMode;
    const forcedIncident = this.readRoomState(FORCED_INCIDENT_KEY);
    if (isIncidentId(forcedIncident)) this.forcedIncident = forcedIncident;
    this.matchPool = this.readRoomState('match-pool-v1') ?? this.matchRoom;
    this.companionGeneration = Math.max(0, Number(this.readRoomState(COMPANION_GENERATION_KEY)) || 0);
    this.companionRevision = Math.max(0, Number(this.readRoomState(COMPANION_REVISION_KEY)) || 0);
    this.companionActive = this.readRoomState(COMPANION_ACTIVE_KEY) === 'true';
    this.refillAt = Number(this.readRoomState('bot-refill-at')) || 0;
    this.persistentBots = this.readRoomState(PERSISTENT_BOTS_KEY) === 'true';
    if (this.persistentBots) this.restoreBotRoster();
    this.roundBotCount = Math.max(0, Number(this.readRoomState(ROUND_BOT_COUNT_KEY)) || this.botRoster.length);
    const attachedIds = this.attachedPlayerIds();
    for (const row of this.ctx.storage.sql.exec<{player_id:string;token:string;disconnected_until:number|null;agent:number}>('SELECT * FROM reconnect_sessions').toArray())
      this.sessions.set(row.player_id,{token:row.token,until:row.disconnected_until,...(row.agent?{agent:true as const}:{})});

    const worldRow = this.readRoomState(WORLD_KEY);
    if (worldRow) {
      try {
        const parsed = JSON.parse(worldRow) as WorldSpec;
        if (typeof parsed.seed === 'number' && typeof parsed.version === 'number') {
          this.world = parsed;
          if (PREVIOUS_GRAYBOX_VERSIONS.includes(parsed.version)) {
            this.world = { ...parsed, version: GRAYBOX_VERSION };
            this.layoutChanged = true;
            this.persistWorld();
          }
        } else {
          this.world = createWorldSpec();
          this.persistWorld();
        }
      } catch {
        this.world = createWorldSpec();
        this.persistWorld();
      }
    } else {
      this.world = createWorldSpec();
      this.persistWorld();
    }

    const roundRow = this.readRoomState(ROUND_KEY);
    if (roundRow) {
      try {
        this.round = JSON.parse(roundRow) as RoundState;
      } catch {
        this.chaos?.reset();
        this.round = playingRound(this.now());
        this.persistRound();
      }
    } else {
      const legacy = this.readRoomState('gameInProgress');
      this.round = legacy === 'false' ? { phase: 'won' } : playingRound(this.now());
      this.persistRound();
    }
    this.ensureRoundClock();

    const now = this.now();
    const rows = this.ctx.storage.sql
      .exec<StoredPlayerRow>('SELECT id, data, updated_at, last_active_at FROM players')
      .toArray();

    for (const row of rows) {
      const lastActive = Number(row.last_active_at) || Number(row.updated_at) || 0;
      const attached = attachedIds.has(row.id);
      const session=this.sessions.get(row.id);
      if(session && !attached && session.until===null){session.until=lastActive+RECONNECT_GRACE_MS;this.persistSession(row.id,session);}
      const inactiveBot = this.persistentBots && PERSISTENT_BOT_IDS.includes(row.id) && !this.isManagedBot(row.id);
      if (inactiveBot || (!attached && !this.isManagedBot(row.id) && (session?.until != null ? session.until <= now : lastActive > 0 && now - lastActive > STALE_PLAYER_MS))) {
        this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', row.id);
        this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE player_id = ?', row.id);
        continue;
      }
      try {
        const player = JSON.parse(row.data) as PlayerData;
        this.players.set(row.id, player);
        this.lastCheckpointAt.set(row.id, Number(row.updated_at) || now);
        this.lastActiveAt.set(row.id, attached ? now : lastActive);
        // The saved pose may precede eviction. Restore only the same bounded
        // backlog a live connection can earn, never unlimited offline movement.
        this.movementAllowances.set(row.id,createMovementAllowance(now-MOVEMENT_ENVELOPE.maxElapsedMs));
        if (attached) this.reconnects += 1;
      } catch {
        this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', row.id);
      }
    }
    for (const row of this.ctx.storage.sql.exec<{ player_id: string }>("SELECT player_id FROM pending_events WHERE type = 'continue'")) this.hidden.add(row.player_id);

    this.ctx.storage.sql.exec(
      'DELETE FROM pending_events WHERE player_id IS NOT NULL AND player_id NOT IN (SELECT id FROM players)',
    );
    this.ctx.storage.sql.exec('DELETE FROM reconnect_sessions WHERE player_id NOT IN (SELECT id FROM players)');
    for(const id of this.sessions.keys())if(!this.players.has(id))this.sessions.delete(id);
  }

  private handleJoin(ws: WebSocket, message: Extract<ClientMessage, { type: 'join' }>): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this.rejectMessage(ws, this.getAttachment(ws).connectionId ?? 'unknown',
        `Protocol version ${message.protocolVersion} is unsupported. Reload to continue.`);
      return;
    }

    const attachment=this.getAttachment(ws);
    if(attachment.observer){
      if(!attachment.observerPlayer && (attachment.titleUntil??0)<=this.now()){ws.close(1008,'Joining timed out');return;}
      const player=attachment.observerPlayer??createPlayer(crypto.randomUUID(),message.name,message.appearance,
        spawnForWorld(this.world,()=>.5));
      this.setAttachment(ws,{...attachment,observerPlayer:player,titleUntil:undefined,delivery:true});
      this.send(ws,{...this.welcomeMessage(player.id,player),observing:true});
      if(this.chaos)this.sendChaos(ws,this.chaos.snapshot(false));
      this.ctx.waitUntil(this.scheduleNextAlarm());
      return;
    }
    if (this.matchRoom && !this.getPlayerId(ws) && (attachment.admissionUntil ?? attachment.titleUntil ?? 0) <= this.now()) {
      ws.close(1008, 'Joining timed out'); return;
    }
    this.reconcileLiveness();
    const existingPlayerId = this.getPlayerId(ws);
    const resumedId = existingPlayerId ?? (message.resumeToken ? [...this.sessions].find(([,session]) =>
      session.token===message.resumeToken && (session.until===null || session.until>this.now()))?.[0] : undefined);
    if(resumedId && this.players.has(resumedId)){
      const session=this.sessions.get(resumedId);
      // A resume credential is single-use. Rotate it before disconnecting the
      // previous controller so replay cannot seize the newly active transport.
      if(session){session.token=crypto.randomUUID();session.until=null;if(attachment.agent)session.agent=true;this.persistSession(resumedId,session);}
      // Replace the controller before closing the old transport. Its delayed
      // messages/close callback must never move or delete the resumed rat.
      for(const old of this.ctx.getWebSockets())if(old!==ws && this.getPlayerId(old)===resumedId){
        this.setAttachment(old,{...this.getAttachment(old),playerId:undefined});
        this.failedSockets.add(old);this.connectionDelivery.delete(old);this.chaosDelivery.delete(old);
        old.close(SESSION_REPLACED_CLOSE_CODE,'Connected on a new transport');
      }
      const player=this.players.get(resumedId)!;
      // A new page has no results board to read: a held reader resumes in the round.
      if(this.round.phase==='won')this.readers.delete(resumedId);
      else if(this.hidden.has(resumedId))this.releaseReader(player);
      this.persistPlayer(player,true);
      this.finishJoin(ws,player,false);
      this.ctx.waitUntil(this.scheduleNextAlarm());
      return;
    }
    if(message.resumeToken){
      this.send(ws,{type:'error',code:'resume-unavailable',message:'Your reconnect window expired. Joining a new game.'});
      return;
    }

    const humanCount = [...this.players.keys()].filter(id => !this.isManagedBot(id)).length;
    const reserved = (attachment.admissionUntil ?? 0) > this.now();
    if (humanCount >= MAX_PLAYERS || (!reserved && this.humanSlots() >= MAX_PLAYERS)) {
      this.send(ws, { type: 'error', message: 'This room is full' });
      return;
    }
    // Enter City pressed while the browser is still loading: wake the room now (bots, simulation, tick) so the wake
    // overlaps the load. No rat yet (nothing can shoot a player who cannot move); the welcome waits for the real join.
    if (message.hold && this.matchRoom && !existingPlayerId) {
      if (!attachment.held) {
        this.setAttachment(ws, { ...attachment, held: true, admissionUntil: this.now() + HELD_JOIN_MS, titleUntil: undefined });
        this.audience = null;
        this.rebalanceBots();
        this.startChaos();
        // The city recorder (places, aggregates) is built now too, not at the welcome.
        void this.city;
        this.ctx.waitUntil(this.scheduleNextAlarm());
      } else this.setAttachment(ws, { ...attachment, admissionUntil: Math.max(attachment.admissionUntil ?? 0, this.now() + HELD_JOIN_MS) });
      return;
    }
    if (this.players.size >= MAX_PLAYERS && this.botRoster.length) {
      const bot = this.botRoster[this.botRoster.length - 1];
      this.removePlayerById(bot.id, true); this.botRoster.pop();
      this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(this.botRoster));
    }
    if (this.players.size >= MAX_PLAYERS) {
      this.send(ws, { type: 'error', message: 'This room is full' });
      return;
    }
    const id = crypto.randomUUID();
    const player = createPlayer(id, message.name, message.appearance, spawnForWorld(this.world, Math.random, this.players.values(), undefined, this.chaos?.assignmentState));
    this.players.set(id, player);
    this.persistPlayer(player, true);
    const session={token:crypto.randomUUID(),until:null,...(attachment.agent?{agent:true as const}:{})};this.sessions.set(id,session);this.persistSession(id,session);
    this.finishJoin(ws,player,true);
  }

  private finishJoin(ws:WebSocket, player:PlayerData, fresh:boolean):void {
    const id=player.id;
    this.city.session('join',id,this.now());
    this.movementAllowances.set(id,createMovementAllowance(this.now()));
    this.joining.add(ws);this.audience=null;
    this.setAttachment(ws, { ...this.getAttachment(ws), playerId: id, admissionUntil: undefined, titleUntil:undefined, held: undefined, delivery: true });
    if (this.matchRoom) this.rebalanceBots();
    else if (this.persistentBots) this.activatePersistentBots();

    this.chaosDelivery.delete(ws);
    this.startChaos();
    const snapshot = this.welcomeMessage(id, player);
    this.send(ws, snapshot);
    if (this.getAttachment(ws).receiveMode !== 'welcome-only') {
      if(this.chaos)this.sendChaos(ws,this.chaos.snapshot(false));
    }
    // The room's listing for the matchmaker can follow the welcome.
    this.activateCompanion();
    this.joining.delete(ws);this.audience=null;
    if(fresh)this.broadcast({ type: 'playerJoined', player }, id);
    this.broadcastScoreboard();
    this.logMetrics('join');
  }

  private welcomeMessage(id: string, player: PlayerData): Extract<ServerMessage, { type: 'welcome' }> {
    this.lastSnapshotAt = this.now();
    return {
      type: 'welcome',
      ...(this.matchRoom ? { matchRoom: this.matchRoom } : {}),
      id,
      ...(this.sessions.get(id)?{resumeToken:this.sessions.get(id)!.token}:{}),
      player,
      players: this.playersRecord(),
      round: this.currentRound(),
      world: this.world,
      protocolVersion: PROTOCOL_VERSION,
      serverTime: this.lastSnapshotAt,
      movementSeq:this.lastMovementSequence.get(id)??0,
      incidents: incidentRoster(this.evidenceMode, parseIncidentList(this.env.INCIDENTS)).map(incident => incident.id),
    };
  }

  private reconcileLiveness(): void {
    const attached = this.attachedPlayerIds();
    const now = this.now();
    for (const [id] of this.players) {
      if (attached.has(id) || this.isManagedBot(id)) continue;
      const lastActive = this.lastActiveAt.get(id) ?? 0;
      const until=this.sessions.get(id)?.until;
      if (until != null ? now >= until : now - lastActive > STALE_PLAYER_MS) {
        this.removePlayerById(id);
      }
    }
  }

  private handleMovement(playerId: string, message: Extract<ClientMessage, { type: 'updateMovement' }>, at = this.now()): boolean {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0) return false;
    const previousSeq=this.lastMovementSequence.get(playerId)??0,seq=message.seq??previousSeq+1;
    if(seq<=previousSeq){this.diagnostics.netplay('movement','stale-sequence',0);return false;}
    this.lastMovementSequence.set(playerId,seq);
    const from={x:player.x,y:player.y,z:player.z};
    const bounded = clampPosition(message.position);
    let allowance=this.movementAllowances.get(playerId);
    if(!allowance){
      allowance=createMovementAllowance(this.lastActiveAt.get(playerId)??at);
      this.movementAllowances.set(playerId,allowance);
    }
    // Spend accumulated server time across the whole delayed batch. Resetting
    // the clock on each accepted packet rejects normal compressed deliveries.
    const accepted=!bounded.corrected&&consumeMovementAllowance(allowance,from,bounded.position,at,!!this.chaos?.thrown(playerId,at));
    const position=accepted?bounded.position:from,corrected=!accepted;
    player.x = position.x;
    player.y = position.y;
    player.z = position.z;
    player.qx = message.rotation.x;
    player.qy = message.rotation.y;
    player.qz = message.rotation.z;
    player.qw = message.rotation.w;
    player.meshQx = message.meshRotation.x;
    player.meshQy = message.meshRotation.y;
    player.meshQz = message.meshRotation.z;
    player.meshQw = message.meshRotation.w;
    this.chaos?.recordMovement(playerId,from,position,at,seq);
    if(message.aim){this.city.aim(playerId,message.aim,at);this.looks.set(playerId,{lookYaw:Math.atan2(message.aim.x,message.aim.z),lookPitch:Math.asin(Math.max(-1,Math.min(1,message.aim.y)))});}
    if(message.controls)this.city.controls(playerId,message.controls,at);
    this.persistPlayer(player, corrected);
    // The harbour (plan D1): a rat whose feet sink into the water dies, credited to nobody.
    // The claim is the rat's own, so trusting it can only drown the claimant.
    const claimed=bounded.position;
    if(this.world.version===GRAYBOX_VERSION&&player.hp>0&&drowned(claimed.x,claimed.y,claimed.z))
      void this.handleHit(null,{type:'hit',victimId:playerId,damage:MAX_HP},undefined,false,false,'drowned')
        .catch(error=>log('error','drowning failed',{error:String(error)}));

    const pose = {
      id: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      qx: player.qx,
      qy: player.qy,
      qz: player.qz,
      qw: player.qw,
      meshQx: player.meshQx,
      meshQy: player.meshQy,
      meshQz: player.meshQz,
      meshQw: player.meshQw,
      ...this.looks.get(playerId),
    };
    const previous = this.lastMovementBroadcast.get(playerId);
    const unchanged = previous && POSE_FIELDS.every(field => previous.pose[field] === pose[field]) && previous.pose.lookYaw === pose.lookYaw && previous.pose.lookPitch === pose.lookPitch;
    // Deliver the first repeated pose so observers see movement stop. Further
    // identical poses need only a half-second heartbeat. Authority/activity and
    // persistence above still process every input; corrections are never hidden.
    if (!corrected && unchanged && previous.stationary && at - previous.at < 500) {
      this.diagnostics.suppressedMovement();
      return true;
    }
    this.lastMovementBroadcast.set(playerId, { pose, at, stationary: !!unchanged });
    if (corrected) {
      this.diagnostics.netplay('movement','corrected',0);
      this.broadcast({ type: 'playerCorrected', player: pose, at });
      return true;
    }
    this.broadcast({ type: 'playerMoved', player: pose, at }, playerId);
    return true;
  }

  /** Every rat's trigger, human or bot: nothing while its gun is shorted out (Code Violation's Short Circuit), then the
   * shared rate ceiling (`TOMMY_SHOOT_RATE` while holding the Tommy Gun, else `SHOOT_RATE`). */
  private admitShot(id: string): boolean {
    const now = this.now(), tommy = this.chaos?.weapon(id) === 'tommy-gun', rate = shootRate(tommy ? 'tommy-gun' : undefined);
    // Own window per rate: Tommy shots never use up the plain gun's count, so the first clicks after it runs out are admitted.
    return !this.chaos?.shorted(id) && this.rateLimiter.allow(`${id}:${tommy ? 'tommy' : 'shoot'}`, rate.limit, rate.windowMs, now);
  }

  private handleShoot(playerId: string, message: Extract<ClientMessage, { type: 'shoot' }>): void {
    const player = this.players.get(playerId);
    const reject=(reason:'dead'|'roundOver'|'implausible'|'duplicate')=>{
      this.diagnostics.shot(reason);this.sendShotRejection(playerId,message.shotId,reason);
    };
    if (!player || player.hp <= 0) { reject('dead'); return; }
    if (this.round.phase !== 'playing') { reject('roundOver'); return; }
    this.startChaos();
    if(message.movement)this.handleMovement(playerId,{type:'updateMovement',...message.movement},this.now());
    if (!isPlausibleShot(message.origin, message.direction, player)) { reject('implausible'); return; }
    if (!this.rememberShot(playerId, message.shotId)) { reject('duplicate'); return; }
    const weapon=this.chaos?.weapon(playerId);
    // A held Mousetrap launches immediately, not fired: no muzzle or accuracy count.
    if(weapon==='mousetrap'){
      if(this.chaos!.placeTrap(playerId,message.direction,message.origin,message.shotId))this.applyPickupEvents();
      else this.sendShotRejection(playerId,message.shotId,'invalid-state');
      return;
    }
    this.shotAcceptedAt.set(message.shotId,performance.now());
    if(this.shotAcceptedAt.size>128)this.shotAcceptedAt.delete(this.shotAcceptedAt.keys().next().value!);
    const fired=this.chaos?.shoot(playerId,message);
    this.awards.shot(playerId, message.shotId);
    this.city.shot(player,message.direction,this.now(),weapon);
    this.diagnostics.shot('accepted');
    const event:Extract<ServerMessage,{type:'playerShot'}>={type:'playerShot',shooterId:playerId,
      shotId:message.shotId,origin:message.origin,direction:message.direction};
    // Only the firing human needs the immediate muzzle sample. Observers keep
    // the production pose/shot packet and snapshot playback; bot volleys never
    // add birth payloads or presentation tracks to every connected client.
    if(this.world.version===GRAYBOX_VERSION&&fired?.length){
      for(const ws of this.recipients())if(this.getAttachment(ws).playerId===playerId){
        this.send(ws,{...event,launch:{at:this.chaos!.time,balls:fired.map(ball=>({id:ball.id,velocity:{...ball.v}}))}});
      }
    }
    this.broadcast(event,playerId);
  }

  private sendToPlayer(playerId:string,message:ServerMessage):void {
    for(const ws of this.recipients())if(this.getAttachment(ws).playerId===playerId)this.send(ws,message);
  }
  private sendShotRejection(playerId:string,shotId:string,reason:string):void {
    const state=this.chaos?.snapshot(false),at=this.now();
    this.sendToPlayer(playerId,{type:'shotResult',shotId,ballId:shotId,outcome:'rejected',at,tick:state?.tick??0,epoch:state?.epoch??'room',fallback:reason});
    this.diagnostics.netplay('shot','rejected',0,reason);
  }
  private applyShotEvents():void {
    const events=this.chaos?.drainShotEvents()??[];
    this.city.balls(events,this.now());
    for(const event of events){
      if(event.owner&&(event.outcome==='rat-body'||event.outcome==='rat-head'))this.awards.hit(event.owner,event.shotId);
      if(event.owner)this.sendToPlayer(event.owner,{type:'shotResult',shotId:event.shotId,ballId:event.ballId,outcome:event.outcome,at:event.at,tick:event.tick,epoch:event.epoch,
        ...(event.victimId?{victimId:event.victimId}:{}),...(event.damage===undefined?{}:{damage:event.damage}),...(event.point?{point:event.point}:{}),
        ...(event.normal?{normal:event.normal}:{}),...(event.compensated?{compensated:true}:{}),...(event.fallback?{fallback:event.fallback}:{}),
        ...(event.rewindMs===undefined?{}:{rewindMs:event.rewindMs}),...(event.targetDelta===undefined?{}:{targetDelta:event.targetDelta})});
      const started=this.shotAcceptedAt.get(event.shotId);
      this.diagnostics.netplay('shot',event.outcome,started===undefined?0:performance.now()-started,event.compensated?'compensated':event.fallback,
        {rewindMs:event.rewindMs,targetDelta:event.targetDelta});
    }
  }
  private handlePickupIntent(playerId:string,message:Extract<ClientMessage,{type:'pickupIntent'}>):void {
    const started=performance.now();this.startChaos();const at=this.now();
    this.handleMovement(playerId,{type:'updateMovement',...message.movement},at);
    const result=this.chaos!.claimInteraction(playerId,message.target,message.targetId,message.generation,at),state=this.chaos!.snapshot(false);
    this.applyPickupEvents();
    this.sendToPlayer(playerId,{type:'pickupResult',interactionId:message.interactionId,target:message.target,targetId:message.targetId,
      accepted:result.accepted,at,tick:state.tick??0,epoch:state.epoch??'room',playerId,...(result.pickup?{pickup:result.pickup}:{}),
      ...(result.effectUntil===undefined?{}:{effectUntil:result.effectUntil}),...(result.faulty?{faulty:true as const}:{}),...(result.reason?{reason:result.reason}:{})});
    this.diagnostics.netplay('pickup',result.accepted?'accepted':'rejected',performance.now()-started,result.reason);
  }

  /** Pickup claims are resolved authoritatively in the simulation; the room owns
   * the durable health write and the wire event. Cosmetic claim feedback is local. */
  private applyPickupEvents(): void {
    if (!this.chaos) return;
    const events=this.chaos.drainPickupEvents();
    this.city.pickups(events,this.players,this.now());
    for (const event of events) {
      if (event.kind === 'collected' || event.kind === 'rewarded') {
        this.awards.pickup(event.playerId, event.pickup);
        if (event.pickup === 'quick-fix') this.highlights.quickFix(event.playerId, this.now());
      }
      if (event.kind !== 'healed') continue;
      const player = this.players.get(event.playerId);
      if (!player) continue;
      this.persistPlayer(player, true);
      this.broadcast({ type: 'playerHealed', id: player.id, hp: player.hp, cause: event.cause });
    }
  }

  /** `detail`: a simulation hit's step time and highlight details (`ChaosHit`). */
  private async handleHit(playerId: string | null, message: Extract<ClientMessage, { type: 'hit' }>, incoming?:ChaosHit['incoming'], explosive = false, headshot = false, environment:EnvironmentCause = 'evidence-tampering', weapon?:WeaponKind, bank?:Required<Pick<ChaosHit,'bounces'|'path'>>,
    detail?:Pick<ChaosHit,'squashAirMs'|'corpse'|'reflections'>&{at:number}): Promise<void> {
    if (this.round.phase !== 'playing') return;

    const victim = this.players.get(message.victimId);
    const shooter = playerId === null ? undefined : this.players.get(playerId);
    const hpBefore = victim?.hp ?? 0;
    const result = applyHit(this.players, playerId, message.victimId, message.damage, !!incoming, playerId && this.chaos?.isCaseHolder(playerId) ? playerId : null, !!this.chaos?.assignmentState, explosive);
    if (!result.applied || !victim) return;
    const cause = playerId === null ? {cause:environment} : {};
    // Read before the death lets go of the case and the trap.
    const moment = { carrier: this.chaos?.caseHolderId === victim.id, victimTrapped: !!this.chaos?.trapped(victim.id), victimAirborne: !!this.chaos?.airborne(victim.id),
      attackerAirborne: !!shooter && !!this.chaos?.airborne(shooter.id) };

    // Final mutations precede persistence and externally visible events.
    // Nonlethal hits do not change the shooter; lethal hits persist the victim
    // once, including the durable respawn deadline.
    const now = this.now();
    const respawnAt = result.roundWon ? now + WIN_DISPLAY_MS : now + RESPAWN_DELAY_MS;
    if (result.killed) victim.respawnAt = respawnAt;
    this.persistPlayer(victim, true);
    if (result.killed && shooter && shooter !== victim) this.persistPlayer(shooter, true);

    // A kill credits the case (Excessive Force) and heals a killer carrying it (every assignment).
    const casePoint=result.killed && playerId !== victim.id && (this.chaos?.creditCaseKill(playerId)??false);
    if(casePoint)this.checkpointGame();
    if(result.killed)this.applyPickupEvents();
    const incident=result.killed && incoming?this.chaos?.death(victim,incoming,playerId):false;
    const assignmentWon=casePoint && !!this.chaos?.assignmentState?.result;
    if (result.killed && !assignmentWon) {
      if (result.roundWon && shooter) {
        this.round = wonRound(shooter.id, shooter.name, shooter.kills, respawnAt, this.round.startedAt);
        this.persistRound();this.reconcileDeadlinesOnWin(respawnAt);
      }
      // Complete the durable transition before the first socket operation.
      this.ctx.storage.sql.exec('INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, ?, ?, ?)',
        crypto.randomUUID(),result.roundWon?'reset':'respawn',result.roundWon?null:victim.id,respawnAt);
    }
    this.awards.damage(victim.id, playerId, hpBefore - victim.hp, now);
    if (result.killed) this.awards.death(victim, shooter && shooter !== victim ? shooter : undefined, { headshot, explosive, ...(weapon ? { weapon } : {}), ...(playerId === null ? { environment } : {}) }, now);
    this.broadcast({ type: 'playerDamaged', id: victim.id, hp: victim.hp, attackerId: playerId, ...cause,...(weapon?{weapon}:{}) });
    this.city.hit({ ...(shooter ? { attacker: shooter } : {}), victim, damage: hpBefore - victim.hp, killed: result.killed, headshot, explosive, incoming: !!incoming, ...(weapon?{weapon}:{}), ...(playerId === null ? { environment } : {}), ...(bank ? { bounces: bank.bounces } : {}) }, now);
    if (this.isManagedBot(victim.id)) this.jevMind?.hit(victim.id, shooter?.id, now);
    this.highlights.hit({ at: detail?.at ?? now, ...(shooter ? { attacker: shooter } : {}), victim, killed: result.killed, headshot, ...(weapon ? { weapon } : {}),
      ...(playerId === null ? { environment } : {}), ...(bank ? { bounces: bank.bounces } : {}), ...detail, ...moment, assignment: this.chaos?.assignmentState });
    if (!result.killed) return;
    this.broadcast({type:'playerDied',victimId:victim.id,killerId:shooter?.id??null,killerName:shooter?.name??null,victimName:victim.name,
      respawnAt,...cause,...(incoming?{incoming,incident:!!incident}:{}),...(headshot?{headshot:true as const}:{}),...(explosive?{blast:true as const}:{}),...(weapon?{weapon}:{}),
      ...(shooter&&shooter!==victim&&shooter.streak?{killerStreak:shooter.streak}:{}),...(bank?{bounces:bank.bounces,path:bank.path}:{})});
    this.broadcastScoreboard();
    if(assignmentWon){this.finishAssignment();return;}
    // Each new kill streak title (3, 5, 8) earns a random supply on the spot; a round's final kill earns nothing.
    if(!result.roundWon&&shooter&&shooter!==victim&&newStreakTitle(shooter.streak??0)&&this.chaos?.rewardSupply(shooter.id,'streak'))this.applyPickupEvents();
    if(result.roundWon&&shooter){
      this.highlights.roundWon(shooter,detail?.at??now);
      this.broadcast({type:'gameWon',winnerId:shooter.id,winnerName:shooter.name,kills:shooter.kills,resetAt:respawnAt,...this.caseFile(shooter.id)});
    }
    await this.scheduleNextAlarm();
  }

  // Active rooms should not wait for alarm delivery to finish a respawn.
  // The event drain deletes/applies rows synchronously before its first await,
  // so a concurrent alarm cannot apply the same event twice.
  private gameEventDrainPending = false;
  private processLiveDeadlines(now: number): void {
    if(this.gameEventDrainPending)return;
    const due=this.round.phase==='won' ? typeof this.round.resetAt==='number' && this.round.resetAt<=now
      : [...this.players.values()].some(player=>player.hp<=0 && typeof player.respawnAt==='number' && player.respawnAt<=now);
    if(!due)return;
    this.gameEventDrainPending=true;
    void this.processDueEvents().catch(error=>log('error','live deadline failed',{error:String(error)}))
      .finally(()=>{this.gameEventDrainPending=false;});
  }

  private async processDueEvents(): Promise<void> {
    const now = this.now();
    const events = this.ctx.storage.sql
      .exec<PendingEventRow>('SELECT id, type, player_id, due_at FROM pending_events WHERE due_at <= ? ORDER BY due_at', now)
      .toArray();

    for (const event of events) {
      this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE id = ?', event.id);

      if (event.type === 'respawn' && event.player_id) {
        if (this.round.phase !== 'playing') continue;
        const player = this.players.get(event.player_id);
        if (!player) continue;

        respawnPlayer(player, spawnForWorld(this.world, Math.random, this.players.values(), player.id,this.chaos?.assignmentState,this.chaos?.allUnitsTarget));
        this.lastMovementBroadcast.delete(player.id);this.movementAllowances.set(player.id,createMovementAllowance(now));
        if (this.isManagedBot(player.id)) this.serverBots?.reset(player.id, { x: player.x, y: player.y, z: player.z });
        this.persistPlayer(player, true);
        this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
      }

      if (event.type === 'continue' && event.player_id) {
        const player = this.players.get(event.player_id);
        if (this.round.phase === 'playing' && player && this.hidden.has(player.id)) this.releaseReader(player);
      }
      if (event.type === 'reset') {
        // Only this assignment's committed result may reset it. An old match
        // deadline cannot consume held time, change mode or choose a winner.
        if(this.chaos?.assignmentState&&(this.round.phase!=='won'||this.round.resetAt!==event.due_at))continue;
        this.lastMovementBroadcast.clear();
        this.movementAllowances.clear();
        this.chaos?.reset();
        this.applyShotEvents();
        this.round = playingRound(this.now());
        this.highlights.reset();
        this.beginAssignment();

        const readers = this.readers;this.readers = new Set();
        const resetPlayers = resetRoundForWorld(
          [...this.players.values()].filter(player => !this.isManagedBot(player.id) && !readers.has(player.id)), this.world,Math.random,this.chaos?.assignmentState);
        for (const player of resetPlayers) {
          this.movementAllowances.set(player.id,createMovementAllowance(now));
          this.persistPlayer(player, true);
          // A rat held through the last round's end comes back into everyone else's city.
          if (this.hidden.delete(player.id)) this.broadcast({ type: 'playerJoined', player }, player.id);
          this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
        }
        for (const id of readers) { const player = this.players.get(id); if (player) this.holdReader(player, now); }
        if (this.persistentBots) this.replaceRoundBots();
        this.checkpointGame();
        this.broadcast({ type: 'gameReset', round: this.currentRound() });
        this.broadcastScoreboard();
        this.publishCompanion(true);
      }
    }

    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(opts?: { preserveExisting?: boolean; ignorePastDue?: boolean }): Promise<void> {
    // Compute the desired deadline after the async read so concurrent events
    // cannot make a previously computed minimum overwrite an earlier alarm.
    this.diagnostics.count('alarmRead');
    const scheduled = await this.ctx.storage.getAlarm();
    const now = this.now();
    // A past MIN(due_at) must not hide a later still-pending wake, or ignorePastDue
    // would skip every remaining event and set only the 15s heartbeat.
    const row = this.ctx.storage.sql
      .exec<{ due_at: number | null }>(opts?.ignorePastDue
        ? 'SELECT MIN(due_at) AS due_at FROM pending_events WHERE due_at > ?'
        : 'SELECT MIN(due_at) AS due_at FROM pending_events',
        ...(opts?.ignorePastDue ? [now] : []))
      .one();
    const future = (value: number) => opts?.ignorePastDue && value <= now ? Infinity : value;
    const cityWake = this.persistentBots && this.humanSlots()
      ? (opts?.ignorePastDue
        ? (this.nextBotHeartbeat > now ? this.nextBotHeartbeat : now + BOT_HEARTBEAT_MS)
        : (this.nextBotHeartbeat || now + BOT_HEARTBEAT_MS))
      : Infinity;

    const dueAt = Math.min(typeof row?.due_at === 'number' ? row.due_at : Infinity, cityWake,
      future(this.refillAt || Infinity), future(this.preparedUntil || Infinity),
      ...[...this.sessions.values()].map(session=>future(session.until??Infinity)),
      ...this.ctx.getWebSockets().map(ws => { const a = this.getAttachment(ws), deadline=a.admissionUntil??a.titleUntil; return !a.playerId && (deadline ?? 0) > now ? future(deadline!) : Infinity; }));
    if (Number.isFinite(dueAt)) {
      const alarmAt=Math.max(1,dueAt);
      // Hydrate may see an already-due stored alarm; keep it unless a
      // genuinely earlier pending event must pull the wake forward.
      if (opts?.preserveExisting && scheduled !== null && scheduled <= alarmAt) return;
      if (scheduled !== alarmAt) { this.diagnostics.count('alarmSet'); await this.ctx.storage.setAlarm(alarmAt); }
    } else if (scheduled !== null) {
      this.diagnostics.count('alarmDelete');
      await this.ctx.storage.deleteAlarm();
    }
  }

  private removePlayer(ws: WebSocket): void {
    this.audience = null;
    this.rateLimiter.clear(this.getAttachment(ws).connectionId ?? 'unknown');
    this.connectionDelivery.delete(ws);
    this.chaosDelivery.delete(ws);
    if(this.getAttachment(ws).observer){
      this.setAttachment(ws,{...this.getAttachment(ws),observerPlayer:undefined,titleUntil:undefined});
      this.ctx.waitUntil(this.scheduleNextAlarm());return;
    }
    const playerId = this.getPlayerId(ws);
    if (playerId) {
      this.city.session('leave',playerId,this.now());
      const session=this.sessions.get(playerId);
      if(session && this.players.has(playerId)){
        session.until=this.now()+RECONNECT_GRACE_MS;this.persistSession(playerId,session);
        this.persistPlayer(this.players.get(playerId)!,true);
        if(this.chaos)this.checkpointGame();
      }else this.removePlayerById(playerId);
      this.setAttachment(ws, { ...this.getAttachment(ws), playerId: undefined, admissionUntil: undefined });
      this.publishCompanion(true);
    }
    // A held seat goes with its socket: the room may sleep at once instead of at the end of the lease.
    if (this.getAttachment(ws).held) this.setAttachment(ws, { ...this.getAttachment(ws), held: undefined, admissionUntil: undefined });
    this.ctx.waitUntil(this.scheduleNextAlarm());
    if (this.matchRoom) {
      this.refillAt = this.now() + BOT_REFILL_MS;
      this.writeRoomState('bot-refill-at', String(this.refillAt));
      if (!this.humanSlots()) this.rebalanceBots();
      this.ctx.waitUntil(this.scheduleNextAlarm());
      if (this.matchPool) this.ctx.waitUntil(this.env.MATCHMAKER.getByName(this.matchPool).refresh(this.matchRoom));
    }
  }

  private persistSession(id:string, session:{token:string;until:number|null;agent?:true}):void {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO reconnect_sessions(player_id,token,disconnected_until,agent) VALUES (?,?,?,?)',id,session.token,session.until,session.agent?1:0);
  }

  private removePlayerById(playerId: string, allowManaged = false): void {
    if (this.isManagedBot(playerId) && !allowManaged) return;
    this.chaos?.removePlayer(playerId);
    if (!this.players.delete(playerId)) return;
    this.sessions.delete(playerId);
    this.ctx.storage.sql.exec('DELETE FROM reconnect_sessions WHERE player_id = ?',playerId);
    this.pendingMovement.delete(playerId);this.looks.delete(playerId);
    this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', playerId);
    this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE player_id = ?', playerId);
    this.hidden.delete(playerId);this.readers.delete(playerId);
    this.lastCheckpointAt.delete(playerId);
    this.dueCheckpoints.delete(playerId);
    this.lastActiveAt.delete(playerId);
    this.lastInputAt.delete(playerId);
    this.recentShots.delete(playerId);
    this.lastMovementBroadcast.delete(playerId);
    this.lastMovementSequence.delete(playerId);
    this.movementAllowances.delete(playerId);
    this.rateLimiter.clear(playerId);
    this.broadcast({ type: 'playerLeft', id: playerId });
    this.broadcastScoreboard();
    this.publishCompanion();
    this.logMetrics('leave');
  }

  /** Victory screen owns the next spawn: drop queued respawns and held readers' caps, and pin every corpse to resetAt. */
  private reconcileDeadlinesOnWin(resetAt: number): void {
    this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type IN ('respawn', 'continue')");
    for (const player of this.players.values()) {
      if (player.hp > 0) continue;
      player.respawnAt = resetAt;
      this.persistPlayer(player, true);
    }
  }

  /** Results (protocol 28): a reader who continues. Before the reset they start the next round with everyone; after
   * it, a held reader spawns now. Anyone else's `ready` changes nothing. */
  private continueReading(playerId: string): void {
    if (this.round.phase === 'won') { this.readers.delete(playerId); return; }
    const player = this.players.get(playerId);
    if (player && this.hidden.has(playerId)) this.releaseReader(player);
  }
  /** At the reset: a human still reading sits the new round out, dead and gone from everyone else's city, until it
   * continues or `READING_CAP_MS` passes. */
  private holdReader(player: PlayerData, now: number): void {
    clearRecord(player);
    player.hp = 0; player.respawnAt = now + READING_CAP_MS;
    this.persistPlayer(player, true);
    this.ctx.storage.sql.exec('INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, ?, ?, ?)', crypto.randomUUID(), 'continue', player.id, player.respawnAt);
    this.hidden.add(player.id);
    this.broadcast({ type: 'playerLeft', id: player.id }, player.id);
  }
  /** A held reader enters the round: spawned like any respawn and back in everyone else's city. */
  private releaseReader(player: PlayerData): void {
    const now = this.now();
    this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type = 'continue' AND player_id = ?", player.id);
    this.hidden.delete(player.id);
    respawnPlayer(player, spawnForWorld(this.world, Math.random, this.players.values(), player.id, this.chaos?.assignmentState));
    this.lastMovementBroadcast.delete(player.id); this.movementAllowances.set(player.id, createMovementAllowance(now));
    this.persistPlayer(player, true);
    this.broadcast({ type: 'playerJoined', player }, player.id);
    this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
  }

  private startChaos(preparing=false):void {
    if(this.world.version!==GRAYBOX_VERSION)return;
    if(!this.chaos){
      let saved:ChaosState|undefined;
      try{const raw=this.readRoomState('chaos-v1');if(raw)saved=JSON.parse(raw) as ChaosState;}catch{/* start a recoverable case */}
      if(this.layoutChanged){
        // A new city layout: the old checkpoint's cases, sites and rats stand in streets that moved.
        saved=undefined;this.layoutChanged=false;this.round=playingRound(this.now());this.persistRound();
        this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type='reset'");
        for(const player of this.players.values()){Object.assign(player,createSafeSpawn(this.world));this.persistPlayer(player,true);}
      }
      const previous=saved?.assignment as {id?:string;destinations?:string[]}|undefined;
      const retiredAssignment=previous?.id==='misfiled-evidence'||previous?.id==='closing-time'||(previous?.id==='chain-of-custody'&&previous.destinations?.includes('icebox-check'));
      if(retiredAssignment){this.round=playingRound(this.now());this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type='reset'");}
      this.chaos=new ChaosSimulation(this.players,hit=>{
        void this.handleHit(hit.owner,{type:'hit',victimId:hit.victim,damage:hit.damage},hit.incoming,hit.explosive===true,hit.headshot===true,hit.cause,hit.weapon,hit.bounces&&hit.path?{bounces:hit.bounces,path:hit.path}:undefined,
          {at:this.chaos?.time??this.now(),squashAirMs:hit.squashAirMs,corpse:hit.corpse,reflections:hit.reflections})
          .catch(error=>log('error','incident hit failed',{error:String(error)}));
      },saved,this.world);
      this.chaos.evidenceMode=this.evidenceMode;
      this.chaos.onlyIncidents=parseIncidentList(this.env.INCIDENTS);
      this.chaos.enforceIncidentRoster();
      this.chaos.forcedIncident=this.forcedIncident;
      if(retiredAssignment)this.checkpointGame();
    }
    if(preparing)return;
    if(this.round.phase==='playing'&&!this.chaos.assignmentState){this.beginAssignment();this.checkpointGame();}
    this.finishAssignment();
    if(this.chaosTimer)return;
    this.chaosLast=this.now();this.chaosAccumulator=0;
    this.chaosTimer=setInterval(()=>{
      this.noteTransportActivity();
      if(!this.chaos)return;
      this.reconcileLiveness();
      // A held seat (Enter pressed, still loading) plays too: the first ticks' work (bots' first routes and decisions)
      // then overlaps the browser's load instead of landing on the join.
      const retainedHuman=[...this.players.keys()].some(id=>!this.isManagedBot(id))||this.heldSeats()>0;
      if(!retainedHuman){
        if(this.matchRoom){this.rebalanceBots();return;}
        this.stopPlaying();this.checkpointGame();return;
      }
      // Workers may freeze high-resolution clocks within one event; cost=0 is
      // not proof of free CPU. These gaps are source-clock spans too, and
      // scheduled timer clamping can conceal physical execution lateness.
      const now=this.now(), tickStart=performance.now();
      this.diagnostics.event(now);
      this.processLiveDeadlines(now);
      this.updateJev(now);
      const gapMs=Math.max(0,now-this.chaosLast);
      let steps=0;
      this.chaosAccumulator+=Math.min(.2,gapMs/1000);this.chaosLast=now;
      while(this.chaosAccumulator>=1/60){
        this.chaosAccumulator-=1/60;steps++;
        const stepAt = now-this.chaosAccumulator*1000;
        this.serverBots?.step(1/60, stepAt, this.players, this.botState, this.round.phase==='playing');
        this.chaos.step(1/60,stepAt,this.round.phase==='playing');
        this.city.clues(this.chaos.drainClueEvents(),stepAt);
        this.applyPickupEvents();
        this.applyShotEvents();
        const incidents=this.chaos.drainIncidentEvents();
        this.city.incidents(incidents,this.players,this.now());
        for(const e of incidents){const rat=e.what==='faulty'&&e.playerId?this.players.get(e.playerId):undefined;if(rat)this.highlights.backfire(rat,e.shoved>0,this.chaos.time);}
        this.finishAssignment();
      }
      this.diagnostics.work({...this.serverBots?.takeWork(),...this.chaos.takeWork()});
      this.flushMovement('tick');
      const state=this.chaos.snapshot();
      if (this.serverBots) this.botState = state;
      this.city.tick(now,this.players,state,this.round);
      this.highlights.tick(now,this.players,this.chaos.caseHolderId,this.chaos.assignmentState);
      if(this.round.phase==='playing')this.awards.sample(this.players.values(),Math.min(.2,gapMs/1000),state.case.owner,state.assignment?.deliverySerial??0,state.pressure?.launches,state.dispatch,state.assignment);
      const signature=state.case.owner+':'+state.case.returningUntil+':'+state.dispatch.serial+':'+state.dispatch.phase+':'+state.assignment?.revision;
      // Every write holds this object's outgoing frames until it is durable (the output gate), and the room's clients
      // sit far from it, so a held frame arrives in a bunch (Tyler, 9 October: "old crappy shooter game lag"). Ownership,
      // Dispatch and assignment changes are checkpointed at once and routine state every `ROUTINE_CHECKPOINT_MS`, both
      // after this tick's frames are sent: a crash in between costs at most the last moments, never a client's frame.
      const critical=signature!==this.chaosSignature;
      const routine=!critical&&now-this.chaosSavedAt>=ROUTINE_CHECKPOINT_MS;
      this.publishCompanion();
      // Legacy recipients share one serialization. Compact recipients use their
      // own delivered baseline and bounded acknowledgement window.
      let recipients=0,maxBytes=0,sentBytes=0;
      let legacyPayload:{payload:string;bytes:number}|undefined;
      let prepared:PreparedChaos|undefined;
      for(const ws of this.recipients()){
        const a=this.getAttachment(ws);
        if(ws.readyState!==WebSocket.OPEN||(!a.playerId&&!a.observerPlayer)||a.receiveMode==='welcome-only')continue;

        if(a.compactChaos)prepared??=prepareChaos(state);
        else if(!legacyPayload){const payload=serializeServerMessage({type:'chaos',state});legacyPayload={payload,bytes:wireBytes(payload)};}
        this.diagnostics.count('snapshotOffer');
        const bytes=this.sendChaos(ws,state,legacyPayload,prepared);
        if(bytes)this.diagnostics.count('snapshotAccepted');
        if(bytes){recipients++;sentBytes+=bytes;maxBytes=Math.max(maxBytes,bytes);}
      }
      if(critical||routine){this.checkpointGame(state);this.chaosSavedAt=now;this.chaosSignature=signature;this.observeCheckpointSettlement();}
      const metrics=this.diagnostics.tick(now,{gapMs,costMs:performance.now()-tickStart,steps,balls:state.shots.length,
        snapshotBytes:recipients?sentBytes/recipients:0,maxSnapshotBytes:maxBytes,sentBytes,recipients});
      if(metrics)log('info','room diagnostics',{roomId:this.ctx.id.toString(),colo:this.where,players:this.players.size,
        connections:this.ctx.getWebSockets().length,roundPhase:this.round.phase,incident:state.dispatch.incident??null,...metrics,
        ...(this.cityStore.scans.length?{cityScans:this.cityStore.scans.splice(0)}:{})});
    },1000/30);
  }

  /** Latency diagnosis (staging only, `DIAG_NO_WRITES=1`): no player or room writes while the room plays, to measure
   * what the output gate (outgoing frames held until each write is durable) costs delivery. Never set on production. */
  private get diagNoWrites(): boolean { return (this.env as Env & { DIAG_NO_WRITES?: string }).DIAG_NO_WRITES === '1' && !!this.chaosTimer; }

  private persistPlayer(player: PlayerData, force: boolean): void {
    const now = this.now();
    this.lastActiveAt.set(player.id, now);
    const previous = this.lastCheckpointAt.get(player.id) ?? 0;
    if (!force && now - previous < CHECKPOINT_MS) return;
    // Every storage write holds this object's outgoing frames until it settles
    // (output gate). Per-rat checkpoint phases gated ~13% of snapshot ticks by
    // ~50 ms; routine poses now share the running room's 1 Hz chaos checkpoint.
    // While the room plays every rat's write waits for the next checkpoint, forced ones included (a hit, a kill, a
    // respawn deadline): one write a checkpoint instead of one a hit, each holding every client's frames.
    if (this.chaosTimer) { this.dueCheckpoints.add(player.id); return; }
    this.writePlayer(player, now, now);
  }

  private writePlayer(player: PlayerData, now: number, activeAt: number): void {
    if (this.diagNoWrites) return;
    this.ctx.storage.sql.exec(
      `INSERT INTO players (id, data, updated_at, last_active_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         updated_at = excluded.updated_at,
         last_active_at = excluded.last_active_at`,
      player.id,
      JSON.stringify(player),
      now,
      activeAt,
    );
    this.diagnostics.count('playerWrite');
    this.lastCheckpointAt.set(player.id, now);
    this.dueCheckpoints.delete(player.id);
  }

  private observeCheckpointSettlement(): void {
    if (this.checkpointProbePending) return;
    this.checkpointProbePending = true;
    const started = this.now();
    // Observe the writes already issued above. No extra write, awaited game
    // event, or unconfirmed output: existing persistence guarantees stay intact.
    void this.ctx.storage.sync().then(() => {
      this.diagnostics.checkpointSettled(Math.max(0, this.now() - started));
      this.checkpointProbePending = false;
    }, () => {
      this.diagnostics.checkpointSettled(Math.max(0, this.now() - started), true);
      this.checkpointProbePending = false;
    });
  }

  /** A movement update is play when the rat moved or turned; an idle or background tab resends the same pose. */
  private noteMovementInput(playerId: string, message: Extract<ClientMessage, { type: 'updateMovement' }>): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const { position: p, rotation: r } = message;
    const turned = Math.abs(player.qx - r.x) + Math.abs(player.qy - r.y) + Math.abs(player.qz - r.z) + Math.abs(player.qw - r.w) > 1e-3;
    if (turned || Math.hypot(player.x - p.x, player.y - p.y, player.z - p.z) > .05) this.lastInputAt.set(playerId, this.now());
  }

  private touchActivity(playerId: string | undefined): void {
    if (!playerId) return;
    const player = this.players.get(playerId);
    // A liveness checkpoint must include the current pose. Advancing the position
    // checkpoint clock after only writing activity can indefinitely starve poses.
    if (player) this.persistPlayer(player, false);
  }

  private persistWorld(): void {
    this.writeRoomState(WORLD_KEY, JSON.stringify(this.world));
  }

  private persistRound(): void {
    this.writeRoomState(ROUND_KEY, JSON.stringify(this.currentRound()));
  }

  private currentRound():RoundState {
    const assignment=this.chaos?.assignmentState;
    return {...this.round,...(assignment?{assignment:structuredClone(assignment)}:{})};
  }
  private beginAssignment():void {
    this.awards.reset();
    if(!this.chaos)return;
    const id=nextAssignment(this.assignmentRotation);
    this.chaos.setAssignment(createAssignment(id,this.now()));
    this.botState=this.chaos.snapshot(false);
  }
  /** Case, progress, bag, result and due routine poses are one synchronous SQLite checkpoint. */
  private checkpointGame(state=this.chaos?.snapshot(false)):void {
    this.ctx.storage.transactionSync(()=>{
      this.persistRound();
      if(state)this.writeRoomState('chaos-v1',JSON.stringify(state));
      this.writeRoomState(ASSIGNMENT_ROTATION_KEY,JSON.stringify(this.assignmentRotation));
      const now=this.now();
      for(const id of [...this.dueCheckpoints]){
        const player=this.players.get(id);
        if(player)this.writePlayer(player,now,this.lastActiveAt.get(id)??now);else this.dueCheckpoints.delete(id);
      }
    });
  }
  /** Trusted Worker RPC for the authenticated `/api/admin/v1/*` endpoint (index.ts). */
  async admin(command: AdminCommand): Promise<AdminResult> { return this.runAdmin(command, 'http'); }
  /** An `admin` message: the socket proves `ADMIN_TOKEN` once, then sends commands without it. */
  private async handleAdminMessage(ws: WebSocket, playerId: string, message: Extract<ClientMessage, { type: 'admin' }>): Promise<void> {
    if (!this.getAttachment(ws).admin) {
      if (!message.token || !await verifyBearerToken(`Bearer ${message.token}`, (this.env as Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN)) {
        log('warn', 'admin socket refused', { playerId });
        this.send(ws, { type: 'adminResult', ok: false, message: 'Admin key refused.' });
        return;
      }
      this.setAttachment(ws, { ...this.getAttachment(ws), admin: true });
    }
    this.send(ws, { type: 'adminResult', ...this.runAdmin(message.command, 'game', playerId) });
  }
  /** Tyler's admin controls (docs/live-service.md). No rat gains anything: an ended round goes to the current leader
   * through the ordinary round end, a rolled incident has no caller, and a reset case returns by the ordinary recovery. */
  private runAdmin(command: AdminCommand, via: AdminVia, by?: string): AdminResult {
    const chaos = this.chaos, now = this.now(), round = chaos?.assignmentState?.roundId;
    if (command.command === 'status') return { ok: true, message: 'Status.', status: this.adminStatus() };
    let ok = false, message = 'The city is not running.', winner: string | undefined, roll: IncidentId | undefined;
    if (command.command === 'next-mode') {
      const rotation = this.assignmentRotation;
      ok = !rotation.forced;
      if (ok) rotation.remaining = [command.mode, ...rotation.remaining.filter(id => id !== command.mode)];
      message = ok ? `Next round: ${ASSIGNMENTS[command.mode].title}.` : 'This room is pinned to one mode.';
    } else if (chaos) switch (command.command) {
      case 'end-round': {
        const result = this.round.phase === 'playing' ? chaos.concede(now) : undefined;
        ok = !!result; winner = result?.winnerId;
        message = result ? `Round ended: ${result.winnerName} wins.` : 'No round in play to end.';
        if (result) this.finishAssignment();
        break;
      }
      case 'incident':
        roll = chaos.rollIncident(command.incident);
        ok = !!roll; message = roll ? `Rolling ${incidentInfo(roll).title}.` : 'That incident is not in this room.';
        break;
      case 'end-incident':
        ok = chaos.endIncident(); message = ok ? 'Incident ended.' : 'No incident under way.';
        break;
      case 'reset-case':
        ok = chaos.resetCase(); message = ok ? 'Case returning to a fresh spot.' : 'The case is already returning.';
        break;
      case 'give':
        ok = !!by && !!chaos.rewardSupply(by, 'admin', command.kind);
        message = ok ? `Handed you ${PICKUP_COPY[command.kind].title}.` : by ? 'Your rat must be alive to take it.' : 'Give works from the game.';
        if (ok) this.applyPickupEvents();
        break;
    }
    this.city.admin({ command: command.command, via, ok, ...(command.command === 'next-mode' ? { next: command.mode } : {}), ...(roll ? { roll } : {}) }, now, round, by, winner);
    log('info', 'admin command', { command: command.command, via, ok });
    if (ok && command.command !== 'end-round') this.checkpointGame();
    return { ok, message, status: this.adminStatus() };
  }
  private adminStatus(): AdminStatus {
    const d = this.chaos?.snapshot(false).dispatch, assignment = this.chaos?.assignmentState, leader = this.chaos?.leaderId;
    const bots = [...this.players.keys()].filter(id => this.isManagedBot(id)).length, now = this.now();
    const next = this.assignmentRotation.forced ?? this.assignmentRotation.remaining[0];
    return {
      room: this.matchRoom ?? this.ctx.id.name ?? 'room', phase: this.round.phase,
      ...(assignment ? { mode: assignment.id } : {}), ...(next ? { nextMode: next } : {}),
      ...(leader ? { leader: this.players.get(leader)?.name ?? leader } : {}),
      incident: { phase: d?.phase ?? 'ready', ...(d?.incident ? { id: incidentInfo(d.incident).id } : {}), ...(d && d.phase !== 'ready' ? { leftMs: Math.max(0, d.until - now) } : {}) },
      incidents: incidentRoster(this.evidenceMode, parseIncidentList(this.env.INCIDENTS)).map(incident => incident.id),
      humans: this.players.size - bots, bots,
    };
  }
  private finishAssignment():void {
    const assignment=this.chaos?.assignmentState,result=assignment?.result;
    if(!assignment||!result||this.round.phase!=='playing')return;
    const resetAt=this.now()+WIN_DISPLAY_MS;
    const kills=this.players.get(result.winnerId)?.kills??0;
    this.round=wonRound(result.winnerId,result.winnerName,kills,resetAt,this.round.startedAt);
    this.ctx.storage.transactionSync(()=>{
      this.reconcileDeadlinesOnWin(resetAt);
      this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type = 'reset'");
      this.ctx.storage.sql.exec('INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, ?, ?, ?)',crypto.randomUUID(),'reset',null,resetAt);
      this.checkpointGame();
    });
    const winner=this.players.get(result.winnerId);
    if(winner)this.highlights.roundWon(winner,result.at);
    this.broadcast({type:'gameWon',winnerId:result.winnerId,winnerName:result.winnerName,kills,resetAt,assignment:structuredClone(assignment),...this.caseFile(result.winnerId,assignment)});
    this.publishCompanion(true);
    this.ctx.waitUntil(this.scheduleNextAlarm());
  }

  /** The round-end frame's Case File (omitted when nothing qualifies), lineup and round report. The humans it reaches
   * become this round's readers (`holdReader`). */
  private caseFile(winnerId:string,assignment?:AssignmentState):{awards?:Award[];lineup:string[];report:RoundReport} {
    const awards=this.awards.awards(this.players),now=this.now();
    this.readers=new Set(this.recipients().map(ws=>this.getAttachment(ws).playerId).filter((id):id is string=>!!id&&this.players.has(id)&&!this.isManagedBot(id)));
    return {...(awards.length?{awards}:{}),lineup:this.awards.lineup(this.players,winnerId,assignment),
      report:this.awards.report(this.players,(now-(this.round.startedAt??now))/1000,assignment)};
  }
  private ensureRoundClock(): void {
    if (this.round.phase === 'playing' && !this.round.startedAt) {
      this.round = { ...this.round, startedAt: this.now() };
      this.persistRound();
    }
  }

  private get city(): CityRecorder {
    this.cityRecorder ??= new CityRecorder({
      room: this.matchRoom ?? this.ctx.id.name ?? 'room',
      build: buildName(this.env.BUILD),
      store: this.cityStore,
      archive: new CityArchive(this.matchRoom ?? this.ctx.id.name ?? 'room', this.env.CITY_ARCHIVE, promise => this.ctx.waitUntil(promise)),
      layout: () => this.world.version,
      isBot: id => this.isManagedBot(id),
      isAgent: id => this.sessions.get(id)?.agent === true,
      connected: id => this.sessions.get(id)?.until == null,
      sight: (from, to) => this.lineOfSight(from, to),
      solids: sharedGrayboxBoxes({ seed: this.world.seed, version: GRAYBOX_VERSION }).filter(b => !b.rx && !b.ry && !b.rz && !b.passBalls && b.w >= .5 && b.h >= .5 && b.d >= .5),
    });
    return this.cityRecorder;
  }

  /** Line of sight through the chaos world's solid bodies; the index is refreshed at most once a second. */
  private lineOfSight(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean {
    const world = this.chaos?.world;
    if (!world) return true;
    if (this.sightQuery?.world !== world) { this.sightQuery?.query.dispose(); this.sightQuery = { world, query: new SpatialRayQuery(world), refreshedAt: 0 }; }
    const sight = this.sightQuery, now = this.now();
    if (now - sight.refreshedAt >= 1000) { sight.query.refresh(); sight.refreshedAt = now; }
    return !sight.query.blocked(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z), 1);
  }

  /** The city map's aggregates over UTC days `from`–`to`, unflushed counts included (docs/city-map.md). */
  async cityHeat(range: Range, filter: Filter = {}, now = this.now()) {
    if (!this.diagNoWrites) this.cityRecorder?.flush(now);
    return { ...range, ...this.cityStore.days(range), cell: HEAT_CELL, layers: this.cityStore.cells(range, filter) };
  }
  async cityPlaces(range: Range, filter: Filter = {}, now = this.now()) {
    if (!this.diagNoWrites) this.cityRecorder?.flush(now);
    return { ...range, ...this.cityStore.days(range), modes: this.cityStore.modes(range, filter), builds: this.cityStore.builds(range), places: this.cityStore.places(range, filter), minds: this.cityStore.minds(range, filter) };
  }
  async cityFlows(range: Range, filter: Filter = {}, now = this.now()) {
    if (!this.diagNoWrites) this.cityRecorder?.flush(now);
    return { ...range, ...this.cityStore.days(range), flows: this.cityStore.flows(range, filter) };
  }

  /** Discrete city facts from the last 30 days. */
  async cityEvents(filter: { type?: string; round?: string; since?: number; limit: number }, now = this.now()): Promise<unknown[]> {
    if (!this.diagNoWrites) this.cityRecorder?.flush(now);
    return this.cityStore.events(filter).map(row => JSON.parse(row.data) as unknown);
  }
  /** The rollback step (docs/live-service.md, "Rolling back past packed aggregates"): with `CITY_AGGREGATES=rows`, moves
   * a batch of packed aggregates into the per-key tables a release from before packing reads. */
  async cityUnpack(maxBytes: number, now = this.now()): Promise<{ ok: true; mode: 'rows' } & UnpackResult | { ok: false; mode: AggregateMode; message: string }> {
    if (this.cityStore.mode !== 'rows') return { ok: false, mode: this.cityStore.mode, message: 'Deploy with CITY_AGGREGATES=rows first: packs keep arriving otherwise.' };
    if (!this.diagNoWrites) this.cityRecorder?.flush(now);
    return { ok: true, mode: 'rows', ...this.cityStore.unpackBatch(maxBytes) };
  }

  /** The public room's move (Tyler, 9 October: the old room ran in Seattle, far from its players): the old room hands
   * out its history a chunk at a time (`CityStore.exportChunk`). Reading wakes it but starts nothing. */
  async cityExport(step: number, after: unknown[] | null, limit: number): Promise<CopyChunk> {
    return this.cityStore.exportChunk(step, after, limit);
  }
  /** Copies `from`'s city history into this room for about `budgetMs`, one chunk per transaction with the place it
   * reached (`city-copy-v1`), so it resumes where it stopped and never copies a chunk twice; call until `done`. */
  async cityCopy(from: string, budgetMs: number): Promise<{ done: boolean; step: string | null; copied: number }> {
    type Progress = { step: number; after: unknown[] | null; copied: number };
    const saved = this.readRoomState(CITY_COPY_KEY);
    let progress: Progress = saved ? JSON.parse(saved) as Progress : { step: 0, after: null, copied: 0 };
    const report = () => ({ done: progress.step >= COPY_STEPS.length, step: COPY_STEPS[progress.step]?.table ?? null, copied: progress.copied });
    if (this.copying || from === this.matchRoom) return report();
    this.copying = true;
    try {
      const source = this.env.GAME_ROOM.getByName(from), end = Date.now() + budgetMs;
      while (progress.step < COPY_STEPS.length && Date.now() < end) {
        const step = COPY_STEPS[progress.step]!, chunk = await source.cityExport(progress.step, progress.after, step.kind === 'packs' ? 4 : 2_000) as unknown as CopyChunk;
        const next: Progress = chunk.after ? { step: progress.step, after: chunk.after, copied: progress.copied + chunk.rows.length }
          : { step: progress.step + 1, after: null, copied: progress.copied + chunk.rows.length };
        this.ctx.storage.transactionSync(() => {
          this.cityStore.importChunk(progress.step, chunk.rows);
          this.writeRoomState(CITY_COPY_KEY, JSON.stringify(next));
        });
        progress = next;
      }
    } finally { this.copying = false; }
    return report();
  }

  private readRoomState(key: string): string | undefined {
    return this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM room_state WHERE key = ?', key)
      .toArray()[0]?.value;
  }

  private writeRoomState(key: string, value: string): void {
    if (this.diagNoWrites) return;
    this.diagnostics.count('roomWrite');
    // A value equal to the stored one updates nothing, so SQLite writes (and Cloudflare bills) no row for it: the
    // routine checkpoint rewrites the assignment rotation and often the round unchanged every second.
    this.ctx.storage.sql.exec(
      `INSERT INTO room_state (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE room_state.value IS NOT excluded.value`,
      key,
      value,
    );
  }

  private broadcastScoreboard(): void {
    if (this.batchScoreboards) return;
    this.broadcast({ type: 'scoreboardUpdate', scores: buildScoreboard(this.players.values()) });
  }

  private playersRecord(): Record<string, PlayerData> {
    const players: Record<string, PlayerData> = {};
    for (const [id, player] of this.players) {
      if (!this.hidden.has(id)) players[id] = player;
    }
    return players;
  }

  private recipients(): WebSocket[] {
    return this.audience ??= this.ctx.getWebSockets().filter(ws => {
      const a = this.getAttachment(ws);
      return (a.playerId || a.observerPlayer) && a.receiveMode !== 'welcome-only' && !this.failedSockets.has(ws) && !this.joining.has(ws);
    });
  }

  private deliveryFor(ws: WebSocket): ConnectionDelivery {
    let delivery = this.connectionDelivery.get(ws);
    if (!delivery) {
      delivery = new ConnectionDelivery((payload, bytes) => {
        ws.send(payload);
        this.diagnostics.sent(payload, bytes);
      });
      this.connectionDelivery.set(ws, delivery);
      const attachment=this.getAttachment(ws),player=attachment.observerPlayer??(attachment.playerId?this.players.get(attachment.playerId):undefined);
      const resumed=attachment.delivered;
      this.setAttachment(ws,{...attachment,delivered:true});
      if(resumed&&player)delivery.offer(serializeServerMessage({...this.welcomeMessage(player.id,player),...(attachment.observer?{observing:true}: {})}),Date.now());
    }
    return delivery;
  }

  private ackDelivery(ws:WebSocket,ack:import('../shared/deliveryWire').DeliveryAck):void {
    try {const snapshot=this.connectionDelivery.get(ws)?.acknowledge(ack,Date.now());if(snapshot)this.chaosDelivery.get(ws)?.acknowledge(snapshot);}
    catch(error){this.failSocket(ws,String(error));}
  }

  private failSocket(ws: WebSocket, reason: string, code = 1013): void {
    if (this.failedSockets.has(ws)) return;
    this.failedSockets.add(ws); this.audience = null;
    this.diagnostics.closed(code);
    log('warn', 'connection reset', { reason, code });
    const category=reason.includes('acknowledgement timed out')?'delivery-timeout':reason.includes('backlog exceeded')?'delivery-backlog':'Connection needs reconnect';
    try { ws.close(code, category); } catch { /* Transport already gone. */ }
    // Never recursively change the roster in the middle of a broadcast/death.
    this.ctx.waitUntil(Promise.resolve().then(() => this.removePlayer(ws)));
  }

  private rejectMessage(ws: WebSocket, id: string, message: string): void {
    if (!this.rateLimiter.allow(`${id}:invalid`, 8, 10_000, this.now())) {
      this.failSocket(ws, 'Repeated invalid messages', 1008); return;
    }
    if (this.rateLimiter.allow(`${id}:invalidReply`, 1, 1000, this.now())) this.send(ws, { type: 'error', message });
  }

  private sendChaos(ws:WebSocket,state:ChaosState,legacyPayload?:{payload:string;bytes:number},prepared?:PreparedChaos):number {
    if(ws.readyState!==WebSocket.OPEN || this.failedSockets.has(ws))return 0;
    try{
      const transport = this.deliveryFor(ws);
      transport.check(Date.now());
      let delivery=this.chaosDelivery.get(ws);
      if(!delivery){delivery=new ChaosDelivery(!!this.getAttachment(ws).compactChaosDelta, !this.getAttachment(ws).compactChaos);this.chaosDelivery.set(ws,delivery);}
      const payload=delivery.offer(state,Date.now(),prepared,transport.ready,legacyPayload);
      this.diagnostics.delivery(transport.stats);
      if(!payload)return 0;
      transport.offer(payload, Date.now(), undefined, delivery.lastFrame!.ack, delivery.lastFrame!.bytes);
      return delivery.lastFrame!.bytes;
    }catch(error){
      this.failSocket(ws, error instanceof Error ? error.message : String(error)); return 0;
    }
  }

  private safeSend(ws: WebSocket, payload: string, replaceKey?: string, knownBytes?:number): boolean {
    if (ws.readyState !== WebSocket.OPEN || this.failedSockets.has(ws)) return false;
    try {
      if (this.getAttachment(ws).delivery) this.deliveryFor(ws).offer(payload, Date.now(), replaceKey, undefined, knownBytes);
      else {
        const bytes = wireBytes(payload);
        if (bytes > MAX_SERVER_MESSAGE_BYTES) throw new Error('Control message budget exceeded');
        ws.send(payload); this.diagnostics.sent(payload, bytes);
      }
      return true;
    } catch (error) { this.failSocket(ws, error instanceof Error ? error.message : String(error)); return false; }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try { this.safeSend(ws, serializeServerMessage(message)); }
    catch (error) { this.failSocket(ws, String(error)); }
  }

  private broadcast(message: ServerMessage, exceptPlayerId?: string): void {
    const audience = this.recipients();
    if (!audience.length) return;
    if(message.type==='playerMoved'&&this.chaosTimer&&this.world.version===GRAYBOX_VERSION){
      if(audience.some(ws=>this.getAttachment(ws).batchMovement)){
        if(this.pendingMovement.has(message.player.id))this.diagnostics.count('movementOverwrite');
        this.pendingMovement.set(message.player.id,{player:message.player,at:message.at??this.now()});
      }
      if(audience.some(ws=>!this.getAttachment(ws).batchMovement))this.broadcastSerialized(serializeServerMessage(message),exceptPlayerId,'individual',undefined,'move:'+message.player.id);
      return;
    }
    if(message.type==='playerShot' && this.pendingMovement.has(message.shooterId)){
      const sample=this.pendingMovement.get(message.shooterId)!;this.pendingMovement.delete(message.shooterId);
      const plain=serializeServerMessage(message),batch=serializeServerMessage({type:'playersMoved',players:[sample]});
      const combined=JSON.stringify({...message,move:movementRow(sample)});
      const plainBytes=wireBytes(plain),combinedBytes=wireBytes(combined),batchBytes=wireBytes(batch);
      this.diagnostics.movementBatch('event',1);this.broadcasts++;
      for(const ws of audience){
        const a=this.getAttachment(ws);
        if(a.batchMovement&&!a.tupleMovement)this.safeSend(ws,batch,'movementBatch',batchBytes);
        if(a.playerId===exceptPlayerId)continue;
        this.safeSend(ws,a.tupleMovement?combined:plain,undefined,a.tupleMovement?combinedBytes:plainBytes);
      }
      return;
    }
    // A shot needs its shooter's pose first. Lifecycle/correction broadcasts
    // remain full barriers; unrelated poses can stay in the regular tick batch.
    this.flushMovement('event', message.type === 'playerShot' ? message.shooterId : undefined);
    this.broadcastSerialized(serializeServerMessage(message), exceptPlayerId);
  }

  private flushMovement(reason:'tick'|'event'='event', playerId?: string):void {
    const players = playerId ? (this.pendingMovement.has(playerId) ? [this.pendingMovement.get(playerId)!] : []) : [...this.pendingMovement.values()];
    if (!players.length) return;
    for (const sample of players) this.pendingMovement.delete(sample.player.id);
    this.diagnostics.movementBatch(reason,players.length);
    const message: Extract<ServerMessage,{type:'playersMoved'}> = {type:'playersMoved',players};
    this.broadcastSerialized(serializeServerMessage(message),undefined,'batch',serializeMovement(message),'movementBatch');
  }

  private broadcastSerialized(payload: string, exceptPlayerId?: string, movementMode?:'individual'|'batch', tuple?: string, replaceKey?: string): number {
    let recipients = 0;
    this.broadcasts += 1;
    const bytes=wireBytes(payload),tupleBytes=tuple?wireBytes(tuple):undefined;
    for (const ws of this.recipients()) {
      const attachment = this.getAttachment(ws);
      if(movementMode==='batch'&&!attachment.batchMovement||movementMode==='individual'&&attachment.batchMovement)continue;
      if (exceptPlayerId && attachment.playerId === exceptPlayerId) continue;
      const useTuple=attachment.tupleMovement&&tuple;
      if (this.safeSend(ws, useTuple ? tuple : payload, replaceKey, useTuple?tupleBytes:bytes)) recipients++;
    }
    return recipients;
  }

  private rememberShot(playerId: string, shotId: string): boolean {
    const recent = this.recentShots.get(playerId) ?? [];
    if (recent.includes(shotId)) return false;
    recent.push(shotId);
    if (recent.length > RECENT_SHOT_LIMIT) recent.splice(0, recent.length - RECENT_SHOT_LIMIT);
    this.recentShots.set(playerId, recent);
    return true;
  }

  private attachedPlayerIds(): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.getAttachment(ws).playerId;
      if (playerId) ids.add(playerId);
    }
    return ids;
  }

  private logMetrics(reason: string): void {
    const pending = this.ctx.storage.sql
      .exec<{ count: number }>('SELECT COUNT(*) as count FROM pending_events')
      .one().count;
    log('info', 'room metrics', {
      reason,
      connections: this.ctx.getWebSockets().length,
      players: this.players.size,
      pendingEvents: pending,
      messagesIn: this.messagesIn,
      broadcasts: this.broadcasts,
      lastSnapshotAt: this.lastSnapshotAt,
      reconnects: this.reconnects,
      roundPhase: this.round.phase,
    });
  }

  private getAttachment(ws: WebSocket): SocketAttachment {
    let attachment = this.socketAttachments.get(ws);
    if (!attachment) {
      attachment = (ws.deserializeAttachment() as SocketAttachment | undefined) ?? {};
      this.socketAttachments.set(ws, attachment);
    }
    return attachment;
  }

  private setAttachment(ws: WebSocket, attachment: SocketAttachment): void {
    ws.serializeAttachment(attachment);
    this.socketAttachments.set(ws, attachment);
    this.audience = null;
  }

  private getPlayerId(ws: WebSocket): string | undefined {
    return this.getAttachment(ws).playerId;
  }

  private now(): number {
    return this.clock();
  }
}
