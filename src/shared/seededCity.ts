/** Seeded outer-city generation. This leaf never imports the authored graybox. */
export interface WorldSpec {
  seed: number;
  version: number;
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

/** One 45° cut across a footprint corner: `sx`/`sz` name the corner (+1 = east/south). */
export interface FootprintChamfer {
  sx: -1 | 1;
  sz: -1 | 1;
}

export interface BuildingFootprint {
  cx: number;
  cz: number;
  bw: number;
  bd: number;
  bh: number;
  /** Cut corners at street junctions (bank faces); see `buildingColliders` in skyline. */
  chamfers?: readonly FootprintChamfer[];
}

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

export function generateSeededBuildingLayout(spec: WorldSpec, options?: Partial<CityOptions>): BuildingFootprint[] {
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
