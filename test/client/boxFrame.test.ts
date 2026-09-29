import * as C from 'cannon-es';
import { describe, expect, it } from 'vitest';
import { boxHalfExtents, boxQuaternion, CITY_BARS_GROUP, fromBoxLocal, toBoxLocal } from '../../src/shared/boxFrame';
import { cityBoxBody, addCityBody, StaticCityBroadphase } from '../../src/shared/StaticCityBroadphase';
import { SpatialRayQuery } from '../../src/shared/SpatialRayQuery';
import { grayboxBoxes } from '../../src/shared/grayboxLayout';

// Ways yawed city boxes could go wrong, written before the code:
// 1. A tilted ramp or pipe facet changes pose when the rotation order changes (layout-2 geometry moves).
// 2. A yawed wall collides as its unrotated box, so a bank shot hits air or passes a real wall.
// 3. The face normal of a 45° wall is not the rotated one, so a ball turns the wrong way.
// 4. Cell bars stop cheese, or fail to stop a rat.
const world = () => { const w = new C.World(); w.broadphase = new StaticCityBroadphase(w); return w; };
const ray = (w: C.World, from: C.Vec3, to: C.Vec3, mask = -1) => { const r = new C.RaycastResult(); w.raycastClosest(from, to, { collisionFilterMask: mask, skipBackfaces: true }, r); return r; };

describe('yawed city boxes', () => {
  it('keeps every unyawed tilted box of the city in the pose the older Euler order gave it', () => {
    for (const b of grayboxBoxes().filter(b => (b.rx || b.rz) && !b.ry)) {
      const old = new C.Quaternion(); old.setFromEuler(b.rx, 0, b.rz);
      const q = boxQuaternion(b);
      expect(Math.abs(old.x * q.x + old.y * q.y + old.z * q.z + old.w * q.w)).toBeCloseTo(1, 12);
    }
  });

  it('collides as the rotated box: the corner of its unrotated bounds is empty, its diagonal face is solid', () => {
    const w = world();
    // A 10 x 4 x 1 wall yawed 45°, centred at the origin.
    addCityBody(w, cityBoxBody({ x: 0, y: 2, z: 0, w: 10, h: 4, d: 1, rx: 0, ry: Math.PI / 4, rz: 0 }));
    // Straight down at (4, 0.2): inside the unrotated 10 x 1 footprint, three units off the wall's diagonal.
    expect(ray(w, new C.Vec3(4, 6, .2), new C.Vec3(4, -1, .2)).hasHit).toBe(false);
    // Straight down -z onto the wall: meets the 45° face, whose normal points back up +x/+z.
    const hit = ray(w, new C.Vec3(2, 1, 8), new C.Vec3(2, 1, -8));
    expect(hit.hasHit).toBe(true);
    expect(hit.hitNormalWorld.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(hit.hitNormalWorld.z).toBeCloseTo(Math.SQRT1_2, 5);
    // A ball arriving along -z reflects along +x: down the cross street.
    const v = new C.Vec3(0, 0, -1), n = hit.hitNormalWorld, dot = v.dot(n);
    expect(v.x - 2 * dot * n.x).toBeCloseTo(1, 5);
    expect(v.z - 2 * dot * n.z).toBeCloseTo(0, 5);
  });

  it('bounds and local frames agree with the rotation', () => {
    const b = { x: 3, y: 1, z: -2, w: 8, h: 2, d: 1, rx: 0, ry: Math.PI / 4, rz: 0 };
    const { hx, hz } = boxHalfExtents(b);
    expect(hx).toBeCloseTo((8 + 1) / 2 * Math.SQRT1_2, 9);
    expect(hz).toBeCloseTo((8 + 1) / 2 * Math.SQRT1_2, 9);
    const p = fromBoxLocal(b, 4, 0, 0), back = toBoxLocal(b, p.x, p.y, p.z);
    expect(p.x).toBeCloseTo(3 + 4 * Math.SQRT1_2, 9); expect(p.z).toBeCloseTo(-2 - 4 * Math.SQRT1_2, 9);
    expect(back.x).toBeCloseTo(4, 9); expect(back.z).toBeCloseTo(0, 9);
  });

  it('lets cheese through cell bars and stops a rat at them', () => {
    const w = world();
    const bars = cityBoxBody({ x: 0, y: 1.5, z: 0, w: 4, h: 3, d: .3, rx: 0, ry: 0, rz: 0, passBalls: true });
    addCityBody(w, bars);
    expect(bars.collisionFilterGroup).toBe(CITY_BARS_GROUP);
    const query = new SpatialRayQuery(w); query.refresh();
    // The shot sweep's mask (world, rats, cases, corpses) ignores the bars.
    expect(query.sphere(new C.Vec3(0, 1.5, 3), new C.Vec3(0, 1.5, -3), .15, 1 | 2 | 4 | 8, () => true).hasHit).toBe(false);
    // A rat body (default group and mask) walking into the bars is stopped.
    const rat = new C.Body({ mass: 5, fixedRotation: true, shape: new C.Sphere(.58), position: new C.Vec3(0, .6, 2) });
    rat.velocity.set(0, 0, -6); w.addBody(rat); w.gravity.set(0, 0, 0);
    for (let i = 0; i < 120; i++) w.step(1 / 60);
    expect(rat.position.z).toBeGreaterThan(.15 + .5);
  });
});
