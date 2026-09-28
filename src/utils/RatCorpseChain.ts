import * as THREE from 'three';
import * as C from 'cannon-es';
import {RAT_SPINE_JOINTS} from './RatModel';
import {RAT_GUN_SHOULDER} from './RatArmModel';
import type {RagdollCause} from './RatRagdoll';

/** Seventh batch R2: the corpse is a client-only point chain. The belly rides the
 * corpse physics body's position (which still owns travel, piles, launches and jolts);
 * every other point hangs off it with distance limits, gravity, air drag and contact
 * planes from a few bounded world rays. The chain, not the rigid body's spin, gives
 * the displayed orientation and the bend of the spine, head, arm, shoes and tail. */
const POINTS = ['belly', 'hips', 'chest', 'head', 'footLeft', 'footRight', 'hand', 'tail'] as const;
type ChainPoint = typeof POINTS[number];
/** Rest position in the standing rat's model space (feet at the origin, facing +Z),
 * contact radius, inverse mass (0 = pinned to the physics body) and air drag (1/s). */
const POINT: Record<ChainPoint, {rest: [number, number, number]; radius: number; w: number; drag: number}> = {
    belly: {rest: [0, RAT_SPINE_JOINTS[1], 0], radius: .46, w: 0, drag: 0},
    hips: {rest: [0, RAT_SPINE_JOINTS[0], 0], radius: .45, w: 1, drag: .6},
    // The chest point sits at the neck, where the head turns, so the drawn head lands on the chain's.
    chest: {rest: [0, 1.55, 0], radius: .38, w: 1, drag: .6},
    head: {rest: [0, 1.64, .2], radius: .42, w: 1.4, drag: .8},
    footLeft: {rest: [-.16, .035, .36], radius: .07, w: 2.5, drag: 1},
    footRight: {rest: [.16, .035, .36], radius: .07, w: 2.5, drag: 1},
    hand: {rest: [-.49, .91, .09], radius: .1, w: 2.5, drag: 1},
    tail: {rest: [.2, .08, -1.61], radius: .05, w: 3, drag: 1.3},
};
const BELLY = 0, HIPS = 1, CHEST = 2, HEAD = 3, FOOT_LEFT = 4, FOOT_RIGHT = 5, HAND = 6, TAIL = 7;
const REST = POINTS.map(name => new THREE.Vector3(...POINT[name].rest));
const RADIUS = POINTS.map(name => POINT[name].radius), W = POINTS.map(name => POINT[name].w), DRAG = POINTS.map(name => POINT[name].drag);
/** [a, b, min, max]: the spine is nearly rigid in length; the joints fold within limits
 * (knees buckle to 0.24, the waist folds about 100°, the neck about 100°). */
const LIMITS: readonly (readonly [number, number, number, number])[] = [
    [BELLY, HIPS, .47, .52], [BELLY, CHEST, .57, .62], [CHEST, HEAD, .2, .24],
    [HIPS, FOOT_LEFT, .24, .56], [HIPS, FOOT_RIGHT, .24, .56], [FOOT_LEFT, FOOT_RIGHT, .22, .95],
    [BELLY, FOOT_LEFT, .42, 1.02], [BELLY, FOOT_RIGHT, .42, 1.02], [CHEST, FOOT_LEFT, .6, 9], [CHEST, FOOT_RIGHT, .6, 9],
    [HIPS, CHEST, .7, 1.12], [BELLY, HEAD, .55, .74], [HIPS, HEAD, .9, 1.24], [HEAD, FOOT_LEFT, .6, 9], [HEAD, FOOT_RIGHT, .6, 9],
    [CHEST, HAND, .45, .85], [BELLY, HAND, .3, .85], [HIPS, TAIL, .8, 1.7], [BELLY, TAIL, .9, 1.9],
];
/** [a, b, rest, stiffness]: a weak pull back toward a straight body, so a body at rest
 * lies out long (a sack) unless something folds it. */
const SOFT: readonly (readonly [number, number, number, number])[] = [[HIPS, CHEST, 1.1, .06], [BELLY, HEAD, .72, .06], [HIPS, HEAD, 1.21, .04]];
/** Cause-shaped first beat, in rest model space (u/s): knees buckle and the waist folds
 * before the body flies; a headshot snaps the head back; an explosion spreads it. */
const START: Record<RagdollCause, readonly (readonly [number, number, number, number])[]> = {
    default: [[HIPS, 0, -1.6, -2], [CHEST, 0, -.6, 2.4], [HEAD, 0, -1, 3.2], [FOOT_LEFT, -.4, 0, 2.6], [FOOT_RIGHT, .4, 0, 2.6], [HAND, -1.5, 0, 1]],
    flop: [[HIPS, 0, -1.4, -1], [CHEST, 0, -.8, 1.6], [HEAD, 0, -1.2, 2], [FOOT_LEFT, -.6, 0, 1.6], [FOOT_RIGHT, .6, 0, 1.6], [HAND, -1, -.5, .5]],
    flail: [[HIPS, 0, -1.6, -2], [CHEST, 0, -.6, 2.4], [HEAD, 0, -1, 3.2], [FOOT_LEFT, -2, 0, 2], [FOOT_RIGHT, 2, 0, 2], [HAND, -3, 1, 1], [TAIL, 2, 2, 0]],
    headshot: [[HEAD, 0, 1.5, -7.5], [CHEST, 0, 0, -2.5], [HIPS, 0, -1.2, 1], [FOOT_LEFT, -.5, 0, 2.2], [FOOT_RIGHT, .5, 0, 2.2], [HAND, -2, 1, -1]],
    fling: [[HEAD, 0, 3, -2.5], [FOOT_LEFT, -6, -1, 0], [FOOT_RIGHT, 6, -1, 0], [HAND, -6, 1.5, 0], [TAIL, 4, 2, -3], [HIPS, 0, -1, 1.5]],
    spin: [[HEAD, 3, 0, 0], [FOOT_LEFT, 0, 0, 3], [FOOT_RIGHT, 0, 0, -3], [HAND, -4, 0, -3], [HIPS, 0, -1.2, -1.5], [CHEST, 0, -.5, 2]],
};
const GRAVITY = -25;
const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
const HIP_JOINT = new THREE.Vector3(0, RAT_SPINE_JOINTS[0], 0), WAIST = new THREE.Vector3(0, RAT_SPINE_JOINTS[1], 0);
const TAIL_ROOT = new THREE.Vector3(0, .25, -.44), TAIL_TIP = new THREE.Vector3(.2, -.17, -1.17);

/** World rays for every chain share one budget (per second, with a burst cap): up to
 * 16 corpses stay bounded, and a starved chain keeps its last contact planes. */
const RAY_RATE = 4800, RAY_BURST = 128;
let rayWorld: C.World | undefined, rayTokens = RAY_BURST, rayClock = 0;
const rayFrom = new C.Vec3(), rayTo = new C.Vec3(), rayResult = new C.RaycastResult();
// A fixed callback: Cannon would otherwise make a new no-op closure per ray.
const rayOptions: C.RayOptions = {collisionFilterMask: 1, skipBackfaces: true, callback: () => {}};
/** The client physics world whose city (and bodies) corpse limbs rest on. */
export function setRagdollWorld(world: C.World | undefined): void {rayWorld = world;}

const basis = new THREE.Matrix4(), scratch = new THREE.Vector3(), mid = new THREE.Vector3();
/** Orthonormal frame with +Y along from→to and +X toward `side`; `x` receives the lateral axis
 * and, when `side` is degenerate, supplies the previous one. */
function frame(target: THREE.Matrix4, from: THREE.Vector3, to: THREE.Vector3, side: THREE.Vector3, x: THREE.Vector3): THREE.Matrix4 {
    const y = mid.subVectors(to, from);
    if (y.lengthSq() < 1e-8) y.copy(UP); else y.normalize();
    scratch.copy(side).addScaledVector(y, -side.dot(y));
    if (scratch.lengthSq() > 1e-6) x.copy(scratch).normalize(); else x.addScaledVector(y, -x.dot(y)).normalize();
    scratch.crossVectors(x, y);
    return target.makeBasis(x, y, scratch);
}
/** Rest frames (and their lateral axes) of the four spine segments, built once. */
const REST_FRAMES = (() => {
    const x = new THREE.Vector3(1, 0, 0), feet = new THREE.Vector3().addVectors(REST[FOOT_LEFT], REST[FOOT_RIGHT]).multiplyScalar(.5);
    const side = new THREE.Vector3().subVectors(REST[FOOT_RIGHT], REST[FOOT_LEFT]);
    const segments: [THREE.Vector3, THREE.Vector3][] = [[feet, REST[HIPS]], [REST[HIPS], REST[BELLY]], [REST[BELLY], REST[CHEST]], [REST[CHEST], REST[HEAD]]];
    return segments.map(([from, to]) => {
        const inverse = new THREE.Quaternion().setFromRotationMatrix(frame(new THREE.Matrix4(), from, to, side, x)).invert();
        side.copy(x);return inverse;
    });
})();

export class RatCorpseChain {
    /** This corpse's own local physics body, skipped by its rays. */
    ignore?: C.Body;
    active = false;
    /** True once the chain has advanced; until then the corpse keeps the pose it was given. */
    stepped = false;
    private readonly p = REST.map(() => new THREE.Vector3());
    private readonly prev = REST.map(() => new THREE.Vector3());
    /** Velocity kicks (u/s) waiting for the next step. */
    private readonly impulse = REST.map(() => new THREE.Vector3());
    /** Per point: ground and wall contact planes (normal, offset), refreshed by rays. */
    private readonly planes = REST.map(() => [{n: new THREE.Vector3(), d: 0, on: false}, {n: new THREE.Vector3(), d: 0, on: false}]);
    private readonly anchor = new THREE.Vector3();
    private readonly sleepAnchor = new THREE.Vector3();
    private readonly start = new THREE.Quaternion();
    private readonly delta = new THREE.Vector3();
    private readonly lateral = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    private readonly side = new THREE.Vector3();
    private readonly feet = new THREE.Vector3();
    /** World turns of the four segments (legs, lower torso, upper torso, neck) from their rest frames. */
    private readonly segment = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
    private readonly inverse = new THREE.Quaternion();
    private cursor = 0;
    private floor = Infinity;
    private asleep = false;
    private restTime = 0;
    private twitched = false;
    private seed = 0;
    /** Seconds since the last shot fold (drives the coat ripple). */
    rippleAge = 10;
    /** Solved pose, in the rig's local spaces (see `solve`). */
    readonly rootPosition = new THREE.Vector3();
    readonly rootQuaternion = new THREE.Quaternion();
    /** Joint turns: the belly about the hips (in body space), the chest about the waist (in belly space). */
    readonly bellyTurn = new THREE.Quaternion();
    readonly chestTurn = new THREE.Quaternion();
    /** Head turn in chest space, premultiplied onto the head's rest rotation. */
    readonly headTurn = new THREE.Quaternion();
    readonly shoes = [new THREE.Vector3(), new THREE.Vector3()];
    readonly arm = {position: new THREE.Vector3(), quaternion: new THREE.Quaternion()};
    /** Tail tip offset from rest, in tail space. */
    readonly tailTip = new THREE.Vector3();
    /** Ground normal in the lower torso's frame (for the landing squash). */
    readonly bellyUp = new THREE.Vector3();

    /** Lay the chain on the standing rest pose of `root` (world pose), then give it the
     * cause's first beat. `anchor` is the physics body's centre. */
    begin(root: THREE.Object3D, anchor: THREE.Vector3, cause: RagdollCause, seed: number): void {
        root.updateWorldMatrix(true, false);
        for (let i = 0; i < REST.length; i++) {
            this.p[i].copy(REST[i]).applyMatrix4(root.matrixWorld);this.prev[i].copy(this.p[i]);this.impulse[i].set(0, 0, 0);
            this.planes[i][0].on = this.planes[i][1].on = false;
        }
        // Keep the drawn body exactly where the physics body is.
        this.delta.subVectors(anchor, this.p[BELLY]);
        for (let i = 0; i < REST.length; i++) {this.p[i].add(this.delta);this.prev[i].add(this.delta);}
        this.anchor.copy(anchor);root.getWorldQuaternion(this.start);
        this.active = true;this.stepped = this.asleep = this.twitched = false;this.restTime = 0;this.floor = Infinity;this.rippleAge = 10;this.seed = seed;
        for (const x of this.lateral) x.set(1, 0, 0).applyQuaternion(this.start);
        for (const [i, x, y, z] of START[cause]) this.kick(i, this.delta.set(x, y, z).applyQuaternion(this.start));
        this.solve();
    }

    reset(): void {this.active = false;}

    /** Add velocity `v` (u/s) to point `i`; wakes the chain. */
    private kick(i: number, v: THREE.Vector3, scale = 1): void {
        if (!W[i]) return;
        this.impulse[i].addScaledVector(v, scale);this.asleep = false;
    }

    /** Landing: the head bounces, the feet, arm and tail fling out. */
    land(strength: number): void {
        if (!this.active || !(strength > 0)) return;
        const x = this.lateral[0];
        this.kick(HEAD, this.delta.set(0, 3.8 * strength, 0));
        this.kick(FOOT_LEFT, this.delta.copy(x).multiplyScalar(-3 * strength).setY(strength));
        this.kick(FOOT_RIGHT, this.delta.copy(x).multiplyScalar(3 * strength).setY(strength));
        this.kick(HAND, this.delta.copy(x).multiplyScalar(-3 * strength).setY(1.5 * strength));
        this.kick(TAIL, this.delta.copy(x).multiplyScalar(2 * strength).setY(strength));
    }

    /** A shot folds the body where it lands: the nearest point is shoved along `push`
     * (or away from `at`) and the rest of the spine the other way, so it creases there. */
    jolt(speed: number, at?: {x: number; y: number; z: number}, push?: {x: number; y: number; z: number}): void {
        if (!this.active) return;
        let hit = CHEST;
        if (at) {
            let best = Infinity;
            for (let i = 1; i < REST.length; i++) {
                const d = (this.p[i].x - at.x) ** 2 + (this.p[i].y - at.y) ** 2 + (this.p[i].z - at.z) ** 2;
                if (d < best) {best = d;hit = i;}
            }
        }
        const v = this.delta;
        if (push) v.set(push.x, push.y, push.z);else if (at) v.set(this.p[hit].x - at.x, this.p[hit].y - at.y, this.p[hit].z - at.z);else v.set(0, 1, 0);
        if (v.lengthSq() < 1e-6) v.set(0, 1, 0);
        v.normalize().multiplyScalar(speed);v.y += speed * .35;
        this.kick(hit, v);
        // Torso hits crease the spine: its other points give the opposite way.
        if (hit <= HEAD) for (let i = 1; i <= HEAD; i++) if (i !== hit) this.kick(i, v, -.3);
        this.rippleAge = 0;
    }

    /** Advance by `dt` with the physics body's centre at `anchor`. `resting`: the body has settled. */
    step(dt: number, anchor: THREE.Vector3, resting: boolean, cause: RagdollCause, time: number, drag: number, twitch: number): void {
        if (!this.active || !(dt > 0)) return;
        dt = Math.min(dt, .1);this.stepped = true;this.rippleAge += dt;
        // Snapshot corrections move the whole body, not just the belly.
        if (anchor.distanceToSquared(this.anchor) > 64) {
            this.delta.subVectors(anchor, this.anchor);
            for (let i = 0; i < REST.length; i++) {this.p[i].add(this.delta);this.prev[i].add(this.delta);}
            this.anchor.copy(anchor);
        }
        this.restTime = resting ? this.restTime + dt : 0;
        // R4: one last twitch once the body has lain still for a moment.
        if (!this.twitched && this.restTime > 1 + (this.seed % 7) * .08) {
            this.twitched = true;
            const foot = this.seed % 2 ? FOOT_LEFT : FOOT_RIGHT;
            this.kick(foot, this.delta.copy(this.lateral[0]).multiplyScalar(foot === FOOT_LEFT ? -twitch : twitch).setY(twitch * .8));
            this.kick(HAND, this.delta.copy(this.lateral[0]).multiplyScalar(-twitch * .6).setY(twitch * .6));
        }
        if (this.asleep) {
            if (anchor.distanceToSquared(this.sleepAnchor) < .03 * .03) return;
            this.asleep = false;
        }
        this.contacts(anchor);
        const steps = Math.max(1, Math.ceil(dt * 90)), h = dt / steps;
        const flail = cause === 'flail' && !resting;
        // Laid out: the feet, arm and tail drift apart (the sprawl), for a second or so.
        const sprawl = resting && this.restTime < 1.4 ? 6 : 0, knees = Math.min(1, this.restTime / .5) * .04;
        // Straightening is gentle in the air (it folds and trails) and, once laid down, only
        // across the ground: it sprawls a body out long but never lifts one draped over a rail.
        const straighten = resting ? 2 * Math.min(1, this.restTime / .6) : .25;
        for (let s = 0; s < steps; s++) {
            for (let i = 1; i < REST.length; i++) {
                const p = this.p[i], prev = this.prev[i], v = this.delta.subVectors(p, prev).multiplyScalar(Math.exp(-DRAG[i] * drag * h));
                if (!s) {v.addScaledVector(this.impulse[i], h);this.impulse[i].set(0, 0, 0);}
                prev.copy(p);p.add(v);p.y += GRAVITY * h * h;
                if (flail && i >= FOOT_LEFT) {
                    const phase = time * 17 + i * 1.9;
                    p.addScaledVector(this.lateral[0], Math.sin(phase) * 45 * h * h);p.y += Math.cos(phase * .8) * 30 * h * h;
                }
                if (sprawl && i >= FOOT_LEFT) p.addScaledVector(this.lateral[0], (i === FOOT_RIGHT || i === TAIL ? sprawl : -sprawl) * h * h);
            }
            this.prev[BELLY].copy(this.p[BELLY]);this.p[BELLY].lerpVectors(this.anchor, anchor, (s + 1) / steps);
            for (let k = 0; k < 3; k++) {
                for (let c = 0; c < LIMITS.length; c++) {
                    const limit = LIMITS[c], a = limit[0], b = limit[1], pa = this.p[a], pb = this.p[b];
                    const d = this.delta.subVectors(pb, pa), length = d.length();
                    const target = length < limit[2] ? limit[2] : length > limit[3] ? limit[3] : length;
                    if (target === length || length < 1e-6) continue;
                    const wa = W[a], wb = W[b], share = (length - target) / length / (wa + wb);
                    pa.addScaledVector(d, share * wa);pb.addScaledVector(d, -share * wb);
                }
                for (let c = 0; c < SOFT.length; c++) {
                    const soft = SOFT[c], a = soft[0], b = soft[1], pa = this.p[a], pb = this.p[b];
                    const d = this.delta.subVectors(pb, pa), length = d.length();
                    if (length < 1e-6) continue;
                    const wa = W[a], wb = W[b], share = (length - soft[2]) / length / (wa + wb) * soft[3] * straighten;
                    if (resting) d.y = 0;
                    pa.addScaledVector(d, share * wa);pb.addScaledVector(d, -share * wb);
                }
                // Laid out, the legs (inside the coat) straighten back to their standing pose
                // against the lower torso: the coat lies long instead of standing up on its feet.
                if (knees) for (let foot = FOOT_LEFT; foot <= FOOT_RIGHT; foot++) {
                    const target = this.delta.subVectors(REST[foot], REST[HIPS]).applyQuaternion(this.segment[1]).add(this.p[HIPS]);
                    this.p[foot].lerp(target, knees);
                }
                // The belly too: the physics box is thinner than the coat, so the drawn body rides a little higher.
                for (let i = 0; i < REST.length; i++) for (let j = 0; j < 2; j++) {
                    const plane = this.planes[i][j], depth = plane.d + RADIUS[i] - plane.n.dot(this.p[i]);
                    if (plane.on && depth > 0) this.p[i].addScaledVector(plane.n, depth);
                }
            }
            // Sack friction: on contact nothing bounces (pushing a point out of a surface
            // must not launch it) and sliding dies quickly.
            const grip = Math.exp(-10 * h);
            for (let i = 1; i < REST.length; i++) for (let j = 0; j < 2; j++) {
                const plane = this.planes[i][j];
                if (!plane.on || plane.d + RADIUS[i] - plane.n.dot(this.p[i]) < -.01) continue;
                const v = this.delta.subVectors(this.p[i], this.prev[i]), into = v.dot(plane.n);
                v.addScaledVector(plane.n, -into).multiplyScalar(grip);
                this.prev[i].subVectors(this.p[i], v);
            }
        }
        this.anchor.copy(anchor);
        let moved = 0;
        for (let i = 1; i < REST.length; i++) moved = Math.max(moved, this.p[i].distanceToSquared(this.prev[i]));
        if (resting && this.twitched && this.restTime > 2.2 && moved < 1e-6) {this.asleep = true;this.sleepAnchor.copy(anchor);}
        this.solve();
    }

    /** Refresh contact planes with the shared ray budget: per point one ray from the
     * body's centre (walls, ledges, rails, other bodies) and one down (the ground). */
    private contacts(anchor: THREE.Vector3): void {
        const world = rayWorld;
        if (!world) {
            // No world (tests, previews): the lowest the body has been stands in for the ground.
            this.floor = Math.min(this.floor, anchor.y - RADIUS[BELLY]);
            for (let i = 0; i < REST.length; i++) {const ground = this.planes[i][0];ground.on = true;ground.n.copy(UP);ground.d = this.floor;}
            return;
        }
        const now = performance.now();
        rayTokens = Math.min(RAY_BURST, rayTokens + Math.max(0, now - rayClock) / 1000 * RAY_RATE);rayClock = now;
        const group = this.ignore?.collisionFilterGroup ?? 0;
        if (this.ignore) this.ignore.collisionFilterGroup = 0;
        for (let n = 0; n < REST.length && rayTokens >= 2; n++) {
            const i = (this.cursor + n) % REST.length, p = this.p[i], r = RADIUS[i];
            rayTokens -= 2;
            const reach = this.delta.subVectors(p, anchor), length = reach.length();
            const wall = this.planes[i][1];wall.on = false;
            if (length > 1e-4) {
                reach.multiplyScalar((length + r) / length);
                rayFrom.set(anchor.x, anchor.y, anchor.z);rayTo.set(anchor.x + reach.x, anchor.y + reach.y, anchor.z + reach.z);
                if (world.raycastClosest(rayFrom, rayTo, rayOptions, rayResult)) this.plane(wall);
            }
            const ground = this.planes[i][0];ground.on = false;
            rayFrom.set(p.x, p.y + Math.max(r, .25), p.z);rayTo.set(p.x, p.y - 1.5, p.z);
            if (world.raycastClosest(rayFrom, rayTo, rayOptions, rayResult)) this.plane(ground);
        }
        this.cursor = (this.cursor + 1) % REST.length;
        if (this.ignore) this.ignore.collisionFilterGroup = group;
    }
    private plane(plane: {n: THREE.Vector3; d: number; on: boolean}): void {
        const n = rayResult.hitNormalWorld, q = rayResult.hitPointWorld;
        plane.n.set(n.x, n.y, n.z);plane.d = plane.n.x * q.x + plane.n.y * q.y + plane.n.z * q.z;plane.on = true;
    }

    /** Turn the chain into the rig's local transforms: the root follows the lower coat
     * (feet to hips), the belly and chest joints bend about the hips and waist, the head
     * turns on its neck, the shoes, gun hand and tail tip go to their points. */
    private solve(): void {
        const p = this.p, legs = this.segment[0], lower = this.segment[1], upper = this.segment[2], neck = this.segment[3], x = this.lateral;
        this.feet.addVectors(p[FOOT_LEFT], p[FOOT_RIGHT]).multiplyScalar(.5);
        this.side.subVectors(p[FOOT_RIGHT], p[FOOT_LEFT]);
        legs.setFromRotationMatrix(frame(basis, this.feet, p[HIPS], this.side, x[0])).multiply(REST_FRAMES[0]);
        lower.setFromRotationMatrix(frame(basis, p[HIPS], p[BELLY], x[0], x[1])).multiply(REST_FRAMES[1]);
        upper.setFromRotationMatrix(frame(basis, p[BELLY], p[CHEST], x[1], x[2])).multiply(REST_FRAMES[2]);
        neck.setFromRotationMatrix(frame(basis, p[CHEST], p[HEAD], x[2], x[3])).multiply(REST_FRAMES[3]);
        this.rootQuaternion.copy(legs);
        this.rootPosition.copy(HIP_JOINT).applyQuaternion(legs).negate().add(p[HIPS]);
        const inverse = this.inverse.copy(legs).invert();
        this.bellyTurn.copy(inverse).multiply(lower);
        this.chestTurn.copy(lower).invert().multiply(upper);
        this.headTurn.copy(upper).invert().multiply(neck);
        for (let side = 0; side < 2; side++) this.shoes[side].subVectors(p[FOOT_LEFT + side], this.rootPosition).applyQuaternion(inverse);
        this.tailTip.subVectors(p[TAIL], this.rootPosition).applyQuaternion(inverse).sub(TAIL_ROOT).sub(TAIL_TIP);
        this.bellyUp.copy(UP).applyQuaternion(this.inverse.copy(lower).invert());
        // Gun hand in chest space: the waist in the world, then undo the chest's turn.
        const waist = this.delta.copy(WAIST).sub(HIP_JOINT).applyQuaternion(lower).add(p[HIPS]);
        const hand = mid.subVectors(p[HAND], waist).applyQuaternion(this.inverse.copy(upper).invert()).add(WAIST).sub(RAT_GUN_SHOULDER);
        const reach = hand.length();
        if (reach < 1e-4) hand.copy(REST[HAND]).sub(RAT_GUN_SHOULDER);else hand.multiplyScalar(THREE.MathUtils.clamp(reach, .22, .42) / reach);
        this.arm.position.copy(RAT_GUN_SHOULDER).add(hand);
        this.arm.quaternion.setFromUnitVectors(FORWARD, hand.normalize());
    }
}
