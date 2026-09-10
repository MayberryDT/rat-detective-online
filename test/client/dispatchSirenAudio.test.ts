import {describe,it,expect,vi} from 'vitest';
import {DispatchSirenAudio} from '../../src/audio/DispatchSirenAudio';
function fixture(){
 const nodes:any[]=[],gains:any[]=[];
 const ctx:any={state:'running',currentTime:0,sampleRate:24000,destination:{},
  createBuffer:vi.fn((_channels:number,frames:number)=>({getChannelData:()=>new Float32Array(frames)})),
  createGain:()=>{const gain={gain:{value:0},connect:vi.fn(),disconnect:vi.fn()};gains.push(gain);return gain;},
  createBufferSource:()=>{const source={buffer:null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};nodes.push(source);return source;}};
 return {audio:new DispatchSirenAudio(ctx),ctx,nodes,gains};
}
describe('nearby Dispatch readiness siren',()=>{
 it('plays one nearby ready cue, reuses its buffer and bounds periodic repetition',()=>{
  const {audio,ctx,nodes}=fixture();for(let i=0;i<600;i++)audio.update(true,5);
  expect(nodes).toHaveLength(1);nodes[0].onended();ctx.currentTime=3.9;audio.update(true,5);expect(nodes).toHaveLength(1);
  ctx.currentTime=4;audio.update(true,5);expect(nodes).toHaveLength(2);expect(nodes[1].buffer).toBe(nodes[0].buffer);
  expect(ctx.createBuffer).toHaveBeenCalledTimes(1);audio.dispose();
 });
 it('is silent while unavailable, out of range or autoplay-blocked, and never resumes the context',()=>{
  const {audio,ctx,nodes}=fixture();audio.update(false,0);audio.update(true,85);audio.update(true,Infinity);audio.update(true,NaN);
  ctx.state='suspended';ctx.resume=vi.fn();audio.update(true,0);expect(nodes).toHaveLength(0);expect(ctx.resume).not.toHaveBeenCalled();
  ctx.state='running';audio.update(true,10);expect(nodes).toHaveLength(1);audio.dispose();
 });
 it('fades with distance, including a zero-distance ceiling',()=>{
  const {audio,ctx,nodes,gains}=fixture();audio.update(true,0);expect(gains[0].gain.value).toBe(.38);
  nodes[0].onended();ctx.currentTime=4;audio.update(true,20);expect(gains[1].gain.value).toBeCloseTo(.38*(1-8/73));audio.dispose();
 });
 it('cuts off when triggered or when leaving, then announces a fresh ready cycle',()=>{
  const {audio,nodes,gains}=fixture();audio.update(true,0);audio.update(false,0);
  expect(nodes[0].stop).toHaveBeenCalledTimes(1);expect(nodes[0].disconnect).toHaveBeenCalledTimes(1);expect(gains[0].disconnect).toHaveBeenCalledTimes(1);
  audio.update(true,0);expect(nodes).toHaveLength(2);audio.update(true,90);expect(nodes[1].stop).toHaveBeenCalledTimes(1);audio.dispose();
 });
 it('does not queue missed calls and releases every output on disposal',()=>{
  const {audio,ctx,nodes,gains}=fixture();audio.update(true,0);nodes[0].onended();ctx.currentTime=600;audio.update(true,0);
  expect(nodes).toHaveLength(2);audio.dispose();audio.update(true,0);expect(nodes).toHaveLength(2);
  expect(nodes[1].stop).toHaveBeenCalledTimes(1);expect(gains.every(g=>g.disconnect.mock.calls.length===1)).toBe(true);
 });
});
