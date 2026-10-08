import { GRAYBOX_VERSION, CITY_PREVIEW_SEED, CITY_BOUNDS, type GrayboxBox } from '../grayboxLayout';
import { sharedGrayboxBoxes } from '../sharedLayout';
import { CITY_STREETS } from '../cityPlan';
import { LANDMARK_INTERIORS } from '../landmarkLayout';
import { SEWER_HALLS, SEWER_HALL_NAMES, SEWER_ENTRIES } from '../sewerLayout';
import { boxHalfExtents, toBoxLocal } from '../boxFrame';
import { kitCity } from './kit/city';
import type { KitRoom } from './kit/kit';
import { BERTH, DOCKS_LOT, DOCKS_SEWER_EXIT, HARBOUR, PRECINCT_HOUSE, PRECINCT_LOT, PRECINCT_RING, PRECINCT_SEWER_EXIT, QUAY, QUAY_EDGE_Z, inside, type Rect } from './kit/northPlan';
import { CHUTE_OUTER_WIDTH, CHUTE_PITCH, chuteFoot, NEEDLEWORKS_CHUTES } from './kit/parts/chute';
import { LEGACY_PLACE_ANCHORS } from './legacyPlaces';
import { CELL_MIN, CELL_SPAN, CITY_CELL, cellIndex, cityFloor, coordLabel, districtAt, isDistrict, type CityFloor, type District } from './frame';

/** Layer 1 of the city map (docs/city-map.md): every position belongs to one named place.
 * Street-level places come from a 4-unit raster: streets split at their crossings,
 * crossings as junctions, and the open ground between buildings as lots. The north
 * (layout 3) adds the harbour, the docks and the precinct, named from the north plan
 * and from the kit's rooms. */
export type PlaceKind = 'street' | 'junction' | 'lot' | 'landmark' | 'landmark-floor' | 'roof' | 'sewer' | 'air' | 'outside'
  | 'quay' | 'pier' | 'boat' | 'water' | 'yard' | 'exit' | 'room' | 'lookout' | 'chute';
export interface Place {
  id: string; kind: PlaceKind; name: string; floor: CityFloor; district: District;
  /** Raster cells (street and roof places) or nominal cells (upper floors, rooms, sewer pipes, air). */
  cells: number; area: number; x: number; z: number;
}
export interface CityPlaces {
  readonly list: readonly Place[];
  readonly byId: ReadonlyMap<string, Place>;
  at(x: number, y: number, z: number): Place;
  /** The current place for an ID recorded under any layout: itself, or where a retired lot or rooftop now lies. */
  successor(id: string): Place | undefined;
  /** Walkable street cells, and how many of them the places account for. */
  audit(): { walkable: number; counted: number };
}

const GATE = { xmin: -146, xmax: -128, zmin: -32, zmax: 32 };
const OUTSIDE: Place = { id: 'outside', kind: 'outside', name: 'Outside the city', floor: 'street', district: 'centre', cells: 0, area: 0, x: 0, z: 0 };
const rectOf = (cx: number, cz: number, w: number, d: number): Rect => ({ xmin: cx - w / 2, xmax: cx + w / 2, zmin: cz - d / 2, zmax: cz + d / 2 });
const crosses = (a: Rect, b: Rect) => a.xmin < b.xmax && a.xmax > b.xmin && a.zmin < b.zmax && a.zmax > b.zmin;
const signed = (v: number) => (v < 0 ? `−${-v}` : String(v));

// Streets added by layout 3 carry names; the layout-2 streets keep their coordinate IDs, and their
// stretches are still counted only at layout-2 crossings so every old stretch keeps its number.
const NAMED_STREETS: Array<{ sid: string; name: string; x: number; z: number }> = [
  { sid: 'quay-road', name: 'Quay Road', x: (QUAY.xmin + QUAY.xmax) / 2, z: (QUAY.zmin + QUAY.zmax) / 2 },
  { sid: 'gate-lane', name: 'Gate Lane', x: -137, z: -68.5 },
];
const streets = CITY_STREETS.map((s, i) => {
  const ew = s.w > s.d, named = NAMED_STREETS.find(n => n.x === s.x && n.z === s.z);
  const at = coordLabel(ew ? s.z : s.x), base = `${ew ? 'ew' : 'ns'}-${at}`;
  const sid = named?.sid ?? (CITY_STREETS.slice(0, i).some(o => (o.w > o.d) === ew && Math.round(ew ? o.z : o.x) === Math.round(ew ? s.z : s.x)) ? `${base}-${i}` : base);
  const name = named?.name ?? `${ew ? 'East–west street at z' : 'North–south street at x'} ${at.startsWith('m') ? '−' + at.slice(1) : at}`;
  return { ...rectOf(s.x, s.z, s.w, s.d), ew, sid, name, named: named !== undefined };
});

// The north's interiors until their parts' rooms give exact walls (a kit room of the same ID wins).
const WAREHOUSE_ROOM = 'pier9-warehouse';
const WAREHOUSE: Rect = { xmin: 82, xmax: 136, zmin: -146, zmax: -114 };
const CONTAINER_YARD: Rect = { xmin: DOCKS_LOT.xmin, xmax: DOCKS_SEWER_EXIT.xmin, zmin: QUAY.zmax, zmax: DOCKS_LOT.zmax };
/** The cellblock (the precinct part's numbers): cells and galleries round the outer wall, an open yard inside, the guard tower in the middle. */
const YARD_RADIUS = 10, TOWER_RADIUS = 3.6, LOOKOUT_Y = 19;
const QUAY_EDGE_DEPTH = 4;
const ringR = (x: number, z: number) => Math.hypot(x - PRECINCT_RING.x, z - PRECINCT_RING.z);

/** A building with floors: the landmarks, the precinct house, the cellblock ring and the Pier 9 warehouse. */
interface Building { id: string; name: string; levels: number[]; roof: number; x: number; z: number; area: number; contains(x: number, z: number): boolean; levelName?: Record<number, string> }

let cached: CityPlaces | undefined;
export function cityPlaces(fresh = false): CityPlaces {
  if (cached && !fresh) return cached;
  const built = build();
  if (!fresh) cached = built;
  return built;
}

/** True where a walkable deck (a pier or the breakwater) stands over the water: a kit collider whose top is near street level. */
function deckAt(decks: readonly GrayboxBox[], x: number, z: number): boolean {
  for (const b of decks) {
    const l = toBoxLocal(b, x, b.y + b.h / 2 - .05, z), e = boxHalfExtents(b);
    if (Math.abs(l.x) < e.hx && Math.abs(l.z) < e.hz) return true;
  }
  return false;
}

function build(): CityPlaces {
  const list: Place[] = [], byId = new Map<string, Place>();
  const place = (p: Omit<Place, 'cells' | 'area' | 'x' | 'z'> & Partial<Place>): Place => {
    let found = byId.get(p.id);
    if (!found) { found = { cells: 0, area: 0, x: 0, z: 0, ...p }; byId.set(p.id, found); list.push(found); }
    return found;
  };
  const kit = kitCity({ visuals: false });
  // Rooms name places only in the new north (the older districts keep their floor places), and a room
  // that is a whole building's shell (the warehouse, a cellblock floor round the yard) stays that building's floors.
  const north = (r: Rect) => [PRECINCT_LOT, DOCKS_LOT, HARBOUR].some(n => inside(n, (r.xmin + r.xmax) / 2, (r.zmin + r.zmax) / 2));
  const warehouse = kit.rooms.find(r => r.id === WAREHOUSE_ROOM) ?? { ...WAREHOUSE, ymin: 0, ymax: 14 };
  const rooms: KitRoom[] = kit.rooms.filter(r => north(r) && r.id !== WAREHOUSE_ROOM && !inside(r, PRECINCT_RING.x, PRECINCT_RING.z));
  const buildings: Building[] = [
    ...LANDMARK_INTERIORS.map(l => {
      const r = rectOf(l.cx, l.cz, l.w, l.d), levels = [...l.levels].sort((a, b) => a - b);
      return { id: l.id, name: l.name, levels, roof: levels[levels.length - 1]! + 6, x: l.cx, z: l.cz, area: l.w * l.d, contains: (x: number, z: number) => inside(r, x, z) };
    }),
    { id: 'precinct', name: 'Precinct house', levels: [0, 8, 16], roof: 22, x: (PRECINCT_HOUSE.xmin + PRECINCT_HOUSE.xmax) / 2, z: (PRECINCT_HOUSE.zmin + PRECINCT_HOUSE.zmax) / 2,
      area: (PRECINCT_HOUSE.xmax - PRECINCT_HOUSE.xmin) * (PRECINCT_HOUSE.zmax - PRECINCT_HOUSE.zmin), contains: (x, z) => inside(PRECINCT_HOUSE, x, z) },
    { id: 'cellblock', name: 'Cellblock', levels: [0, 8, 16], roof: 22, x: PRECINCT_RING.x, z: PRECINCT_RING.z,
      area: Math.PI * (PRECINCT_RING.radius ** 2 - YARD_RADIUS ** 2), contains: (x, z) => { const r = ringR(x, z); return r >= YARD_RADIUS && r <= PRECINCT_RING.radius; } },
    { id: 'pier9', name: 'Pier 9 warehouse', levels: [0, 5], roof: warehouse.ymax, x: (warehouse.xmin + warehouse.xmax) / 2, z: (warehouse.zmin + warehouse.zmax) / 2,
      area: (warehouse.xmax - warehouse.xmin) * (warehouse.zmax - warehouse.zmin), contains: (x, z) => inside(warehouse, x, z), levelName: { 5: 'catwalk' } },
  ];
  const decks = kit.boxes.filter(b => {
    const top = b.y + b.h / 2, e = boxHalfExtents(b);
    return top > -1 && top < 2.5 && e.hx >= 1 && e.hz >= 1 && b.z - e.hz < QUAY_EDGE_Z;
  });
  const tenements = sharedGrayboxBoxes({ seed: CITY_PREVIEW_SEED, version: GRAYBOX_VERSION })
    .filter(b => b.building && !b.hidden && b.y - b.h / 2 < 1.5 && b.y + b.h / 2 > 2.5)
    .map(b => rectOf(b.x, b.z, b.w, b.d));
  const quayCrossings = streets.filter(s => !s.named && crosses(s, QUAY)).map(s => s.xmin).sort((a, b) => a - b);
  const quayStretch = (x: number) => quayCrossings.filter(x0 => x0 <= x).length;
  const cell = (i: number) => (i + CELL_MIN + .5) * CITY_CELL;
  const index = (ix: number, iz: number) => iz * CELL_SPAN + ix;
  const street = new Int32Array(CELL_SPAN * CELL_SPAN).fill(-1);
  const roof = new Int32Array(CELL_SPAN * CELL_SPAN).fill(-1);
  const sewer = new Int32Array(CELL_SPAN * CELL_SPAN).fill(-1);
  const lotCells: number[] = [], roofCells: number[] = [], deckCells: number[] = [];
  const add = (p: Place, ix: number, iz: number) => { p.cells++; p.x += cell(ix); p.z += cell(iz); };
  const raster = new Set<Place>();

  /** The new north's open ground: the harbour, the quay edge, the yards and the sewer exits. */
  const northGround = (x: number, z: number): Omit<Place, 'cells' | 'area' | 'x' | 'z'> | 'deck' | undefined => {
    const district = districtAt(x, z);
    if (inside(HARBOUR, x, z) && z < QUAY_EDGE_Z) {
      if (inside(BERTH, x, z)) return { id: 'boat:deck', kind: 'boat', name: 'The freighter, deck', floor: 'street', district };
      if ([[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dz]) => deckAt(decks, x + dx!, z + dz!))) return 'deck';
      return { id: 'water:harbour', kind: 'water', name: 'The harbour (in the water)', floor: 'street', district };
    }
    if (inside(QUAY, x, z) && z < QUAY_EDGE_Z + QUAY_EDGE_DEPTH) {
      const n = quayStretch(x), from = n ? quayCrossings[n - 1]! : QUAY.xmin, to = quayCrossings[n] ?? QUAY.xmax;
      return { id: `quay:${n}`, kind: 'quay', name: `Quay edge, x ${signed(Math.round(from))} to ${signed(Math.round(to))}`, floor: 'street', district };
    }
    if (inside(PRECINCT_SEWER_EXIT, x, z)) return { id: 'exit:precinct-sewer', kind: 'exit', name: 'Sewer exit by the precinct', floor: 'street', district };
    if (inside(DOCKS_SEWER_EXIT, x, z)) return { id: 'exit:docks-sewer', kind: 'exit', name: 'Sewer exit at the docks', floor: 'street', district };
    if (inside(CONTAINER_YARD, x, z)) return { id: 'yard:containers', kind: 'yard', name: 'Container yard', floor: 'street', district };
    if (ringR(x, z) < YARD_RADIUS) return { id: 'yard:cellblock', kind: 'yard', name: 'Cellblock yard, round the tower', floor: 'street', district };
    if (inside(PRECINCT_LOT, x, z)) return { id: 'grounds:precinct', kind: 'yard', name: 'Precinct grounds', floor: 'street', district };
    return undefined;
  };

  for (let iz = 0; iz < CELL_SPAN; iz++) for (let ix = 0; ix < CELL_SPAN; ix++) {
    const x = cell(ix), z = cell(iz), i = index(ix, iz);
    const hall = SEWER_HALLS.reduce((found, r, h) => (inside(r, x, z) ? h : found), -1);
    if (hall >= 0) {
      const p = place({ id: `sewer:${SEWER_HALL_NAMES[hall]}`, kind: 'sewer', name: `Sewer, ${SEWER_HALL_NAMES[hall]!.replace('-', ' ')}`, floor: 'sewer', district: districtAt(x, z) });
      sewer[i] = list.indexOf(p); add(p, ix, iz);
    }
    const put = (p: Place) => { street[i] = list.indexOf(p); raster.add(p); add(p, ix, iz); };
    const building = buildings.find(b => b.contains(x, z));
    if (building) { put(place({ id: `floor:${building.id}:0`, kind: 'landmark-floor', name: `${building.name}, ground floor`, floor: 'street', district: districtAt(building.x, building.z) })); continue; }
    if (inside(GATE, x, z)) { put(place({ id: 'landmark:gate:ground', kind: 'landmark', name: 'Gate, street level', floor: 'street', district: districtAt(-137, 0) })); continue; }
    const ground = northGround(x, z);
    if (ground === 'deck') { deckCells.push(i); continue; }
    if (ground) { put(place(ground)); continue; }
    if (tenements.some(b => inside(b, x, z))) { roofCells.push(i); continue; }
    const on = streets.filter(s => inside(s, x, z));
    if (on.length > 1) {
      on.sort((a, b) => (a.sid < b.sid ? -1 : 1));
      put(place({ id: `junction:${on.map(s => s.sid).join('+')}`, kind: 'junction', name: `Crossing of ${on.map(s => s.name).join(' and ')}`, floor: 'street', district: districtAt(x, z) }));
    } else if (on.length === 1) {
      const s = on[0]!, t = s.ew ? x : z;
      // Stretches are counted from the west or north end, split at every crossing street.
      const segment = streets.filter(o => o !== s && (s.named || !o.named) && crosses(o, s)).filter(o => (s.ew ? o.xmax : o.zmax) <= t).length;
      put(place({ id: `street:${s.sid}:${segment}`, kind: 'street', name: `${s.name}, stretch ${segment}`, floor: 'street', district: districtAt(x, z) }));
    } else if (x > CITY_BOUNDS.min && x < CITY_BOUNDS.max && z > CITY_BOUNDS.min && z < CITY_BOUNDS.max) lotCells.push(i);
  }

  const components = (cells: number[]) => {
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
    return found.sort((a, b) => b.length - a.length || a[0]! - b[0]!);
  };
  const centre = (g: number[]) => [g.reduce((t, i) => t + cell(i % CELL_SPAN), 0) / g.length, g.reduce((t, i) => t + cell(Math.floor(i / CELL_SPAN)), 0) / g.length] as const;
  const fill = (p: Place, g: number[], target: Int32Array) => { for (const i of g) { target[i] = list.indexOf(p); add(p, i % CELL_SPAN, Math.floor(i / CELL_SPAN)); } };

  // Piers: connected decks over the water, named by where they stand; the one off the east corner is the breakwater.
  for (const g of components(deckCells)) {
    const [cx, cz] = centre(g), breakwater = cx > 150, x = Math.round(cx / 5) * 5;
    const p = place(breakwater
      ? { id: 'pier:breakwater', kind: 'pier', name: 'The breakwater', floor: 'street', district: districtAt(cx, cz) }
      : { id: `pier:${coordLabel(x)}`, kind: 'pier', name: `Pier at x ${signed(x)}`, floor: 'street', district: districtAt(cx, cz) });
    fill(p, g, street); raster.add(p);
  }

  // Open ground and rooftops: connected groups of cells. A group holding a layout-2 anchor cell and at least
  // half that place's old cells keeps its ID; other groups are numbered per district after the highest old number, largest first.
  const anchorCell = (ix: number, iz: number) => index(ix - CELL_MIN, iz - CELL_MIN);
  const groups = (cells: number[], target: Int32Array, kind: 'lot' | 'roof') => {
    const anchors = LEGACY_PLACE_ANCHORS.filter(([id]) => id.startsWith(`${kind}:`));
    const next = new Map<string, number>();
    for (const [id] of anchors) { const [, district, n] = id.split(':'); next.set(district!, Math.max(next.get(district!) ?? 0, Number(n))); }
    for (const g of components(cells)) {
      const members = new Set(g), held = anchors.find(([, ix, iz, old]) => members.has(anchorCell(ix, iz)) && g.length * 2 >= old);
      let district: District, n: number;
      const [cx, cz] = centre(g);
      if (held) {
        const [, d = '', k] = held[0].split(':'); district = isDistrict(d) ? d : districtAt(cx, cz); n = Number(k);
      } else {
        district = districtAt(cx, cz); n = (next.get(district) ?? 0) + 1; next.set(district, n);
      }
      const p = place(kind === 'lot'
        ? { id: `lot:${district}:${n}`, kind: 'lot', name: `Open ground ${n}, ${district}`, floor: 'street', district }
        : { id: `roof:${district}:${n}`, kind: 'roof', name: `Rooftops ${n}, ${district}`, floor: 'upper', district });
      fill(p, g, target);
      if (kind === 'lot') raster.add(p);
    }
  };
  groups(lotCells, street, 'lot');
  groups(roofCells, roof, 'roof');

  // Places without raster cells: upper floors and roofs, the tower, the north's upper works, rooms, sewer pipes, the air.
  const nominal = (p: Place, area: number, x: number, z: number) => { p.cells = Math.max(1, Math.round(area / CITY_CELL ** 2)); p.x = x * p.cells; p.z = z * p.cells; };
  const rectArea = (r: Rect) => (r.xmax - r.xmin) * (r.zmax - r.zmin);
  const mid = (r: Rect) => [(r.xmin + r.xmax) / 2, (r.zmin + r.zmax) / 2] as const;
  for (const b of buildings) {
    const district = districtAt(b.x, b.z);
    for (const level of b.levels.slice(1)) nominal(place({ id: `floor:${b.id}:${level}`, kind: 'landmark-floor', name: `${b.name}, ${b.levelName?.[level] ?? `floor ${level}`}`, floor: 'upper', district }), b.area, b.x, b.z);
    nominal(place({ id: `roof:${b.id}`, kind: 'roof', name: `${b.name}, roof`, floor: 'upper', district }), b.area, b.x, b.z);
  }
  nominal(place({ id: 'landmark:gate:upper', kind: 'landmark', name: 'Gate, upper works and roof', floor: 'upper', district: districtAt(-137, 0) }), 18 * 64, -137, 0);
  const ring = districtAt(PRECINCT_RING.x, PRECINCT_RING.z);
  nominal(place({ id: 'landmark:cellblock-tower', kind: 'landmark', name: 'Guard tower, stairs', floor: 'upper', district: ring }), Math.PI * TOWER_RADIUS ** 2, PRECINCT_RING.x, PRECINCT_RING.z);
  nominal(place({ id: 'lookout:tower', kind: 'lookout', name: 'Guard tower lookout', floor: 'upper', district: ring }), Math.PI * TOWER_RADIUS ** 2, PRECINCT_RING.x, PRECINCT_RING.z);
  nominal(place({ id: 'lookout:cranes', kind: 'lookout', name: 'Crane walkways over the quay', floor: 'upper', district: districtAt(...mid(QUAY)) }), rectArea(QUAY) / 10, ...mid(QUAY));
  nominal(place({ id: 'boat:bridge', kind: 'boat', name: 'The freighter, bridge and upper decks', floor: 'upper', district: districtAt(...mid(BERTH)) }), rectArea(BERTH) / 4, ...mid(BERTH));
  nominal(place({ id: 'yard:containers:top', kind: 'yard', name: 'On top of the container stacks', floor: 'upper', district: districtAt(...mid(CONTAINER_YARD)) }), rectArea(CONTAINER_YARD) / 3, ...mid(CONTAINER_YARD));
  for (const c of NEEDLEWORKS_CHUTES) {
    const f = chuteFoot(c), run = c.floor / Math.tan(CHUTE_PITCH);
    nominal(place({ id: `chute:needleworks:${c.floor}`, kind: 'chute', name: `Needleworks chute from floor ${c.floor}`, floor: 'upper', district: districtAt(f.x, f.z + run / 2) }), CHUTE_OUTER_WIDTH * run, f.x, f.z + run / 2);
  }
  const roomName = (id: string) => id.split('-').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  for (const r of rooms) nominal(place({ id: `room:${r.id}`, kind: 'room', name: roomName(r.id), floor: cityFloor(r.ymin + .5), district: districtAt(...mid(r)) }), rectArea(r), ...mid(r));
  for (const e of SEWER_ENTRIES) nominal(place({ id: `sewer:pipe-${e.name.toLowerCase()}`, kind: 'sewer', name: `Sewer pipe to ${e.name}`, floor: 'sewer', district: districtAt(e.x, e.z) }), 9 * 30, e.x, e.z);
  const third = (CITY_BOUNDS.max - CITY_BOUNDS.min) / 3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = CITY_BOUNDS.min + third * (c + .5), z = CITY_BOUNDS.min + third * (r + .5), district = districtAt(x, z);
    nominal(place({ id: `air:${district}`, kind: 'air', name: `In the air over the ${district}`, floor: 'air', district }), third * third, x, z);
  }
  for (const p of list) {
    p.area = p.cells * CITY_CELL ** 2; p.x = Math.round(p.x / p.cells); p.z = Math.round(p.z / p.cells);
    // A place that spans districts (the harbour, a long street) is filed where its centre lies; lot and roof IDs name their district already.
    if (p.kind !== 'lot' && p.kind !== 'roof') p.district = districtAt(p.x, p.z);
  }

  const lookup = (target: Int32Array, x: number, z: number) => {
    const ix = cellIndex(x) - CELL_MIN, iz = cellIndex(z) - CELL_MIN;
    if (ix < 0 || iz < 0 || ix >= CELL_SPAN || iz >= CELL_SPAN) return undefined;
    const found = target[index(ix, iz)]!;
    return found < 0 ? undefined : list[found];
  };
  const get = (id: string) => byId.get(id)!;
  const at = (x: number, y: number, z: number): Place => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return OUTSIDE;
    if (x < CITY_BOUNDS.min - 20 || x > CITY_BOUNDS.max + 20 || z < CITY_BOUNDS.min - 20 || z > CITY_BOUNDS.max + 20) return OUTSIDE;
    const floor = cityFloor(y);
    if (floor === 'air') return get(`air:${districtAt(x, z)}`);
    // Anything below the quay's level out over the harbour is in the water, whatever the floor bands say.
    if (z < QUAY_EDGE_Z && y < -.5 && inside(HARBOUR, x, z)) return get('water:harbour');
    // Riding a Needleworks chute: inside a run's width, over its slope, from the bed to its lid.
    const chute = NEEDLEWORKS_CHUTES.find(c => {
      const f = chuteFoot(c), s = z - f.z, bed = s * Math.tan(CHUTE_PITCH);
      return Math.abs(x - c.mouthX) <= CHUTE_OUTER_WIDTH / 2 && s >= 0 && bed <= c.floor && y > bed - .5 && y < bed + 4;
    });
    if (chute) return get(`chute:needleworks:${chute.floor}`);
    const room = rooms.find(r => inside(r, x, z) && y >= r.ymin - .5 && y < r.ymax);
    if (room) return get(`room:${room.id}`);
    if (floor === 'sewer') {
      const hall = lookup(sewer, x, z);
      if (hall) return hall;
      const entry = SEWER_ENTRIES.reduce((a, b) => Math.hypot(a.x - x, a.z - z) <= Math.hypot(b.x - x, b.z - z) ? a : b);
      return get(`sewer:pipe-${entry.name.toLowerCase()}`);
    }
    if (floor === 'upper') {
      const b = buildings.find(r => r.contains(x, z));
      if (b) {
        if (y >= b.roof) return get(`roof:${b.id}`);
        const level = b.levels.filter(v => v <= y + 1).pop() ?? 0;
        return get(`floor:${b.id}:${level}`);
      }
      if (inside(GATE, x, z)) return get('landmark:gate:upper');
      const r = ringR(x, z);
      if (r < TOWER_RADIUS) return get(y >= LOOKOUT_Y - 1 ? 'lookout:tower' : 'landmark:cellblock-tower');
      if (inside(QUAY, x, z)) return get('lookout:cranes');
      if (inside(BERTH, x, z)) return get('boat:bridge');
      if (inside(CONTAINER_YARD, x, z)) return get('yard:containers:top');
      const top = lookup(roof, x, z);
      if (top) return top;
    }
    return lookup(street, x, z) ?? lookup(roof, x, z) ?? OUTSIDE;
  };
  const successor = (id: string): Place | undefined => {
    const current = byId.get(id);
    if (current) return current;
    const anchor = LEGACY_PLACE_ANCHORS.find(([old]) => old === id);
    if (!anchor) return undefined;
    const [, ix, iz] = anchor, x = (ix + .5) * CITY_CELL, z = (iz + .5) * CITY_CELL;
    return id.startsWith('roof:') ? (lookup(roof, x, z) ?? at(x, 20, z)) : at(x, .3, z);
  };
  const audit = () => {
    let walkable = 0;
    for (const v of street) if (v >= 0) walkable++;
    let counted = 0;
    for (const p of raster) counted += p.cells;
    return { walkable, counted };
  };
  return { list, byId, at, successor, audit };
}
