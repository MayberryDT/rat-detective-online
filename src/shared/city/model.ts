import { CASE_SPAWNS, DISPATCH_STATIONS, LAUNCH_MACHINES } from '../chaosState';
import { PICKUP_ANCHORS } from '../pickups';
import { JURISDICTION_ZONES } from '../jurisdictionZones';
import { ASSIGNMENT_DESTINATIONS } from '../assignments';
import { SEWER_ENTRIES, SEWER_MANHOLE } from '../sewerLayout';
import { LANDMARK_INTERIORS } from '../landmarkLayout';
import { CITY_BOUNDS, GRAYBOX_VERSION } from '../grayboxLayout';
import { cityPlaces, type Place } from './places';
import { CITY_CELL } from './frame';

/** Layer 0 of the city map: every gameplay entity with a stable ID and the place it sits in. */
export interface CityEntity { id: string; kind: string; name: string; x: number; y: number; z: number; place: string; detail?: Record<string, unknown> }
export interface CityModel {
  layoutVersion: number;
  frame: { north: '-z'; east: '+x'; cell: number; bounds: typeof CITY_BOUNDS; floors: Record<string, string> };
  entities: CityEntity[];
  places: readonly Place[];
}

export function cityModel(): CityModel {
  const places = cityPlaces();
  const entity = (id: string, kind: string, name: string, x: number, y: number, z: number, detail?: Record<string, unknown>): CityEntity =>
    ({ id, kind, name, x, y, z, place: places.at(x, y + .3, z).id, ...(detail ? { detail } : {}) });
  const centre = (b: { xmin: number; xmax: number; zmin: number; zmax: number }) => [(b.xmin + b.xmax) / 2, (b.zmin + b.zmax) / 2] as const;
  return {
    layoutVersion: GRAYBOX_VERSION,
    frame: { north: '-z', east: '+x', cell: CITY_CELL, bounds: CITY_BOUNDS, floors: { sewer: 'y < -2', street: '-2 <= y < 5', upper: '5 <= y < 45', air: 'y >= 45' } },
    entities: [
      ...LANDMARK_INTERIORS.map(l => entity(`landmark:${l.id}`, 'landmark', l.name, l.cx, 0, l.cz, { w: l.w, d: l.d, levels: l.levels })),
      entity('landmark:gate', 'landmark', 'Gate', -137, 0, 0, { w: 18, d: 64 }),
      ...PICKUP_ANCHORS.map(p => entity(`pickup:${p.id}`, 'pickup', p.near, p.x, p.y ?? 0, p.z, { pickup: p.kind })),
      ...LAUNCH_MACHINES.map(m => entity(`launcher:${m.id}`, 'launcher', m.label, m.pad.x, m.pad.y, m.pad.z, { machine: m.kind, radius: m.pad.radius })),
      ...DISPATCH_STATIONS.map(d => entity(`pillar:${d.id}`, 'pillar', `Dispatch pillar ${d.id}`, d.x, d.y, d.z)),
      ...CASE_SPAWNS.map((c, i) => entity(`case-spawn:${String(i).padStart(2, '0')}`, 'case-spawn', i ? `Case spawn ${i}` : 'Case home', c.x, c.y, c.z)),
      ...Object.entries(JURISDICTION_ZONES).map(([id, z]) => {
        const [x, zz] = centre(z.areas[0]!);
        return entity(`zone:${id}`, 'zone', z.label, x, z.floorY, zz, { category: z.category, areas: z.areas });
      }),
      ...Object.entries(ASSIGNMENT_DESTINATIONS).map(([id, d]) => entity(`dest:${id}`, 'destination', d.label, d.center.x, d.center.y, d.center.z, { bounds: d.bounds })),
      ...SEWER_ENTRIES.map(e => entity(`entry:${e.name.toLowerCase()}`, 'sewer-entry', `Sewer entrance, ${e.name}`, e.x, 0, e.z)),
      entity('entry:manhole', 'sewer-entry', 'Manhole', SEWER_MANHOLE.x, 0, SEWER_MANHOLE.z),
    ],
    places: places.list,
  };
}
