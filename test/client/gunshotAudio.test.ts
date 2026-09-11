import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {GunshotAudio,gunshotGain,GUNSHOT_VOLUME} from '../../src/audio/GunshotAudio';
const state=vi.hoisted(()=>({loads:[] as Array<(buffer:AudioBuffer)=>void>,sounds:[] as any[]}));
vi.mock('three',async original=>{
 const real=await original<typeof import('three')>();
 class Sound extends real.Object3D {
  isPlaying=false;volume=0;buffer?:AudioBuffer;gain={disconnect:vi.fn()};
  setBuffer(b:AudioBuffer){this.buffer=b;}setVolume(v:number){this.volume=v;}setPlaybackRate=vi.fn();
  play(){this.isPlaying=true;}stop=vi.fn(()=>{this.isPlaying=false;});disconnect=vi.fn();
  onEnded=()=>{this.isPlaying=false;};
  constructor(){super();state.sounds.push(this);}
 }
 return {...real,Audio:Sound,PositionalAudio:class extends Sound{setRolloffFactor=vi.fn();},
  AudioLoader:class{load(_url:string,done:(buffer:AudioBuffer)=>void){state.loads.push(done);}}};
});
const created:GunshotAudio[]=[];
afterEach(()=>{created.forEach(s=>s.dispose());created.length=0;state.loads.length=0;state.sounds.length=0;});
function fixture(){
 const ear=new THREE.Vector3(),context={state:'running'};
 const listener={context,getWorldPosition:(v:THREE.Vector3)=>v.copy(ear)} as THREE.AudioListener;
 const audio=new GunshotAudio(listener);created.push(audio);
 state.loads.slice(-1).forEach(load=>load({} as AudioBuffer));
 return {audio,ear,context};
}
it('restores the stronger pistol and gentler world fade while keeping distant fire faint',()=>{
 expect(gunshotGain(0)).toBe(1);expect(gunshotGain(8)).toBe(1);
 expect(gunshotGain(20)).toBe(1);expect(gunshotGain(25)).toBeGreaterThan(.99);
 expect(gunshotGain(50)).toBeGreaterThan(.55);expect(gunshotGain(50)).toBeLessThan(.56);
 expect(gunshotGain(100)).toBeLessThan(.165);expect(gunshotGain(100)).toBeGreaterThan(.164);
 expect(gunshotGain(250)).toBeLessThan(.029);expect(gunshotGain(250)).toBeGreaterThan(.028);
 expect(gunshotGain(500)).toBeLessThan(.01);expect(gunshotGain(500)).toBeGreaterThan(.009);
 for(let d=9;d<550;d++)expect(gunshotGain(d)).toBeLessThanOrEqual(gunshotGain(d-1));
 expect(gunshotGain(NaN)).toBe(0);expect(GUNSHOT_VOLUME).toBe(.4);
});
it('uses the listener and shot origin for remote normal and malfunction volume, preserving local volume',()=>{
 const {audio,ear}=fixture();ear.set(100,2,0);
 audio.play({x:100,y:2,z:0},false,'normal');audio.play({x:125,y:2,z:0},false,'normal');
 audio.play({x:125,y:2,z:0},false,'malfunction');audio.play({x:500,y:2,z:0},true,'normal');
 expect(state.sounds[0].volume).toBe(GUNSHOT_VOLUME);expect(state.sounds[1].volume).toBeCloseTo(GUNSHOT_VOLUME*gunshotGain(25));
 expect(state.sounds[2].volume).toBeCloseTo(GUNSHOT_VOLUME*gunshotGain(25));expect(state.sounds[3].volume).toBe(GUNSHOT_VOLUME);
 expect(state.sounds[2].buffer).toBe(state.sounds[0].buffer);
 expect(state.sounds[2].setPlaybackRate).toHaveBeenLastCalledWith(1.45);
 expect(state.sounds[3].setPlaybackRate).toHaveBeenLastCalledWith(1);
 // No directional panner can add a second reduction or change the gun's character.
 expect(state.sounds.every(sound=>!(sound instanceof THREE.PositionalAudio))).toBe(true);
 audio.play({x:200,y:2,z:0},false,'normal');expect(state.sounds).toHaveLength(5);expect(state.sounds[4].volume).toBeGreaterThan(0);
});
it('keeps your shot audible, bounds voices and lets nearer shots replace quieter ones',()=>{
 const {audio}=fixture();audio.play({x:0,y:0,z:0},true,'normal');const own=state.sounds[0];
 for(let i=0;i<20;i++)audio.play({x:25,y:0,z:0},false,'normal');
 expect(state.sounds.filter(s=>s.isPlaying)).toHaveLength(12);expect(own.stop).not.toHaveBeenCalled();
 const count=state.sounds.length;audio.play({x:30,y:0,z:0},false,'normal');expect(state.sounds).toHaveLength(count);
 audio.play({x:1,y:0,z:0},false,'normal');expect(state.sounds.at(-1).isPlaying).toBe(true);
 audio.dispose();expect(state.sounds.filter(s=>s.isPlaying)).toHaveLength(0);
});
it('cleans ended voices, ignores stale loads and never queues suspended shots',()=>{
 const {audio,context}=fixture();audio.play({x:0,y:0,z:0},true,'normal');
 state.sounds[0].onEnded();expect(state.sounds[0].disconnect).toHaveBeenCalledTimes(1);
 context.state='suspended';audio.play({x:0,y:0,z:0},true,'normal');expect(state.sounds).toHaveLength(1);
 audio.dispose();state.loads[0]({} as AudioBuffer);context.state='running';
 audio.play({x:0,y:0,z:0},true,'normal');expect(state.sounds).toHaveLength(1);
});
it('reuses one gun voice across repeated shots and restores normal pitch after Bad Ammunition',()=>{
 const {audio}=fixture();
 for(let i=0;i<200;i++){
  audio.play({x:0,y:0,z:0},true,i%2?'normal':'malfunction');
  expect(state.sounds[0].setPlaybackRate).toHaveBeenLastCalledWith(i%2?1:1.45);
  state.sounds[0].onEnded();
 }
 expect(state.sounds).toHaveLength(1);
 expect(state.sounds[0].disconnect).toHaveBeenCalledTimes(200);
 audio.dispose();expect(state.sounds[0].gain.disconnect).toHaveBeenCalledTimes(1);
});
