import {describe,it,expect,vi,type MockInstance} from 'vitest';
import * as THREE from 'three';
import {PressureMachine} from '../../src/prototype/PressureMachine';
import {LAUNCH_MACHINES} from '../../src/shared/chaosState';
import type {LauncherAudio} from '../../src/audio/LauncherAudio';

const spy=(view:PressureMachine)=>vi.spyOn((view as unknown as {launchAudio:LauncherAudio}).launchAudio,'play').mockImplementation(()=>{});
/** The hang and firing cues only (strain creaks and pops are ambient). */
const events=(sound:MockInstance<LauncherAudio['play']>)=>sound.mock.calls.filter(c=>c[3]==='tell'||c[3]==='fire');
describe('launcher feedback',()=>{
 it('plays every station\'s hang then firing once per activation, including an empty launch, without replaying snapshots',()=>{
  const scene=new THREE.Scene(),view=new PressureMachine(scene);
  const sound=spy(view);
  view.update({serial:0,levels:{},launches:[]},900);
  const all=(value:number)=>Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,value]));
  const hanging={serial:0,levels:all(10),blowing:all(1100),boosts:{fan:1100},launches:[]};
  view.update(hanging,1000);view.update(hanging,1050);
  expect(events(sound).map(c=>[c[0],c[3]])).toEqual(LAUNCH_MACHINES.map(m=>[m.kind,'tell']));
  const state={serial:6,levels:{},fired:all(1100),boosts:{fan:1100},launches:[]};
  view.update(state,1200);view.update(state,1250);
  expect(events(sound).slice(6).map(c=>[c[0],c[3],c[4]])).toEqual(LAUNCH_MACHINES.map(m=>[m.kind,'fire',m.kind==='fan']));
  view.update(state,7000);expect(events(sound)).toHaveLength(12);
  view.dispose();expect(scene.children).toHaveLength(0);
 });
 it('does not play historical activations when joining during a cooldown',()=>{
  const view=new PressureMachine(new THREE.Scene());
  const sound=spy(view);
  view.update({serial:1,levels:{},fired:{pressure:1000},launches:[]},1100);
  expect(events(sound)).toEqual([]);view.dispose();
 });
});
