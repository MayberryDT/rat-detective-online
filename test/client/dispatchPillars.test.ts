import {describe,it,expect,vi,afterEach} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,DISPATCH_STATIONS} from '../../src/shared/chaosState';
import {createPlayer} from '../../src/worker/gameState';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {MAX_HP,type Vec3Data} from '../../src/shared/networkProtocol';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));

// Failure modes, written before the checks:
// 1. A hit while the line is busy starts a second roll, or goes unacknowledged.
// 2. Only the bell's front counts; a shot from behind, the side or above misses, or the post counts as the bell.
// 3. The caller is lost before the incident ends, or lingers once the line is ready again.
// 4. The caller's supply is granted twice (busy hits, later phases), to someone else, or is a wasted Quick Fix at full HP.
// 5. The line comes back before 21 seconds of LINE BUSY.
// 6. A malformed caller rides the wire.

const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
afterEach(()=>{vi.restoreAllMocks();});
function fixture(hp=MAX_HP){
 const caller=createPlayer('caller','Caller',appearance,{x:0,y:0,z:0}),other=createPlayer('other','Other',appearance,{x:30,y:0,z:30});
 caller.hp=hp;
 const sim=new ChaosSimulation(new Map([caller,other].map(p=>[p.id,p])),()=>{});sim.step(0,1000);
 return {sim,caller,other};
}
/** Fires from `from` straight through the bell centre `to`, then lets the ball arrive. */
function fire(sim:ChaosSimulation,to:Vec3Data,from:Vec3Data,now:number,owner='caller'){
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,l=Math.hypot(dx,dy,dz);
 sim.shoot(owner,{shotId:crypto.randomUUID(),origin:from,direction:{x:dx/l,y:dy/l,z:dz/l}});
 for(let i=0;i<4;i++)sim.step(.01,now+i*10);
}
const around=(t:Vec3Data,dx:number,dy:number,dz:number)=>({x:t.x+dx,y:t.y+dy,z:t.z+dz});

describe('Dispatch alarm pillars',()=>{
 it('rings from any side of every bell, but not from the post',()=>{
  const sides:Array<[number,number,number]>=[[0,0,4],[0,0,-4],[4,0,0],[-4,0,0],[3,.5,3],[-3,.5,-3],[0,4,.2]];
  for(const station of DISPATCH_STATIONS){
   const t=station.target;
   for(const [dx,dy,dz] of sides){
    const {sim}=fixture();fire(sim,t,around(t,dx,dy,dz),1010);
    expect(sim.snapshot(false).dispatch.phase,`${station.id} from ${dx},${dy},${dz}`).toBe('rolling');
   }
   // An off-centre graze near the housing's edge still counts.
   const {sim:edge}=fixture();fire(edge,around(t,1.1,.9,0),around(t,1.1,.9,5),1010);
   expect(edge.snapshot(false).dispatch.phase,`${station.id} edge`).toBe('rolling');
   const {sim:post}=fixture(),low={x:station.box.x,y:station.box.y,z:station.box.z};
   fire(post,low,around(low,0,0,4),1010);
   expect(post.snapshot(false).dispatch.phase,`${station.id} post`).toBe('ready');
  }
 });
 it('never starts a second roll from busy hits, yet acknowledges each one',()=>{
  const {sim}=fixture(),t=DISPATCH_STATIONS[0].target,other=DISPATCH_STATIONS.at(-1)!.target;
  // Bad Ammunition bends a busy-phase shot off the bell by design; pin a roll that leaves shots straight.
  sim.forcedIncident='blackout';
  fire(sim,t,around(t,0,0,4),1010);
  expect(sim.snapshot().dispatch).toMatchObject({phase:'rolling',serial:1});
  const checks:Array<[number,string]>=[[1100,'rolling'],[1010+T.rollMs+100,'active'],[1010+T.rollMs+T.activeMs+100,'cooldown']];
  for(const [now,phase] of checks){
   sim.step(0,now);
   for(const target of [t,other]){
    fire(sim,target,around(target,-4,0,0),now+10,'other');
    const state=sim.snapshot();
    expect(state.dispatch).toMatchObject({phase,serial:1});
    expect(state.impacts.some(i=>i.foley==='trigger-busy'),phase).toBe(true);
    expect(state.impacts.some(i=>i.foley==='trigger'),phase).toBe(false);
   }
  }
 });
 it('keeps the caller through the incident and LINE BUSY, then clears it after the cooldown',()=>{
  const {sim}=fixture(),t=DISPATCH_STATIONS[0].target;
  fire(sim,t,around(t,0,0,4),1010);
  const rolling=sim.snapshot(false).dispatch;
  expect(rolling.caller).toBe('caller');
  sim.step(0,rolling.until);expect(sim.snapshot(false).dispatch).toMatchObject({phase:'active',caller:'caller'});
  const active=sim.snapshot(false).dispatch;
  sim.step(0,active.until);expect(sim.snapshot(false).dispatch).toMatchObject({phase:'cooldown',caller:'caller'});
  const cooldown=sim.snapshot(false).dispatch;
  expect(cooldown.until-cooldown.started).toBe(T.cooldownMs);
  sim.step(0,cooldown.until-1);expect(sim.snapshot(false).dispatch.phase).toBe('cooldown');
  sim.step(0,cooldown.until);
  const ready=sim.snapshot(false).dispatch;
  expect(ready.phase).toBe('ready');expect(ready).not.toHaveProperty('caller');
  // The next roll names its own caller.
  fire(sim,t,around(t,4,0,0),cooldown.until+10,'other');
  expect(sim.snapshot(false).dispatch).toMatchObject({phase:'rolling',serial:2,caller:'other'});
 });
 it('drops the caller of a rat who leaves mid-incident',()=>{
  const {sim}=fixture(),t=DISPATCH_STATIONS[0].target;
  fire(sim,t,around(t,0,0,4),1010);sim.removePlayer('caller');
  expect(sim.snapshot(false).dispatch).not.toHaveProperty('caller');
 });
 it('grants the caller exactly one supply, never to anyone else',()=>{
  const {sim}=fixture(),t=DISPATCH_STATIONS[0].target;
  // Pin a roll that grants no buffs of its own.
  sim.forcedIncident='blackout';
  fire(sim,t,around(t,0,0,4),1010);
  const granted=sim.snapshot(false).buffs??{};
  expect(Object.keys(granted)).toEqual(['caller']);
  expect(sim.drainPickupEvents().filter(e=>e.kind==='rewarded')).toMatchObject([{playerId:'caller',why:'dispatch'}]);
  // Busy hits by the caller grant nothing more.
  fire(sim,t,around(t,0,0,-4),1500);sim.step(0,1010+T.rollMs+10);fire(sim,t,around(t,4,0,0),1010+T.rollMs+20);
  const after=sim.snapshot(false).buffs??{};
  expect(Object.keys(after)).toEqual(['caller']);
  expect(after.caller).toEqual(granted.caller);
  expect(sim.drainPickupEvents()).toEqual([]);
 });
 it('never wastes a Quick Fix on a caller at full health, and heals a hurt caller with it',()=>{
  const t=DISPATCH_STATIONS[0].target;
  for(let roll=0;roll<1;roll+=.1){
   vi.spyOn(Math,'random').mockReturnValue(roll);
   const {sim,caller}=fixture();fire(sim,t,around(t,0,0,4),1010);
   expect(sim.drainPickupEvents().filter(e=>e.kind==='healed'),`roll ${roll}`).toEqual([]);
   expect(caller.hp).toBe(MAX_HP);
   const buff=sim.snapshot(false).buffs?.caller;
   expect(buff?.weapon==='mousetrap'||(buff?.ironcladUntil??buff?.hustleUntil??buff?.stakeoutUntil??buff?.weaponUntil??0)>1010,`roll ${roll}`).toBe(true);
   vi.restoreAllMocks();
  }
  // Hurt, the draw is every kind in PICKUP_KINDS order; this roll lands on Quick Fix (third of seven).
  vi.spyOn(Math,'random').mockReturnValue(2.5/7);
  const {sim,caller}=fixture(2);fire(sim,t,around(t,0,0,4),1010);
  expect(caller.hp).toBe(MAX_HP);
  expect(sim.drainPickupEvents()).toEqual([{kind:'healed',playerId:'caller',hp:MAX_HP,cause:'pickup'},{kind:'rewarded',playerId:'caller',pickup:'quick-fix',why:'dispatch'}]);
 });
 it('carries the caller on the wire and rejects a malformed one',()=>{
  const {sim}=fixture(),t=DISPATCH_STATIONS[0].target;
  fire(sim,t,around(t,0,0,4),1010);
  const state=sim.snapshot();
  expect(parseServerMessage(JSON.stringify({type:'chaos',state}))).toMatchObject({state:{dispatch:{caller:'caller'}}});
  for(const caller of ['',7,'x'.repeat(65)])
   expect(parseServerMessage(JSON.stringify({type:'chaos',state:{...state,dispatch:{...state.dispatch,caller}}})),String(caller)).toBeNull();
 });
});
