import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {DISPATCH_STATIONS,PRESSURE_LAUNCH,LAUNCH_MACHINES,CHAOS_TUNING} from '../../src/shared/chaosState';
import {RatController} from '../../src/player/RatController';
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
  const {sim}=fixture();fire(sim,PRESSURE_LAUNCH.target);const state=sim.snapshot();
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
 it('launches only living rats on the pad, from an actual hit, and enforces cooldown',()=>{
  const {sim}=fixture();const t=PRESSURE_LAUNCH.target;
  fire(sim,{...t,x:t.x+t.w/2+.25});expect(sim.snapshot(false).pressure!.launches).toHaveLength(0);
  fire(sim,t,1020,'hit');let state=sim.snapshot(false);
  expect(state.pressure!.launches.map(e=>e.playerId)).toEqual(['local']);
  expect(state.pressure!.launches[0].velocity.y).toBeGreaterThan(40);
  fire(sim,t,1030,'cooldown');expect(sim.snapshot(false).pressure!.serial).toBe(1);
  fire(sim,t,1020+PRESSURE_LAUNCH.cooldownMs,'ready');state=sim.snapshot();
  expect(state.pressure!.serial).toBe(2);
 });
 it('fires empty launchers for discovery without creating player impulses',()=>{
  const {sim,local}=fixture();local.x=0;
  fire(sim,PRESSURE_LAUNCH.target);
  let state=sim.snapshot(false);
  expect(state.pressure!.serial).toBe(1);
  expect(state.pressure!.launches).toEqual([]);
  expect(state.pressure!.cooldowns![PRESSURE_LAUNCH.id]).toBe(1010+PRESSURE_LAUNCH.cooldownMs);
  local.x=PRESSURE_LAUNCH.pad.x;
  fire(sim,PRESSURE_LAUNCH.target,1020,'occupied-during-cooldown');
  expect(sim.snapshot(false).pressure!.launches).toEqual([]);
  fire(sim,PRESSURE_LAUNCH.target,1020+PRESSURE_LAUNCH.cooldownMs,'occupied-ready');
  state=sim.snapshot(false);
  expect(state.pressure!.serial).toBe(2);
  expect(state.pressure!.launches.map(e=>e.playerId)).toEqual(['local']);
 });
 it('does not activate in a stopped round',()=>{
  const {sim}=fixture();const t=PRESSURE_LAUNCH.target;
  sim.shoot('local',{shotId:'stopped',origin:{x:t.x,y:t.y,z:t.z+1},direction:{x:0,y:0,z:-1}});
  sim.step(.01,1020,false);expect(sim.snapshot(false).pressure!.serial).toBe(0);
 });
 it('applies each snapshot event once to a real controller and retains launch momentum through physics',()=>{
  const {sim}=fixture();
  fire(sim,PRESSURE_LAUNCH.target);
  const state=sim.snapshot(),world=new C.World({gravity:new C.Vec3(0,-25,0)});
  const rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(150,0,147));
  rat.applyPressureLaunches(state,'local');expect(rat.entity.body.velocity.toArray()).toEqual(Object.values(state.pressure!.launches[0].velocity));
  for(let i=0;i<12;i++){rat.prepareMovement(1/60,{});world.step(1/60);rat.syncAfterPhysics(1/60);}
  expect(rat.entity.body.position.y).toBeGreaterThan(5);
  expect(Math.hypot(rat.entity.body.position.x-150,rat.entity.body.position.z-147)).toBe(0);
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
 it('launches all living pad occupants and preserves simultaneous stations and independent cooldowns',()=>{
  const players=LAUNCH_MACHINES.map(m=>createPlayer(m.id,m.id,appearance,{...m.pad}));
  const second=createPlayer('passenger','Passenger',appearance,{...PRESSURE_LAUNCH.pad,x:PRESSURE_LAUNCH.pad.x+4.7});
  const sim=new ChaosSimulation(new Map([...players,second].map(p=>[p.id,p])),()=>{});sim.step(0,1000);
  LAUNCH_MACHINES.forEach((m,i)=>{
   sim.shoot(m.id,{shotId:`machine-${i}`,origin:{x:m.target.x,y:m.target.y,z:m.target.z+1},direction:{x:0,y:0,z:-1}});
   sim.step(.01,1010+i*10);
  });
  const state=sim.snapshot(false);
  expect(state.pressure!.serial).toBe(6);
  expect(state.pressure!.launches).toHaveLength(7);
  for(const machine of LAUNCH_MACHINES){
   expect(state.pressure!.launches.find(e=>e.playerId===machine.id)).toMatchObject({machineId:machine.id});
   expect(state.pressure!.cooldowns![machine.id]).toBeGreaterThan(1000);
  }
  expect(state.pressure!.launches.find(e=>e.playerId==='passenger')!.velocity).toEqual(state.pressure!.launches.find(e=>e.playerId==='pressure')!.velocity);
  expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
  sim.shoot('pressure',{shotId:'blocked',origin:{x:PRESSURE_LAUNCH.target.x,y:PRESSURE_LAUNCH.target.y,z:PRESSURE_LAUNCH.target.z+1},direction:{x:0,y:0,z:-1}});
  sim.step(.01,1200);expect(sim.snapshot(false).pressure!.serial).toBe(6);
  sim.step(0,3000);expect(sim.snapshot(false).pressure!.launches).toHaveLength(0);
 });
 it('restores individual cooldowns without replaying old launch events',()=>{
  const {sim}=fixture();fire(sim,PRESSURE_LAUNCH.target);
  const saved=sim.snapshot(false), restored=new ChaosSimulation(new Map(),()=>{},saved);
  expect(restored.snapshot(false).pressure!.cooldowns).toEqual(saved.pressure!.cooldowns);
  expect(restored.snapshot(false).pressure!.launches).toEqual([]);
  restored.reset();expect(restored.snapshot(false).pressure!.cooldowns).toEqual({});
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
  state.pressure!.launches=Array.from({length:24},(_,i)=>({id:`pressure-100-${owner}-${i}`,playerId:owner,at:state.time,velocity:{...PRESSURE_LAUNCH.velocity}}));
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
