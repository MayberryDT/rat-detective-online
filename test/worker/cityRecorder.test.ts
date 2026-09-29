import { describe, expect, it } from 'vitest';
import { SolidGrid } from '../../src/worker/city/CityRecorder';
import type { GrayboxBox } from '../../src/shared/grayboxLayout';
import type { Vec3Data } from '../../src/shared/networkProtocol';

// The recorder files a rat as inside geometry (anomalies, landing clips) through a grid index over the
// solids. Ways it could go wrong: a box missing from a grid cell it overlaps (big slabs, boxes on a cell
// edge, negative coordinates), a point on a box's margin counted differently, or boxes too thin to hold a
// rat ever counting.
const box = (x: number, y: number, z: number, w: number, h: number, d: number): GrayboxBox => ({ x, y, z, w, h, d, color: 0, rx: 0, rz: 0 });
/** The recorder's rule before the index: the body centre is more than .25 inside every face. */
const exhaustive = (solids: readonly GrayboxBox[], p: Vec3Data) =>
  solids.some(b => Math.abs(p.x - b.x) < b.w / 2 - .25 && Math.abs(p.z - b.z) < b.d / 2 - .25 && Math.abs(p.y + .5 - b.y) < b.h / 2 - .25);

describe('city recorder solid index', () => {
  it('agrees with testing every box, across slabs, cell edges, margins and thin boxes', () => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const fixed = [
      box(-15, -.5, -15, 362, 1, 362), // a ground slab over every grid cell
      box(0, 4, 0, 8.5, 8, 8.5), // faces a quarter inside cell edges
      box(-196, 4, -15, 1, 8, 362), // a boundary wall: only its centre plane is inside
      box(40.25, 2, -60.75, .5, 4, 3), // exactly the minimum width: never inside
    ];
    const solids = [
      ...fixed,
      ...Array.from({ length: 400 }, () => box(random() * 360 - 196, random() * 30 - 8, random() * 360 - 196, .3 + random() * 30, .3 + random() * 12, .3 + random() * 30)),
    ];
    const grid = new SolidGrid(solids);
    const points: Vec3Data[] = [
      // On the margins of the 8.5 box: .25 inside its faces is the edge of "inside".
      { x: 3.999, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }, { x: -3.999, y: 3, z: -3.999 }, { x: -4, y: 3, z: 0 },
      { x: 0, y: -.5, z: 0 }, { x: -196, y: 3, z: 0 }, { x: 40.25, y: 1.5, z: -60.75 }, { x: 500, y: 0, z: 0 },
      ...Array.from({ length: 20_000 }, () => ({ x: random() * 400 - 216, y: random() * 40 - 10, z: random() * 400 - 216 })),
    ];
    const disagree = points.filter(p => grid.inside(p) !== exhaustive(solids, p));
    expect(disagree).toEqual([]);
    expect(points.filter(p => grid.inside(p)).length).toBeGreaterThan(1000);
    const edges = new SolidGrid(fixed);
    expect(edges.inside({ x: 3.999, y: 3, z: 0 })).toBe(true);
    expect(edges.inside({ x: 4, y: 3, z: 0 })).toBe(false);
    expect(edges.inside({ x: -196, y: 3, z: 0 })).toBe(true);
    expect(edges.inside({ x: -195.75, y: 3, z: 0 })).toBe(false);
    expect(edges.inside({ x: 40.25, y: 1.5, z: -60.75 })).toBe(false);
  });

  it('finds nothing when there are no solids', () => {
    expect(new SolidGrid([]).inside({ x: 0, y: 0, z: 0 })).toBe(false);
  });
});
