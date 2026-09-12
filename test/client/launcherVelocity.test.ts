import * as C from 'cannon-es';
import {describe,it,expect} from 'vitest';
import {launcherVelocity} from '../../src/shared/launcherVelocity';
import {LAUNCH_MACHINES,MAX_LAUNCH_SPEED} from '../../src/shared/chaosState';

describe('vertical launcher impulses',()=>{
 it('sends every pad straight up with its authored vertical force',()=>{
  for(const machine of LAUNCH_MACHINES){
   const v=launcherVelocity(machine);
   expect(v).toEqual({x:0,y:90,z:0});
   expect(v.y).toBeGreaterThan(0);expect(v.y).toBeLessThan(MAX_LAUNCH_SPEED);
   expect(launcherVelocity(machine)).toEqual(v);
  }
 });
});

it('gives all six launchers the same skyscraper-height free-flight arc',()=>{
 const peaks=LAUNCH_MACHINES.map(machine=>{
  const world=new C.World({gravity:new C.Vec3(0,-25,0)}),body=new C.Body({mass:5,linearDamping:.1});world.addBody(body);
  const v=launcherVelocity(machine);body.velocity.set(v.x,v.y,v.z);let peak=0;
  for(let i=0;i<360;i++){world.step(1/60);peak=Math.max(peak,body.position.y);}
  return peak;
 });
 expect(new Set(peaks).size).toBe(1);expect(peaks[0]).toBeGreaterThan(120);expect(peaks[0]).toBeLessThan(135);
});
