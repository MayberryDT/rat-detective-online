import { CITY_BOUNDS } from '../shared/grayboxLayout';
import { CITY_CELL, cityFloor } from '../shared/city/frame';

/** Heat cells: counts in 4-unit cells keyed `floor:ix:iz` (docs/city-map.md). The city
 * recorder writes them; this module owns the key format, the range syntax and the
 * parser for heat v1's stored JSON days (read once by the migration). */
export const HEAT_CELL = CITY_CELL;
export const HEAT_MAX_CELLS = 40_000;
export const HEAT_LAYERS = ['humans', 'bots', 'deaths', 'kills'] as const;
export type HeatLayer = typeof HEAT_LAYERS[number];
export const isHeatLayer = (value: string): value is HeatLayer => (HEAT_LAYERS as readonly string[]).includes(value);
export type HeatFloor = 'sewer' | 'street' | 'upper' | 'air';
export interface HeatData { layers: Record<HeatLayer, Record<string, number>> }

const FLOORS: readonly HeatFloor[] = ['sewer', 'street', 'upper', 'air'];
const MARGIN = 20;
const MIN_CELL = Math.floor((CITY_BOUNDS.min - MARGIN) / HEAT_CELL);
const MAX_CELL = Math.floor((CITY_BOUNDS.max + MARGIN) / HEAT_CELL);
const inCity = (i: number) => Number.isInteger(i) && i >= MIN_CELL && i <= MAX_CELL;

const SPAN = MAX_CELL - MIN_CELL + 1;

/** The cell a position falls in as a number (-1 when unusable or far outside the city), so hot
 * paths can count cells without building the key; `heatCellKey` turns it into `floor:ix:iz`. */
export function heatCellIndex(x: number, y: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
  const ix = Math.floor(x / HEAT_CELL), iz = Math.floor(z / HEAT_CELL);
  return inCity(ix) && inCity(iz) ? (FLOORS.indexOf(cityFloor(y)) * SPAN + ix - MIN_CELL) * SPAN + iz - MIN_CELL : -1;
}

export const heatCellKey = (index: number): string =>
  `${FLOORS[Math.floor(index / (SPAN * SPAN))]}:${Math.floor(index / SPAN) % SPAN + MIN_CELL}:${index % SPAN + MIN_CELL}`;

/** The cell a position falls in, or null when it is unusable or far outside the city. */
export function heatCell(x: number, y: number, z: number): string | null {
  const index = heatCellIndex(x, y, z);
  return index < 0 ? null : heatCellKey(index);
}

export function validHeatKey(key: string): boolean {
  const parts = key.split(':');
  return parts.length === 3 && (FLOORS as readonly string[]).includes(parts[0]!)
    && /^-?\d+$/.test(parts[1]!) && /^-?\d+$/.test(parts[2]!) && inCity(Number(parts[1])) && inCity(Number(parts[2]));
}

const emptyLayers = (): HeatData['layers'] => ({ humans: {}, bots: {}, deaths: {}, kills: {} });

export class HeatDay {
  private readonly layers = emptyLayers();
  /** Stored entries (layer and cell), which is what the cap bounds. */
  private readonly cells = new Set<string>();

  constructor(data?: HeatData, private readonly maxCells = HEAT_MAX_CELLS) {
    if (data) this.load(data.layers);
  }

  /** Stored rows are untrusted: anything malformed is dropped, a corrupt row is an empty day. */
  static parse(raw: string | undefined, maxCells = HEAT_MAX_CELLS): HeatDay {
    let value: unknown = null;
    try { value = raw ? JSON.parse(raw) : null; } catch { /* corrupt row: start the day over */ }
    const day = new HeatDay(undefined, maxCells);
    if (value && typeof value === 'object' && 'layers' in value) day.load(value.layers);
    return day;
  }

  private load(layers: unknown): void {
    if (!layers || typeof layers !== 'object' || Array.isArray(layers)) return;
    for (const [layer, source] of Object.entries(layers)) {
      if (!isHeatLayer(layer) || !source || typeof source !== 'object' || Array.isArray(source)) continue;
      for (const [key, n] of Object.entries(source)) {
        if (!validHeatKey(key) || typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0 || this.cells.size >= this.maxCells) continue;
        this.layers[layer][key] = n;
        this.cells.add(`${layer}|${key}`);
      }
    }
  }

  /** False when the position is unusable or the day is full of other cells. */
  add(layer: HeatLayer, x: number, y: number, z: number): boolean {
    const key = heatCell(x, y, z);
    if (!key) return false;
    const entry = `${layer}|${key}`;
    if (!this.cells.has(entry)) {
      if (this.cells.size >= this.maxCells) return false;
      this.cells.add(entry);
    }
    const counts = this.layers[layer];
    counts[key] = (counts[key] ?? 0) + 1;
    return true;
  }

  toJSON(): HeatData { return { layers: this.layers }; }

  *entries(): Generator<[HeatLayer, string, number]> {
    for (const layer of HEAT_LAYERS) for (const [key, n] of Object.entries(this.layers[layer])) yield [layer, key, n];
  }
}

export const heatDayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);


const DAY_MS = 86_400_000;
function isDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && heatDayKey(ms) === value;
}

/** `days=N` (1–3650, today counts as one), `days=all`, or `from` and `to` together
 * (UTC days, inclusive). Absent means the last week. Anything else is null. */
export function heatRange(params: URLSearchParams, now: number): { from: string; to: string } | null {
  const days = params.get('days'), from = params.get('from'), to = params.get('to');
  if (from !== null || to !== null) {
    if (days !== null || !isDay(from) || !isDay(to) || from > to) return null;
    return { from, to };
  }
  if (days === 'all') return { from: '0000-01-01', to: '9999-12-31' };
  const count = days === null ? 7 : /^\d{1,4}$/.test(days) ? Number(days) : 0;
  if (count < 1 || count > 3650) return null;
  return { from: heatDayKey(now - (count - 1) * DAY_MS), to: heatDayKey(now) };
}
