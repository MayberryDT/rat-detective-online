import {expect,it} from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {OutfitStudioSubject} from '../visual/OutfitStudioSubject';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';

it.each([false,true])('keeps the actual studio handle attached through walking, turns and coat stretch (opponent=%s)',remote=>{
    const scene=new THREE.Scene(),world=new CANNON.World();
    const subject=new OutfitStudioSubject(scene,world,new THREE.PerspectiveCamera(),DEFAULT_APPEARANCE,new THREE.Vector3(),remote,true);
    try{
        expect(subject.caseRoot.parent).toBe(scene);
        for(let frame=0;frame<100;frame++){
            subject.rat.body.position.set(frame*.12,0,frame*.3);
            subject.rat.mesh.rotation.y=frame*.04;
            subject.rat.update(1/60);subject.updateCarry();
            const hand=subject.rat.mesh.getObjectByName('case-gripping-paw')!.getWorldPosition(new THREE.Vector3());
            const handle=subject.caseRoot.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
            expect(handle.distanceTo(hand)).toBeLessThan(1e-6);
            expect(subject.caseRoot.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))).toBeLessThan(1e-6);
        }
        for(let frame=0;frame<180;frame++)subject.rat.update(1/60);
        subject.updateCarry();
        const caseAxis=new THREE.Vector3(1,0,0).applyQuaternion(subject.caseRoot.quaternion);
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(subject.rat.mesh.quaternion);
        expect(Math.abs(caseAxis.dot(forward))).toBeCloseTo(1,5);
        subject.setCarried(false);expect(subject.caseRoot.visible).toBe(false);
        expect(subject.rat.mesh.getObjectByName('case-gripping-paw')).toBeUndefined();
        subject.setCarried(true);subject.updateCarry();
        expect(subject.rat.mesh.getObjectByName('case-gripping-paw')).toBeDefined();
    }finally{subject.dispose();}
    expect(scene.children).toHaveLength(0);expect(world.bodies).toHaveLength(0);
});
