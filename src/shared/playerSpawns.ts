import { DISPATCH_STATIONS, LAUNCH_MACHINES } from './chaosState';
import { CITY_BOUNDS, GRAYBOX_VERSION, grayboxBoxes, isRampOpening } from './grayboxLayout';
import type { Vec3Data } from './networkProtocol';
import { DEFAULT_CITY_OPTIONS, generateBuildingLayout, overlapsBuildingFootprint, type WorldSpec } from './worldSpec';

// Reuse geometry work across joins and respawns without retaining every room seed.
const pools = new Map<string, readonly Vec3Data[]>();
const MAX_CACHED_WORLDS = 4;

/** Street-level starts with body clearance, outside sewer openings and controls. */
export function worldSpawnPoints(spec: WorldSpec): readonly Vec3Data[] {
  const key = `${spec.version}:${spec.seed}`;
  const cached = pools.get(key);
  if (cached) return cached;
  const points: Vec3Data[] = [];
  if (spec.version === GRAYBOX_VERSION) {
    const boxes = grayboxBoxes(spec).map(b => {
      const sx = Math.sin(b.rx), cx = Math.cos(b.rx), sz = Math.sin(b.rz), cz = Math.cos(b.rz);
      return { x:b.x, y:b.y, z:b.z,
        hx:(Math.abs(cz)*b.w+Math.abs(sz*cx)*b.h+Math.abs(sz*sx)*b.d)/2,
        hy:(Math.abs(sz)*b.w+Math.abs(cz*cx)*b.h+Math.abs(cz*sx)*b.d)/2,
        hz:(Math.abs(sx)*b.h+Math.abs(cx)*b.d)/2 };
    });
    for (const control of [...DISPATCH_STATIONS, ...LAUNCH_MACHINES]) {
      for (const b of [control.box, control.target]) boxes.push({x:b.x,y:b.y,z:b.z,hx:b.w/2,hy:b.h/2,hz:b.d/2});
    }
    for (let z=CITY_BOUNDS.min+24; z<=CITY_BOUNDS.max-24; z+=8) {
      for (let x=CITY_BOUNDS.min+24; x<=CITY_BOUNDS.max-24; x+=8) {
        if ([-1.2,0,1.2].some(dx => [-1.2,0,1.2].some(dz => isRampOpening(x+dx,z+dz)))) continue;
        if (boxes.some(b => b.y+b.hy>=.5 && b.y-b.hy<=4.4 && Math.abs(x-b.x)<b.hx+1.2 && Math.abs(z-b.z)<b.hz+1.2)) continue;
        if (LAUNCH_MACHINES.some(m => Math.hypot(x-m.pad.x,z-m.pad.z)<m.pad.radius+1.2)) continue;
        points.push(Object.freeze({x,y:2,z}));
      }
    }
  } else {
    const buildings = generateBuildingLayout(spec);
    const {gridSize,blockSpacing} = DEFAULT_CITY_OPTIONS;
    for (let gz=-gridSize/2; gz<gridSize/2; gz++) for (let gx=-gridSize/2; gx<gridSize/2; gx++) {
      const x=(gx+.5)*blockSpacing, z=(gz+.5)*blockSpacing;
      if (!overlapsBuildingFootprint(x,z,buildings,1.2)) points.push(Object.freeze({x,y:2,z}));
    }
  }
  if (!points.length) throw new Error(`World ${key} has no clear street spawns`);
  const pool = Object.freeze(points);
  if (pools.size >= MAX_CACHED_WORLDS) pools.delete(pools.keys().next().value!);
  pools.set(key,pool);
  return pool;
}

/** Maximize distance to the nearest living rat; randomize ties and empty rooms. */
export function choosePlayerSpawn(spec: WorldSpec, occupied: Iterable<Vec3Data>, random = Math.random): Vec3Data {
  const points=worldSpawnPoints(spec), living=[...occupied];
  const start=Math.max(0,Math.min(points.length-1,Math.floor(random()*points.length)));
  let best=points[start], bestDistance=-1;
  for (let i=0;i<points.length;i++) {
    const point=points[(start+i)%points.length];
    let nearest=Infinity;
    for (const player of living) nearest=Math.min(nearest,(player.x-point.x)**2+(player.z-point.z)**2);
    if (nearest>bestDistance) { best=point; bestDistance=nearest; }
  }
  return {...best};
}
