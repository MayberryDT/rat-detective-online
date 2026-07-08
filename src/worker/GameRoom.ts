import { DurableObject } from 'cloudflare:workers';
import {
  MAX_HP,
  RESPAWN_DELAY_MS,
  WIN_DISPLAY_MS,
  type ClientMessage,
  type PlayerData,
  type ServerMessage,
} from '../shared/networkProtocol';
import { applyHit, buildScoreboard, createPlayer, createRandomCitySpawn, resetRound, respawnPlayer } from './gameState';
import { log } from './logging';
import { parseClientMessage } from './validation';

interface SocketAttachment {
  connectionId?: string;
  playerId?: string;
}

interface StoredPlayerRow extends Record<string, SqlStorageValue> {
  id: string;
  data: string;
}

interface PendingEventRow extends Record<string, SqlStorageValue> {
  id: string;
  type: 'respawn' | 'reset';
  player_id: string | null;
  due_at: number;
}

const GAME_IN_PROGRESS_KEY = 'gameInProgress';

export class GameRoom extends DurableObject<Env> {
  private players = new Map<string, PlayerData>();
  private gameInProgress = true;

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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ connectionId: crypto.randomUUID() } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(raw);
    if (!message) {
      this.send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }

    if (message.type === 'join') {
      this.handleJoin(ws, message);
      return;
    }

    if (message.type === 'ping') {
      this.send(ws, { type: 'pong', sentAt: message.sentAt, receivedAt: Date.now() });
      return;
    }

    const playerId = this.getPlayerId(ws);
    if (!playerId || !this.players.has(playerId)) {
      this.send(ws, { type: 'error', message: 'Join before sending game messages' });
      return;
    }

    if (message.type === 'updateMovement') {
      this.handleMovement(playerId, message);
      return;
    }

    if (message.type === 'shoot') {
      this.handleShoot(playerId, message);
      return;
    }

    if (message.type === 'hit') {
      await this.handleHit(playerId, message);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.removePlayer(ws);
    ws.close(code, reason);
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
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
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
  }

  private hydrate(): void {
    const rows = this.ctx.storage.sql.exec<StoredPlayerRow>('SELECT id, data FROM players').toArray();
    for (const row of rows) {
      try {
        this.players.set(row.id, JSON.parse(row.data) as PlayerData);
      } catch {
        this.ctx.storage.sql.exec('DELETE FROM players WHERE id = ?', row.id);
      }
    }

    const gameState = this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM room_state WHERE key = ?', GAME_IN_PROGRESS_KEY)
      .toArray()[0];
    this.gameInProgress = gameState ? gameState.value === 'true' : true;
  }

  private handleJoin(ws: WebSocket, message: Extract<ClientMessage, { type: 'join' }>): void {
    const existingPlayerId = this.getPlayerId(ws);
    if (existingPlayerId) {
      this.removePlayerById(existingPlayerId);
    }

    const id = crypto.randomUUID();
    const player = createPlayer(id, message.name, message.appearance, createRandomCitySpawn());
    this.players.set(id, player);
    this.persistPlayer(player);
    ws.serializeAttachment({ ...this.getAttachment(ws), playerId: id } satisfies SocketAttachment);

    this.send(ws, { type: 'welcome', id, player });
    this.send(ws, { type: 'currentPlayers', players: this.playersRecord() });
    this.broadcast({ type: 'playerJoined', player }, id);
    this.broadcastScoreboard();
  }

  private handleMovement(playerId: string, message: Extract<ClientMessage, { type: 'updateMovement' }>): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0) return;

    player.x = message.position.x;
    player.y = message.position.y;
    player.z = message.position.z;
    player.qx = message.rotation.x;
    player.qy = message.rotation.y;
    player.qz = message.rotation.z;
    player.qw = message.rotation.w;
    player.meshQx = message.meshRotation.x;
    player.meshQy = message.meshRotation.y;
    player.meshQz = message.meshRotation.z;
    player.meshQw = message.meshRotation.w;
    this.persistPlayer(player);

    this.broadcast(
      {
        type: 'playerMoved',
        player: {
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
        },
      },
      playerId,
    );
  }

  private handleShoot(playerId: string, message: Extract<ClientMessage, { type: 'shoot' }>): void {
    const player = this.players.get(playerId);
    if (!player || player.hp <= 0) return;

    this.broadcast(
      {
        type: 'playerShot',
        shooterId: playerId,
        origin: message.origin,
        target: message.target,
      },
      playerId,
    );
  }

  private async handleHit(playerId: string, message: Extract<ClientMessage, { type: 'hit' }>): Promise<void> {
    if (!this.gameInProgress) return;

    const victim = this.players.get(message.victimId);
    const shooter = this.players.get(playerId);
    const result = applyHit(this.players, playerId, message.victimId, message.damage);
    if (!result.applied || !victim || !shooter) return;

    this.persistPlayer(victim);
    this.persistPlayer(shooter);

    this.broadcast({ type: 'playerDamaged', id: victim.id, hp: victim.hp, attackerId: playerId });

    if (!result.killed) return;

    this.broadcast({
      type: 'playerDied',
      victimId: victim.id,
      killerId: shooter.id,
      killerName: shooter.name,
      victimName: victim.name,
    });
    this.broadcastScoreboard();

    if (result.roundWon) {
      this.gameInProgress = false;
      this.persistGameInProgress();
      this.broadcast({ type: 'gameWon', winnerId: shooter.id, winnerName: shooter.name, kills: shooter.kills });
      await this.schedulePendingEvent('reset', null, Date.now() + WIN_DISPLAY_MS);
      return;
    }

    await this.schedulePendingEvent('respawn', victim.id, Date.now() + RESPAWN_DELAY_MS);
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
    const now = Date.now();
    const events = this.ctx.storage.sql
      .exec<PendingEventRow>('SELECT id, type, player_id, due_at FROM pending_events WHERE due_at <= ? ORDER BY due_at', now)
      .toArray();

    for (const event of events) {
      this.ctx.storage.sql.exec('DELETE FROM pending_events WHERE id = ?', event.id);

      if (event.type === 'respawn' && event.player_id) {
        const player = this.players.get(event.player_id);
        if (!player) continue;

        respawnPlayer(player, createRandomCitySpawn());
        this.persistPlayer(player);
        this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
      }

      if (event.type === 'reset') {
        this.gameInProgress = true;
        this.persistGameInProgress();

        const resetPlayers = resetRound(this.players.values(), () => createRandomCitySpawn());
        for (const player of resetPlayers) {
          this.persistPlayer(player);
          this.broadcast({ type: 'playerRespawn', id: player.id, x: player.x, y: player.y, z: player.z, hp: player.hp });
        }
        this.broadcast({ type: 'gameReset' });
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
    this.broadcast({ type: 'playerLeft', id: playerId });
    this.broadcastScoreboard();
  }

  private persistPlayer(player: PlayerData): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO players (id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      player.id,
      JSON.stringify(player),
      Date.now(),
    );
  }

  private persistGameInProgress(): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO room_state (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      GAME_IN_PROGRESS_KEY,
      String(this.gameInProgress),
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
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(ws);
      if (exceptPlayerId && attachment.playerId === exceptPlayerId) continue;
      this.send(ws, message);
    }
  }

  private getAttachment(ws: WebSocket): SocketAttachment {
    return (ws.deserializeAttachment() as SocketAttachment | undefined) ?? {};
  }

  private getPlayerId(ws: WebSocket): string | undefined {
    return this.getAttachment(ws).playerId;
  }
}
