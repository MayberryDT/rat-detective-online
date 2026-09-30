import type { Place } from '../../shared/city/places';
import { divergence, measurePlaces, MIN_EVENTS, MIN_HUMAN_SECONDS, type Rate } from '../../shared/city/measures';
import { jevSummary, tallyMinds } from '../../shared/city/minds';
import { GOALS, PERSONALITIES } from '../../shared/bots/intent';
import { PICKUP_KINDS } from '../../shared/pickups';

/** Layer 4 of the city map: a short Markdown reading, each line with an evidence handle
 * that `/api/city/v1/places` or `/flows` answers exactly (docs/city-map.md). */
export interface DigestInput {
  range: { from: string; to: string }; days: string[];
  places: readonly Place[];
  counts: Record<string, Record<string, number>>;
  modes: Record<string, number>;
  flows: Array<{ src: string; dst: string; who: string; n: number }>;
  /** The Jev mind's room-wide measures (`city_minds`). */
  minds: Record<string, number>;
}
const hours = (s: number) => (s / 3600).toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const perMin = (r: Rate) => `${r.rate.toFixed(2)}/min (${r.lo.toFixed(2)}–${r.hi.toFixed(2)})`;
const share = (r: Rate) => `${pct(r.rate)} (${pct(r.lo)}–${pct(r.hi)})`;

export function cityDigest(input: DigestInput): string {
  const m = measurePlaces(input.places, input.counts), rows = [...m.values()];
  const handle = (place: string, measure: string) => `\`place:${place} · measure:${measure} · ${input.range.from}..${input.range.to}\``;
  const total = (key: string) => rows.reduce((t, r) => t + (r.raw[key] ?? 0), 0);
  const humanS = total('human-s'), botS = total('bot-s');
  const out: string[] = [`# City digest, ${input.range.from} to ${input.range.to}`, ''];
  out.push(`Exposure: ${hours(humanS)} human rat-hours, ${hours(botS)} bot rat-hours, over ${input.days.length} recorded day(s).`);
  const modes = Object.entries(input.modes).filter(([, s]) => s > 0).map(([mode, s]) => `${mode} ${hours(s)} h`).join(', ');
  if (modes) out.push(`Human time by assignment: ${modes}.`);
  if (humanS < MIN_HUMAN_SECONDS * 3) out.push(`**Too little human play for place findings yet** (need about ${Math.round(MIN_HUMAN_SECONDS * 3 / 60)} human rat-minutes); bot and fire figures below still hold.`);
  out.push('');

  // Shooting: how often, how well, humans against bots.
  const shotsH = total('shots-human'), shotsB = total('shots-bot'), hitsH = total('hits-human'), hitsB = total('hits-bot');
  out.push('## Shooting');
  if (humanS > 0) out.push(`- Humans fire ${(shotsH / (humanS / 60)).toFixed(1)} shots per minute alive; ${shotsH ? pct(hitsH / shotsH) : '–'} hit a rat.`);
  if (botS > 0) out.push(`- Bots fire ${(shotsB / (botS / 60)).toFixed(1)} shots per minute alive; ${shotsB ? pct(hitsB / shotsB) : '–'} hit a rat.`);
  const bankH = total('bank-hits-human'), bankB = total('bank-hits-bot');
  if (hitsH || hitsB) out.push(`- Banked off a wall: ${hitsH ? pct(bankH / hitsH) : '–'} of human hits, ${hitsB ? pct(bankB / hitsB) : '–'} of bot hits.`);
  out.push('');

  const judged = rows.filter(r => r.use !== undefined && r.place.area >= 256 && humanS >= MIN_HUMAN_SECONDS * 3);
  if (judged.length) {
    out.push('## Dead zones (use under 0.3)');
    for (const r of judged.filter(r => r.use! < .3).sort((a, b) => b.place.area - a.place.area).slice(0, 10))
      out.push(`- ${r.place.name}: use ${r.use!.toFixed(2)}, ${r.place.area} u² ${handle(r.place.id, 'use')}`);
    out.push('', '## Magnets (highest use)');
    for (const r of [...judged].sort((a, b) => b.use! - a.use!).slice(0, 6))
      out.push(`- ${r.place.name}: use ${r.use!.toFixed(1)}, ${Math.round(r.humanS / 60)} human min ${handle(r.place.id, 'use')}`);
    out.push('');
    const deadly = rows.filter(r => r.enough && r.dangerHuman && r.dangerHuman.k >= 3).sort((a, b) => b.dangerHuman!.rate - a.dangerHuman!.rate).slice(0, 6);
    if (deadly.length) {
      out.push('## Most dangerous for humans (deaths per human minute)');
      for (const r of deadly) out.push(`- ${r.place.name}: ${perMin(r.dangerHuman!)} ${handle(r.place.id, 'danger-human')}`);
      out.push('');
    }
  }
  const traps = rows.filter(r => r.spawnTrap && (r.raw['spawns'] ?? 0) >= MIN_EVENTS).sort((a, b) => b.spawnTrap!.rate - a.spawnTrap!.rate).slice(0, 5);
  if (traps.length) {
    out.push('## Spawn traps (died within 5 s of spawning)');
    for (const r of traps) out.push(`- ${r.place.name}: ${share(r.spawnTrap!)} of ${r.raw['spawns']} spawns ${handle(r.place.id, 'spawn-trap')}`);
    out.push('');
  }
  const roosts = rows.filter(r => r.lethality !== undefined && (r.raw['kills'] ?? 0) >= MIN_EVENTS).sort((a, b) => b.lethality! - a.lethality!).slice(0, 5);
  if (roosts.length) {
    out.push('## Strongest positions (kills made per death suffered)');
    for (const r of roosts) out.push(`- ${r.place.name}: ${r.lethality!.toFixed(1)} (${r.raw['kills']} kills, ${r.raw['deaths'] ?? 0} deaths) ${handle(r.place.id, 'lethality')}`);
    out.push('');
  }
  const pickups = PICKUP_KINDS.map(kind => [kind, total(`pickup:${kind}`)] as const);
  out.push('## Pickups, launchers and faults');
  out.push(`- Pickups claimed: ${pickups.map(([k, n]) => `${k} ${n}`).join(', ')}.`);
  out.push(`- Launches ${total('launches')}, landings ${total('landings')}, landings inside geometry ${total('landing-clips')}.`);
  const faults = rows.map(r => [r, Object.entries(r.raw).filter(([k]) => k.startsWith('anomaly:')).reduce((t, [, n]) => t + n, 0)] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [r, n] of faults) out.push(`- Fault spot: ${r.place.name}, ${n} anomalies (${Object.entries(r.raw).filter(([k]) => k.startsWith('anomaly:')).map(([k, v]) => `${k.slice(8)} ${v}`).join(', ')}) ${handle(r.place.id, 'anomaly')}`);
  out.push('');
  // Bots against humans: where they spend their time.
  if (humanS >= MIN_HUMAN_SECONDS && botS > 0) {
    const h: Record<string, number> = {}, b: Record<string, number> = {};
    for (const r of rows) { if (r.humanS) h[r.place.id] = r.humanS; if (r.botS) b[r.place.id] = r.botS; }
    out.push('## Bots against humans', `- Bot divergence (place time, 0 same to 1 unrelated): ${divergence(h, b).toFixed(2)}.`, '');
  }
  // The bots' minds (docs/bot-overhaul.md, B5): what they decide, how it ends, and what Jev costs.
  const minds = tallyMinds(Object.values(input.counts)), jev = jevSummary(input.minds);
  if (minds.decisions || jev.onMs) {
    const mind = (what: string) => `\`minds:${what} · ${input.range.from}..${input.range.to}\``;
    out.push('## Minds');
    out.push(`- Decisions recorded: ${minds.byMind.code} by the code mind, ${minds.byMind.jev} by Jev (Jev's share ${minds.decisions ? pct(minds.byMind.jev / minds.decisions) : '–'}) ${mind('decide')}`);
    for (const personality of PERSONALITIES) {
      const goals = Object.entries(minds.byPersonality[personality]).sort((a, b) => b[1] - a[1]), n = goals.reduce((t, [, k]) => t + k, 0);
      if (n) out.push(`- Goal mix, ${personality}s (${n} decisions): ${goals.slice(0, 5).map(([goal, k]) => `${goal} ${pct(k / n)}`).join(', ')} ${mind(`decide:${personality}`)}`);
    }
    for (const goal of GOALS) {
      const o = minds.outcomes[goal], ended = o ? o.reached + o.died + o.replaced + o.failed : 0;
      if (o && ended) out.push(`- ${goal}: reached ${pct(o.reached / ended)} of ${ended} (died ${pct(o.died / ended)}, replaced ${pct(o.replaced / ended)}, failed ${pct(o.failed / ended)}) ${mind(`goal:${goal}`)}`);
    }
    if (jev.onMs) {
      const on = jev.onMs / 3_600_000, c = jev.counts;
      out.push(`- Jev on for ${on.toFixed(1)} h: reply latency p50 ${jev.p50 ?? '–'} ms, p90 ${jev.p90 ?? '–'} ms over ${c.answers} replies; $${(jev.dollars / on).toFixed(2)} per hour on${humanS ? `, $${(jev.dollars / (humanS / 3600)).toFixed(2)} per human rat-hour` : ''} ($${jev.dollars.toFixed(2)} in all) ${mind('jev')}`);
      out.push(`- While Jev was on, the code mind took ${c.decisions ? pct(c.fallbacks / c.decisions) : '–'} of ${c.decisions} decisions (fallbacks); ${c.answers ? pct(c.stale / c.answers) : '–'} of replies came back stale; ${c.failures} requests failed and ${c.throttled} were held back by the room's rate ${mind('jev')}`);
    }
    out.push('');
  }
  const busiest = input.flows.filter(f => f.who === 'human').slice(0, 5);
  if (busiest.length) {
    out.push('## Busiest human routes (place to place)');
    for (const f of busiest) out.push(`- ${f.src} → ${f.dst}: ${f.n} crossings \`flow:${f.src}>${f.dst}\``);
    out.push('');
  }
  return out.join('\n');
}

