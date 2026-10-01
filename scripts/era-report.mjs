#!/usr/bin/env node
// Change report (docs/data-plan.md, "Reports for Tyler"): one page of plain English comparing two eras of
// design/data/eras.json, read from the city mirror (scripts/city-mirror.mjs): what changed, how much data each era has,
// the verdict on each of the after era's predictions, the scorecard before and after, Jev against the code mind in
// code-only rounds, and what Jev cost. Jev, decision and human-likeness measures and the verdicts read ordinary rounds
// only; code-only rounds (L4 on: the bots keep the code mind with humans playing) are compared in their own section.
// Usage: node scripts/era-report.mjs <before> <after> [--db=output/city/city.db] [--staging-db=output/city-staging/city.db]
//        [--eras=design/data/eras.json] [--out=docs/reports/<date>-<before>-vs-<after>.md | --out=-] [--json=out.json] [--now=ISO]
// --db serves production eras (and staging ones unless --staging-db is given). Agent rats never count as humans or bots.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { GOAL_OUTCOMES, MIN_EVENTS, MIN_HUMAN_SECONDS, TRIGGERS, STANCES, VERDICT_HUMAN_SECONDS, compareReadings, judgePrediction, parseEras, scorecards, started } from './lib/eras.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  db: { type: 'string' }, 'staging-db': { type: 'string' }, eras: { type: 'string', default: 'design/data/eras.json' },
  out: { type: 'string' }, json: { type: 'string' }, now: { type: 'string' },
} });
if (positionals.length !== 2) throw new Error('Usage: node scripts/era-report.mjs <before> <after> [--db=…] [--out=…]');
const eras = parseEras(JSON.parse(readFileSync(values.eras, 'utf8')));
const find = id => eras.find(e => e.id === id) ?? (() => { throw new Error(`No era "${id}" in ${values.eras}; known: ${eras.map(e => e.id).join(', ')}`); })();
const [before, after] = positionals.map(find);
const now = values.now ? Date.parse(values.now) : Date.now();
const dbPath = env => (env === 'staging' ? values['staging-db'] ?? values.db ?? 'output/city-staging/city.db' : values.db ?? 'output/city/city.db');
const dbs = new Map();
const open = env => dbs.get(dbPath(env)) ?? dbs.set(dbPath(env), new DatabaseSync(dbPath(env), { readOnly: true })).get(dbPath(env));
const sets = [before, after].map(era => scorecards(open(era.environment), era, { now }));
// `b` and `a`: ordinary rounds, for Jev, decisions, likeness, cost and verdicts; `bAll` and `aAll`: every round.
const [b, a] = sets.map(s => s.ordinary), [bAll, aAll] = sets.map(s => s.all);
const verdicts = (after.predictions ?? []).map(p => ({ prediction: p, ...judgePrediction(p, b, a) }));
const anyCodeOnly = sets.some(s => s.all.recorded.codeOnly);

// Formatting.
const num = (x, digits = 1) => (x === undefined || x === null || !Number.isFinite(x) ? '–' : x.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
const int = x => num(x, 0);
const pct = x => `${num(x * 100, x < .1 ? 1 : 0)}%`;
const money = x => `$${x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FORMATS = { share: pct, rate: x => num(x, x < 10 ? 2 : 1), money, ms: x => `${int(x)} ms`, s: x => `${num(x, 1)} s` };
/** "value (lo–hi, n)" or a reason there is none; a reading below the minimums is marked. */
const cell = (r, format, missing = 'no data') => {
  if (!r) return missing;
  const f = FORMATS[format], range = r.lo === undefined || (r.lo === r.value && r.hi === r.value) ? '' : `${f(r.lo)}–${f(r.hi)}, `;
  return `${f(r.value)}${r.n === undefined || r.lo === undefined ? '' : ` (${range}n ${int(r.n)})`}${r.enough ? '' : ' ‡'}`;
};
const day = t => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '–');
const windowOf = (era, card) => !started(era) ? 'not shipped yet'
  : `${era.from ? day(Date.parse(era.from)) : `build ${era.build}`} to ${era.to ? day(Date.parse(era.to)) : `now (last fact ${day(card.window.lastFact)})`} UTC`;
const OUTCOME = { met: 'met', missed: 'missed', unclear: 'too close to call', waiting: 'waiting for data' };
const MEASURE_FORMAT = id => (/Share|share|\.(reached|replaced|failed|died)$|hitRate\.|Gap$|^decisions\.(trigger|stance)\./.test(id) ? 'share' : /dollars/.test(id) ? 'money' : /latency/i.test(id) ? 'ms' : /MedianS$/.test(id) ? 's' : 'rate');

const lines = [];
const out = (...xs) => lines.push(...xs);
const table = (head, rows) => out(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.join(' | ')} |`), '');

out(`# Change report: ${before.id} → ${after.id}`, '');
out(`Generated ${day(now)} UTC from ${[...new Set([before, after].map(e => dbPath(e.environment)))].join(' and ')}. ‡ marks a reading below the city map's minimums (${MIN_HUMAN_SECONDS / 60} human rat-minutes, ${MIN_EVENTS} events; ${VERDICT_HUMAN_SECONDS / 60} human minutes to judge a prediction). Intervals are 95%. Agent browsers are left out of every human and bot figure.${anyCodeOnly ? ' Jev, bot decisions, human-likeness, cost and the verdicts read ordinary rounds only; code-only rounds have their own section.' : ''}`, '');

out('## What changed', '');
out(`- **After** (${after.environment}, ${windowOf(after, aAll)}): ${after.change}${after.commits?.length ? ` Commits ${after.commits.map(c => `\`${c}\``).join(', ')}.` : ''}`);
out(`- **Before** (${before.environment}, ${windowOf(before, bAll)}): ${before.change}`);
const between = eras.filter(e => e.environment === after.environment && e !== before && e !== after && e.from && before.from && after.from && Date.parse(e.from) > Date.parse(before.from) && Date.parse(e.from) < Date.parse(after.from));
if (between.length) out(`- **Also changed in between:** ${between.map(e => `${e.id} (${e.change.split(/[.:]/)[0]})`).join('; ')}.`);
if (after.baseline && after.baseline !== before.id) out(`- The after era names \`${after.baseline}\` as its baseline; this report compares it with \`${before.id}\` instead.`);
if (before.environment !== after.environment) out('- The eras are in different environments, so their players and traffic differ.');
for (const env of new Set([before, after].filter(started).map(e => e.environment))) {
  const last = open(env).prepare('SELECT MAX(t) AS t FROM facts').get().t ?? 0;
  const short = [before, after].filter(e => started(e) && e.environment === env && last < (e.to ? Date.parse(e.to) : now - 15 * 60_000));
  if (short.length) out(`- The ${env} mirror ends at ${day(last)} UTC, before ${short.map(e => e.id).join(' and ')} ${short.length > 1 ? 'do' : 'does'}: refresh it with \`node scripts/city-mirror.mjs\`${env === 'staging' ? ' (with the staging `--base` and `--out=output/city-staging`)' : ''}.`);
}
out('');

out('## Data per era', '');
const dataRow = (label, f) => [label, f(bAll), f(aAll)];
table(['', before.id, after.id], [
  dataRow('Human rat-hours (joins)', c => `${num(c.data.humanHours, 2)} (${int(c.data.humanSessions)})`),
  dataRow('Bot rat-hours', c => num(c.data.botHours, 1)),
  dataRow('Agent rat-hours (left out)', c => num(c.data.agentHours, 2)),
  dataRow('Jev hours on', c => num(c.data.jevHours, 2)),
  dataRow('Decisions (Jev / code)', c => `${int(c.data.decisions.jev)} / ${int(c.data.decisions.code)}`),
  dataRow('Goals ended', c => int(c.data.goalEnds)),
  dataRow('Rounds; facts', c => `${int(c.data.rounds)}; ${int(c.data.facts)}`),
  ...(anyCodeOnly ? [['Code-only rounds; their human rat-hours', ...sets.map(s => `${int(s.codeOnly.data.rounds)}; ${num(s.codeOnly.data.humanHours, 2)}`)]] : []),
  dataRow('Recorded', c => [c.recorded.build && 'build', c.recorded.shotTargets && 'shot targets', c.recorded.decisionInputs && 'decision inputs', c.recorded.stance && 'stance', c.recorded.codeOnly && 'code-only rounds',
    c.recorded.pickupPassed && 'pickups passed', c.recorded.perf && 'perf'].filter(Boolean).join(', ') || 'none of the newer fields'),
]);

out('## Predictions', '');
if (!verdicts.length) out(`\`${after.id}\` states no predictions${after.proposals?.length ? ` of its own; its layout proposals (${after.proposals.join(', ')}) are judged on /map's Design mode` : ''}.`, '');
else table(['Prediction', 'Before', 'After', 'Verdict'], verdicts.map(v => {
  const f = MEASURE_FORMAT(v.prediction.measure), bound = v.prediction.target?.below ?? v.prediction.target?.above;
  // A prediction against another measure of the same era (the bots' hit rate below the humans') shows both.
  const side = (c, r) => (typeof bound === 'string' ? `${cell(r, f)} against ${cell(c.measures[bound], MEASURE_FORMAT(bound))}` : cell(r, f));
  return [v.prediction.says, side(b, v.before), side(a, v.after), `**${OUTCOME[v.outcome]}**`];
}));

out('## Scorecard', '');
const M = (label, id, missing, [x, y] = [b, a]) => [label, cell(x.measures[id], MEASURE_FORMAT(id), missing), cell(y.measures[id], MEASURE_FORMAT(id), missing)];
out('**Jev cost and cadence** (from the one-minute `minds` windows):', '');
table(['Measure', 'Before', 'After'], [
  M('Requests per bot-minute', 'jev.requestsPerBotMinute', 'Jev off'),
  M('Requests answered', 'jev.answerShare', 'Jev off'),
  M('Stale answers (dropped)', 'jev.staleShare', 'Jev off'),
  M('Fallbacks to the code mind', 'jev.fallbackShare', 'Jev off'),
  M('Reply latency, 90th percentile', 'jev.latencyP90', 'Jev off'),
  M('Dollars per hour Jev is on', 'jev.dollarsPerJevHour', 'Jev off'),
  M('Dollars per human rat-hour', 'jev.dollarsPerHumanHour', 'Jev off'),
]);
out(`**Bot decisions** (decision facts; from mindVersion 6 every decision moment is recorded, before that only goal changes and fresh Jev answers; goal shares are of each goal's ends, all minds):`, '');
const goalIds = [...new Set([...b.tables.goals, ...a.tables.goals].sort((x, y) => y.n - x.n).map(g => g.goal))].slice(0, 6);
const goalCell = (c, goal) => {
  const g = c.tables.goals.find(x => x.goal === goal);
  if (!g) return 'none';
  return `${GOAL_OUTCOMES.map(o => `${o} ${pct(c.measures[`goals.${goal}.${o}`].value)}`).join(', ')}; median hold ${num(c.measures[`goals.${goal}.holdMedianS`].value, 1)} s (n ${int(g.n)}${g.n < MIN_EVENTS ? ' ‡' : ''})`;
};
table(['Measure', 'Before', 'After'], [
  M('Decisions per bot-minute (all minds)', 'decisions.perBotMinute', 'no decisions'),
  ...TRIGGERS.map(t => M(`Decided on: ${t === 'event' ? 'an event' : t === 'beat' ? 'the hold running out (beat)' : 'a fallback'}`, `decisions.trigger.${t}`, 'no decisions')),
  ...STANCES.map(s => M(`Stance: ${s}`, `decisions.stance.${s}`, 'not recorded')),
  M('Any goal: median hold', 'goals.holdMedianS', 'no goal facts'),
  ...goalIds.map(goal => [goal, goalCell(b, goal), goalCell(a, goal)]),
]);
out('**Pickups passed** (a usable supply within 12 units in sight, left unclaimed; per alive rat-hour):', '');
table(['Who', 'Before', 'After'], ['human', 'bot'].map(w => M(w === 'human' ? 'Humans' : 'Bots', `pickups.passedPerRatHour.${w}`, 'not recorded', [bAll, aAll])));
out('**Human-likeness** (hit rate from the round ledgers; the rest from `shot` facts with targets, bot shots sampled 1 in 10):', '');
table(['Measure', 'Before', 'After'], [
  M('Hit rate, humans', 'likeness.hitRate.human'), M('Hit rate, bots', 'likeness.hitRate.bot'),
  M('Shots with no rat in sight, humans', 'likeness.blindShare.human', 'not recorded'), M('Shots with no rat in sight, bots', 'likeness.blindShare.bot', 'not recorded'),
  M('Gap in no-rat-in-sight share (bot − human)', 'likeness.blindShotGap', 'not recorded'),
  M('Mean gap in hit rate across distance bands', 'likeness.hitRateBandGap', 'not recorded'),
]);
const bandCell = x => (!x.shots ? '–' : x.rate === null ? `${int(x.hits)} hits, ${int(x.shots)} shots ‡` : `${pct(x.rate)} of ${int(x.shots)}`);
if (b.recorded.shotTargets || a.recorded.shotTargets) table(['Distance (units)', 'Humans before', 'Bots before', 'Humans after', 'Bots after'],
  a.tables.bands.map((row, i) => [row.band, bandCell(b.tables.bands[i].human), bandCell(b.tables.bands[i].bot), bandCell(row.human), bandCell(row.bot)]));
out('**Game health** (humans\' perf reports; frames a second at the median frame and at the slowest 5%):', '');
const perfRows = c => c.tables.perf.slice(0, 6).map(p => `${p.machine}: ${num(p.fps50, 0)} / ${num(p.fps95, 0)} fps (${num(p.minutes, 0)} min)`).join('<br>') || 'no reports';
table(['', before.id, after.id], [['Machines', perfRows(bAll), perfRows(aAll)], ['Agent reports left out', int(bAll.tables.agentPerfReports), int(aAll.tables.agentPerfReports)]]);
out('**Players:**', '');
const k = c => c.tables.kills;
table(['', 'Before', 'After'], [
  ['Human rat-hours', num(bAll.data.humanHours, 2), num(aAll.data.humanHours, 2)],
  ['Humans killed bots / bots killed humans', `${int(k(bAll)['human-bot'])} / ${int(k(bAll)['bot-human'])}`, `${int(k(aAll)['human-bot'])} / ${int(k(aAll)['bot-human'])}`],
  ['Humans killed humans; the city killed humans', `${int(k(bAll)['human-human'])}; ${int(k(bAll)['city-human'])}`, `${int(k(aAll)['human-human'])}; ${int(k(aAll)['city-human'])}`],
  M('Human kills per human rat-hour', 'players.killsPerHumanHour', undefined, [bAll, aAll]),
  M('Human deaths per human rat-hour', 'players.deathsPerHumanHour', undefined, [bAll, aAll]),
]);
out('**The game** (every finished round, bot-only rounds included; mean minutes per mode; carries from `case` facts):', '');
const modes = [...new Set([...Object.keys(bAll.measures), ...Object.keys(aAll.measures)].filter(id => id.startsWith('rounds.minutes.')))].sort();
table(['Measure', 'Before', 'After'], [
  ...modes.map(id => M(`Round length, ${id.slice('rounds.minutes.'.length)} (minutes)`, id, 'no rounds', [bAll, aAll])),
  M('Carries ended with the case knocked loose (not a death)', 'case.knockedLooseShare', 'no carries', [bAll, aAll]),
  M('Median carry (s)', 'case.carryMedianS', 'no carries', [bAll, aAll]),
  M('Median time the case lay loose (s)', 'case.looseMedianS', 'not recorded', [bAll, aAll]),
  M('Median distance a loose case travelled (units)', 'case.loosePathMedian', 'not recorded', [bAll, aAll]),
  M('Balls that hit a loose case, mean per spell', 'case.looseKicksMean', 'not recorded', [bAll, aAll]),
  M('Headshot share of kills, humans', 'kills.headshotShare.human', 'no kills', [bAll, aAll]),
  M('Headshot share of kills, bots', 'kills.headshotShare.bot', 'no kills', [bAll, aAll]),
]);

out('## Jev against the code mind with humans playing', '');
// Within one era: code-only rounds against ordinary ones. For the gaps (bot against human), lower is more human-like.
const VERSUS = [
  ['Hit rate, humans', 'likeness.hitRate.human'], ['Hit rate, bots', 'likeness.hitRate.bot'],
  ['Shots with no rat in sight, humans', 'likeness.blindShare.human'], ['Shots with no rat in sight, bots', 'likeness.blindShare.bot'],
  ['Gap in no-rat-in-sight share (bot − human)', 'likeness.blindShotGap', true], ['Mean gap in hit rate across distance bands', 'likeness.hitRateBandGap', true],
  ['Humans\' share of human–bot kills', 'players.humanDuelShare'],
  ['Humans\' kills of bots per human rat-hour', 'players.humanKillsOfBotsPerHumanHour'], ['Bots\' kills of humans per human rat-hour', 'players.botKillsOfHumansPerHumanHour'],
];
const reading = (x, y, isGap) => {
  const c = compareReadings(x, y);
  if (c === 'waiting') return 'waiting for data';
  if (c === 'unclear') return 'too close to call';
  return isGap ? (c === 'lower' ? 'code mind closer to humans' : 'Jev closer to humans') : `${c} with the code mind`;
};
const withCodeOnly = [before, after].map((era, i) => [era, sets[i]]).filter(([, s]) => s.all.recorded.codeOnly);
if (!withCodeOnly.length) out('Neither era has code-only rounds (they start with the lighter Jev, L4).', '');
for (const [era, s] of withCodeOnly) {
  const rounds = (n, kind) => `${int(n)} ${kind} round${n === 1 ? '' : 's'}`;
  out(`**${era.id}**: ${rounds(s.ordinary.data.rounds, 'ordinary')} (${num(s.ordinary.data.humanHours, 2)} human rat-hours) against ${rounds(s.codeOnly.data.rounds, 'code-only')} (${num(s.codeOnly.data.humanHours, 2)} human rat-hours).`, '');
  table(['Measure', 'Ordinary rounds (Jev)', 'Code-only rounds (code mind)', 'Reading'], VERSUS.map(([label, id, isGap]) => {
    const x = s.ordinary.measures[id], y = s.codeOnly.measures[id], f = MEASURE_FORMAT(id);
    return [label, cell(x, f), cell(y, f), reading(x, y, isGap)];
  }));
  out(`Kills: ordinary rounds, humans killed bots ${int(s.ordinary.tables.kills['human-bot'])} times and bots killed humans ${int(s.ordinary.tables.kills['bot-human'])}; code-only rounds, ${int(s.codeOnly.tables.kills['human-bot'])} and ${int(s.codeOnly.tables.kills['bot-human'])}.`, '');
}

out('## Cost', '');
const costLine = (era, c) => c.cost.requests
  ? `- ${era.id}: Jev cost ${money(c.cost.dollars)} for ${int(c.cost.requests)} requests and ${num(c.cost.tokens / 1e6, 1)} M tokens over ${num(c.data.jevHours, 2)} hours on (${money(c.cost.dollars / c.data.jevHours)} an hour on${c.data.humanHours ? `, ${money(c.cost.dollars / c.data.humanHours)} per human rat-hour` : ''}).`
  : `- ${era.id}: no Jev spend recorded.`;
out(costLine(before, b), costLine(after, a), '');

const report = lines.join('\n');
const target = values.out ?? `docs/reports/${new Date(now).toISOString().slice(0, 10)}-${before.id}-vs-${after.id}.md`;
if (target === '-') process.stdout.write(report);
else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, report); console.log(`Wrote ${target}`); }
if (values.json) writeFileSync(values.json, JSON.stringify({ before: sets[0], after: sets[1], verdicts: verdicts.map(v => ({ id: v.prediction.id, outcome: v.outcome, before: v.before ?? null, after: v.after ?? null })) }, null, 2) + '\n');
for (const db of dbs.values()) db.close();
