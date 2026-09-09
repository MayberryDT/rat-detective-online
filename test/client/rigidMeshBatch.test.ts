import {it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createRatMesh} from '../../src/utils/RatModel';
import {RatAnimator} from '../../src/utils/RatAnimator';
import {batchRigidMeshes} from '../../src/utils/RigidMeshBatch';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';
it('preserves every rigid vertex through walking, aiming, blinking and death poses',()=>{
 const root=createRatMesh(),animator=new RatAnimator(root),batch=batchRigidMeshes(root)!;
 const sources=batch.userData.rigidSources as THREE.Mesh[];
 expect(batch.geometry.groups.length).toBeLessThan(sources.length/2);
 const before=new THREE.Vector3(),after=new THREE.Vector3();let worst=0;
 for(let frame=0;frame<330;frame++){
  root.position.set(frame*.01,frame>100&&frame<130?1:0,-4);root.rotation.y=frame*.01;
  if(frame===60)animator.shoot(new THREE.Vector3(5,3,9));
  if(frame>300)animator.poseDeath((frame-300)/60,1/60,{x:1,y:2,z:3},.4,true);else animator.update(1/60);
  root.updateMatrixWorld(true);batch.skeleton.update();
  if(frame%15)continue;
  let vertex=0;
  for(const source of sources){const p=source.geometry.getAttribute('position');for(let i=0;i<p.count;i++,vertex++){
   before.fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);
   batch.getVertexPosition(vertex,after);expect(batch.boundingSphere!.containsPoint(after)).toBe(true);after.applyMatrix4(batch.matrixWorld);
   worst=Math.max(worst,before.distanceTo(after));
  }}
 }
 expect(worst).toBeLessThan(1e-5);
 expect(root.getObjectByName('rat-tail')!.visible).toBe(true);
 expect(root.getObjectByName('rat-muzzle')).toBeDefined();
 const dispose=vi.spyOn(batch.skeleton,'dispose');disposeMeshResources(root);expect(dispose).toHaveBeenCalledOnce();
});
it('keeps original ray hits and does not batch transient or excluded shell geometry',()=>{
 const root=createRatMesh();root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,1,5),new THREE.Vector3(0,0,-1));
 const original=ray.intersectObject(root,true).map(hit=>({object:hit.object,distance:hit.distance}));
 const batch=batchRigidMeshes(root)!;root.updateMatrixWorld(true);
 const after=ray.intersectObject(root,true).map(hit=>({object:hit.object,distance:hit.distance}));
 expect(after).toEqual(original);expect(batch.castShadow).toBe(true);
 disposeMeshResources(root);
});
