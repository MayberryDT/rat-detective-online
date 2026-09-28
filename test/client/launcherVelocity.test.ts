import * as C from 'cannon-es';
import {describe,it,expect} from 'vitest';
import {launcherVelocity,LAUNCH_DRIFT_DECAY,OVERPRESSURE} from '../../src/shared/launcherVelocity';
import {LAUNCH_MACHINES,MAX_LAUNCH_SPEED} from '../../src/shared/chaosState';
import {CITY_BOUNDS} from '../../src/shared/grayboxLayout';
import {MOVEMENT_ENVELOPE} from '../../src/worker/validation';

// Extreme and middle draws for the lift, drift and heading rolls.
const DRAWS=[0,.5,.999999];
const throws=function*(){
 for(const machine of LAUNCH_MACHINES)for(const boost of [false,true])
  for(const a of DRAWS)for(const b of DRAWS)for(const c of DRAWS){
   const rolls=[a,b,c];let i=0;
   yield {machine,boost,v:launcherVelocity(machine,boost,()=>rolls[i++%3])};
  }
};
/** Unsteered flight: server gravity and flight damping, with drift fading like the rat's steering. */
const fly=(v:{x:number;y:number;z:number},from:{x:number;z:number})=>{
 const world=new C.World({gravity:new C.Vec3(0,-25,0)}),body=new C.Body({mass:5,linearDamping:.1,position:new C.Vec3(from.x,0,from.z)});
 world.addBody(body);body.velocity.set(v.x,v.y,v.z);
 let peak=0,dx=v.x,dz=v.z;
 for(let i=0;i<60*20&&(i<10||body.position.y>0);i++){
  const fade=Math.exp(-LAUNCH_DRIFT_DECAY/60);dx*=fade;dz*=fade;
  body.velocity.x+=(dx-body.velocity.x)*.28;body.velocity.z+=(dz-body.velocity.z)*.28;
  world.step(1/60);peak=Math.max(peak,body.position.y);
 }
 return {peak,x:body.position.x,z:body.position.z};
};

describe('launcher throws',()=>{
 it('never exceed the snapshot limit or the movement envelope, even with full steering on top',()=>{
  for(const {v} of throws()){
   for(const c of [v.x,v.y,v.z])expect(Math.abs(c)).toBeLessThanOrEqual(MAX_LAUNCH_SPEED);
   expect(v.y).toBeLessThanOrEqual(MOVEMENT_ENVELOPE.verticalSpeed);
   expect(Math.hypot(v.x,v.z)+18*1.45).toBeLessThanOrEqual(MOVEMENT_ENVELOPE.thrownHorizontalSpeed);
  }
 });
 it('land an unsteered rat inside the city from every pad',()=>{
  for(const {machine,v} of throws()){
   const end=fly(v,machine.pad);
   for(const c of [end.x,end.z]){
    expect(c,machine.id).toBeGreaterThan(CITY_BOUNDS.min+3);expect(c,machine.id).toBeLessThan(CITY_BOUNDS.max-3);
   }
  }
 });
 it('always clear the tallest landmark roofs so launcher routes still reach them',()=>{
  for(const {machine,v} of throws())expect(fly(v,machine.pad).peak,machine.id).toBeGreaterThan(45);
 });
 it('make an overpressure misfire higher than any ordinary throw of the same machine',()=>{
  for(const machine of LAUNCH_MACHINES){
   const ordinary=Math.max(...DRAWS.map(r=>launcherVelocity(machine,false,()=>r).y));
   expect(launcherVelocity(machine,true,()=>0).y).toBeGreaterThan(ordinary);
  }
  expect(OVERPRESSURE.chance).toBeGreaterThan(0);expect(OVERPRESSURE.chance).toBeLessThan(.5);
 });
 it('varies the throw between riders instead of repeating one straight-up arc',()=>{
  for(const machine of LAUNCH_MACHINES){
   const seen=new Set(DRAWS.map(r=>JSON.stringify(launcherVelocity(machine,false,()=>r))));
   expect(seen.size,machine.id).toBeGreaterThan(1);
  }
 });
});
