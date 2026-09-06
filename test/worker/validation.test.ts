import { describe, expect, it } from 'vitest';
import { PLAY_BOUNDS, RateLimiter, clampPosition, isPlausiblePosition, isPlausibleShot } from '../../src/worker/validation';

describe('rate windows', () => {
  it('enforces the quota until the exact reset boundary without extending it on rejection', () => {
    const limiter = new RateLimiter();
    expect(limiter.allow('player:move', 2, 1000, 100)).toBe(true);
    expect(limiter.allow('player:move', 2, 1000, 200)).toBe(true);
    expect(limiter.allow('player:move', 2, 1000, 1099)).toBe(false);
    expect(limiter.allow('player:move', 2, 1000, 1100)).toBe(true);
  });

  it('isolates players and message types and clears only the disconnected identity', () => {
    const limiter = new RateLimiter();
    for (const key of ['rat:move', 'rat:shoot', 'rat2:move']) {
      expect(limiter.allow(key, 1, 1000, 100)).toBe(true);
      expect(limiter.allow(key, 1, 1000, 101)).toBe(false);
    }
    limiter.clear('rat');
    expect(limiter.allow('rat:move', 1, 1000, 102)).toBe(true);
    expect(limiter.allow('rat:shoot', 1, 1000, 102)).toBe(true);
    expect(limiter.allow('rat2:move', 1, 1000, 102)).toBe(false);
  });
});

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
