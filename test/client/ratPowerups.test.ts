import {createCaseGrip,disposeCaseGrip} from '../../src/prototype/CaseGrip';
import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {RatEntity} from '../../src/entities/RatEntity';
import {RatPowerupEffects} from '../../src/entities/RatPowerupEffects';

it.each([false,true])('restores every material after silver expiry, hit flashes and death (batched=%s)',batched=>{
    const scene=new THREE.Scene(),rat=new RatEntity(scene,new C.World(),new THREE.Vector3(),'Rat',{});
    try{
        const materials=new Set<THREE.MeshStandardMaterial>();
        rat.mesh.traverse(o=>{if(o instanceof THREE.Mesh&&o.name!=='rat-muzzle-flash'&&o.material instanceof THREE.MeshStandardMaterial)materials.add(o.material);});
        const before=[...materials].map(m=>[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.metalness,m.roughness]);
        if(batched)rat.enableRigidBatching();
        rat.setPowerups(1,2);rat.presentAlive(.3);expect([...materials].every(m=>m.color.getHex()===0xdce4ed&&m.metalness===.88)).toBe(true);
        rat.flashColor(0xff0000);rat.presentAlive(.3);
        expect([...materials].every(m=>m.color.getHex()===0xdce4ed)).toBe(true);
        rat.presentAlive(1);
        expect([...materials].map(m=>[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.metalness,m.roughness])).toEqual(before);
        rat.setPowerups(10,10);rat.useSharedCorpse();
        expect([...materials].map(m=>[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.metalness,m.roughness])).toEqual(before);
        expect(scene.getObjectByName('hot-pursuit-trail')).toBeUndefined();
    }finally{rat.dispose();}
    expect(scene.children).toHaveLength(0);
});
it('bounds the red ribbon and healing wave and clears them on teleport or expiry',()=>{
    const scene=new THREE.Scene(),fx=new RatPowerupEffects(scene),p=new THREE.Vector3();
    for(let i=0;i<300;i++){p.x+=.4;fx.update(.02,p,true);}
    expect(fx.trail.visible).toBe(true);expect(fx.trail.geometry.drawRange.count).toBeLessThanOrEqual(31*12);
    expect(fx.trail.material.depthTest).toBe(true);expect(fx.wave.material.depthTest).toBe(true);
    p.x+=100;fx.update(.02,p,true);expect(fx.trail.visible).toBe(false);
    fx.heal();fx.update(.2,p,false);expect(fx.wave.visible).toBe(true);
    fx.update(.6,p,false);expect(fx.wave.visible).toBe(false);
    fx.dispose();expect(scene.children).toHaveLength(0);
});

it.each([false,true])('shares coat and skin with the carry arm through armor, expiry and cleanup (batched=%s)',batched=>{
    const rat=new RatEntity(new THREE.Scene(),new C.World(),new THREE.Vector3(),'Rat',{});
    try{
        if(batched)rat.enableRigidBatching();
        rat.setPowerups(12,0);rat.presentAlive(.3);
        const arm=createCaseGrip(rat),materials=new Set<THREE.MeshStandardMaterial>();
        arm.traverse(o=>{if(o instanceof THREE.Mesh)materials.add(o.material);});
        expect([...materials].map(m=>m.name).sort()).toEqual(['rat-coat','rat-skin']);
        expect([...materials].every(m=>m.color.getHex()===0xdce4ed&&m.metalness===.88)).toBe(true);
        rat.setPowerups(0,0);
        expect([...materials].every(m=>m.color.getHex()!==0xdce4ed&&m.metalness!==.88)).toBe(true);
        const disposals=[...materials].map(m=>vi.spyOn(m,'dispose'));
        disposeCaseGrip(arm);expect(disposals.every(s=>s.mock.calls.length===0)).toBe(true);
        expect(arm.parent).toBeNull();
    }finally{rat.dispose();}
});
it('ends the application wave quickly and clears it on death/reset',()=>{
    const scene=new THREE.Scene(),fx=new RatPowerupEffects(scene);
    fx.apply('ironclad');fx.update(.1,new THREE.Vector3(),false);
    expect(fx.applyWave.visible).toBe(true);expect(fx.applyWave.material.depthTest).toBe(true);
    fx.update(.4,new THREE.Vector3(),false);expect(fx.applyWave.visible).toBe(false);
    fx.apply('hustle');fx.clear();fx.update(.01,new THREE.Vector3(),false);expect(fx.applyWave.visible).toBe(false);
    fx.dispose();expect(scene.children).toHaveLength(0);
});
