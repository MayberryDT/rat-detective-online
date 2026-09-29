/// <reference types="vite/client" />
// The city as the page draws it: built from the same shared layout modules as the game,
// so new streets, the docks and the precinct appear here as soon as they exist in the layout.
import { grayboxBoxes, GRAYBOX_VERSION, CITY_BOUNDS, CITY_PREVIEW_SEED } from '../shared/grayboxLayout';
import { kitCity } from '../shared/city/kit/city';
import { QUAY_EDGE_Z } from '../shared/city/kit/northPlan';
import { cityPlaces, type Place } from '../shared/city/places';
import { cityModel } from '../shared/city/model';
import { worldSpawnPoints } from '../shared/playerSpawns';
import { StreetGrid, type GridBox, type JobKind, type Slot } from '../shared/city/analysis';
import { CELL_MIN, CELL_SPAN, CITY_CELL } from '../shared/city/frame';

export interface Footprint { x: number; z: number; w: number; d: number; top: number; ry: number }
const r1 = (v: number) => Math.round(v * 10) / 10;

export const LAYOUT = GRAYBOX_VERSION;
export const BOXES = grayboxBoxes({ seed: CITY_PREVIEW_SEED, version: GRAYBOX_VERSION });
const kit = kitCity({ visuals: false }), kitBoxes = new Set(kit.boxes);
/** Everything that stands up from the street, lowest first so taller blocks draw on top. Kit colliders count: their look is drawn from pieces. */
export const FOOTPRINTS: Footprint[] = BOXES
  .filter(b => (!b.hidden || kitBoxes.has(b)) && b.y + b.h / 2 > .5 && b.y - b.h / 2 > -2 && b.w * b.d > 1.5)
  .map(b => ({ x: r1(b.x), z: r1(b.z), w: r1(b.w), d: r1(b.d), top: r1(b.y + b.h / 2), ry: Math.round((b.ry ?? 0) * 100) / 100 }))
  .sort((a, b) => a.top - b.top);
/** Walkable decks out over the harbour (piers, the breakwater). */
export const DECKS: Footprint[] = kit.boxes
  .filter(b => b.y + b.h / 2 > -1 && b.y + b.h / 2 <= .6 && b.z - b.d / 2 < QUAY_EDGE_Z && b.w > 1.5 && b.d > 1.5)
  .map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, top: b.y + b.h / 2, ry: b.ry ?? 0 }));
export const WATER = kit.water;
export const BOUNDS = CITY_BOUNDS;
export const PLACES = cityPlaces();
export const footprintKey = (f: Footprint) => `${f.x},${f.z},${f.w},${f.d},${f.top},${f.ry}`;

const JOB_OF: Record<string, JobKind> = { 'case-spawn': 'case', pickup: 'supply', pillar: 'pillar', zone: 'zone', destination: 'destination' };
export const MODEL = cityModel();
export const SPAWNS = worldSpawnPoints({ seed: CITY_PREVIEW_SEED, version: GRAYBOX_VERSION });
export const SLOTS: Slot[] = [
  ...MODEL.entities.flatMap(e => { const kind = JOB_OF[e.kind]; return kind ? [{ kind, x: e.x, y: e.y, z: e.z }] : []; }),
  ...SPAWNS.map(p => ({ kind: 'spawn' as const, x: p.x, y: 0, z: p.z })),
];

/** Place labels on the map: the buildings with floors, the yards, the boat, the harbour and the named streets. */
export const LABELS: Array<{ x: number; z: number; text: string; size: number }> = (() => {
  const out: Array<{ x: number; z: number; text: string; size: number }> = [];
  const named = new Map<string, Place>();
  for (const p of PLACES.list) {
    const street = /^street:(quay-road|gate-lane):/.exec(p.id);
    if (street && (named.get(street[1]!)?.cells ?? 0) < p.cells) named.set(street[1]!, p);
    if ((p.kind === 'landmark-floor' && p.id.endsWith(':0')) || p.id === 'landmark:gate:ground') out.push({ x: p.x, z: p.z, text: p.name.split(',')[0]!, size: 15 });
    else if ((p.kind === 'yard' && p.floor === 'street' && p.id !== 'grounds:precinct') || p.id === 'boat:deck') out.push({ x: p.x, z: p.z, text: p.name.split(',')[0]!, size: 12 });
    else if (p.kind === 'pier') out.push({ x: p.x, z: p.z + 6, text: p.name, size: 10 });
  }
  for (const p of named.values()) out.push({ x: p.x, z: p.z, text: p.name.split(',')[0]!, size: 12 });
  if (WATER.length) out.push({ x: (BOUNDS.min + BOUNDS.max) / 2 - 60, z: (BOUNDS.min + QUAY_EDGE_Z) / 2 + 1, text: 'The harbour', size: 16 });
  return out;
})();

/** The street place under each 4-unit map cell for a floor probe (undefined where no place). */
export function placeRaster(y: number): Array<Place | undefined> {
  const out: Array<Place | undefined> = [];
  for (let iz = 0; iz < CELL_SPAN; iz++) for (let ix = 0; ix < CELL_SPAN; ix++) {
    const p = PLACES.at((ix + CELL_MIN + .5) * CITY_CELL, y, (iz + CELL_MIN + .5) * CITY_CELL);
    const keep = y < -2 ? p.kind === 'sewer' && !p.id.startsWith('sewer:pipe-') : p.id !== 'outside' && p.floor !== 'sewer';
    out.push(keep ? p : undefined);
  }
  return out;
}

let grid: StreetGrid | undefined;
export const cityGrid = (): StreetGrid => (grid ??= new StreetGrid(BOXES, WATER, BOUNDS));

/** A layout before a change, from its snapshot (design/city/layouts/*.json): standing footprints, a street grid from its colliders, and its place IDs. */
export interface LayoutSnapshot { layoutVersion: number; footprints: Footprint[]; grid: StreetGrid; places: Array<{ id: string; name: string }> }
interface LayoutJson {
  layoutVersion: number;
  /** [x, z, w, d, top] */
  footprints: number[][];
  /** [x, y, z, w, h, d, tilted] */
  colliders: number[][];
  places: Array<{ id: string; name: string }>;
}
const SNAPSHOT_FILES = import.meta.glob<LayoutJson>('../../design/city/layouts/*.json', { import: 'default' });
const snapshots = new Map<string, Promise<LayoutSnapshot>>();
/** The snapshot a proposal names as its baseline (a repo path such as design/city/layouts/layout-2.json); undefined when no such file ships. */
export function layoutSnapshot(path: string): Promise<LayoutSnapshot> | undefined {
  const load = SNAPSHOT_FILES[`../../${path}`];
  if (!load) return undefined;
  let found = snapshots.get(path);
  if (!found) {
    found = load().then(json => ({
      layoutVersion: json.layoutVersion,
      footprints: json.footprints.map(([x = 0, z = 0, w = 0, d = 0, top = 0]) => ({ x, z, w, d, top, ry: 0 })),
      grid: new StreetGrid(json.colliders.map(([x = 0, y = 0, z = 0, w = 0, h = 0, d = 0, tilted = 0]): GridBox => ({ x, y, z, w, h, d, rx: tilted ? 1 : 0, rz: 0 })), [], BOUNDS),
      places: json.places,
    }));
    snapshots.set(path, found);
  }
  return found;
}
