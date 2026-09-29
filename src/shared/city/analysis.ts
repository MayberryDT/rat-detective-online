import { toBoxLocal, type BoxPose } from '../boxFrame';
import { CITY_CELL, DISTRICTS, districtAt, type District } from './frame';

/**
 * Static analyses of the city map (docs/city-map.md, "Static analyses"): what the layout implies
 * before anyone plays. Everything here works on the street level only, on a 1-unit grid built
 * from collision boxes; stairs, the sewer and launch arcs are not routes here.
 */
export interface GridBox extends BoxPose { passBalls?: true }
export interface Area { xmin: number; xmax: number; zmin: number; zmax: number }

/** A rat's eyes; anything spanning this height hides a rat standing behind it. */
export const EYE_Y = 1.6;
/** Rats hop onto anything lower than this (jump apex is about 5 units), so only taller solids stop a walk. */
export const HOP_Y = 4;
/** Mid-body: a solid spanning it shields a rat from cheese. */
export const COVER_Y = .9;
/** Running speed, units per second (RatController MOVE_SPEED). */
export const RUN_SPEED = 18;
const SIGHT_RANGE = 180, RAYS = 32, COVER_RADIUS = 6;

export class StreetGrid {
  readonly n: number;
  /** 1 where a rat can stand at street level. */
  readonly walk: Uint8Array;
  /** 1 where a solid hides a rat's head. */
  readonly sight: Uint8Array;
  /** 1 where a solid shields a rat's body (bars do not: cheese passes them). */
  readonly cover: Uint8Array;
  constructor(boxes: readonly GridBox[], water: readonly Area[], readonly bounds: { min: number; max: number }) {
    const n = this.n = Math.ceil(bounds.max - bounds.min), size = n * n;
    this.walk = new Uint8Array(size).fill(1); this.sight = new Uint8Array(size); this.cover = new Uint8Array(size);
    const deck = new Uint8Array(size);
    for (const w of water) this.fill(w.xmin, w.xmax, w.zmin, w.zmax, i => { this.walk[i] = 0; });
    for (const b of boxes) {
      // Ramps and stairs are tilted colliders: rats walk up them.
      if (b.rx || b.rz) continue;
      const top = b.y + b.h / 2, bottom = b.y - b.h / 2;
      if (top > -1 && top <= .6 && top > bottom) { this.stamp(b, i => { deck[i] = 1; }); continue; }
      if (top <= .6 || bottom >= EYE_Y) continue;
      const blocksWalk = top > HOP_Y, blocksSight = !b.passBalls && top > EYE_Y && bottom < EYE_Y, covers = !b.passBalls && top > COVER_Y && bottom < COVER_Y;
      if (!blocksWalk && !blocksSight && !covers) continue;
      this.stamp(b, i => { if (blocksWalk || b.passBalls) this.walk[i] = 2; if (blocksSight) this.sight[i] = 1; if (covers) this.cover[i] = 1; });
    }
    // Decks over the water are ground; a solid stamped anywhere (2) stays blocked.
    for (let i = 0; i < size; i++) this.walk[i] = this.walk[i] === 2 ? 0 : this.walk[i] || deck[i]!;
  }
  index(x: number, z: number): number {
    const ix = Math.floor(x - this.bounds.min), iz = Math.floor(z - this.bounds.min);
    return ix < 0 || iz < 0 || ix >= this.n || iz >= this.n ? -1 : iz * this.n + ix;
  }
  walkable(x: number, z: number): boolean { const i = this.index(x, z); return i >= 0 && this.walk[i] === 1; }
  /** The nearest walkable grid cell to a point, within `radius` units; -1 when none. */
  snap(x: number, z: number, radius = 3): number {
    let best = -1, bestD = Infinity;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const i = this.index(x + dx, z + dz), d = dx * dx + dz * dz;
      if (i >= 0 && this.walk[i] === 1 && d < bestD && d <= radius * radius) { best = i; bestD = d; }
    }
    return best;
  }
  private fill(x0: number, x1: number, z0: number, z1: number, f: (i: number) => void): void {
    const n = this.n, m = this.bounds.min;
    for (let iz = Math.max(0, Math.floor(z0 - m)); iz < Math.min(n, Math.ceil(z1 - m)); iz++)
      for (let ix = Math.max(0, Math.floor(x0 - m)); ix < Math.min(n, Math.ceil(x1 - m)); ix++)
        if (m + ix + .5 >= x0 && m + ix + .5 <= x1 && m + iz + .5 >= z0 && m + iz + .5 <= z1) f(iz * n + ix);
  }
  /** Every cell whose centre lies in the box's footprint, thin boxes thickened to one cell so walls never leak. */
  private stamp(b: GridBox, f: (i: number) => void): void {
    const hw = Math.max(b.w / 2, .5), hd = Math.max(b.d / 2, .5), c = Math.abs(Math.cos(b.ry ?? 0)), s = Math.abs(Math.sin(b.ry ?? 0));
    const ex = c * hw + s * hd, ez = s * hw + c * hd, n = this.n, m = this.bounds.min, flat: GridBox = { ...b, rx: 0, rz: 0 };
    for (let iz = Math.max(0, Math.floor(b.z - ez - m)); iz < Math.min(n, Math.ceil(b.z + ez - m)); iz++)
      for (let ix = Math.max(0, Math.floor(b.x - ex - m)); ix < Math.min(n, Math.ceil(b.x + ex - m)); ix++) {
        const l = toBoxLocal(flat, m + ix + .5, b.y, m + iz + .5);
        if (Math.abs(l.x) <= hw && Math.abs(l.z) <= hd) f(iz * n + ix);
      }
  }
}

/** Analysis output on the map's 4-unit cells (the same cells as the heat layers), NaN where no rat can stand. */
export interface CellField { min: number; span: number; values: Float32Array }
const cellField = (grid: StreetGrid): CellField => {
  const min = Math.floor(grid.bounds.min / CITY_CELL), span = Math.ceil(grid.bounds.max / CITY_CELL) - min;
  return { min, span, values: new Float32Array(span * span).fill(Number.NaN) };
};
/** One walkable grid cell per 4-unit map cell (nearest its centre), or -1. */
function representatives(grid: StreetGrid, field: CellField): Int32Array {
  const out = new Int32Array(field.span * field.span).fill(-1);
  for (let cz = 0; cz < field.span; cz++) for (let cx = 0; cx < field.span; cx++) {
    const x = (cx + field.min + .5) * CITY_CELL, z = (cz + field.min + .5) * CITY_CELL;
    out[cz * field.span + cx] = grid.snap(x, z, CITY_CELL / 2);
  }
  return out;
}
export const fieldAt = (f: CellField, x: number, z: number): number => {
  const cx = Math.floor(x / CITY_CELL) - f.min, cz = Math.floor(z / CITY_CELL) - f.min;
  return cx < 0 || cz < 0 || cx >= f.span || cz >= f.span ? Number.NaN : f.values[cz * f.span + cx]!;
};

/** Sightlines from every street cell: the longest clear line (units) and the open ground in view (square units, capped at SIGHT_RANGE). */
export function sightlines(grid: StreetGrid): { longest: CellField; open: CellField } {
  const longest = cellField(grid), open = cellField(grid), reps = representatives(grid, longest), n = grid.n;
  const dirs = Array.from({ length: RAYS }, (_, k) => [Math.cos(k / RAYS * Math.PI * 2), Math.sin(k / RAYS * Math.PI * 2)] as const);
  for (let c = 0; c < reps.length; c++) {
    const start = reps[c]!;
    if (start < 0) continue;
    const x0 = start % n + .5, z0 = Math.floor(start / n) + .5;
    let far = 0, area = 0;
    for (const [dx, dz] of dirs) {
      // Grid traversal (Amanatides–Woo): every cell the ray crosses, so no wall is skipped.
      let ix = Math.floor(x0), iz = Math.floor(z0), t = 0;
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const ddx = dx ? Math.abs(1 / dx) : Infinity, ddz = dz ? Math.abs(1 / dz) : Infinity;
      let tx = dx ? ((dx > 0 ? ix + 1 - x0 : x0 - ix) * ddx) : Infinity, tz = dz ? ((dz > 0 ? iz + 1 - z0 : z0 - iz) * ddz) : Infinity;
      while (t < SIGHT_RANGE) {
        if (tx < tz) { t = tx; tx += ddx; ix += sx; } else { t = tz; tz += ddz; iz += sz; }
        if (ix < 0 || iz < 0 || ix >= n || iz >= n || grid.sight[iz * n + ix]) break;
      }
      const r = Math.min(t, SIGHT_RANGE);
      far = Math.max(far, r); area += .5 * r * r * (Math.PI * 2 / RAYS);
    }
    longest.values[c] = far; open.values[c] = area;
  }
  return { longest, open };
}

/** Share of ground within COVER_RADIUS units that shields a rat (0 open ground, 1 all cover). */
export function coverDensity(grid: StreetGrid): CellField {
  const out = cellField(grid), reps = representatives(grid, out), n = grid.n;
  const sum = new Int32Array((n + 1) * (n + 1));
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) sum[(z + 1) * (n + 1) + x + 1] = grid.cover[z * n + x]! + sum[z * (n + 1) + x + 1]! + sum[(z + 1) * (n + 1) + x]! - sum[z * (n + 1) + x]!;
  for (let c = 0; c < reps.length; c++) {
    const i = reps[c]!;
    if (i < 0) continue;
    const x = i % n, z = Math.floor(i / n), x0 = Math.max(0, x - COVER_RADIUS), x1 = Math.min(n, x + COVER_RADIUS + 1), z0 = Math.max(0, z - COVER_RADIUS), z1 = Math.min(n, z + COVER_RADIUS + 1);
    const k = sum[z1 * (n + 1) + x1]! - sum[z0 * (n + 1) + x1]! - sum[z1 * (n + 1) + x0]! + sum[z0 * (n + 1) + x0]!;
    out.values[c] = k / ((x1 - x0) * (z1 - z0));
  }
  return out;
}

/** Running seconds from every grid cell to the nearest source (8 directions, no cutting corners); Infinity where unreachable. */
export function travelSeconds(grid: StreetGrid, sources: readonly number[]): Float64Array {
  const n = grid.n, dist = new Float64Array(n * n).fill(Infinity), heap: number[] = [], key: number[] = [];
  const push = (i: number, d: number) => {
    heap.push(i); key.push(d);
    for (let c = heap.length - 1; c > 0;) { const p = (c - 1) >> 1; if (key[p]! <= key[c]!) break; [heap[p], heap[c]] = [heap[c]!, heap[p]!]; [key[p], key[c]] = [key[c]!, key[p]!]; c = p; }
  };
  const pop = () => {
    const top = heap[0]!, d = key[0]!, li = heap.pop()!, lk = key.pop()!;
    if (heap.length) {
      heap[0] = li; key[0] = lk;
      for (let c = 0; ;) { const l = 2 * c + 1, r = l + 1; let s = c; if (l < heap.length && key[l]! < key[s]!) s = l; if (r < heap.length && key[r]! < key[s]!) s = r; if (s === c) break; [heap[s], heap[c]] = [heap[c]!, heap[s]!]; [key[s], key[c]] = [key[c]!, key[s]!]; c = s; }
    }
    return [top, d] as const;
  };
  for (const s of sources) if (s >= 0 && grid.walk[s] === 1 && dist[s]! > 0) { dist[s] = 0; push(s, 0); }
  const open = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && grid.walk[z * n + x] === 1;
  while (heap.length) {
    const [i, d] = pop();
    if (d > dist[i]!) continue;
    const x = i % n, z = Math.floor(i / n);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || !open(x + dx, z + dz) || (dx && dz && (!open(x + dx, z) || !open(x, z + dz)))) continue;
      const j = (z + dz) * n + x + dx, nd = d + (dx && dz ? Math.SQRT2 : 1) / RUN_SPEED;
      if (nd < dist[j]!) { dist[j] = nd; push(j, nd); }
    }
  }
  return dist;
}
/** A travel field sampled on the map's cells. */
export function travelField(grid: StreetGrid, seconds: Float64Array): CellField {
  const out = cellField(grid), reps = representatives(grid, out);
  for (let c = 0; c < reps.length; c++) { const i = reps[c]!; if (i >= 0 && Number.isFinite(seconds[i]!)) out.values[c] = seconds[i]!; }
  return out;
}

/** Street cells cut off from the main street network (1), or on it (0). */
export function islands(grid: StreetGrid): { field: CellField; cutOff: number; total: number } {
  const n = grid.n, label = new Int32Array(n * n).fill(-1), sizes: number[] = [];
  for (let s = 0; s < n * n; s++) {
    if (grid.walk[s] !== 1 || label[s]! >= 0) continue;
    const id = sizes.length, stack = [s]; label[s] = id; let size = 0;
    while (stack.length) {
      const i = stack.pop()!; size++;
      const x = i % n, z = Math.floor(i / n);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz, j = nz * n + nx;
        if (nx >= 0 && nz >= 0 && nx < n && nz < n && grid.walk[j] === 1 && label[j]! < 0) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes)), field = cellField(grid), reps = representatives(grid, field);
  let cutOff = 0, total = 0;
  for (let c = 0; c < reps.length; c++) {
    const i = reps[c]!;
    if (i < 0) continue;
    const off = label[i] !== main ? 1 : 0;
    field.values[c] = off; cutOff += off; total++;
  }
  return { field, cutOff, total };
}

/** A street place's betweenness: the share of shortest place-to-place routes that pass through it. */
export interface ChokeScore { id: string; x: number; z: number; score: number }
/** Chokepoints: betweenness of each street place on the graph of places that touch (Brandes, weighted by centre distance). */
export function chokepoints(grid: StreetGrid, placeAt: (x: number, z: number) => { id: string; x: number; z: number } | undefined): {
  scores: ChokeScore[]; links: Array<[string, string]>;
} {
  const field = cellField(grid), reps = representatives(grid, field), span = field.span;
  const ids: string[] = [], index = new Map<string, number>(), centre: Array<[number, number]> = [], cellPlace = new Int32Array(reps.length).fill(-1);
  for (let c = 0; c < reps.length; c++) {
    if (reps[c]! < 0) continue;
    const p = placeAt((c % span + field.min + .5) * CITY_CELL, (Math.floor(c / span) + field.min + .5) * CITY_CELL);
    if (!p) continue;
    let k = index.get(p.id);
    if (k === undefined) { k = ids.length; index.set(p.id, k); ids.push(p.id); centre.push([p.x, p.z]); }
    cellPlace[c] = k;
  }
  const adj: Array<Set<number>> = ids.map(() => new Set());
  for (let c = 0; c < reps.length; c++) {
    const a = cellPlace[c]!;
    if (a < 0) continue;
    for (const d of [1, span]) {
      const b = c + d < reps.length && (d === span || (c + 1) % span) ? cellPlace[c + d]! : -1;
      if (b >= 0 && b !== a) { adj[a]!.add(b); adj[b]!.add(a); }
    }
  }
  const w = (a: number, b: number) => Math.max(CITY_CELL, Math.hypot(centre[a]![0] - centre[b]![0], centre[a]![1] - centre[b]![1]));
  const score = new Float64Array(ids.length);
  for (let s = 0; s < ids.length; s++) {
    const dist = new Float64Array(ids.length).fill(Infinity), sigma = new Float64Array(ids.length), delta = new Float64Array(ids.length);
    const preds: number[][] = ids.map(() => []), order: number[] = [], done = new Uint8Array(ids.length);
    dist[s] = 0; sigma[s] = 1;
    for (;;) {
      let u = -1;
      for (let i = 0; i < ids.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
      if (u < 0) break;
      done[u] = 1; order.push(u);
      for (const v of adj[u]!) {
        const nd = dist[u]! + w(u, v);
        if (nd < dist[v]! - 1e-9) { dist[v] = nd; sigma[v] = sigma[u]!; preds[v] = [u]; } else if (Math.abs(nd - dist[v]!) <= 1e-9) { sigma[v] += sigma[u]!; preds[v]!.push(u); }
      }
    }
    for (let k = order.length - 1; k >= 0; k--) {
      const v = order[k]!;
      for (const u of preds[v]!) delta[u] += sigma[u]! / sigma[v]! * (1 + delta[v]!);
      if (v !== s) score[v] += delta[v]!;
    }
  }
  const pairs = Math.max(1, (ids.length - 1) * (ids.length - 2));
  const links: Array<[string, string]> = [];
  adj.forEach((set, a) => { for (const b of set) if (a < b) links.push([ids[a]!, ids[b]!]); });
  return { scores: ids.map((id, i) => ({ id, x: centre[i]![0], z: centre[i]![1], score: score[i]! / pairs })).sort((a, b) => b.score - a.score), links };
}

/** What gives a district a job: objectives, supplies, pillars and places to spawn. */
export type JobKind = 'case' | 'supply' | 'pillar' | 'zone' | 'destination' | 'spawn';
export const JOB_KINDS: readonly JobKind[] = ['case', 'supply', 'pillar', 'zone', 'destination', 'spawn'];
export interface Slot { kind: JobKind; x: number; y: number; z: number }

/** Slots per district, and the districts with no objective of any kind (no case, supply, pillar, zone or destination). */
export function jobs(slots: readonly Slot[]): { table: Record<District, Record<JobKind, number>>; idle: District[] } {
  const table = Object.fromEntries(DISTRICTS.map(d => [d, Object.fromEntries(JOB_KINDS.map(k => [k, 0]))])) as Record<District, Record<JobKind, number>>;
  for (const s of slots) table[districtAt(s.x, s.z)][s.kind]++;
  return { table, idle: DISTRICTS.filter(d => JOB_KINDS.every(k => k === 'spawn' || table[d][k] === 0)) };
}

/** Objectives on the street grid: sewer ones are not on it; upstairs ones count from the nearest street cell below them. */
export function objectiveSources(grid: StreetGrid, slots: readonly Slot[]): { sources: number[]; offGrid: number } {
  const sources: number[] = [];
  let offGrid = 0;
  for (const s of slots) {
    const i = s.y < -2 ? -1 : grid.snap(s.x, s.z, s.y > 4 ? 16 : 4);
    if (i < 0) offGrid++; else sources.push(i);
  }
  return { sources, offGrid };
}

/** Median running seconds from the spawn points in each district to the nearest objective; undefined with no spawn or no reachable objective. */
export function spawnReach(grid: StreetGrid, spawns: readonly { x: number; z: number }[], seconds: Float64Array): Record<District, number | undefined> {
  const by = new Map<District, number[]>();
  for (const p of spawns) {
    const i = grid.snap(p.x, p.z, 2), t = i < 0 ? Infinity : seconds[i]!;
    if (!Number.isFinite(t)) continue;
    const d = districtAt(p.x, p.z);
    const list = by.get(d);
    if (list) list.push(t); else by.set(d, [t]);
  }
  return Object.fromEntries(DISTRICTS.map(d => {
    const v = (by.get(d) ?? []).sort((a, b) => a - b);
    return [d, v.length ? v[Math.floor(v.length / 2)] : undefined];
  })) as Record<District, number | undefined>;
}
