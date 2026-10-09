import {ASSIGNMENTS, objectiveTarget, type AssignmentId, type AssignmentState} from '../shared/assignments';
import {awardValue} from '../shared/awardUnits';
import {INCIDENTS, incidentInfo} from '../shared/incidentCatalog';
import {PICKUP_COPY, PICKUP_KINDS} from '../shared/pickups';
import {DEATH_CAUSES, KILLS_TO_WIN, KILL_WEAPONS, type Award, type DeathCause, type KillWeapon, type ReportRat, type RoundReport} from '../shared/networkProtocol';

/** The results board's and the stats file's wording and arithmetic for the `gameWon` round report. */
export function caseTime(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export const objectiveUnit = (mode: AssignmentId) => mode === 'jurisdiction' ? 'ZONE POINTS' : mode === 'chain-of-custody' ? 'DELIVERIES' : 'CASE KILLS';
/** A rat's progress toward the mode's win: zone points, deliveries or case kills. */
export function objectivePoints(assignment: AssignmentState, id: string): number {
    return assignment.id === 'jurisdiction' ? (assignment.jurisdiction?.heldMs[id] ?? 0) / 1000 : assignment.id === 'chain-of-custody' ? assignment.deliveries[id] ?? 0 : assignment.caseKills[id] ?? 0;
}
const WEAPON_LABELS: Record<KillWeapon, string> = {cheese: 'CHEESE GUN', 'tommy-gun': 'TOMMY GUN', laser: 'LASER', persuader: 'THE PERSUADER', blast: 'BLASTS'};
const DEATH_LABELS: Record<DeathCause, string> = {shot: 'SHOT', headshot: 'HEADSHOT', blast: 'BLAST', 'evidence-tampering': 'EVIDENCE TAMPERING', drowned: 'DROWNED'};
/** Kills per minute alive; a rat alive under half a minute has no pace yet. */
export const killsPerMinute = (rat: ReportRat) => rat.alive >= 30 ? (rat.kills / (rat.alive / 60)).toFixed(2) : '—';
export const accuracy = (rat: ReportRat) => rat.shots ? `${Math.round(rat.hits / rat.shots * 100)}%` : '—';

/** A tally's non-zero entries in `order`, labelled. */
function tallies<K extends string>(table: Partial<Record<K, number>>, order: readonly K[], label: (key: K) => string): [string, number][] {
    return order.filter(key => (table[key] ?? 0) > 0).map(key => [label(key), table[key]!]);
}
const listed = (rows: [string, number][]) => rows.map(([label, n]) => `${label} ${n}`).join(' · ') || 'NONE';
const sumOf = <K extends string>(rats: readonly ReportRat[], pick: (rat: ReportRat) => Partial<Record<K, number>>) => {
    const total: Partial<Record<K, number>> = {};
    for (const rat of rats) for (const [key, n] of Object.entries(pick(rat)) as [K, number][]) total[key] = (total[key] ?? 0) + n;
    return total;
};

/** One rat's whole round, as labelled lines: the hover card on the board and each rat's entry in the stats file. */
export function ratFile(rat: ReportRat): [string, string][] {
    const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 'S'}`;
    return [
        ['RECORD', `${count(rat.kills, 'KILL')} · ${count(rat.deaths, 'DEATH')} · ${count(rat.assists, 'ASSIST')}`],
        ['PACE', `${killsPerMinute(rat)} KILLS / MIN ALIVE · ${caseTime(rat.alive)} ALIVE`],
        ['SHOOTING', `${rat.hits} OF ${rat.shots} HIT (${accuracy(rat)}) · ${count(rat.headshots, 'HEADSHOT')} · BEST STREAK ${rat.streak}`],
        ['LONGEST KILL', rat.longest ? `${rat.longest} M` : '—'],
        ['DAMAGE', `${rat.dealt} DEALT · ${rat.damage} TAKEN`],
        ['KILLS BY', listed(tallies(rat.weapons, KILL_WEAPONS, key => WEAPON_LABELS[key]))],
        ['THE CASE', `${count(rat.takes, 'TAKE')} · ${caseTime(rat.caseSeconds)} HELD · LONGEST CARRY ${caseTime(rat.carry)}`],
        ['SUPPLIES', rat.supplies ? `${rat.supplies}: ${listed(tallies(rat.kinds, PICKUP_KINDS, key => PICKUP_COPY[key].title))}` : '0'],
        ['FLIGHTS', String(rat.flights)],
        ['DEATHS BY', listed(tallies(rat.deathsBy, DEATH_CAUSES, key => DEATH_LABELS[key]))],
    ];
}

/** The round across the board: incidents rolled, and kills, deaths and supplies by kind over the present rats. */
export function roundTallies(report: RoundReport): {title: string; rows: [string, number][]}[] {
    const incidents = tallies(report.incidents, INCIDENTS.map(incident => incident.id), id => incidentInfo(id).title.toUpperCase());
    return [
        {title: `INCIDENTS ROLLED · ${incidents.reduce((total, [, n]) => total + n, 0)}`, rows: incidents},
        {title: 'KILLS BY WEAPON', rows: tallies(sumOf(report.rats, rat => rat.weapons), KILL_WEAPONS, key => WEAPON_LABELS[key])},
        {title: 'DEATHS BY CAUSE', rows: tallies(sumOf(report.rats, rat => rat.deathsBy), DEATH_CAUSES, key => DEATH_LABELS[key])},
        {title: 'SUPPLIES BY KIND', rows: tallies(sumOf(report.rats, rat => rat.kinds), PICKUP_KINDS, key => PICKUP_COPY[key].title)},
    ];
}

/** The race's plotted length (seconds) and the score it runs to. */
export function raceScale(report: RoundReport, mode: AssignmentId | undefined): {end: number; goal: number; top: number} {
    const race = report.race!, count = race.points[0]!.length, goal = mode ? objectiveTarget(mode) : KILLS_TO_WIN;
    return {end: Math.max(report.seconds, (count - 2) * race.step, 1), goal, top: Math.max(goal, ...race.points.flat())};
}
/** Sample `i`'s time on the race (the last sample is the finish). */
export const raceTime = (report: RoundReport, i: number, end: number) => i === report.race!.points[0]!.length - 1 ? end : Math.min(end, i * report.race!.step);
/** The race as SVG markup (numbers and colours only): the goal line, the floor and a line per rat, drawn in the given order. */
export function raceSvg(report: RoundReport, mode: AssignmentId | undefined, lines: readonly {i: number; ink: string; bold: boolean}[], W = 600, H = 100): string {
    const {end, goal, top} = raceScale(report, mode), y = (v: number) => H - v / top * H;
    const polylines = lines.map(({i, ink, bold}) => `<polyline fill="none" stroke="${ink}" stroke-width="${bold ? 3 : 2}" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${
        report.race!.points[i]!.map((v, j) => `${(raceTime(report, j, end) / end * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" class="race-goal" vector-effect="non-scaling-stroke"/>` +
        `<line x1="0" x2="${W}" y1="${H}" y2="${H}" class="race-floor" vector-effect="non-scaling-stroke"/>${polylines.join('')}</svg>`;
}

/** Everything the round-end frame said, for the stats file. */
export interface RoundStats { winnerId: string; winnerName: string; kills: number; assignment?: AssignmentState; awards?: readonly Award[]; report: RoundReport; localId?: string }

const esc = (value: string) => value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const pad = (n: number) => String(n).padStart(2, '0');
/** `rat-detective-paper-chase-2026-10-01-2147.html` */
export function statsFileName(stats: RoundStats, at: Date): string {
    const mode = (stats.assignment ? ASSIGNMENTS[stats.assignment.id].title : 'deathmatch').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `rat-detective-${mode}-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.html`;
}
const FILE_INKS = ['#9fcfd6', '#b5cfa6', '#cdbfae', '#b9c9ec'];
/** A self-contained page in the board's noir carbon: the round's numbers, standings, Case File, tallies, race and every
 * rat's file, with the raw report embedded as JSON (`#round-stats`). Names are escaped; nothing is fetched. */
export function statsPage(stats: RoundStats, at: Date): string {
    const {report, assignment} = stats, mode = assignment?.id, title = assignment ? ASSIGNMENTS[assignment.id].title : 'DEATHMATCH';
    const goal = (id: string) => assignment ? Math.floor(objectivePoints(assignment, id)) : undefined;
    const rats = [...report.rats].sort((a, b) => Number(b.id === stats.winnerId) - Number(a.id === stats.winnerId) || (goal(b.id) ?? b.kills) - (goal(a.id) ?? a.kills) || b.kills - a.kills || a.name.localeCompare(b.name));
    const name = (rat: ReportRat) => `${esc(rat.name)}${rat.id === stats.winnerId ? ' <small>WINNER</small>' : ''}${rat.id === stats.localId ? ' <small class="you">YOU</small>' : ''}`;
    const head = ['#', 'INVESTIGATOR', ...(mode ? [objectiveUnit(mode)] : []), 'K', 'D', 'A', 'K/MIN', 'ACC', 'HS', 'STREAK', 'DEALT', 'TAKEN', 'LONGEST', 'CASE', 'TAKES', 'CARRY', 'SUPPLIES', 'FLIGHTS'];
    const rows = rats.map((rat, i) => `<tr${rat.id === stats.winnerId ? ' class="winner"' : ''}><td>${i + 1}</td><th>${name(rat)}</th>${mode ? `<td>${goal(rat.id)}</td>` : ''}` +
        [rat.kills, rat.deaths, rat.assists, killsPerMinute(rat), accuracy(rat), rat.headshots, rat.streak, rat.dealt, rat.damage, rat.longest ? `${rat.longest} M` : '—',
            caseTime(rat.caseSeconds), rat.takes, caseTime(rat.carry), rat.supplies, rat.flights].map(v => `<td>${v}</td>`).join('') + '</tr>').join('');
    const numbers: [string, string, string?][] = [['ROUND LENGTH', caseTime(report.seconds)], ['KILLS', String(report.kills)], ['CASE HAND-OFFS', String(report.handoffs)],
        ...(report.carry ? [['LONGEST CARRY', caseTime(report.carry.seconds), esc(report.carry.playerName)] as [string, string, string]] : []),
        ['SUPPLIES', String(report.supplies)], ['FLIGHTS', String(report.flights)], ['DISPATCH CALLS', String(report.calls)]];
    const awards = stats.awards?.length ? `<section><h2>CASE FILE</h2><ul class="awards">${stats.awards.map(award => `<li><b>${esc(award.title)}</b><span>${esc(award.playerName)}</span><strong>${esc(awardValue(award))}</strong></li>`).join('')}</ul></section>` : '';
    const tallyBlocks = roundTallies(report).map(block => `<div><h3>${esc(block.title)}</h3><ul>${block.rows.map(([label, n]) => `<li><span>${esc(label)}</span><b>${n}</b></li>`).join('') || '<li><span>NONE</span></li>'}</ul></div>`).join('');
    let race = '';
    if (report.race) {
        const lines = report.race.ids.map((id, i) => ({i, id, ink: id === stats.winnerId ? '#d9b95e' : id === stats.localId ? '#e65a50' : FILE_INKS[i % FILE_INKS.length]!, bold: id === stats.winnerId || id === stats.localId}));
        const {goal: target, end} = raceScale(report, mode);
        race = `<section><h2>THE RACE TO ${target} ${mode ? objectiveUnit(mode) : 'KILLS'}</h2><div class="race">${raceSvg(report, mode, lines)}</div><p class="axis"><span>0:00</span><span>${caseTime(end)}</span></p>` +
            `<ul class="legend">${lines.map(({i, id, ink}) => { const points = report.race!.points[i]!; return `<li><i style="background:${ink}"></i>${esc(report.rats.find(rat => rat.id === id)?.name ?? '—')}<b>${Math.floor(points[points.length - 1]!)}</b></li>`; }).join('')}</ul></section>`;
    }
    const files = rats.map(rat => `<details><summary>${name(rat)}</summary><dl>${ratFile(rat).map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl></details>`).join('');
    const json = JSON.stringify({version: 1, savedAt: at.toISOString(), mode: assignment?.id ?? 'deathmatch', ...stats}).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rat Detective · ${esc(title)} · ${esc(stats.winnerName)}</title><style>
:root{--ink:#c9d3ea;--dim:#8a97b8;--bright:#eef2fb;--line:#a5b9e159;--faint:#a5b9e124;--cheese:#d9b95e;--stamp:#e65a50}
body{margin:0;padding:28px clamp(12px,4vw,48px) 48px;background:radial-gradient(ellipse at 50% 0,#0c1224,#05070d 70%) fixed;color:var(--ink);font:15px/1.45 "Courier New",ui-monospace,monospace}
h1{margin:0;font:700 clamp(28px,4vw,48px)/1.1 Georgia,serif;letter-spacing:1px;color:var(--bright)}h1 small{display:block;font:13px/1.6 "Courier New",monospace;letter-spacing:3px;color:var(--cheese)}
h2{margin:0 0 10px;font:700 20px/1 Georgia,serif;letter-spacing:1.5px;color:var(--cheese)}h3{margin:0 0 6px;font-size:12px;letter-spacing:1.4px;color:var(--dim);font-weight:400}
section{margin-top:22px;padding:16px 18px;background:#0c1224cc;border-top:1px dashed var(--line);box-shadow:0 8px 24px #0008}
.numbers{display:flex;flex-wrap:wrap;gap:6px 0}.numbers div{flex:1 1 120px;padding:0 14px;border-left:1px dashed var(--faint)}.numbers dt{font-size:11px;letter-spacing:1.4px;color:var(--dim)}.numbers dd{margin:0;font:700 26px/1.2 Georgia,serif;color:var(--bright)}.numbers p{margin:0;font-size:12px;text-transform:uppercase}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 7px;text-align:center;border-bottom:1px dashed var(--faint);white-space:nowrap}
thead th{font-size:11px;font-weight:400;letter-spacing:.6px;color:var(--dim)}tbody th{text-align:left;color:var(--bright)}tbody tr:hover{background:#a5b9e114}tr.winner th{color:var(--cheese)}
small{font-size:10px;letter-spacing:1px;color:var(--cheese)}small.you{color:var(--stamp)}
.awards,.tallies ul,.legend{list-style:none;margin:0;padding:0}.awards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px 18px}
.awards li{display:grid;grid-template-columns:1fr auto;padding-bottom:6px;border-bottom:1px dashed var(--faint)}.awards b{color:var(--bright)}.awards span{grid-row:2;font-size:13px}.awards strong{grid-row:1/3;grid-column:2;align-self:center;color:var(--cheese)}
.tallies{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px 22px}.tallies li{display:flex;justify-content:space-between;gap:12px;border-bottom:1px dashed var(--faint)}.tallies b{color:var(--bright)}
.race svg{display:block;width:100%;height:160px;overflow:visible}.race-goal{stroke:#d9b95e99;stroke-dasharray:5 5}.race-floor{stroke:var(--line)}.axis{display:flex;justify-content:space-between;margin:4px 0;font-size:11px;color:var(--dim)}
.legend{display:flex;flex-wrap:wrap;gap:4px 18px}.legend li{display:flex;align-items:center;gap:7px}.legend i{width:16px;height:3px}.legend b{color:var(--bright)}
details{border-bottom:1px dashed var(--faint);padding:6px 0}summary{cursor:pointer;color:var(--bright)}details dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 16px;margin:8px 0 4px 18px}details dt{color:var(--dim);font-size:12px;letter-spacing:1px}details dd{margin:0}
footer{margin-top:20px;font-size:12px;color:var(--dim)}
</style></head><body>
<h1><small>RAT DETECTIVE · ${esc(title)} · ${at.toLocaleString()}</small>CASE CLOSED BY ${esc(stats.winnerName)}</h1>
<section><dl class="numbers">${numbers.map(([label, value, who]) => `<div><dt>${label}</dt><dd>${value}</dd>${who ? `<p>${who}</p>` : ''}</div>`).join('')}</dl></section>
<section><h2>FINAL STANDINGS</h2><div class="scroll"><table><thead><tr>${head.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>
${awards}<section><h2>THE ROUND</h2><div class="tallies">${tallyBlocks}</div></section>${race}
<section><h2>EVERY RAT'S FILE</h2>${files}</section>
<footer>Server-counted round report for the rats present at the finish. The raw report is embedded below as JSON (#round-stats).</footer>
<script type="application/json" id="round-stats">${json}</script>
</body></html>`;
}

/** Save the round's stats file from the received report (no server round-trip). */
export function downloadRoundStats(doc: Document, stats: RoundStats, at = new Date()): void {
    const url = URL.createObjectURL(new Blob([statsPage(stats, at)], {type: 'text/html'}));
    const link = doc.createElement('a'); link.href = url; link.download = statsFileName(stats, at);
    doc.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
