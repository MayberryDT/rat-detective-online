import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {PRESSURE_LAUNCH,PRESSURE_TUNING} from '../../src/shared/chaosState';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
import {pump} from './pressureTestKit';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const pad=PRESSURE_LAUNCH.pad,machine=PRESSURE_LAUNCH;

function fixture(riders:number){
 const players=Array.from({length:riders},(_,i)=>createPlayer(`rider-${i}`,`Rider ${i}`,appearance,{x:pad.x+i,y:0,z:pad.z}));
 const shooter=createPlayer('shooter','Shooter',appearance,{x:0,y:0,z:0});
 const sim=new ChaosSimulation(new Map([...players,shooter].map(p=>[p.id,p])),()=>{});sim.step(0,1000);
 return {sim,players};
}
/** Step `seconds` at 30 Hz from `from`; returns the new time. */
function stand(sim:ChaosSimulation,from:number,seconds:number,playing=true):number {
 let t=from;for(let i=0;i<Math.round(seconds*30);i++){t+=1000/30;sim.step(1/30,t,playing);}
 return t;
}
const level=(sim:ChaosSimulation)=>sim.snapshot(false).pressure!.levels[machine.id]??0;
const serial=(sim:ChaosSimulation)=>sim.snapshot(false).pressure!.serial;

describe('pressure triggers',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('throws one rat after ten seconds of standing, not before',()=>{
  const {sim}=fixture(1);
  let t=stand(sim,1000,9.8);
  expect(serial(sim)).toBe(0);expect(level(sim)).toBeGreaterThan(9.5);
  t=stand(sim,t,.3+PRESSURE_TUNING.blowMs/1000);
  expect(serial(sim)).toBe(1);
  expect(sim.snapshot(false).pressure!.launches.map(e=>e.playerId)).toEqual(['rider-0']);
 });
 it('fills twice as fast with two riders, and ignores the dead and stopped rounds',()=>{
  const two=fixture(2);stand(two.sim,1000,5.2+PRESSURE_TUNING.blowMs/1000);
  expect(serial(two.sim)).toBe(1);
  const dead=fixture(1);dead.players[0]!.hp=0;stand(dead.sim,1000,12);
  expect(level(dead.sim)).toBe(0);
  const stopped=fixture(1);stand(stopped.sim,1000,12,false);
  expect(level(stopped.sim)).toBe(0);
 });
 it('counts every trigger hit as one second, and never leaks',()=>{
  const {sim}=fixture(0);
  const t=pump(sim,'shooter',machine,1010,4);
  expect(level(sim)).toBeCloseTo(4,5);
  stand(sim,t,60);
  expect(level(sim)).toBeCloseTo(4,5);
  expect(serial(sim)).toBe(0);
 });
 it('adds standing and hits together, then resets to empty',()=>{
  const {sim}=fixture(1);
  let t=stand(sim,1000,6);
  t=pump(sim,'shooter',machine,t+10,4);
  expect(serial(sim)).toBe(1);
  expect(level(sim)).toBeLessThan(.5);
 });
 it('fires an empty machine from hits alone',()=>{
  const {sim}=fixture(0);pump(sim,'shooter',machine,1010);
  expect(serial(sim)).toBe(1);expect(sim.snapshot(false).pressure!.launches).toEqual([]);
 });
 it('makes an overpressure only when the full machine is hit during its hang',()=>{
  const plain=fixture(1);stand(plain.sim,1000,10.2+PRESSURE_TUNING.blowMs/1000);
  expect(plain.sim.snapshot(false).pressure!.launches[0]!.boost).toBeUndefined();
  const hot=fixture(1);let t=stand(hot.sim,1000,10.1);
  expect(hot.sim.snapshot(false).pressure!.blowing?.[machine.id]).toBeDefined();
  t=pump(hot.sim,'shooter',machine,t+10,2);
  const launch=hot.sim.snapshot(false).pressure!.launches[0]!;
  expect(launch.boost).toBe(true);expect(launch.velocity.y).toBeGreaterThan(100);
 });
 it('ignores hits for a second after firing, then fills again',()=>{
  const {sim}=fixture(0);let t=pump(sim,'shooter',machine,1010);
  t=pump(sim,'shooter',machine,t+100,3);
  expect(level(sim)).toBe(0);
  t=pump(sim,'shooter',machine,t+PRESSURE_TUNING.cooldownMs,3);
  expect(level(sim)).toBeCloseTo(3,5);
 });
 it('keeps pressure and a hanging machine through a restore, in a valid snapshot',()=>{
  const {sim}=fixture(1);const t=stand(sim,1000,10.1);
  const saved=sim.snapshot(false);
  expect(parseServerMessage({type:'chaos',state:saved})).not.toBeNull();
  const players=new Map([['rider-0',createPlayer('rider-0','Rider',appearance,{x:pad.x,y:0,z:pad.z})]]);
  const restored=new ChaosSimulation(players,()=>{},saved);
  restored.step(.01,t+PRESSURE_TUNING.blowMs+20);
  expect(restored.snapshot(false).pressure!.serial).toBe(saved.pressure!.serial+1);
  const partial=fixture(0);pump(partial.sim,'shooter',machine,1010,6);
  const again=new ChaosSimulation(new Map(),()=>{},partial.sim.snapshot(false));
  expect(again.snapshot(false).pressure!.levels[machine.id]).toBeCloseTo(6,5);
 });
});
