import {describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T} from '../../src/shared/chaosState';
import type {IncidentId} from '../../src/shared/incidentCatalog';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(incident:IncidentId){
 const now=Date.now();
 const shooter=createPlayer('shooter','Shooter',appearance,{x:-50,y:20,z:0});
 const victim=createPlayer('victim','Victim',appearance,{x:20,y:20,z:0});
 const players=new Map([shooter,victim].map(p=>[p.id,p]));
 const initial=new ChaosSimulation(players,()=>{});initial.step(0,now);
 const state=initial.snapshot(false);state.dispatch={phase:'active',started:now,until:now+T.activeMs,serial:1,incident};
 const hits:ChaosHit[]=[];const sim=new ChaosSimulation(players,hit=>hits.push(hit),state);
 return {sim,players,shooter,victim,hits,now};
}
function wall(sim:ChaosSimulation,x:number,kind:'world'|'pressure'='world'){
 const b=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.025,6,6)),position:new C.Vec3(x,21,0)});
 sim.world.addBody(b);sim.targets.set(b,{kind});return b;
}
function arm(f:ReturnType<typeof fixture>){
 f.sim.caseBody.position.set(0,21,0);f.sim.caseBody.velocity.setZero();
 f.sim.shoot(f.shooter.id,{shotId:'case-kick',origin:{x:-2,y:21,z:0},direction:{x:1,y:0,z:0}});
 f.sim.step(.01,f.now+10);
 expect(f.sim.caseBody.velocity.x).toBeCloseTo(110);
 expect(f.sim.snapshot(false).case.missileOwner).toBe(f.shooter.id);
}
describe('Evidence Tampering missile case',()=>{
 it('sweeps lethal contacts between ticks without hurting its shooter or auto collecting',()=>{
  const f=fixture('evidence-tampering');arm(f);
  f.victim.x=2;f.shooter.x=1;
  f.sim.step(.04,f.now+50);
  expect(f.hits.filter(h=>h.victim===f.victim.id)).toEqual([expect.objectContaining({owner:f.shooter.id,damage:3})]);
  expect(f.hits.some(h=>h.victim===f.shooter.id)).toBe(false);
  expect(f.sim.snapshot(false).case.owner).toBeNull();
  // Repeat contacts cannot apply damage every physics substep.
  f.sim.caseBody.position.set(1,21,0);f.sim.caseBody.velocity.set(110,0,0);f.sim.step(.02,f.now+70);
  expect(f.hits.filter(h=>h.victim===f.victim.id)).toHaveLength(1);
 });
 it('reflects before a thin wall with ball restitution and does not hit rats behind it',()=>{
  const f=fixture('evidence-tampering');arm(f);wall(f.sim,2);f.victim.x=3;
  f.sim.caseBody.velocity.set(110,0,0);f.sim.caseBody.angularVelocity.setZero();
  f.sim.step(.03,f.now+40);
  expect(f.sim.caseBody.position.x).toBeLessThan(2);
  expect(f.sim.caseBody.velocity.x).toBeCloseTo(-99,4);
  expect(f.hits).toHaveLength(0);
 });
 it('returns to ordinary harmless and collectible evidence when the incident ends',()=>{
  const f=fixture('evidence-tampering');arm(f);
  f.sim.step(0,f.now+T.activeMs);
  expect(f.sim.snapshot(false).case.missileOwner).toBeUndefined();
  expect(f.sim.caseBody.type).toBe(C.Body.DYNAMIC);
  expect(f.sim.caseBody.velocity.length()).toBeLessThanOrEqual(16.00001);
  f.victim.y=0;f.sim.caseBody.position.set(f.victim.x,.8,f.victim.z);f.sim.caseBody.velocity.setZero();
  f.sim.step(0,f.now+T.activeMs+1);
  expect(f.sim.snapshot(false).case.owner).toBe(f.victim.id);expect(f.hits).toHaveLength(0);
 });
 it('allows a slowed case to be picked up while the incident is still active',()=>{
  const f=fixture('evidence-tampering');arm(f);
  f.sim.caseBody.position.set(f.victim.x,f.victim.y+.8,f.victim.z);f.sim.caseBody.velocity.set(3,0,0);
  f.sim.step(0,f.now+50);expect(f.sim.snapshot(false).case.owner).toBe(f.victim.id);
 });
 it('preserves missile attribution through snapshots and rejects malformed metadata',()=>{
  const f=fixture('evidence-tampering');arm(f);const state=f.sim.snapshot(false);
  expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
  expect(parseServerMessage({type:'chaos',state:{...state,case:{...state.case,missileOwner:123}}})).toBeNull();
  const restored=new ChaosSimulation(f.players,h=>f.hits.push(h),state);f.victim.x=2;
  restored.step(.04,f.now+50);expect(f.hits[0]).toMatchObject({owner:f.shooter.id,damage:3});
 });
});
describe('Crossfire bank shots',()=>{
 function fire(f:ReturnType<typeof fixture>){
  f.sim.shoot(f.shooter.id,{shotId:'bank',origin:{x:0,y:20.7,z:0},direction:{x:1,y:0,z:0}});
 }
 it('keeps direct body hits ordinary but makes a world ricochet lethal',()=>{
  const direct=fixture('crossfire');direct.victim.x=1;fire(direct);direct.sim.step(.01,direct.now+10);
  expect(direct.hits[0].damage).toBe(1);
  const bank=fixture('crossfire');bank.victim.x=-1;wall(bank.sim,2);fire(bank);
  bank.sim.step(.02,bank.now+20);expect(bank.sim.snapshot(false).shots[0].wallBounced).toBe(true);
  bank.sim.step(.03,bank.now+50);expect(bank.hits[0].damage).toBe(3);
 });
 it('does not treat a launcher target reflection as a world bank shot',()=>{
  const f=fixture('crossfire');f.victim.x=-1;wall(f.sim,2,'pressure');fire(f);
  f.sim.step(.02,f.now+20);expect(f.sim.snapshot(false).shots[0].wallBounced).toBeUndefined();
  f.sim.step(.03,f.now+50);expect(f.hits[0].damage).toBe(1);
 });
 it('migrates the retired collection incident to Crossfire in saved and received snapshots',()=>{
  const f=fixture('crossfire'),state=f.sim.snapshot(false);
  Object.assign(state.dispatch,{incident:'after-hours-collection'});
  const restored=new ChaosSimulation(f.players,()=>{},state);
  expect(restored.snapshot(false).dispatch.incident).toBe('crossfire');
  const parsed=parseServerMessage({type:'chaos',state});
  expect(parsed?.type==='chaos'&&parsed.state.dispatch.incident).toBe('crossfire');
 });
 it('preserves bank metadata on restore but removes the damage bonus on expiry',()=>{
  const f=fixture('crossfire');f.victim.x=-1;wall(f.sim,2);fire(f);f.sim.step(.02,f.now+20);
  const state=f.sim.snapshot(false);expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
  expect(parseServerMessage({type:'chaos',state:{...state,shots:[{...state.shots[0],wallBounced:3}]}})).toBeNull();
  const restored=new ChaosSimulation(f.players,h=>f.hits.push(h),state);
  expect(restored.snapshot(false).shots[0].wallBounced).toBe(true);
  restored.step(.03,f.now+T.activeMs);expect(f.hits[0].damage).toBe(1);
 });
});
