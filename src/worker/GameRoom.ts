import { DurableObject } from 'cloudflare:workers';
import {
  MAX_CONNECTIONS,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_MS,
  WIN_DISPLAY_MS,
  type ClientMessage,
  type PlayerData,
  type RoundState,
  type ServerMessage,
} from '../shared/networkProtocol';
import { createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import {
  applyHit,
  buildScoreboard,
  createPlayer,
  playingRound,
  resetRound,
  respawnPlayer,
  spawnForWorld,
  wonRound,
} from './gameState';
import { log } from './logging';
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
export const STALE_PLAYER_MS = 2 * 60_000;
export const CHECKPOINT_MS = 2_500;
const RECENT_SHOT_LIMIT = 24;

export class GameRoom extends DurableObject<Env> {
  private players = new Map<string, PlayerData>();
  private round: RoundState = playingRound();
  private world: WorldSpec = createWorldSpec();
  private lastCheckpointAt = new Map<string, number>();
  private lastActiveAt = new Map<string, number>();
  private recentShots = new Map<string, string[]>();
  private readonly rateLimiter = new RateLimiter();
  private messagesIn = 0;
  private broadcasts = 0;
  private lastSnapshotAt = 0;
  private reconnects = 0;
  /** Tests replace this to age checkpoints without waiting real time. */
  private clock: () => number = () => Date.now();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      this.hydrate();
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ error: 'Expected WebSocket upgrade' }, { status: 400 });
    }
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) {
      return Response.json({ error: 'This room is full' }, { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ connectionId: crypto.randomUUID() } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
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

    if (message.type === 'updateMovement') {
      if (!this.rateLimiter.allow(`${playerId}:move`, MOVEMENT_RATE.limit, MOVEMENT_RATE.windowMs, this.now())) return;
      this.handleMovement(playerId, message);
      this.touchActivity(playerId);
      return;
    }

    this.touchActivity(playerId);

    if (message.type === 'shoot') {
      if (!this.rateLimiter.allow(`${playerId}:shoot`, SHOOT_RATE.limit, SHOOT_RATE.windowMs, this.now())) return;
      this.handleShoot(playerId, message);
      return;
    }

    if (message.type === 'hit') {
      if (!this.rateLimiter.allow(`${playerId}:hit`, HIT_RATE.limit, HIT_RATE.windowMs, this.now())) return;
      await this.handleHit(playerId, message);
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
        this.round = playingRound();
        this.persistRound();
      }
    } else {
      const legacy = this.readRoomState('gameInProgress');
      this.round = legacy === 'false' ? { phase: 'won' } : playingRound();
      this.persistRound();
    }

    const now = this.now();
    const rows = this.ctx.storage.sql
      .exec<StoredPlayerRow>('SELECT id, data, updated_at, last_active_at FROM players')
      .toArray();

    for (const row of rows) {
      const lastActive = Number(row.last_active_at) || Number(row.updated_at) || 0;
      const attached = attachedIds.has(row.id);
      if (!attached && lastActive > 0 && now - lastActive > STALE_PLAYER_MS) {
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

    const existingPlayerId = this.getPlayerId(ws);
    if (existingPlayerId) {
      this.removePlayerById(existingPlayerId);
    }
    this.reconcileLiveness();

    if (this.players.size >= MAX_PLAYERS) {
      this.send(ws, { type: 'error', message: 'This room is full' });
      return;
    }

    const id = crypto.randomUUID();
    const player = createPlayer(id, message.name, message.appearance, spawnForWorld(this.world));
    this.players.set(id, player);
    this.persistPlayer(player, true);
    ws.serializeAttachment({ ...this.getAttachment(ws), playerId: id } satisfies SocketAttachment);

    const snapshot = this.welcomeMessage(id, player);
    this.send(ws, snapshot);
    this.send(ws, { type: 'currentPlayers', players: snapshot.players });
    this.broadcast({ type: 'playerJoined', player }, id);
    this.broadcastScoreboard();
    this.logMetrics('join');
  }

  private welcomeMessage(id: string, player: PlayerData): Extract<ServerMessage, { type: 'welcome' }> {
    this.lastSnapshotAt = this.now();
    return {
      type: 'welcome',
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
      if (attached.has(id)) continue;
      const lastActive = this.lastActiveAt.get(id) ?? 0;
      if (now - lastActive > STALE_PLAYER_MS) {
        this.removePlayerById(id);
      }
    }
  }

  private handleMovement(playerId: string, message: Extract<ClientMessage, { type: 'updateMovement' }>): void {
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
    if (corrected) {
      this.broadcast({ type: 'playerCorrected', player: pose });
      return;
    }
    this.broadcast({ type: 'playerMoved', player: pose }, playerId);
  }

  private handleShoot(playerId: string, message: Extract<ClientMessage, { type: 'shoot' }>): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0) return;
    if (!isPlausibleShot(message.origin, message.direction, player)) return;
    if (!this.rememberShot(playerId, message.shotId)) return;

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

  private async handleHit(playerId: string, message: Extract<ClientMessage, { type: 'hit' }>): Promise<void> {
    if (this.round.phase !== 'playing') return;

    const victim = this.players.get(message.victimId);
    const shooter = this.players.get(playerId);
    const result = applyHit(this.players, playerId, message.victimId, message.damage);
    if (!result.applied || !victim || !shooter) return;

    this.persistPlayer(victim, true);
    this.persistPlayer(shooter, true);

    this.broadcast({ type: 'playerDamaged', id: victim.id, hp: victim.hp, attackerId: playerId });

    if (!result.killed) return;

    const now = this.now();
    const respawnAt = result.roundWon ? now + WIN_DISPLAY_MS : now + RESPAWN_DELAY_MS;
    victim.respawnAt = respawnAt;
    this.persistPlayer(victim, true);

    this.broadcast({
      type: 'playerDied',
      victimId: victim.id,
      killerId: shooter.id,
      killerName: shooter.name,
      victimName: victim.name,
      respawnAt,
    });
    this.broadcastScoreboard();

    if (result.roundWon) {
      this.round = wonRound(shooter.id, shooter.name, shooter.kills, respawnAt);
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

        respawnPlayer(player, spawnForWorld(this.world));
        this.persistPlayer(player, true);
        this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
      }

      if (event.type === 'reset') {
        this.round = playingRound();
        this.persistRound();

        const resetPlayers = resetRound(this.players.values(), () => spawnForWorld(this.world));
        for (const player of resetPlayers) {
          this.persistPlayer(player, true);
          this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
        }
        this.broadcast({ type: 'gameReset', round: this.round });
        this.broadcastScoreboard();
      }
    }

    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const row = this.ctx.storage.sql
      .exec<{ due_at: number | null }>('SELECT MIN(due_at) AS due_at FROM pending_events')
      .one();

    if (typeof row?.due_at === 'number') {
      await this.ctx.storage.setAlarm(row.due_at);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private removePlayer(ws: WebSocket): void {
    const playerId = this.getPlayerId(ws);
    if (playerId) {
      this.removePlayerById(playerId);
    }
  }

  private removePlayerById(playerId: string): void {
    if (!this.players.delete(playerId)) return;
    this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', playerId);
    this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE player_id = ?', playerId);
    this.lastCheckpointAt.delete(playerId);
    this.lastActiveAt.delete(playerId);
    this.recentShots.delete(playerId);
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
    this.lastCheckpointAt.set(player.id, now);
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

  private readRoomState(key: string): string | undefined {
    return this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM room_state WHERE key = ?', key)
      .toArray()[0]?.value;
  }

  private writeRoomState(key: string, value: string): void {
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

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage, exceptPlayerId?: string): void {
    const payload = JSON.stringify(message);
    this.broadcasts += 1;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(ws);
      if (exceptPlayerId && attachment.playerId === exceptPlayerId) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
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
    return (ws.deserializeAttachment() as SocketAttachment | undefined) ?? {};
  }

  private getPlayerId(ws: WebSocket): string | undefined {
    return this.getAttachment(ws).playerId;
  }

  private now(): number {
    return this.clock();
  }
}
