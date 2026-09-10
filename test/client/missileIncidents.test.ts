import {describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {INCIDENT_TUNING as I,CHAOS_TUNING as T} from '../../src/shared/chaosState';
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
 expect(f.sim.caseBody.velocity.x).toBeCloseTo(I.caseShotSpeed);
 expect(f.sim.snapshot(false).case.missileOwner).toBe(f.shooter.id);
}
describe('Evidence Tampering missile case',()=>{
 it('keeps ricocheting near the floor instead of gaining altitude in an enclosed lane',()=>{
  const f=fixture('evidence-tampering');wall(f.sim,-8);wall(f.sim,8);
  const floor=new C.Body({mass:0,shape:new C.Box(new C.Vec3(20,.5,10)),position:new C.Vec3(0,19.5,0)});
  f.sim.world.addBody(floor);f.sim.targets.set(floor,{kind:'world'});
  f.sim.caseBody.position.set(0,21,0);f.sim.caseBody.velocity.set(I.caseMissileSpeed,I.caseMissileLift,0);
  f.sim.caseBody.angularVelocity.set(2,3,2);
  let low=Infinity,high=-Infinity,turns=0,sign=1;
  for(let frame=1;frame<=600;frame++){
   f.sim.step(1/60,f.now+frame*1000/60);
   const {position:p,velocity:v}=f.sim.caseBody;low=Math.min(low,p.y);high=Math.max(high,p.y);
   expect(Math.abs(p.x)).toBeLessThan(8);expect(Math.hypot(v.x,v.z)).toBeGreaterThanOrEqual(I.caseRicochetMinSpeed-.01);
   const next=Math.sign(v.x);if(next!==sign)turns++;sign=next;
  }
  expect(turns).toBeGreaterThan(12);expect(low).toBeGreaterThan(20);expect(high).toBeLessThan(24);
 });
 it('does not multiply Cannon substeps for cases already handled by continuous sweeps',()=>{
  const f=fixture('evidence-tampering');f.sim.caseBody.velocity.set(220,0,0);
  const step=vi.spyOn(f.sim.world,'step');f.sim.step(1/60,f.now+17);
  expect(step).toHaveBeenCalledTimes(1);step.mockRestore();
 });
 it('sweeps lethal contacts between ticks without hurting its shooter or auto collecting',()=>{
  const f=fixture('evidence-tampering');arm(f);
  f.victim.x=2;f.shooter.x=1;
  f.sim.step(.04,f.now+50);
  expect(f.hits.filter(h=>h.victim===f.victim.id)).toEqual([expect.objectContaining({owner:f.shooter.id,damage:3})]);
  expect(f.hits.some(h=>h.victim===f.shooter.id)).toBe(false);
  expect(f.sim.snapshot(false).case.owner).toBeNull();
  f.sim.caseBody.position.set(1,21,0);f.sim.caseBody.velocity.set(110,0,0);f.sim.step(.02,f.now+70);
  expect(f.hits.filter(h=>h.victim===f.victim.id)).toHaveLength(1);
 });
 it('reflects before a thin wall with ball restitution and does not hit rats behind it',()=>{
  const f=fixture('evidence-tampering');arm(f);f.victim.x=3;
  // Exclude the original reflected bullet so it cannot redirect the case again.
  const saved=f.sim.snapshot(false);saved.shots=[];
  const sim=new ChaosSimulation(f.players,h=>f.hits.push(h),saved);wall(sim,2);
  sim.caseBody.velocity.set(220,0,0);sim.caseBody.angularVelocity.setZero();
  sim.step(.03,f.now+40);
  expect(sim.caseBody.position.x).toBeLessThan(2);
  expect(sim.caseBody.velocity.x).toBeLessThan(-150);
  expect(f.hits).toHaveLength(0);
 });
 it('redirects a bouncing case with a bounded loft and preserves attribution on restore',()=>{
  const f=fixture('evidence-tampering');arm(f);
  f.sim.caseBody.position.set(0,21,0);f.sim.caseBody.velocity.set(0,0,64);
  f.sim.caseBody.angularVelocity.setZero();f.sim.caseBody.quaternion.set(0,0,0,1);
  f.sim.shoot(f.victim.id,{shotId:'redirect',origin:{x:2,y:20.6,z:.32},direction:{x:-1,y:.2,z:0}});
  f.sim.step(.01,f.now+20);
  expect(f.sim.caseBody.velocity.x).toBeCloseTo(-I.caseShotSpeed);
  expect(f.sim.caseBody.velocity.y).toBeCloseTo(I.caseMaxLift);
  expect(f.sim.snapshot(false).case.missileOwner).toBe(f.victim.id);
  // Isolate subsequent flight from another redirect by the earlier reflected bullet.
  const state=f.sim.snapshot(false);state.shots=[];
  const flight=new ChaosSimulation(f.players,()=>{},state);
  flight.step(.01,f.now+30);
  expect(flight.caseBody.velocity.y).toBeLessThanOrEqual(I.caseMaxLift);
  expect(flight.caseBody.velocity.y).toBeGreaterThan(8);
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
 it('hits a walking rat with an unclaimed auto-launched case',()=>{
  const f=fixture('evidence-tampering');
  f.sim.caseBody.position.set(0,21,0);f.sim.caseBody.velocity.set(40,0,0);
  f.victim.x=1;f.victim.y=20;f.shooter.x=-40;
  f.sim.step(.04,f.now+50);
  expect(f.hits.some(h=>h.victim===f.victim.id)).toBe(true);
  expect(f.hits.some(h=>h.victim===f.shooter.id)).toBe(false);
 });
 it('keeps slow cases armed and uncollectible for the whole incident',()=>{
  const f=fixture('evidence-tampering');arm(f);
  f.sim.caseBody.position.set(f.victim.x,f.victim.y+.8,f.victim.z);f.sim.caseBody.velocity.set(3,0,0);
  f.sim.step(0,f.now+50);expect(f.sim.snapshot(false).case.owner).toBeNull();
  expect(f.sim.snapshot(false).case.missileOwner).toBe(f.shooter.id);
 });
 it('ejects a carried case immediately and never lets the former holder reacquire it',()=>{
  const f=fixture('crossfire');
  f.sim.caseBody.position.set(f.victim.x,f.victim.y+.8,f.victim.z);f.sim.step(0,f.now);
  expect(f.sim.snapshot(false).case.owner).toBe(f.victim.id);
  const saved=f.sim.snapshot(false);saved.dispatch={phase:'active',incident:'evidence-tampering',started:f.now,until:f.now+T.activeMs,serial:2};
  const armed=new ChaosSimulation(f.players,h=>f.hits.push(h),saved);
  expect(armed.snapshot(false).case.owner).toBeNull();
  expect(armed.snapshot(false).extraCases).toHaveLength(7);
  armed.caseBody.position.set(f.victim.x,f.victim.y+.8,f.victim.z);armed.caseBody.velocity.setZero();
  armed.step(0,f.now+20);expect(armed.snapshot(false).case.owner).toBeNull();
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
