import {afterEach,expect,it,vi} from 'vitest';
import {bindIncidentAudio,disposeIncidentAudio,playMalfunctionShot,playPopcornPop,startCaseBuzz} from '../../src/audio/IncidentAudio';
afterEach(()=>{disposeIncidentAudio();vi.unstubAllGlobals();});
async function fixture(){
 const nodes:any[]=[];
 const param=()=>({value:0,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});
 const ctx:any={state:'running',currentTime:0,destination:{},decodeAudioData:vi.fn(async()=>({})),
  createGain:()=>({gain:param(),connect:vi.fn(),disconnect:vi.fn()}),
  createBufferSource:()=>{const n={context:ctx,playbackRate:param(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),loop:false,onended:null};nodes.push(n);return n;}};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));
 bindIncidentAudio(ctx);await vi.waitFor(()=>expect(ctx.decodeAudioData).toHaveBeenCalledTimes(5));
 return {ctx,nodes};
}
it('preloads once, bounds overlapping cues, and frees ended voices',async()=>{
 const {ctx,nodes}=await fixture();bindIncidentAudio(ctx);
 for(let i=0;i<20;i++)playMalfunctionShot();
 expect(fetch).toHaveBeenCalledTimes(5);expect(nodes).toHaveLength(10);
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
