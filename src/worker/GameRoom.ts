import { RECONNECT_GRACE_MS, SESSION_REPLACED_CLOSE_CODE } from '../shared/reconnect';
import { ChaosDelivery } from './ChaosDelivery';
import { ConnectionDelivery } from './ConnectionDelivery';
import { wireBytes } from '../shared/deliveryWire';
import { serializeMovement } from '../shared/movementWire';
import { CHAOS_WIRE_MODE, prepareChaos, type PreparedChaos } from '../shared/chaosWire';
import { ObjectCollisionMatrix, type ArrayCollisionMatrix } from 'cannon-es';
import { ChaosSimulation, type ChaosHit } from '../shared/ChaosSimulation';
import { serializeServerMessage } from './serializeServerMessage';
import type { ChaosState } from '../shared/chaosState';
import { GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { createAssignment, isAssignmentId, nextAssignment, type AssignmentId, type AssignmentRotation } from '../shared/assignments';
import { incidentRoster, isEvidenceMode, isIncidentId, type EvidenceMode, type IncidentId } from '../shared/incidentCatalog';
import { DurableObject } from 'cloudflare:workers';
import {
  MAX_CONNECTIONS,
  MAX_SERVER_MESSAGE_BYTES,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_MS,
  WIN_DISPLAY_MS,
  type ClientMessage,
  type PlayerData,
  type PublicRoomStatus,
  type RoundState,
  type ServerMessage,
} from '../shared/networkProtocol';
import { createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import {
  applyHit,
  buildScoreboard,
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
import { createRoundBotRoster, MAX_PERSISTENT_BOTS, MIN_PERSISTENT_BOTS, PERSISTENT_BOT_IDS, PERSISTENT_BOT_ROSTER, type PersistentBot } from '../shared/botRoster';
import { NAME_MAX_LENGTH } from '../shared/ratNames';
import { logClientDiagnostics, allowsLocalDiagnostics } from './clientDiagnostics';
import {
  clampPosition,
  HIT_RATE,
  JOIN_RATE,
  MOVEMENT_RATE,
  PING_RATE,
  RateLimiter,
  SHOOT_RATE,
  isPlausibleShot,
  parseClientMessage,
} from './validation';

interface SocketAttachment {
  connectionId?: string;
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
}

interface StoredPlayerRow extends Record<string, SqlStorageValue> {
  id: string;
  data: string;
  updated_at: number;
  last_active_at: number;
}

interface PendingEventRow extends Record<string, SqlStorageValue> {
  id: string;
  type: 'respawn' | 'reset';
  player_id: string | null;
  due_at: number;
}

const WORLD_KEY = 'world';
const ROUND_KEY = 'round';
const ASSIGNMENT_ROTATION_KEY = 'assignment-rotation-v1';
const PERSISTENT_BOTS_KEY = 'persistent-bots-v1';
const BOT_ROSTER_KEY = 'persistent-bot-roster-v1';
const MATCH_ROOM_KEY = 'match-room-v1';
const EVIDENCE_MODE_KEY = 'evidence-mode-v1';
const FORCED_INCIDENT_KEY = 'incident-forced-v1';
export const BOT_REFILL_MS = 10_000;
const JOIN_LEASE_MS = 10_000;
export const BOT_HEARTBEAT_MS = 15_000;
export const STALE_PLAYER_MS = 2 * 60_000;
export const CHECKPOINT_MS = 2_500;
const RECENT_SHOT_LIMIT = 24;
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
  private serverBots: ServerBotController | null = null;
  private preparedBots: ServerBotController | null = null;
  private preparedUntil = 0;
  private botState: ChaosState | undefined;
  private nextBotHeartbeat = 0;
  private players = new Map<string, PlayerData>();
  private readonly sessions = new Map<string, {token:string; until:number | null}>();
  private round: RoundState = playingRound();
  private assignmentRotation: AssignmentRotation = { remaining: [] };
  /** Shipped default is Planted Evidence; the missile incident is an opt-in mode. */
  private evidenceMode: EvidenceMode = 'planted';
  /** Practice-only: force every Dispatch roll to one incident. Null = normal shuffle. */
  private forcedIncident: IncidentId | null = null;
  private world: WorldSpec = createWorldSpec();
  private lastCheckpointAt = new Map<string, number>();
  private lastActiveAt = new Map<string, number>();
  private recentShots = new Map<string, string[]>();
  private lastMovementSequence = new Map<string, number>();
  private readonly shotAcceptedAt = new Map<string, number>();
  private lastMovementBroadcast = new Map<string, { pose: MovementPose; at: number; stationary: boolean }>();
  private readonly rateLimiter = new RateLimiter();
  private messagesIn = 0;
  private broadcasts = 0;
  private readonly pendingMovement=new Map<string,Extract<ServerMessage,{type:'playersMoved'}>['players'][number]>();
  private lastSnapshotAt = 0;
  private reconnects = 0;
  /** Tests replace this to age checkpoints without waiting real time. */
  private clock: () => number = () => Date.now();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      this.hydrate();
      if (this.persistentBots) this.activatePersistentBots();
      await this.scheduleNextAlarm();
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
    const resuming=requestUrl.searchParams.get('resume')==='1';
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
      if (!preparing && this.humanSlots() >= MAX_PLAYERS) return Response.json({ error: 'This room is full' }, { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.setAttachment(server, { connectionId: crypto.randomUUID(),
      ...(preparing ? {titleUntil:this.now()+30_000} : this.matchRoom ? { admissionUntil: this.now() + JOIN_LEASE_MS } : {}),
      localDiagnostics: allowsLocalDiagnostics(request),
      ...([CHAOS_WIRE_MODE,'compact-v1'].includes(requestUrl.searchParams.get('chaos')??'')?{compactChaos:true}:{}),
      ...(requestUrl.searchParams.get('chaos')===CHAOS_WIRE_MODE?{compactChaosDelta:true}:{}),
      ...(['batch-v1','tuple-v1'].includes(requestUrl.searchParams.get('movement')??'')?{batchMovement:true}:{}),
      ...(requestUrl.searchParams.get('movement')==='tuple-v1'?{tupleMovement:true}:{}),
      ...(requestUrl.searchParams.get('receive') === 'welcome-only' ? { receiveMode: 'welcome-only' as const } : {}),
    });
    this.ctx.acceptWebSocket(server);
    this.audience = null;
    if (this.matchRoom) await this.scheduleNextAlarm();
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

  /** Private-room opt-in for the retired missile incident. The default ships as
   * Planted Evidence; a live room must be empty so every client agrees on the mode. */
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

  private humanSlots(): number {
    const humanIds = new Set([...this.players.keys()].filter(id => !this.isManagedBot(id)));
    let pending = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.getAttachment(ws);
      if (!a.playerId && (a.admissionUntil ?? 0) > this.now()) pending++;
    }
    return humanIds.size + pending;
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
    const humans = [...this.players.keys()].filter(id => !this.isManagedBot(id)).length;
    const desired = humans ? Math.max(0, 8 - humans) : 0;
    if (desired > this.botRoster.length && this.refillAt > this.now()) return;
    if (this.refillAt) { this.refillAt = 0; this.writeRoomState('bot-refill-at', '0'); }
    const rosterChanged = this.botRoster.length !== desired;
    if (this.botRoster.length > desired) {
      const removed = this.botRoster.slice(desired);
      for (const {id} of removed) this.removePlayerById(id, true);
      this.botRoster = this.botRoster.slice(0, desired);
    } else if (this.botRoster.length < desired) {
      const used = new Set(this.botRoster.map(bot => bot.id));
      const fresh = createRoundBotRoster([...this.players.values()].map(player => player.name));
      for (const bot of fresh) {
        if (!used.has(bot.id) && this.botRoster.length < desired) this.botRoster.push(bot);
      }
    }
    if (rosterChanged) this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(this.botRoster));
    if (humans) { if (rosterChanged || !this.serverBots) this.activatePersistentBots(); }
    else {
      this.serverBots?.dispose(); this.serverBots = null; this.botState = undefined;
      if (this.chaosTimer) { clearInterval(this.chaosTimer); this.chaosTimer = null; }
      if (this.chaos && wasRunning) this.checkpointGame();
      this.nextBotHeartbeat = 0;
      if (wasRunning && this.matchPool && !this.humanSlots()) this.ctx.waitUntil(this.env.MATCHMAKER.getByName(this.matchPool).retire(this.matchRoom, this.matchPool));
    }
  }

  /** Trusted Worker RPC; only the explicit public-room route invokes this. */
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
        move: (id, position, facing, at) => {
          this.handleMovement(id, { type: 'updateMovement', position, rotation: { x: 0, y: 0, z: 0, w: 1 },
            meshRotation: { x: 0, y: Math.sin(facing / 2), z: 0, w: Math.cos(facing / 2) } }, at);
        },
        shoot: (id, origin, direction) => {
          if (!this.rateLimiter.allow(`${id}:shoot`, SHOOT_RATE.limit, SHOOT_RATE.windowMs, this.now())) return;
          this.handleShoot(id, { type: 'shoot', shotId: crypto.randomUUID(), origin, direction });
        },
      });
  }

  private activatePersistentBots(): void {
    if (this.matchRoom && !this.humanSlots()) return;
    const added: string[] = [];
    for (const entry of this.botRoster) {
      if (this.players.has(entry.id)) continue;
      const player = createPlayer(entry.id, entry.name, entry.appearance,
        spawnForWorld(this.world, Math.random, this.players.values()));
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
    const roster = createRoundBotRoster([...this.players.values()].map(player => player.name));
    if (this.matchRoom) {
      const humans = [...this.players.keys()].filter(id => !this.isManagedBot(id)).length;
      roster.splice(humans ? Math.max(0, 8 - humans) : 0);
    }
    this.serverBots?.dispose();
    this.serverBots = null;
    this.botState = undefined;
    // Stable IDs need leave/join events: respawns do not refresh client nameplates.
    this.batchScoreboards = true;
    try { for (const { id } of this.botRoster) this.removePlayerById(id, true); }
    finally { this.batchScoreboards = false; }
    this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(roster));
    this.botRoster = roster;
    this.activatePersistentBots();
  }

  private recoverManagedBot(id:string):void {
    const player=this.players.get(id);
    if(!this.isManagedBot(id)||!player||player.hp<=0||this.round.phase!=='playing')return;
    this.chaos?.recoverCarrierCase(id);
    // Rescue is not a death, heal or score reset. Use ordinary clear spawn selection.
    Object.assign(player,spawnForWorld(this.world,Math.random,this.players.values(),id));
    this.serverBots?.reset(id,player);
    this.lastMovementBroadcast.delete(id);this.persistPlayer(player,true);
    this.broadcast({type:'playerRespawn',id,x:player.x,y:player.y,z:player.z,hp:player.hp});
    log('info','stranded bot recovered',{playerId:id});
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
      return;
    }

    if (message.type === 'ping') {
      if (!this.rateLimiter.allow(`${connectionId}:ping`, PING_RATE.limit, PING_RATE.windowMs, this.now())) return;
      this.touchActivity(this.getPlayerId(ws));
      this.send(ws, { type: 'pong', sentAt: message.sentAt, receivedAt: this.now() });
      return;
    }

    if (message.type === 'deliveryAck') {this.ackDelivery(ws,message);return;}

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

    if (message.type === 'updateMovement') {
      if (!this.rateLimiter.allow(`${playerId}:move`, MOVEMENT_RATE.limit, MOVEMENT_RATE.windowMs, this.now())) return;
      this.handleMovement(playerId, message);
      this.touchActivity(playerId);
      return;
    }

    if(message.type==='pickupIntent'){
      this.touchActivity(playerId);
      if(!this.rateLimiter.allow(`${playerId}:pickup`,20,1000,this.now())){
        const state=this.chaos?.snapshot(false),at=this.now();
        this.sendToPlayer(playerId,{type:'pickupResult',interactionId:message.interactionId,target:message.target,targetId:message.targetId,
          accepted:false,at,tick:state?.tick??0,epoch:state?.epoch??'room',playerId,reason:'rate-limited'});
        this.diagnostics.netplay('pickup','rate-limited',0);return;
      }
      this.handlePickupIntent(playerId,message);return;
    }

    this.touchActivity(playerId);

    if (message.type === 'shoot') {
      if (!this.rateLimiter.allow(`${playerId}:shoot`, SHOOT_RATE.limit, SHOOT_RATE.windowMs, this.now())) {
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
    if(this.preparedBots&&this.now()>=this.preparedUntil){
      this.preparedBots.dispose();this.preparedBots=null;this.preparedUntil=0;
    }
    this.reconcileLiveness();
    if (this.matchRoom) {
      this.expireAdmissions(); this.rebalanceBots();
      if (!this.humanSlots() && this.matchPool) this.ctx.waitUntil(this.env.MATCHMAKER.getByName(this.matchPool).retire(this.matchRoom, this.matchPool));
    }
    if (this.persistentBots && (!this.matchRoom || this.humanSlots() > 0)) {
      this.activatePersistentBots();
      this.nextBotHeartbeat = this.now() + BOT_HEARTBEAT_MS;
    }
    await this.processDueEvents();
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

    const columns = this.ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(players)')
      .toArray()
      .map((row) => row.name);
    if (!columns.includes('last_active_at')) {
      this.ctx.storage.sql.exec('ALTER TABLE players ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0');
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
          saved.remaining.length<=3&&saved.remaining.every(isAssignmentId)&&new Set(saved.remaining).size===saved.remaining.length){
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
    this.refillAt = Number(this.readRoomState('bot-refill-at')) || 0;
    this.persistentBots = this.readRoomState(PERSISTENT_BOTS_KEY) === 'true';
    if (this.persistentBots) this.restoreBotRoster();
    const attachedIds = this.attachedPlayerIds();
    for (const row of this.ctx.storage.sql.exec<{player_id:string;token:string;disconnected_until:number|null}>('SELECT * FROM reconnect_sessions').toArray())
      this.sessions.set(row.player_id,{token:row.token,until:row.disconnected_until});

    const worldRow = this.readRoomState(WORLD_KEY);
    if (worldRow) {
      try {
        const parsed = JSON.parse(worldRow) as WorldSpec;
        if (typeof parsed.seed === 'number' && typeof parsed.version === 'number') {
          this.world = parsed;
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
        if (attached) this.reconnects += 1;
      } catch {
        this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', row.id);
      }
    }

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
    if (this.matchRoom && !this.getPlayerId(ws) && (attachment.admissionUntil ?? attachment.titleUntil ?? 0) <= this.now()) {
      ws.close(1008, 'Joining timed out'); return;
    }
    this.reconcileLiveness();
    const existingPlayerId = this.getPlayerId(ws);
    const resumedId = existingPlayerId ?? (message.resumeToken ? [...this.sessions].find(([,session]) =>
      session.token===message.resumeToken && (session.until===null || session.until>this.now()))?.[0] : undefined);
    if(resumedId && this.players.has(resumedId)){
      // Replace the controller before closing the old transport. Its delayed
      // messages/close callback must never move or delete the resumed rat.
      for(const old of this.ctx.getWebSockets())if(old!==ws && this.getPlayerId(old)===resumedId){
        this.setAttachment(old,{...this.getAttachment(old),playerId:undefined});
        this.failedSockets.add(old);this.connectionDelivery.delete(old);this.chaosDelivery.delete(old);
        old.close(SESSION_REPLACED_CLOSE_CODE,'Connected on a new transport');
      }
      const session=this.sessions.get(resumedId);
      if(session){session.until=null;this.persistSession(resumedId,session);}
      const player=this.players.get(resumedId)!;
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
    if ((attachment.titleUntil!==undefined && this.humanSlots()>=MAX_PLAYERS) || humanCount >= MAX_PLAYERS || (!this.matchRoom && (this.players.size >= MAX_PLAYERS || (this.persistentBots && humanCount >= MAX_PLAYERS - MAX_PERSISTENT_BOTS)))) {
      this.send(ws, { type: 'error', message: 'This room is full' });
      return;
    }

    if (this.matchRoom && this.players.size >= MAX_PLAYERS && this.botRoster.length) {
      const bot = this.botRoster[this.botRoster.length - 1];
      this.removePlayerById(bot.id, true); this.botRoster.pop();
    }
    const id = crypto.randomUUID();
    const player = createPlayer(id, message.name, message.appearance, spawnForWorld(this.world, Math.random, this.players.values()));
    this.players.set(id, player);
    this.persistPlayer(player, true);
    const session={token:crypto.randomUUID(),until:null};this.sessions.set(id,session);this.persistSession(id,session);
    this.finishJoin(ws,player,true);
  }

  private finishJoin(ws:WebSocket, player:PlayerData, fresh:boolean):void {
    const id=player.id;
    this.joining.add(ws);this.audience=null;
    this.setAttachment(ws, { ...this.getAttachment(ws), playerId: id, admissionUntil: undefined, titleUntil:undefined, delivery: true });
    if (this.matchRoom) this.rebalanceBots();

    this.chaosDelivery.delete(ws);
    this.startChaos();
    const snapshot = this.welcomeMessage(id, player);
    this.send(ws, snapshot);
    if (this.getAttachment(ws).receiveMode !== 'welcome-only') {
      if(this.chaos)this.sendChaos(ws,this.chaos.snapshot(false));
    }
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
      incidents: incidentRoster(this.evidenceMode).map(incident => incident.id),
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
    const { position, corrected } = clampPosition(message.position);
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
    this.persistPlayer(player, corrected);

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
    };
    const previous = this.lastMovementBroadcast.get(playerId);
    const unchanged = previous && POSE_FIELDS.every(field => previous.pose[field] === pose[field]);
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
    this.shotAcceptedAt.set(message.shotId,performance.now());
    if(this.shotAcceptedAt.size>128)this.shotAcceptedAt.delete(this.shotAcceptedAt.keys().next().value!);
    const fired=this.chaos?.shoot(playerId,message);
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
    for(const event of this.chaos?.drainShotEvents()??[]){
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
      ...(result.effectUntil===undefined?{}:{effectUntil:result.effectUntil}),...(result.reason?{reason:result.reason}:{})});
    this.diagnostics.netplay('pickup',result.accepted?'accepted':'rejected',performance.now()-started,result.reason);
  }

  /** Pickup claims are resolved authoritatively in the simulation; the room owns
   * the durable health write and the wire event. Cosmetic claim feedback is local. */
  private applyPickupEvents(): void {
    if (!this.chaos) return;
    for (const event of this.chaos.drainPickupEvents()) {
      if (event.kind !== 'healed') continue;
      const player = this.players.get(event.playerId);
      if (!player) continue;
      this.persistPlayer(player, true);
      this.broadcast({ type: 'playerHealed', id: player.id, hp: player.hp, cause: 'pickup' });
    }
  }

  private async handleHit(playerId: string | null, message: Extract<ClientMessage, { type: 'hit' }>, incoming?:ChaosHit['incoming'], explosive = false): Promise<void> {
    if (this.round.phase !== 'playing') return;

    const victim = this.players.get(message.victimId);
    const shooter = playerId === null ? undefined : this.players.get(playerId);
    const result = applyHit(this.players, playerId, message.victimId, message.damage, !!incoming, playerId && this.chaos?.isCaseHolder(playerId) ? playerId : null, !!this.chaos?.assignmentState, explosive);
    if (!result.applied || !victim) return;
    const cause = playerId === null ? {cause:'evidence-tampering' as const} : {};

    // Final mutations precede persistence and externally visible events.
    // Nonlethal hits do not change the shooter; lethal hits persist the victim
    // once, including the durable respawn deadline.
    const now = this.now();
    const respawnAt = result.roundWon ? now + WIN_DISPLAY_MS : now + RESPAWN_DELAY_MS;
    if (result.killed) victim.respawnAt = respawnAt;
    this.persistPlayer(victim, true);
    if (result.killed && shooter && shooter !== victim) this.persistPlayer(shooter, true);

    const casePoint=result.killed && playerId !== victim.id && (this.chaos?.creditCaseKill(playerId)??false);
    if(casePoint)this.checkpointGame();
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
    this.broadcast({ type: 'playerDamaged', id: victim.id, hp: victim.hp, attackerId: playerId, ...cause });
    if (!result.killed) return;
    this.broadcast({type:'playerDied',victimId:victim.id,killerId:shooter?.id??null,killerName:shooter?.name??null,victimName:victim.name,
      respawnAt,...cause,...(incoming?{incoming,incident:!!incident}:{})});
    this.broadcastScoreboard();
    if(assignmentWon){this.finishAssignment();return;}
    if(result.roundWon&&shooter)this.broadcast({type:'gameWon',winnerId:shooter.id,winnerName:shooter.name,kills:shooter.kills,resetAt:respawnAt});
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

        respawnPlayer(player, spawnForWorld(this.world, Math.random, this.players.values(), player.id));
        this.lastMovementBroadcast.delete(player.id);
        if (this.isManagedBot(player.id)) this.serverBots?.reset(player.id, { x: player.x, y: player.y, z: player.z });
        this.persistPlayer(player, true);
        this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
      }

      if (event.type === 'reset') {
        // Only this assignment's committed result may reset it. An old match
        // deadline cannot consume held time, change mode or choose a winner.
        if(this.chaos?.assignmentState&&(this.round.phase!=='won'||this.round.resetAt!==event.due_at))continue;
        this.lastMovementBroadcast.clear();
        this.chaos?.reset();
        this.applyShotEvents();
        this.round = playingRound(this.now());
        this.beginAssignment();

        const resetPlayers = resetRoundForWorld(
          [...this.players.values()].filter(player => !this.isManagedBot(player.id)), this.world);
        for (const player of resetPlayers) {
          this.persistPlayer(player, true);
          this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
        }
        if (this.persistentBots) this.replaceRoundBots();
        this.checkpointGame();
        this.broadcast({ type: 'gameReset', round: this.currentRound() });
        this.broadcastScoreboard();
      }
    }

    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    // Compute the desired deadline after the async read so concurrent events
    // cannot make a previously computed minimum overwrite an earlier alarm.
    this.diagnostics.count('alarmRead');
    const scheduled = await this.ctx.storage.getAlarm();
    const row = this.ctx.storage.sql
      .exec<{ due_at: number | null }>('SELECT MIN(due_at) AS due_at FROM pending_events')
      .one();

    const dueAt = Math.min(typeof row?.due_at === 'number' ? row.due_at : Infinity,
      this.persistentBots && (!this.matchRoom || this.humanSlots() > 0) ? this.nextBotHeartbeat || this.now() + BOT_HEARTBEAT_MS : Infinity,
      this.refillAt || Infinity, this.preparedUntil || Infinity,
      ...[...this.sessions.values()].map(session=>session.until??Infinity),
      ...this.ctx.getWebSockets().map(ws => { const a = this.getAttachment(ws), deadline=a.admissionUntil??a.titleUntil; return !a.playerId && (deadline ?? 0) > this.now() ? deadline! : Infinity; }));
    if (Number.isFinite(dueAt)) {
      const alarmAt=Math.max(1,dueAt);
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
    const playerId = this.getPlayerId(ws);
    if (playerId) {
      const session=this.sessions.get(playerId);
      if(session && this.players.has(playerId)){
        session.until=this.now()+RECONNECT_GRACE_MS;this.persistSession(playerId,session);
        this.persistPlayer(this.players.get(playerId)!,true);
        if(this.chaos)this.checkpointGame();
      }else this.removePlayerById(playerId);
      this.setAttachment(ws, { ...this.getAttachment(ws), playerId: undefined, admissionUntil: undefined });
    }
    this.ctx.waitUntil(this.scheduleNextAlarm());
    if (this.matchRoom) {
      this.refillAt = this.now() + BOT_REFILL_MS;
      this.writeRoomState('bot-refill-at', String(this.refillAt));
      if (!this.humanSlots()) this.rebalanceBots();
      this.ctx.waitUntil(this.scheduleNextAlarm());
      if (this.matchPool) this.ctx.waitUntil(this.env.MATCHMAKER.getByName(this.matchPool).refresh(this.matchRoom));
    }
  }

  private persistSession(id:string, session:{token:string;until:number|null}):void {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO reconnect_sessions(player_id,token,disconnected_until) VALUES (?,?,?)',id,session.token,session.until);
  }

  private removePlayerById(playerId: string, allowManaged = false): void {
    if (this.isManagedBot(playerId) && !allowManaged) return;
    this.chaos?.removePlayer(playerId);
    if (!this.players.delete(playerId)) return;
    this.sessions.delete(playerId);
    this.ctx.storage.sql.exec('DELETE FROM reconnect_sessions WHERE player_id = ?',playerId);
    this.pendingMovement.delete(playerId);
    this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', playerId);
    this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE player_id = ?', playerId);
    this.lastCheckpointAt.delete(playerId);
    this.lastActiveAt.delete(playerId);
    this.recentShots.delete(playerId);
    this.lastMovementBroadcast.delete(playerId);
    this.lastMovementSequence.delete(playerId);
    this.rateLimiter.clear(playerId);
    this.broadcast({ type: 'playerLeft', id: playerId });
    this.broadcastScoreboard();
    this.logMetrics('leave');
  }

  /** Victory screen owns the next spawn: drop queued respawns and pin every corpse to resetAt. */
  private reconcileDeadlinesOnWin(resetAt: number): void {
    this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type = 'respawn'");
    for (const player of this.players.values()) {
      if (player.hp > 0) continue;
      player.respawnAt = resetAt;
      this.persistPlayer(player, true);
    }
  }

  private startChaos(preparing=false):void {
    if(this.world.version!==GRAYBOX_VERSION)return;
    if(!this.chaos){
      let saved:ChaosState|undefined;
      try{const raw=this.readRoomState('chaos-v1');if(raw)saved=JSON.parse(raw) as ChaosState;}catch{/* start a recoverable case */}
      const previous=saved?.assignment as {id?:string;destinations?:string[]}|undefined;
      const retiredAssignment=previous?.id==='misfiled-evidence'||(previous?.id==='chain-of-custody'&&previous.destinations?.includes('icebox-check'));
      if(retiredAssignment){this.round=playingRound(this.now());this.ctx.storage.sql.exec("DELETE FROM pending_events WHERE type='reset'");}
      this.chaos=new ChaosSimulation(this.players,hit=>{
        void this.handleHit(hit.owner,{type:'hit',victimId:hit.victim,damage:hit.damage},hit.incoming,hit.explosive===true)
          .catch(error=>log('error','incident hit failed',{error:String(error)}));
      },saved,this.world);
      this.chaos.evidenceMode=this.evidenceMode;
      this.chaos.enforceIncidentRoster();
      this.chaos.forcedIncident=this.forcedIncident;
      // Contact history is sparse: clearing N*(N-1)/2 entries for the city's
      // static scenery each substep dwarfs the few real contacts. Cannon's
      // built-in sparse implementation preserves collision/event semantics.
      this.chaos.world.collisionMatrix = new ObjectCollisionMatrix() as unknown as ArrayCollisionMatrix;
      this.chaos.world.collisionMatrixPrevious = new ObjectCollisionMatrix() as unknown as ArrayCollisionMatrix;
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
      const retainedHuman=[...this.players.keys()].some(id=>!this.isManagedBot(id));
      if(this.matchRoom && !retainedHuman){this.rebalanceBots();return;}
      if(!this.persistentBots && !retainedHuman){
        this.checkpointGame();
        clearInterval(this.chaosTimer!);this.chaosTimer=null;return;
      }
      // Workers may freeze high-resolution clocks within one event; cost=0 is
      // not proof of free CPU. These gaps are source-clock spans too, and
      // scheduled timer clamping can conceal physical execution lateness.
      const now=this.now(), tickStart=performance.now();
      this.diagnostics.event(now);
      this.processLiveDeadlines(now);
      const gapMs=Math.max(0,now-this.chaosLast);
      let steps=0;
      this.chaosAccumulator+=Math.min(.2,gapMs/1000);this.chaosLast=now;
      while(this.chaosAccumulator>=1/60){
        this.chaosAccumulator-=1/60;steps++;
        const stepAt = now-this.chaosAccumulator*1000;
        this.serverBots?.step(1/60, stepAt, this.players, this.botState, this.round.phase==='playing');
        this.chaos.step(1/60,stepAt,this.round.phase==='playing');
        this.applyPickupEvents();
        this.applyShotEvents();
        this.finishAssignment();
      }
      this.flushMovement('tick');
      const state=this.chaos.snapshot();
      if (this.serverBots) this.botState = state;
      const signature=state.case.owner+':'+state.case.returningUntil+':'+state.dispatch.serial+':'+state.dispatch.phase+':'+state.assignment?.revision;
      if(now-this.chaosSavedAt>=1000 || signature!==this.chaosSignature){
        this.checkpointGame(state);this.chaosSavedAt=now;this.chaosSignature=signature;
        this.observeCheckpointSettlement();
      }
      // Legacy recipients share one serialization. Compact recipients use their
      // own delivered baseline and bounded acknowledgement window.
      let recipients=0,maxBytes=0,sentBytes=0;
      let legacyPayload:{payload:string;bytes:number}|undefined;
      let prepared:PreparedChaos|undefined;
      for(const ws of this.recipients()){
        const a=this.getAttachment(ws);
        if(ws.readyState!==WebSocket.OPEN||!a.playerId||a.receiveMode==='welcome-only')continue;

        if(a.compactChaos)prepared??=prepareChaos(state);
        else if(!legacyPayload){const payload=serializeServerMessage({type:'chaos',state});legacyPayload={payload,bytes:wireBytes(payload)};}
        this.diagnostics.count('snapshotOffer');
        const bytes=this.sendChaos(ws,state,legacyPayload,prepared);
        if(bytes)this.diagnostics.count('snapshotAccepted');
        if(bytes){recipients++;sentBytes+=bytes;maxBytes=Math.max(maxBytes,bytes);}
      }
      const metrics=this.diagnostics.tick(now,{gapMs,costMs:performance.now()-tickStart,steps,balls:state.shots.length,
        snapshotBytes:recipients?sentBytes/recipients:0,maxSnapshotBytes:maxBytes,sentBytes,recipients});
      if(metrics)log('info','room diagnostics',{roomId:this.ctx.id.toString(),players:this.players.size,
        connections:this.ctx.getWebSockets().length,roundPhase:this.round.phase,incident:state.dispatch.incident??null,...metrics});
    },1000/30);
  }

  private persistPlayer(player: PlayerData, force: boolean): void {
    const now = this.now();
    this.lastActiveAt.set(player.id, now);
    const previous = this.lastCheckpointAt.get(player.id) ?? 0;
    if (!force && now - previous < CHECKPOINT_MS) return;

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
      now,
    );
    this.diagnostics.count('playerWrite');
    this.lastCheckpointAt.set(player.id, now);
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
    if(!this.chaos)return;
    const id=nextAssignment(this.assignmentRotation);
    this.chaos.setAssignment(createAssignment(id,this.now()));
    this.botState=this.chaos.snapshot(false);
  }
  /** Case, progress, bag and result are one synchronous SQLite checkpoint. */
  private checkpointGame(state=this.chaos?.snapshot(false)):void {
    this.ctx.storage.transactionSync(()=>{
      this.persistRound();
      if(state)this.writeRoomState('chaos-v1',JSON.stringify(state));
      this.writeRoomState(ASSIGNMENT_ROTATION_KEY,JSON.stringify(this.assignmentRotation));
    });
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
    this.broadcast({type:'gameWon',winnerId:result.winnerId,winnerName:result.winnerName,kills,resetAt,assignment:structuredClone(assignment)});
    this.ctx.waitUntil(this.scheduleNextAlarm());
  }

  private ensureRoundClock(): void {
    if (this.round.phase === 'playing' && !this.round.startedAt) {
      this.round = { ...this.round, startedAt: this.now() };
      this.persistRound();
    }
  }

  private readRoomState(key: string): string | undefined {
    return this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM room_state WHERE key = ?', key)
      .toArray()[0]?.value;
  }

  private writeRoomState(key: string, value: string): void {
    this.diagnostics.count('roomWrite');
    this.ctx.storage.sql.exec(
      `INSERT INTO room_state (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
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
      players[id] = player;
    }
    return players;
  }

  private recipients(): WebSocket[] {
    return this.audience ??= this.ctx.getWebSockets().filter(ws => {
      const a = this.getAttachment(ws);
      return a.playerId && a.receiveMode !== 'welcome-only' && !this.failedSockets.has(ws) && !this.joining.has(ws);
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
      const attachment=this.getAttachment(ws),player=attachment.playerId?this.players.get(attachment.playerId):undefined;
      const resumed=attachment.delivered;
      this.setAttachment(ws,{...attachment,delivered:true});
      if(resumed&&player)delivery.offer(serializeServerMessage(this.welcomeMessage(player.id,player)),Date.now());
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
    try { ws.close(code, 'Connection needs reconnect'); } catch { /* Transport already gone. */ }
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
      const combined=JSON.stringify({...message,move:[sample.player.id,sample.at,...POSE_FIELDS.map(key=>sample.player[key])]});
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
