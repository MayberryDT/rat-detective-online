import { describe, expect, it } from 'vitest';
import {
  LANDMARK_INTERIORS,
  LANDMARK_FURNISHINGS,
  isReachableLandmarkPosition,
  landmarkBoxes,
  landmarkStairDetails,
} from '../../src/shared/landmarkLayout';
import type { GrayboxBox } from '../../src/shared/grayboxLayout';

const DOORS: Record<string, Array<{ x: number; y: number; z: number }>> = {
  records: [
    { x: -16, y: 3, z: -37.6 },
    { x: -16, y: 3, z: -80.4 },
    { x: -47.4, y: 3, z: -59 },
  ],
  icebox: [
    { x: 130, y: 3, z: -31.6 },
    { x: 153.4, y: 3, z: -48 },
    { x: 130, y: 3, z: -90.4 },
  ],
  needleworks: [
    { x: -105, y: 3, z: 107.4 },
    { x: -67.6, y: 3, z: 82 },
    { x: -105, y: 3, z: 56.6 },
  ],
  pump: [
    { x: 125, y: 3, z: 136.4 },
    { x: 149.4, y: 3, z: 118 },
    { x: 125, y: 3, z: 99.6 },
  ],
};

function floorAt(boxes: GrayboxBox[], y: number, x: number, z: number) {
  return boxes.some((b) => axisAligned(b) && !b.hidden && b.h < 2
    && Math.abs(b.y + b.h / 2 - y) < 0.35
    && Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2);
}

function axisAligned(b: GrayboxBox) {
  return !b.rx && !b.rz;
}

function contains(b: GrayboxBox, x: number, y: number, z: number) {
  if (!axisAligned(b)) return false;
  return Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2 && Math.abs(z - b.z) <= b.d / 2;
}

function worldFromLocal(b: GrayboxBox, lx: number, ly: number, lz: number) {
  const cx = Math.cos(b.rx), sx = Math.sin(b.rx);
  const cz = Math.cos(b.rz), sz = Math.sin(b.rz);
  const y1 = cx * ly - sx * lz;
  const z1 = sx * ly + cx * lz;
  return { x: b.x + cz * lx - sz * y1, y: b.y + sz * lx + cz * y1, z: b.z + z1 };
}

function rampTopY(ramp: GrayboxBox, x: number, z: number) {
  const ly = ramp.h / 2;
  if (ramp.rx) {
    const lz = (z - ramp.z - ly * Math.sin(ramp.rx)) / Math.cos(ramp.rx);
    return ramp.y + ly * Math.cos(ramp.rx) - lz * Math.sin(ramp.rx);
  }
  const lx = (x - ramp.x + ly * Math.sin(ramp.rz)) / Math.cos(ramp.rz);
  return ramp.y + lx * Math.sin(ramp.rz) + ly * Math.cos(ramp.rz);
}

describe('landmark interiors', () => {
  it('exports the four parent-designed halls', () => {
    expect(LANDMARK_INTERIORS.map((l) => [l.id, l.cx, l.cz, l.w, l.d, l.levels])).toEqual([
      ['records', -16, -59, 64, 44, [0, 8, 16]],
      ['icebox', 130, -61, 48, 60, [0, 8]],
      ['needleworks', -105, 82, 76, 52, [0, 8, 16]],
      ['pump', 125, 118, 50, 38, [0, 8]],
    ]);
    const boxes = landmarkBoxes();
    expect(floorAt(boxes, 8, -16, -59)).toBe(false);
    expect(floorAt(boxes, 16, -16, -59)).toBe(false);
    expect(floorAt(boxes, 8, -31, -59)).toBe(true);
    expect(floorAt(boxes, 8, 4, -59)).toBe(true);
    expect(floorAt(boxes, 8, -16, -75)).toBe(true);
    expect(floorAt(boxes, 8, -16, -43)).toBe(true);
    expect(floorAt(boxes, 8, 130, -61)).toBe(false);
    expect(floorAt(boxes, 8, 130, -40)).toBe(false);
    expect(floorAt(boxes, 16, 130, -61)).toBe(false);
    expect(floorAt(boxes, 16, 130, -78)).toBe(false);
    expect(floorAt(boxes, 8, -138, 83)).toBe(true);
    expect(floorAt(boxes, 8, -85, 82)).toBe(true);
    expect(floorAt(boxes, 16, -74, 81)).toBe(true);
    expect(floorAt(boxes, 16, -138, 90)).toBe(true);
    expect(floorAt(boxes, 8, 125, 118)).toBe(false);
    expect(floorAt(boxes, 8, 125, 133)).toBe(false);
    expect(floorAt(boxes, 8, 146, 118)).toBe(true);
    expect(floorAt(boxes, 16, 125, 118)).toBe(false);
    expect(floorAt(boxes, 16, 125, 133)).toBe(false);
    expect(floorAt(boxes, 8, -26, -59)).toBe(false); // Expanded Records lightwell.
    expect(floorAt(boxes, 8, 118, -70)).toBe(true); // West cold-store mezzanine.
    expect(floorAt(boxes, 8, 130, -86)).toBe(true); // Rear crosswalk.
    expect(floorAt(boxes, 8, -117, 82)).toBe(false); // Offset west shaft.
    expect(floorAt(boxes, 16, -94, 82)).toBe(false); // Offset east shaft.
    expect(floorAt(boxes, 8, 109, 118)).toBe(true); // West turbine gallery.
    expect(floorAt(boxes, 8, 125, 103)).toBe(true); // Rear bridge.

  });

  it('keeps collision ramps hidden and stair treads collider-free', () => {
    const boxes = landmarkBoxes();
    const ramps = boxes.filter((b) => b.hidden && (b.rx || b.rz));
    const treads = landmarkStairDetails();
    expect(ramps).toHaveLength(6);
    expect(treads.length).toBeGreaterThanOrEqual(6 * 16);
    expect(boxes.some((b) => treads.includes(b))).toBe(false);
    expect(treads.every((b) => !b.hidden && !b.rx && !b.rz)).toBe(true);
  });

  it('sizes stairs for clearance, openings, landings, and incline-matched treads', () => {
    const boxes = landmarkBoxes();
    const ramps = boxes.filter((b) => b.hidden && (b.rx || b.rz));
    const treads = landmarkStairDetails();
    for (const ramp of ramps) {
      const angle = ramp.rx || ramp.rz;
      const along = ramp.rx ? ramp.d : ramp.w;
      const width = ramp.rx ? ramp.w : ramp.d;
      const rise = Math.abs(Math.sin(angle) * along);
      const run = Math.abs(Math.cos(angle) * along);
      expect(width).toBeGreaterThanOrEqual(5);
      expect(rise).toBeCloseTo(8, 1);
      expect(run).toBeGreaterThanOrEqual(20);

      for (const t of [0.15, 0.5, 0.85]) {
        const sample = worldFromLocal(ramp, 0, ramp.h / 2, (t - 0.5) * along);
        for (const head of [0.6, 3, 6]) {
          const y = sample.y + head;
          const blocked = boxes.some((b) => axisAligned(b) && contains(b, sample.x, y, sample.z));
          expect(blocked, `headroom ${head} at ${sample.x},${y},${sample.z}`).toBe(false);
        }
        const dest = ramp.y < 8 ? 8 : 16;
        const covered = boxes.some((b) => axisAligned(b) && !b.hidden && b.h < 2
          && Math.abs(b.y + b.h / 2 - dest) < 0.4
          && Math.abs(sample.x - b.x) <= b.w / 2 && Math.abs(sample.z - b.z) <= b.d / 2);
        expect(covered, `upper opening over stair at ${sample.x},${sample.z}`).toBe(false);
      }

      const high = worldFromLocal(ramp, 0, ramp.h / 2, ramp.rx < 0 ? ramp.d / 2 : -ramp.d / 2);
      const walk = ramp.rx < 0 ? 3.2 : -3.2;
      const land = { x: high.x, y: high.y + 0.2, z: high.z + (ramp.rx ? walk : 0) };
      const landing = boxes.some((b) => axisAligned(b) && !b.hidden && b.h < 2
        && Math.abs(land.x - b.x) <= b.w / 2 && Math.abs(land.z - b.z) <= b.d / 2
        && Math.abs(b.y + b.h / 2 - (ramp.y < 8 ? 8 : 16)) < 0.5);
      expect(landing, `landing beyond ${high.x},${high.z}`).toBe(true);

      const nearby = treads.filter((tread) => Math.hypot(tread.x - ramp.x, tread.z - ramp.z) < along / 2 + 2);
      expect(nearby.length).toBeGreaterThanOrEqual(12);
      for (const tread of nearby) {
        const expected = rampTopY(ramp, tread.x, tread.z);
        expect(Math.abs(tread.y + tread.h / 2 - expected)).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('leaves ground door openings through the landmark shells', () => {
    const boxes = landmarkBoxes();
    for (const [id, samples] of Object.entries(DOORS)) {
      expect(samples, id).toHaveLength(3);
      for (const p of samples) {
        for (const y of [1, 3.5, 6]) {
          const hit = boxes.find((b) => contains(b, p.x, y, p.z));
          expect(hit, `${id} door blocked at ${p.x},${y},${p.z}`).toBeUndefined();
        }
      }
    }
  });

  it('classifies shared-floor and stair case rests without treating roofs as reachable', () => {
    const boxes = landmarkBoxes();
    for (const hall of LANDMARK_INTERIORS) {
      for (const level of hall.levels) {
        const slab = boxes.find((b) => axisAligned(b) && !b.hidden && b.h < 2
          && Math.abs(b.x - hall.cx) < hall.w / 2 && Math.abs(b.z - hall.cz) < hall.d / 2
          && Math.abs(b.y + b.h / 2 - level) < 0.35 && b.w > 4 && b.d > 4);
        expect(slab, `${hall.id} floor ${level}`).toBeTruthy();
        expect(isReachableLandmarkPosition(slab!.x, level + 0.35, slab!.z)).toBe(true);
      }
      expect(isReachableLandmarkPosition(hall.cx, 24.5, hall.cz)).toBe(false);
      expect(isReachableLandmarkPosition(hall.cx, 30, hall.cz)).toBe(false);
    }
    for (const ramp of boxes.filter((b) => b.hidden && (b.rx || b.rz))) {
      expect(isReachableLandmarkPosition(ramp.x, ramp.y + 0.35, ramp.z)).toBe(true);
    }
    expect(isReachableLandmarkPosition(-16, 1.3, -28)).toBe(false);
    expect(isReachableLandmarkPosition(40, 36, -15)).toBe(false);
  });


  it('keeps every detailed furnishing supported and gives each piece a single collision proxy', () => {
    const boxes = landmarkBoxes();
    for (const f of LANDMARK_FURNISHINGS) {
      const base = f.y - f.h / 2;
      expect(floorAt(boxes, base, f.x, f.z), `${f.kind} floor at ${f.x},${base},${f.z}`).toBe(true);
      const proxies = boxes.filter(b => b.hidden && !b.rx && !b.rz
        && b.x === f.x && b.y === f.y && b.z === f.z && b.w === f.w && b.h === f.h && b.d === f.d);
      expect(proxies, `${f.kind} proxy`).toHaveLength(1);
      if (f.y + f.h / 2 < 20) expect(isReachableLandmarkPosition(f.x, f.y + f.h / 2 + 0.2, f.z)).toBe(true);
    }
  });

  it('keeps a broad central ground route between the north and south doors', () => {
    const boxes = landmarkBoxes();
    for (const hall of LANDMARK_INTERIORS) {
      for(let z=hall.cz-hall.d/2+1.5;z<hall.cz+hall.d/2-1.5;z+=0.5) {
        for(const dx of [-2,0,2]) {
          const hit = boxes.find(b => contains(b,hall.cx+dx,2,z));
          expect(hit, `${hall.id} central aisle blocked at ${hall.cx+dx},${z}`).toBeUndefined();
        }
      }
    }
  });
  it('seals playable volume at 24 and does not stair the upper mass', () => {
    const boxes = landmarkBoxes();
    const ramps = boxes.filter((b) => b.hidden && (b.rx || b.rz));
    expect(Math.max(...ramps.map((b) => b.y + 4))).toBeLessThan(20);
    for (const hall of LANDMARK_INTERIORS) {
      const seal = boxes.find((b) => b.building && Math.abs(b.x - hall.cx) < 1 && Math.abs(b.z - hall.cz) < 1 && b.y > 24);
      expect(seal, hall.id).toBeTruthy();
      expect(seal!.y - seal!.h / 2).toBeGreaterThanOrEqual(24);
    }
  });
});
