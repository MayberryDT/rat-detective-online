import {describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CASE_SIZE,CASE_LOOSE_SCALE,CHAOS_TUNING as T} from '../../src/shared/chaosState';
import {boundedIncidentVelocity,LAUNCH_BOUNDARY_MARGIN} from '../../src/shared/launcherVelocity';
import {createPlayer,applyHit} from '../../src/worker/gameState';
import type {IncidentId} from '../../src/shared/incidentCatalog';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const now=Date.now();
function fixture(incident:IncidentId,apply=false){
 const a=createPlayer('a','A',appearance,{x:-50,y:20,z:0});
 const b=createPlayer('b','B',appearance,{x:0,y:20,z:0});
 const c=createPlayer('c','C',appearance,{x:-3,y:20,z:0});
 const players=new Map([a,b,c].map(p=>[p.id,p])),hits:ChaosHit[]=[];
 let sim=new ChaosSimulation(players,()=>{});sim.step(0,now);
 const saved=sim.snapshot(false);saved.dispatch={phase:'active',incident,started:now,until:now+T.activeMs,serial:1};
 sim=new ChaosSimulation(players,hit=>{hits.push(hit);if(apply){
  const result=applyHit(players,hit.owner,hit.victim,hit.damage,true);
  if(result.killed)sim.death(players.get(hit.victim)!,hit.incoming,hit.owner);
 }},saved);
 return {sim,a,b,c,players,hits};
}
function shoot(sim:ChaosSimulation,id='shot',origin={x:-1,y:20.6,z:0}){sim.shoot('a',{shotId:id,origin,direction:{x:1,y:0,z:0}});}
describe('expanded physical Dispatch incidents',()=>{
 it('keeps directed incident trajectories inside city bounds even beside the outer walls',()=>{
  for(const x of [-184,0,154])for(const z of [-184,0,154])for(const dx of [-38,38])for(const dz of [-38,38]){
   const v=boundedIncidentVelocity({x,y:70,z},{x:dx,y:60,z:dz});
   const flight=(v.y+Math.sqrt(v.y*v.y+50*(72+7)))/25;
   for(const p of [x+v.x*flight,z+v.z*flight]){
    expect(p).toBeGreaterThanOrEqual(-196+LAUNCH_BOUNDARY_MARGIN-1e-8);
    expect(p).toBeLessThanOrEqual(166-LAUNCH_BOUNDARY_MARGIN+1e-8);
   }
  }
 });
 it('launches a surviving ball-hit victim, while lethal hits retain their normal death',()=>{
  const {sim,b,c}=fixture('popcorn-panic',true);c.hp=0;shoot(sim);sim.step(.003,now+3);
  expect(b.hp).toBe(2);expect(sim.snapshot(false).pressure!.launches[0]).toMatchObject({playerId:'b',velocity:{y:60,z:0}});expect(sim.snapshot(false).pressure!.launches[0].velocity.x).toBeGreaterThan(25);
  const lethal=fixture('popcorn-panic',true);lethal.c.hp=0;lethal.b.hp=1;shoot(lethal.sim);lethal.sim.step(.003,now+3);
  expect(lethal.b.hp).toBe(0);expect(lethal.sim.snapshot(false).pressure!.launches).toHaveLength(0);
 });
 it('splits the first wall bounce into three owned balls only once, across restore and later bounces',()=>{
  const {sim,players}=fixture('ricochet-racket');
  const wall=(world:ChaosSimulation,x:number)=>{const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.05,5,5)),position:new C.Vec3(x,30,0)});world.world.addBody(body);world.targets.set(body,{kind:'world'});};
  wall(sim,1);shoot(sim,'bounce',{x:0,y:30,z:0});sim.step(.01,now+10);
  const state=sim.snapshot(false);expect(state.shots).toHaveLength(3);
  expect(state.shots.every(s=>s.owner==='a'&&s.wallBounced&&s.v.x<0)).toBe(true);
  const restored=new ChaosSimulation(players,()=>{},state);wall(restored,-1);
  restored.step(.02,now+30);expect(restored.snapshot(false).shots).toHaveLength(3);
  expect(restored.snapshot(false).shots.every(s=>s.v.x>0)).toBe(true);
 });
 it('credits A when killing B creates balls that kill C, even after A dies',()=>{
  const {sim,a,b,c,hits}=fixture('improper-disposal',true);b.hp=1;c.hp=1;
  shoot(sim);sim.step(.003,now+3);expect(b.hp).toBe(0);expect(a.kills).toBe(1);
  expect(sim.snapshot(false).shots).toHaveLength(T.deathBurstBalls);
  // B's corpse travels right; C is left, so only the exploding balls reach C.
  a.hp=0;
  for(let i=1;i<=20&&c.hp>0;i++)sim.step(.01,now+3+i*10);
  expect(c.hp).toBe(0);expect(a.kills).toBe(2);expect(c.deaths).toBe(1);
  expect(hits.find(h=>h.victim==='c')).toMatchObject({owner:'a',damage:1});
  const state=sim.snapshot(false);expect(state.corpses.find(body=>body.victimId==='c')!.owner).toBe('a');
  expect(state.shots.every(s=>s.owner==='a')).toBe(true);expect(state.shots.length).toBeLessThanOrEqual(T.maxShots);
 });
 it('scales the physical case and handle down when carried and back up when dropped/reset/restored',()=>{
  const {sim,b,players}=fixture('crossfire');
  const width=()=>2*(sim.caseBody.shapes[0] as C.Box).halfExtents.x;
  expect(width()).toBeCloseTo(CASE_SIZE.x*CASE_LOOSE_SCALE);
  sim.caseBody.position.set(b.x,b.y+.8,b.z);sim.step(0,now);expect(sim.caseHolderId).toBe('b');expect(width()).toBeCloseTo(CASE_SIZE.x);
  const restored=new ChaosSimulation(players,()=>{},sim.snapshot(false));expect(2*(restored.caseBody.shapes[0] as C.Box).halfExtents.x).toBeCloseTo(CASE_SIZE.x);
  sim.release('b');expect(width()).toBeCloseTo(CASE_SIZE.x*CASE_LOOSE_SCALE);
  expect(sim.caseBody.shapeOffsets[1].y).toBeCloseTo(.43*CASE_LOOSE_SCALE);
  sim.reset();expect(width()).toBeCloseTo(CASE_SIZE.x*CASE_LOOSE_SCALE);
 });
});
