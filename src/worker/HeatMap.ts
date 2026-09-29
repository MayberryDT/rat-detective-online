import { CITY_BOUNDS } from '../shared/grayboxLayout';

/** Where rats spend time, die and kill, for planning the city. Counts only; no names
 * or IDs are kept. Rooms hold new counts in memory and add them to one SQL row per
 * day, layer and cell about once a minute. Every day is kept. */
export const HEAT_CELL = 4;
export const HEAT_SAMPLE_MS = 1000;
export const HEAT_FLUSH_MS = 60_000;
/** Bounds one flush's pending entries (a day of the whole city fits several times over). */
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

/** Sewer floor is -7; landmark upper floors start at 8; roofs top out near 37; launch flights go far higher. */
export function heatFloor(y: number): HeatFloor {
  return y < -2 ? 'sewer' : y < 5 ? 'street' : y < 45 ? 'upper' : 'air';
}

function cellKey(x: number, y: number, z: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const ix = Math.floor(x / HEAT_CELL), iz = Math.floor(z / HEAT_CELL);
  return inCity(ix) && inCity(iz) ? `${heatFloor(y)}:${ix}:${iz}` : null;
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
    const key = cellKey(x, y, z);
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

export const emptyHeat = (): HeatData => ({ layers: emptyLayers() });

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
