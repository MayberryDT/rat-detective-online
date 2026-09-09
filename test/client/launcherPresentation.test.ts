import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {PressureMachine} from '../../src/prototype/PressureMachine';
import {LAUNCH_MACHINES} from '../../src/shared/chaosState';

describe('launcher feedback',()=>{
 it('plays every station once per activation, including an empty launch, without replaying snapshots',()=>{
  const scene=new THREE.Scene(),view=new PressureMachine(scene);
  const sound=vi.spyOn(view as unknown as {launchSound:(kind:string)=>void},'launchSound').mockImplementation(()=>{});
  view.update({serial:0,until:0,cooldowns:{},launches:[]},1000);
  const cooldowns=Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,1100+m.cooldownMs]));
  const state={serial:6,until:cooldowns.pressure,cooldowns,launches:[]};
  view.update(state,1200);view.update(state,1250);
  expect(sound.mock.calls.map(c=>c[0])).toEqual(LAUNCH_MACHINES.map(m=>m.kind));
  view.update(state,7000);expect(sound).toHaveBeenCalledTimes(6);
  view.dispose();expect(scene.children).toHaveLength(0);
 });
 it('keeps mechanical launch and airflow visible for the accelerated 1.8-second cycle, then resets',()=>{
  const view=new PressureMachine(new THREE.Scene());
  const state={serial:6,until:6000,cooldowns:Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,6000])),launches:[]};
  const models=(view as unknown as {moving:Array<{machine:{kind:string};rotor:THREE.Group;burst:THREE.Group;shaft?:THREE.Mesh}>}).moving;
  view.update(state,2250);
  expect(models.every(m=>m.burst.visible)).toBe(true);
  const pump=models.find(m=>m.machine.kind==='pressure')!;
  expect(pump.rotor.position.y).toBeGreaterThan(4);
  expect(pump.shaft!.scale.y).toBeGreaterThan(4);
  const fan=models.find(m=>m.machine.kind==='fan')!;
  expect(fan.burst.children.some(p=>p.position.y>15)).toBe(true);
  view.update(state,2850);
  expect(models.every(m=>!m.burst.visible)).toBe(true);
  expect(pump.rotor.position.y).toBe(.13);view.dispose();
 });
 it('does not play historical activations when joining during a cooldown',()=>{
  const view=new PressureMachine(new THREE.Scene());
  const sound=vi.spyOn(view as unknown as {launchSound:(kind:string)=>void},'launchSound').mockImplementation(()=>{});
  view.update({serial:1,until:6000,cooldowns:{pressure:6000},launches:[]},1100);
  expect(sound).not.toHaveBeenCalled();view.dispose();
 });
});
