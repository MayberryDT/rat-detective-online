import * as THREE from 'three';
import {expect,it} from 'vitest';
import {StreetLightPool} from '../../src/prototype/StreetLightPool';
import {readLightingMode} from '../../src/session/lightingMode';
import {addLeatherBriefcase} from '../../src/prototype/CaseModel';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';

it('bounds overhead lighting, aligns it with actual fixtures, fades distant lights and disables it underground',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const pool=new StreetLightPool(scene,Array.from({length:100},(_,i)=>({x:i*8,y:6.2,z:0,color:0xffcf96})));
 const lights=scene.children.filter((o):o is THREE.SpotLight=>o instanceof THREE.SpotLight);
 expect(lights).toHaveLength(4);expect(lights.every(l=>!l.castShadow)).toBe(true);
 camera.position.set(1,3,0);pool.update(camera);
 expect(lights[0].position.toArray()).toEqual([0,6.2,0]);expect(lights[0].intensity).toBe(45);
 expect(lights[0].target.position.y).toBeLessThan(lights[0].position.y);
 expect(lights.at(-1)!.intensity).toBeLessThan(45);
 camera.position.y=-3;pool.update(camera);expect(lights.every(l=>l.intensity===0)).toBe(true);
 camera.position.set(0,20,0);pool.update(camera);expect(lights.every(l=>l.intensity===0)).toBe(true);
 pool.dispose();expect(scene.children).toHaveLength(0);
});
it('makes the lighting trial reversible with a local query option',()=>{
 expect(readLightingMode('')).toBe('pools');expect(readLightingMode('?lighting=classic')).toBe('classic');
 expect(readLightingMode('?lighting=unknown')).toBe('pools');
});
it('bounds the eight-case material draw budget while preserving the shell and real handle geometry',()=>{
 const root=new THREE.Group();addLeatherBriefcase(root);root.updateMatrixWorld(true);
 expect(root.children.filter(o=>o instanceof THREE.Mesh)).toHaveLength(9);
 expect(root.getObjectByName('leather-case-shell')).toBeDefined();
 const ray=new THREE.Raycaster(new THREE.Vector3(0,.43,2),new THREE.Vector3(0,0,-1));
 expect(ray.intersectObject(root,true).length).toBeGreaterThan(0);
 const bounds=new THREE.Box3().setFromObject(root);expect(bounds.max.y).toBeGreaterThan(.46);
 disposeMeshResources(root);
});
