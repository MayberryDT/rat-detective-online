import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {RatActing,RAT_REACTIONS} from '../../src/utils/RatActing';
import {RatAnimator} from '../../src/utils/RatAnimator';
import {createRatMesh} from '../../src/utils/RatModel';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';
import {SubtleRatActing} from '../visual/reference/SubtleRatActing';
import {MovementRatAnimator} from '../visual/reference/MovementRatAnimator';
import {OutfitStudioSubject} from '../visual/OutfitStudioSubject';
import {CharacterReactionStudy,CHARACTER_STUDIES} from '../visual/CharacterReactionStudy';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';

const values=(a:RatActing)=>[a.headX,a.headY,a.headZ,a.hatX,a.hatY,a.hatZ,a.earLeftX,a.earRightX,a.earLeftZ,a.earRightZ,a.eyes-1,a.eyeSlant,a.tailLift,a.tailStream];
it.each(RAT_REACTIONS)('gives %s a finite visible response and bounded recovery',event=>{
    const a=new RatActing('test');a.trigger(event,1,1);a.update(.05,0,0,false);
    expect(values(a).some(v=>Math.abs(v)>.001)).toBe(true);
    for(let i=0;i<200;i++){
        a.update(1/60,7,0,false);
        expect(values(a).every(v=>Number.isFinite(v)&&Math.abs(v)<1.1)).toBe(true);
    }
    expect(Math.max(...values(a).map(Math.abs))).toBeLessThan(.00001);
});
it('refreshes rapid shots without accumulating and rate-bounds repeated armor impacts',()=>{
    const a=new RatActing('test');
    for(let i=0;i<300;i++){
        a.trigger('shot');expect(a.focus).toBe(1);expect(a.earLeftX).toBeCloseTo(-.48);
        a.update(1/120,18,0,false);
    }
    a.reset();a.trigger('reflect');a.update(.05,0,0,false);const head=a.headX;
    a.trigger('reflect');expect(a.headX).toBe(head);
    a.update(.1,0,0,false);a.update(.1,0,0,false);a.update(.04,0,0,false);a.trigger('reflect');expect(a.headX).toBeGreaterThan(head);
});
it('uses the same elapsed-time reaction decay at 30, 60 and 120Hz',()=>{
    const samples=[30,60,120].map(hz=>{
        const a=new RatActing('same');
        a.trigger('shot');a.trigger('hit',1,-1);a.trigger('case-loss');a.trigger('delivery');
        for(let i=0;i<hz*.2;i++)a.update(1/hz,7,0,true);
        return values(a);
    });
    for(const row of samples.slice(1))row.forEach((v,i)=>expect(v).toBeCloseTo(samples[0][i],10));
});
it('cancels seeded idle acting immediately on activity and does not consume gameplay randomness',()=>{
    const random=vi.spyOn(Math,'random'),a=new RatActing('one'),b=new RatActing('another');
    let differs=false,looks=0;
    for(let i=0;i<1500;i++){
        a.update(1/60,0,0,false);b.update(1/60,0,0,false);
        if(Math.abs(a.headY)>.01)looks++;
        if(Math.abs(a.headY-b.headY)>.01)differs=true;
    }
    expect(looks).toBeGreaterThan(20);expect(looks).toBeLessThan(360);expect(differs).toBe(true);
    a.update(1/60,18,0,false);expect(a.headY).toBe(0);
    expect(a.blinkOffset).not.toBe(b.blinkOffset);expect(random).not.toHaveBeenCalled();random.mockRestore();
});
it('arms a single scaled landing, rejects short descent noise, and clears flight on rebase',()=>{
    const a=new RatActing('test');
    for(let i=0;i<30;i++){a.update(1/60,0,-3,false);a.update(1/60,0,0,false);}
    expect(a.headX).toBe(0);
    a.trigger('launch');expect(a.launchFlight).toBe(true);
    for(let i=0;i<20;i++)a.update(1/60,0,-30,false);
    a.update(1/60,0,0,false);expect(a.headX).toBeGreaterThan(.04);expect(a.launchFlight).toBe(false);
    for(let i=0;i<60;i++)a.update(1/60,0,0,false);
    expect(a.headX).toBe(0);
    a.trigger('launch');a.trigger('shot');a.resetMotion();
    expect(a.launchFlight).toBe(false);expect(a.focus).toBe(1);expect(a.earLeftX).toBeCloseTo(-.48);
    a.reset();expect(Math.max(...values(a).map(Math.abs))).toBe(0);
});
it('preserves approved movement and immediate weapon trajectories through every new acting event',()=>{
    const root=createRatMesh(),old=createRatMesh(),a=new RatAnimator(root),b=new MovementRatAnimator(old);
    const target=new THREE.Vector3(9,3,20);
    try{
        for(let frame=0;frame<240;frame++){
            for(const model of [root,old]){model.position.z+=frame<100?.1:0;model.rotation.y+=.02;}
            if(frame%12===0)a.playReaction(RAT_REACTIONS[(frame/12)%RAT_REACTIONS.length]);
            if(frame%5===0){a.shoot(target);b.shoot(target);}
            a.update(1/60);b.update(1/60);
            root.updateMatrixWorld(true);old.updateMatrixWorld(true);
            for(const name of ['rat-body','rat-arm','rat-pistol','rat-muzzle','rat-gun-shoulder','rat-carry-anchor']){
                const actual=root.getObjectByName(name)!.matrixWorld.elements,expected=old.getObjectByName(name)!.matrixWorld.elements;
                actual.forEach((v,i)=>expect(Math.abs(v-expected[i])).toBeLessThan(1e-9));
            }
        }
    }finally{disposeMeshResources(root);disposeMeshResources(old);}
});
it('keeps high-launch acting at 30Hz, clears correction/reset cues, and matches the outline for all events',()=>{
    const root=createRatMesh(),outline=createRatMesh(),a=new RatAnimator(root,outline);
    const ear=root.getObjectByName('rat-ear-left')!;
    try{
        a.update(1/30);a.playReaction('launch');root.position.y+=3;a.update(1/30);
        expect(ear.rotation.x).toBeLessThan(-.1);
        root.position.y+=100;a.update(1/30);expect(ear.rotation.x).toBe(0);
        for(const event of RAT_REACTIONS){
            a.playReaction(event);
            for(const dt of [1/120,1/30,.08,0,NaN]){
                a.update(dt);
                for(const name of ['rat-head','rat-hat','rat-ear-left','rat-ear-right','rat-eye-left','rat-eye-right']){
                    const part=root.getObjectByName(name)!,shell=outline.getObjectByName(name)!;
                    expect(part.position.toArray()).toEqual(shell.position.toArray());
                    expect(part.quaternion.toArray()).toEqual(shell.quaternion.toArray());
                    expect(part.scale.toArray()).toEqual(shell.scale.toArray());
                    expect(part.quaternion.toArray().every(Number.isFinite)).toBe(true);
                }
            }
        }
        a.resetReactions();a.update(1/120);expect(ear.rotation.x).toBe(0);
        a.playReaction('shot');a.poseDeath(.2,1/60,{x:1,y:2,z:0},.4,false);
        a.reset();a.update(1/120);expect(ear.rotation.x).toBe(0);
    }finally{disposeMeshResources(root);disposeMeshResources(outline);}
});
it.each([false,true])('runs all 15 studio studies with an exact rigid case grip and unchanged physics (opponent=%s)',remote=>{
    for(const [id] of CHARACTER_STUDIES){
        const scene=new THREE.Scene(),world=new C.World();
        const s=new OutfitStudioSubject(scene,world,new THREE.PerspectiveCamera(),DEFAULT_APPEARANCE,new THREE.Vector3(),remote,'none');
        const study=new CharacterReactionStudy(id,s),body=s.rat.body.position.clone();
        try{
            s.rat.presentAlive(1/60,0);
            for(let i=0;i<Math.ceil(study.duration*30);i++){
                study.update(1/30);s.rat.mesh.position.y=study.height;s.rat.mesh.rotation.y=study.yaw;
                s.rat.presentAlive(1/30,study.speed);s.updateCarry();scene.updateMatrixWorld(true);
                expect(s.rat.body.position).toEqual(body);
                for(const name of ['rat-head','rat-hat','rat-ear-left','rat-ear-right']){
                    const part=s.rat.mesh.getObjectByName(name)!;
                    expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true);
                }
                if(s.caseRoot.visible){
                    const hand=s.rat.mesh.getObjectByName('case-sleeve-grip')!.getWorldPosition(new THREE.Vector3());
                    const grip=s.caseRoot.getObjectByName('case-handle-grip')!.getWorldPosition(new THREE.Vector3());
                    expect(hand.distanceTo(grip)).toBeLessThan(1e-6);
                    expect(s.caseRoot.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))).toBeLessThan(1e-6);
                }else expect(s.rat.mesh.getObjectByName('hot-case-off-hand')).toBeUndefined();
            }
        }finally{s.dispose();}
        expect(scene.children).toHaveLength(0);expect(world.bodies).toHaveLength(0);
    }
});

// Freeze the rejected subtle pass so a nominally "larger" tuning cannot regress
// to changes that differ numerically but remain imperceptible.
const angularExcursion=(a:{headX:number;headY:number;headZ:number;hatX:number;hatZ:number;earLeftX:number;earLeftZ:number})=>
    Math.max(...[a.headX,a.headY,a.headZ,a.hatX,a.hatZ,a.earLeftX,a.earLeftZ].map(Math.abs));
it.each(RAT_REACTIONS)('makes %s at least three times larger than the subtle pass and holds a readable pose',event=>{
    const a=new RatActing('compare'),b=new SubtleRatActing('compare');
    a.trigger(event,1,1);b.trigger(event,1,1);
    let peak=0,oldPeak=0,readableFrames=0;
    for(let i=0;i<120;i++){
        a.update(1/120,7,0,false);b.update(1/120,7,0,false);
        peak=Math.max(peak,angularExcursion(a));oldPeak=Math.max(oldPeak,angularExcursion(b));
        if(angularExcursion(a)>.12)readableFrames++;
    }
    expect(peak).toBeGreaterThan(oldPeak*3);
    expect(readableFrames/120).toBeGreaterThan(.18);
});
it.each(['air','hustle','idle'])('makes sustained %s acting at least three times larger',mode=>{
    const a=new RatActing('compare'),b=new SubtleRatActing('compare');let peak=0,oldPeak=0;
    for(let i=0;i<900;i++){
        for(const acting of [a,b])acting.update(1/60,mode==='hustle'?18:0,mode==='air'?-6:0,mode==='hustle');
        peak=Math.max(peak,angularExcursion(a));oldPeak=Math.max(oldPeak,angularExcursion(b));
    }
    expect(peak).toBeGreaterThan(oldPeak*3);
});
