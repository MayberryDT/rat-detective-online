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
        expect(subject.rat.mesh.getObjectByName('case-gripping-paw')).toBeUndefined();
        const carry=subject.rat.mesh.getObjectByName('hot-case-off-hand')!;
        const sleeve=carry.getObjectByName('rat-floating-sleeve')!;
        const gun=subject.rat.mesh.getObjectByName('rat-gun-shoulder')!.getObjectByName('rat-floating-sleeve')!;
        expect(sleeve.scale.z).toBeGreaterThan(gun.scale.z);
        const gunCuff=gun.getObjectByName('rat-pistol-cuff') as THREE.Mesh;
        const caseCuff=sleeve.getObjectByName('rat-case-cuff') as THREE.Mesh;
        expect(caseCuff.material).toBe(gunCuff.material);
        for(let frame=0;frame<100;frame++){
            subject.rat.body.position.set(frame*.12,0,frame*.3);
            subject.rat.mesh.rotation.y=frame*.04;
            subject.rat.update(1/60);subject.updateCarry();
            const hand=subject.rat.mesh.getObjectByName('case-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
            const handle=subject.caseRoot.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
            expect(handle.distanceTo(hand)).toBeLessThan(1e-6);
            const upper=sleeve.localToWorld(new THREE.Vector3(0,0,-.370));
            expect(upper.distanceTo(carry.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
            expect(subject.caseRoot.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))).toBeLessThan(1e-6);
        }
        for(let frame=0;frame<180;frame++)subject.rat.update(1/60);
        subject.updateCarry();
        const caseAxis=new THREE.Vector3(1,0,0).applyQuaternion(subject.caseRoot.quaternion);
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(subject.rat.mesh.quaternion);
        expect(Math.abs(caseAxis.dot(forward))).toBeCloseTo(1,5);
        subject.setCarried(false);expect(subject.caseRoot.visible).toBe(false);
        expect(subject.rat.mesh.getObjectByName('case-sleeve-grip')).toBeUndefined();
        expect(subject.rat.mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
        expect(subject.rat.mesh.getObjectByName('rat-case-cuff')).toBeUndefined();
        subject.rat.setPowerups(2,0);subject.rat.presentAlive(.3);
        subject.setCarried(true);subject.updateCarry();
        expect(subject.rat.mesh.getObjectByName('case-sleeve-grip')).toBeDefined();
        const cuff=subject.rat.mesh.getObjectByName('rat-case-cuff') as THREE.Mesh;
        expect((cuff.material as THREE.MeshStandardMaterial).metalness).toBe(.88);
    }finally{subject.dispose();}
    expect(scene.children).toHaveLength(0);expect(world.bodies).toHaveLength(0);
});

it('plays the real walk in place under the city camera without moving the body or breaking the grip',()=>{
    const scene=new THREE.Scene(),world=new CANNON.World(),camera=new THREE.PerspectiveCamera();
    const position=new THREE.Vector3(-4,0,-24.6);
    const subject=new OutfitStudioSubject(scene,world,camera,DEFAULT_APPEARANCE,position,false,'case');
    try{
        subject.rat.update(0);let min=Infinity,max=-Infinity;
        for(let frame=0;frame<120;frame++){
            subject.rat.presentAlive(1/60,18);subject.controller.updateView();subject.updateCarry();
            const angle=subject.rat.mesh.getObjectByName('rat-carry-anchor')!.rotation.x;
            min=Math.min(min,angle);max=Math.max(max,angle);
            expect(subject.rat.mesh.position.distanceTo(position)).toBe(0);
            expect(subject.rat.body.position.toArray()).toEqual(position.toArray());
            const paw=subject.rat.mesh.getObjectByName('case-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
            const handle=subject.caseRoot.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
            expect(paw.distanceTo(handle)).toBeLessThan(1e-6);
        }
        expect(max-min).toBeGreaterThan(.5);
        for(let frame=0;frame<180;frame++)subject.rat.presentAlive(1/60,0);
        expect(Math.abs(subject.rat.mesh.getObjectByName('rat-carry-anchor')!.rotation.x)).toBeLessThan(.0001);
    }finally{subject.dispose();}
});

it.each([
    ['original',false],['original',true],['original-arms',false],['original-arms',true],
] as const)('keeps the release reference rig and original case grip aligned (%s, opponent=%s)',(study,remote)=>{
    const scene=new THREE.Scene(),world=new CANNON.World();
    const subject=new OutfitStudioSubject(scene,world,new THREE.PerspectiveCamera(),DEFAULT_APPEARANCE,new THREE.Vector3(),remote,'case',study);
    try{
        expect(subject.rat.mesh.getObjectByName('rat-floating-sleeve')).toBeUndefined();
        for(let frame=0;frame<90;frame++){
            subject.rat.body.position.set(frame*.1,0,frame*.2);subject.rat.mesh.rotation.y=frame*.015;
            subject.rat.update(1/60);subject.updateCarry();
            const hand=subject.rat.mesh.getObjectByName('case-gripping-paw')!.getWorldPosition(new THREE.Vector3());
            const handle=subject.caseRoot.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
            expect(hand.distanceTo(handle)).toBeLessThan(1e-6);
        }
        subject.rat.setPowerups(2,0);subject.rat.presentAlive(.3);
        const paw=subject.rat.mesh.getObjectByName('case-gripping-paw') as THREE.Mesh;
        expect((paw.material as THREE.MeshStandardMaterial).metalness).toBe(.88);
        subject.setOffHand('none');expect(subject.caseRoot.visible).toBe(false);
        subject.setOffHand('none');expect(subject.rat.mesh.getObjectByName('case-gripping-paw')).toBeUndefined();
    }finally{subject.dispose();}
    expect(scene.children).toHaveLength(0);expect(world.bodies).toHaveLength(0);
});
