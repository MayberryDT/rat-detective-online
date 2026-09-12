import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createRatMesh} from '../../src/utils/RatModel';
import {createRatMesh as createOriginal} from '../visual/reference/OriginalRatModel';
import {RatAnimator} from '../../src/utils/RatAnimator';
import {RAT_GUN_SHOULDER} from '../../src/utils/RatArmModel';

it('pivots the shorter sleeve at a fixed shoulder while preserving the original muzzle through firing and recovery',()=>{
    const root=createRatMesh(),outline=createRatMesh(),original=createOriginal();
    const animator=new RatAnimator(root,outline),reference=new RatAnimator(original);
    const shoulder=root.getObjectByName('rat-gun-shoulder')!;
    const rest=shoulder.quaternion.clone();
    const sleeve=shoulder.getObjectByName('rat-floating-sleeve')!;
    expect(.390*sleeve.scale.z).toBeGreaterThan(.25);
    expect(.390*sleeve.scale.z).toBeLessThan(.34);
    const verify=()=>{
        for(const model of [root,outline]){
            const pivot=model.getObjectByName('rat-gun-shoulder')!;
            expect(pivot.position.distanceTo(RAT_GUN_SHOULDER)).toBeLessThan(1e-9);
            const upper=pivot.getObjectByName('rat-floating-sleeve')!.localToWorld(new THREE.Vector3(0,0,-.370));
            expect(upper.distanceTo(pivot.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
            const grip=model.getObjectByName('rat-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
            const target=model.getObjectByName('rat-pistol')!.localToWorld(new THREE.Vector3(-.035,-.065,-.055));
            expect(grip.distanceTo(target)).toBeLessThan(1e-6);
            const muzzle=model.getObjectByName('rat-muzzle')!.getWorldPosition(new THREE.Vector3());
            expect(muzzle.distanceTo(original.getObjectByName('rat-muzzle')!.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
        }
    };
    verify();
    for(const target of [new THREE.Vector3(0,2,30),new THREE.Vector3(-8,15,20),new THREE.Vector3(8,-10,20)]){
        animator.shoot(target);reference.shoot(target);verify();
        expect(shoulder.quaternion.angleTo(rest)).toBeGreaterThan(.3);
        for(let frame=0;frame<150;frame++){
            for(const model of [root,outline,original]){model.position.z=frame*.08;model.rotation.y=frame*.003;}
            animator.update(1/60,18);reference.update(1/60,18);verify();
        }
    }
    animator.poseDeath(.5,1/60,{x:2,y:4,z:1},2,false);
    reference.poseDeath(.5,1/60,{x:2,y:4,z:1},2,false);verify();
    animator.reset();reference.reset();verify();
    expect(shoulder.quaternion.angleTo(rest)).toBeLessThan(1e-6);
});
