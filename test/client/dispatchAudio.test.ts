import {describe,it,expect,vi,type Mock} from 'vitest';
import {effectsOutput} from '../../src/audio/PlayerAudioMix';
import {DispatchAudio,DISPATCH_VOICES} from '../../src/audio/DispatchAudio';

interface FakeSource {buffer:unknown;loop:boolean;playbackRate:{value:number};connect:()=>void;disconnect:Mock;start:Mock;stop:Mock;onended:null|(()=>void)}
function fixture(){
 const sources:FakeSource[]=[],node=()=>({connect:vi.fn(),disconnect:vi.fn(),gain:{value:0,setTargetAtTime:vi.fn()},pan:{value:0}});
 const ctx={state:'running',currentTime:0,sampleRate:8000,destination:{},resume:vi.fn(),
  createBuffer:vi.fn((_channels:number,frames:number)=>({getChannelData:()=>new Float32Array(frames)})),
  createGain:node,createStereoPanner:node,
  createBufferSource:()=>{const source:FakeSource={buffer:null,loop:false,playbackRate:{value:1},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};sources.push(source);return source;}};
 effectsOutput(ctx as unknown as AudioContext);
 const live=()=>sources.filter(s=>s.stop.mock.calls.length===0);
 return {audio:new DispatchAudio(ctx as unknown as AudioContext),ctx,sources,live};
}
describe('Dispatch pillar audio',()=>{
 it('whoops each siren slot once per cycle from one reused buffer, the second slot half a cycle later',()=>{
  const {audio,ctx,sources}=fixture();
  for(let i=0;i<300;i++){audio.siren(0,.38,0);audio.siren(1,.2,.5);}
  expect(sources).toHaveLength(1);
  sources[0]!.onended!();ctx.currentTime=2;audio.siren(0,.38,0);audio.siren(1,.2,.5);expect(sources).toHaveLength(2);
  ctx.currentTime=4;audio.siren(0,.38,0);expect(sources).toHaveLength(3);expect(sources[2]!.buffer).toBe(sources[0]!.buffer);
  expect(ctx.createBuffer).toHaveBeenCalledTimes(1);audio.dispose();
 });
 it('is silent while the context is suspended, never resumes it, and does not queue missed cues',()=>{
  const {audio,ctx,sources}=fixture();ctx.state='suspended';
  audio.siren(0,.38,0);audio.bell(0,1,.3,0);audio.play('squawk',.2);
  expect(sources).toHaveLength(0);expect(ctx.resume).not.toHaveBeenCalled();
  ctx.state='running';audio.bell(0,-1,0,0);expect(sources).toHaveLength(0);audio.dispose();
 });
 it('keeps each bell slot on its pillar and restarts it only for a different pillar',()=>{
  const {audio,sources,live}=fixture();
  for(let frame=0;frame<60;frame++)for(let slot=0;slot<DISPATCH_VOICES.bell;slot++)audio.bell(slot,slot,.3,0);
  expect(sources).toHaveLength(DISPATCH_VOICES.bell);expect(sources.every(s=>s.loop)).toBe(true);
  audio.bell(0,7,.3,0);expect(sources[0]!.stop).toHaveBeenCalled();expect(live()).toHaveLength(DISPATCH_VOICES.bell);
  audio.bell(1,-1,0,0);expect(live()).toHaveLength(DISPATCH_VOICES.bell-1);audio.dispose();expect(live()).toHaveLength(0);
 });
 it('bounds one-shot cues, dropping the oldest',()=>{
  const {audio,live}=fixture();
  for(let i=0;i<20;i++)audio.play(i%2?'clank':'tick',.4);
  expect(live()).toHaveLength(DISPATCH_VOICES.cue);audio.dispose();expect(live()).toHaveLength(0);
 });
});
