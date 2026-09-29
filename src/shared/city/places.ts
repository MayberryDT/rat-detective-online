import { grayboxBoxes, GRAYBOX_VERSION, CITY_PREVIEW_SEED, CITY_BOUNDS } from '../grayboxLayout';
import { CITY_STREETS } from '../cityPlan';
import { LANDMARK_INTERIORS } from '../landmarkLayout';
import { SEWER_HALLS, SEWER_HALL_NAMES, SEWER_ENTRIES } from '../sewerLayout';
import { CELL_MIN, CELL_SPAN, CITY_CELL, cellIndex, cityFloor, coordLabel, districtAt, type CityFloor, type District } from './frame';

/** Layer 1 of the city map (docs/city-map.md): every position belongs to one named place.
 * Street-level places come from a 4-unit raster: streets split at their crossings,
 * crossings as junctions, and the open ground between buildings as lots. */
export type PlaceKind = 'street' | 'junction' | 'lot' | 'landmark' | 'landmark-floor' | 'roof' | 'sewer' | 'air' | 'outside';
export interface Place {
  id: string; kind: PlaceKind; name: string; floor: CityFloor; district: District;
  /** Raster cells (street and roof places) or nominal cells (landmark floors, sewer pipes, air). */
  cells: number; area: number; x: number; z: number;
}
export interface CityPlaces {
  readonly list: readonly Place[];
  readonly byId: ReadonlyMap<string, Place>;
  at(x: number, y: number, z: number): Place;
  /** Walkable street cells, and how many of them the places account for. */
  audit(): { walkable: number; counted: number };
}

const GATE = { id: 'gate', name: 'Gate', xmin: -146, xmax: -128, zmin: -32, zmax: 32 };
const OUTSIDE: Place = { id: 'outside', kind: 'outside', name: 'Outside the city', floor: 'street', district: 'centre', cells: 0, area: 0, x: 0, z: 0 };
const inRect = (x: number, z: number, r: { xmin: number; xmax: number; zmin: number; zmax: number }) => x >= r.xmin && x <= r.xmax && z >= r.zmin && z <= r.zmax;
const rectOf = (cx: number, cz: number, w: number, d: number) => ({ xmin: cx - w / 2, xmax: cx + w / 2, zmin: cz - d / 2, zmax: cz + d / 2 });
const streets = CITY_STREETS.map((s, i) => {
  const ew = s.w > s.d, base = `${ew ? 'ew' : 'ns'}-${coordLabel(ew ? s.z : s.x)}`;
  return { ...rectOf(s.x, s.z, s.w, s.d), ew, sid: CITY_STREETS.slice(0, i).some(o => (o.w > o.d) === ew && Math.round(ew ? o.z : o.x) === Math.round(ew ? s.z : s.x)) ? `${base}-${i}` : base };
});
const landmarks = LANDMARK_INTERIORS.map(l => ({ ...rectOf(l.cx, l.cz, l.w, l.d), id: l.id, name: l.name, levels: [...l.levels].sort((a, b) => a - b), cx: l.cx, cz: l.cz, w: l.w, d: l.d }));
const streetName = (sid: string) => {
  const [dir, at] = sid.split('-') as [string, string];
  return `${dir === 'ew' ? 'East–west street at z' : 'North–south street at x'} ${at.startsWith('m') ? '−' + at.slice(1) : at}`;
};

let cached: CityPlaces | undefined;
export function cityPlaces(fresh = false): CityPlaces {
  if (cached && !fresh) return cached;
  const built = build();
  if (!fresh) cached = built;
  return built;
}

function build(): CityPlaces {
  const list: Place[] = [], byId = new Map<string, Place>();
  const place = (p: Omit<Place, 'cells' | 'area' | 'x' | 'z'> & Partial<Place>): Place => {
    let found = byId.get(p.id);
    if (!found) { found = { cells: 0, area: 0, x: 0, z: 0, ...p }; byId.set(p.id, found); list.push(found); }
    return found;
  };
  const buildings = grayboxBoxes({ seed: CITY_PREVIEW_SEED, version: GRAYBOX_VERSION })
    .filter(b => b.building && !b.hidden && b.y - b.h / 2 < 1.5 && b.y + b.h / 2 > 2.5)
    .map(b => rectOf(b.x, b.z, b.w, b.d));
  const cell = (i: number) => (i + CELL_MIN + .5) * CITY_CELL;
  const index = (ix: number, iz: number) => iz * CELL_SPAN + ix;
  const street = new Int32Array(CELL_SPAN * CELL_SPAN).fill(-1);
  const roof = new Int32Array(CELL_SPAN * CELL_SPAN).fill(-1);
  const sewer = new Int32Array(CELL_SPAN * CELL_SPAN).fill(-1);
  const lotCells: number[] = [], roofCells: number[] = [];
  const add = (p: Place, ix: number, iz: number) => { p.cells++; p.x += cell(ix); p.z += cell(iz); };

  for (let iz = 0; iz < CELL_SPAN; iz++) for (let ix = 0; ix < CELL_SPAN; ix++) {
    const x = cell(ix), z = cell(iz), i = index(ix, iz);
    const hall = SEWER_HALLS.reduce((found, r, h) => (inRect(x, z, r) ? h : found), -1);
    if (hall >= 0) {
      const p = place({ id: `sewer:${SEWER_HALL_NAMES[hall]}`, kind: 'sewer', name: `Sewer, ${SEWER_HALL_NAMES[hall]!.replace('-', ' ')}`, floor: 'sewer', district: districtAt(x, z) });
      sewer[i] = list.indexOf(p); add(p, ix, iz);
    }
    const landmark = landmarks.find(l => inRect(x, z, l));
    if (landmark) {
      const p = place({ id: `floor:${landmark.id}:0`, kind: 'landmark-floor', name: `${landmark.name}, ground floor`, floor: 'street', district: districtAt(landmark.cx, landmark.cz) });
      street[i] = list.indexOf(p); add(p, ix, iz); continue;
    }
    if (inRect(x, z, GATE)) {
      const p = place({ id: 'landmark:gate:ground', kind: 'landmark', name: 'Gate, street level', floor: 'street', district: districtAt(-137, 0) });
      street[i] = list.indexOf(p); add(p, ix, iz); continue;
    }
    if (buildings.some(b => inRect(x, z, b))) { roofCells.push(i); continue; }
    const on = streets.filter(s => inRect(x, z, s));
    if (on.length > 1) {
      const sids = on.map(s => s.sid).sort();
      const p = place({ id: `junction:${sids.join('+')}`, kind: 'junction', name: `Crossing of ${sids.map(streetName).join(' and ')}`, floor: 'street', district: districtAt(x, z) });
      street[i] = list.indexOf(p); add(p, ix, iz);
    } else if (on.length === 1) {
      const s = on[0]!, t = s.ew ? x : z;
      // Stretches are counted from the west or north end, split at every crossing street.
      const segment = streets.filter(o => o !== s && o.xmin < s.xmax && o.xmax > s.xmin && o.zmin < s.zmax && o.zmax > s.zmin)
        .filter(o => (s.ew ? o.xmax : o.zmax) <= t).length;
      const p = place({ id: `street:${s.sid}:${segment}`, kind: 'street', name: `${streetName(s.sid)}, stretch ${segment}`, floor: 'street', district: districtAt(x, z) });
      street[i] = list.indexOf(p); add(p, ix, iz);
    } else if (x > CITY_BOUNDS.min && x < CITY_BOUNDS.max && z > CITY_BOUNDS.min && z < CITY_BOUNDS.max) lotCells.push(i);
  }

  // Open ground and rooftops: connected groups of cells, numbered per district from the largest.
  const groups = (cells: number[], target: Int32Array, kind: 'lot' | 'roof') => {
    const pending = new Set(cells), found: number[][] = [];
    for (const start of cells) {
      if (!pending.has(start)) continue;
      const group: number[] = [], queue = [start]; pending.delete(start);
      while (queue.length) {
        const i = queue.pop()!; group.push(i);
        const ix = i % CELL_SPAN, iz = Math.floor(i / CELL_SPAN);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = ix + dx, nz = iz + dz, n = index(nx, nz);
          if (nx >= 0 && nz >= 0 && nx < CELL_SPAN && nz < CELL_SPAN && pending.has(n)) { pending.delete(n); queue.push(n); }
        }
      }
      found.push(group);
    }
    const centre = (g: number[]) => [g.reduce((t, i) => t + cell(i % CELL_SPAN), 0) / g.length, g.reduce((t, i) => t + cell(Math.floor(i / CELL_SPAN)), 0) / g.length] as const;
    found.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
    const counts = new Map<District, number>();
    for (const g of found) {
      const [cx, cz] = centre(g), district = districtAt(cx, cz), n = (counts.get(district) ?? 0) + 1;
      counts.set(district, n);
      const p = place(kind === 'lot'
        ? { id: `lot:${district}:${n}`, kind: 'lot', name: `Open ground ${n}, ${district}`, floor: 'street', district }
        : { id: `roof:${district}:${n}`, kind: 'roof', name: `Rooftops ${n}, ${district}`, floor: 'upper', district });
      for (const i of g) { target[i] = list.indexOf(p); add(p, i % CELL_SPAN, Math.floor(i / CELL_SPAN)); }
    }
  };
  groups(lotCells, street, 'lot');
  groups(roofCells, roof, 'roof');

  // Places without raster cells: landmark upper floors and roofs, the Gate's upper works, sewer pipes, the air.
  const nominal = (p: Place, w: number, d: number, x: number, z: number) => { p.cells = Math.max(1, Math.round(w * d / CITY_CELL ** 2)); p.x = x * p.cells; p.z = z * p.cells; };
  for (const l of landmarks) {
    for (const level of l.levels.slice(1)) nominal(place({ id: `floor:${l.id}:${level}`, kind: 'landmark-floor', name: `${l.name}, floor ${level}`, floor: 'upper', district: districtAt(l.cx, l.cz) }), l.w, l.d, l.cx, l.cz);
    nominal(place({ id: `roof:${l.id}`, kind: 'roof', name: `${l.name}, roof`, floor: 'upper', district: districtAt(l.cx, l.cz) }), l.w, l.d, l.cx, l.cz);
  }
  nominal(place({ id: 'landmark:gate:upper', kind: 'landmark', name: 'Gate, upper works and roof', floor: 'upper', district: districtAt(-137, 0) }), 18, 64, -137, 0);
  for (const e of SEWER_ENTRIES) nominal(place({ id: `sewer:pipe-${e.name.toLowerCase()}`, kind: 'sewer', name: `Sewer pipe to ${e.name}`, floor: 'sewer', district: districtAt(e.x, e.z) }), 9, 30, e.x, e.z);
  const third = (CITY_BOUNDS.max - CITY_BOUNDS.min) / 3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = CITY_BOUNDS.min + third * (c + .5), z = CITY_BOUNDS.min + third * (r + .5), district = districtAt(x, z);
    nominal(place({ id: `air:${district}`, kind: 'air', name: `In the air over the ${district}`, floor: 'air', district }), third, third, x, z);
  }
  for (const p of list) { p.area = p.cells * CITY_CELL ** 2; p.x = Math.round(p.x / p.cells); p.z = Math.round(p.z / p.cells); }

  const lookup = (raster: Int32Array, x: number, z: number) => {
    const ix = cellIndex(x) - CELL_MIN, iz = cellIndex(z) - CELL_MIN;
    if (ix < 0 || iz < 0 || ix >= CELL_SPAN || iz >= CELL_SPAN) return undefined;
    const found = raster[index(ix, iz)]!;
    return found < 0 ? undefined : list[found];
  };
  const at = (x: number, y: number, z: number): Place => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return OUTSIDE;
    if (x < CITY_BOUNDS.min - 20 || x > CITY_BOUNDS.max + 20 || z < CITY_BOUNDS.min - 20 || z > CITY_BOUNDS.max + 20) return OUTSIDE;
    const floor = cityFloor(y);
    if (floor === 'air') return byId.get(`air:${districtAt(x, z)}`)!;
    if (floor === 'sewer') {
      const hall = lookup(sewer, x, z);
      if (hall) return hall;
      const entry = SEWER_ENTRIES.reduce((a, b) => Math.hypot(a.x - x, a.z - z) <= Math.hypot(b.x - x, b.z - z) ? a : b);
      return byId.get(`sewer:pipe-${entry.name.toLowerCase()}`)!;
    }
    if (floor === 'upper') {
      const l = landmarks.find(r => inRect(x, z, r));
      if (l) {
        const top = l.levels[l.levels.length - 1]!;
        if (y >= top + 6) return byId.get(`roof:${l.id}`)!;
        const level = l.levels.filter(v => v <= y + 1).pop() ?? 0;
        return byId.get(`floor:${l.id}:${level}`)!;
      }
      if (inRect(x, z, GATE)) return byId.get('landmark:gate:upper')!;
      const top = lookup(roof, x, z);
      if (top) return top;
    }
    return lookup(street, x, z) ?? lookup(roof, x, z) ?? OUTSIDE;
  };
  const audit = () => {
    let walkable = 0;
    for (const v of street) if (v >= 0) walkable++;
    const counted = list.filter(p => p.floor === 'street' && p.kind !== 'outside').reduce((t, p) => t + p.cells, 0);
    return { walkable, counted };
  };
  return { list, byId, at, audit };
}
