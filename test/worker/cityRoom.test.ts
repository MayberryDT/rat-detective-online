import { env, evictDurableObject, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameRoom } from '../../src/worker/GameRoom';
import worker from '../../src/worker/index';
import type { CityRecorder } from '../../src/worker/city/CityRecorder';
import { CityStore, PACK_BYTES, PACK_MERGE_AT } from '../../src/worker/city/CityStore';
import { HeatDay, validHeatKey } from '../../src/worker/HeatMap';
import { PERSISTENT_BOT_IDS } from '../../src/shared/botRoster';
import { MAX_HP, PROTOCOL_VERSION, WIN_DISPLAY_MS, type PlayerData, type RoundState } from '../../src/shared/networkProtocol';
import type { PerfReport } from '../../src/shared/perfReport';
import { readSocketMessage } from './socketMessages';
import { seatHuman } from './humanSeat';
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
// Packed aggregates (docs/plans/data-cost-2026-10.md, P1), the ways they could fail:
// 11. Merging a bucket's packs loses a count, counts one twice, or deletes a pack it did not sum.
// 12. A merge or a read mixes buckets: another day, build, layout, mode or layer leaks through a filter.
// 13. A busy bucket grows one row past SQLite's row limit.
// 14. Counts written per key before packing stop being read, or a key held both ways is counted once.
// 15. A failed write half lands, or its counts are lost or counted twice when the next flush retries them.
// 16. Events are pruned inside the 30 days, or never pruned.
// The rollback mode (CITY_AGGREGATES=rows) and unpack, the ways they could fail:
// 17. Rows mode still writes packs, which a release from before packing never reads; or loses or doubles its counts.
// 18. Unpack loses a count, counts one twice, moves a pack without deleting it (doubled once the old release reads the
//     rows) or deletes one it did not move.
// 19. After unpack, the per-key tables alone (all an older release reads) differ from the totals before.
// 20. Unpack runs in packs mode, where new packs keep arriving behind it.
type Internals = {
  players: Map<string, PlayerData>; round: RoundState; chaos: ChaosSimulation;
  sessions: Map<string, { token: string; until: number | null; agent?: true }>;
  chaosTimer: ReturnType<typeof setInterval> | null; serverBots: ServerBotController | null; persistentBots: boolean;
  city: CityRecorder;
  handleHit: (id: string | null, message: { type: 'hit'; victimId: string; damage: number }) => Promise<void>;
};
type Room = DurableObjectStub<GameRoom>;
const rooms: Room[] = [];
const seats: WebSocket[] = [];
// Far from the real clock, so the room's own ticking cannot land on the same UTC days.
const DAY = Date.parse('2030-03-14T12:00:00Z');
const all = { from: '0000-01-01', to: '9999-12-31' };
const synthetic = { from: '2030-03-14', to: '2030-03-14' };

function quiet(game: Internals) {
  if (game.chaosTimer) clearInterval(game.chaosTimer);
  game.chaosTimer = null; game.serverBots?.dispose(); game.serverBots = null;
}
/** One bot, a live human, a corpse and a disconnected human, each on a known street cell. A real human
 * seat starts the bots (a room plays only with a human); its rat is then cleared so only the fixture remains. */
async function cityRoom(): Promise<Room> {
  const stub = env.GAME_ROOM.getByName(`city-test-${crypto.randomUUID()}`); rooms.push(stub);
  await stub.ensurePersistentBots();
  const seat = await seatHuman(stub); seats.push(seat.ws);
  await runInDurableObject(stub, (instance: GameRoom) => {
    const game = instance as unknown as Internals; quiet(game);
    game.sessions.delete(seat.id);
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
  for (const ws of seats.splice(0)) ws.close();
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

  // How the game runs on players' machines: kept for humans only, never at the cost of the socket, never flooding SQL.
  it('records a human client\'s perf report without its name or ID, drops junk without dropping the socket, and rate-limits', async () => {
    const stub = env.GAME_ROOM.getByName(`city-perf-${crypto.randomUUID()}`); rooms.push(stub);
    await stub.ensurePersistentBots();
    const ws = (await stub.fetch('http://localhost/ws', { headers: { Upgrade: 'websocket', Origin: 'http://localhost' } })).webSocket!;
    ws.accept();
    const welcome = new Promise<string>(resolve => ws.addEventListener('message', event => {
      const message = readSocketMessage(ws, event.data); if (message?.type === 'welcome') resolve(message.id);
    }));
    ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Frametester', appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } }));
    const id = await welcome;
    const report: PerfReport = { ms: 30000, frames: 900, fps: 30, fps50: 30, p50: 33.3, p95: 50, p99: 120, worst: 480, over33: 400, over100: 3,
      gpu: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', os: 'windows', browser: 'chrome', browserMajor: 129 };
    const rows = await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals & { clock: () => number }; quiet(game);
      let now = Date.now(); game.clock = () => now;
      const server = ctx.getWebSockets()[0]!, send = (body: unknown) => instance.webSocketMessage(server, JSON.stringify(body));
      await send({ type: 'perf', report: 'fast' });
      await send({ type: 'perf', report: { ...report, frames: -1 } });
      for (let i = 0; i < 5; i++) await send({ type: 'perf', report: { ...report, worst: 480 + i } });
      now += 60_000; await send({ type: 'perf', report: { ...report, worst: 999 } });
      game.city.perf(PERSISTENT_BOT_IDS[0], report, now);
      expect(game.players.has(id)).toBe(true);
      game.city.flush(now, true); await game.city.settled();
      return ctx.storage.sql.exec<{ data: string }>("SELECT data FROM city_events WHERE type = 'perf' ORDER BY seq").toArray().map(r => r.data);
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    const facts = rows.map(r => JSON.parse(r) as CityFact);
    expect(facts.map(f => f.type === 'perf' ? f.worst : 0)).toEqual([480, 481, 482, 999]);
    expect(facts[0]).toMatchObject({ type: 'perf', human: true, a: expect.any(Number), frames: 900, fps: 30, over100: 3, os: 'windows', gpu: report.gpu });
    for (const row of rows) expect(row).not.toMatch(new RegExp(`${id}|Frametester`));
    expect((await archived()).filter(f => f.type === 'perf')).toHaveLength(4);
    ws.close(1000, 'done');
  });

  // Agent browsers (docs/data-plan.md, "Who is playing"). Ways it could go wrong: the flag lost between the socket and the
  // rat, so an agent reads as a human in situations, sessions or frame reports; its time or routes landing in the human
  // heat, place counts or digest.
  it('records an agent=1 socket\'s rat as an agent, never a human, and leaves it out of every human measure', async () => {
    const stub = env.GAME_ROOM.getByName(`city-agent-${crypto.randomUUID()}`); rooms.push(stub);
    await stub.ensurePersistentBots();
    const ws = (await stub.fetch('http://localhost/ws?agent=1', { headers: { Upgrade: 'websocket', Origin: 'http://localhost' } })).webSocket!;
    ws.accept();
    const welcome = new Promise<string>(resolve => ws.addEventListener('message', event => {
      const message = readSocketMessage(ws, event.data); if (message?.type === 'welcome') resolve(message.id);
    }));
    ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Harness', appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } }));
    const id = await welcome;
    const report: PerfReport = { ms: 30000, frames: 900, fps: 30, fps50: 30, p50: 33.3, p95: 50, p99: 120, worst: 480, over33: 400, over100: 3, os: 'linux', browser: 'chrome', browserMajor: 129 };
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals; quiet(game);
      for (const other of [...game.players.keys()]) if (other !== id) game.players.delete(other);
      Object.assign(game.players.get(id)!, { x: -10, y: 0.3, z: -10, hp: MAX_HP });
      await instance.webSocketMessage(ctx.getWebSockets()[0]!, JSON.stringify({ type: 'perf', report }));
      play(game, DAY, 1.9);
      game.city.flush(DAY + 3000, true); await game.city.settled();
    });
    ws.close(1000, 'done');
    const facts = await archived(), rats = facts.flatMap(f => f.type === 'frame' ? f.rats : []);
    expect(rats.some(r => r.agent === true && !r.human)).toBe(true);
    expect(rats.some(r => r.human)).toBe(false);
    expect(facts.find(f => f.type === 'session')).toMatchObject({ what: 'join', human: false, agent: true });
    expect(facts.find(f => f.type === 'perf')).toMatchObject({ human: false, agent: true, frames: 900 });
    expect(facts.find(f => f.type === 'frame')).toMatchObject({ build: 'dev', world: { humans: 0, agents: 1 } });
    const heat = await stub.cityHeat(synthetic, {}, DAY + 4000);
    expect(heat.layers['humans']).toBeUndefined();
    expect(heat.layers['agents']).toEqual({ 'street:-3:-3': 2 });
    const places = await stub.cityPlaces(synthetic, {}, DAY + 4000), flows = await stub.cityFlows(synthetic, {}, DAY + 4000);
    expect(Object.values(places.places).some(m => m['human-s'])).toBe(false);
    expect(Object.values(places.places).reduce((t, m) => t + (m['agent-s'] ?? 0), 0)).toBe(2);
    const text = cityDigest({ range: synthetic, days: places.days, places: cityModel().places, counts: places.places, modes: places.modes, flows: flows.flows, minds: places.minds });
    expect(text).toContain('Exposure: 0.0 human rat-hours');
    expect(text).toContain('Agent browsers: 0.0 rat-hours, left out of every human measure.');
  });

  // Aggregates by build (docs/data-plan.md, "Aggregates by era"). Ways it could go wrong: the migration loses the counts
  // from before builds, or files them under today's build; two builds on one day merge; a filter by build leaks others.
  it('keys aggregates by build, keeping the counts from before builds as build unknown', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, (_instance: GameRoom, ctx) => {
      // The tables as the previous release left them, with a day of counts.
      const sql = ctx.storage.sql;
      for (const table of ['city_cells', 'city_places', 'city_flows', 'city_minds']) sql.exec(`DROP TABLE ${table}`);
      sql.exec('CREATE TABLE city_cells (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, layer TEXT NOT NULL, cell TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, layout, mode, layer, cell)) WITHOUT ROWID');
      sql.exec('CREATE TABLE city_places (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, place TEXT NOT NULL, measure TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, layout, mode, place, measure)) WITHOUT ROWID');
      sql.exec('CREATE TABLE city_flows (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, layout, mode, src, dst, who)) WITHOUT ROWID');
      sql.exec('CREATE TABLE city_minds (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, measure TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, layout, mode, measure)) WITHOUT ROWID');
      sql.exec("INSERT INTO city_cells VALUES ('2030-03-14', 5, 'excessive-force', 'bots', 'street:2:2', 7)");
      sql.exec("INSERT INTO city_places VALUES ('2030-03-14', 5, 'excessive-force', 'street:old', 'human-s', 60)");
      sql.exec("INSERT INTO city_flows VALUES ('2030-03-14', 5, 'excessive-force', 'a', 'b', 'human', 4)");
      sql.exec("INSERT INTO city_minds VALUES ('2030-03-14', 5, 'excessive-force', 'requests', 9)");
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals; quiet(game);
      const bot = game.players.get(PERSISTENT_BOT_IDS[0])!; Object.assign(bot, { x: 10, y: 0.3, z: 10, hp: MAX_HP });
      for (const id of [...game.players.keys()]) if (id !== bot.id) game.players.delete(id);
      play(game, DAY, 0); game.city.flush(DAY);
    });
    // The bot-only city's one 5 s frame, under this build; the old day's 7 under `unknown`.
    expect((await stub.cityHeat(synthetic, {}, DAY + 1000)).layers['bots']).toEqual({ 'street:2:2': 12 });
    expect((await stub.cityHeat(synthetic, { build: 'unknown' }, DAY + 1000)).layers['bots']).toEqual({ 'street:2:2': 7 });
    expect((await stub.cityHeat(synthetic, { build: 'dev' }, DAY + 1000)).layers['bots']).toEqual({ 'street:2:2': 5 });
    const old = await stub.cityPlaces(synthetic, { build: 'unknown' }, DAY + 1000);
    expect(old.places).toEqual({ 'street:old': { 'human-s': 60 } });
    expect(old.minds).toEqual({ requests: 9 });
    expect(old.builds['unknown']).toEqual({ 'human-s': 60 });
    expect(Object.keys(old.builds).sort()).toEqual(['dev', 'unknown']);
    expect((await stub.cityFlows(synthetic, { build: 'unknown' }, DAY + 1000)).flows).toEqual([{ src: 'a', dst: 'b', who: 'human', n: 4 }]);
    expect((await stub.cityFlows(synthetic, { build: 'dev' }, DAY + 1000)).flows).toEqual([]);
  });

  it('packs each flush per bucket and merges piled-up packs, keeping every count apart by bucket and through eviction', async () => {
    const stub = await cityRoom();
    const day = '2030-03-14', flushes = PACK_MERGE_AT * 2 + 3;
    // Valid cells on every floor, enough that one flush of the bucket overflows a pack row.
    const big: string[] = [];
    for (const floor of ['street', 'sewer', 'upper', 'air']) for (let x = -80; x < 80; x++) for (let z = -80; z < 80; z++) {
      const cell = `${floor}:${x}:${z}`;
      if (validHeatKey(cell) && big.length * 20 < PACK_BYTES * 1.5) big.push(cell);
    }
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      quiet(instance as unknown as Internals);
      // A key counted per row before packing, read beside its packs.
      ctx.storage.sql.exec("INSERT INTO city_cells VALUES (?, 'dev', 7, 'jurisdiction', 'bots', 'street:2:2', 100)", day);
      const store = (instance as unknown as { cityStore: CityStore }).cityStore;
      for (let i = 0; i < flushes; i++) {
        store.addCell(day, 'dev', 7, 'jurisdiction', 'bots', 'street:2:2', 1);
        store.addCell(day, 'dev', 7, 'jurisdiction', 'humans', 'street:2:2', 2);
        store.addCell(day, 'other', 7, 'jurisdiction', 'bots', 'street:2:2', 4);
        store.addCell(day, 'dev', 7, 'chain-of-custody', 'bots', 'street:2:2', 8);
        store.addCell('2030-03-15', 'dev', 7, 'jurisdiction', 'bots', 'street:2:2', 16);
        store.addPlace(day, 'dev', 7, 'jurisdiction', 'street:a', 'human-s', 3);
        store.addFlow(day, 'dev', 7, 'jurisdiction', 'a', 'b', 'human', 5);
        store.addMind(day, 'dev', 7, 'jurisdiction', 'requests', 6);
        if (i < 3) for (const cell of big) store.addCell(day, 'dev', 7, 'jurisdiction', 'deaths', cell, 1);
        store.commit();
      }
      const rows = ctx.storage.sql.exec<{ layer: string; build: string; mode: string; day: string; n: number; bytes: number }>(
        'SELECT layer, build, mode, day, COUNT(*) AS n, MAX(bytes) AS bytes FROM city_packs GROUP BY kind, day, build, layout, mode, layer').toArray();
      for (const row of rows) expect(row.n, JSON.stringify(row)).toBeLessThan(PACK_MERGE_AT + 2);
      expect(Math.max(...rows.map(r => r.bytes))).toBeLessThanOrEqual(PACK_BYTES);
      expect(rows.find(r => r.layer === 'deaths')!.n).toBeGreaterThan(1);
    });
    for (const evicted of [false, true]) {
      if (evicted) await evictDurableObject(stub);
      const one = { from: day, to: day }, label = evicted ? 'after eviction' : 'before eviction';
      const heat = await stub.cityHeat(one, { mode: 'jurisdiction', build: 'dev' });
      expect(heat.layers['bots'], label).toEqual({ 'street:2:2': 100 + flushes });
      expect(heat.layers['humans'], label).toEqual({ 'street:2:2': 2 * flushes });
      expect(Object.keys(heat.layers['deaths']!).length, label).toBe(big.length);
      expect(Object.values(heat.layers['deaths']!).every(n => n === 3), label).toBe(true);
      expect((await stub.cityHeat(one, { build: 'other' })).layers['bots'], label).toEqual({ 'street:2:2': 4 * flushes });
      expect((await stub.cityHeat(one, { mode: 'chain-of-custody' })).layers['bots'], label).toEqual({ 'street:2:2': 8 * flushes });
      expect((await stub.cityHeat({ from: '2030-03-15', to: '2030-03-15' })).layers['bots'], label).toEqual({ 'street:2:2': 16 * flushes });
      expect((await stub.cityHeat(one)).layers['bots'], label).toEqual({ 'street:2:2': 100 + 13 * flushes });
      const places = await stub.cityPlaces(one, { build: 'dev' });
      expect(places.places['street:a'], label).toEqual({ 'human-s': 3 * flushes });
      expect(places.minds, label).toEqual({ requests: 6 * flushes });
      expect(places.modes, label).toEqual({ jurisdiction: 3 * flushes });
      expect(places.builds['dev'], label).toEqual({ 'human-s': 3 * flushes });
      expect((await stub.cityFlows(one, { mode: 'jurisdiction' })).flows, label).toEqual([{ src: 'a', dst: 'b', who: 'human', n: 5 * flushes }]);
      expect(heat.days, label).toEqual([day]);
      expect(heat.allDays, label).toEqual(expect.arrayContaining([day, '2030-03-15']));
    }
  });

  it('writes nothing from a failed flush and counts it once when the next flush retries', async () => {
    const stub = await cityRoom();
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      quiet(game);
      let fail = true;
      // Fails after its writes ran, so a rollback (not a skipped write) is what keeps them out.
      const flaky = new CityStore(ctx.storage.sql, fn => ctx.storage.transactionSync(() => { fn(); if (fail) throw new Error('storage failed'); }));
      game.city.flush(DAY); // a fresh flush clock, so only the explicit flush below writes
      (game.city as unknown as { deps: { store: CityStore } }).deps.store = flaky;
      play(game, DAY, 0);
      game.city.admin({ command: 'end-incident', via: 'http', ok: true }, DAY);
      expect(() => game.city.flush(DAY)).toThrow('storage failed');
      expect(ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM city_packs WHERE day = '2030-03-14'").one().n).toBe(0);
      expect(ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM city_events WHERE type = 'admin'").one().n).toBe(0);
      fail = false;
      game.city.flush(DAY + 1);
      expect(ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM city_events WHERE type = 'admin'").one().n).toBe(1);
    });
    expect((await stub.cityHeat(synthetic, {}, DAY + 2)).layers['bots']).toEqual({ 'street:2:2': 1 });
  });

  it('keeps events for 30 days and prunes older ones', async () => {
    const stub = await cityRoom();
    const now = Date.parse('2030-03-14T12:00:00Z'), day = 86_400_000;
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      quiet(instance as unknown as Internals);
      const store = (instance as unknown as { cityStore: CityStore }).cityStore;
      for (const age of [31, 30, 29, 0]) store.addEvent(now - age * day, undefined, 'probe', JSON.stringify({ age }));
      store.commit();
      store.pruneEvents(now);
      expect(ctx.storage.sql.exec<{ data: string }>("SELECT data FROM city_events WHERE type = 'probe' ORDER BY seq").toArray().map(r => JSON.parse(r.data).age)).toEqual([29, 0]);
    });
  });

  it('in rows mode writes per-key rows and unpacks every pack into them, so the per-key tables alone hold every total', async () => {
    const stub = await cityRoom();
    const day = '2030-03-14', one = { from: day, to: day };
    // The read queries of the release before packing (4041deb CityStore), verbatim.
    const oldRelease = (sql: SqlStorage) => ({
      cells: sql.exec('SELECT layer, cell, SUM(n) AS n FROM city_cells WHERE day BETWEEN ? AND ? GROUP BY layer, cell ORDER BY layer, cell', day, day).toArray(),
      places: sql.exec('SELECT place, measure, SUM(n) AS n FROM city_places WHERE day BETWEEN ? AND ? GROUP BY place, measure ORDER BY place, measure', day, day).toArray(),
      flows: sql.exec('SELECT src, dst, who, SUM(n) AS n FROM city_flows WHERE day BETWEEN ? AND ? GROUP BY src, dst, who ORDER BY src, dst, who', day, day).toArray(),
      minds: sql.exec('SELECT measure, SUM(n) AS n FROM city_minds WHERE day BETWEEN ? AND ? GROUP BY measure ORDER BY measure', day, day).toArray(),
    });
    const totals = async () => ({ heat: (await stub.cityHeat(one)).layers, places: await stub.cityPlaces(one), flows: (await stub.cityFlows(one)).flows });
    const cells: string[] = [];
    for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) cells.push(`street:${x}:${z}`);
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      quiet(instance as unknown as Internals);
      ctx.storage.sql.exec("INSERT INTO city_cells VALUES (?, 'dev', 7, 'jurisdiction', 'bots', 'street:2:2', 100)", day);
      const store = (instance as unknown as { cityStore: CityStore }).cityStore;
      for (let i = 0; i < PACK_MERGE_AT + 5; i++) {
        store.addCell(day, 'dev', 7, 'jurisdiction', 'bots', 'street:2:2', 1);
        for (const cell of cells) store.addCell(day, i % 2 ? 'dev' : 'other', 7, 'jurisdiction', 'deaths', cell, 1);
        store.addPlace(day, 'dev', 7, 'jurisdiction', 'street:a', 'human-s', 3);
        store.addFlow(day, 'dev', 7, 'jurisdiction', 'a', 'b', 'human', 5);
        store.addMind(day, 'dev', 7, 'jurisdiction', 'requests', 6);
        store.commit();
      }
      expect(() => store.unpackBatch(64 * 1024)).toThrow();
    });
    const packed = await totals();
    let rowsPacked: Record<'cells' | 'places' | 'flows' | 'minds', Array<Record<string, SqlStorageValue>>> | undefined;
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      const sql = ctx.storage.sql, packsBefore = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM city_packs').one().n;
      expect(packsBefore).toBeGreaterThan(0);
      const rows = new CityStore(sql, fn => ctx.storage.transactionSync(fn), 'rows');
      Object.assign(instance, { cityStore: rows });
      rows.addCell(day, 'dev', 7, 'jurisdiction', 'bots', 'street:2:2', 1000);
      rows.addPlace(day, 'dev', 7, 'jurisdiction', 'street:a', 'human-s', 7000);
      rows.commit();
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM city_packs').one().n).toBe(packsBefore);
      // A small budget, so the packs move over several batches.
      let left = packsBefore, batches = 0;
      while (left > 0) { left = rows.unpackBatch(16 * 1024).left; batches++; }
      expect(batches).toBeGreaterThan(2);
      rowsPacked = oldRelease(sql);
    });
    const unpacked = await totals();
    expect(unpacked.heat['bots']).toEqual({ 'street:2:2': 100 + PACK_MERGE_AT + 5 + 1000 });
    expect(unpacked.places.places['street:a']).toEqual({ 'human-s': 3 * (PACK_MERGE_AT + 5) + 7000 });
    // Everything but the rows-mode additions is unchanged by the move.
    expect(unpacked.heat['deaths']).toEqual(packed.heat['deaths']);
    expect(unpacked.flows).toEqual(packed.flows);
    expect(unpacked.places.minds).toEqual(packed.places.minds);
    // What the old release reads from the per-key tables alone is every total.
    const old = rowsPacked!;
    expect(Object.fromEntries(old.cells.filter(r => r.layer === 'deaths').map(r => [r.cell, r.n]))).toEqual(unpacked.heat['deaths']);
    expect(old.cells.filter(r => r.layer === 'bots')).toEqual([{ layer: 'bots', cell: 'street:2:2', n: 100 + PACK_MERGE_AT + 5 + 1000 }]);
    expect(old.places).toEqual([{ place: 'street:a', measure: 'human-s', n: 3 * (PACK_MERGE_AT + 5) + 7000 }]);
    expect(old.flows).toEqual([{ src: 'a', dst: 'b', who: 'human', n: 5 * (PACK_MERGE_AT + 5) }]);
    expect(old.minds).toEqual([{ measure: 'requests', n: 6 * (PACK_MERGE_AT + 5) }]);
    await runInDurableObject(stub, (_instance: GameRoom, ctx) =>
      expect(ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM city_packs').one().n).toBe(0));
  });
});

describe('city endpoints', () => {
  it('serves aggregates and the digest openly, and keeps events and the archive behind the token', async () => {
    const base = 'https://ratdetective.online/api';
    for (const path of ['/heat/v1?days=all', '/city/v1/places?days=7', '/city/v1/flows?days=7&mode=jurisdiction', '/city/v1/places?days=all&build=unknown', '/city/v1/model']) {
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
    for (const query of ['days=0', 'from=2026-09-29', 'mode=Bad!', 'days=7&build=no|pipes']) expect((await SELF.fetch(`${base}/city/v1/places?${query}`)).status, query).toBe(400);
    expect((await SELF.fetch(`${base}/heat/v1`, { method: 'POST' })).status).toBe(405);
  });

  it('moves packs only behind the city token, only in rows mode, and addresses any room by object id', async () => {
    const token = 'city-test-token-0123456789', cityEnv = { ...env, CITY_TOKEN: token } as Env;
    const unpack = (query = '', auth?: string, method = 'POST') => worker.fetch(new Request(`https://ratdetective.online/api/city/v1/unpack${query}`,
      { method, headers: auth ? { authorization: `Bearer ${auth}` } : {} }), cityEnv);
    expect((await unpack()).status).toBe(401);
    expect((await unpack('', 'wrong')).status).toBe(401);
    expect((await unpack('', token, 'GET')).status).toBe(405);
    expect((await unpack('?id=not-an-object-id', token)).status).toBe(400);
    for (const query of ['', `?id=${env.GAME_ROOM.idFromName('graybox-practice-unpack-check').toString()}`]) {
      const response = await unpack(query, token);
      expect(response.status, query).toBe(409);
      expect(await response.json(), query).toMatchObject({ ok: false, mode: 'packs' });
    }
  });
});
