import { env, evictDurableObject, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameRoom } from '../../src/worker/GameRoom';
import type { CityRecorder } from '../../src/worker/city/CityRecorder';
import { HeatDay } from '../../src/worker/HeatMap';
import { PERSISTENT_BOT_IDS } from '../../src/shared/botRoster';
import { MAX_HP, WIN_DISPLAY_MS, type PlayerData, type RoundState } from '../../src/shared/networkProtocol';
import type { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import type { ServerBotController } from '../../src/worker/ServerBotController';
import type { CityFact } from '../../src/shared/city/facts';
import { cityModel } from '../../src/shared/city/model';
import { cityDigest } from '../../src/worker/city/digest';

// Ways the room could record the wrong story, written before the code:
// 1. Bots are counted as humans (or the reverse), so Tyler's play is drowned by bots.
// 2. Corpses and disconnected-but-reserved humans pile presence onto one spot.
// 3. Victory display time counts as play.
// 4. A death is filed at the killer's spot, a city death credits a kill, assists go missing.
// 5. Data is lost when the Durable Object is evicted, or counted twice after reload.
// 6. Midnight rollover writes into the old day, or old days are thrown away (aggregates are kept forever).
// 7. Heat from the earlier releases is lost or counted twice by the migration.
// 8. The archive misses facts: situations without K/D/A, standing or fire rate; fight windows without the seconds before the hit.
// 9. Private facts leak without the token, or public aggregates are unreadable from a file page.
// 10. A banked hit is missed, a direct hit counts as banked, or one ball's wall bounce leaks onto another.
type Internals = {
  players: Map<string, PlayerData>; round: RoundState; chaos: ChaosSimulation;
  sessions: Map<string, { token: string; until: number | null }>;
  chaosTimer: ReturnType<typeof setInterval> | null; serverBots: ServerBotController | null; persistentBots: boolean;
  city: CityRecorder;
  handleHit: (id: string | null, message: { type: 'hit'; victimId: string; damage: number }) => Promise<void>;
};
type Room = DurableObjectStub<GameRoom>;
const rooms: Room[] = [];
// Far from the real clock, so the room's own ticking cannot land on the same UTC days.
const DAY = Date.parse('2030-03-14T12:00:00Z');
const all = { from: '0000-01-01', to: '9999-12-31' };
const synthetic = { from: '2030-03-14', to: '2030-03-14' };

function quiet(game: Internals) {
  if (game.chaosTimer) clearInterval(game.chaosTimer);
  game.chaosTimer = null; game.serverBots?.dispose(); game.serverBots = null;
}
/** One bot, a live human, a corpse and a disconnected human, each on a known street cell. */
async function cityRoom(): Promise<Room> {
  const stub = env.GAME_ROOM.getByName(`city-test-${crypto.randomUUID()}`); rooms.push(stub);
  await stub.ensurePersistentBots();
  await runInDurableObject(stub, (instance: GameRoom) => {
    const game = instance as unknown as Internals; quiet(game);
    const bot = game.players.get(PERSISTENT_BOT_IDS[0])!;
    for (const id of [...game.players.keys()]) if (id !== bot.id) game.players.delete(id);
    Object.assign(bot, { x: 10, y: 0.3, z: 10, hp: MAX_HP, kills: 0, deaths: 0 });
    for (const p of [{ ...bot, id: 'human-live', name: 'Live', x: -10, z: -10 }, { ...bot, id: 'human-dead', name: 'Dead', x: 30, z: 30, hp: 0 }, { ...bot, id: 'human-away', name: 'Away', x: 50, z: 50 }])
      game.players.set(p.id, p);
    game.sessions.set('human-away', { token: 't', until: DAY + 30_000 });
  });
  return stub;
}
/** Drive the recorder through `seconds` of play from `start`. */
function play(game: Internals, start: number, seconds: number) {
  for (let t = 0; t <= seconds * 1000; t += 200) game.city.tick(start + t, game.players, game.chaos.snapshot(false), game.round);
}
async function archived(): Promise<CityFact[]> {
  const facts: CityFact[] = [];
  for (const o of (await env.CITY_ARCHIVE.list({ prefix: 'city/raw/v1/' })).objects) {
    const body = await (await env.CITY_ARCHIVE.get(o.key))!.arrayBuffer();
    const text = await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    for (const line of text.trim().split('\n')) facts.push(JSON.parse(line) as CityFact);
  }
  return facts;
}
afterEach(async () => {
  for (const stub of rooms.splice(0)) await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
    const game = instance as unknown as Internals; quiet(game); game.persistentBots = false;
    await ctx.storage.deleteAlarm();
  });
  for (const o of (await env.CITY_ARCHIVE.list()).objects) await env.CITY_ARCHIVE.delete(o.key);
});

describe('city recorder in the room', () => {
  it('counts living connected rats a second at a time, humans apart from bots, and not during the victory display', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      play(game, DAY, 1.9);
      game.round = { ...game.round, phase: 'won', resetAt: DAY + WIN_DISPLAY_MS };
      play(game, DAY + 3000, 2);
    });
    const heat = await stub.cityHeat(synthetic, {}, DAY + 6000);
    expect(heat.layers['humans']).toEqual({ 'street:-3:-3': 2 });
    expect(heat.layers['bots']).toEqual({ 'street:2:2': 2 });
    const places = await stub.cityPlaces(synthetic, {}, DAY + 6000);
    const street = Object.entries(places.places).find(([, m]) => m['human-s'])!;
    expect(street[1]['human-s']).toBe(2);
  });

  it('files deaths at the victim and kills at the killer, credits assists, and gives no kill to the city', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      play(game, Date.now(), 0);
      await game.handleHit('human-live', { type: 'hit', victimId: 'human-away', damage: 1 });
      await game.handleHit(PERSISTENT_BOT_IDS[0], { type: 'hit', victimId: 'human-away', damage: MAX_HP });
      await game.handleHit(null, { type: 'hit', victimId: 'human-live', damage: MAX_HP });
      game.city.flush(Date.now(), true); await game.city.settled();
    });
    const heat = await stub.cityHeat(all);
    expect(heat.layers['deaths']).toEqual({ 'street:12:12': 1, 'street:-3:-3': 1 });
    expect(heat.layers['kills']).toEqual({ 'street:2:2': 1 });
    const deaths = (await archived()).filter(f => f.type === 'death');
    expect(deaths).toHaveLength(2);
    const byBot = deaths.find(d => d.type === 'death' && d.a !== undefined)!;
    expect(byBot.type === 'death' && byBot.assists.length).toBe(1);
    const byCity = deaths.find(d => d.type === 'death' && d.a === undefined)!;
    expect(byCity.type === 'death' && byCity.cause).toBe('city');
  });

  it('names a death by what killed it: every shot carries a ball direction, which is not a missile', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as Internals, now = Date.now();
      play(game, now, 0);
      const killer = game.players.get('human-live')!, v = game.players.get(PERSISTENT_BOT_IDS[0])!;
      v.hp = 0;
      game.city.hit({ attacker: killer, victim: v, damage: MAX_HP, killed: true, headshot: true, explosive: false, incoming: true }, now + 10);
      game.city.flush(now + 20, true); await game.city.settled();
    });
    const death = (await archived()).find(f => f.type === 'death');
    expect(death?.type === 'death' && death.cause).toBe('headshot');
  });

  it('tells banked hits from direct ones, ball by ball', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as Internals, now = Date.now();
      play(game, now, 0);
      const bot = PERSISTENT_BOT_IDS[0], e = { shotId: 's', at: now, tick: 1, epoch: 'e', point: { x: -10, y: 1, z: -10 } };
      game.city.balls([
        { ...e, owner: 'human-live', ballId: 'bank', outcome: 'world-bounce' },
        { ...e, owner: 'human-live', ballId: 'bank', outcome: 'world-bounce' },
        { ...e, owner: 'human-live', ballId: 'direct', outcome: 'rat-body', victimId: bot },
        { ...e, owner: 'human-live', ballId: 'bank', outcome: 'rat-head', victimId: bot },
        { ...e, owner: 'human-live', ballId: 'wall-then-gone', outcome: 'world-bounce' },
        { ...e, owner: 'human-live', ballId: 'wall-then-gone', outcome: 'lifetime' },
        { ...e, owner: 'human-live', ballId: 'wall-then-gone', outcome: 'rat-body', victimId: bot },
      ], now + 10);
      game.city.flush(now + 20, true); await game.city.settled();
    });
    const balls = (await archived()).filter(f => f.type === 'ball');
    expect(balls.map(b => b.type === 'ball' && [b.outcome, b.bounces ?? 0])).toEqual([['rat-body', 0], ['rat-head', 2], ['lifetime', 1], ['rat-body', 0]]);
    const places = await stub.cityPlaces(all), flows = await stub.cityFlows(all), model = cityModel();
    const text = cityDigest({ range: all, days: places.days, places: model.places, counts: places.places, modes: places.modes, flows: flows.flows, minds: places.minds });
    expect(text).toContain('Banked off a wall: 33% of human hits');
  });

  it('keeps flushed counts through eviction without counting them twice', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      play(game, DAY, 0); game.city.flush(DAY); game.city.flush(DAY + 1);
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals; quiet(game);
      const bot = game.players.get(PERSISTENT_BOT_IDS[0])!; Object.assign(bot, { x: 10, y: 0.3, z: 10, hp: MAX_HP });
      for (const id of [...game.players.keys()]) if (id !== bot.id) game.players.delete(id);
      play(game, DAY + 60_000, 0); game.city.flush(DAY + 60_000);
    });
    // 1 s from the first frame (humans present), then one 5 s frame of the bot-only city; a double count would read 7.
    expect((await stub.cityHeat(synthetic, {}, DAY + 61_000)).layers['bots']).toEqual({ 'street:2:2': 6 });
  });

  it('starts a new day at UTC midnight and keeps every day', async () => {
    const stub = await cityRoom();
    const old = DAY - 400 * 86_400_000;
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      play(game, old, 0); game.city.flush(old);
      play(game, Date.parse('2030-03-14T23:59:59.500Z'), 0); play(game, Date.parse('2030-03-15T00:00:01Z'), 0);
      game.city.flush(Date.parse('2030-03-15T00:00:02Z'));
    });
    const next = Date.parse('2030-03-15T08:00:00Z');
    const today = await stub.cityHeat({ from: '2030-03-15', to: '2030-03-15' }, {}, next);
    expect(today.layers['bots']).toEqual({ 'street:2:2': 1 });
    const everything = await stub.cityHeat(all, {}, next);
    const oldDay = new Date(old).toISOString().slice(0, 10);
    expect(everything.days).toEqual(expect.arrayContaining([oldDay, '2030-03-14', '2030-03-15']));
    expect((await stub.cityHeat({ from: oldDay, to: oldDay }, {}, next)).layers['bots']).toEqual({ 'street:2:2': 1 });
    expect((await stub.cityHeat({ from: '2030-03-14', to: '2030-03-15' }, {}, next)).layers['bots']).toEqual({ 'street:2:2': 2 });
  });

  it('folds both earlier heat stores into the city cells once, without loss', async () => {
    const stub = await cityRoom();
    const legacy = new HeatDay(); legacy.add('humans', 10, 0.3, 10); legacy.add('humans', 10, 0.3, 10);
    await runInDurableObject(stub, (_instance: GameRoom, ctx) => {
      ctx.storage.sql.exec('CREATE TABLE heat_days (day TEXT PRIMARY KEY, data TEXT NOT NULL)');
      ctx.storage.sql.exec('INSERT INTO heat_days (day, data) VALUES (?, ?)', '2030-01-01', JSON.stringify(legacy));
      ctx.storage.sql.exec('CREATE TABLE heat_cells (day TEXT NOT NULL, layer TEXT NOT NULL, cell TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, layer, cell)) WITHOUT ROWID');
      ctx.storage.sql.exec("INSERT INTO heat_cells (day, layer, cell, n) VALUES ('2030-01-02', 'deaths', 'sewer:-3:1', 4)");
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance: GameRoom) => quiet(instance as unknown as Internals));
    await evictDurableObject(stub);
    const heat = await stub.cityHeat({ from: '2030-01-01', to: '2030-01-02' });
    expect(heat.layers['humans']).toEqual({ 'street:2:2': 2 });
    expect(heat.layers['deaths']).toEqual({ 'sewer:-3:1': 4 });
  });

  it('archives situations with standing, K/D/A and fire rate, and fight windows with the seconds before the hit', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, async (instance: GameRoom) => {
      const game = instance as unknown as Internals, start = Date.now();
      play(game, start, 4);
      game.city.shot(game.players.get('human-live')!, { x: 1, y: 0, z: 0 }, start + 4100);
      game.city.shot(game.players.get('human-live')!, { x: 1, y: 0, z: 0 }, start + 4400);
      game.city.hit({ attacker: game.players.get('human-live')!, victim: game.players.get(PERSISTENT_BOT_IDS[0])!, damage: 1, killed: false, headshot: false, explosive: false, incoming: false }, start + 4500);
      play(game, start + 4600, 3);
      game.city.flush(start + 8000, true); await game.city.settled();
    });
    const facts = await archived();
    const frames = facts.filter(f => f.type === 'frame');
    expect(frames.length).toBeGreaterThanOrEqual(7);
    const last = frames[frames.length - 1]!;
    if (last.type !== 'frame') throw new Error('not a frame');
    const human = last.rats.find(r => r.human && r.alive)!;
    expect(human.kda).toMatchObject({ shots: 2, dmgOut: 1 });
    expect(human.fire.last10s).toBe(2);
    expect(human.standing.rank).toBeGreaterThan(0);
    expect(last.rats.some(r => !r.alive)).toBe(true);
    expect(last.rats.filter(r => r.human)).toHaveLength(2);
    const shots = facts.filter(f => f.type === 'shot');
    expect(shots.map(s => s.type === 'shot' ? s.gapMs : null)).toEqual([undefined, 300]);
    const window = facts.find(f => f.type === 'window');
    if (!window || window.type !== 'window') throw new Error('no window');
    const samples = Object.values(window.samples);
    expect(samples).toHaveLength(2);
    for (const track of samples) {
      expect(track[0]![0]).toBeLessThanOrEqual(400);
      expect(track[track.length - 1]![0]).toBeGreaterThanOrEqual(4600);
    }
  });
});

describe('city endpoints', () => {
  it('serves aggregates and the digest openly, and keeps events and the archive behind the token', async () => {
    const base = 'https://ratdetective.online/api';
    for (const path of ['/heat/v1?days=all', '/city/v1/places?days=7', '/city/v1/flows?days=7&mode=jurisdiction', '/city/v1/model']) {
      const response = await SELF.fetch(base + path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    }
    const digest = await SELF.fetch(`${base}/city/v1/digest?days=all`);
    expect(digest.headers.get('content-type')).toContain('text/markdown');
    expect(await digest.text()).toContain('# City digest');
    const model = await (await SELF.fetch(`${base}/city/v1/model`)).json() as { entities: Array<{ id: string; place: string }> };
    expect(model.entities.find(e => e.id === 'pickup:fix-precinct-hall')!.place).toBe('room:precinct-hall');
    for (const path of ['/city/v1/events', '/city/v1/archive']) expect((await SELF.fetch(base + path)).status, path).toBe(401);
    for (const query of ['days=0', 'from=2026-09-29', 'mode=Bad!']) expect((await SELF.fetch(`${base}/city/v1/places?${query}`)).status, query).toBe(400);
    expect((await SELF.fetch(`${base}/heat/v1`, { method: 'POST' })).status).toBe(405);
  });
});
