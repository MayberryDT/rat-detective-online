import { describe, expect, it } from 'vitest';
import { divergence, measurePlaces, poissonInterval, wilson, MIN_HUMAN_SECONDS } from '../../src/shared/city/measures';
import type { Place } from '../../src/shared/city/places';

// Ways the measures could mislead a design decision, written before the code:
// 1. Air, pipes or the outside count toward walkable area, deflating every place's use.
// 2. A place with a few seconds of play is reported as a certain dead zone or death trap.
// 3. Rates ignore exposure, so busy places always look deadliest.
// 4. Intervals that do not contain the observed value, or collapse at zero.
// 5. Bot divergence says "same" for different distributions (or the reverse).
const place = (id: string, area: number, kind: Place['kind'] = 'street'): Place =>
  ({ id, kind, name: id, floor: kind === 'air' ? 'air' : 'street', district: 'centre', cells: area / 16, area, x: 0, z: 0 });

describe('city measures', () => {
  const places = [place('a', 1600), place('b', 1600), place('sky', 100_000, 'air')];

  it('shares use over walkable area only and needs enough play before judging', () => {
    const m = measurePlaces(places, {
      a: { 'human-s': 3 * MIN_HUMAN_SECONDS, deaths: 3, 'deaths-human': 3, 'shots-human': 120, 'hits-human': 30 },
      b: { 'human-s': MIN_HUMAN_SECONDS / 10 },
      sky: { 'human-s': 3 * MIN_HUMAN_SECONDS },
    });
    const a = m.get('a')!, b = m.get('b')!;
    expect(a.use).toBeCloseTo((1800 / 1860) / 0.5, 5); // Share of human time over share of walkable area.
    expect(a.enough).toBe(true);
    expect(b.enough).toBe(false);
    expect(m.get('sky')!.use).toBeUndefined();
    expect(a.dangerHuman!.rate).toBeCloseTo(3 / 30, 5);
    expect(a.fireHuman!.rate).toBeCloseTo(120 / 30, 5);
    expect(a.accuracyHuman!.rate).toBeCloseTo(.25, 5);
  });

  it('gives intervals that contain the observation and stay open at zero', () => {
    const [lo, hi] = poissonInterval(0);
    expect(lo).toBe(0); expect(hi).toBeGreaterThan(2.5);
    const [l5, h5] = poissonInterval(5);
    expect(l5).toBeLessThan(5); expect(h5).toBeGreaterThan(5);
    const [wl, wh] = wilson(0, 10);
    expect(wl).toBe(0); expect(wh).toBeGreaterThan(.2);
  });

  it('measures bot divergence from 0 (same) to 1 (nothing shared)', () => {
    expect(divergence({ a: 10, b: 30 }, { a: 1, b: 3 })).toBeCloseTo(0, 5);
    expect(divergence({ a: 10 }, { b: 10 })).toBeCloseTo(1, 5);
    const mid = divergence({ a: 10, b: 10 }, { a: 10 });
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  });
});
