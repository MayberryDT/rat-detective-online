#!/usr/bin/env node
// How humans and bots move, jump and aim in fights, alone, in pairs and all three together (docs/bot-overhaul.md, "Motor rewrite").
// Reads fight windows (5 Hz position, 20 Hz aim) and shot facts from a city.db mirror.
// Usage: node scripts/motor-compare.mjs [--db=output/city-staging/city.db] [--mind=2] [--since=ISO] [--until=ISO] [--json=out.json]
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const db = new DatabaseSync(arg('db', 'output/city-staging/city.db'), { readOnly: true });
const mind = arg('mind', undefined), since = Date.parse(arg('since', '2000-01-01')), until = Date.parse(arg('until', '2100-01-01'));

/** Moving: faster than a walk. A jump: a 5 Hz height peak at least 1 unit above both samples 0.4 s either side
 * (a jump rises about 5 units and lasts about 1.1 s; stairs never peak), and under 8 (launches). */
const MOVING = 3, JUMP_RISE = 1, JUMP_MAX = 8, AIR_MS = 550;
/** A flick: the aim turns more than 0.6 rad within 150 ms. Still aim: turning under 0.1 rad/s. */
const FLICK = .6, FLICK_MS = 150, STILL = .1;
/** Decoupled: moving more than 60° away from where the rat looks (strafing, back-pedalling). */
const DECOUPLED = Math.PI / 3, BACK = Math.PI * 3 / 4;

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const rows = (type) => db.prepare('select t, round, data from facts where type = ? and t between ? and ? order by t').all(type, since, until)
  .map(r => ({ t: r.t, round: r.round, ...JSON.parse(r.data) })).filter(f => mind === undefined || String(f.mindVersion ?? '') === mind);
const humanOf = new Map(db.prepare('select distinct round, a, human from situations').all().map(r => [`${r.round}:${r.a}`, !!r.human]));
const shotsBy = new Map();
for (const s of rows('shot')) { const k = `${s.round}:${s.a}`; (shotsBy.get(k) ?? shotsBy.set(k, []).get(k)).push(s); }
/** Stretches left out: launcher flights (launch to landing, plus 0.3 s) and Hot Pursuit (claim to its end), which
 * move a rat faster and higher than its own legs and jumps can. */
const skipBy = new Map(), skip = (k, from, to) => (skipBy.get(k) ?? skipBy.set(k, []).get(k)).push([from, to]);
const landings = rows('landing');
for (const l of rows('launch')) {
  const land = landings.find(x => x.round === l.round && x.a === l.a && x.t >= l.t && x.t - l.t < 15_000);
  skip(`${l.round}:${l.a}`, l.t, land ? land.t + 300 : l.t + 15_000);
}
const hustleEnds = rows('buff-end').filter(b => b.buff === 'hustle');
for (const p of rows('pickup').filter(p => p.kind === 'hustle')) {
  const end = hustleEnds.find(b => b.round === p.round && b.a === p.a && b.t >= p.t);
  skip(`${p.round}:${p.a}`, p.t, end ? end.t : p.t + 12_000);
}

const empty = () => ({ fightS: 0, skippedS: 0, moveS: 0, speeds: [], stops: 0, samples: 0, turns: 0, jumps: 0, jumpsMoving: 0, strafeJumps: 0, airS: 0,
  turnRates: [], airTurnRates: [], groundTurnRates: [], still: 0, aimSamples: 0, flicks: 0, offAngles: [], decoupled: 0, back: 0, movingAim: 0,
  shots: 0, airShots: 0, errs: [], airErrs: [], groundErrs: [], leads: [], airDecoupledS: 0, airMovingS: 0 });
const groups = { human: empty(), bot: empty() };

for (const w of rows('window')) {
  for (const [a, pos] of Object.entries(w.samples ?? {})) {
    const human = humanOf.get(`${w.round}:${a}`) ?? false, g = groups[human ? 'human' : 'bot'];
    const skips = skipBy.get(`${w.round}:${a}`) ?? [], skipped = (ms) => skips.some(([s, e]) => w.from + ms >= s && w.from + ms <= e);
    const living = pos.filter(s => s[5] > 0), alive = living.filter(s => !skipped(s[0]));
    g.skippedS += (living.length - alive.length) * .2;
    if (alive.length < 3) continue;
    const aim = (w.aim?.[a] ?? []).filter(s => !skipped(s[0]));
    const yawAt = (ms) => { let best; for (const s of aim) if (!best || Math.abs(s[0] - ms) < Math.abs(best[0] - ms)) best = s; return best && Math.abs(best[0] - ms) <= 100 ? best[1] : undefined; };
    // Jumps and the time spent in the air.
    const air = [];
    for (let i = 2; i < alive.length - 2; i++) {
      const y = alive[i][2], before = y - alive[i - 2][2], after = y - alive[i + 2][2];
      if (before >= JUMP_RISE && after >= JUMP_RISE && before < JUMP_MAX && y >= alive[i - 1][2] && y >= alive[i + 1][2]) air.push([alive[i][0] - AIR_MS, alive[i][0] + AIR_MS]);
    }
    const inAir = (ms) => air.some(([s, e]) => ms >= s && ms <= e);
    // Fight time: the kept stretches only (a gap over 0.5 s is a skipped flight or buff).
    let span = 0;
    for (let i = 1; i < alive.length; i++) { const dt = (alive[i][0] - alive[i - 1][0]) / 1000; if (dt > 0 && dt <= .5) span += dt; }
    g.fightS += span; g.jumps += air.length;
    // Movement, and how it relates to jumping and to where the rat looks.
    let lastHeading;
    for (let i = 1; i < alive.length; i++) {
      const [t0, x0, , z0] = alive[i - 1], [t1, x1, , z1] = alive[i], dt = (t1 - t0) / 1000;
      if (dt <= 0 || dt > .5) { lastHeading = undefined; continue; }
      const speed = Math.hypot(x1 - x0, z1 - z0) / dt, heading = Math.atan2(x1 - x0, z1 - z0), airborne = inAir(t1);
      g.samples++; g.speeds.push(speed); if (speed < 1) g.stops++;
      if (airborne) g.airS += dt;
      if (speed <= MOVING) { lastHeading = undefined; continue; }
      g.moveS += dt;
      if (lastHeading !== undefined && Math.abs(wrap(heading - lastHeading)) > Math.PI / 3) g.turns++;
      lastHeading = heading;
      const yaw = yawAt(t1);
      if (yaw === undefined) continue;
      const off = Math.abs(wrap(heading - yaw));
      g.movingAim++; g.offAngles.push(off); if (off > DECOUPLED) g.decoupled++; if (off > BACK) g.back++;
      if (airborne) { g.airMovingS += dt; if (off > DECOUPLED) g.airDecoupledS += dt; }
    }
    for (const [start] of air) {
      const i = alive.findIndex(s => s[0] >= start);
      const s0 = alive[Math.max(0, i - 1)], s1 = alive[Math.min(alive.length - 1, i + 1)], dt = (s1[0] - s0[0]) / 1000;
      if (dt <= 0) continue;
      const speed = Math.hypot(s1[1] - s0[1], s1[3] - s0[3]) / dt;
      if (speed > MOVING) { g.jumpsMoving++; const yaw = yawAt(start + AIR_MS); if (yaw !== undefined && Math.abs(wrap(Math.atan2(s1[1] - s0[1], s1[3] - s0[3]) - yaw)) > DECOUPLED) g.strafeJumps++; }
    }
    // Aim: turn rates in the air and on the ground, still aim, flicks.
    for (let i = 1; i < aim.length; i++) {
      const dt = (aim[i][0] - aim[i - 1][0]) / 1000;
      if (dt <= 0 || dt > .2) continue;
      const rate = Math.abs(wrap(aim[i][1] - aim[i - 1][1])) / dt;
      g.aimSamples++; g.turnRates.push(rate); if (rate < STILL) g.still++;
      (inAir(aim[i][0]) ? g.airTurnRates : g.groundTurnRates).push(rate);
    }
    for (let i = 0, j = 0; i < aim.length; i++) {
      while (j < aim.length && aim[j][0] - aim[i][0] <= FLICK_MS) j++;
      if (j - 1 > i && Math.abs(wrap(aim[j - 1][1] - aim[i][1])) > FLICK) { g.flicks++; while (i + 1 < aim.length && aim[i + 1][0] - aim[i][0] < 2 * FLICK_MS) i++; }
    }
    // Shots in this window: accuracy and lead, in the air and on the ground.
    for (const s of shotsBy.get(`${w.round}:${a}`) ?? []) {
      const ms = s.t - w.from;
      if (ms < alive[0][0] || ms > alive.at(-1)[0] || skipped(ms)) continue;
      const weight = s.sample ?? 1, airborne = inAir(ms), target = s.targets?.[0];
      g.shots += weight; if (airborne) g.airShots += weight;
      if (!target) continue;
      g.errs.push(target.e); (airborne ? g.airErrs : g.groundErrs).push(target.e);
      if (target.lat >= 2 && target.lead !== undefined) g.leads.push(target.lead > 0 ? 1 : 0);
    }
  }
}

const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const share = (n, d) => d ? n / d : null;
const perMin = (n, s) => s ? n / (s / 60) : null;
const r3 = x => x === null || x === undefined ? null : Math.round(x * 1000) / 1000;
const features = (g) => ({
  move: { speedMedian: q(g.speeds, .5), speedP90: q(g.speeds, .9), stopShare: share(g.stops, g.samples), directionChangesPerMovingMin: perMin(g.turns, g.moveS) },
  jump: { jumpsPerFightMin: perMin(g.jumps, g.fightS), airShare: share(g.airS, g.fightS) },
  aim: { turnRateMedian: q(g.turnRates, .5), turnRateP90: q(g.turnRates, .9), stillAimShare: share(g.still, g.aimSamples), flicksPerFightMin: perMin(g.flicks, g.fightS),
    shotErrorMedian: q(g.errs, .5), leadAheadShare: share(g.leads.reduce((a, b) => a + b, 0), g.leads.length) },
  moveAim: { decoupledShare: share(g.decoupled, g.movingAim), backpedalShare: share(g.back, g.movingAim), offAngleMedian: q(g.offAngles, .5) },
  moveJump: { jumpsWhileMovingShare: share(g.jumpsMoving, g.jumps), strafeJumpShare: share(g.strafeJumps, g.jumps) },
  jumpAim: { airShotShare: share(g.airShots, g.shots), airTurnRateMedian: q(g.airTurnRates, .5), groundTurnRateMedian: q(g.groundTurnRates, .5),
    airShotErrorMedian: q(g.airErrs, .5), groundShotErrorMedian: q(g.groundErrs, .5) },
  all: { airborneDecoupledShareOfMovingAir: share(g.airDecoupledS, g.airMovingS), airborneDecoupledPerFightMin: perMin(g.airDecoupledS, g.fightS) },
});
const human = features(groups.human), bot = features(groups.bot);
/** How far the bots are from the humans on one measure, 0 (same) to 1 (nothing alike). */
const gap = (h, b) => h === null || b === null ? null : Math.abs(h - b) / Math.max(Math.abs(h), Math.abs(b), 1e-9);
const gaps = {}, table = [];
for (const [cat, fs] of Object.entries(human)) {
  const g = Object.keys(fs).map(f => { const d = gap(fs[f], bot[cat][f]); table.push({ measure: `${cat}.${f}`, human: r3(fs[f]), bot: r3(bot[cat][f]), gap: r3(d) }); return d; }).filter(d => d !== null);
  gaps[cat] = g.length ? r3(g.reduce((a, b) => a + b, 0) / g.length) : null;
}
const scored = Object.values(gaps).filter(d => d !== null);
const out = {
  window: { mind: mind ?? 'any', since: new Date(since).toISOString(), until: new Date(Math.min(until, Date.now())).toISOString() },
  sample: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { fightMin: r3(g.fightS / 60), leftOutMin: r3(g.skippedS / 60), jumps: g.jumps, shots: Math.round(g.shots), aimSamples: g.aimSamples }])),
  measures: table,
  /** Mean gap per family and overall (0: plays like the humans recorded; 1: nothing alike). */
  gaps: { ...gaps, overall: scored.length ? r3(scored.reduce((a, b) => a + b, 0) / scored.length) : null },
};
console.log(JSON.stringify(out, null, 2));
const json = arg('json', undefined);
if (json) writeFileSync(json, JSON.stringify(out, null, 2) + '\n');
