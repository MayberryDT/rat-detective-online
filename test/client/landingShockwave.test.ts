import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import * as THREE from 'three';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {LAUNCH_MACHINES,PRESSURE_LAUNCH} from '../../src/shared/chaosState';
import type {PlayerData} from '../../src/shared/networkProtocol';
import {LANDING_SHOCKWAVE,PRESSURE_TELL_MS} from '../../src/shared/launcherVelocity';
import {createPlayer} from '../../src/worker/gameState';
import {RatController} from '../../src/player/RatController';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const pad=PRESSURE_LAUNCH.pad;
const spot={x:20,z:20};

function fixture(){
 const lander=createPlayer('lander','Lander',appearance,{x:pad.x,y:0,z:pad.z});
 const under=createPlayer('under','Under',appearance,{x:spot.x+1,y:0,z:spot.z});
 const near=createPlayer('near','Near',appearance,{x:spot.x+5,y:0,z:spot.z});
 const far=createPlayer('far','Far',appearance,{x:spot.x+40,y:0,z:spot.z});
 const hits:ChaosHit[]=[];
 const sim=new ChaosSimulation(new Map([lander,under,near,far].map(p=>[p.id,p])),hit=>hits.push(hit));sim.step(0,1000);
 const ground=new C.Body({mass:0,shape:new C.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);
 sim.world.addBody(ground);sim.targets.set(ground,{kind:'world'});
 return {sim,lander,under,near,far,hits};
}
function launch(sim:ChaosSimulation){
 const t=PRESSURE_LAUNCH.target;
 sim.shoot('far',{shotId:'trigger',origin:{x:t.x,y:t.y,z:t.z+1},direction:{x:0,y:0,z:-1}});
 sim.step(.01,1010);sim.step(.01,1010+PRESSURE_TELL_MS);
 expect(sim.snapshot(false).pressure!.launches.map(e=>e.playerId)).toEqual(['lander']);
}
/** Fly the lander along a real-looking arc: up, then down onto (x,y,z). */
function arc(sim:ChaosSimulation,lander:PlayerData,to:{x:number;y:number;z:number},start=1300){
 let t=start;
 for(const y of [30,70,90,70,30]){t+=500;Object.assign(lander,{x:to.x,y,z:to.z});sim.step(.05,t);}
 t+=500;Object.assign(lander,to);sim.step(.05,t);
 return t;
}

describe('launcher landings',()=>{
 beforeEach(()=>{vi.spyOn(Math,'random').mockReturnValue(.5);});
 afterEach(()=>vi.restoreAllMocks());
 it('shoves nearby rats away, squashes the rat underneath for the lander, and leaves distant rats alone',()=>{
  const {sim,lander,hits}=fixture();launch(sim);
  arc(sim,lander,{x:spot.x,y:0,z:spot.z});
  const shoves=sim.snapshot(false).pressure!.shoves!;
  expect(shoves.map(s=>s.playerId).sort()).toEqual(['near','under']);
  const push=(id:string)=>shoves.find(s=>s.playerId===id)!.velocity;
  expect(push('near').x).toBeGreaterThan(0);expect(push('under').x).toBeGreaterThan(push('near').x);
  expect(push('near').y).toBe(LANDING_SHOCKWAVE.lift);
  expect(hits).toEqual([expect.objectContaining({owner:'lander',victim:'under',damage:1})]);
  expect(sim.snapshot(false).impacts.some(i=>i.foley==='launch-landing')).toBe(true);
 });
 it('never fires for a rat that was not launched, or that is still in the air',()=>{
  const {sim,lander,hits}=fixture();
  arc(sim,lander,{x:spot.x,y:0,z:spot.z});
  expect(sim.snapshot(false).pressure!.shoves).toBeUndefined();
  const second=fixture();launch(second.sim);
  // Coming down but never reaching anything solid: 40 units up, no support.
  arc(second.sim,second.lander,{x:spot.x,y:40,z:spot.z});
  expect(second.sim.snapshot(false).pressure!.shoves).toBeUndefined();
  expect([...hits,...second.hits]).toEqual([]);
 });
 it('fires another machine it lands on, but not the one that threw it',()=>{
  const fan=LAUNCH_MACHINES.find(m=>m.id==='fan')!;
  const {sim,lander}=fixture();launch(sim);
  const t=arc(sim,lander,{x:fan.pad.x,y:0,z:fan.pad.z});
  sim.step(.01,t+PRESSURE_TELL_MS);
  expect(sim.snapshot(false).pressure!.cooldowns!.fan).toBeGreaterThan(t);
  const home=fixture();launch(home.sim);
  // A long flight: the thrower's own cooldown has run out by the landing.
  const back=arc(home.sim,home.lander,{x:pad.x,y:0,z:pad.z},6300);
  home.sim.step(.01,back+PRESSURE_TELL_MS);
  expect(home.sim.snapshot(false).pressure!.serial).toBe(1);
 });
 it('applies a shove to the local rat once, as a hop away from the landing',()=>{
  const world=new C.World({gravity:new C.Vec3(0,-25,0)});
  const rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(0,0,0));
  try{
   const state={time:1000,pressure:{serial:1,until:0,launches:[],shoves:[{id:'shove-1',playerId:'local',at:1000,velocity:{x:12,y:9,z:0}}]}};
   rat.applyPressureLaunches(state,'local');
   expect(rat.entity.body.velocity.x).toBe(12);expect(rat.entity.body.velocity.y).toBe(9);
   rat.applyPressureLaunches(state,'local');
   expect(rat.entity.body.velocity.x).toBe(12);
   for(let i=0;i<20;i++){rat.prepareMovement(1/60,{});world.step(1/60);rat.syncAfterPhysics(1/60);}
   expect(rat.entity.body.position.x).toBeGreaterThan(2);
  }finally{rat.dispose();}
 });
});
