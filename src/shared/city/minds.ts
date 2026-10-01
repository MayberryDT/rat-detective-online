import { GOALS, PERSONALITIES, type Goal, type Personality } from '../bots/intent';

/** The Minds layer's vocabulary (docs/city-map.md): place measures for bot decisions and how their goals
 * ended, and the room-wide Jev measures kept in `city_minds`. Shared by the recorder, the digest and `/map`. */
export const MIND_NAMES = ['jev', 'code'] as const;
export type MindName = typeof MIND_NAMES[number];
export const GOAL_OUTCOMES = ['reached', 'died', 'replaced', 'failed'] as const;
export type GoalOutcome = typeof GOAL_OUTCOMES[number];

/** Counted where a bot took up a goal, or applied a fresh Jev answer. A bot with no archetype counts as `none`. */
export const decideMeasure = (mind: MindName, personality: Personality | undefined, goal: Goal) => `decide:${mind}:${personality ?? 'none'}:${goal}`;
/** Counted where the goal was taken up, when it ended. */
export const goalMeasure = (mind: MindName, personality: Personality | undefined, goal: Goal, outcome: GoalOutcome) => `goal:${mind}:${personality ?? 'none'}:${goal}:${outcome}`;

/** `city_minds` measures, summed over `minds` facts: how long Jev was on, the Jev mind's counts, its dollars in
 * millionths, and each reply's latency in 20 ms buckets (`latency:<lower bound>`, the last holding 2 s and over). */
export const JEV_COUNTS = ['decisions', 'requests', 'answers', 'failures', 'stale', 'fallbacks', 'throttled', 'tokens'] as const;
export const LATENCY_BUCKET_MS = 20;
const LATENCY_TOP_MS = 2000;
/** A reply latency's 20 ms bucket, by its lower bound; the last bucket holds 2 s and over. */
export const latencyBucket = (ms: number) => Math.min(LATENCY_TOP_MS, Math.floor(Math.max(0, ms) / LATENCY_BUCKET_MS) * LATENCY_BUCKET_MS);

export interface MindFilter { mind?: MindName; personality?: Personality; goal?: Goal }
export interface MindTally {
  decisions: number;
  byMind: Record<MindName, number>;
  byGoal: Partial<Record<Goal, number>>;
  byPersonality: Record<Personality, Partial<Record<Goal, number>>>;
  /** How goals taken up here ended. */
  outcomes: Partial<Record<Goal, Record<GoalOutcome, number>>>;
}

const isMind = (v: string | undefined): v is MindName => MIND_NAMES.some(m => m === v);
const isPersonality = (v: string | undefined): v is Personality => PERSONALITIES.some(p => p === v);
const isGoal = (v: string | undefined): v is Goal => GOALS.some(g => g === v);
const isOutcome = (v: string | undefined): v is GoalOutcome => GOAL_OUTCOMES.some(o => o === v);

/** Decisions and goal outcomes in some place counts (one place's row, or every place's), under a filter. Rows from
 * bots with no archetype, or a retired one (mind version 6 and before), count in every total but no archetype's. */
export function tallyMinds(rows: Iterable<Readonly<Record<string, number>>>, filter: MindFilter = {}): MindTally {
  const t: MindTally = { decisions: 0, byMind: { jev: 0, code: 0 }, byGoal: {}, byPersonality: { sniper: {}, hose: {}, camper: {}, joyrider: {}, gremlin: {} }, outcomes: {} };
  for (const row of rows) for (const [key, n] of Object.entries(row)) {
    const [kind, mind, personality, goal, outcome] = key.split(':');
    if (kind !== 'decide' && kind !== 'goal' || !isMind(mind) || !isGoal(goal)) continue;
    if (filter.mind && filter.mind !== mind || filter.personality && filter.personality !== personality || filter.goal && filter.goal !== goal) continue;
    if (kind === 'goal') {
      if (isOutcome(outcome)) (t.outcomes[goal] ??= { reached: 0, died: 0, replaced: 0, failed: 0 })[outcome] += n;
      continue;
    }
    t.decisions += n; t.byMind[mind] += n;
    t.byGoal[goal] = (t.byGoal[goal] ?? 0) + n;
    if (isPersonality(personality)) t.byPersonality[personality][goal] = (t.byPersonality[personality][goal] ?? 0) + n;
  }
  return t;
}

export interface JevSummary {
  onMs: number; dollars: number;
  counts: Record<typeof JEV_COUNTS[number], number>;
  /** Reply latency, ms, to the bucket: undefined without replies. */
  p50?: number; p90?: number;
}
/** The room-wide Jev measures (`city_minds`) summed over a range. */
export function jevSummary(minds: Readonly<Record<string, number>>): JevSummary {
  const counts = Object.fromEntries(JEV_COUNTS.map(k => [k, minds[k] ?? 0])) as JevSummary['counts'];
  const buckets = Object.entries(minds).filter(([k]) => k.startsWith('latency:')).map(([k, n]) => [Number(k.slice(8)), n] as const).sort((a, b) => a[0] - b[0]);
  const replies = buckets.reduce((s, [, n]) => s + n, 0);
  /** The bucket holding the q-th reply, read at its middle. */
  const quantile = (q: number) => {
    let seen = 0;
    for (const [lo, n] of buckets) if ((seen += n) > q * replies) return lo + LATENCY_BUCKET_MS / 2;
    return LATENCY_TOP_MS + LATENCY_BUCKET_MS / 2;
  };
  return { onMs: minds['on-ms'] ?? 0, dollars: (minds['microdollars'] ?? 0) / 1e6, counts,
    ...(replies ? { p50: quantile(.5), p90: quantile(.9) } : {}) };
}
