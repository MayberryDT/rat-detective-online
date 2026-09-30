// Observe's Minds layer: where the bots take up which goal, by mind and personality, and how those goals end.
import { GOALS, PERSONALITIES, type Goal } from '../shared/bots/intent';
import { GOAL_OUTCOMES, jevSummary, MIND_NAMES, tallyMinds, type MindFilter, type MindTally } from '../shared/city/minds';
import { choices, el, esc, pct, section } from './dom';

/** One colour per goal (a place is drawn in its most chosen goal's colour). */
const GOAL_RGB: Record<Goal, readonly [number, number, number]> = {
  'take-case': [255, 210, 63], 'chase-carrier': [255, 122, 31], 'keep-case': [199, 125, 255], 'hold-zone': [138, 92, 246], hunt: [255, 72, 60],
  flee: [64, 196, 206], heal: [61, 220, 106], 'arm-up': [217, 221, 227], ambush: [255, 90, 209], mischief: [160, 255, 60], roam: [111, 157, 255],
};
const rgba = ([r, g, b]: readonly [number, number, number], a: number) => `rgba(${r},${g},${b},${a.toFixed(2)})`;
const top = (counts: Partial<Record<Goal, number>>) => (Object.entries(counts) as Array<[Goal, number]>).sort((a, b) => b[1] - a[1]);

export class MindsLayer {
  readonly filter: MindFilter = {};
  readonly panel: HTMLElement;
  constructor(params: URLSearchParams, change: () => void) {
    const mind = MIND_NAMES.find(m => m === params.get('mind')), personality = PERSONALITIES.find(p => p === params.get('persona')), goal = GOALS.find(g => g === params.get('goal'));
    if (mind) this.filter.mind = mind;
    if (personality) this.filter.personality = personality;
    if (goal) this.filter.goal = goal;
    const pick = <K extends keyof MindFilter>(key: K, value: string, of: readonly NonNullable<MindFilter[K]>[]) => {
      const found = of.find(v => v === value);
      if (found) this.filter[key] = found; else delete this.filter[key];
      change();
    };
    this.panel = el('div', {},
      el('p', { className: 'note', text: 'Where bots took up each goal (their decisions), coloured by the goal chosen most in each place, or shaded by one goal. Hover for the mix and how those goals ended.' }),
      section('Mind', choices([['', 'Both'], ['jev', 'Jev'], ['code', 'Code']], () => this.filter.mind ?? '', v => pick('mind', v, MIND_NAMES))),
      section('Personality', choices([['', 'All'], ['tryhard', 'Tryhards'], ['maverick', 'Mavericks'], ['gremlin', 'Gremlins']], () => this.filter.personality ?? '', v => pick('personality', v, PERSONALITIES))),
      section('Goal', choices([['', 'Every goal'], ...GOALS.filter(g => g !== 'hold-zone').map(g => [g, g] as const)], () => this.filter.goal ?? '', v => pick('goal', v, GOALS))),
    );
  }
  save(set: (key: string, value: string, fallback: string) => void): void {
    set('mind', this.filter.mind ?? '', ''); set('persona', this.filter.personality ?? '', ''); set('goal', this.filter.goal ?? '', '');
  }
  tally(row: Readonly<Record<string, number>> | undefined): MindTally { return tallyMinds(row ? [row] : [], this.filter); }
  /** A place's colour at `v` (0–1 of the busiest place): its most chosen goal's, or the ramp's when one goal is shown. */
  color(t: MindTally, v: number, ramp: (v: number) => string): string | undefined {
    if (!t.decisions) return;
    if (this.filter.goal) return ramp(v);
    const [first] = top(t.byGoal);
    return first && rgba(GOAL_RGB[first[0]], .35 + .6 * v);
  }
  /** With every goal shown, the goal colours replace the ramp; `scale` says how bright the busiest place is. */
  legend(scale: string): string | undefined {
    if (this.filter.goal) return;
    return `<b>Minds, by place</b><p>Each place in the colour of the goal taken up most there; brighter: more decisions (${esc(scale)}).</p>`
      + `<p>${GOALS.filter(g => g !== 'hold-zone').map(g => `<span style="color:${rgba(GOAL_RGB[g], 1)}">■</span> ${esc(g)}`).join(' · ')}</p>`;
  }
  card(t: MindTally): string[] {
    if (!t.decisions && !Object.keys(t.outcomes).length) return [];
    const lines = [`Decisions here: ${t.decisions} (Jev ${t.byMind.jev}, code ${t.byMind.code})`];
    const mix = top(t.byGoal).slice(0, 5).map(([goal, n]) => `${goal} ${pct(n / t.decisions)}`).join(', ');
    if (mix) lines.push(`Goals taken up: ${mix}`);
    for (const [goal, o] of Object.entries(t.outcomes)) {
      const ended = GOAL_OUTCOMES.reduce((s, k) => s + o[k], 0);
      if (ended) lines.push(`${goal}: reached ${pct(o.reached / ended)} of ${ended} (died ${o.died}, replaced ${o.replaced}, failed ${o.failed})`);
    }
    return lines;
  }
  /** The side panel's totals over every place and the room-wide Jev measures. */
  totals(rows: Iterable<Readonly<Record<string, number>>>, minds: Readonly<Record<string, number>>): Array<readonly [string, string]> {
    const t = tallyMinds(rows, this.filter), jev = jevSummary(minds), hours = jev.onMs / 3_600_000;
    return [
      ['Decisions', `${t.decisions} (Jev ${t.decisions ? pct(t.byMind.jev / t.decisions) : '–'})`],
      ['Jev on', hours ? `${hours.toFixed(1)} h` : '–'],
      ['Jev latency p50 / p90', jev.p50 === undefined ? '–' : `${jev.p50} / ${jev.p90} ms`],
      ['Jev dollars per hour on', hours ? `$${(jev.dollars / hours).toFixed(2)}` : '–'],
    ];
  }
}
