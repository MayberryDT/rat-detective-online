import * as THREE from 'three';

/** Limbs that flop on a corpse. Ears, shoes and whiskers come in pairs. */
export const RAGDOLL_LIMBS = ['head', 'hat', 'earLeft', 'earRight', 'arm', 'shoeLeft', 'shoeRight', 'whiskersLeft', 'whiskersRight'] as const;
export type RagdollLimb = typeof RAGDOLL_LIMBS[number];

/** Per limb: stiffness back to rest, damping, how far gravity and the body's
 * acceleration swing it (rad per g / per unit acceleration), and its joint limit (rad).
 * Loose springs and wide limits are the point: these are rag limbs, not a pose. */
const JOINT:Record<RagdollLimb,{k:number;c:number;gravity:number;inertia:number;limit:number}>={
    head:{k:28,c:3.6,gravity:.9,inertia:.035,limit:1.05},
    hat:{k:18,c:2.6,gravity:.7,inertia:.05,limit:1.2},
    earLeft:{k:14,c:2,gravity:1.4,inertia:.07,limit:1.5},
    earRight:{k:14,c:2,gravity:1.4,inertia:.07,limit:1.5},
    arm:{k:10,c:2.2,gravity:1.6,inertia:.05,limit:1.7},
    shoeLeft:{k:16,c:2.6,gravity:1.1,inertia:.05,limit:1.3},
    shoeRight:{k:16,c:2.6,gravity:1.1,inertia:.05,limit:1.3},
    whiskersLeft:{k:22,c:1.8,gravity:.5,inertia:.08,limit:.8},
    whiskersRight:{k:22,c:1.8,gravity:.5,inertia:.08,limit:.8},
};
/** Death flavours that shape the first second of limb motion. */
export type RagdollCause = 'default' | 'spin' | 'fling' | 'flop' | 'flail' | 'headshot';

/** R1: client-only floppy limbs on the server's rigid corpse box. Each limb is a
 * damped two-axis pendulum (x/z rotations in the body frame) pulled by gravity,
 * swung by the body's acceleration and spin, and kept inside a joint limit.
 * At rest the limbs splay out and go still (R3). Presentation only. */
export class RatRagdoll {
    readonly angles = Object.fromEntries(RAGDOLL_LIMBS.map(limb => [limb, {x:0, z:0, vx:0, vz:0}])) as Record<RagdollLimb,{x:number;z:number;vx:number;vz:number}>;
    private readonly lastPosition = new THREE.Vector3();
    private readonly lastVelocity = new THREE.Vector3();
    private readonly velocity = new THREE.Vector3();
    private readonly acceleration = new THREE.Vector3();
    private readonly inverse = new THREE.Quaternion();
    private primed = 0;
    /** Seconds the body has been still; drives the splay. */
    rest = 0;

    reset(): void {
        for (const limb of RAGDOLL_LIMBS) {const a = this.angles[limb]; a.x = a.z = a.vx = a.vz = 0;}
        this.primed = 0; this.rest = 0; this.lastVelocity.set(0, 0, 0);
    }

    /** A kick to one limb, or every limb, in rad/s. `all` spreads it by a fixed
     * per-limb pattern (alternating directions, uneven sizes) so it is repeatable. */
    impulse(limb: RagdollLimb | 'all', vx: number, vz: number): void {
        const all = limb === 'all';
        for (const [i, name] of (all ? RAGDOLL_LIMBS : [limb]).entries()) {
            const a = this.angles[name], spread = all ? .5 + (i * 7 % 5) / 4 : 1;
            a.vx += vx * spread * (all && i % 2 ? -1 : 1);
            a.vz += vz * spread * (name.endsWith('Left') ? -1 : 1);
        }
    }

    /** The first beat of a death: how the limbs leave the body. */
    start(cause: RagdollCause): void {
        if (cause === 'headshot') {this.angles.head.vx -= 16; this.angles.hat.vx -= 12; this.impulse('all', 3, 4);}
        else if (cause === 'fling') this.impulse('all', 6, 14);
        else if (cause === 'spin') this.impulse('all', 3, 9);
        else if (cause === 'flail') this.impulse('all', 8, 8);
        else this.impulse('all', 2, 5);
    }

    /** `root` is the corpse model (world pose), `localGravity`/`localSpin` in its frame. */
    step(dt: number, root: THREE.Object3D, localGravity: THREE.Vector3, localSpin: THREE.Vector3, resting: boolean, cause: RagdollCause, time: number): void {
        if (!(dt > 0)) return;
        const step = Math.min(dt, .1);
        this.velocity.copy(root.position).sub(this.lastPosition).divideScalar(step);
        if (this.primed < 2) {this.primed++; this.velocity.set(0, 0, 0); this.lastVelocity.set(0, 0, 0);}
        // Teleports (snapshot corrections) are not accelerations.
        if (this.velocity.lengthSq() > 200 * 200) this.velocity.copy(this.lastVelocity);
        this.acceleration.copy(this.velocity).sub(this.lastVelocity).divideScalar(step)
            .applyQuaternion(this.inverse.copy(root.quaternion).invert()).clampLength(0, 400);
        this.lastPosition.copy(root.position); this.lastVelocity.copy(this.velocity);
        this.rest = resting ? this.rest + dt : 0;
        const splay = Math.min(1, this.rest / .4);
        // A launcher death keeps flailing all the way down.
        const flail = cause === 'flail' && !resting ? 1 : 0;
        const substeps = Math.max(1, Math.ceil(step / (1 / 120))), h = step / substeps;
        for (const limb of RAGDOLL_LIMBS) {
            const j = JOINT[limb], a = this.angles[limb], side = limb.endsWith('Left') ? -1 : limb.endsWith('Right') ? 1 : 0;
            // Hang toward gravity, lag behind acceleration, whirl with the spin.
            let tx = localGravity.z * j.gravity - this.acceleration.z * j.inertia - localSpin.x * .02;
            let tz = -localGravity.x * j.gravity + this.acceleration.x * j.inertia - localSpin.z * .02;
            // At rest: sprawl. Pairs fall outward, the head lolls, the arm flops wide.
            tx += splay * (limb === 'head' ? .45 : limb.startsWith('shoe') ? -.5 : limb === 'arm' ? -.6 : 0);
            tz += splay * side * (limb.startsWith('ear') ? .9 : limb.startsWith('shoe') ? .7 : .3);
            if (flail) {tx += Math.sin(time * 17 + side * 2) * .9; tz += Math.cos(time * 13 + side) * .7 * (side || 1);}
            for (let i = 0; i < substeps; i++) {
                a.vx += ((tx - a.x) * j.k - a.vx * j.c) * h; a.vz += ((tz - a.z) * j.k - a.vz * j.c) * h;
                a.x += a.vx * h; a.z += a.vz * h;
                if (Math.abs(a.x) > j.limit) {a.x = Math.sign(a.x) * j.limit; a.vx *= -.3;}
                if (Math.abs(a.z) > j.limit) {a.z = Math.sign(a.z) * j.limit; a.vz *= -.3;}
            }
        }
    }
}
