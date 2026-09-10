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

it('uses the rat room and floor, explicit fixture power, and the same four lights across transitions',async()=>{
 const {interiorFixtures,LIGHT_ROOMS}=await import('../../src/prototype/InteriorLighting');
 const fixtures=interiorFixtures(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const pool=new StreetLightPool(scene,[{x:-50,y:9,z:-59,color:0xffffff,intensity:180},...fixtures],LIGHT_ROOMS);
 const lights=scene.children.filter((o):o is THREE.SpotLight=>o instanceof THREE.SpotLight);
 camera.position.set(-52,12,-59); // Camera outside, rat inside the ground-floor west aisle.
 pool.update(camera,{x:-38,y:.3,z:-58});
 expect(lights.filter(l=>l.intensity>0).every(l=>l.position.y===5.8&&l.intensity<=75)).toBe(true);
 expect(lights[0].intensity).toBe(75);
 pool.update(camera,{x:-38,y:8.3,z:-74});
 expect(lights.filter(l=>l.intensity>0).every(l=>l.position.y===13.8&&l.intensity<=75)).toBe(true);
 pool.update(camera,{x:65,y:-6.7,z:-35});
 expect(lights.filter(l=>l.intensity>0)).toHaveLength(2);expect(lights[0].position.y).toBe(-2.2);
 pool.update(camera,{x:55,y:-6.7,z:-35});expect(lights.every(l=>l.intensity===0)).toBe(true);
 expect(scene.children.filter(o=>o instanceof THREE.SpotLight)).toHaveLength(4);pool.dispose();
});
