import { env, evictDurableObject, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameRoom } from '../../src/worker/GameRoom';
import { HEAT_RETENTION_DAYS } from '../../src/worker/HeatMap';
import { PERSISTENT_BOT_IDS, type PersistentBot } from '../../src/shared/botRoster';
import { MAX_HP, WIN_DISPLAY_MS, type PlayerData, type RoundState } from '../../src/shared/networkProtocol';
import type { ServerBotController } from '../../src/worker/ServerBotController';

// Ways the room could record the wrong story, written before the code:
// 1. Bots are counted as humans (or the reverse), so Tyler's play is drowned by bots.
// 2. Corpses and disconnected-but-reserved humans pile presence onto one spot.
// 3. Victory display time counts as play.
// 4. A death is recorded at the killer's spot, a self-kill credits a kill cell.
// 5. Data is lost when the Durable Object is evicted, or counted twice after reload.
// 6. Midnight rollover writes into the old day; old days are never pruned.
// 7. The endpoint accepts junk ranges, other methods, or is unreadable from a file:// page.
type Internals = {
  players: Map<string, PlayerData>; round: RoundState; botRoster: PersistentBot[];
  sessions: Map<string, { token: string; until: number | null }>;
  chaosTimer: ReturnType<typeof setInterval> | null; serverBots: ServerBotController | null; persistentBots: boolean;
  sampleHeat: (now: number) => void; flushHeat: (now: number) => void;
  handleHit: (id: string | null, message: { type: 'hit'; victimId: string; damage: number }) => Promise<void>;
};
type Heat = { days: string[]; cell: number; layers: Record<string, Record<string, number>> };
const rooms: DurableObjectStub<GameRoom>[] = [];
const DAY = Date.parse('2026-09-28T12:00:00Z');

function quiet(game: Internals) {
  if (game.chaosTimer) clearInterval(game.chaosTimer);
  game.chaosTimer = null; game.serverBots?.dispose(); game.serverBots = null;
}
async function cityRoom() {
  const stub = env.GAME_ROOM.getByName(`heat-test-${crypto.randomUUID()}`); rooms.push(stub);
  await stub.ensurePersistentBots();
  await runInDurableObject(stub, (instance: GameRoom) => {
    const game = instance as unknown as Internals; quiet(game);
    // One rat on a known street cell each: a bot, a live human, a corpse, a disconnected human.
    const bot = game.players.get(PERSISTENT_BOT_IDS[0])!;
    for (const id of [...game.players.keys()]) if (id !== bot.id) game.players.delete(id);
    Object.assign(bot, { x: 10, y: 0.3, z: 10, hp: MAX_HP });
    const human = { ...bot, id: 'human-live', name: 'Live', x: -10, z: -10 };
    const corpse = { ...bot, id: 'human-dead', name: 'Dead', x: 30, z: 30, hp: 0 };
    const away = { ...bot, id: 'human-away', name: 'Away', x: 50, z: 50 };
    for (const p of [human, corpse, away]) game.players.set(p.id, p);
    game.sessions.set('human-away', { token: 't', until: DAY + 30_000 });
  });
  return stub;
}
const heatOf = (stub: DurableObjectStub<GameRoom>, days: number, now = DAY) => stub.heat(days, now) as Promise<Heat>;
afterEach(async () => {
  for (const stub of rooms.splice(0)) await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
    const game = instance as unknown as Internals; quiet(game); game.persistentBots = false;
    await ctx.storage.deleteAlarm();
  });
});

describe('room heat map', () => {
  it('samples living connected rats, humans apart from bots, and skips the victory display', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      game.sampleHeat(DAY); game.sampleHeat(DAY + 1000);
      game.round = { ...game.round, phase: 'won', resetAt: DAY + WIN_DISPLAY_MS } as RoundState;
      game.sampleHeat(DAY + 2000);
      game.flushHeat(DAY + 2000);
    });
    const heat = await heatOf(stub, 1);
    expect(heat.layers.humans).toEqual({ 'street:-3:-3': 2 });
    expect(heat.layers.bots).toEqual({ 'street:2:2': 2 });
  });

  it('records deaths where the victim fell and kills where the shooter stood; neutral deaths credit no kill cell', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      await game.handleHit(PERSISTENT_BOT_IDS[0], { type: 'hit', victimId: 'human-live', damage: MAX_HP });
      await game.handleHit(null, { type: 'hit', victimId: 'human-away', damage: MAX_HP });
      game.flushHeat(Date.now());
    });
    const heat = await heatOf(stub, 1, Date.now());
    expect(heat.layers.deaths).toEqual({ 'street:-3:-3': 1, 'street:12:12': 1 });
    expect(heat.layers.kills).toEqual({ 'street:2:2': 1 });
  });

  it('keeps flushed heat through eviction without counting it twice', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals; game.sampleHeat(DAY); game.flushHeat(DAY); game.flushHeat(DAY + 60_000);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals; quiet(game);
      const bot = game.players.get(PERSISTENT_BOT_IDS[0])!; Object.assign(bot, { x: 10, y: 0.3, z: 10, hp: MAX_HP });
      for (const id of [...game.players.keys()]) if (id !== bot.id) game.players.delete(id);
      game.sampleHeat(DAY + 120_000); game.flushHeat(DAY + 120_000);
    });
    expect((await heatOf(stub, 1)).layers.bots).toEqual({ 'street:2:2': 2 });
  });

  it('starts a new day at UTC midnight and prunes days past retention', async () => {
    const stub = await cityRoom();
    const old = DAY - (HEAT_RETENTION_DAYS + 1) * 86_400_000;
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      game.sampleHeat(old); game.flushHeat(old);
      game.sampleHeat(Date.parse('2026-09-28T23:59:59Z')); game.sampleHeat(Date.parse('2026-09-29T00:00:01Z'));
      game.flushHeat(Date.parse('2026-09-29T00:00:01Z'));
    });
    const next = Date.parse('2026-09-29T08:00:00Z');
    expect((await heatOf(stub, 1, next)).days).toEqual(['2026-09-29']);
    expect((await heatOf(stub, 1, next)).layers.bots).toEqual({ 'street:2:2': 1 });
    const all = await heatOf(stub, HEAT_RETENTION_DAYS, next);
    expect(all.days).toEqual(['2026-09-28', '2026-09-29']);
    expect(all.layers.bots).toEqual({ 'street:2:2': 2 });
  });
});

describe('heat endpoint', () => {
  it('serves the canonical city readable from a local file page, and rejects junk', async () => {
    const ok = await SELF.fetch('https://ratdetective.online/api/heat/v1?days=3');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    const body = await ok.json() as Heat;
    expect(body.cell).toBe(4);
    expect(Object.keys(body.layers).sort()).toEqual(['bots', 'deaths', 'humans', 'kills']);
    for (const days of ['0', '31', 'x', '2.5', '-1']) {
      expect((await SELF.fetch(`https://ratdetective.online/api/heat/v1?days=${days}`)).status).toBe(400);
    }
    expect((await SELF.fetch('https://ratdetective.online/api/heat/v1', { method: 'POST' })).status).toBe(405);
  });
});
