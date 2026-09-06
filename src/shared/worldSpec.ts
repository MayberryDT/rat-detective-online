export interface WorldSpec {
  seed: number;
  version: number;
}

export const WORLD_LAYOUT_VERSION = 1;
export const WORLD_VERSION = WORLD_LAYOUT_VERSION;

export function isSupportedWorldVersion(version: number): boolean {
  return version === WORLD_LAYOUT_VERSION;
}

export interface CityOptions {
  gridSize: number;
  blockSpacing: number;
  streetWidth: number;
  minHeight: number;
  maxHeight: number;
  buildingWidthMin: number;
  buildingWidthMax: number;
}

export const DEFAULT_CITY_OPTIONS: CityOptions = {
  gridSize: 12,
  blockSpacing: 30,
  streetWidth: 14,
  minHeight: 18,
  maxHeight: 85,
  buildingWidthMin: 8,
  buildingWidthMax: 14,
};

export interface BuildingFootprint {
  cx: number;
  cz: number;
  bw: number;
  bd: number;
  bh: number;
}

const RAT_RADIUS = 0.6;
const SPAWN_PADDING = 0.5;
const SPAWN_RANGE = 100;
const SPAWN_ATTEMPTS = 48;

export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let n = Math.imul(t ^ (t >>> 15), 1 | t);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function layoutRandom(spec: WorldSpec): () => number {
  return createSeededRandom(spec.seed ^ Math.imul(spec.version, 0x9e3779b9));
}

export function createDecorationRandom(spec: WorldSpec): () => number {
  return createSeededRandom((spec.seed + 0x9e3779b9) ^ Math.imul(spec.version, 0xc0dec0de));
}

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
  const { gridSize, blockSpacing, minHeight, maxHeight, buildingWidthMin, buildingWidthMax } = {
    ...DEFAULT_CITY_OPTIONS,
    ...options,
  };
  const random = layoutRandom(spec);
  const half = gridSize / 2;
  const buildings: BuildingFootprint[] = [];

  for (let gx = -half; gx < half; gx++) {
    for (let gz = -half; gz < half; gz++) {
      buildings.push({
        cx: gx * blockSpacing,
        cz: gz * blockSpacing,
        bw: buildingWidthMin + random() * (buildingWidthMax - buildingWidthMin),
        bd: buildingWidthMin + random() * (buildingWidthMax - buildingWidthMin),
        bh: minHeight + random() * (maxHeight - minHeight),
      });
    }
  }

  return buildings;
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
