import { describe, expect, it } from 'vitest';
import { PLAY_BOUNDS, clampPosition, isPlausiblePosition, isPlausibleShot } from '../../src/worker/validation';

describe('play bounds', () => {
  it('accepts ordinary city walking well past 400 units', () => {
    expect(PLAY_BOUNDS.xz).toBe(2_000);
    expect(isPlausiblePosition({ x: 500, y: 2, z: -500 })).toBe(true);
    expect(clampPosition({ x: 396, y: 2, z: 0 }).corrected).toBe(false);
  });

  it('clamps envelope crossings instead of dropping the pose', () => {
    const result = clampPosition({ x: 2_500, y: 400, z: -2_200 });
    expect(result.corrected).toBe(true);
    expect(result.position).toEqual({ x: 2_000, y: 250, z: -2_000 });
  });

  it('treats shot direction as unit-ish without claiming cheat detection', () => {
    const player = { x: 0, y: 2, z: 0 };
    expect(isPlausibleShot({ x: 0, y: 3.45, z: 0 }, { x: 0, y: 0, z: 1 }, player)).toBe(true);
    expect(isPlausibleShot({ x: 0, y: 3.45, z: 0 }, { x: 0, y: 0, z: 0 }, player)).toBe(false);
  });
});
