import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {CorpseRigPool} from '../../src/prototype/CorpseRigPool';
import {createRatMesh} from '../../src/utils/RatModel';
import {RatAnimator} from '../../src/utils/RatAnimator';
import {disposeMeshResources} from '../../src/utils/disposeMeshResources';

const appearance={hatType:'fedora' as const,hatColor:0x603050,coatColor:0x334466,furColor:0xaa9977};
describe('bounded reusable authored corpse rigs',()=>{
 it('reuses an owned rig with fresh colors and exactly the fresh death pose',()=>{
  const pool=new CorpseRigPool(1);pool.prewarm(appearance,1);
  const first=pool.acquire(appearance);first.mesh.position.set(9,4,-2);first.mesh.scale.set(2,.5,3);first.mesh.rotation.set(.3,.4,.5);
  for(let frame=0;frame<30;frame++)first.animator.poseDeath(frame/60,1/60,{x:9,y:2,z:-3},.4,false);
  pool.release(first);pool.release(first);
  const nextAppearance={...appearance,hatColor:0x123456,coatColor:0xabcdef,furColor:0x997755};
  const actual=pool.acquire(nextAppearance);expect(actual).toBe(first);
  expect(actual.mesh.position.toArray()).toEqual([0,0,0]);expect(actual.mesh.scale.toArray()).toEqual([1,1,1]);
  const expected=createRatMesh(nextAppearance),animator=new RatAnimator(expected);
  for(let frame=0;frame<20;frame++){
   actual.animator.poseDeath(frame/60,1/60,{x:1,y:2,z:3},.2,false);animator.poseDeath(frame/60,1/60,{x:1,y:2,z:3},.2,false);
  }
  actual.mesh.updateMatrixWorld(true);expected.updateMatrixWorld(true);
  // Original source meshes remain in their original hierarchy and keep picking
  // identities. Compare their world vertices to an independently created rig.
  const originals:THREE.Mesh[]=[];expected.traverse(o=>{if(o instanceof THREE.Mesh)originals.push(o);});
  const sources:THREE.Mesh[]=[];actual.mesh.traverse(o=>{if(o instanceof THREE.Mesh&&!(o instanceof THREE.SkinnedMesh))sources.push(o);});
  expect(sources).toHaveLength(originals.length);
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(let mesh=0;mesh<sources.length;mesh++){
   const source=sources[mesh],fresh=originals[mesh];
   const p=source.geometry.getAttribute('position'),q=fresh.geometry.getAttribute('position');expect(p.count).toBe(q.count);
   for(let i=0;i<p.count;i++){
    a.fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);b.fromBufferAttribute(q,i).applyMatrix4(fresh.matrixWorld);
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
   }
   expect((source.material as THREE.MeshStandardMaterial).color).toEqual((fresh.material as THREE.MeshStandardMaterial).color);
  }
  expect(pool.diagnostics().created).toBe(1);disposeMeshResources(expected);pool.dispose();
 });
 it('projects the death tail from one immutable per-vertex curve sample',()=>{
  // The death contact projection used to re-evaluate the tube curve at every
  // vertex on every display frame. The cached samples must stay identical.
  const mesh=createRatMesh(appearance),animator=new RatAnimator(mesh);
  const tail=mesh.getObjectByName('rat-tail') as THREE.Mesh<THREE.TubeGeometry>;
  const positions=tail.geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv=tail.geometry.getAttribute('uv');
  const curve=(animator as unknown as {tails:Array<{curve:Float64Array}>}).tails[0].curve;
  expect(curve.length).toBe(positions.count*3);
  const point=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){
   tail.geometry.parameters.path.getPointAt(uv.getX(i),point);
   // A 64-bit cache is bit-identical to the authored curve sample it replaces.
   expect(curve[i*3]).toBe(point.x);
   expect(curve[i*3+1]).toBe(point.y);
   expect(curve[i*3+2]).toBe(point.z);
  }
  disposeMeshResources(mesh);
 });
 it('covers all hats without unbounded growth, duplicate release or cross-rig disposal',()=>{
  const pool=new CorpseRigPool(2);
  for(const hatType of ['fedora','trilby','porkpie'] as const)pool.prewarm({...appearance,hatType},2);
  expect(pool.diagnostics()).toMatchObject({retained:6,maxRetained:6,active:0});
  const geometryDisposals:ReturnType<typeof vi.spyOn>[]=[];
  for(const rig of pool.preparedRigs()){
   const batch=rig.mesh.getObjectByName('rat-rigid-batch') as THREE.SkinnedMesh;
   geometryDisposals.push(vi.spyOn(batch.geometry,'dispose'));
  }
  for(let cycle=0;cycle<20;cycle++)for(const hatType of ['fedora','trilby','porkpie'] as const){
   const a=pool.acquire({...appearance,hatType}),b=pool.acquire({...appearance,hatType});
   expect(()=>pool.acquire({...appearance,hatType})).toThrow('capacity');
   pool.release(a);pool.release(b);
  }
  expect(pool.diagnostics().created).toBe(6);
  for(const dispose of geometryDisposals)expect(dispose).not.toHaveBeenCalled();
  pool.dispose();pool.dispose();for(const dispose of geometryDisposals)expect(dispose).toHaveBeenCalledOnce();
  expect(pool.diagnostics()).toMatchObject({active:0,retained:0});
 });
});
