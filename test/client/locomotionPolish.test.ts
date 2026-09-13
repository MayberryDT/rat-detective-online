import {expect,it} from 'vitest';
import * as THREE from 'three';
import {RatAnimator} from '../../src/utils/RatAnimator';
import {RatLocomotionFollowThrough} from '../../src/utils/RatLocomotionFollowThrough';
import {createRatMesh} from '../../src/utils/RatModel';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';
import {AcceptedRatAnimator} from '../visual/reference/AcceptedRatAnimator';
import {locomotionStudy} from '../visual/locomotionStudy';

it('produces one signed start/stop accent and lets the tail settle last',()=>{
    const motion=new RatLocomotionFollowThrough();
    for(let i=0;i<60;i++)motion.update(1/60,18,0);
    let previous=0,peaks=0,falling=false;
    for(let i=0;i<120;i++){
        motion.update(1/60,0,0);
        expect(motion.startStop).toBeLessThanOrEqual(0);
        const amplitude=-motion.startStop;
        if(amplitude<previous&&!falling){peaks++;falling=true;}
        if(falling)expect(amplitude).toBeLessThanOrEqual(previous);
        if(i===17){expect(amplitude).toBeLessThan(.05);expect(motion.tailMovement).toBeGreaterThan(.2);}
        previous=amplitude;
    }
    expect(peaks).toBe(1);expect(motion.tailMovement).toBeLessThan(.0001);
    motion.reset();motion.update(.1,18,6);
    expect(motion.startStop).toBeGreaterThan(.2);expect(motion.turn).toBeGreaterThan(.2);
});

it('settles identically at 30/60/120Hz for the same elapsed movement and turns',()=>{
    const samples=[30,60,120].map(hz=>{
        const motion=new RatLocomotionFollowThrough(),result:number[][]=[];
        for(const [seconds,speed,turn] of [[.3,18,6],[.4,18,0],[.2,0,-6],[.5,0,0]]){
            for(let i=0;i<Math.round(seconds*hz);i++)motion.update(1/hz,speed,turn);
            result.push([motion.startStop,motion.turn,motion.hatTurn,motion.tailMovement,motion.tailTurn]);
        }
        return result;
    });
    for(const result of samples.slice(1))result.forEach((row,i)=>row.forEach((value,j)=>expect(value).toBeCloseTo(samples[0][i][j],12)));
});

it.each([false,true])('preserves frozen accepted muzzle/weapon/carry trajectories and immediate repeated shots (polish=%s)',polished=>{
    const root=createRatMesh(),reference=createRatMesh();
    const animator=new RatAnimator(root),accepted=new AcceptedRatAnimator(reference);
    animator.setLocomotionPolish(polished);
    const position=new THREE.Vector3(),other=new THREE.Vector3();
    const verify=()=>{
        root.updateMatrixWorld(true);reference.updateMatrixWorld(true);
        const names=polished?['rat-body','rat-arm','rat-pistol','rat-muzzle','rat-gun-shoulder','rat-sleeve-grip','rat-carry-anchor']:
            ['rat-body','rat-head','rat-hat','rat-ear-left','rat-ear-right','rat-tail','rat-arm','rat-pistol','rat-muzzle','rat-carry-anchor'];
        for(const name of names){
            const a=root.getObjectByName(name)!,b=reference.getObjectByName(name)!;
            expect(a.getWorldPosition(position).distanceTo(b.getWorldPosition(other))).toBeLessThan(1e-9);
            // Compare the full affine transform: coat nonuniform scale can make
            // getWorldQuaternion's decomposed rotation non-unit under shear.
            a.matrixWorld.elements.forEach((value,i)=>expect(Math.abs(value-b.matrixWorld.elements[i])).toBeLessThan(1e-9));
        }
    };
    try{
        for(let frame=0;frame<240;frame++){
            const dt=[1/30,1/60,1/120,.08][frame%4];
            for(const model of [root,reference]){
                model.position.z+=frame<70||frame>130?dt*7:0;
                model.position.y=frame>160&&frame<180?(frame-160)*.1:0;
                model.rotation.y+=frame<100?dt*5:-dt*3;
            }
            animator.update(dt);accepted.update(dt);verify();
            if(frame%3===0){
                const target=new THREE.Vector3(8,frame%2?15:-3,20);
                animator.shoot(target);accepted.shoot(target);verify();
                expect(root.getObjectByName('rat-muzzle-flash')!.visible).toBe(true);
            }
        }
        animator.reset();accepted.reset();verify();
    }finally{disposeMeshResources(root);disposeMeshResources(reference);}
});

it('keeps secondary transforms finite, bounded and identical across visible/outline rigs under irregular dt',()=>{
    const root=createRatMesh(),outline=createRatMesh(),animator=new RatAnimator(root,outline);
    const hatRest=root.getObjectByName('rat-hat')!.rotation.clone();
    try{
        for(let frame=0;frame<360;frame++){
            const dt=[1/120,1/30,.1,.7,0,-1,NaN][frame%7];
            root.rotation.y+=frame%2?.3:-.3;
            root.position.z+=frame%10<5?.1:0;
            animator.update(dt);
            for(const name of ['rat-head','rat-hat','rat-ear-left','rat-ear-right','rat-tail']){
                const a=root.getObjectByName(name)!,b=outline.getObjectByName(name)!;
                expect(a.position.toArray().every(Number.isFinite)).toBe(true);
                expect(a.rotation.toArray().slice(0,3).every(Number.isFinite)).toBe(true);
                expect(a.position.toArray()).toEqual(b.position.toArray());
                expect(a.rotation.toArray()).toEqual(b.rotation.toArray());
            }
            const hat=root.getObjectByName('rat-hat')!;
            expect(Math.abs(hat.rotation.x-hatRest.x)).toBeLessThan(.55);
            expect(Math.abs(hat.rotation.y-hatRest.y)).toBeLessThan(.25);
            expect(Math.abs(hat.rotation.z-hatRest.z)).toBeLessThan(.5);
        }
    }finally{disposeMeshResources(root);disposeMeshResources(outline);}
});

it('clears follow-through on correction, motion rebase, death and respawn without erasing shot cues',()=>{
    const root=createRatMesh(),animator=new RatAnimator(root);
    // Isolate the approved movement pass; the later acting pass intentionally
    // retains a shot's ear accent across a motion rebase (covered separately).
    animator.setActingEnabled(false);
    const ear=root.getObjectByName('rat-ear-left')!;
    const run=()=>{
        animator.update(1/60);
        for(let i=0;i<6;i++){root.position.z+=.2;root.rotation.y+=.1;animator.update(1/60);}
        expect(Math.abs(ear.rotation.x)).toBeGreaterThan(.01);
    };
    try{
        run();root.position.x+=100;animator.update(1/60);
        expect(ear.rotation.x).toBe(0);
        run();animator.shoot();animator.resetMotionHistory();animator.update(1/60);
        expect(ear.rotation.x).toBe(0);expect(root.getObjectByName('rat-muzzle-flash')!.visible).toBe(true);
        run();animator.poseDeath(.2,1/60,{x:1,y:2,z:0},.4,false);
        expect(ear.rotation.x).toBe(0);
        animator.reset();animator.update(1/60);expect(ear.rotation.x).toBe(0);
        expect(root.getObjectByName('rat-muzzle-flash')!.visible).toBe(false);
    }finally{disposeMeshResources(root);}
});

it('provides a repeatable studio sequence with two starts/stops and continuous opposite turns',()=>{
    expect(locomotionStudy(.3).speed).toBe(0);
    expect(locomotionStudy(.9).speed).toBe(18);
    expect(locomotionStudy(2.8).speed).toBe(0);
    expect(locomotionStudy(3.8).speed).toBe(18);
    expect(locomotionStudy(5.8).speed).toBe(0);
    let yaw=0;
    for(let i=0;i<=780;i++){
        const pose=locomotionStudy(i/120);
        expect(Math.abs(pose.yaw-yaw)).toBeLessThan(.045);yaw=pose.yaw;
    }
    expect(locomotionStudy(0)).toEqual(locomotionStudy(6.5));
});
