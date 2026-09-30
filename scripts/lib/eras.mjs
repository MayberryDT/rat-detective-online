// Eras, the scorecard and verdicts (docs/data-plan.md, sections 1, 4 and 5), read from a city mirror (scripts/city-mirror.mjs).
// An era is a period in one environment in which nothing that affects play changed (design/data/eras.json). Eras from
// before build stamps are an environment's time window (and layout and mindVersion); stamped eras are their `build`.
// Every measure is a Reading: a value, its 95% interval, its sample size and whether it clears the city map's minimums.
import { actorClasses, ratClass } from './traffic.mjs';

const Z = 1.959964;
/** The city map's minimums (src/shared/city/measures.ts, verdict.ts): 10 human rat-minutes, 20 events; a verdict needs 30 human minutes. */
export const MIN_HUMAN_SECONDS = 600, MIN_EVENTS = 20, VERDICT_HUMAN_SECONDS = MIN_HUMAN_SECONDS * 3;
/** Frame gaps longer than this (a sleeping room) count as this long, as in scripts/bot-gate.mjs. */
const FRAME_CAP_S = 6;
export const GOAL_OUTCOMES = ['reached', 'replaced', 'failed', 'died'];
/** Distance bands (units) for hit rates, as in the bot overhaul receipt. */
export const BANDS = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 45], [45, 70], [70, Infinity]];

export function wilson(k, n) {
  if (n <= 0) return [0, 1];
  const p = k / n, d = 1 + Z * Z / n, c = p + Z * Z / (2 * n), m = Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
export function poissonInterval(k) {
  const lo = k === 0 ? 0 : k * (1 - 1 / (9 * k) - Z / (3 * Math.sqrt(k))) ** 3;
  const k1 = k + 1, hi = k1 * (1 - 1 / (9 * k1) + Z / (3 * Math.sqrt(k1))) ** 3;
  return [Math.max(0, lo), hi];
}

// Readings. `enough`: the sample clears the minimums, so a verdict may use it.
const share = (k, n, enough = n >= MIN_EVENTS) => { if (n <= 0) return undefined; const [lo, hi] = wilson(k, n); return { value: k / n, lo, hi, n, enough }; };
const perHour = (k, seconds, enough) => { if (seconds <= 0) return undefined; const h = seconds / 3600, [lo, hi] = poissonInterval(k); return { value: k / h, lo: lo / h, hi: hi / h, n: k, enough }; };
/** Σy/Σx over clusters (Jev's one-minute windows), with the ratio estimator's 95% interval: minute-to-minute swings widen it. */
function ratio(pairs, enough) {
  const n = pairs.length, sx = pairs.reduce((s, [, x]) => s + x, 0), sy = pairs.reduce((s, [y]) => s + y, 0);
  if (!n || sx <= 0) return undefined;
  const r = sy / sx, se = n > 1 ? Math.sqrt(n / (n - 1) * pairs.reduce((s, [y, x]) => s + (y - r * x) ** 2, 0)) / sx : Infinity;
  return { value: r, lo: Math.max(0, r - Z * se), hi: r + Z * se, n, enough: enough(n) };
}
/** Median with its order-statistic 95% interval. */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  if (!n) return undefined;
  const half = Z * Math.sqrt(n) / 2, at = i => s[Math.min(n - 1, Math.max(0, i))];
  return { value: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, lo: at(Math.floor(n / 2 - half)), hi: at(Math.ceil(n / 2 + half)), n, enough: n >= MIN_EVENTS };
}
/** |bot - human| for two proportions with variances; the interval of the difference, folded at 0. */
function gap(h, b, enough) {
  if (!h || !b) return undefined;
  const d = b.p - h.p, se = Math.sqrt(h.v + b.v), lo = d - Z * se, hi = d + Z * se;
  return { value: Math.abs(d), lo: lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)), hi: Math.max(Math.abs(lo), Math.abs(hi)), n: Math.min(h.n, b.n), enough };
}

// The era registry.
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
/** Measures a prediction may name (the scorecard's keys). */
const PREDICTABLE = /^(jev\.(requestsPerBotMinute|answerShare|staleShare|fallbackShare|dollarsPerJevHour|latencyP90)|goals\.holdMedianS|goals\.[a-z-]+\.(reached|replaced|failed|died|holdMedianS)|pickups\.passedPerRatHour\.(human|bot)|likeness\.(hitRate\.(human|bot)|hitRateBandGap|blindShare\.(human|bot)|blindShotGap)|players\.(killsPerHumanHour|deathsPerHumanHour))$/;
const EXPECT = ['up', 'down', 'not-up', 'not-down'];

/** The registry, checked: unique ids, a window or a build for every era that has started, well-formed predictions. */
export function parseEras(value) {
  const fail = why => { throw new Error(`Bad eras file: ${why}`); };
  if (!value || !Array.isArray(value.eras)) fail('eras is not a list');
  const ids = new Set();
  for (const [i, e] of value.eras.entries()) {
    const at = `era ${e?.id ?? i}`;
    if (typeof e?.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) fail(`${at}: id must be lower-case words and hyphens`);
    if (ids.has(e.id)) fail(`${at}: duplicate id`);
    ids.add(e.id);
    if (e.environment !== 'production' && e.environment !== 'staging') fail(`${at}: environment is neither production nor staging`);
    if (typeof e.change !== 'string' || !e.change) fail(`${at}: change is missing`);
    for (const k of ['from', 'to']) if (e[k] !== undefined && e[k] !== null && !(typeof e[k] === 'string' && ISO.test(e[k]))) fail(`${at}: ${k} is not a UTC time`);
    if (e.from && e.to && Date.parse(e.to) <= Date.parse(e.from)) fail(`${at}: ends before it starts`);
    if (e.build !== undefined && e.build !== null && (typeof e.build !== 'string' || !e.build)) fail(`${at}: build is not a string`);
    if (e.layout !== undefined && !Number.isInteger(e.layout)) fail(`${at}: layout is not a version`);
    if (e.mindVersion !== undefined && e.mindVersion !== null && !Number.isInteger(e.mindVersion)) fail(`${at}: mindVersion is not a version`);
    if (e.baseline !== undefined && typeof e.baseline !== 'string') fail(`${at}: baseline is not an era id`);
    for (const [j, p] of (e.predictions ?? []).entries()) {
      const pat = `${at} prediction ${p?.id ?? j}`;
      if (typeof p?.id !== 'string' || typeof p.says !== 'string' || !p.says) fail(`${pat}: needs an id and says`);
      if (!PREDICTABLE.test(p.measure ?? '')) fail(`${pat}: unknown measure "${p.measure}"`);
      if (!EXPECT.includes(p.expect)) fail(`${pat}: expect is not one of ${EXPECT.join(', ')}`);
      const t = p.target;
      if (t !== undefined) {
        const keys = Object.keys(t ?? {});
        if (keys.length !== 1 || !['below', 'above', 'factor'].includes(keys[0])) fail(`${pat}: target is one of below, above or factor`);
        if (keys[0] === 'factor' ? !(t.factor > 1) || !['up', 'down'].includes(p.expect) : !(typeof t[keys[0]] === 'number' || PREDICTABLE.test(t[keys[0]])))
          fail(`${pat}: target ${keys[0]} is not a number, a measure, or a factor over 1 on an up or down prediction`);
      }
    }
  }
  for (const e of value.eras) if (e.baseline !== undefined && !ids.has(e.baseline)) fail(`era ${e.id}: baseline ${e.baseline} is not an era`);
  return value.eras;
}

/** Whether an era has anything to select: a start time or a build. Eras planned but not shipped have neither. */
export const started = era => !!(era.from || era.build);

/** The era's facts of the given types, oldest first, parsed. Facts without `build` or `mindVersion` (older recordings) are handled. */
export function eraFacts(db, era, types, now = Date.now()) {
  if (!started(era)) return [];
  const from = era.from ? Date.parse(era.from) : 0, to = era.to ? Date.parse(era.to) : now;
  const hasBuild = !!db.prepare("SELECT 1 FROM pragma_table_info('facts') WHERE name = 'build'").get();
  const where = ['t >= ?', 't < ?', `type IN (${types.map(() => '?').join(', ')})`], params = [from, to, ...types];
  if (era.layout !== undefined) { where.push('layout = ?'); params.push(era.layout); }
  if (era.build && hasBuild) { where.push('build = ?'); params.push(era.build); }
  const out = [];
  for (const row of db.prepare(`SELECT data FROM facts WHERE ${where.join(' AND ')} ORDER BY t`).iterate(...params)) {
    const f = JSON.parse(row.data);
    if (era.build && f.build !== era.build) continue;
    if (era.mindVersion === null && f.mindVersion !== undefined) continue;
    if (Number.isInteger(era.mindVersion) && f.mindVersion !== era.mindVersion) continue;
    out.push(f);
  }
  return out;
}

/** Short GPU name from the WebGL renderer string (drops ANGLE's wrapper, device ids and backend details). */
export function gpuName(gpu) {
  if (!gpu) return 'unknown GPU';
  const angle = /^ANGLE \((.*)\)$/.exec(gpu)?.[1];
  // Drop parentheticals (device ids, driver details) before splitting ANGLE's "vendor, renderer, backend".
  let bare = angle ?? gpu;
  for (let prev = ''; prev !== bare;) { prev = bare; bare = bare.replace(/\s*\([^()]*\)/g, ''); }
  const parts = bare.split(', ');
  const name = (angle && parts.length > 1 ? parts[1] : parts[0]).replace(/^ANGLE \w+ Renderer: /, '').replace(/ (Direct3D|OpenGL|Metal|Vulkan).*$/i, '').replace(/\s+/g, ' ').trim();
  return name.length > 48 ? `${name.slice(0, 47)}…` : name;
}

const TYPES = ['frame', 'minds', 'decision', 'goal-end', 'shot', 'damage', 'death', 'session', 'perf', 'pickup-passed'];

/** The whole scorecard for one era: how much data it has, every measure as a Reading, and the tables behind them. */
export function scorecard(db, era, { now = Date.now(), classes } = {}) {
  const facts = eraFacts(db, era, TYPES, now), by = Object.fromEntries(TYPES.map(t => [t, []]));
  for (const f of facts) by[f.type].push(f);
  const known = classes ?? actorClasses(db), seen = new Map();
  const classOf = (round, a) => seen.get(`${round}:${a}`) ?? known.get(`${round}:${a}`) ?? 'bot';

  // Exposure from the frames: alive seconds per class, bots present in each room over time, K/D/A ledgers per rat-round.
  const alive = { human: 0, bot: 0, agent: 0 }, rounds = new Set(), prevT = new Map(), ledgers = new Map(), botsAt = new Map();
  for (const f of by.frame) {
    const dt = Math.min(FRAME_CAP_S, prevT.has(f.round) ? (f.t - prevT.get(f.round)) / 1000 : 1);
    prevT.set(f.round, f.t); rounds.add(f.round);
    let bots = 0;
    for (const r of f.rats) {
      const who = ratClass(r), key = `${f.round}:${r.a}`;
      if (seen.get(key) !== 'agent') seen.set(key, who);
      if (who === 'bot') bots++;
      if (r.alive) alive[who] += dt;
      if (who !== 'agent' && r.kda) { const l = ledgers.get(key); if (l) l.last = r.kda; else ledgers.set(key, { who, first: r.kda, last: r.kda }); }
    }
    (botsAt.get(f.room) ?? botsAt.set(f.room, []).get(f.room)).push([f.t, bots]);
  }
  const humanS = alive.human, humanEnough = humanS >= VERDICT_HUMAN_SECONDS;
  const sessions = by.session.filter(s => s.what === 'join' && ratClass(s) === 'human').length;
  const m = {}, put = (id, reading) => { if (reading) m[id] = reading; };

  // Jev cost and cadence, from the one-minute `minds` windows. Bot-minutes in a window: the mean number of bots in the
  // room's frames inside it, times its length.
  const windows = by.minds, sum = (xs, k) => xs.reduce((s, w) => s + (w[k] ?? 0), 0), jevEnough = n => n >= MIN_EVENTS;
  const botMinutes = w => {
    const frames = botsAt.get(w.room) ?? [], start = w.t - w.ms;
    let lo = 0, hi = frames.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (frames[mid][0] <= start) lo = mid + 1; else hi = mid; }
    let n = 0, bots = 0;
    for (let i = lo; i < frames.length && frames[i][0] <= w.t; i++) { n++; bots += frames[i][1]; }
    return n ? bots / n * w.ms / 60_000 : 0;
  };
  put('jev.requestsPerBotMinute', ratio(windows.map(w => [w.requests ?? 0, botMinutes(w)]).filter(([, x]) => x > 0), jevEnough));
  put('jev.dollarsPerJevHour', ratio(windows.map(w => [w.dollars ?? 0, w.ms / 3_600_000]), jevEnough));
  const requests = sum(windows, 'requests'), answers = sum(windows, 'answers'), dollars = sum(windows, 'dollars'), jevS = sum(windows, 'ms') / 1000;
  put('jev.answerShare', share(answers, requests));
  put('jev.staleShare', share(sum(windows, 'staleDrops'), answers));
  put('jev.fallbackShare', share(sum(windows, 'fallbacks'), sum(windows, 'decisions')));
  // Reply latency pooled over the windows' 20 ms buckets, read at the bucket's middle, with order-statistic bounds.
  const hist = new Map();
  for (const w of windows) for (const [b, n] of Object.entries(w.hist ?? {})) hist.set(Number(b), (hist.get(Number(b)) ?? 0) + n);
  const buckets = [...hist].sort((a, b) => a[0] - b[0]), replies = buckets.reduce((s, [, n]) => s + n, 0);
  const at = rank => { let c = 0; for (const [lo, n] of buckets) if ((c += n) > rank) return lo + 10; return buckets.at(-1)[0] + 10; };
  if (replies) {
    const half = Z * Math.sqrt(replies * .9 * .1);
    put('jev.latencyP90', { value: at(.9 * replies), lo: at(Math.max(0, .9 * replies - half)), hi: at(Math.min(replies - 1, .9 * replies + half)), n: replies, enough: replies >= MIN_EVENTS });
  }
  if (dollars && humanS) put('jev.dollarsPerHumanHour', { value: dollars / (humanS / 3600), n: windows.length, enough: humanEnough });

  // Bot decisions: how long goals are held and how they end, per goal (all minds; `jev` and `code` split in the table).
  const ends = by['goal-end'], goals = new Map();
  put('goals.holdMedianS', median(ends.map(e => e.durationMs / 1000)));
  for (const e of ends) {
    const g = goals.get(e.goal) ?? goals.set(e.goal, { n: 0, jev: 0, held: [], reached: 0, replaced: 0, failed: 0, died: 0 }).get(e.goal);
    g.n++; g[e.outcome]++; g.held.push(e.durationMs / 1000); if (e.mind === 'jev') g.jev++;
  }
  for (const [goal, g] of goals) {
    for (const o of GOAL_OUTCOMES) put(`goals.${goal}.${o}`, share(g[o], g.n));
    put(`goals.${goal}.holdMedianS`, median(g.held));
  }
  const decisions = { jev: by.decision.filter(d => d.mind === 'jev').length, code: by.decision.filter(d => d.mind === 'code').length };
  const withInputs = by.decision.filter(d => d.in).length;

  // Pickups passed (new in release A): usable supplies within reach a rat did not claim, per alive rat-hour.
  const passed = { human: 0, bot: 0 };
  for (const p of by['pickup-passed']) { const who = classOf(p.round, p.a); if (who !== 'agent') passed[who]++; }
  const passedRecorded = by['pickup-passed'].length > 0;
  if (passedRecorded) {
    put('pickups.passedPerRatHour.human', perHour(passed.human, alive.human, humanEnough));
    put('pickups.passedPerRatHour.bot', perHour(passed.bot, alive.bot, passed.bot >= MIN_EVENTS || alive.bot >= VERDICT_HUMAN_SECONDS));
  }

  // Human-likeness. Overall hit rate from the round ledgers (every shot); by distance and blind shots from `shot` facts
  // (every human shot, one bot shot in `sample`), recorded with `targets` since the aim recording of 30 September.
  const fire = { human: { shots: 0, hits: 0 }, bot: { shots: 0, hits: 0 } };
  for (const l of ledgers.values()) { fire[l.who].shots += Math.max(0, (l.last.shots ?? 0) - (l.first.shots ?? 0)); fire[l.who].hits += Math.max(0, (l.last.hits ?? 0) - (l.first.hits ?? 0)); }
  for (const who of ['human', 'bot']) put(`likeness.hitRate.${who}`, share(fire[who].hits, fire[who].shots, fire[who].shots >= MIN_EVENTS && humanEnough));
  const band = d => BANDS.findIndex(([lo, hi]) => d >= lo && d < hi);
  const aimed = { human: BANDS.map(() => ({ shots: 0, sampled: 0, hits: 0 })), bot: BANDS.map(() => ({ shots: 0, sampled: 0, hits: 0 })) };
  const blind = { human: { k: 0, n: 0 }, bot: { k: 0, n: 0 } };
  for (const s of by.shot) {
    const who = ratClass(s);
    if (who === 'agent' || !Array.isArray(s.targets)) continue;
    blind[who].n++;
    if (!s.targets.length) { blind[who].k++; continue; }
    // The rat nearest the aim line (smallest angle off its chest) is the one the shot was aimed at.
    const b = band(s.targets.reduce((best, t) => ((t.e ?? 0) < (best.e ?? 0) ? t : best)).d);
    if (b >= 0) { aimed[who][b].shots += s.sample ?? 1; aimed[who][b].sampled++; }
  }
  // Hits: every non-explosive rat-on-rat hit, banded by distance at impact.
  for (const d of by.damage) {
    if (d.explosive || d.missile || d.a === undefined || d.a === d.victim || !(d.dist >= 0)) continue;
    const who = classOf(d.round, d.a), b = band(d.dist);
    if (who !== 'agent' && b >= 0) aimed[who][b].hits++;
  }
  const aimedRecorded = blind.human.n + blind.bot.n > 0;
  const bandRate = x => { if (x.sampled < MIN_EVENTS) return undefined; const p = x.hits / x.shots; return { p, v: x.hits / x.shots ** 2 + p * p / x.sampled, n: x.sampled }; };
  const bandRows = BANDS.map(([lo, hi], i) => ({ band: hi === Infinity ? `over ${lo}` : `${lo}–${hi}`, human: aimed.human[i], bot: aimed.bot[i], h: bandRate(aimed.human[i]), b: bandRate(aimed.bot[i]) }));
  const both = bandRows.filter(r => r.h && r.b);
  if (both.length) {
    const d = both.map(r => ({ g: Math.abs(r.b.p - r.h.p), v: r.b.v + r.h.v })), k = d.length, g = d.reduce((s, x) => s + x.g, 0) / k;
    const se = Math.sqrt(d.reduce((s, x) => s + x.v, 0)) / k;
    put('likeness.hitRateBandGap', { value: g, lo: Math.max(0, g - Z * se), hi: g + Z * se, n: k, enough: humanEnough && k >= 3 });
  }
  for (const who of ['human', 'bot']) put(`likeness.blindShare.${who}`, share(blind[who].k, blind[who].n, blind[who].n >= MIN_EVENTS && humanEnough));
  const prop = x => (x.n ? { p: x.k / x.n, v: (x.k / x.n) * (1 - x.k / x.n) / x.n, n: x.n } : undefined);
  put('likeness.blindShotGap', gap(prop(blind.human), prop(blind.bot), humanEnough && blind.human.n >= MIN_EVENTS && blind.bot.n >= MIN_EVENTS));

  // Players: kills and deaths between humans and bots.
  const kills = { 'human-bot': 0, 'bot-human': 0, 'human-human': 0, 'bot-bot': 0, 'city-human': 0, 'city-bot': 0 };
  for (const d of by.death) {
    const victim = classOf(d.round, d.victim);
    if (victim === 'agent') continue;
    const killer = d.a === undefined || d.a === d.victim ? 'city' : classOf(d.round, d.a);
    if (killer !== 'agent') kills[`${killer}-${victim}`]++;
  }
  const humanKills = kills['human-bot'] + kills['human-human'], humanDeaths = kills['bot-human'] + kills['human-human'] + kills['city-human'];
  put('players.killsPerHumanHour', perHour(humanKills, humanS, humanEnough));
  put('players.deathsPerHumanHour', perHour(humanDeaths, humanS, humanEnough));

  // Game health: humans' perf reports by operating system and GPU.
  const perf = new Map();
  for (const p of by.perf) {
    if (p.agent) continue;
    const key = `${p.os ?? 'unknown OS'} · ${gpuName(p.gpu)}`, g = perf.get(key) ?? perf.set(key, { reports: 0, ms: 0, fps50: [], fps95: [] }).get(key);
    g.reports++; g.ms += p.ms ?? 0;
    if (p.fps50 > 0) g.fps50.push(p.fps50);
    if (p.p95 > 0) g.fps95.push(1000 / p.p95);
  }
  const agentPerf = by.perf.filter(p => p.agent).length;

  const first = facts[0]?.t, last = facts.at(-1)?.t;
  return {
    era: era.id,
    window: { from: era.from ?? null, to: era.to ?? null, firstFact: first ?? null, lastFact: last ?? null },
    data: { facts: facts.length, rounds: rounds.size, humanHours: humanS / 3600, humanSessions: sessions, agentHours: alive.agent / 3600, botHours: alive.bot / 3600,
      jevHours: jevS / 3600, jevWindows: windows.length, decisions, decisionsWithInputs: withInputs, goalEnds: ends.length, stamped: facts.filter(f => f.build).length },
    cost: { dollars, requests, answers, tokens: sum(windows, 'tokens') },
    measures: m,
    tables: {
      goals: [...goals].sort((a, b) => b[1].n - a[1].n).map(([goal, g]) => ({ goal, n: g.n, jev: g.jev })),
      bands: bandRows.map(r => ({ band: r.band, human: { shots: r.human.shots, hits: r.human.hits, rate: r.h?.p ?? null }, bot: { shots: r.bot.shots, hits: r.bot.hits, rate: r.b?.p ?? null } })),
      kills,
      perf: [...perf].sort((a, b) => b[1].ms - a[1].ms).map(([machine, g]) => ({ machine, reports: g.reports, minutes: g.ms / 60_000, fps50: median(g.fps50)?.value ?? null, fps95: median(g.fps95)?.value ?? null })),
      agentPerfReports: agentPerf,
    },
    recorded: { shotTargets: aimedRecorded, pickupPassed: passedRecorded, decisionInputs: withInputs > 0, perf: by.perf.length > 0, build: facts.some(f => f.build) },
  };
}

/** The value a target names: a number, or another measure's reading in the after era. */
const targetReading = (value, after) => (typeof value === 'number' ? { value, lo: value, hi: value, enough: true } : after?.measures[value]);

/**
 * A prediction's verdict from the before and after scorecards: `met`, `missed`, `unclear` (too close to call) or `waiting`
 * (either side is short of the minimums, or has no reading). Called only when intervals part, as the layout verdicts are.
 * - no target: met when the after interval lies wholly past the before interval in the predicted direction, missed when
 *   wholly the other way;
 * - `not-up` / `not-down` (no worse): missed when after lies wholly above (below) before; met when after's far end is no
 *   further than before's;
 * - `below` / `above` a number or a measure of the after era: met when after's interval is wholly on that side;
 * - `factor` F: `down` is met when after's top is at most before's bottom / F; `up` when after's bottom is at least F × before's top.
 */
export function judgePrediction(p, before, after) {
  const a = after?.measures[p.measure], b = before?.measures[p.measure];
  const readings = { before: b, after: a };
  const t = p.target ?? {}, bound = t.below ?? t.above, other = bound === undefined ? undefined : targetReading(bound, after);
  const needsBefore = bound === undefined;
  if (!a?.enough || (needsBefore && !b?.enough) || (bound !== undefined && !other?.enough)) return { ...readings, outcome: 'waiting' };
  const outcome = t.below !== undefined ? (a.hi < other.lo ? 'met' : a.lo > other.hi ? 'missed' : 'unclear')
    : t.above !== undefined ? (a.lo > other.hi ? 'met' : a.hi < other.lo ? 'missed' : 'unclear')
    : t.factor !== undefined ? (p.expect === 'down'
      ? (a.hi <= b.lo / t.factor ? 'met' : a.lo > b.hi / t.factor ? 'missed' : 'unclear')
      : (a.lo >= b.hi * t.factor ? 'met' : a.hi < b.lo * t.factor ? 'missed' : 'unclear'))
    : p.expect === 'not-up' ? (a.lo > b.hi ? 'missed' : a.hi <= b.hi ? 'met' : 'unclear')
    : p.expect === 'not-down' ? (a.hi < b.lo ? 'missed' : a.lo >= b.lo ? 'met' : 'unclear')
    : (() => { const up = a.lo > b.hi, down = a.hi < b.lo; return !up && !down ? 'unclear' : up === (p.expect === 'up') ? 'met' : 'missed'; })();
  return { ...readings, outcome };
}
