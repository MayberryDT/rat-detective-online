import {afterEach,describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CASE_SPAWNS,CASE_LOOSE_SCALE,CASE_SIZE} from '../../src/shared/chaosState';
import {CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
afterEach(()=>vi.restoreAllMocks());
describe('Hot Case citywide spawns in actual playable geometry',()=>{
 it('varies initial/reset/recovery sites on supported clear pavement with oversized case clearance',()=>{
  let sample=0;vi.spyOn(Math,'random').mockImplementation(()=>((sample++*7)%23)/23);
  const sim=new ChaosSimulation(new Map(),()=>{},undefined,{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
  const seen=new Set<string>();let previous='';
  for(let i=0;i<24;i++){
   const p=sim.caseBody.position,key=`${p.x},${p.z}`;
   expect(CASE_SPAWNS.some(s=>s.x===p.x&&s.z===p.z)).toBe(true);
   expect(key).not.toBe(previous);previous=key;seen.add(key);
   for(const dx of [-CASE_SIZE.x*CASE_LOOSE_SCALE/2,0,CASE_SIZE.x*CASE_LOOSE_SCALE/2]){
    for(const dz of [-CASE_SIZE.z*CASE_LOOSE_SCALE/2,0,CASE_SIZE.z*CASE_LOOSE_SCALE/2]){
     const hit=new C.RaycastResult();sim.world.raycastClosest(new C.Vec3(p.x+dx,.1,p.z+dz),new C.Vec3(p.x+dx,-.4,p.z+dz),{collisionFilterMask:1},hit);
     expect(hit.hasHit).toBe(true);
    }
   }
   for(const [body,target] of sim.targets){
    if(target.kind!=='world')continue;body.updateAABB();const a=body.aabb.lowerBound,b=body.aabb.upperBound;
    const overlaps=b.y>.05&&a.y<1.95&&b.x>p.x-.82&&a.x<p.x+.82&&b.z>p.z-.34&&a.z<p.z+.34;
    expect(overlaps).toBe(false);
   }
   if(i===12){sim.caseBody.position.y=-30;sim.step(0,Date.now());sim.step(0,Date.now()+1000);}
   else sim.reset();
  }
  expect(seen.size).toBeGreaterThanOrEqual(5);
  const xs=[...seen].map(k=>Number(k.split(',')[0])),zs=[...seen].map(k=>Number(k.split(',')[1]));
  expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThan(200);
  expect(Math.max(...zs)-Math.min(...zs)).toBeGreaterThan(100);
 });
});
