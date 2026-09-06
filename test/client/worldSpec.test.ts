import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CITY_OPTIONS,
  WORLD_LAYOUT_VERSION,
  createSafeSpawn,
  createSeededRandom,
  createWorldSpec,
  generateBuildingLayout,
  overlapsBuildingFootprint,
  type CityOptions,
} from '../../src/shared/worldSpec';

describe('world spec', () => {
  it('stamps the current layout version onto created specs', () => {
    expect(createWorldSpec(0)).toEqual({ seed: 0, version: WORLD_LAYOUT_VERSION });
    expect(createWorldSpec(1)).toEqual({ seed: 1, version: WORLD_LAYOUT_VERSION });
  });

  it('produces a deterministic collider layout for the same spec', () => {
    const spec = createWorldSpec(42);
    expect(generateBuildingLayout(spec)).toEqual(generateBuildingLayout(spec));
    expect(generateBuildingLayout(spec)).toHaveLength(144);
  });

  it('changes building sizes when the generator version changes', () => {
    const first = generateBuildingLayout({ seed: 42, version: 1 });
    const second = generateBuildingLayout({ seed: 42, version: 2 });
    expect(second).not.toEqual(first);
  });

  it('accepts a smaller numeric city without requiring default literals', () => {
    const tiny: CityOptions = {
      gridSize: 2,
      blockSpacing: 20,
      streetWidth: 8,
      minHeight: 10,
      maxHeight: 12,
      buildingWidthMin: 4,
      buildingWidthMax: 6,
    };
    const layout = generateBuildingLayout(createWorldSpec(9), tiny);
    expect(layout).toHaveLength(4);
    expect(layout.map(building => [building.cx, building.cz])).toEqual([
      [-20, -20],
      [-20, 0],
      [0, -20],
      [0, 0],
    ]);
  });

  it('keeps sampled and fallback spawns clear of building footprints', () => {
    const stuck = () => 0.5;
    for (let seed = 0; seed < 100; seed++) {
      const spec = createWorldSpec(seed);
      const buildings = generateBuildingLayout(spec);
      const random = createSeededRandom(seed ^ 0x12345678);
      for (let sample = 0; sample < 20; sample++) {
        const sampled = createSafeSpawn(spec, random);
        expect(sampled.y).toBe(2);
        expect(overlapsBuildingFootprint(sampled.x, sampled.z, buildings)).toBe(false);
      }
      const fallback = createSafeSpawn(spec, stuck);
      expect(fallback).toEqual({ x: 15, y: 2, z: 15 });
      expect(overlapsBuildingFootprint(fallback.x, fallback.z, buildings)).toBe(false);
    }
  });

  it('uses default city dimensions for the shared spawn query', () => {
    expect(DEFAULT_CITY_OPTIONS.gridSize).toBe(12);
    expect(DEFAULT_CITY_OPTIONS.blockSpacing).toBe(30);
  });
});
