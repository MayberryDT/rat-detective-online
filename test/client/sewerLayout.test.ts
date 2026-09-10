import { describe, expect, it } from 'vitest';
import { SEWER_ENTRIES, SEWER_MAINTENANCE_FURNISHINGS, sewerBoxes, sewerRampOpening } from '../../src/shared/sewerLayout';
import type { GrayboxBox } from '../../src/shared/grayboxLayout';

function axisAligned(b: GrayboxBox) {
  return !b.rx && !b.rz;
}

function contains(b: GrayboxBox, x: number, y: number, z: number) {
  if (!axisAligned(b)) return false;
  return Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2 && Math.abs(z - b.z) <= b.d / 2;
}

function wallAt(boxes: GrayboxBox[], x: number, y: number, z: number) {
  return boxes.some((b) => contains(b, x, y, z) && b.h > 2);
}

describe('sewer layout', () => {
  it('keeps Maintenance furniture solid at the perimeter and the rat-width entry and center clear', () => {
    const boxes=sewerBoxes();
    for(const b of SEWER_MAINTENANCE_FURNISHINGS){
      expect(boxes).toContainEqual(b);
      expect(b.y-b.h/2).toBeCloseTo(-7);
      expect(b.x-b.w/2).toBeGreaterThan(60);
      expect(b.x+b.w/2).toBeLessThanOrEqual(70);
      expect(b.z-b.d/2).toBeGreaterThan(-42);
      expect(b.z+b.d/2).toBeLessThanOrEqual(-30);
    }
    // A .6-radius player can enter along the hallway and cross the room.
    for(let x=54;x<=68;x+=.5)for(const dz of [-.6,0,.6])for(const y of [-6.4,-5.4,-4.8])
      expect(boxes.some(b=>contains(b,x,y,-36+dz)),`blocked at ${x},${y},${-36+dz}`).toBe(false);
  });
  it('keeps union junctions open and builds the fourth Needleworks ramp', () => {
    const boxes = sewerBoxes();
    const open: Array<[number, number, number]> = [
      [0, -4, 0],
      [18, -4, 0],
      [0, -4, 18],
      [-84, -4, 8],
      [-84, -4, 40],
      [-42, -4, 40],
      [-54, -4, 40],
      [0, -4, 40],
      [48, -4, -18],
      [64, -4, -36],
    ];
    for (const [x, y, z] of open) {
      expect(wallAt(boxes, x, y, z), `junction closed at ${x},${z}`).toBe(false);
    }
    expect(wallAt(boxes, 20, -4, 4.5), 'EW trunk must still have outside walls').toBe(true);

    const ramp = boxes.find((b) => b.rx && Math.abs(b.x + 54) < 0.05);
    expect(ramp).toBeTruthy();
    expect(ramp!.z).toBeCloseTo(52);
    expect(Math.abs(ramp!.rx)).toBeCloseTo(Math.atan(7 / 24));
    expect(ramp!.d).toBeCloseTo(Math.hypot(24, 7));
    expect(ramp!.w).toBe(8);

    expect(sewerRampOpening(-54, 52)).toBe(true);
    expect(sewerRampOpening(-54, 66)).toBe(true);
    expect(sewerRampOpening(0, 0)).toBe(false);
    expect(sewerRampOpening(124, 5)).toBe(false);
    expect(sewerRampOpening(124, -5)).toBe(false);
    expect(sewerRampOpening(124, 3)).toBe(true);
    expect(sewerRampOpening(124, -3)).toBe(true);
    expect(sewerRampOpening(5, 124)).toBe(false);
    expect(sewerRampOpening(-5, 124)).toBe(false);
    expect(sewerRampOpening(3, 124)).toBe(true);
    expect(sewerRampOpening(-3, 124)).toBe(true);
    expect(sewerRampOpening(-54 + 5, 52)).toBe(false);
    expect(sewerRampOpening(-54 - 5, 52)).toBe(false);
    expect(sewerRampOpening(-54 + 3, 52)).toBe(true);
    expect(sewerRampOpening(-54 - 3, 52)).toBe(true);
    expect(SEWER_ENTRIES).toContainEqual({ x: -54, z: 66, name: 'Needleworks', axis: 'z' });
    expect(SEWER_ENTRIES).toEqual(expect.arrayContaining([
      { x: -138, z: 0, name: 'Gate', axis: 'x' },
      { x: 138, z: 0, name: 'Icebox', axis: 'x' },
      { x: 0, z: 138, name: 'Alley', axis: 'z' },
    ]));
  });

  it('supports each street entry on a landing and keeps six units of headroom', () => {
    const boxes = sewerBoxes();
    const slabTop = (x: number, z: number) => {
      const tops = boxes.filter((b) => axisAligned(b) && b.h < 2
        && Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2)
        .map((b) => b.y + b.h / 2);
      return Math.max(-Infinity, ...tops);
    };
    for (const entry of SEWER_ENTRIES) {
      expect(slabTop(entry.x, entry.z), `void under ${entry.name}`).toBeCloseTo(0);
      expect(sewerRampOpening(entry.x, entry.z)).toBe(true);
      expect(wallAt(boxes, entry.x, 1, entry.z), `${entry.name} mouth blocked`).toBe(false);
    }

    const overJunction = boxes.filter((b) => axisAligned(b) && b.h < 2
      && Math.abs(0 - b.x) <= b.w / 2 && Math.abs(0 - b.z) <= b.d / 2);
    const floorTop = Math.max(...overJunction.filter((b) => b.y < -6).map((b) => b.y + b.h / 2));
    const ceilBot = Math.min(...overJunction.filter((b) => b.y > -2).map((b) => b.y - b.h / 2));
    expect(floorTop).toBeCloseTo(-7);
    expect(ceilBot).toBeCloseTo(-1);
    expect(ceilBot - floorTop).toBeCloseTo(6);
    for (const y of [-6.5, -4, -1.5]) {
      expect(wallAt(boxes, 0, y, 0), `headroom blocked at y=${y}`).toBe(false);
      expect(overJunction.some((b) => contains(b, 0, y, 0)), `slab in walk column at y=${y}`).toBe(false);
    }
  });
});
