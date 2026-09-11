import {describe,expect,it} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {BALL_SPEED,BALL_RESTITUTION} from '../../src/shared/ballTuning';

const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(obstacle:'victim'|'wall',ownerOnPath=true,head=false){
 const shooter=createPlayer('shooter','Shooter',appearance,{x:0,y:100,z:ownerOnPath?0:5});
 const victim=createPlayer('victim','Victim',appearance,{x:1.25,y:100,z:0});
 const players=new Map([[shooter.id,shooter]]);if(obstacle==='victim')players.set(victim.id,victim);
 const hits:ChaosHit[]=[],sim=new ChaosSimulation(players,hit=>hits.push(hit),undefined,{version:2,seed:341283204});
 if(obstacle==='wall'){
  const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.1,2,2)),position:new C.Vec3(1.25,100.6,0)});
  sim.world.addBody(body);sim.targets.set(body,{kind:'world'});
 }
 sim.step(0,1000);
 // A returning ordinary shot can cross its owner and the next collider in one step.
 sim.shoot(shooter.id,{shotId:'returning',origin:{x:-1,y:head?101.9:100.6,z:0},direction:{x:1,y:0,z:0}});
 sim.step(1/60,1000+1000/60);
 return {sim,hits,shot:sim.snapshot(false).shots.find(s=>s.id==='returning')};
}
describe('ordinary shot owner exclusion before closest contact',()=>{
 it.each([false,true])('finds the same eligible rat with owner in path, head=%s',head=>{
  const control=fixture('victim',false,head),actual=fixture('victim',true,head);
  expect(control.hits).toHaveLength(1);expect(actual.hits).toEqual(control.hits);
  expect(actual.hits[0]).toMatchObject({owner:'shooter',victim:'victim',damage:head?3:1});
  expect(actual.shot).toBeUndefined();
 });
 it('finds the wall behind the owner and preserves the original bounce result',()=>{
  const control=fixture('wall',false),actual=fixture('wall',true);
  expect(actual.hits).toEqual([]);expect(actual.shot).toEqual(control.shot);
  expect(actual.shot?.v.x).toBe(-BALL_SPEED*BALL_RESTITUTION);
  expect(actual.shot?.wallBounced).toBe(true);
 });
});
