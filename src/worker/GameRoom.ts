import { ChaosDelivery } from './ChaosDelivery';
import { CHAOS_WIRE_MODE, prepareChaos, type PreparedChaos } from '../shared/chaosWire';
import { ObjectCollisionMatrix, type ArrayCollisionMatrix } from 'cannon-es';
import { ChaosSimulation, type ChaosHit } from '../shared/ChaosSimulation';
import { serializeServerMessage } from './serializeServerMessage';
import type { ChaosState } from '../shared/chaosState';
import { GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { DurableObject } from 'cloudflare:workers';
import {
  MAX_CONNECTIONS,
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
  admissionUntil?: number;
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
const PERSISTENT_BOTS_KEY = 'persistent-bots-v1';
const BOT_ROSTER_KEY = 'persistent-bot-roster-v1';
const MATCH_ROOM_KEY = 'match-room-v1';
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
  private botState: ChaosState | undefined;
  private nextBotHeartbeat = 0;
  private players = new Map<string, PlayerData>();
  private round: RoundState = playingRound();
  private world: WorldSpec = createWorldSpec();
  private lastCheckpointAt = new Map<string, number>();
  private lastActiveAt = new Map<string, number>();
  private recentShots = new Map<string, string[]>();
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
      if (this.persistentBots) {
        this.activatePersistentBots();
        await this.scheduleNextAlarm();
      }
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
    const roomName = requestUrl.searchParams.get('room') || '';
    if (roomName.startsWith('graybox-') && this.world.version !== GRAYBOX_VERSION &&
        this.players.size === 0 && this.ctx.getWebSockets().length === 0) {
      this.world = { ...createWorldSpec(), version: GRAYBOX_VERSION };
      this.persistWorld();
    }

    if (this.matchRoom) {
      this.expireAdmissions();
      if (this.humanSlots() >= MAX_PLAYERS) return Response.json({ error: 'This room is full' }, { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.setAttachment(server, { connectionId: crypto.randomUUID(),
      ...(this.matchRoom ? { admissionUntil: this.now() + JOIN_LEASE_MS } : {}),
      localDiagnostics: allowsLocalDiagnostics(request),
      ...([CHAOS_WIRE_MODE,'compact-v1'].includes(requestUrl.searchParams.get('chaos')??'')?{compactChaos:true}:{}),
      ...(requestUrl.searchParams.get('chaos')===CHAOS_WIRE_MODE?{compactChaosDelta:true}:{}),
      ...(requestUrl.searchParams.get('movement')==='batch-v1'?{batchMovement:true}:{}),
      ...(requestUrl.searchParams.get('receive') === 'welcome-only' ? { receiveMode: 'welcome-only' as const } : {}),
    });
    this.ctx.acceptWebSocket(server);
    if (this.matchRoom) await this.scheduleNextAlarm();

    return new Response(null, { status: 101, webSocket: client, headers: this.matchRoom ? {'x-rat-slots': String(this.humanSlots())} : {} });
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
    this.rebalanceBots();
    await this.scheduleNextAlarm();
  }

  async occupiedSlots(): Promise<number> { this.expireAdmissions(); return this.humanSlots(); }

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
      if (!a.playerId && a.admissionUntil !== undefined && a.admissionUntil <= this.now()) {
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
    this.refillAt = 0;
    this.writeRoomState('bot-refill-at', '0');
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
    this.writeRoomState(BOT_ROSTER_KEY, JSON.stringify(this.botRoster));
    if (humans) this.activatePersistentBots();
    else {
      this.serverBots?.dispose(); this.serverBots = null; this.botState = undefined;
      if (this.chaosTimer) { clearInterval(this.chaosTimer); this.chaosTimer = null; }
      if (this.chaos) this.writeRoomState('chaos-v1', JSON.stringify(this.chaos.snapshot(false)));
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
      this.serverBots = new ServerBotController(this.world, this.matchRoom ? PERSISTENT_BOT_IDS : this.botRoster.map(bot => bot.id), {
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
    for (const { id } of this.botRoster) this.removePlayerById(id, true);
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
  async status(): Promise<Omit<PublicRoomStatus, 'room'> & { bots: number }> {
    const attached = this.attachedPlayerIds();
    const live = Array.from(this.players.values()).filter((player) => attached.has(player.id) || this.isManagedBot(player.id));
    return {
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
    this.diagnostics.event(this.now(), true);
    this.messagesIn += 1;
    const message = parseClientMessage(raw);
    if (!message) {
      this.send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }

    const connectionId = this.getAttachment(ws).connectionId ?? 'unknown';
    if (message.type === 'join') {
      if (!this.rateLimiter.allow(`${connectionId}:join`, JOIN_RATE.limit, JOIN_RATE.windowMs, this.now())) {
        this.send(ws, { type: 'error', message: 'Too many join attempts' });
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

    const playerId = this.getPlayerId(ws);
    if (!playerId || !this.players.has(playerId)) {
      this.send(ws, { type: 'error', message: 'Join before sending game messages' });
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

    this.touchActivity(playerId);

    if (message.type === 'shoot') {
      if (!this.rateLimiter.allow(`${playerId}:shoot`, SHOOT_RATE.limit, SHOOT_RATE.windowMs, this.now())) {
        this.diagnostics.shot('rateLimited');
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
    ws.close();
    this.removePlayer(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    log('warn', 'websocket error', { error: error instanceof Error ? error.message : String(error) });
    this.removePlayer(ws);
  }

  async alarm(): Promise<void> {
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
    this.matchRoom = this.readRoomState(MATCH_ROOM_KEY) ?? null;
    this.matchPool = this.readRoomState('match-pool-v1') ?? this.matchRoom;
    this.refillAt = Number(this.readRoomState('bot-refill-at')) || 0;
    this.persistentBots = this.readRoomState(PERSISTENT_BOTS_KEY) === 'true';
    if (this.persistentBots) this.restoreBotRoster();
    const attachedIds = this.attachedPlayerIds();

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
      const inactiveBot = this.persistentBots && PERSISTENT_BOT_IDS.includes(row.id) && !this.isManagedBot(row.id);
      if (inactiveBot || (!attached && !this.isManagedBot(row.id) && lastActive > 0 && now - lastActive > STALE_PLAYER_MS)) {
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
  }

  private handleJoin(ws: WebSocket, message: Extract<ClientMessage, { type: 'join' }>): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this.send(ws, {
        type: 'error',
        message: `Protocol version ${message.protocolVersion} is unsupported. Reload to continue.`,
      });
      return;
    }

    if (this.matchRoom && !this.getPlayerId(ws) && (this.getAttachment(ws).admissionUntil ?? 0) <= this.now()) {
      ws.close(1008, 'Joining timed out'); return;
    }
    const existingPlayerId = this.getPlayerId(ws);
    if (existingPlayerId) {
      this.removePlayerById(existingPlayerId);
    }
    this.reconcileLiveness();

    const humanCount = [...this.players.keys()].filter(id => !this.isManagedBot(id)).length;
    if (humanCount >= MAX_PLAYERS || (!this.matchRoom && (this.players.size >= MAX_PLAYERS || (this.persistentBots && humanCount >= MAX_PLAYERS - MAX_PERSISTENT_BOTS)))) {
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
    this.setAttachment(ws, { ...this.getAttachment(ws), playerId: id, admissionUntil: undefined });
    if (this.matchRoom) this.rebalanceBots();

    this.chaosDelivery.delete(ws);
    this.startChaos();
    const snapshot = this.welcomeMessage(id, player);
    this.send(ws, snapshot);
    if (this.getAttachment(ws).receiveMode !== 'welcome-only') {
      this.send(ws, { type: 'currentPlayers', players: snapshot.players });
      if(this.chaos)this.sendChaos(ws,this.chaos.snapshot(false));
    }
    this.broadcast({ type: 'playerJoined', player }, id);
    this.broadcastScoreboard();
    this.logMetrics('join');
  }

  private welcomeMessage(id: string, player: PlayerData): Extract<ServerMessage, { type: 'welcome' }> {
    this.lastSnapshotAt = this.now();
    return {
      type: 'welcome',
      ...(this.matchRoom ? { matchRoom: this.matchRoom } : {}),
      id,
      player,
      players: this.playersRecord(),
      round: this.round,
      world: this.world,
      protocolVersion: PROTOCOL_VERSION,
      serverTime: this.lastSnapshotAt,
    };
  }

  private reconcileLiveness(): void {
    const attached = this.attachedPlayerIds();
    const now = this.now();
    for (const [id] of this.players) {
      if (attached.has(id) || this.isManagedBot(id)) continue;
      const lastActive = this.lastActiveAt.get(id) ?? 0;
      if (now - lastActive > STALE_PLAYER_MS) {
        this.removePlayerById(id);
      }
    }
  }

  private handleMovement(playerId: string, message: Extract<ClientMessage, { type: 'updateMovement' }>, at = this.now()): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0) return;
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
      return;
    }
    this.lastMovementBroadcast.set(playerId, { pose, at, stationary: !!unchanged });
    if (corrected) {
      this.broadcast({ type: 'playerCorrected', player: pose, at });
      return;
    }
    this.broadcast({ type: 'playerMoved', player: pose, at }, playerId);
  }

  private handleShoot(playerId: string, message: Extract<ClientMessage, { type: 'shoot' }>): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0) { this.diagnostics.shot('dead'); return; }
    if (this.round.phase !== 'playing') { this.diagnostics.shot('roundOver'); return; }
    if (!isPlausibleShot(message.origin, message.direction, player)) { this.diagnostics.shot('implausible'); return; }
    if (!this.rememberShot(playerId, message.shotId)) { this.diagnostics.shot('duplicate'); return; }
    this.startChaos();
    this.chaos?.shoot(playerId,message);
    this.diagnostics.shot('accepted');

    this.broadcast(
      {
        type: 'playerShot',
        shooterId: playerId,
        shotId: message.shotId,
        origin: message.origin,
        direction: message.direction,
      },
      playerId,
    );
  }

  private async handleHit(playerId: string, message: Extract<ClientMessage, { type: 'hit' }>, incoming?:ChaosHit['incoming']): Promise<void> {
    if (this.round.phase !== 'playing') return;

    const victim = this.players.get(message.victimId);
    const shooter = this.players.get(playerId);
    const result = applyHit(this.players, playerId, message.victimId, message.damage, !!incoming, this.chaos?.isCaseHolder(playerId) ? playerId : null);
    if (!result.applied || !victim || !shooter) return;

    // Final mutations precede persistence and externally visible events.
    // Nonlethal hits do not change the shooter; lethal hits persist the victim
    // once, including the durable respawn deadline.
    const now = this.now();
    const respawnAt = result.roundWon ? now + WIN_DISPLAY_MS : now + RESPAWN_DELAY_MS;
    if (result.killed) victim.respawnAt = respawnAt;
    this.persistPlayer(victim, true);
    if (result.killed) this.persistPlayer(shooter, true);

    this.broadcast({ type: 'playerDamaged', id: victim.id, hp: victim.hp, attackerId: playerId });

    if (!result.killed) return;

    const incident=incoming?this.chaos?.death(victim,incoming,shooter.id):false;
    this.broadcast({
      type: 'playerDied',
      victimId: victim.id,
      killerId: shooter.id,
      killerName: shooter.name,
      victimName: victim.name,
      respawnAt,
      ...(incoming?{incoming,incident:!!incident}:{}),
    });
    this.broadcastScoreboard();

    if (result.roundWon) {
      this.round = wonRound(shooter.id, shooter.name, shooter.kills, respawnAt, this.round.startedAt);
      this.persistRound();
      this.reconcileDeadlinesOnWin(respawnAt);
      this.broadcast({
        type: 'gameWon',
        winnerId: shooter.id,
        winnerName: shooter.name,
        kills: shooter.kills,
        resetAt: respawnAt,
      });
      await this.schedulePendingEvent('reset', null, respawnAt);
      return;
    }

    await this.schedulePendingEvent('respawn', victim.id, respawnAt);
  }

  private async schedulePendingEvent(type: 'respawn' | 'reset', playerId: string | null, dueAt: number): Promise<void> {
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      'INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, ?, ?, ?)',
      id,
      type,
      playerId,
      dueAt,
    );
    await this.scheduleNextAlarm();
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
        this.lastMovementBroadcast.clear();
        this.chaos?.reset();
        this.round = playingRound(this.now());
        this.persistRound();

        const resetPlayers = resetRoundForWorld(
          [...this.players.values()].filter(player => !this.isManagedBot(player.id)), this.world);
        for (const player of resetPlayers) {
          this.persistPlayer(player, true);
          this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
        }
        if (this.persistentBots) this.replaceRoundBots();
        this.broadcast({ type: 'gameReset', round: this.round });
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
      this.refillAt || Infinity,
      ...this.ctx.getWebSockets().map(ws => { const a = this.getAttachment(ws); return !a.playerId && (a.admissionUntil ?? 0) > this.now() ? a.admissionUntil! : Infinity; }));
    if (Number.isFinite(dueAt)) {
      if (scheduled !== dueAt) { this.diagnostics.count('alarmSet'); await this.ctx.storage.setAlarm(dueAt); }
    } else if (scheduled !== null) {
      this.diagnostics.count('alarmDelete');
      await this.ctx.storage.deleteAlarm();
    }
  }

  private removePlayer(ws: WebSocket): void {
    const playerId = this.getPlayerId(ws);
    if (playerId) {
      this.removePlayerById(playerId);
      this.setAttachment(ws, { ...this.getAttachment(ws), playerId: undefined, admissionUntil: undefined });
    }
    if (this.matchRoom) {
      this.refillAt = this.now() + BOT_REFILL_MS;
      this.writeRoomState('bot-refill-at', String(this.refillAt));
      if (!this.humanSlots()) this.rebalanceBots();
      this.ctx.waitUntil(this.scheduleNextAlarm());
      if (this.matchPool) this.ctx.waitUntil(this.env.MATCHMAKER.getByName(this.matchPool).refresh(this.matchRoom));
    }
  }

  private removePlayerById(playerId: string, allowManaged = false): void {
    if (this.isManagedBot(playerId) && !allowManaged) return;
    this.chaos?.removePlayer(playerId);
    if (!this.players.delete(playerId)) return;
    this.pendingMovement.delete(playerId);
    this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', playerId);
    this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE player_id = ?', playerId);
    this.lastCheckpointAt.delete(playerId);
    this.lastActiveAt.delete(playerId);
    this.recentShots.delete(playerId);
    this.lastMovementBroadcast.delete(playerId);
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

  private startChaos():void {
    if(this.world.version!==GRAYBOX_VERSION)return;
    if(!this.chaos){
      let saved:ChaosState|undefined;
      try{const raw=this.readRoomState('chaos-v1');if(raw)saved=JSON.parse(raw) as ChaosState;}catch{/* start a recoverable case */}
      this.chaos=new ChaosSimulation(this.players,hit=>{
        void this.handleHit(hit.owner,{type:'hit',victimId:hit.victim,damage:hit.damage},hit.incoming)
          .catch(error=>log('error','incident hit failed',{error:String(error)}));
      },saved,this.world);
      // Contact history is sparse: clearing N*(N-1)/2 entries for the city's
      // static scenery each substep dwarfs the few real contacts. Cannon's
      // built-in sparse implementation preserves collision/event semantics.
      this.chaos.world.collisionMatrix = new ObjectCollisionMatrix() as unknown as ArrayCollisionMatrix;
      this.chaos.world.collisionMatrixPrevious = new ObjectCollisionMatrix() as unknown as ArrayCollisionMatrix;
    }
    if(this.chaosTimer)return;
    this.chaosLast=this.now();this.chaosAccumulator=0;
    this.chaosTimer=setInterval(()=>{
      if(!this.chaos)return;
      const attached=this.attachedPlayerIds();
      for(const id of [...this.players.keys()])if(!attached.has(id) && !this.isManagedBot(id))this.removePlayerById(id);
      if(this.matchRoom && ![...attached].some(id=>this.players.has(id))){this.rebalanceBots();return;}
      if(!this.persistentBots && ![...attached].some(id=>this.players.has(id))){
        this.writeRoomState('chaos-v1',JSON.stringify(this.chaos.snapshot(false)));
        clearInterval(this.chaosTimer!);this.chaosTimer=null;return;
      }
      // Workers may freeze high-resolution clocks within one event; cost=0 is
      // not proof of free CPU. These gaps are source-clock spans too, and
      // scheduled timer clamping can conceal physical execution lateness.
      const now=this.now(), tickStart=performance.now();
      this.diagnostics.event(now);
      const gapMs=Math.max(0,now-this.chaosLast);
      let steps=0;
      this.chaosAccumulator+=Math.min(.2,gapMs/1000);this.chaosLast=now;
      while(this.chaosAccumulator>=1/60){
        this.chaosAccumulator-=1/60;steps++;
        const stepAt = now-this.chaosAccumulator*1000;
        this.serverBots?.step(1/60, stepAt, this.players, this.botState, this.round.phase==='playing');
        this.chaos.step(1/60,stepAt,this.round.phase==='playing');
      }
      this.flushMovement('tick');
      const state=this.chaos.snapshot();
      if (this.serverBots) this.botState = state;
      const signature=state.case.owner+':'+state.case.returningUntil+':'+state.dispatch.serial+':'+state.dispatch.phase;
      if(now-this.chaosSavedAt>=1000 || signature!==this.chaosSignature){
        this.writeRoomState('chaos-v1',JSON.stringify(state));this.chaosSavedAt=now;this.chaosSignature=signature;
        this.observeCheckpointSettlement();
      }
      // Legacy recipients share one serialization. Compact recipients use their
      // own delivered baseline and bounded acknowledgement window.
      let recipients=0,maxBytes=0,sentBytes=0;
      let legacyPayload:string|undefined;
      let prepared:PreparedChaos|undefined;
      for(const ws of this.ctx.getWebSockets()){
        const a=this.getAttachment(ws);
        if(ws.readyState!==WebSocket.OPEN||!a.playerId||a.receiveMode==='welcome-only')continue;
        if(!a.compactChaos)legacyPayload??=serializeServerMessage({type:'chaos',state});
        if(a.compactChaos)prepared??=prepareChaos(state);
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
    this.writeRoomState(ROUND_KEY, JSON.stringify(this.round));
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
    this.broadcast({ type: 'scoreboardUpdate', scores: buildScoreboard(this.players.values()) });
  }

  private playersRecord(): Record<string, PlayerData> {
    const players: Record<string, PlayerData> = {};
    for (const [id, player] of this.players) {
      players[id] = player;
    }
    return players;
  }

  private sendChaos(ws:WebSocket,state:ChaosState,legacyPayload?:string,prepared?:PreparedChaos):number {
    if(ws.readyState!==WebSocket.OPEN)return 0;
    try{
      let payload:string|null;
      if(this.getAttachment(ws).compactChaos){
        let delivery=this.chaosDelivery.get(ws);
        if(!delivery){delivery=new ChaosDelivery(!!this.getAttachment(ws).compactChaosDelta);this.chaosDelivery.set(ws,delivery);}
        payload=delivery.offer(state,this.now(),prepared);
      }else payload=legacyPayload??serializeServerMessage({type:'chaos',state});
      if(!payload)return 0;
      ws.send(payload);return new TextEncoder().encode(payload).byteLength;
    }catch(error){
      log('warn','snapshot stream reset',{reason:error instanceof Error?error.message:String(error)});
      ws.close(1013,'Snapshot stream needs reconnect');return 0;
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeServerMessage(message));
    }
  }

  private broadcast(message: ServerMessage, exceptPlayerId?: string): void {
    if (this.ctx.getWebSockets().length === 0) return;
    if(message.type==='playerMoved'&&this.chaosTimer&&this.world.version===GRAYBOX_VERSION){
      if(this.ctx.getWebSockets().some(ws=>this.getAttachment(ws).batchMovement)){
        if(this.pendingMovement.has(message.player.id))this.diagnostics.count('movementOverwrite');
        this.pendingMovement.set(message.player.id,{player:message.player,at:message.at??this.now()});
      }
      if(this.ctx.getWebSockets().some(ws=>!this.getAttachment(ws).batchMovement))this.broadcastSerialized(serializeServerMessage(message),exceptPlayerId,'individual');
      return;
    }
    // Preserve movement-before-shot, correction, death and roster ordering.
    this.flushMovement();
    this.broadcastSerialized(serializeServerMessage(message), exceptPlayerId);
  }

  private flushMovement(reason:'tick'|'event'='event'):void {
    if(!this.pendingMovement.size)return;
    const players=[...this.pendingMovement.values()];this.pendingMovement.clear();
    this.diagnostics.movementBatch(reason,players.length);
    this.broadcastSerialized(serializeServerMessage({type:'playersMoved',players}),undefined,'batch');
  }

  private broadcastSerialized(payload: string, exceptPlayerId?: string, movementMode?:'individual'|'batch'): number {
    let recipients = 0;
    this.broadcasts += 1;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(ws);
      if(movementMode==='batch'&&!attachment.batchMovement||movementMode==='individual'&&attachment.batchMovement)continue;
      if (!attachment.playerId || attachment.receiveMode === 'welcome-only' || (exceptPlayerId && attachment.playerId === exceptPlayerId)) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        recipients++;
      }
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
  }

  private getPlayerId(ws: WebSocket): string | undefined {
    return this.getAttachment(ws).playerId;
  }

  private now(): number {
    return this.clock();
  }
}
