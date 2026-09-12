import { expect, it } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../../src/entities/RatEntity';
import type { HatType } from '../../src/utils/RatModel';

it('keeps the whole rear seam centered and outside the coat through walking, turning and firing',()=>{
    const rat=new RatEntity(new THREE.Scene(),new CANNON.World(),new THREE.Vector3(),'Seam');
    const body=rat.mesh.getObjectByName('rat-coat-body') as THREE.Mesh;
    const tailoring=rat.mesh.getObjectByName('rat-coat-tailoring') as THREE.Mesh;
    const positions=tailoring.geometry.getAttribute('position'),rows=new Map<number,number[]>();
    for(let i=0;i<positions.count;i++){
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
        if(y<.057||y>1.29||z>-.35||Math.abs(x)>.05)continue;
        const xs=rows.get(y)??[];xs.push(x);rows.set(y,xs);
    }
    expect(rows.size).toBeGreaterThan(2);
    for(const xs of rows.values())expect((Math.min(...xs)+Math.max(...xs))/2).toBeCloseTo(0,6);
    const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
    for(let frame=0;frame<90;frame++){
        rat.body.position.z+=.1;rat.mesh.rotation.y=frame*.01;
        if(frame===30)rat.playShootAnimation(new THREE.Vector3(0,2,20));
        rat.update(1/60);rat.mesh.updateWorldMatrix(true,true);
        if(frame%15)continue;
        for(const y of [.06,.15,.279,.4,.65,.95,1.15,1.25]){
            origin.set(0,y,-1).applyMatrix4(body.matrixWorld);
            direction.set(0,0,1).transformDirection(body.matrixWorld);ray.set(origin,direction);
            const coatHit=ray.intersectObject(body,false)[0],seamHit=ray.intersectObject(tailoring,false)[0];
            expect(coatHit).toBeDefined();expect(seamHit).toBeDefined();
            expect(coatHit.distance-seamHit.distance).toBeGreaterThan(.003);
        }
    }
    rat.dispose();
});

it.each<HatType>(['fedora', 'trilby', 'porkpie'])('keeps %s ears above the brim and outside the crown during motion', hatType => {
    const rat = new RatEntity(new THREE.Scene(), new CANNON.World(), new THREE.Vector3(), 'Fit', { hatType });
    const hat = rat.mesh.getObjectByName('rat-hat')!;
    const brim = hat.getObjectByName('hat-brim') as THREE.Mesh;
    const crown = hat.getObjectByName('hat-crown') as THREE.Mesh;
    const ray = new THREE.Raycaster();
    const point = new THREE.Vector3(), direction = new THREE.Vector3();
    const local = new THREE.Vector3();
    const hatInverse = new THREE.Matrix4();
    crown.geometry.computeBoundingBox(); brim.geometry.computeBoundingBox();
    const crownTop = crown.geometry.boundingBox!.max.y + crown.position.y;
    const brimTop = brim.geometry.boundingBox!.max.y;
    let elapsedFrames = 0;
    for (const time of [0, 0.15, 0.5, 5.9]) {
        if (time === 0.15) rat.playShootAnimation(new THREE.Vector3(0, 2, 30));
        for (; elapsedFrames < Math.ceil(time * 60); elapsedFrames++) {
            rat.body.position.z += 0.06;
            rat.update(1 / 60);
        }
        hat.updateWorldMatrix(true, true);
        hatInverse.copy(hat.matrixWorld).invert();
        for (const name of ['rat-ear-left', 'rat-ear-right']) {
            const ear = hat.getObjectByName(name)!;
            ear.traverse(part => {
                if (!(part instanceof THREE.Mesh)) return;
                const positions = part.geometry.getAttribute('position');
                for (let i = 0; i < positions.count; i++) {
                    point.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
                    local.copy(point).applyMatrix4(hatInverse);
                    expect(local.y).toBeGreaterThan(brimTop + 0.004);
                    if (local.y >= crownTop - 0.05) continue;
                    // An inward horizontal ray must meet the near crown surface,
                    // rather than starting inside it or passing through its back face.
                    direction.set(0, local.y, 0).applyMatrix4(hat.matrixWorld).sub(point).normalize();
                    ray.set(point, direction);
                    const hits = ray.intersectObject(crown, false);
                    expect(hits.length).toBeGreaterThan(0);
                    expect(hits[0].distance).toBeGreaterThan(0.006);
                }
            });
        }
        expect(brim.parent).toBe(hat);
    }
    rat.dispose();
});
