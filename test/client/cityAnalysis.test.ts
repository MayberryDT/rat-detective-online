import { describe, expect, it } from 'vitest';
import {
  chokepoints, coverDensity, fieldAt, islands, jobs, objectiveSources, RUN_SPEED, sightlines, spawnReach, StreetGrid, travelSeconds, type GridBox,
} from '../../src/shared/city/analysis';

// Ways the static analyses could mislead a design decision, written before the code:
// 1. Sight leaks through a thin wall (or between two cells a ray steps over), so a sheltered street reads as a shooting lane.
// 2. Bars count as cover though cheese passes them; knee-high crates do not, though they shield a body.
// 3. Walks cut a corner between two blocks that only touch diagonally, pass through walls, or cross the harbour.
// 4. Ramps and stairs (tilted colliders) block the walk they exist to give.
// 5. A walled-in yard reads as reachable, or open ground reads as cut off.
// 6. A district with spawn points but no objective reads as having a job.
// 7. An objective in the sewer or upstairs is silently dropped or pinned to the wrong street.
const box = (x: number, z: number, w: number, d: number, h: number, extra: Partial<GridBox> = {}): GridBox => ({ x, y: h / 2, z, w, h, d, rx: 0, rz: 0, ...extra });
const FIELD = { min: 0, max: 80 };

describe('sightlines', () => {
  it('stop at a thin wall and see across open ground', () => {
    const open = sightlines(new StreetGrid([], [], FIELD)).open;
    const walled = sightlines(new StreetGrid([box(40, 40, .2, 80, 10)], [], FIELD)).open;
    // West of the wall a rat sees at most the west half (40 × 80 = 3200 u², within the fan's sampling error).
    expect(fieldAt(walled, 10, 40)).toBeLessThan(3200 * 1.15);
    expect(fieldAt(open, 10, 40)).toBeGreaterThan(3200 * 1.5);
  });

  it('look over knee-high crates but not through a head-high wall', () => {
    const low = sightlines(new StreetGrid([box(40, 40, 2, 80, 1)], [], FIELD)).longest;
    const high = sightlines(new StreetGrid([box(40, 40, 2, 80, 3)], [], FIELD)).longest;
    expect(fieldAt(low, 10, 40)).toBeGreaterThan(60);
    expect(fieldAt(high, 10, 40)).toBeLessThan(60);
  });
});

describe('cover', () => {
  it('counts solids that shield a body, but not bars that cheese passes', () => {
    const crate = coverDensity(new StreetGrid([box(40, 40, 6, 6, 1.2)], [], FIELD));
    const bars = coverDensity(new StreetGrid([box(40, 40, 6, 6, 8, { passBalls: true })], [], FIELD));
    expect(fieldAt(crate, 46, 40)).toBeGreaterThan(0);
    expect(fieldAt(bars, 46, 40)).toBe(0);
    expect(fieldAt(crate, 10, 10)).toBe(0);
  });
});

describe('walking', () => {
  it('never cuts a corner between blocks that touch only diagonally', () => {
    const grid = new StreetGrid([box(10.5, 11.5, 1, 1, 8), box(11.5, 10.5, 1, 1, 8)], [], FIELD);
    const t = travelSeconds(grid, [grid.index(10.5, 10.5)]);
    expect(t[grid.index(11.5, 11.5)]!).toBeGreaterThan(2 / RUN_SPEED);
    expect(Number.isFinite(t[grid.index(11.5, 11.5)]!)).toBe(true);
  });

  it('walks up ramps, hops low boxes and crosses water only on a deck', () => {
    const grid = new StreetGrid([
      box(20, 40, 8, 80, 8, { rx: .3 }), // a ramp across the whole field
      box(30, 40, 2, 80, 2), // a kerb-high wall rats hop
      box(60, 40, 20, 4, .3), // a pier across the water
    ], [{ xmin: 50, xmax: 70, zmin: 0, zmax: 80 }], FIELD);
    const t = travelSeconds(grid, [grid.index(5, 40)]);
    expect(Number.isFinite(t[grid.index(45, 40)]!)).toBe(true);
    expect(Number.isFinite(t[grid.index(75, 40)]!)).toBe(true);
    expect(grid.walkable(60, 10)).toBe(false);
    expect(grid.walkable(55, 40)).toBe(true);
  });

  it('marks a walled-in yard unreachable and cut off, and open ground on the network', () => {
    const walls = [box(40, 30, 20, 1, 8), box(40, 50, 20, 1, 8), box(30, 40, 1, 20, 8), box(50, 40, 1, 20, 8)];
    const grid = new StreetGrid(walls, [], FIELD);
    expect(travelSeconds(grid, [grid.index(5, 5)])[grid.index(40, 40)]).toBe(Infinity);
    const cut = islands(grid);
    expect(fieldAt(cut.field, 40, 40)).toBe(1);
    expect(fieldAt(cut.field, 10, 10)).toBe(0);
    expect(cut.cutOff).toBeGreaterThan(0);
    expect(cut.cutOff).toBeLessThan(cut.total / 4);
  });
});

describe('jobs and objectives', () => {
  it('gives no job to a district that only has places to spawn', () => {
    const { table, idle } = jobs([{ kind: 'spawn', x: -150, y: 0, z: -150 }, { kind: 'case', x: 0, y: 0, z: 0 }]);
    expect(table['north-west'].spawn).toBe(1);
    expect(idle).toContain('north-west');
    expect(idle).not.toContain('centre');
    expect(idle).toHaveLength(8);
  });

  it('keeps sewer objectives off the street grid and counts upstairs ones from the street below', () => {
    const grid = new StreetGrid([], [], FIELD);
    const { sources, offGrid } = objectiveSources(grid, [{ kind: 'pillar', x: 40, y: -7, z: 40 }, { kind: 'supply', x: 40, y: 16, z: 40 }]);
    expect(offGrid).toBe(1);
    expect(sources).toEqual([grid.index(40, 40)]);
  });

  it('leaves a district without a reachable objective blank instead of zero', () => {
    const grid = new StreetGrid([], [], { min: -196, max: 166 });
    const seconds = travelSeconds(grid, [grid.index(0, 0)]);
    const reach = spawnReach(grid, [{ x: 10, z: 0 }, { x: 30, z: 0 }], seconds);
    expect(reach.centre).toBeCloseTo(30 / RUN_SPEED, 1);
    expect(reach['north-west']).toBeUndefined();
    expect(spawnReach(grid, [{ x: 10, z: 0 }], new Float64Array(seconds.length).fill(Infinity)).centre).toBeUndefined();
  });
});

describe('chokepoints', () => {
  it('ranks the one place every route between the others must cross', () => {
    // Three places along a corridor, west to east: every route between the ends crosses the middle one.
    const grid = new StreetGrid([box(40, 10, 80, 12, 8), box(40, 70, 80, 12, 8)], [], FIELD);
    const at = (x: number) => (x < 28 ? { id: 'west', x: 14, z: 40 } : x < 52 ? { id: 'middle', x: 40, z: 40 } : { id: 'east', x: 66, z: 40 });
    const { scores, links } = chokepoints(grid, x => at(x));
    expect(scores[0]!.id).toBe('middle');
    expect(scores.find(s => s.id === 'west')!.score).toBe(0);
    expect(links).toHaveLength(2);
  });
});
