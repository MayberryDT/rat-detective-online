import type { Counts } from '../shared/city/verdict';
import { PLACES } from './city';

/** The public city endpoints (docs/city-map.md, "Agent surfaces"). */
export interface Heat { from: string; to: string; days: string[]; allDays: string[]; cell: number; layers: Record<string, Record<string, number>> }
/** `minds`: the Jev mind's room-wide measures (`src/shared/city/minds.ts`); absent from deployments before B5. */
export interface PlaceCounts { from: string; to: string; days: string[]; allDays: string[]; modes: Record<string, number>; places: Counts; minds?: Record<string, number> }
export interface Flow { src: string; dst: string; who: string; n: number }
export interface Flows { flows: Flow[] }

/** The page's data source: this site, or another deployment named by `?api=` (read-only public endpoints). */
export class Api {
  readonly base: string;
  constructor(param: string | null) {
    this.base = param && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(param) ? param : '';
  }
  async json<T>(path: string): Promise<T> {
    const response = await fetch(`${this.base}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path.split('?')[0]} answered ${response.status}`);
    return await response.json() as T;
  }
  async text(path: string): Promise<string> {
    const response = await fetch(`${this.base}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path.split('?')[0]} answered ${response.status}`);
    return await response.text();
  }
}

/** Place counts re-keyed to this layout's places, and how many recorded IDs had no place here. */
export interface FoldedCounts { counts: Counts; unplaced: number }
/** Counts keyed by the places of this layout: a retired lot or rooftop folds into the place that now holds it. */
export function foldCounts(counts: Counts): FoldedCounts {
  const out: Counts = {};
  let unplaced = 0;
  for (const [id, row] of Object.entries(counts)) {
    const place = PLACES.successor(id);
    if (!place) { unplaced++; continue; }
    const into = out[place.id] ??= {};
    for (const [k, n] of Object.entries(row)) into[k] = (into[k] ?? 0) + n;
  }
  return { counts: out, unplaced };
}

/** The range query shared by every aggregate: days=… or from/to, plus layout and assignment filters. */
export interface RangeChoice { when: string; from: string; to: string; layout: string; assignment: string }
export function rangeQuery(r: RangeChoice): string {
  const q = new URLSearchParams(r.when === 'custom' && r.from && r.to ? { from: r.from, to: r.to } : { days: r.when === 'custom' ? 'all' : r.when });
  if (r.layout) q.set('layout', r.layout);
  if (r.assignment) q.set('mode', r.assignment);
  return q.toString();
}
