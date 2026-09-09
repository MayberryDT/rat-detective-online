import {describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CASE_SIZE,CASE_LOOSE_SCALE,CHAOS_TUNING as T,INCIDENT_TUNING as I} from '../../src/shared/chaosState';
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
 it('pops each original 0.4 seconds after it is fired, lofting children that cannot pop',()=>{
  const {sim,b}=fixture('popcorn-panic',true);expect(I.popcornPulseMs).toBe(400);
  sim.shoot('a',{shotId:'air',origin:{x:-4,y:40,z:0},direction:{x:0,y:0,z:1}});
  sim.step(.003,now+3);expect(b.hp).toBe(3);expect(sim.snapshot(false).pressure!.launches).toHaveLength(0);
  expect(sim.snapshot(false).shots[0]).toMatchObject({original:true});
  expect(sim.snapshot(false).shots[0].popAt).toBeGreaterThan(now);
  sim.step(0,now+I.popcornPulseMs-1);expect(sim.snapshot(false).shots).toHaveLength(1);
  sim.step(0,now+I.popcornPulseMs);const popped=sim.snapshot(false);
  expect(popped.shots.length).toBe(I.popcornChildren);
  expect(popped.shots.every(s=>s.original!==true&&s.v.y>0)).toBe(true);
  expect(popped.impacts.some(hit=>hit.cue==='pop')).toBe(true);
  const childCount=popped.shots.length;
  sim.shoot('a',{shotId:'fresh',origin:{x:-8,y:40,z:0},direction:{x:0,y:0,z:1}});
  sim.step(0,now+I.popcornPulseMs+10);
  expect(sim.snapshot(false).shots.some(s=>s.original&&s.id==='fresh')).toBe(true);
  sim.step(0,now+I.popcornPulseMs*2+10);
  expect(sim.snapshot(false).shots.some(s=>s.original)).toBe(false);
  expect(sim.snapshot(false).shots.length).toBeGreaterThan(childCount);
 });
 it('does not delete an original at a nearly full pool without spawning children',()=>{
  const {sim}=fixture('popcorn-panic');
  for(let i=0;i<T.maxShots-1;i++)sim.shoot('a',{shotId:`fill-${i}`,origin:{x:-20,y:40,z:0},direction:{x:0,y:0,z:1}});
  expect(sim.snapshot(false).shots).toHaveLength(T.maxShots-1);
  sim.step(0,now+I.popcornPulseMs);
  const s=sim.snapshot(false);expect(s.shots.length).toBeLessThanOrEqual(T.maxShots);
  expect(s.shots.length).toBeGreaterThanOrEqual(T.maxShots-1);
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
