import { CITY_BOUNDS } from '../grayboxLayout';

/** The one frame every city fact, place and map uses (docs/city-map.md, "Frames and identity").
 * x runs east, z runs south, so north is -z. Compass words come only from here. */
export const CITY_CELL = 4;
export type CityFloor = 'sewer' | 'street' | 'upper' | 'air';
export const CITY_FLOORS: readonly CityFloor[] = ['sewer', 'street', 'upper', 'air'];

/** Sewer floor is -7; landmark upper floors start at 8; roofs top out near 37; launch flights go far higher. */
export function cityFloor(y: number): CityFloor {
  return y < -2 ? 'sewer' : y < 5 ? 'street' : y < 45 ? 'upper' : 'air';
}

export const cellIndex = (v: number): number => Math.floor(v / CITY_CELL);
/** First and last cell index inside the city bounds, on either axis. */
export const CELL_MIN = cellIndex(CITY_BOUNDS.min), CELL_MAX = cellIndex(CITY_BOUNDS.max - 1e-6);
export const CELL_SPAN = CELL_MAX - CELL_MIN + 1;

export type District = 'north-west' | 'north' | 'north-east' | 'west' | 'centre' | 'east' | 'south-west' | 'south' | 'south-east';
const THIRD = (CITY_BOUNDS.max - CITY_BOUNDS.min) / 3;
const band = (v: number) => v < CITY_BOUNDS.min + THIRD ? 0 : v < CITY_BOUNDS.min + 2 * THIRD ? 1 : 2;
const DISTRICTS: District[][] = [['north-west', 'north', 'north-east'], ['west', 'centre', 'east'], ['south-west', 'south', 'south-east']];
/** Thirds of the city on each axis; north is the -z third. */
export const districtAt = (x: number, z: number): District => DISTRICTS[band(z)]![band(x)]!;

/** `m` for minus keeps coordinates safe inside IDs: -18 -> m18. */
export const coordLabel = (v: number): string => (v < 0 ? `m${-Math.round(v)}` : String(Math.round(v)));
