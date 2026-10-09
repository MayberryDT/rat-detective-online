#!/usr/bin/env node
// Bot gate metrics (docs/bot-overhaul.md, "Acceptance"): how the bots play, from the city map mirror.
// Usage: node scripts/bot-gate.mjs [--db=output/city/city.db] [--room=public-live-v2,public-live-v3] [--layout=3]
//        [--since=ISO] [--until=ISO] [--mind=<mindVersion>] [--build=<build>|unknown] [--mode=<assignment id>] [--rounds=ordinary|code-only] [--json=out.json]
// `minds` (B5) reads the `decision`, `goal-end` and `minds` facts. Agent rats (`agent=1` browsers) count as neither humans nor bots.
// `--rounds=ordinary` leaves out code-only rounds (from L4, the bots keep the code mind with humans playing), so Jev's cost per
// human-hour counts only the hours Jev could be asked; `code-only` keeps only them. Default: every round.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { actorClasses, buildOf, ratClass } from './lib/traffic.mjs';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const db = new DatabaseSync(arg('db', 'output/city/city.db'), { readOnly: true });
// The public city is both rooms: v2 until the move to Chicago on 9 October, v3 since.
const room = arg('room', 'public-live-v2,public-live-v3'), rooms = room.split(','), layout = Number(arg('layout', '3'));
const since = Date.parse(arg('since', '2000-01-01')), until = Date.parse(arg('until', '2100-01-01'));
const mind = arg('mind', undefined), mode = arg('mode', undefined), build = arg('build', undefined), rounds = arg('rounds', 'all');
if (!['all', 'ordinary', 'code-only'].includes(rounds)) throw new Error('--rounds must be ordinary or code-only');
const inRounds = f => rounds === 'all' || (rounds === 'code-only') === !!f.codeOnly;

/** A jump this long and faster than any rat can run (12 u/s, 17.4 with Hot Pursuit), with no death,
 * respawn or recent launch, is a stuck-bot rescue. An estimate for data recorded before the `rescue` fact (B2b). */
const RESCUE_JUMP = 40, RESCUE_SPEED = 25, FRAME_CAP_S = 6;

const facts = (type) => db.prepare(`select data from facts where type = ? and room in (${rooms.map(() => '?').join(', ')}) and layout = ? and t between ? and ? order by t`)
  .all(type, ...rooms, layout, since, until).map(r => JSON.parse(r.data))
  .filter(f => (mind === undefined || String(f.mindVersion ?? '') === mind) && (mode === undefined || f.mode === mode) && (build === undefined || buildOf(f) === build) && inRounds(f));
const classes = actorClasses(db);
const classOf = (round, a) => classes.get(`${round}:${a}`) ?? 'bot';
const isBot = (round, a) => classOf(round, a) === 'bot';

const frames = facts('frame');
const launches = facts('launch'), deaths = facts('death'), balls = facts('ball'), cases = facts('case'), rescues = facts('rescue');
const anomalies = frames.length ? facts('anomaly').length : 0;

// Alive time per place and per rat, shots and hits from cumulative kda, teleports.
const botTime = new Map(), last = new Map(), kda = new Map(), prevFrameT = new Map();
let botSeconds = 0, humanSeconds = 0, roomSeconds = 0, teleports = 0;
const launchedRecently = (round, a, t) => launches.some(l => l.round === round && l.a === a && t - l.t < 9000 && t >= l.t);
for (const f of frames) {
  const dt = Math.min(FRAME_CAP_S, prevFrameT.has(f.round) ? (f.t - prevFrameT.get(f.round)) / 1000 : 1);
  prevFrameT.set(f.round, f.t); roomSeconds += dt;
  for (const r of f.rats) {
    const who = r.human === undefined ? classOf(f.round, r.a) : ratClass(r);
    if (who === 'agent') continue;
    const key = `${f.round}:${r.a}`, bot = who === 'bot';
    const k = kda.get(key) ?? { first: r.kda, last: r.kda, bot };
    k.last = r.kda; kda.set(key, k);
    if (!r.alive) { last.delete(key); continue; }
    if (bot) { botSeconds += dt; botTime.set(r.place, (botTime.get(r.place) ?? 0) + dt); } else humanSeconds += dt;
    const prev = last.get(key);
    const jump = prev ? Math.hypot(r.p[0] - prev.p[0], r.p[2] - prev.p[2]) : 0, secs = prev ? (f.t - prev.t) / 1000 : 0;
    if (bot && prev && secs > 0 && secs <= 5.5 && r.lifeMs >= prev.lifeMs && jump > RESCUE_JUMP && jump / secs > RESCUE_SPEED && !launchedRecently(f.round, r.a, f.t)) teleports++;
    last.set(key, { t: f.t, p: r.p, lifeMs: r.lifeMs });
  }
}
const botHours = botSeconds / 3600;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const delta = (k, field) => Math.max(0, (k.last?.[field] ?? 0) - (k.first?.[field] ?? 0));
const rows = [...kda.values()];
const shooters = (bot) => rows.filter(k => k.bot === bot);
const botShots = sum(shooters(true).map(k => delta(k, 'shots'))), botHits = sum(shooters(true).map(k => delta(k, 'hits')));

// Humans, per rat-round, for the skill bar (median human).
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const humanRows = shooters(false).filter(k => delta(k, 'shots') >= 30);
const humanHitRate = median(humanRows.map(k => delta(k, 'hits') / delta(k, 'shots')));
const humanKd = median(humanRows.map(k => delta(k, 'k') / Math.max(1, delta(k, 'd'))));

const botDeaths = deaths.filter(d => isBot(d.round, d.victim));
const deathPlaces = new Map(); for (const d of botDeaths) deathPlaces.set(d.vplace, (deathPlaces.get(d.vplace) ?? 0) + 1);
const topShare = (map, n) => { const v = [...map.values()].sort((a, b) => b - a); return sum(v) ? sum(v.slice(0, n)) / sum(v) : null; };
const botKills = deaths.filter(d => d.a !== undefined && d.a !== d.victim && isBot(d.round, d.a) && classOf(d.round, d.victim) !== 'agent').length;
const botHitBalls = balls.filter(b => (b.outcome === 'rat-body' || b.outcome === 'rat-head') && isBot(b.round, b.a));
const round3 = (x) => x === null || x === undefined ? null : Math.round(x * 1000) / 1000;
const perHour = (n) => botHours ? round3(n / botHours) : null;
const perRoomHour = (n) => roomSeconds ? round3(n / (roomSeconds / 3600)) : null;

// Minds (B5): decisions per bot-hour by mind, Jev's share, how goals ended, and Jev's latency and cost.
const decisions = facts('decision'), goalEnds = facts('goal-end'), windows = facts('minds');
const byMind = { jev: decisions.filter(d => d.mind === 'jev').length, code: decisions.filter(d => d.mind === 'code').length };
const goals = {};
for (const e of goalEnds) { const g = goals[e.goal] ??= { ended: 0, reached: 0, died: 0, replaced: 0, failed: 0 }; g.ended++; g[e.outcome]++; }
const jevHours = sum(windows.map(w => w.ms)) / 3_600_000, jev = (field) => sum(windows.map(w => w[field] ?? 0));
// Every reply's latency, pooled over the windows' 20 ms buckets and read at the bucket's middle (as the digest does).
const latency = new Map();
for (const w of windows) for (const [bucket, n] of Object.entries(w.hist ?? {})) latency.set(Number(bucket), (latency.get(Number(bucket)) ?? 0) + n);
const buckets = [...latency].sort((a, b) => a[0] - b[0]), replies = sum(buckets.map(([, n]) => n));
const quantile = (q) => { let seen = 0; for (const [lo, n] of buckets) if ((seen += n) > q * replies) return lo + 10; return null; };
const minds = {
  decisionsPerBotHour: { jev: perHour(byMind.jev), code: perHour(byMind.code) },
  jevShare: byMind.jev + byMind.code ? round3(byMind.jev / (byMind.jev + byMind.code)) : null,
  goalSuccess: Object.fromEntries(Object.entries(goals).sort((a, b) => b[1].ended - a[1].ended).map(([goal, g]) => [goal, { ended: g.ended, reached: round3(g.reached / g.ended),
    died: round3(g.died / g.ended), replaced: round3(g.replaced / g.ended), failed: round3(g.failed / g.ended) }])),
  jev: { hoursOn: round3(jevHours), latencyP50: replies ? quantile(.5) : null, latencyP90: replies ? quantile(.9) : null,
    dollarsPerHourOn: jevHours ? round3(jev('dollars') / jevHours) : null, dollarsPerHumanHour: humanSeconds ? round3(jev('dollars') / (humanSeconds / 3600)) : null,
    fallbackShare: jev('decisions') ? round3(jev('fallbacks') / jev('decisions')) : null, staleShare: jev('answers') ? round3(jev('staleDrops') / jev('answers')) : null },
};

const out = {
  window: { room, layout, since: new Date(Math.max(since, frames[0]?.t ?? since)).toISOString(), until: new Date(Math.min(until, frames.at(-1)?.t ?? until)).toISOString(), mind: mind ?? 'any', build: build ?? 'any', roundKind: rounds, rounds: new Set(frames.map(f => f.round)).size },
  botHours: round3(botHours), humanHours: round3(humanSeconds / 3600), roomHours: round3(roomSeconds / 3600),
  stuck: {
    rescuesPerBotHour: rescues.length ? perHour(rescues.length) : null,
    teleportRescuesPerBotHour: perHour(teleports), anomalies,
  },
  spread: {
    placesVisited: botTime.size, top10PlaceTimeShare: round3(topShare(botTime, 10)),
    deathPlaces: deathPlaces.size, top5DeathShare: round3(topShare(deathPlaces, 5)),
  },
  fighting: {
    deathsPerBotHour: perHour(botDeaths.length), killsPerBotHour: perHour(botKills),
    shotsPerBotMinute: botHours ? round3(botShots / (botHours * 60)) : null, botHitRate: botShots ? round3(botHits / botShots) : null,
    bankedHitShare: botHitBalls.length ? round3(botHitBalls.filter(b => (b.bounces ?? 0) > 0).length / botHitBalls.length) : null,
  },
  case: {
    takesPerRoomHour: perRoomHour(cases.filter(c => c.what === 'take' || c.what === 'steal').length),
    deliveriesPerRoomHour: perRoomHour(cases.filter(c => c.what === 'deliver').length),
    respawnsPerRoomHour: perRoomHour(cases.filter(c => c.what === 'respawn').length),
  },
  skillBar: { humanRats: humanRows.length, medianHumanHitRate: round3(humanHitRate), medianHumanKd: round3(humanKd), botHitRate: botShots ? round3(botHits / botShots) : null,
    botKd: botDeaths.length ? round3(botKills / botDeaths.length) : null },
  minds,
};
console.log(JSON.stringify(out, null, 2));
const json = arg('json', undefined);
if (json) writeFileSync(json, JSON.stringify(out, null, 2) + '\n');
