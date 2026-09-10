import {afterEach,expect,it,vi} from 'vitest';
import {bindIncidentAudio,disposeIncidentAudio,playDelayedThud,playPopcornPop,startCaseBuzz} from '../../src/audio/IncidentAudio';
afterEach(()=>{disposeIncidentAudio();vi.unstubAllGlobals();});
async function fixture(){
 const nodes:any[]=[],gains:any[]=[];
 const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});
 const ctx:any={state:'running',currentTime:0,sampleRate:24000,createBuffer:vi.fn((_channels:number,frames:number)=>({getChannelData:()=>new Float32Array(frames)})),destination:{},decodeAudioData:vi.fn(async()=>({})),
  createGain:()=>{const gain={gain:param(),connect:vi.fn(),disconnect:vi.fn()};gains.push(gain);return gain;},
  createBufferSource:()=>{const n={context:ctx,playbackRate:param(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),loop:false,onended:null};nodes.push(n);return n;}};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));
 bindIncidentAudio(ctx);await vi.waitFor(()=>expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4));
 return {ctx,nodes,gains};
}
it('preloads once, bounds overlapping cues, and frees ended voices',async()=>{
 const {ctx,nodes}=await fixture();bindIncidentAudio(ctx);
 for(let i=0;i<20;i++)playPopcornPop();
 expect(fetch).toHaveBeenCalledTimes(4);expect(nodes).toHaveLength(10);
 nodes[0].onended();playPopcornPop();expect(nodes).toHaveLength(11);
 disposeIncidentAudio();expect(nodes[10].stop).toHaveBeenCalled();
});
it('keeps exactly one saw loop and stops it when the incident ends',async()=>{
 const {nodes}=await fixture();startCaseBuzz(true);startCaseBuzz(true);
 expect(nodes).toHaveLength(1);expect(nodes[0].loop).toBe(true);
 startCaseBuzz(false);expect(nodes[0].stop).toHaveBeenCalledTimes(1);
});
it('does not start cues while the shared context is suspended',async()=>{
 const {ctx,nodes}=await fixture();ctx.state='suspended';
 playPopcornPop();startCaseBuzz(true);expect(nodes).toHaveLength(0);
 ctx.state='running';startCaseBuzz(true);expect(nodes).toHaveLength(1);
});

it('renders the delayed thud once per context, then reuses the identical PCM buffer',async()=>{
 const {ctx,nodes}=await fixture();
 for(let i=0;i<20;i++){playDelayedThud();nodes.at(-1).onended();}
 expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
 expect(new Set(nodes.map(n=>n.buffer)).size).toBe(1);
});

it('keeps nearby popcorn full and applies the accepted mild world fade, including height',async()=>{
 const {ctx,nodes,gains}=await fixture();bindIncidentAudio(ctx,{x:10,y:20,z:30});
 playPopcornPop({x:10,y:25,z:30});playPopcornPop({x:110,y:20,z:30});playPopcornPop({x:10,y:270,z:30});
 expect(gains.map(g=>g.gain.value)).toEqual([.82,.82*.925,.82*.8]);
 expect(nodes.every(n=>n.playbackRate.value>=.97&&n.playbackRate.value<=1.03)).toBe(true);
});

it('fades delayed wall thuds without regenerating PCM and disconnects every output on teardown',async()=>{
 const {ctx,gains}=await fixture();bindIncidentAudio(ctx,{x:0,y:10,z:0});
 playDelayedThud({x:0,y:10,z:0});playDelayedThud({x:0,y:260,z:0});
 expect(gains.map(g=>g.gain.value)).toEqual([1,.8]);expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
 disposeIncidentAudio();expect(gains.every(g=>g.disconnect.mock.calls.length===1)).toBe(true);
});

it('smoothly follows the nearest case with one loop and avoids scheduling identical frame gains',async()=>{
 const {ctx,nodes,gains}=await fixture();bindIncidentAudio(ctx,{x:0,y:0,z:0});
 startCaseBuzz(true,{x:0,y:0,z:0});
 expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.055,.12);
 startCaseBuzz(true,{x:0,y:250,z:0});
 expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(.055*.8,0,.08);
 for(let i=0;i<600;i++)startCaseBuzz(true,{x:0,y:250,z:0});
 expect(nodes).toHaveLength(1);expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledTimes(1);
 bindIncidentAudio(ctx,{x:0,y:250,z:0});startCaseBuzz(true,{x:0,y:250,z:0});
 expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(.055,0,.08);
 startCaseBuzz(false);nodes[0].onended();expect(gains[0].disconnect).toHaveBeenCalledTimes(1);
});

it('retains the requested case distance when loading finishes after the incident starts',async()=>{
 const {ctx,nodes,gains}=await fixture();disposeIncidentAudio();
 bindIncidentAudio(ctx,{x:10,y:0,z:0});startCaseBuzz(true,{x:260,y:0,z:0});
 expect(nodes).toHaveLength(0);
 await vi.waitFor(()=>expect(nodes).toHaveLength(1));
 expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(.055*.8,.12);
});
