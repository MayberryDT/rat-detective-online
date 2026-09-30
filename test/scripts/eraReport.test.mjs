import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { judgePrediction, parseEras, scorecard } from '../../scripts/lib/eras.mjs';

// Ways the era report could go wrong: an old era (no build stamp) picking up facts of the next mind version recorded in
// its window; a stamped era picking up unstamped facts from the same hours; an agent browser counted as a human or as a
// bot (in exposure, requests per bot-minute, kills or blind shots); an era without the newer facts throwing or reading
// as zero instead of waiting; verdicts called when intervals overlap, or in the wrong direction.
const T = Date.UTC(2026, 9, 2), H = 3_600_000, iso = t => new Date(t).toISOString(), BUILD = 'production-2026-10-02-abc1234';
const ERAS = { eras: [
  { id: 'old-bots', environment: 'production', from: iso(T), to: iso(T + H), layout: 3, mindVersion: null, change: 'Old bots.', predictions: [] },
  { id: 'jev', environment: 'production', from: iso(T + H), to: iso(T + 2 * H), layout: 3, mindVersion: 3, change: 'Jev.', predictions: [] },
  { id: 'lighter', environment: 'production', build: BUILD, change: 'Lighter Jev.', baseline: 'jev', predictions: [
    { id: 'requests', says: 'Requests per bot-minute under 12.', measure: 'jev.requestsPerBotMinute', expect: 'down', target: { below: 12 } },
    { id: 'dollars', says: 'Dollars per Jev-hour down fivefold.', measure: 'jev.dollarsPerJevHour', expect: 'down', target: { factor: 5 } },
    { id: 'take-case', says: 'Take-case goals replaced less.', measure: 'goals.take-case.replaced', expect: 'down' },
    { id: 'blind', says: 'Blind-shot gap no worse.', measure: 'likeness.blindShotGap', expect: 'not-up' },
  ] },
] };

const rat = (a, human, extra = {}) => ({ a, human, alive: true, place: 'street:x', p: [0, 0, 0], kda: { shots: 0, hits: 0 }, ...extra });
function makeDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE facts (t INTEGER, type TEXT, room TEXT, round TEXT, mode TEXT, layout INTEGER, incident TEXT, a INTEGER, place TEXT, data TEXT, build TEXT, agent INTEGER);
    CREATE TABLE situations (t INTEGER, round TEXT, a INTEGER, human INTEGER, agent INTEGER);`);
  const insert = db.prepare('INSERT INTO facts (t, type, room, round, layout, data, build) VALUES (?, ?, ?, ?, 3, ?, ?)');
  const fact = f => insert.run(f.t, f.type, 'public-live-v2', f.round, JSON.stringify({ room: 'public-live-v2', layout: 3, ...f }), f.build ?? null);

  // Old bots, 40 minutes: a human and a bot framed every second. A mindVersion-3 fact inside the window belongs to no old era.
  for (let i = 0; i < 2400; i++) fact({ t: T + i * 1000, type: 'frame', round: 'r0', rats: [rat(1, true), rat(2, false)] });
  fact({ t: T + 600_000, type: 'death', round: 'r0', mindVersion: 3, a: 2, victim: 1 });
  fact({ t: T + 600_001, type: 'death', round: 'r0', a: 1, victim: 2 });

  // Jev, 30 minutes: a human, two bots and an agent browser. Jev asks 60 times a minute: 30 per bot-minute.
  const jev = { round: 'r1', mindVersion: 3 };
  for (let i = 0; i < 1800; i++) fact({ ...jev, t: T + H + i * 1000, type: 'frame', rats: [rat(1, true), rat(2, false), rat(3, false), rat(4, false, { agent: true })] });
  for (let w = 1; w <= 30; w++) fact({ ...jev, t: T + H + w * 60_000, type: 'minds', ms: 60_000, requests: 60, answers: 60, decisions: 100, fallbacks: 10, staleDrops: 6, dollars: .02 });
  fact({ ...jev, t: T + H + 5000, type: 'death', a: 4, victim: 1 });
  fact({ ...jev, t: T + H + 6000, type: 'death', a: 1, victim: 4 });
  fact({ ...jev, t: T + H + 7000, type: 'death', a: 1, victim: 2 });
  for (let i = 0; i < 40; i++) fact({ ...jev, t: T + H + 10_000 + i, type: 'shot', a: 1, human: true, targets: i % 2 ? [] : [{ d: 3 }] });
  for (let i = 0; i < 40; i++) fact({ ...jev, t: T + H + 20_000 + i, type: 'shot', a: 4, human: false, agent: true, targets: [] });
  for (let i = 0; i < 40; i++) fact({ ...jev, t: T + H + 30_000 + i, type: 'shot', a: 2, human: false, sample: 10, targets: i % 4 ? [] : [{ d: 3 }] });
  for (let i = 0; i < 30; i++) fact({ ...jev, t: T + H + 40_000 + i, type: 'goal-end', a: 2, goal: 'take-case', outcome: i < 27 ? 'replaced' : 'reached', durationMs: 2000 });

  // The lighter Jev, stamped: 6 requests a minute with two bots (3 per bot-minute), a tenth of the cost. In the same hours
  // an unstamped room (a stray older build) asks 10,000 times: it must not be read into the stamped era.
  const light = { round: 'r2', mindVersion: 4, build: BUILD };
  for (let i = 0; i < 1800; i++) fact({ ...light, t: T + 2 * H + i * 1000, type: 'frame', rats: [rat(1, true), rat(2, false), rat(3, false)] });
  for (let w = 1; w <= 30; w++) fact({ ...light, t: T + 2 * H + w * 60_000, type: 'minds', ms: 60_000, requests: 6, answers: 6, decisions: 100, fallbacks: 1, staleDrops: 0, dollars: .002 });
  fact({ round: 'r9', t: T + 2 * H + 90_000, type: 'minds', ms: 60_000, requests: 10_000, answers: 10_000, dollars: 5 });
  db.close();
}

async function withDb(work) {
  const dir = await mkdtemp(join(tmpdir(), 'era-report-')), path = join(dir, 'city.db');
  try { makeDb(path); await work(path, dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const near = (x, y, what) => assert.ok(Math.abs(x - y) < 1e-6, `${what}: ${x} against ${y}`);

test('eras select their own facts: old eras by window and mind version, stamped eras by build; agents count as nobody', async () => {
  await withDb(async path => {
    const db = new DatabaseSync(path, { readOnly: true }), [old, jev, lighter] = parseEras(ERAS);
    const o = scorecard(db, old), j = scorecard(db, jev), l = scorecard(db, lighter, { now: T + 3 * H });
    db.close();
    near(o.data.humanHours, 2400 / 3600, 'old era human hours');
    near(o.data.botHours, 2400 / 3600, 'old era bot hours');
    assert.deepEqual(o.tables.kills, { 'human-bot': 1, 'bot-human': 0, 'human-human': 0, 'bot-bot': 0, 'city-human': 0, 'city-bot': 0 }, 'the mindVersion-3 death is not an old-bots death');

    near(j.data.humanHours, .5, 'human hours leave the agent out');
    near(j.data.botHours, 1, 'bot hours leave the agent out');
    near(j.data.agentHours, .5, 'agent hours');
    near(j.measures['jev.requestsPerBotMinute'].value, 30, 'requests per bot-minute (an agent is not a bot)');
    assert.equal(j.tables.kills['human-bot'], 1);
    assert.equal(j.tables.kills['bot-human'] + j.tables.kills['human-human'], 0, 'kills by and of the agent are nobody\'s');
    near(j.measures['likeness.blindShare.human'].value, .5, 'the humans\' blind-shot share leaves the agent\'s shots out');
    near(j.measures['likeness.blindShare.bot'].value, .75, 'bots');
    near(j.measures['goals.take-case.replaced'].value, .9, 'take-case replaced');

    near(l.measures['jev.requestsPerBotMinute'].value, 3, 'stamped era requests per bot-minute (unstamped facts left out)');
    near(l.data.jevHours, .5, 'stamped era Jev hours');
    assert.equal(l.measures['goals.take-case.replaced'], undefined, 'no goal ends: no reading, not a zero');
    assert.equal(l.measures['pickups.passedPerRatHour.bot'], undefined, 'pickups passed not recorded: no reading');
  });
});

test('the report judges the after era\'s predictions against the before era', async () => {
  await withDb(async (path, dir) => {
    const eras = join(dir, 'eras.json'), json = join(dir, 'out.json');
    await writeFile(eras, JSON.stringify(ERAS));
    const run = args => promisify(execFile)(process.execPath, ['scripts/era-report.mjs', ...args, `--db=${path}`, `--eras=${eras}`, '--out=-', `--json=${json}`, `--now=${iso(T + 3 * H)}`]);
    const { stdout } = await run(['jev', 'lighter']);
    assert.ok(stdout.length > 0);
    const verdicts = Object.fromEntries(JSON.parse(await readFile(json, 'utf8')).verdicts.map(v => [v.id, v.outcome]));
    // Requests: 3 per bot-minute, wholly under 12. Dollars: 0.12 an hour against 1.20, a tenth. The lighter era has no goal
    // ends and no shots with targets, so those two wait for data.
    assert.deepEqual(verdicts, { requests: 'met', dollars: 'met', 'take-case': 'waiting', blind: 'waiting' });
    // Before the old-bots era, Jev did not run at all: the factor prediction waits rather than dividing by nothing.
    await run(['old-bots', 'lighter']);
    assert.equal(JSON.parse(await readFile(json, 'utf8')).verdicts.find(v => v.id === 'dollars').outcome, 'waiting');
  });
});

test('verdicts are called only when the intervals part, in the predicted direction', () => {
  const r = (value, lo, hi, enough = true) => ({ value, lo, hi, n: 100, enough });
  const card = measures => ({ measures });
  const judge = (p, before, after) => judgePrediction({ id: 'p', says: 'p', measure: 'm', ...p }, card({ m: before }), card({ m: after })).outcome;
  // Plain up or down.
  assert.equal(judge({ expect: 'down' }, r(.89, .88, .90), r(.5, .45, .55)), 'met');
  assert.equal(judge({ expect: 'down' }, r(.5, .45, .55), r(.89, .88, .90)), 'missed');
  assert.equal(judge({ expect: 'down' }, r(.5, .45, .55), r(.48, .40, .56)), 'unclear');
  assert.equal(judge({ expect: 'down' }, r(.89, .88, .90, false), r(.5, .45, .55)), 'waiting');
  assert.equal(judge({ expect: 'down' }, undefined, r(.5, .45, .55)), 'waiting');
  // A fixed bound needs only the after era.
  assert.equal(judge({ expect: 'down', target: { below: 12 } }, undefined, r(8, 7, 9)), 'met');
  assert.equal(judge({ expect: 'down', target: { below: 12 } }, undefined, r(11, 9, 13)), 'unclear');
  assert.equal(judge({ expect: 'down', target: { below: 12 } }, undefined, r(20, 15, 25)), 'missed');
  // A factor: after's worst case at most before's best case over the factor.
  assert.equal(judge({ expect: 'down', target: { factor: 5 } }, r(1.1, 1, 1.2), r(.15, .1, .2)), 'met');
  assert.equal(judge({ expect: 'down', target: { factor: 5 } }, r(1.1, 1, 1.2), r(.3, .25, .35)), 'missed');
  assert.equal(judge({ expect: 'down', target: { factor: 5 } }, r(1.1, 1, 1.2), r(.22, .15, .3)), 'unclear');
  // No worse: missed only when after lies wholly above before; met when its top is no higher.
  assert.equal(judge({ expect: 'not-up' }, r(.3, .25, .35), r(.3, .26, .34)), 'met');
  assert.equal(judge({ expect: 'not-up' }, r(.3, .25, .35), r(.33, .28, .38)), 'unclear');
  assert.equal(judge({ expect: 'not-up' }, r(.3, .25, .35), r(.45, .4, .5)), 'missed');
  // Against another measure of the after era (the bots' hit rate below the humans').
  const vs = (bot, human) => judgePrediction({ id: 'p', says: 'p', measure: 'bot', expect: 'down', target: { below: 'human' } }, card({}), card({ bot, human })).outcome;
  assert.equal(vs(r(.038, .037, .039), r(.054, .05, .058)), 'met');
  assert.equal(vs(r(.07, .065, .075), r(.054, .05, .058)), 'missed');
  assert.equal(vs(r(.056, .052, .06), r(.054, .05, .058)), 'unclear');
  assert.equal(vs(r(.038, .037, .039), r(.054, .05, .058, false)), 'waiting');
});

test('the registry rejects eras a report could not select or judge', () => {
  const era = { id: 'e', environment: 'production', from: iso(T), change: 'x', predictions: [] };
  assert.throws(() => parseEras({ eras: [era, era] }), /duplicate/);
  assert.throws(() => parseEras({ eras: [{ ...era, environment: 'prod' }] }), /environment/);
  assert.throws(() => parseEras({ eras: [{ ...era, to: iso(T - 1) }] }), /ends before it starts/);
  assert.throws(() => parseEras({ eras: [{ ...era, predictions: [{ id: 'p', says: 's', measure: 'jev.vibes', expect: 'down' }] }] }), /unknown measure/);
  assert.throws(() => parseEras({ eras: [{ ...era, predictions: [{ id: 'p', says: 's', measure: 'jev.dollarsPerJevHour', expect: 'not-up', target: { factor: 5 } }] }] }), /factor/);
  assert.throws(() => parseEras({ eras: [{ ...era, baseline: 'nope' }] }), /baseline/);
});
