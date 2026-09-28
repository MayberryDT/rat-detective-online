import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {DISPATCH_STATIONS,PRESSURE_LAUNCH,LAUNCH_MACHINES,CHAOS_TUNING} from '../../src/shared/chaosState';
import {RatController} from '../../src/player/RatController';
import {pump} from './pressureTestKit';
import {createPlayer} from '../../src/worker/gameState';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {MAX_SERVER_MESSAGE_BYTES} from '../../src/shared/networkProtocol';
import {serializeServerMessage} from '../../src/worker/serializeServerMessage';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(){
 const local=createPlayer('local','Local',appearance,{...PRESSURE_LAUNCH.pad});
 const far=createPlayer('far','Far',appearance,{x:0,y:0,z:0});
 const dead=createPlayer('dead','Dead',appearance,{...PRESSURE_LAUNCH.pad});dead.hp=0;
 const sim=new ChaosSimulation(new Map([local,far,dead].map(p=>[p.id,p])),()=>{});sim.step(0,1000);
 return {sim,local};
}
function fire(sim:ChaosSimulation,target:{x:number;y:number;z:number},now=1010,id='target'){
 sim.shoot('local',{shotId:id,origin:{x:target.x,y:target.y,z:target.z+1},direction:{x:0,y:0,z:-1}});
 sim.step(.01,now);
}
describe('distributed controls and physical pressure launch',()=>{
 it.each([.1,.01])('keeps launch height identical with walking damping %s and restores it on landing',damping=>{
  // A mid roll: an ordinary (not overpressure) pressure-works throw.
  const random=vi.spyOn(Math,'random').mockReturnValue(.5);
  const {sim}=fixture();pump(sim,'far',PRESSURE_LAUNCH,1010);const state=sim.snapshot();random.mockRestore();
  const world=new C.World({gravity:new C.Vec3(0,-25,0)}),rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(0,0,0));
  rat.entity.body.linearDamping=damping;rat.applyPressureLaunches(state,'local');let peak=0;
  try{
   for(let i=0;i<300;i++){rat.prepareMovement(1/60,{});world.step(1/60);rat.syncAfterPhysics(1/60);peak=Math.max(peak,rat.entity.body.position.y);}
   expect(peak).toBeGreaterThan(120);expect(peak).toBeLessThan(135);expect(rat.entity.body.linearDamping).toBe(.1);
   const floor=new C.Body({mass:0}),contact=new C.ContactEquation(floor,rat.entity.body);contact.ni.set(0,1,0);
   rat.entity.body.velocity.y=0;world.contacts.push(contact);rat.syncAfterPhysics(1/60);
   expect(rat.entity.body.linearDamping).toBe(damping);
  }finally{rat.dispose();}
 });

 it('puts an independent trigger at all five landmarks with one shared Dispatch cooldown',()=>{
  expect(DISPATCH_STATIONS.map(s=>s.id)).toEqual(['records','icebox','needleworks','pump','gate']);
  for(const station of DISPATCH_STATIONS){
   const {sim}=fixture();fire(sim,station.target);
   expect(sim.snapshot(false).dispatch.phase).toBe('rolling');
   fire(sim,DISPATCH_STATIONS[0].target,1020,'second');
   expect(sim.snapshot().dispatch.serial).toBe(1);
  }
 });
 it('does not build pressure from hits in a stopped round',()=>{
  const {sim}=fixture();const t=PRESSURE_LAUNCH.target;
  sim.shoot('local',{shotId:'stopped',origin:{x:t.x,y:t.y+2.5,z:t.z},direction:{x:0,y:-1,z:0}});
  sim.step(.01,1020,false);sim.step(.01,1040,false);expect(sim.snapshot(false).pressure!.levels).toEqual({});
 });
 it('applies each snapshot event once to a real controller and retains launch momentum through physics',()=>{
  const {sim}=fixture();
  pump(sim,'far',PRESSURE_LAUNCH,1010);
  const state=sim.snapshot(),world=new C.World({gravity:new C.Vec3(0,-25,0)});
  const rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(150,0,147));
  rat.applyPressureLaunches(state,'local');expect(rat.entity.body.velocity.toArray()).toEqual(Object.values(state.pressure!.launches[0].velocity));
  for(let i=0;i<12;i++){rat.prepareMovement(1/60,{});world.step(1/60);rat.syncAfterPhysics(1/60);}
  expect(rat.entity.body.position.y).toBeGreaterThan(5);
  // Unsteered, the rat rides the machine's sideways drift.
  const drift=state.pressure!.launches[0].velocity;
  expect((rat.entity.body.position.x-150)*drift.x+(rat.entity.body.position.z-147)*drift.z).toBeGreaterThan(0);
  // Input responds during takeoff and can reverse during descent without replacing vertical velocity.
  for(const vy of [40,-20]){
   rat.entity.body.velocity.set(0,vy,0);
   rat.prepareMovement(1/60,{KeyD:true});
   expect(Math.hypot(rat.entity.body.velocity.x,rat.entity.body.velocity.z)).toBeGreaterThan(1);
   expect(rat.entity.body.velocity.y).toBe(vy);
   const initial=rat.entity.body.velocity.clone();
   for(let i=0;i<12;i++)rat.prepareMovement(1/60,{KeyA:true});
   expect(initial.x*rat.entity.body.velocity.x+initial.z*rat.entity.body.velocity.z).toBeLessThan(-1);
  }
  const velocity=rat.entity.body.velocity.toArray();rat.applyPressureLaunches(state,'local');
  expect(rat.entity.body.velocity.toArray()).toEqual(velocity);rat.dispose();
 });
 it('launches all living pad occupants and keeps every machine independent',()=>{
  const players=LAUNCH_MACHINES.map(m=>createPlayer(m.id,m.id,appearance,{...m.pad}));
  const second=createPlayer('passenger','Passenger',appearance,{...PRESSURE_LAUNCH.pad,x:PRESSURE_LAUNCH.pad.x+4.7});
  const sim=new ChaosSimulation(new Map([...players,second].map(p=>[p.id,p])),()=>{});sim.step(0,1000);
  LAUNCH_MACHINES.forEach((m,i)=>pump(sim,m.id,m,1010+i*5));
  const state=sim.snapshot(false);
  expect(state.pressure!.serial).toBe(6);
  expect(state.pressure!.launches).toHaveLength(7);
  for(const machine of LAUNCH_MACHINES){
   expect(state.pressure!.launches.find(e=>e.playerId===machine.id)).toMatchObject({machineId:machine.id});
   expect(state.pressure!.fired![machine.id]).toBeGreaterThan(1000);
  }
  expect(state.pressure!.launches.find(e=>e.playerId==='passenger')).toMatchObject({machineId:'pressure',velocity:{y:expect.any(Number)}});
  expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
  sim.step(0,4000);expect(sim.snapshot(false).pressure!.launches).toHaveLength(0);
 });
 it('restores without replaying old launch events, and a reset empties every machine',()=>{
  const {sim}=fixture();pump(sim,'far',PRESSURE_LAUNCH,1010);pump(sim,'far',LAUNCH_MACHINES[1]!,3000,5);
  const saved=sim.snapshot(false), restored=new ChaosSimulation(new Map(),()=>{},saved);
  expect(restored.snapshot(false).pressure!.fired).toEqual(saved.pressure!.fired);
  expect(restored.snapshot(false).pressure!.launches).toEqual([]);
  restored.reset();expect(restored.snapshot(false).pressure!.levels).toEqual({});
 });
 it('validates launch envelopes and fits the capped 120-ball burst snapshots into the existing protocol',()=>{
  const {sim,local}=fixture();
  const selection=vi.spyOn(Math,'random').mockReturnValue(0);
  fire(sim,DISPATCH_STATIONS[0].target);selection.mockRestore();sim.step(0,1010+CHAOS_TUNING.rollMs);
  local.hp=0;sim.death(local,{x:1,y:0,z:0},'far');
  expect(sim.snapshot(false).shots.filter(s=>s.id!=='target')).toHaveLength(120);
  for(let i=0;i<16;i++)sim.death(local,{x:1,y:0,z:0},'far');
  const state=sim.snapshot();
  // Match real UUID-sized player identifiers and a full 24-player launch event.
  const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  for(const shot of state.shots)shot.owner=owner;
  for(const corpse of state.corpses){corpse.owner=owner;corpse.victimId=owner;}
  state.pressure!.launches=Array.from({length:24},(_,i)=>({id:`pressure-100-${owner}-${i}`,playerId:owner,at:state.time,velocity:{x:33,y:106,z:-33}}));
  const message={type:'chaos' as const,state};
  const raw=serializeServerMessage(message);
  expect(state.shots.some(s=>s.explosive)).toBe(true);
  expect(raw).not.toContain('explosive');
  expect(new TextEncoder().encode(raw).length).toBeLessThan(MAX_SERVER_MESSAGE_BYTES);
  expect(parseServerMessage(raw)).not.toBeNull();
  state.pressure!.launches=[{id:'bad',playerId:'local',at:1000,velocity:{x:Infinity,y:1,z:1}}];
  expect(parseServerMessage(message)).toBeNull();
  state.pressure!.launches[0].velocity.x=1000;expect(parseServerMessage(message)).toBeNull();
 });
});
