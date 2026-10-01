// Agents only: one round's case file as a self-contained HTML page, read from the city mirror (scripts/city-mirror.mjs):
// the round across the board (standings, the race, the case, deaths, the map, supplies, the air, incidents, minds,
// frame rate), then everything about shooting (volume, rate of fire, accuracy, distance, aim, lead, ball fates, banks,
// headshots, time to kill). Bots' shot facts are one in ten (`sample: 10`) and count ten each; their exact totals come
// from the round's final standings.
// Usage: node scripts/round-report.mjs <round-id> [--db=output/city/city.db] [--out=output/reports/round-<id8>.html]
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { db: { type: 'string', default: 'output/city/city.db' }, out: { type: 'string' } } });
const ROUND = positionals[0];
if (!ROUND) { console.error('Usage: node scripts/round-report.mjs <round-id> [--db=…] [--out=…]'); process.exit(1); }
const db = new DatabaseSync(values.db, { readOnly: true });
const facts = type => db.prepare('SELECT data FROM facts WHERE round = ? AND type = ? ORDER BY t').all(ROUND, type).map(r => JSON.parse(r.data));

const rounds = facts('round'), start = rounds.find(f => f.what === 'start'), end = rounds.find(f => f.what === 'end');
if (!start || !end) { console.error(`Round ${ROUND} has no ${start ? 'end' : 'start'} in the mirror; run scripts/city-mirror.mjs.`); process.exit(1); }
const T0 = start.t, T1 = end.t, MIN = t => (t - T0) / 60000, DUR = MIN(T1);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
/** Counts per bin: `edges` are lower bounds, the last bin open-ended. */
const hist = (edges, items, value = x => x, weight = () => 1) => { const c = edges.map(() => 0); for (const it of items) { const v = value(it); if (v == null || Number.isNaN(v)) continue; let i = edges.length - 1; while (i > 0 && v < edges[i]) i--; c[i] += weight(it); } return c; };

// ---- Rats: who played, alive time, air time and presence from the situations (one row per rat per frame).
const sits = db.prepare('SELECT t, a, human, agent, alive, place, carrying FROM situations WHERE round = ? ORDER BY t').all(ROUND);
const frameTimes = [...new Set(sits.map(s => s.t))].sort((x, y) => x - y), nextFrame = new Map(frameTimes.map((t, i) => [t, frameTimes[i + 1] ?? t + 1000]));
const standing = new Map(end.standings.map(s => [s.a, s]));
const rats = new Map();
const rat = (a, human, agent) => { let r = rats.get(a); if (!r) rats.set(a, r = { a, human: !!human, agent: !!agent, aliveS: 0, airS: 0, presentS: 0, firstMin: null }); return r; };
for (const s of end.standings) rat(s.a, s.human, false);
for (const s of sits) {
  const r = rat(s.a, s.human, s.agent), dt = Math.min(6000, nextFrame.get(s.t) - s.t) / 1000;
  r.presentS += dt; if (r.firstMin === null) r.firstMin = MIN(s.t);
  if (s.alive) { r.aliveS += dt; if (s.place?.startsWith('air:')) r.airS += dt; }
}
const isHuman = a => rats.get(a)?.human ?? false, cls = a => a == null ? 'none' : isHuman(a) ? 'H' : 'B';
const humans = [...rats.values()].filter(r => r.human).map(r => r.a).sort((x, y) => x - y), bots = [...rats.values()].filter(r => !r.human).map(r => r.a).sort((x, y) => x - y);
const HUMAN_COLORS = ['#f2c14e', '#ff6b4a', '#7fe0c0', '#e58fd8'], BOT_COLORS = ['#7f97c9', '#5fa8a0', '#a08fc9', '#8fb07a', '#c99a7f', '#6f88a8', '#b3a26a', '#9aa3b5', '#8aa7a0', '#a8909a'];
const label = a => isHuman(a) ? `Human #${a}` : `Bot #${a}`;
const color = a => isHuman(a) ? HUMAN_COLORS[humans.indexOf(a) % HUMAN_COLORS.length] : BOT_COLORS[bots.indexOf(a) % BOT_COLORS.length];

// ---- Facts.
const deaths = facts('death'), damage = facts('damage'), cases = facts('case'), shots = facts('shot'), balls = facts('ball');
const pickups = facts('pickup'), passed = facts('pickup-passed'), launches = facts('launch'), landings = facts('landing');
const dispatch = facts('dispatch'), minds = facts('minds'), perf = facts('perf'), sessions = facts('session'), rescues = facts('rescue');
const shotHits = damage.filter(d => !d.explosive && d.a != null);

// The case: who held it when, and how each carry ended.
const holder = []; let cur = null;
for (const c of cases) {
  if (cur) { cur.to = MIN(c.t); holder.push(cur); cur = null; }
  if (c.what === 'take' || c.what === 'steal') cur = { a: c.a, from: MIN(c.t) };
}
if (cur) { cur.to = DUR; holder.push(cur); }
// Since protocol 26 a drop names its cause; older drops count as a death when the carrier died within 300 ms.
const drops = cases.filter(c => c.what === 'drop').map(c => ({ ...c, killed: c.cause ? c.cause === 'death' : deaths.some(d => d.victim === c.a && Math.abs(d.t - c.t) < 300) }));

// Incidents: each active stretch until Dispatch leaves the active phase. Most Wanted repeats `active` when the wanted rat changes.
const incidents = [];
dispatch.forEach((d, i) => {
  if (d.phase !== 'active' || !d.incident || (dispatch[i - 1]?.phase === 'active' && dispatch[i - 1].incident === d.incident)) return;
  const end = dispatch.slice(i + 1).find(x => x.phase !== 'active' || x.incident !== d.incident);
  incidents.push({ id: d.incident, from: MIN(d.t), to: MIN(end?.t ?? T1) });
});
const incidentAt = t => { const m = MIN(t); return incidents.find(s => m >= s.from && m < s.to)?.id ?? 'none'; };

// ---- Per-rat standings.
const heldMin = a => sum(holder.filter(h => h.a === a), h => h.to - h.from);
const ratRows = [...rats.values()].sort((x, y) => (standing.get(y.a)?.standing.raw ?? 0) - (standing.get(x.a)?.standing.raw ?? 0) || (standing.get(y.a)?.kda.k ?? 0) - (standing.get(x.a)?.kda.k ?? 0)).map(r => {
  const s = standing.get(r.a), k = s?.kda ?? { k: 0, d: 0, a: 0, dmgOut: 0, dmgIn: 0, hs: 0, shots: 0, hits: 0 }, aliveMin = r.aliveS / 60;
  return {
    a: r.a, label: label(r.a), human: r.human, color: color(r.a), win: end.winner === r.a,
    k: k.k, d: k.d, as: k.a, kd: k.d ? r2(k.k / k.d) : k.k, raw: s?.standing.raw ?? 0, progress: s?.standing.progress ?? 0,
    dmgOut: k.dmgOut, dmgIn: k.dmgIn, hs: k.hs, shots: k.shots, hits: k.hits, acc: k.shots ? r3(k.hits / k.shots) : 0,
    aliveMin: r1(aliveMin), presentMin: r1(r.presentS / 60), airMin: r1(r.airS / 60), joinMin: r1(r.firstMin ?? 0),
    killsPerMin: aliveMin ? r2(k.k / aliveMin) : 0, shotsPerMin: aliveMin ? Math.round(k.shots / aliveMin) : 0,
    shotsPerKill: k.k ? Math.round(k.shots / k.k) : null, dmgPer100: k.shots ? r2(100 * k.dmgOut / k.shots) : 0,
    heldMin: r1(heldMin(r.a)), takes: cases.filter(c => (c.what === 'take' || c.what === 'steal') && c.a === r.a).length,
    supplies: pickups.filter(p => p.a === r.a).length, launches: launches.filter(l => l.a === r.a).length,
    headshotKills: deaths.filter(d => d.a === r.a && d.cause === 'headshot').length,
  };
});
const byClass = c => ratRows.filter(r => (c === 'H') === r.human);
const classTotals = c => { const rs = byClass(c), alive = sum(rs, r => r.aliveMin); return { rats: rs.length, aliveMin: r1(alive), shots: sum(rs, r => r.shots), hits: sum(rs, r => r.hits), k: sum(rs, r => r.k), d: sum(rs, r => r.d), hs: sum(rs, r => r.hs), dmgOut: sum(rs, r => r.dmgOut) }; };
const TOT = { H: classTotals('H'), B: classTotals('B') };

// ---- The race: each rat's share of the win over time.
const race = new Map();
for (const s of db.prepare('SELECT t, a, progress FROM situations WHERE round = ? ORDER BY t').all(ROUND)) {
  const pts = race.get(s.a) ?? (race.set(s.a, []), race.get(s.a)), last = pts.at(-1);
  if (!last || last[1] !== s.progress) pts.push([r2(MIN(s.t)), s.progress ?? 0]);
}
for (const s of end.standings) { const pts = race.get(s.a) ?? (race.set(s.a, []), race.get(s.a)); if (pts.at(-1)?.[1] !== s.standing.progress) pts.push([r2(DUR), s.standing.progress]); }

// ---- Kills per minute by killer and victim class.
const killsPerMin = Array.from({ length: Math.ceil(DUR) }, (_, m) => ({ m, HH: 0, HB: 0, BH: 0, BB: 0, other: 0 }));
for (const d of deaths) { const b = killsPerMin[Math.min(killsPerMin.length - 1, Math.floor(MIN(d.t)))], k = cls(d.a) + cls(d.victim); if (k in b) b[k]++; else b.other++; }

// ---- Deaths.
const LIFE_EDGES = [0, 5, 10, 20, 30, 45, 60, 90, 120, 180, 300];
const deathsOf = c => deaths.filter(d => cls(d.victim) === c);
const matrix = (items, key) => { const order = ratRows.map(r => r.a), m = order.map(() => order.map(() => 0)); for (const x of items) { const i = order.indexOf(x.a), j = order.indexOf(x[key]); if (i >= 0 && j >= 0) m[i][j]++; } return { order, labels: order.map(label), colors: order.map(color), m }; };

// ---- The map.
const layoutFile = (() => { for (const v of [end.layout, 5, 4, 3]) { try { return JSON.parse(readFileSync(`design/city/layouts/layout-${v}.json`, 'utf8')); } catch { /* the next older snapshot */ } } return null; })();
const ents = db.prepare('SELECT kind, x, z, detail FROM entities').all();
const map = {
  bounds: { min: -196, max: 166 }, layout: layoutFile?.layoutVersion ?? null,
  footprints: layoutFile?.footprints ?? [], water: layoutFile?.water ?? [],
  sites: ents.filter(e => e.kind === 'pickup').map(e => [e.x, e.z, JSON.parse(e.detail || '{}').pickup]),
  launchers: ents.filter(e => e.kind === 'launcher').map(e => [e.x, e.z, JSON.parse(e.detail || '{}').machine]),
  deaths: deaths.filter(d => d.vp).map(d => [r1(d.vp[0]), r1(d.vp[2]), cls(d.a), cls(d.victim), d.cause === 'headshot' ? 1 : 0]),
  humanHits: shotHits.filter(d => isHuman(d.a) && d.ap && d.vp).map(d => [r1(d.ap[0]), r1(d.ap[2]), r1(d.vp[0]), r1(d.vp[2]), d.head ? 1 : 0, d.a]),
};

// ---- Supplies, air, incidents, minds, frame rate.
const KINDS = [...new Set([...pickups.map(p => p.kind), ...map.sites.map(s => s[2])])].filter(Boolean);
const aliveHours = c => TOT[c].aliveMin / 60;
const supplies = KINDS.map(kind => ({ kind, H: pickups.filter(p => p.kind === kind && isHuman(p.a)).length, B: pickups.filter(p => p.kind === kind && !isHuman(p.a)).length,
  passedH: passed.filter(p => p.kind === kind && isHuman(p.a)).length, passedB: passed.filter(p => p.kind === kind && !isHuman(p.a)).length }))
  .map(s => ({ ...s, perHourH: aliveHours('H') ? r1(s.H / aliveHours('H')) : 0, perHourB: aliveHours('B') ? r1(s.B / aliveHours('B')) : 0 }));
const machineOf = l => l.machine ?? 'vent', MACHINES = [...new Set(launches.map(machineOf))];
const air = {
  H: { airMin: r1(sum(byClass('H'), r => r.airMin)), aliveMin: TOT.H.aliveMin, launches: launches.filter(l => isHuman(l.a)).length, airtimeS: Math.round(sum(landings.filter(l => isHuman(l.a)), l => l.airMs ?? 0) / 1000) },
  B: { airMin: r1(sum(byClass('B'), r => r.airMin)), aliveMin: TOT.B.aliveMin, launches: launches.filter(l => !isHuman(l.a)).length, airtimeS: Math.round(sum(landings.filter(l => !isHuman(l.a)), l => l.airMs ?? 0) / 1000) },
  machines: MACHINES.map(m => ({ m, H: launches.filter(l => machineOf(l) === m && isHuman(l.a)).length, B: launches.filter(l => machineOf(l) === m && !isHuman(l.a)).length })),
  killsFromAir: deaths.filter(d => d.aplace?.startsWith('air:')).length, deathsInAir: deaths.filter(d => d.vplace?.startsWith('air:')).length,
};
const botWeight = s => s.sample ?? 1;
const incidentStats = [...new Set(incidents.map(s => s.id))].map(id => {
  const spans = incidents.filter(s => s.id === id), minutes = sum(spans, s => s.to - s.from), inside = t => spans.some(s => MIN(t) >= s.from && MIN(t) < s.to);
  const hShots = shots.filter(s => isHuman(s.a) && inside(s.t)).length, hHits = shotHits.filter(d => isHuman(d.a) && inside(d.t)).length;
  const bShots = sum(shots.filter(s => !isHuman(s.a) && inside(s.t)), botWeight), bHits = shotHits.filter(d => !isHuman(d.a) && inside(d.t)).length;
  return { id, count: spans.length, minutes: r1(minutes), killsPerMin: minutes ? r2(deaths.filter(d => inside(d.t)).length / minutes) : 0,
    accH: hShots ? r3(hHits / hShots) : null, accB: bShots ? r3(bHits / bShots) : null, hShots, bShots };
}).sort((x, y) => y.count - x.count);
const quiet = (() => { const out = t => incidentAt(t) === 'none', mins = DUR - sum(incidents, s => s.to - s.from);
  const hS = shots.filter(s => isHuman(s.a) && out(s.t)).length, hH = shotHits.filter(d => isHuman(d.a) && out(d.t)).length, bS = sum(shots.filter(s => !isHuman(s.a) && out(s.t)), botWeight), bH = shotHits.filter(d => !isHuman(d.a) && out(d.t)).length;
  return { id: 'none', count: 0, minutes: r1(mins), killsPerMin: mins ? r2(deaths.filter(d => out(d.t)).length / mins) : 0, accH: hS ? r3(hH / hS) : null, accB: bS ? r3(bH / bS) : null, hShots: hS, bShots: bS }; })();
const mind = { windows: minds.length, decisions: sum(minds, m => m.decisions ?? 0), requests: sum(minds, m => m.requests ?? 0), answers: sum(minds, m => m.answers ?? 0),
  fallbacks: sum(minds, m => m.fallbacks ?? 0), staleDrops: sum(minds, m => m.staleDrops ?? 0), failures: sum(minds, m => m.failures ?? 0), dollars: r3(sum(minds, m => m.dollars ?? 0)),
  p50: median(minds.map(m => m.p50).filter(Boolean)), p90: median(minds.map(m => m.p90).filter(Boolean)) };
const perfSeries = humans.map(a => ({ a, label: label(a), color: color(a), gpu: perf.filter(p => p.a === a).at(-1)?.gpu ?? null,
  pts: perf.filter(p => p.a === a).map(p => [r2(MIN(p.t)), p.fps, p.p95, p.cpu95, p.heapMb, p.rtt ?? null, p.viewBot ?? null, p.viewHuman ?? null]) }));

// ---- Shooting.
const GAP_EDGES = [0, 60, 90, 120, 150, 200, 250, 300, 400, 600, 1000, 2000, 5000];
const humanShots = a => shots.filter(s => s.a === a);
const gaps = humans.map(a => ({ a, label: label(a), color: color(a), counts: hist(GAP_EDGES, humanShots(a).map(s => s.gapMs).filter(g => g != null)) }));
const BURST_GAP = 600, BURST_EDGES = [1, 2, 3, 5, 10, 20, 40, 80];
const bursts = humans.map(a => {
  const list = []; let b = null;
  for (const s of humanShots(a)) { if (b && s.t - b.last <= BURST_GAP) { b.n++; b.last = s.t; } else { if (b) list.push(b); b = { n: 1, first: s.t, last: s.t }; } }
  if (b) list.push(b);
  const rates = list.filter(x => x.n >= 5).map(x => (x.n - 1) / ((x.last - x.first) / 1000));
  return { a, label: label(a), color: color(a), counts: hist(BURST_EDGES, list.map(x => x.n)), bursts: list.length, longest: Math.max(0, ...list.map(x => x.n)),
    longestS: r1(Math.max(0, ...list.map(x => (x.last - x.first) / 1000))), clicksPerS: r1(median(rates) ?? 0), clicksPerSP90: r1(quantile(rates, .9) ?? 0), shotsPerBurst: r1(median(list.map(x => x.n)) ?? 0) };
});
const shotTimeline = Array.from({ length: Math.ceil(DUR) }, (_, m) => ({ m, ...Object.fromEntries(humans.map(a => [a, 0])), bots: 0 }));
for (const s of shots) { const b = shotTimeline[Math.min(shotTimeline.length - 1, Math.floor(MIN(s.t)))]; if (isHuman(s.a)) b[s.a]++; else b.bots += botWeight(s); }
const aimed = c => shots.filter(s => cls(s.a) === c);
const noTarget = c => { const all = aimed(c), w = sum(all, botWeight); return w ? r3(sum(all.filter(s => !s.targets?.length), botWeight) / w) : 0; };
const DIST_EDGES = [0, 10, 20, 30, 40, 50, 60, 80, 100, 130];
const target = s => s.targets?.[0];
const distShots = c => hist(DIST_EDGES, aimed(c).filter(target), s => target(s).d, botWeight);
const distHits = c => hist(DIST_EDGES, shotHits.filter(d => cls(d.a) === c && d.dist != null), d => d.dist);
const AIM_EDGES = [0, 1, 2, 3, 4, 6, 8, 12, 20, 30, 60];
const DEG = 180 / Math.PI;
const aimErr = c => hist(AIM_EDGES, aimed(c).filter(target), s => target(s).e * DEG, botWeight);
const LEAD_EDGES = [-90, -8, -4, -2, -1, 0, 1, 2, 4, 8];
const crossing = c => aimed(c).filter(s => target(s)?.lead != null && target(s).lat >= 3 && target(s).e * DEG < 12);
const lead = c => hist(LEAD_EDGES, crossing(c), s => Math.asin(Math.max(-1, Math.min(1, target(s).lead))) * DEG, botWeight);
const neededLead = r2(Math.atan((median([...crossing('H'), ...crossing('B')].map(s => target(s).lat)) ?? 0) / 175) * DEG);
const OUTCOMES = ['rat-body', 'rat-head', 'case-contact', 'pressure-contact', 'dispatch-contact', 'ironclad-reflect', 'fake-case', 'capacity', 'lifetime'];
const fates = humans.map(a => { const mine = balls.filter(b => b.a === a); return { a, label: label(a), color: color(a), total: mine.length, counts: Object.fromEntries([...new Set([...OUTCOMES, ...mine.map(b => b.outcome)])].map(o => [o, mine.filter(b => b.outcome === o).length])) }; });
const bank = humans.map(a => { const hits = balls.filter(b => b.a === a && (b.outcome === 'rat-body' || b.outcome === 'rat-head')); return { a, label: label(a), color: color(a), hits: hits.length, banked: hits.filter(b => (b.bounces ?? 0) >= 1).length, bounces: hist([0, 1, 2, 3, 4], hits, b => b.bounces ?? 0) }; });
const headshots = ['H', 'B'].map(c => { const k = deaths.filter(d => cls(d.a) === c && (d.cause === 'shot' || d.cause === 'headshot')), h = shotHits.filter(d => cls(d.a) === c);
  return { c, killShare: k.length ? r3(k.filter(d => d.cause === 'headshot').length / k.length) : 0, hitShare: h.length ? r3(h.filter(d => d.head).length / h.length) : 0, kills: k.length, hits: h.length }; });
// Time to kill: from the killer's first hit on the victim in that life to the death; and every hit the victim took that life.
const TTK_EDGES = [0, .25, .5, 1, 2, 3, 5, 8], TAKEN_EDGES = [1, 2, 3, 4, 5, 6, 8];
const ttk = ['H', 'B'].map(c => {
  const ks = deaths.filter(d => cls(d.a) === c && (d.cause === 'shot' || d.cause === 'headshot') && d.lifeMs != null), secs = [], taken = [], byKiller = [];
  for (const d of ks) {
    const life = shotHits.filter(x => x.victim === d.victim && x.t > d.t - d.lifeMs && x.t <= d.t), mine = life.filter(x => x.a === d.a);
    if (mine.length) secs.push((d.t - mine[0].t) / 1000);
    taken.push(life.length); byKiller.push(mine.length);
  }
  return { c, kills: ks.length, ttk: hist(TTK_EDGES, secs), medianS: r2(median(secs) ?? 0), oneShot: r3(secs.filter(s => s === 0).length / (secs.length || 1)), taken: hist(TAKEN_EDGES, taken), byKiller: hist(TAKEN_EDGES, byKiller) };
});
const BIN = 5, accOverTime = Array.from({ length: Math.ceil(DUR / BIN) }, (_, i) => {
  const from = i * BIN, to = from + BIN, at = t => MIN(t) >= from && MIN(t) < to, row = { from };
  for (const a of humans) { const s = shots.filter(x => x.a === a && at(x.t)).length, h = shotHits.filter(x => x.a === a && at(x.t)).length; row[a] = s ? r3(h / s) : null; }
  const bs = sum(shots.filter(x => !isHuman(x.a) && at(x.t)), botWeight), bh = shotHits.filter(x => !isHuman(x.a) && at(x.t)).length; row.bots = bs ? r3(bh / bs) : null;
  return row;
});
const KILL_EDGES = [0, 10, 20, 30, 40, 50, 60, 80, 100];
const shooting = {
  totals: { shots: sum(ratRows, r => r.shots), hits: sum(ratRows, r => r.hits), H: TOT.H, B: TOT.B, humanBalls: balls.filter(b => isHuman(b.a)).length },
  gapEdges: GAP_EDGES, gaps, burstEdges: BURST_EDGES, bursts, burstGap: BURST_GAP, timeline: shotTimeline,
  noTarget: { H: noTarget('H'), B: noTarget('B') },
  distEdges: DIST_EDGES, dist: { H: { shots: distShots('H'), hits: distHits('H') }, B: { shots: distShots('B'), hits: distHits('B') } },
  aimEdges: AIM_EDGES, aim: { H: aimErr('H'), B: aimErr('B') }, aimMedian: { H: r2(median(aimed('H').filter(target).map(s => target(s).e * DEG)) ?? 0), B: r2(median(aimed('B').filter(target).map(s => target(s).e * DEG)) ?? 0) },
  leadEdges: LEAD_EDGES, lead: { H: lead('H'), B: lead('B') }, leadMedian: { H: r2(median(crossing('H').map(s => Math.asin(target(s).lead) * DEG)) ?? 0), B: r2(median(crossing('B').map(s => Math.asin(target(s).lead) * DEG)) ?? 0) }, neededLead,
  outcomes: OUTCOMES, fates, bank, headshots, ttkEdges: TTK_EDGES, takenEdges: TAKEN_EDGES, ttk, accBin: BIN, accOverTime,
  killEdges: KILL_EDGES, killDist: { H: hist(KILL_EDGES, deaths.filter(d => cls(d.a) === 'H' && d.dist != null), d => d.dist), B: hist(KILL_EDGES, deaths.filter(d => cls(d.a) === 'B' && d.dist != null), d => d.dist) },
  killDistMedian: { H: r1(median(deaths.filter(d => cls(d.a) === 'H' && d.dist != null).map(d => d.dist)) ?? 0), B: r1(median(deaths.filter(d => cls(d.a) === 'B' && d.dist != null).map(d => d.dist)) ?? 0) },
  hitDistMedian: { H: r1(median(shotHits.filter(d => cls(d.a) === 'H' && d.dist != null).map(d => d.dist)) ?? 0), B: r1(median(shotHits.filter(d => cls(d.a) === 'B' && d.dist != null).map(d => d.dist)) ?? 0) },
  airShots: Object.fromEntries(humans.map(a => { const m = humanShots(a); return [a, m.length ? r3(m.filter(s => s.place?.startsWith('air:')).length / m.length) : 0]; })),
  hitMatrix: matrix(shotHits, 'victim'),
};

const D = {
  meta: { round: ROUND, mode: start.mode ?? end.mode, build: end.build, layout: end.layout, mindVersion: end.mindVersion, room: end.room,
    start: new Date(T0).toISOString(), end: new Date(T1).toISOString(), durationMin: r1(DUR), winner: end.winner ?? null, winnerLabel: end.winner != null ? label(end.winner) : null, method: end.method,
    humans, bots, generated: new Date().toISOString() },
  rats: ratRows, TOT,
  race: [...race].map(([a, pts]) => ({ a, label: label(a), color: color(a), human: isHuman(a), pts })),
  sessions: sessions.filter(s => s.human).map(s => ({ a: s.a, what: s.what, m: r2(MIN(s.t)) })),
  holder: holder.map(h => ({ a: h.a, from: r2(h.from), to: r2(h.to) })), incidents: incidents.map(s => ({ ...s, from: r2(s.from), to: r2(s.to) })),
  caseStats: { takes: cases.filter(c => c.what === 'take').length, steals: cases.filter(c => c.what === 'steal').length, respawns: cases.filter(c => c.what === 'respawn').length,
    dropsKilled: drops.filter(d => d.killed).length, dropsLoose: drops.filter(d => !d.killed && d.cause !== 'delivered' && d.cause !== 'left').length,
    dropsDelivered: drops.filter(d => d.cause === 'delivered').length, heldMin: r1(sum(holder, h => h.to - h.from)),
    carryEdges: [0, 2, 5, 10, 20, 30, 60, 120], carry: { H: hist([0, 2, 5, 10, 20, 30, 60, 120], drops.filter(d => isHuman(d.a)), d => d.carryMs / 1000), B: hist([0, 2, 5, 10, 20, 30, 60, 120], drops.filter(d => !isHuman(d.a)), d => d.carryMs / 1000) },
    carryMedianS: r1((median(drops.map(d => d.carryMs)) ?? 0) / 1000), longestS: Math.round(Math.max(0, ...drops.map(d => d.carryMs)) / 1000) },
  killsPerMin, deathCount: deaths.length,
  causes: ['shot', 'headshot', 'explosion', 'city'].map(c => ({ c, H: deathsOf('H').filter(d => d.cause === c).length, B: deathsOf('B').filter(d => d.cause === c).length })),
  lifeEdges: LIFE_EDGES, life: { H: hist(LIFE_EDGES, deathsOf('H'), d => d.lifeMs / 1000), B: hist(LIFE_EDGES, deathsOf('B'), d => d.lifeMs / 1000) },
  lifeMedian: { H: r1((median(deathsOf('H').map(d => d.lifeMs)) ?? 0) / 1000), B: r1((median(deathsOf('B').map(d => d.lifeMs)) ?? 0) / 1000) },
  killMatrix: matrix(deaths, 'victim'), map, supplies, air, incidentStats: [...incidentStats, quiet], mind, perf: perfSeries,
  rescues: rescues.length, shooting,
};

const out = values.out ?? `output/reports/round-${ROUND.slice(0, 8)}.html`;
const template = readFileSync(new URL('./round-report.html', import.meta.url), 'utf8');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, template.replace('/*__DATA__*/null', () => JSON.stringify(D).replace(/</g, '\\u003c')).replace(/__FONTS__/g, () => `file://${resolve('public/fonts')}`));
console.log(`Wrote ${out} (${Math.round(Buffer.byteLength(JSON.stringify(D)) / 1024)} KB of data)`);
