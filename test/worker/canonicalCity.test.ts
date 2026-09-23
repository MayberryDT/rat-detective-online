import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { RECONNECT_GRACE_MS } from '../../src/shared/reconnect';
import { createAssignment } from '../../src/shared/assignments';
import { DEFAULT_ROOM_NAME, PROTOCOL_VERSION, WIN_DISPLAY_MS, type ServerMessage } from '../../src/shared/networkProtocol';
import { BOT_HEARTBEAT_MS, type GameRoom } from '../../src/worker/GameRoom';
import { readSocketMessage } from './socketMessages';

const appearance = { hatType: 'fedora' as const, hatColor: 1, furColor: 2, coatColor: 3 };
const rooms = new Set<string>();
const sockets: WebSocket[] = [];

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 4_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('condition timed out');
}

async function close(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise<void>(resolve => {
    ws.addEventListener('close', () => resolve(), { once: true });
    ws.close(1000, 'test complete');
  });
}

async function join(name: string, roomName: string, pool = roomName): Promise<{
  ws: WebSocket;
  welcome: Extract<ServerMessage, { type: 'welcome' }>;
}> {
  rooms.add(roomName);
  const stub = env.GAME_ROOM.getByName(roomName);
  await stub.enableMatchmaking(roomName, pool);
  const response = await stub.fetch(new Request('https://game.test/ws', { headers: { Upgrade: 'websocket' } }));
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept();
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.addEventListener('message', event => {
    const message = readSocketMessage(ws, event.data);
    if (message) messages.push(message);
  });
  ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name, appearance }));
  await until(() => messages.some(message => message.type === 'welcome'));
  const welcome = messages.find((message): message is Extract<ServerMessage, { type: 'welcome' }> =>
    message.type === 'welcome')!;
  return { ws, welcome };
}

async function companionRoom(name = DEFAULT_ROOM_NAME) {
  const status = await env.MATCHMAKER.getByName(DEFAULT_ROOM_NAME).companionStatus(null, 16);
  return status.rooms.find(room => room.room === name);
}

function stopTimer(instance: GameRoom): void {
  const game = instance as unknown as { chaosTimer: ReturnType<typeof setInterval> | null };
  if (game.chaosTimer) clearInterval(game.chaosTimer);
  game.chaosTimer = null;
}

afterEach(async () => {
  for (const ws of sockets.splice(0)) await close(ws);
  for (const name of rooms) {
    await runInDurableObject(env.GAME_ROOM.getByName(name), async (instance: GameRoom, ctx) => {
      const game = instance as unknown as {
        chaosTimer: ReturnType<typeof setInterval> | null;
        serverBots: { dispose(): void } | null;
        persistentBots: boolean;
        matchRoom: string | null;
        refillAt: number;
        companionActive: boolean;
        players: Map<string, unknown>;
        botRoster: unknown[];
        sessions: Map<string, unknown>;
        clock: () => number;
      };
      stopTimer(instance);
      game.serverBots?.dispose();
      game.serverBots = null;
      game.persistentBots = false;
      game.matchRoom = null;
      game.refillAt = 0;
      game.companionActive = false;
      game.players.clear();
      game.botRoster = [];
      game.sessions.clear();
      game.clock = () => Date.now();
      ctx.storage.sql.exec('DELETE FROM players');
      ctx.storage.sql.exec('DELETE FROM reconnect_sessions');
      ctx.storage.sql.exec('DELETE FROM pending_events');
      ctx.storage.sql.exec("DELETE FROM room_state WHERE key IN ('match-room-v1','match-pool-v1','persistent-bots-v1','persistent-bot-roster-v1','round-bot-count-v1','companion-active-v1')");
      await ctx.storage.deleteAlarm();
    });
  }
  rooms.clear();
});

describe('canonical public city without humans', () => {
  it('starts a six-to-nine-bot match and publishes roster, mode and scores from /status', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const board = await (await SELF.fetch('https://rat-detective.test/status')).json() as {
      room: string; players: number; bots: number; phase: string;
      scores: Array<{ name: string; kills: number; deaths: number }>;
    };
    expect(board.room).toBe(DEFAULT_ROOM_NAME);
    expect(board.phase).toBe('playing');
    expect(board.bots).toBeGreaterThanOrEqual(6);
    expect(board.bots).toBeLessThanOrEqual(9);
    expect(board.players).toBe(board.bots);
    expect(board.scores).toHaveLength(board.bots);
    expect(new Set(board.scores.map(score => score.name)).size).toBe(board.bots);

    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    expect(await stub.occupiedSlots()).toBe(0);
    const before = await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as {
        chaosTimer: ReturnType<typeof setInterval> | null;
        serverBots: object | null;
        chaos: { snapshot(full?: boolean): { time: number }; assignmentState?: { id: string; phase: string } };
        players: Map<string, { x: number; y: number; z: number }>;
      };
      expect(game.chaosTimer).not.toBeNull();
      expect(game.serverBots).not.toBeNull();
      expect(game.chaos.assignmentState).toMatchObject({ id: expect.any(String), phase: expect.any(String) });
      return {
        time: game.chaos.snapshot(false).time,
        positions: [...game.players.values()].map(player => [player.x, player.y, player.z] as const),
      };
    });

    await new Promise(resolve => setTimeout(resolve, 400));
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as {
        chaos: { snapshot(full?: boolean): { time: number } };
        players: Map<string, { x: number; y: number; z: number }>;
      };
      expect(game.chaos.snapshot(false).time).toBeGreaterThan(before.time);
      expect([...game.players.values()].some((player, index) =>
        player.x !== before.positions[index][0] ||
        player.y !== before.positions[index][1] ||
        player.z !== before.positions[index][2])).toBe(true);
    });

    await until(async () => {
      const city = await companionRoom();
      return !!city && city.humans === 0 && city.players === board.bots && city.scores.length === board.bots && !!city.assignment.id;
    });
    const city = await companionRoom();
    expect(city).toMatchObject({
      room: DEFAULT_ROOM_NAME, humans: 0, players: board.bots, holderName: null,
    });
    expect(city!.scores.every(score => score.kills === 0 && score.deaths === 0)).toBe(true);
  });

  it('keeps the match and companion feed after the last reserved human expires', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const first = await join('First Rat', DEFAULT_ROOM_NAME);
    const second = await join('Second Rat', DEFAULT_ROOM_NAME);
    await until(async () => (await companionRoom())?.humans === 2);
    await close(first.ws);
    await close(second.ws);

    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as {
        clock: () => number;
        alarm(): Promise<void>;
        publishCompanion(force?: boolean): void;
      };
      const now = Date.now();
      game.clock = () => now + RECONNECT_GRACE_MS + 1;
      await game.alarm();
      game.clock = () => Date.now();
      game.publishCompanion(true);
    });

    const after = await stub.status();
    await until(async () => {
      const city = await companionRoom();
      return city?.humans === 0 && city.players === after.bots && city.scores.length === after.bots;
    });
    expect(await stub.occupiedSlots()).toBe(0);
    expect(after.phase).toBe('playing');
    expect(after.bots).toBeGreaterThanOrEqual(6);
    expect(after.bots).toBeLessThanOrEqual(9);
    expect(after.players).toBe(after.bots);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as {
        chaosTimer: ReturnType<typeof setInterval> | null;
        serverBots: object | null;
        chaos: { assignmentState?: { id: string } };
      };
      expect(game.chaosTimer).not.toBeNull();
      expect(game.serverBots).not.toBeNull();
      expect(game.chaos.assignmentState?.id).toEqual(expect.any(String));
    });
  });

  it('restores the zero-human city through eviction and the recovery alarm', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    await env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME).enableMatchmaking(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    const before = await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as {
        botRoster: Array<{ id: string; name: string }>;
        chaos: { assignmentState?: { id: string; roundId: string } };
        world: { seed: number };
      };
      stopTimer(instance);
      expect(game.botRoster.length).toBeGreaterThanOrEqual(6);
      expect(game.botRoster.length).toBeLessThanOrEqual(9);
      expect(await ctx.storage.getAlarm()).toBeGreaterThan(Date.now());
      expect(await ctx.storage.getAlarm()).toBeLessThanOrEqual(Date.now() + BOT_HEARTBEAT_MS + RECONNECT_GRACE_MS);
      return {
        roster: game.botRoster.map(bot => bot.id),
        seed: game.world.seed,
        assignmentId: game.chaos.assignmentState?.id,
        roundId: game.chaos.assignmentState?.roundId,
      };
    });

    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as {
        chaosTimer: ReturnType<typeof setInterval> | null;
        serverBots: object | null;
        botRoster: Array<{ id: string }>;
        chaos: { assignmentState?: { id: string; roundId: string } };
        world: { seed: number };
        companionActive: boolean;
      };
      expect(game.world.seed).toBe(before.seed);
      expect(game.botRoster.map(bot => bot.id)).toEqual(before.roster);
      expect(game.chaosTimer).not.toBeNull();
      expect(game.serverBots).not.toBeNull();
      expect(game.chaos.assignmentState).toMatchObject({
        id: before.assignmentId, roundId: before.roundId,
      });
      expect(game.companionActive).toBe(true);
      expect(await ctx.storage.getAlarm()).toBeGreaterThan(Date.now());
    });
    const restored = await stub.status();
    expect(restored.bots).toBe(before.roster.length);
    expect(restored.players).toBe(before.roster.length);
    await until(async () => (await companionRoom())?.players === before.roster.length && (await companionRoom())?.humans === 0);
  });

  it('still sleeps and retires an empty public overflow room', async () => {
    const overflow = `${DEFAULT_ROOM_NAME}-${crypto.randomUUID()}`;
    rooms.add(overflow);
    const joined = await join('Overflow Rat', overflow, DEFAULT_ROOM_NAME);
    expect(joined.welcome.matchRoom).toBe(overflow);
    const stub = env.GAME_ROOM.getByName(overflow);
    const occupied = await stub.status();
    expect(occupied.bots).toBeGreaterThanOrEqual(6);
    expect(occupied.bots).toBeLessThanOrEqual(9);
    expect(occupied.players).toBe(occupied.bots + 1);
    await until(async () => (await companionRoom(overflow))?.humans === 1);

    await close(joined.ws);
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as { clock: () => number; alarm(): Promise<void> };
      game.clock = () => Date.now() + RECONNECT_GRACE_MS + 1;
      await game.alarm();
      expect((instance as unknown as { botRoster: unknown[] }).botRoster).toHaveLength(0);
      expect((instance as unknown as { chaosTimer: object | null }).chaosTimer).toBeNull();
      expect((instance as unknown as { serverBots: object | null }).serverBots).toBeNull();
    });
    expect(await stub.status()).toMatchObject({ players: 0, bots: 0 });
    await until(async () => await companionRoom(overflow) === undefined);
  });

  it('keeps a bounded future wake after an injected alarm failure, then recovers', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as {
        reconcileLiveness(): void;
        botRoster: Array<{ id: string }>;
        chaosTimer: ReturnType<typeof setInterval> | null;
        serverBots: object | null;
      };
      stopTimer(instance);
      const overdue = Date.now() - 1_000;
      const soon = Date.now() + 3_500;
      ctx.storage.sql.exec(
        "INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, 'respawn', NULL, ?), (?, 'reset', NULL, ?)",
        'overdue-fault', overdue, 'soon-fault', soon,
      );
      const original = game.reconcileLiveness.bind(game);
      game.reconcileLiveness = () => { throw new Error('injected alarm fault'); };
      try {
        await expect(instance.alarm()).rejects.toThrow('injected alarm fault');
        const wake = await ctx.storage.getAlarm();
        expect(wake).toBe(soon);
        expect(wake).toBeGreaterThan(Date.now());
        expect(wake).toBeLessThanOrEqual(Date.now() + BOT_HEARTBEAT_MS);
        expect(ctx.storage.sql.exec<{ id: string }>('SELECT id FROM pending_events ORDER BY id').toArray().map(row => row.id))
          .toEqual(['overdue-fault', 'soon-fault']);
      } finally {
        game.reconcileLiveness = original;
      }
      await instance.alarm();
      expect(game.botRoster.length).toBeGreaterThanOrEqual(6);
      expect(game.botRoster.length).toBeLessThanOrEqual(9);
      expect(game.chaosTimer).not.toBeNull();
      expect(game.serverBots).not.toBeNull();
      const recovered = await ctx.storage.getAlarm();
      expect(recovered).toBeGreaterThan(Date.now());
      expect(recovered).not.toBe(overdue);
    });
  });

  it('preserves an exact sooner stored alarm across constructor hydration', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    const deadline = await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      stopTimer(instance);
      const soon = Date.now() + 4_250;
      await ctx.storage.setAlarm(soon);
      expect(await ctx.storage.getAlarm()).toBe(soon);
      return soon;
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as {
        botRoster: Array<{ id: string }>;
        chaosTimer: ReturnType<typeof setInterval> | null;
      };
      expect(await ctx.storage.getAlarm()).toBe(deadline);
      expect(game.botRoster.length).toBeGreaterThanOrEqual(6);
      expect(game.botRoster.length).toBeLessThanOrEqual(9);
      expect(game.chaosTimer).not.toBeNull();
    });
  });

  it('does not postpone an already-due stored alarm during constructor scheduling', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as {
        scheduleNextAlarm(opts?: { preserveExisting?: boolean }): Promise<void>;
      };
      stopTimer(instance);
      await ctx.storage.setAlarm(Date.now() - 1);
      const stored = await ctx.storage.getAlarm();
      expect(stored).not.toBeNull();
      await game.scheduleNextAlarm({ preserveExisting: true });
      expect(await ctx.storage.getAlarm()).toBe(stored);
      expect(stored!).toBeLessThan(Date.now() + 1_000);
    });
  });

  it('leaves overflow retry alarm and pending events unchanged after an injected failure', async () => {
    const overflow = `${DEFAULT_ROOM_NAME}-${crypto.randomUUID()}`;
    rooms.add(overflow);
    const stub = env.GAME_ROOM.getByName(overflow);
    await stub.enableMatchmaking(overflow, DEFAULT_ROOM_NAME);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as { reconcileLiveness(): void };
      stopTimer(instance);
      const overdue = Date.now() - 1_000;
      ctx.storage.sql.exec(
        "INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, 'respawn', NULL, ?), (?, 'reset', NULL, ?)",
        'overflow-overdue', overdue, 'overflow-reset', overdue + 1,
      );
      await ctx.storage.setAlarm(Date.now() - 1);
      const retry = await ctx.storage.getAlarm();
      expect(retry).not.toBeNull();
      const original = game.reconcileLiveness.bind(game);
      game.reconcileLiveness = () => { throw new Error('injected overflow fault'); };
      try {
        await expect(instance.alarm()).rejects.toThrow('injected overflow fault');
        expect(await ctx.storage.getAlarm()).toBe(retry);
        expect(ctx.storage.sql.exec<{ id: string; due_at: number }>(
          'SELECT id, due_at FROM pending_events ORDER BY id').toArray())
          .toEqual([
            { id: 'overflow-overdue', due_at: overdue },
            { id: 'overflow-reset', due_at: overdue + 1 },
          ]);
      } finally {
        game.reconcileLiveness = original;
      }
    });
  });

  it('deletes an unneeded overflow alarm during constructor hydration', async () => {
    const overflow = `${DEFAULT_ROOM_NAME}-${crypto.randomUUID()}`;
    rooms.add(overflow);
    const stub = env.GAME_ROOM.getByName(overflow);
    await stub.enableMatchmaking(overflow, DEFAULT_ROOM_NAME);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      stopTimer(instance);
      await ctx.storage.setAlarm(Date.now() + 12_000);
      expect(await ctx.storage.getAlarm()).toBeGreaterThan(Date.now());
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, async (_instance: GameRoom, ctx) => {
      expect(await ctx.storage.getAlarm()).toBeNull();
    });
  });

  it('rotates the ordinary playlist and eight fresh bot names after a zero-human win', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    const after = await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as {
        clock: () => number;
        chaosTimer: ReturnType<typeof setInterval> | null;
        botRoster: Array<{ id: string; name: string }>;
        players: Map<string, { id: string; name: string; x: number; y: number; z: number; kills: number }>;
        assignmentRotation: { remaining: string[]; last?: string; forced?: string };
        chaos: {
          assignmentState?: { id: string; roundId: string };
          caseHolderId: string | null;
          caseBody: { position: { set(x: number, y: number, z: number): void }; velocity: { setZero(): void } };
          setAssignment(state: ReturnType<typeof createAssignment>): void;
          step(dt: number, at: number): void;
        };
        finishAssignment(): void;
        publishCompanion(force?: boolean): void;
      };
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null;
      const previousNames = game.botRoster.map(bot => bot.name);
      const previousId = game.chaos.assignmentState!.id;
      expect(game.assignmentRotation.forced).toBeUndefined();
      const nextId = previousId === 'jurisdiction' ? 'excessive-force' : 'jurisdiction';
      game.assignmentRotation = {
        remaining: [nextId, 'chain-of-custody', 'closing-time'].filter(id => id !== previousId),
        last: previousId,
      };
      const started = Date.now();
      game.clock = () => started;
      const assignment = createAssignment('closing-time', started, 'city-win');
      assignment.phase = 'active';
      assignment.liveAt = started;
      assignment.remainingMs = 1;
      game.chaos.setAssignment(assignment);
      const winner = game.players.get(game.botRoster[0].id)!;
      game.chaos.caseBody.position.set(winner.x, winner.y + .8, winner.z);
      game.chaos.caseBody.velocity.setZero();
      game.chaos.step(0, started);
      expect(game.chaos.caseHolderId).toBe(winner.id);
      game.chaos.step(.001, started + 1);
      game.finishAssignment();
      game.clock = () => started + WIN_DISPLAY_MS;
      await instance.alarm();
      expect(game.botRoster.length).toBeGreaterThanOrEqual(6);
      expect(game.botRoster.length).toBeLessThanOrEqual(9);
      expect(new Set(game.botRoster.map(bot => bot.name)).size).toBe(game.botRoster.length);
      expect(game.botRoster.slice(0, Math.min(previousNames.length, game.botRoster.length)).map(bot => bot.name))
        .toEqual(previousNames.slice(0, Math.min(previousNames.length, game.botRoster.length)));
      expect(game.assignmentRotation.forced).toBeUndefined();
      expect(game.chaos.assignmentState).toMatchObject({ id: nextId });
      expect(game.chaos.assignmentState!.id).not.toBe(previousId);
      expect(game.chaos.assignmentState!.roundId).not.toBe('city-win');
      game.clock = () => Date.now();
      game.publishCompanion(true);
      return { mode: game.chaos.assignmentState!.id, names: game.botRoster.map(bot => bot.name) };
    });
    await until(async () => {
      const city = await companionRoom();
      return city?.assignment.id === after.mode && city.players === after.names.length && city.humans === 0 &&
        after.names.every(name => city.scores.some(score => score.name === name));
    });
  });

  it('publishes zero-human score, objective and K/D changes through the real projection cadence', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    const published = await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as {
        clock: () => number;
        chaosTimer: ReturnType<typeof setInterval> | null;
        companionRevision: number;
        botRoster: Array<{ id: string; name: string }>;
        players: Map<string, { id: string; name: string; kills: number; deaths: number }>;
        chaos: {
          assignmentState?: ReturnType<typeof createAssignment>;
          setAssignment(state: ReturnType<typeof createAssignment>): void;
        };
        publishCompanion(force?: boolean): void;
      };
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null;
      const scorer = game.players.get(game.botRoster[0].id)!;
      const started = Date.now();
      let now = started;
      const assignment = createAssignment('jurisdiction', started, 'city-scores', () => 0);
      assignment.phase = 'active';
      game.chaos.setAssignment(assignment);
      const live = game.chaos.assignmentState!;
      scorer.kills = 4;
      scorer.deaths = 1;
      game.clock = () => now;
      game.publishCompanion(true);
      const revision = game.companionRevision;
      for (let i = 1; i <= 10; i++) {
        now = started + i * 250;
        live.jurisdiction!.heldMs[scorer.id] = i * 250;
        game.publishCompanion();
      }
      expect(game.companionRevision - revision).toBeGreaterThanOrEqual(2);
      expect(game.companionRevision - revision).toBeLessThanOrEqual(3);
      game.clock = () => Date.now();
      game.publishCompanion(true);
      return { id: scorer.id, name: scorer.name, kills: scorer.kills, deaths: scorer.deaths };
    });
    await until(async () => {
      const city = await companionRoom();
      const row = city?.scores.find(score => score.id === published.id);
      return city?.humans === 0 && city.players === city.scores.length && city.players >= 6 && row?.name === published.name &&
        row.kills === published.kills && row.deaths === published.deaths &&
        row.objectiveScore === 2.5;
    });
  });
});
