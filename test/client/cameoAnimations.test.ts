import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createCameoRat} from '../visual/cameos/CameoRatModel';
import {CameoAnimator,CAMEO_DURATIONS,type CameoReaction} from '../visual/cameos/CameoAnimator';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';

function transforms(root:THREE.Object3D){
    const result:number[]=[];
    root.traverse(node=>{node.position.toArray(result,result.length);node.quaternion.toArray(result,result.length);node.scale.toArray(result,result.length);if(node instanceof THREE.Mesh&&node.morphTargetInfluences)result.push(...node.morphTargetInfluences);});
    return result;
}

it.each(['spider','bat'] as const)('preserves the accepted resting model and returns cleanly after every %s reaction',kind=>{
    const root=createCameoRat(kind),animator=new CameoAnimator(root,kind),rest=transforms(root);
    const box=new THREE.Box3().setFromObject(root);
    expect(box.min.y).toBeCloseTo(0,5);
    expect(box.max.y).toBeCloseTo(kind==='spider'?2.01675879:2.36876071,5);
    const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    root.traverse(node=>{if(node instanceof THREE.Mesh){geometry.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
    for(const reaction of ['idle','passerby','shot'] as const){
        for(let i=0;i<=240;i++){
            animator.sample(reaction,CAMEO_DURATIONS[reaction]*i/240);
            expect(transforms(root).every(Number.isFinite)).toBe(true);
            const bounds=new THREE.Box3().setFromObject(root);
            expect(bounds.min.y).toBeGreaterThan(-.08);
            expect(bounds.max.y).toBeLessThan(3.2);
            expect(bounds.getSize(new THREE.Vector3()).length()).toBeLessThan(5);
        }
        animator.reset();expect(transforms(root)).toEqual(rest);
    }
    let geometryDisposals=0,materialDisposals=0;
    geometry.forEach(value=>value.addEventListener('dispose',()=>geometryDisposals++));
    materials.forEach(value=>value.addEventListener('dispose',()=>materialDisposals++));
    disposeMeshResources(root);
    expect(geometryDisposals).toBe(geometry.size);expect(materialDisposals).toBe(materials.size);
});

it.each(['spider','bat'] as const)('makes %s animation seeking and interruptions independent of prior frames and placement',kind=>{
    const root=createCameoRat(kind),animator=new CameoAnimator(root,kind);
    root.position.set(30,36,-48);root.rotation.y=.7;root.scale.setScalar(1.3);
    const placement=[...root.position.toArray(),...root.quaternion.toArray(),...root.scale.toArray()];
    animator.sample('shot',2.5);const expected=transforms(root);
    for(let i=0;i<150;i++)animator.sample(i%2?'idle':'passerby',i*.05);
    animator.sample('shot',2.5);expect(transforms(root)).toEqual(expected);
    expect([...root.position.toArray(),...root.quaternion.toArray(),...root.scale.toArray()]).toEqual(placement);
    animator.reset();const rest=transforms(root);
    for(const invalid of [NaN,Infinity,-Infinity,-1]){animator.sample('shot',invalid);expect(transforms(root)).toEqual(rest);}
    animator.sample('shot',900);expect(transforms(root)).toEqual(rest);
    disposeMeshResources(root);
});

it.each(['spider','bat'] as const)('exports the same three %s animations that the viewer plays',kind=>{
    const root=createCameoRat(kind),animator=new CameoAnimator(root,kind),rest=transforms(root);
    const clips=animator.clips();
    expect(clips.map(clip=>clip.name)).toEqual([`${kind}-idle`,`${kind}-passerby`,`${kind}-shot`]);
    expect(transforms(root)).toEqual(rest);
    for(const clip of clips){
        expect(clip.validate()).toBe(true);expect(clip.tracks.length).toBeGreaterThan(0);
        const reaction=clip.name.split('-').at(-1) as CameoReaction;
        for(const time of [.4,1.2,2.5,4.3]){
            animator.reset();
            const mixer=new THREE.AnimationMixer(root);
            const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
            mixer.setTime(time);const baked=transforms(root);
            mixer.stopAllAction();mixer.uncacheRoot(root);
            animator.sample(reaction,time);const direct=transforms(root);
            expect(Math.max(...direct.map((value,index)=>Math.abs(value-baked[index])))).toBeLessThan(.00001);
        }
    }
    disposeMeshResources(root);
});

it('turns toward either passerby direction and gives the two shot reactions distinct silhouettes',()=>{
    for(const kind of ['spider','bat'] as const){
        const root=createCameoRat(kind),animator=new CameoAnimator(root,kind);
        animator.sample('passerby',.6,-1);const left=root.getObjectByName('cameo-head')!.rotation.y;
        animator.sample('passerby',.6,1);expect(root.getObjectByName('cameo-head')!.rotation.y).toBeCloseTo(-left);
        animator.sample('shot',1.1);
        if(kind==='bat')expect(root.getObjectByName('cameo-motion')!.scale.y).toBeLessThan(.9);
        else expect(root.getObjectByName('cameo-forearm-left')!.rotation.x).toBeLessThan(-1);
        disposeMeshResources(root);
    }
});

it('keeps the cape open and behind him throughout incoming fire',()=>{
    const root=createCameoRat('bat'),animator=new CameoAnimator(root,'bat');
    const cape=root.getObjectByName('cameo-cape')!,rest=transforms(cape);
    const cloth=root.getObjectByName('scalloped-cape') as THREE.Mesh;
    expect(cloth.geometry.morphAttributes.position??[]).toHaveLength(0);
    for(let i=0;i<=162;i++){
        animator.sample('idle',i/30);
        animator.sample('shot',i/30);
        expect(transforms(cape)).toEqual(rest);
    }
    const shot=animator.clips().find(clip=>clip.name==='bat-shot')!;
    expect(shot.tracks.some(track=>track.name.includes('cape'))).toBe(false);
    disposeMeshResources(root);
});

it.each(['spider','bat'] as const)('keeps the %s asset within its compact geometry and animation budgets',kind=>{
    const root=createCameoRat(kind);
    let bytes=0,vertices=0;
    root.traverse(node=>{if(node instanceof THREE.Mesh){
        const geometry=node.geometry;
        expect(geometry.index).not.toBeNull();
        expect(geometry.getAttribute('uv')).toBeUndefined();
        vertices+=geometry.getAttribute('position').count;
        bytes+=geometry.index!.array.byteLength;
        for(const attribute of Object.values(geometry.attributes) as THREE.BufferAttribute[])bytes+=attribute.array.byteLength;
    }});
    expect(vertices).toBeLessThan(kind==='spider'?14000:8000);
    expect(bytes).toBeLessThan(kind==='spider'?470000:270000);
    const keys=new CameoAnimator(root,kind).clips().reduce((sum,clip)=>sum+clip.tracks.reduce((n,track)=>n+track.times.length,0),0);
    expect(keys).toBeLessThan(2500);
    disposeMeshResources(root);
});
