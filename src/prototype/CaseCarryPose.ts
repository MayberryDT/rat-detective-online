import * as THREE from 'three';
import { CASE_HAND, CASE_CARRY_ROTATION } from '../shared/chaosState';
import { RAT_CARRY_SHOULDER } from '../utils/RatAnimator';

const rotation = new THREE.Quaternion(CASE_CARRY_ROTATION.x, CASE_CARRY_ROTATION.y,
    CASE_CARRY_ROTATION.z, CASE_CARRY_ROTATION.w);
const handleOffset = new THREE.Vector3();

/** World-space rigid case pose shared by live cases and art previews.
 * The animated/scaled coat moves the hand, but must never stretch the case.
 * Its broad face runs along the rat's side, with the handle centered in the paw.
 * The case root belongs directly to the scene (not to the scaled rat rig).
 */
export function updateCaseCarryPose(root: THREE.Object3D, anchor: THREE.Object3D): void {
    root.position.set(CASE_HAND.x, CASE_HAND.y + .43, CASE_HAND.z).sub(RAT_CARRY_SHOULDER);
    anchor.localToWorld(root.position);
    anchor.getWorldQuaternion(root.quaternion).normalize().multiply(rotation);
    root.position.sub(handleOffset.set(0, .43, 0).applyQuaternion(root.quaternion));
}

const slipAxis = new THREE.Vector3(0, 0, 1), slip = new THREE.Quaternion(), handle = new THREE.Vector3();
/** The case slipping in the paw as its grip weakens: it swings `angle` radians about the handle (one end of the
 * handle slides out of the fist) and sags `sag` units. Applied after `updateCaseCarryPose`. */
export function slipCaseCarryPose(root: THREE.Object3D, angle: number, sag: number): void {
    if (!angle && !sag) return;
    handle.set(0, .43, 0).applyQuaternion(root.quaternion).add(root.position);
    root.quaternion.multiply(slip.setFromAxisAngle(slipAxis, angle));
    root.position.copy(handle).sub(handleOffset.set(0, .43, 0).applyQuaternion(root.quaternion));
    root.position.y -= sag;
}
