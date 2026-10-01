import * as THREE from 'three';
import { CASE_TAG } from './CaseModel';
import { FEEL } from '../feel/feelTuning';
import { feelState } from '../feel/feelState';

const handle = new THREE.Vector3(), handleOffset = new THREE.Vector3(), axis = new THREE.Vector3(), velocity = new THREE.Vector3(), accel = new THREE.Vector3();

/** K2: the case's own motion on top of its pose, presentation only (Tyler, 1 October: "make it juicy"). Carried, it swings
 * on the handle against the paw's acceleration; taken, it squashes and springs back; loose and still, it rattles a little
 * hop now and then (come and get me); hit, its evidence tag flaps. `?feel=off` and the K2 switch leave the bare pose. */
export class CaseMotion {
    private readonly tag?: THREE.Object3D;
    private swing = 0; private swingVelocity = 0;
    private tagAngle = 0; private tagVelocity = 0;
    private readonly lastHandle = new THREE.Vector3(); private readonly lastVelocity = new THREE.Vector3();
    /** Frames tracked in a row while carried: velocity needs one, acceleration two. */
    private tracking = 0;
    private squashAt = -Infinity;
    private stillSince = Infinity; private hopAt = Infinity;

    constructor(private readonly root: THREE.Object3D) { this.tag = root.getObjectByName(CASE_TAG); }

    private get on(): boolean { return feelState().on('caseMotion'); }

    /** Taken into a paw: a squash that springs back. */
    taken(now: number): void { this.squashAt = now; this.tracking = 0; this.kick(1); }
    /** A ball or a hand jolted it: the tag flaps. */
    kick(strength = .6): void { this.tagVelocity += (Math.random() < .5 ? -1 : 1) * 9 * strength; }

    /** Carried, after the carry pose and before the grip slip: the swing (rad) to add, from the paw's acceleration
     * across the case's broad face (its local x). */
    carried(dt: number): number {
        if (!this.on || dt <= 0) { this.tracking = 0; return 0; }
        const p = FEEL.caseMotion.params;
        handle.copy(handleOffset.set(0, .43, 0).applyQuaternion(this.root.quaternion)).add(this.root.position);
        if (this.tracking > 0) velocity.copy(handle).sub(this.lastHandle).divideScalar(dt);
        if (this.tracking > 1) {
            accel.copy(velocity).sub(this.lastVelocity).divideScalar(dt);
            axis.set(1, 0, 0).applyQuaternion(this.root.quaternion);
            // A spring toward hanging straight, pushed by the paw's acceleration along the face.
            const force = Math.max(-40, Math.min(40, -accel.dot(axis) * p.swing * .01));
            this.swingVelocity += (force - this.swing * p.spring * p.spring - this.swingVelocity * 2 * p.damping * p.spring) * dt;
            this.swing = Math.max(-p.maxSwing, Math.min(p.maxSwing, this.swing + this.swingVelocity * dt));
        } else if (this.tracking === 0) { this.swing = 0; this.swingVelocity = 0; }
        if (this.tracking > 0) this.lastVelocity.copy(velocity);
        this.lastHandle.copy(handle); this.tracking = Math.min(2, this.tracking + 1);
        return this.swing;
    }

    /** Loose, after the loose pose: a still case hops and rattles now and then. `speed` is its own (units/s). */
    loose(now: number, speed: number): void {
        this.tracking = 0;
        if (!this.on) return;
        const p = FEEL.caseMotion.params;
        if (speed > .4) { this.stillSince = Infinity; this.hopAt = Infinity; return; }
        if (this.stillSince === Infinity) { this.stillSince = now; this.hopAt = now + p.idleEvery * 1000 * (.6 + Math.random() * .8); }
        const t = (now - this.hopAt) / 1000;
        if (t > p.hopMs / 1000) { this.hopAt = now + p.idleEvery * 1000 * (.6 + Math.random() * .8); this.kick(.4); return; }
        if (t < 0) return;
        const k = Math.sin(Math.PI * t / (p.hopMs / 1000));
        this.root.position.y += k * p.hop;
        this.root.rotateY(Math.sin(t * 40) * k * .08);
    }

    /** Every frame, after the pose: the pickup squash and the tag. */
    finish(dt: number, now: number): void {
        const p = FEEL.caseMotion.params, on = this.on;
        const s = (now - this.squashAt) / 1000;
        if (on && s >= 0 && s < .45) {
            const a = Math.sin(s * 22) * Math.exp(-s * 9) * p.squash;
            this.root.scale.x *= 1 + a; this.root.scale.y *= 1 - a; this.root.scale.z *= 1 + a;
        }
        if (!this.tag) return;
        if (!on) { if (this.tagAngle !== 0) { this.tagAngle = 0; this.tag.rotation.z = 0; } return; }
        // The tag hangs off the swing a beat behind, on its own light spring.
        const target = -this.swing * 1.6;
        this.tagVelocity += ((target - this.tagAngle) * 120 - this.tagVelocity * 7) * Math.max(0, Math.min(dt, .05));
        this.tagAngle = Math.max(-1.2, Math.min(1.2, this.tagAngle + this.tagVelocity * Math.max(0, Math.min(dt, .05))));
        this.tag.rotation.z = this.tagAngle;
    }
}
