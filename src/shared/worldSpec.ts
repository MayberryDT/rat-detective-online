import { GRAYBOX_VERSION, GRAYBOX_SPAWNS, grayboxBoxes } from './grayboxLayout';
import { generateSeededBuildingLayout, DEFAULT_CITY_OPTIONS } from './seededCity';
import type { WorldSpec, CityOptions, BuildingFootprint } from './seededCity';
export { createSeededRandom, createDecorationRandom, DEFAULT_CITY_OPTIONS } from './seededCity';
export type { WorldSpec, CityOptions, BuildingFootprint, FootprintChamfer } from './seededCity';

export const WORLD_LAYOUT_VERSION = 1;
export const WORLD_VERSION = WORLD_LAYOUT_VERSION;
export function isSupportedWorldVersion(version: number): boolean {
  return version === WORLD_LAYOUT_VERSION || version === GRAYBOX_VERSION;
}

const RAT_RADIUS = 0.6;
const SPAWN_PADDING = 0.5;
const SPAWN_RANGE = 100;
const SPAWN_ATTEMPTS = 48;

export function createWorldSpec(seed?: number): WorldSpec {
  const value =
    seed === undefined
      ? (crypto.getRandomValues(new Uint32Array(1))[0] as number)
      : seed >>> 0;
  return { seed: value, version: WORLD_LAYOUT_VERSION };
}

export function generateBuildingLayout(
  spec: WorldSpec,
  options?: Partial<CityOptions>,
): BuildingFootprint[] {
  if (spec.version === GRAYBOX_VERSION) {
    return grayboxBoxes({ seed: spec.seed, version: spec.version })
      .filter((box) => box.building)
      .map((box) => ({ cx: box.x, cz: box.z, bw: box.w, bd: box.d, bh: box.h }));
  }
  return generateSeededBuildingLayout(spec, options);
}

export function overlapsBuildingFootprint(
  x: number,
  z: number,
  buildings: BuildingFootprint[],
  clearance = RAT_RADIUS + SPAWN_PADDING,
): boolean {
  for (const building of buildings) {
    const halfW = building.bw / 2 + clearance;
    const halfD = building.bd / 2 + clearance;
    if (Math.abs(x - building.cx) <= halfW && Math.abs(z - building.cz) <= halfD) {
      return true;
    }
  }
  return false;
}

function streetFallback(options: CityOptions, random: () => number): { x: number; y: number; z: number } {
  const { gridSize, blockSpacing } = options;
  const half = gridSize / 2;
  const gx = Math.floor(random() * gridSize) - half;
  const gz = Math.floor(random() * gridSize) - half;
  return {
    x: (gx + 0.5) * blockSpacing,
    y: 2,
    z: (gz + 0.5) * blockSpacing,
  };
}

export function createSafeSpawn(
  spec: WorldSpec,
  random = Math.random,
  options?: Partial<CityOptions>,
): { x: number; y: number; z: number } {
  if (spec.version === GRAYBOX_VERSION) return { ...GRAYBOX_SPAWNS[Math.min(GRAYBOX_SPAWNS.length-1, Math.floor(random()*GRAYBOX_SPAWNS.length))] };
  const opts = { ...DEFAULT_CITY_OPTIONS, ...options };
  const buildings = generateBuildingLayout(spec, opts);
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const x = (random() - 0.5) * SPAWN_RANGE;
    const z = (random() - 0.5) * SPAWN_RANGE;
    if (!overlapsBuildingFootprint(x, z, buildings)) {
      return { x, y: 2, z };
    }
  }
  return streetFallback(opts, random);
}
