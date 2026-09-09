import { expect, it } from 'vitest';
import * as THREE from 'three';
import { muzzleAtPose } from '../../src/utils/muzzlePose';

it('uses the animated muzzle offset at the simulated pose, independent of display delay', () => {
    const root=new THREE.Group(), arm=new THREE.Group(), muzzle=new THREE.Object3D();
    muzzle.name='rat-muzzle';arm.position.set(.5,1,0);muzzle.position.set(0,0,1);
    arm.add(muzzle);root.add(arm);root.position.set(-100,30,200);root.rotation.y=-1;
    const pose=muzzleAtPose(root,{x:10,y:2,z:20},Math.PI/2);
    expect(pose.x).toBeCloseTo(11);expect(pose.y).toBeCloseTo(3);expect(pose.z).toBeCloseTo(19.5);
    root.position.set(800,200,-100);root.rotation.y=2;
    expect(muzzleAtPose(root,{x:10,y:2,z:20},Math.PI/2).distanceTo(pose)).toBeLessThan(1e-9);
});
