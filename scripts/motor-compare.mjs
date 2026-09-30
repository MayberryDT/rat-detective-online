#!/usr/bin/env node
// How humans and bots move, jump, aim and press their controls in fights, alone, in pairs and all together (docs/bot-overhaul.md, "Motor rewrite").
// Reads fight windows (5 Hz position, 20 Hz aim, 20 Hz controls) and shot facts from a city.db mirror.
// Usage: node scripts/motor-compare.mjs [--db=output/city-staging/city.db] [--mind=2] [--since=ISO] [--until=ISO] [--json=out.json]
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { accumulate, empty, features } from './lib/fight-motion.mjs';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const db = new DatabaseSync(arg('db', 'output/city-staging/city.db'), { readOnly: true });
const mind = arg('mind', undefined), since = Date.parse(arg('since', '2000-01-01')), until = Date.parse(arg('until', '2100-01-01'));

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

const groups = { human: empty(), bot: empty() };

for (const w of rows('window')) {
  for (const a of Object.keys(w.samples ?? {})) {
    const k = `${w.round}:${a}`, g = groups[humanOf.get(k) ? 'human' : 'bot'];
    accumulate(g, w, a, { skips: skipBy.get(k), shots: shotsBy.get(k) });
  }
}

const r3 = x => x === null || x === undefined ? null : Math.round(x * 1000) / 1000;
const human = features(groups.human), bot = features(groups.bot);
/** How far the bots are from the humans on one measure, 0 (same) to 1 (nothing alike). */
const gap = (h, b) => h === null || b === null ? null : Math.abs(h - b) / Math.max(Math.abs(h), Math.abs(b), 1e-9);
const gaps = {}, table = [];
for (const [cat, fs] of Object.entries(human)) {
  const g = Object.keys(fs).map(f => { const d = gap(fs[f], bot[cat][f]); table.push({ measure: `${cat}.${f}`, human: r3(fs[f]), bot: r3(bot[cat][f]), gap: r3(d) }); return d; }).filter(d => d !== null);
  gaps[cat] = g.length ? r3(g.reduce((a, b) => a + b, 0) / g.length) : null;
}
const scored = Object.values(gaps).filter(d => d !== null);
// The inputs family: its three parts (alone, pairs, all) count in the overall score as the other families do; `inputs` is their mean.
const inputs = ['inputs.alone', 'inputs.pairs', 'inputs.all'].map(k => gaps[k]).filter(d => d !== null && d !== undefined);
const out = {
  window: { mind: mind ?? 'any', since: new Date(since).toISOString(), until: new Date(Math.min(until, Date.now())).toISOString() },
  sample: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { fightMin: r3(g.fightS / 60), leftOutMin: r3(g.skippedS / 60), jumps: g.jumps, shots: Math.round(g.shots), aimSamples: g.aimSamples,
    controlMin: r3(g.controlS / 60), jumpPresses: g.jumpPresses }])),
  measures: table,
  /** Mean gap per family and overall (0: plays like the humans recorded; 1: nothing alike). */
  gaps: { ...gaps, inputs: inputs.length ? r3(inputs.reduce((a, b) => a + b, 0) / inputs.length) : null, overall: scored.length ? r3(scored.reduce((a, b) => a + b, 0) / scored.length) : null },
};
console.log(JSON.stringify(out, null, 2));
const json = arg('json', undefined);
if (json) writeFileSync(json, JSON.stringify(out, null, 2) + '\n');
