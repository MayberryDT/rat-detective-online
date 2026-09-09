import * as THREE from 'three';

const up = new THREE.Vector3(0, 1, 0);

/** Keep a simulated bot's shot independent of its delayed display pose. */
export function muzzleAtPose(root: THREE.Object3D, position: { x:number; y:number; z:number }, facing:number): THREE.Vector3 {
    const muzzle = root.getObjectByName('rat-muzzle')!;
    const point = root.worldToLocal(muzzle.getWorldPosition(new THREE.Vector3()));
    point.multiply(root.scale).applyAxisAngle(up, facing);
    point.x += position.x; point.y += position.y; point.z += position.z;
    return point;
}
