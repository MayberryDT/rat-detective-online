import { isDistrict, type District } from './frame';
import { MIN_EVENTS, MIN_HUMAN_SECONDS, poissonInterval, wilson } from './measures';
import type { CityPlaces } from './places';

/**
 * Layers 5 and 6 of the city map (docs/city-map.md, "The design loop"): a proposal states
 * predicted measure changes; a verdict reads each prediction from the place counts of the
 * layout before and the layout after, and calls it only when both have enough play and
 * their 95% intervals do not overlap.
 */
export interface Scope { districts?: District[]; places?: string[] }
type Keys = string | string[];
export type MeasureSpec =
  /** Scope's share of a count across the city (seconds are read as minutes). */
  | { kind: 'share'; key: Keys; where: Scope }
  /** One count over another, inside the scope (for example banked hits over hits). */
  | { kind: 'ratio'; num: Keys; den: Keys; where?: Scope }
  /** A count per hour of exposure (for example Ironclad claims per rat-hour). */
  | { kind: 'rate'; key: Keys; per: Keys; where?: Scope };
export interface Prediction { id: string; says: string; expect: 'up' | 'down'; measure: MeasureSpec }
export interface Proposal {
  id: string; title: string; status: string; fromLayout: number; toLayout: number;
  summary: string; goals: string[]; predictions: Prediction[];
  /** Layout snapshot of the layout before (design/city/layouts/), for the footprint diff. */
  baseline?: string;
}
export interface Reading { value: number; lo: number; hi: number; unit: 'share' | 'per-hour'; n: number; enough: boolean }
export type Outcome = 'waiting' | 'met' | 'missed' | 'unclear';
export type Counts = Record<string, Record<string, number>>;

/** Human play a layout needs before any prediction is judged (the digest's bar for place findings). */
export const VERDICT_HUMAN_SECONDS = MIN_HUMAN_SECONDS * 3;
const list = (k: Keys) => (Array.isArray(k) ? k : [k]);

export function readMeasure(spec: MeasureSpec, counts: Counts, places: CityPlaces): Reading | undefined {
  const inScope = (id: string, scope?: Scope) => {
    if (!scope || (!scope.districts && !scope.places)) return true;
    const place = places.successor(id);
    return (scope.places ?? []).some(p => p === id || p === place?.id) || (!!place && (scope.districts ?? []).includes(place.district));
  };
  const sum = (keys: Keys, scope?: Scope) => {
    let t = 0;
    for (const [id, row] of Object.entries(counts)) if (inScope(id, scope)) for (const k of list(keys)) t += row[k] ?? 0;
    return t;
  };
  const human = sum('human-s');
  switch (spec.kind) {
    case 'share': {
      const seconds = list(spec.key).every(k => k.endsWith('-s')), scale = seconds ? 60 : 1, k = Math.round(sum(spec.key, spec.where) / scale), n = Math.round(sum(spec.key) / scale);
      if (n <= 0) return undefined;
      const [lo, hi] = wilson(k, n);
      return { value: k / n, lo, hi, unit: 'share', n, enough: human >= VERDICT_HUMAN_SECONDS && (seconds ? n * 60 >= VERDICT_HUMAN_SECONDS : n >= MIN_EVENTS) };
    }
    case 'ratio': {
      const k = sum(spec.num, spec.where), n = sum(spec.den, spec.where);
      if (n <= 0) return undefined;
      const [lo, hi] = wilson(k, n);
      return { value: k / n, lo, hi, unit: 'share', n, enough: human >= VERDICT_HUMAN_SECONDS && n >= MIN_EVENTS };
    }
    case 'rate': {
      const k = sum(spec.key, spec.where), hours = sum(spec.per, spec.where) / 3600;
      if (hours <= 0) return undefined;
      const [lo, hi] = poissonInterval(k);
      return { value: k / hours, lo: lo / hours, hi: hi / hours, unit: 'per-hour', n: k, enough: human >= VERDICT_HUMAN_SECONDS && hours * 3600 >= VERDICT_HUMAN_SECONDS };
    }
  }
}

/** Met when the after interval lies wholly past the before interval in the predicted direction; missed when wholly the other way. */
export function judge(p: Prediction, before: Counts, after: Counts, places: CityPlaces): { before?: Reading; after?: Reading; outcome: Outcome } {
  const b = readMeasure(p.measure, before, places), a = readMeasure(p.measure, after, places);
  const readings = { ...(b ? { before: b } : {}), ...(a ? { after: a } : {}) };
  if (!a || !b || !a.enough || !b.enough) return { ...readings, outcome: 'waiting' };
  const up = a.lo > b.hi, down = a.hi < b.lo;
  return { ...readings, outcome: !up && !down ? 'unclear' : (up === (p.expect === 'up') ? 'met' : 'missed') };
}

/** A proposal file, checked: every field present and every measure well formed. */
export function parseProposal(value: unknown): Proposal {
  const fail = (why: string): never => { throw new Error(`Bad proposal: ${why}`); };
  const obj = (v: unknown, what: string): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail(`${what} is not an object`));
  const str = (v: unknown, what: string) => (typeof v === 'string' && v ? v : fail(`${what} is not a string`));
  const keys = (v: unknown, what: string): Keys => (typeof v === 'string' ? v : Array.isArray(v) && v.length && v.every(k => typeof k === 'string') ? v as string[] : fail(`${what} is not a count key`));
  const scope = (v: unknown, what: string): Scope | undefined => {
    if (v === undefined) return undefined;
    const s = obj(v, what), out: Scope = {};
    if (s.districts !== undefined) out.districts = list(keys(s.districts, `${what}.districts`)).map(d => (isDistrict(d) ? d : fail(`${what} names no district "${d}"`)));
    if (s.places !== undefined) out.places = list(keys(s.places, `${what}.places`));
    return out;
  };
  const p = obj(value, 'proposal');
  const predictions = Array.isArray(p.predictions) ? p.predictions.map((raw, i): Prediction => {
    const q = obj(raw, `prediction ${i}`), m = obj(q.measure, `prediction ${i} measure`), at = `prediction ${i}`;
    const expect = q.expect === 'up' || q.expect === 'down' ? q.expect : fail(`${at} expects neither up nor down`);
    const where = scope(m.where, `${at} scope`);
    const measure: MeasureSpec = m.kind === 'share' ? { kind: 'share', key: keys(m.key, at), where: where ?? fail(`${at} share needs a scope`) }
      : m.kind === 'ratio' ? { kind: 'ratio', num: keys(m.num, at), den: keys(m.den, at), ...(where ? { where } : {}) }
      : m.kind === 'rate' ? { kind: 'rate', key: keys(m.key, at), per: keys(m.per, at), ...(where ? { where } : {}) }
      : fail(`${at} has an unknown measure kind`);
    return { id: str(q.id, `${at} id`), says: str(q.says, `${at} says`), expect, measure };
  }) : fail('predictions is not a list');
  const layout = (v: unknown, what: string) => (Number.isInteger(v) ? v as number : fail(`${what} is not a layout version`));
  const goals = Array.isArray(p.goals) && p.goals.every(g => typeof g === 'string') ? p.goals as string[] : fail('goals is not a list of strings');
  return {
    id: str(p.id, 'id'), title: str(p.title, 'title'), status: str(p.status, 'status'), fromLayout: layout(p.fromLayout, 'fromLayout'), toLayout: layout(p.toLayout, 'toLayout'),
    summary: str(p.summary, 'summary'), goals, predictions, ...(p.baseline === undefined ? {} : { baseline: str(p.baseline, 'baseline') }),
  };
}
