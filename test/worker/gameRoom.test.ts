import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONNECTIONS, MAX_PLAYERS, PROTOCOL_VERSION, DEFAULT_ROOM_NAME, type PlayerData, type ServerMessage } from '../../src/shared/networkProtocol';
import { WORLD_LAYOUT_VERSION } from '../../src/shared/worldSpec';
import { CHECKPOINT_MS, GameRoom, STALE_PLAYER_MS } from '../../src/worker/GameRoom';

const appearance = {
  hatType: 'fedora' as const,
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

function parseEvent(event: MessageEvent): ServerMessage {
  const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
  return JSON.parse(raw) as ServerMessage;
}

function collect(ws: WebSocket) {
  const messages: ServerMessage[] = [];
  ws.addEventListener('message', (event) => {
    messages.push(parseEvent(event as MessageEvent));
  });
  return {
    messages,
    async waitFor<T extends ServerMessage['type']>(
      type: T,
      match: ((message: Extract<ServerMessage, { type: T }>) => boolean) | number = () => true,
      timeoutMs = 3_000,
    ): Promise<Extract<ServerMessage, { type: T }>> {
      const predicate = typeof match === 'number' ? () => true : match;
      const budget = typeof match === 'number' ? match : timeoutMs;
      const started = Date.now();
      while (Date.now() - started < budget) {
        const index = messages.findIndex(
          (message) => message.type === type && predicate(message as Extract<ServerMessage, { type: T }>),
        );
        if (index !== -1) {
          return messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`timed out waiting for ${type}: ${messages.map((message) => message.type).join(', ') || 'none'}`);
    },
  };
}

const openSockets = new Set<WebSocket>();
afterEach(async () => {
  await Promise.all([...openSockets].map(ws => new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('WebSocket test cleanup timed out')), 2_000);
    ws.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'test cleanup');
  })));
  openSockets.clear();
});

async function openClient(room: string) {
  const response = await SELF.fetch(`https://rat-detective.test/ws?room=${room}`, {
    headers: { Upgrade: 'websocket' },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  expect(ws).toBeTruthy();
  ws!.accept();
  openSockets.add(ws!);
  return { ws: ws!, inbox: collect(ws!) };
}

function joinPayload(name: string, protocolVersion = PROTOCOL_VERSION) {
  return JSON.stringify({ type: 'join', protocolVersion, name, appearance });
}

describe('GameRoom websockets', () => {
  it('sends an atomic welcome snapshot with protocol, world, round, and currentPlayers', async () => {
    const room = `snap-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Alpha'));
    const welcome = await first.inbox.waitFor('welcome');
    await first.inbox.waitFor('currentPlayers');

    expect(welcome.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(welcome.world.version).toBe(WORLD_LAYOUT_VERSION);
    expect(welcome.round.phase).toBe('playing');
    expect(welcome.players[welcome.id]?.name).toBe('Alpha');
    expect(welcome.player.hp).toBe(3);
    expect(typeof welcome.serverTime).toBe('number');

    const second = await openClient(room);
    second.ws.send(joinPayload('Beta'));
    const secondWelcome = await second.inbox.waitFor('welcome');
    expect(secondWelcome.players[welcome.id]?.name).toBe('Alpha');
    expect((await first.inbox.waitFor('playerJoined')).player.id).toBe(secondWelcome.id);
  });

  it('rejects an unsupported join protocol version with a visible error', async () => {
    const client = await openClient(`ver-${crypto.randomUUID()}`);
    client.ws.send(joinPayload('Old Rat', 0));
    const error = await client.inbox.waitFor('error');
    expect(error.message).toMatch(/protocol version/i);
  });

  it('relays shot descriptors and restores a dead player through the alarm', async () => {
    const room = `combat-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Shooter'));
    const shooter = await first.inbox.waitFor('welcome');

    const second = await openClient(room);
    second.ws.send(joinPayload('Victim'));
    const victim = await second.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');

    first.ws.send(
      JSON.stringify({
        type: 'shoot',
        shotId: 'shot-1',
        origin: { x: shooter.player.x, y: shooter.player.y + 1.45, z: shooter.player.z },
        direction: { x: 0, y: 0, z: 1 },
      }),
    );
    const shot = await second.inbox.waitFor('playerShot');
    expect(shot).toMatchObject({ shooterId: shooter.id, shotId: 'shot-1', direction: { x: 0, y: 0, z: 1 } });
    expect('target' in shot).toBe(false);

    first.ws.send(JSON.stringify({ type: 'hit', victimId: victim.id, damage: 3 }));
    const died = await second.inbox.waitFor('playerDied');
    expect(died.victimId).toBe(victim.id);
    expect(died.respawnAt).toBeGreaterThan(Date.now() - 1_000);

    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec('UPDATE pending_events SET due_at = 0');
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const respawn = await second.inbox.waitFor('playerRespawn');
    expect(respawn).toMatchObject({ id: victim.id, hp: 3 });
    expect(Number.isFinite(respawn.x)).toBe(true);
  });

  it('pins every dead player to resetAt and cancels pending respawns on a winning hit', async () => {
    const room = `win-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Champ'));
    const champ = await first.inbox.waitFor('welcome');
    const earlyClient = await openClient(room);
    earlyClient.ws.send(joinPayload('Early'));
    const early = await earlyClient.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');
    const lostClient = await openClient(room);
    lostClient.ws.send(joinPayload('Lost'));
    const lost = await lostClient.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');

    first.ws.send(JSON.stringify({ type: 'hit', victimId: early.id, damage: 3 }));
    const earlyDeath = await earlyClient.inbox.waitFor('playerDied');
    expect(earlyDeath.respawnAt).toBeGreaterThan(Date.now());

    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const players = (instance as unknown as { players: Map<string, { kills: number }> }).players;
      const shooter = players.get(champ.id);
      if (shooter) shooter.kills = 19;
    });

    first.ws.send(JSON.stringify({ type: 'hit', victimId: lost.id, damage: 3 }));
    const died = await lostClient.inbox.waitFor('playerDied', (message) => message.victimId === lost.id);
    const won = await lostClient.inbox.waitFor('gameWon');
    expect(died.respawnAt).toBe(won.resetAt);
    expect(earlyDeath.respawnAt).not.toBe(won.resetAt);

    await runInDurableObject(stub, (_instance, state) => {
      const pending = state.storage.sql
        .exec<{ type: string; count: number }>('SELECT type, COUNT(*) as count FROM pending_events GROUP BY type')
        .toArray();
      expect(pending).toEqual([{ type: 'reset', count: 1 }]);
      const stored = state.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE id = ?', early.id).one();
      expect(JSON.parse(stored.data).respawnAt).toBe(won.resetAt);
      state.storage.sql.exec('UPDATE pending_events SET due_at = 0');
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const reset = await lostClient.inbox.waitFor('gameReset');
    expect(reset.round.phase).toBe('playing');
  });

  it('recovers a 2.5s movement checkpoint without a forced persist', async () => {
    const room = `check-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Walker'));
    const welcome = await first.inbox.waitFor('welcome');
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const roomInstance = instance as unknown as {
        lastCheckpointAt: Map<string, number>;
        handleMovement: (playerId: string, message: unknown) => void;
      };
      roomInstance.lastCheckpointAt.set(welcome.id, Date.now() - CHECKPOINT_MS - 10);
      roomInstance.handleMovement(welcome.id, {
        type: 'updateMovement',
        position: { x: 12, y: 2, z: -8 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        meshRotation: { x: 0, y: 0, z: 0, w: 1 },
      });
    });

    await runInDurableObject(stub, (_instance, state) => {
      const stored = JSON.parse(
        state.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE id = ?', welcome.id).one().data,
      ) as PlayerData;
      expect(stored.x).toBe(12);
      expect(stored.z).toBe(-8);
    });

    await evictDurableObject(stub, { webSockets: 'hibernate' });
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    const lateWelcome = await late.inbox.waitFor('welcome');
    expect(lateWelcome.world.seed).toBe(welcome.world.seed);
    expect(lateWelcome.players[welcome.id]?.x).toBe(12);
    expect(lateWelcome.players[welcome.id]?.z).toBe(-8);
  });

  it('keeps an attached player whose last_active_at is older than two minutes', async () => {
    const room = `stale-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Sleeper'));
    const welcome = await first.inbox.waitFor('welcome');
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const roomInstance = instance as unknown as {
        lastCheckpointAt: Map<string, number>;
        handleMovement: (playerId: string, message: unknown) => void;
      };
      roomInstance.lastCheckpointAt.set(welcome.id, Date.now() - CHECKPOINT_MS - 10);
      roomInstance.handleMovement(welcome.id, {
        type: 'updateMovement',
        position: { x: 12, y: 2, z: -8 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        meshRotation: { x: 0, y: 0, z: 0, w: 1 },
      });
    });

    await runInDurableObject(stub, (_instance, state) => {
      const aged = Date.now() - STALE_PLAYER_MS - 5_000;
      state.storage.sql.exec('UPDATE players SET last_active_at = ?, updated_at = ? WHERE id = ?', aged, aged, welcome.id);
    });

    await evictDurableObject(stub, { webSockets: 'hibernate' });
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    const lateWelcome = await late.inbox.waitFor('welcome');
    expect(lateWelcome.players[welcome.id]?.name).toBe('Sleeper');
    expect(lateWelcome.players[welcome.id]?.x).toBe(12);
  });

  it('clamps envelope motion and tells every client including the mover', async () => {
    const room = `edge-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Runner'));
    const welcome = await first.inbox.waitFor('welcome');
    const second = await openClient(room);
    second.ws.send(joinPayload('Witness'));
    await second.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');

    first.ws.send(
      JSON.stringify({
        type: 'updateMovement',
        position: { x: 2500, y: 2, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        meshRotation: { x: 0, y: 0, z: 0, w: 1 },
      }),
    );
    const selfCorrection = await first.inbox.waitFor('playerCorrected');
    const peerCorrection = await second.inbox.waitFor('playerCorrected');
    expect(selfCorrection.player).toMatchObject({ id: welcome.id, x: 2000, z: 0 });
    expect(peerCorrection.player.x).toBe(2000);
  });

  it('rejects a 33rd websocket before accept and a 25th joined player after join', async () => {
    const room = `full-${crypto.randomUUID()}`;
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const roomInstance = instance as unknown as {
        players: Map<string, PlayerData>;
        lastActiveAt: Map<string, number>;
      };
      for (let i = 0; i < MAX_PLAYERS; i++) {
        const id = `seed-${i}`;
        roomInstance.players.set(id, {
          id,
          name: `Seed ${i}`,
          x: 0,
          y: 2,
          z: 0,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          meshQx: 0,
          meshQy: 0,
          meshQz: 0,
          meshQw: 1,
          hp: 3,
          kills: 0,
          deaths: 0,
          hatType: 'fedora',
          hatColor: 1,
          furColor: 1,
          coatColor: 1,
        });
        roomInstance.lastActiveAt.set(id, Date.now());
      }
    });
    const overflow = await openClient(room);
    overflow.ws.send(joinPayload('Too Many'));
    expect((await overflow.inbox.waitFor('error')).message).toMatch(/full/i);

    const sockets: WebSocket[] = [];
    const crowded = `conn-${crypto.randomUUID()}`;
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const client = await openClient(crowded);
      sockets.push(client.ws);
    }
    const blocked = await SELF.fetch(`https://rat-detective.test/ws?room=${crowded}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(blocked.status).toBe(503);
    for (const socket of sockets) socket.close(1000, 'done');
  });

  it('adds last_active_at onto a legacy players table', async () => {
    const room = `legacy-${crypto.randomUUID()}`;
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom, state) => {
      state.storage.sql.exec('DROP TABLE IF EXISTS players');
      state.storage.sql.exec('DROP TABLE IF EXISTS _sql_schema_migrations');
      state.storage.sql.exec(`
        CREATE TABLE players (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      state.storage.sql.exec(
        'INSERT INTO players (id, data, updated_at) VALUES (?, ?, ?)',
        'legacy-rat',
        JSON.stringify({
          id: 'legacy-rat',
          name: 'Legacy',
          x: 4,
          y: 2,
          z: 5,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          meshQx: 0,
          meshQy: 0,
          meshQz: 0,
          meshQw: 1,
          hp: 3,
          kills: 0,
          deaths: 0,
          hatType: 'fedora',
          hatColor: 1,
          furColor: 1,
          coatColor: 1,
        }),
        Date.now(),
      );
      (instance as unknown as { migrate: () => void }).migrate();
      const columns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(players)')
        .toArray()
        .map((row) => row.name);
      expect(columns).toContain('last_active_at');
    });
  });

  it('checkpoints actual 25 Hz WebSocket movement and preserves it through a heartbeat', async () => {
    const room = `traffic-${crypto.randomUUID()}`;
    const client = await openClient(room);
    const observers = await Promise.all([openClient(room), openClient(room), openClient(room)]);
    client.ws.send(joinPayload('Mover'));
    observers.forEach((watcher, i) => watcher.ws.send(joinPayload(`Observer ${i}`)));
    const welcome = await client.inbox.waitFor('welcome');
    await Promise.all(observers.map(watcher => watcher.inbox.waitFor('welcome')));
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, async (instance: GameRoom, state) => {
      const internal = instance as unknown as {
        clock: () => number; broadcasts: number; lastCheckpointAt: Map<string, number>;
      };
      const originalClock = internal.clock;
      const origin = Date.now();
      let now = origin;
      internal.clock = () => now;
      internal.lastCheckpointAt.set(welcome.id, origin);
      const socket = state.getWebSockets().find(ws =>
        (ws.deserializeAttachment() as { playerId?: string }).playerId === welcome.id)!;
      const before = internal.broadcasts;
      const stringify = vi.spyOn(JSON, 'stringify');
      let changedCheckpoints = 0;
      let previousStamp = state.storage.sql.exec<{ updated_at: number }>('SELECT updated_at FROM players WHERE id = ?', welcome.id).one().updated_at;
      try {
        for (let tick = 1; tick <= 150; tick++) {
          now = origin + tick * 40;
          await instance.webSocketMessage(socket, JSON.stringify({ type: 'updateMovement',
            position: { x: tick / 10, y: 2, z: 15 },
            rotation: { x: 0, y: 0, z: 0, w: 1 }, meshRotation: { x: 0, y: 0, z: 0, w: 1 } }));
          const row = state.storage.sql.exec<{ updated_at: number; data: string }>('SELECT updated_at, data FROM players WHERE id = ?', welcome.id).one();
          if (row.updated_at !== previousStamp) {
            changedCheckpoints++;
            expect((JSON.parse(row.data) as PlayerData).x).toBe(tick / 10);
            previousStamp = row.updated_at;
          }
        }
        expect(changedCheckpoints).toBe(2); // 2.52s and 5.04s; no forced lifecycle writes in this window.
        expect(internal.broadcasts - before).toBe(150);
        expect(stringify.mock.calls.filter(([value]) => value?.type === 'playerMoved')).toHaveLength(150);
        const row = state.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE id = ?', welcome.id).one();
        expect((JSON.parse(row.data) as PlayerData).x).toBe(12.6);
        now = origin + 8_000;
        await instance.webSocketMessage(socket, JSON.stringify({ type: 'ping', sentAt: now }));
        const heartbeatRow = state.storage.sql.exec<{ data: string; last_active_at: number }>('SELECT data, last_active_at FROM players WHERE id = ?', welcome.id).one();
        expect((JSON.parse(heartbeatRow.data) as PlayerData).x).toBe(15);
        expect(heartbeatRow.last_active_at).toBe(now);
      } finally { stringify.mockRestore(); internal.clock = originalClock; }
    });
    await evictDurableObject(stub);
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    const snapshot = await late.inbox.waitFor('welcome');
    expect(snapshot.players[welcome.id].x).toBe(15);
    for (const watcher of observers) {
      await watcher.inbox.waitFor('playerMoved', message => message.player.x === 15);
      expect(watcher.inbox.messages.filter(message => message.type === 'playerMoved')).toHaveLength(149);
      watcher.ws.close(1000, 'done');
    }
    client.ws.close(1000, 'done'); late.ws.close(1000, 'done');
  });

  it('lists attached public-room names and scores on GET /status', async () => {
    const first = await openClient(DEFAULT_ROOM_NAME);
    first.ws.send(joinPayload('One'));
    await first.inbox.waitFor('welcome');

    const one = await SELF.fetch('https://rat-detective.test/status');
    const oneBoard = (await one.json()) as {
      room: string;
      players: number;
      phase: string;
      startedAt: number;
      scores: Array<{ name: string; kills: number; deaths: number }>;
    };
    expect(oneBoard).toEqual({
      room: 'public',
      players: 1,
      phase: 'playing',
      startedAt: expect.any(Number),
      scores: [{ name: 'One', kills: 0, deaths: 0 }],
    });

    const second = await openClient(DEFAULT_ROOM_NAME);
    second.ws.send(joinPayload('Two'));
    await second.inbox.waitFor('welcome');

    const two = await SELF.fetch('https://rat-detective.test/status');
    await expect(two.json()).resolves.toEqual({
      room: 'public',
      players: 2,
      phase: 'playing',
      startedAt: oneBoard.startedAt,
      scores: [
        { name: 'One', kills: 0, deaths: 0 },
        { name: 'Two', kills: 0, deaths: 0 },
      ],
    });

    first.ws.close(1000, 'done');
    second.ws.close(1000, 'done');
  });
});
