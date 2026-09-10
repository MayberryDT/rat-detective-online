import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {FoleyAudio} from '../../src/audio/FoleyAudio';
import {FOLEY} from '../../src/audio/foleyCatalog';
vi.unmock('three');
const node=()=>({connect:vi.fn(),disconnect:vi.fn()});
const param=()=>({value:0,setTargetAtTime:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()});
function fixture(){
    const sources:any[]=[],gains:any[]=[],panners:any[]=[];
    const ctx:any={state:'running',currentTime:0,
        createGain:()=>{const n={...node(),gain:param()};gains.push(n);return n;},
        createBufferSource:()=>{const n={...node(),playbackRate:param(),detune:param(),start:vi.fn(),stop:vi.fn(),onended:null,loop:false};sources.push(n);return n;},
        createStereoPanner:()=>{const n={...node(),pan:param()};panners.push(n);return n;},
    };
    vi.spyOn(THREE.AudioLoader.prototype,'load').mockImplementation((url,onLoad)=>{onLoad?.({duration:url.includes('victory')?2.1:.2} as AudioBuffer);});
    const audio=new FoleyAudio({context:ctx,getInput:()=>({})} as THREE.AudioListener);
    return {audio,ctx,sources,gains,panners};
}
afterEach(()=>vi.restoreAllMocks());
it('keeps three world voices and eight total, leaving room for personal feedback',()=>{
    const {audio,ctx,sources,gains,panners}=fixture();
    for(let i=0;i<200;i++){ctx.currentTime+=.5;audio.play('jump',{x:0,y:0,z:-3});sources.at(-1).onended();}
    expect(gains).toHaveLength(1);expect(panners).toHaveLength(1);
    for(let i=0;i<10;i++){ctx.currentTime+=1;audio.play('case-floor',{x:0,y:0,z:-3},{key:String(i)});}
    expect((audio as any).voices.size).toBe(3);
    for(let i=0;i<10;i++){ctx.currentTime+=.2;audio.play('hit-confirm');}
    expect((audio as any).voices.size).toBe(8);expect(gains.length).toBeLessThanOrEqual(8);
    expect(panners.length).toBeLessThanOrEqual(8);audio.dispose();
    expect(gains.every(g=>g.disconnect.mock.calls.length>0)).toBe(true);expect(panners.every(p=>p.disconnect.mock.calls.length>0)).toBe(true);
});
it('gives the short noir victory phrase exclusive playback until it ends, without queuing other cues',()=>{
    const {audio,ctx,sources}=fixture();audio.play('jump',{x:0,y:0,z:-3});ctx.currentTime+=1;
    audio.play('victory');expect(sources[0].stop).toHaveBeenCalledOnce();expect((audio as any).voices.size).toBe(1);
    ctx.currentTime+=6;
    audio.play('victory');audio.play('respawn-tick');audio.play('hit-confirm');audio.play('case-floor',{x:0,y:0,z:-3});
    expect(sources).toHaveLength(2);
    sources[1].onended();audio.play('respawn-tick');expect(sources).toHaveLength(3);
    audio.setEnabled(false);expect((audio as any).voices.size).toBe(0);audio.dispose();
});
it('clears the name-roll clacks when the final stamp lands',()=>{
    const {audio,ctx,sources}=fixture();
    for(let i=0;i<3;i++){ctx.currentTime+=.055;audio.play('name-tick');}
    expect(sources).toHaveLength(3);audio.play('name-stamp');
    expect(sources.slice(0,3).every(s=>s.stop.mock.calls.length===1)).toBe(true);
    expect((audio as any).voices.size).toBe(1);audio.dispose();
});
it('makes world sources directional, updates with the camera, and centers personal cues',()=>{
    const {audio,ctx,sources,panners}=fixture();audio.update({x:0,y:0,z:0});
    audio.play('jump',{x:3,y:0,z:-3});expect(panners[0].pan.setTargetAtTime.mock.calls.at(-1)[0]).toBeGreaterThan(.5);
    audio.update({x:0,y:0,z:0},{x:-1,y:0,z:0});expect(panners[0].pan.setTargetAtTime.mock.calls.at(-1)[0]).toBeLessThan(-.5);
    sources[0].onended();ctx.currentTime+=1;audio.play('hit-confirm');expect(panners[0].pan.setTargetAtTime.mock.calls.at(-1)[0]).toBe(0);
    expect(sources.at(-1).playbackRate.setTargetAtTime).toHaveBeenCalledWith(1,ctx.currentTime,.01);audio.dispose();
});
it('rejects distant or missing world sources and never turns repeated events into a backlog',()=>{
    const {audio,ctx,sources}=fixture();audio.update({x:0,y:0,z:0});
    audio.play('case-floor',{x:100,y:0,z:0});audio.play('jump');audio.play('jump',{x:NaN,y:0,z:0});expect(sources).toHaveLength(0);
    for(let i=0;i<1000;i++)audio.play('case-floor',{x:1,y:0,z:-2},{key:String(i)});
    expect(sources).toHaveLength(1);ctx.state='suspended';audio.play('victory');expect(sources).toHaveLength(1);
    audio.setEnabled(false);ctx.state='running';audio.play('victory');expect(sources).toHaveLength(1);
    audio.setEnabled(true);ctx.currentTime+=1;audio.play('victory');expect(sources).toHaveLength(2);
    audio.dispose();ctx.currentTime+=2;audio.play('victory');expect(sources).toHaveLength(2);
});
it('loads only the 13 deliberate cues with at most four concurrent loads and ignores disposed completions',()=>{
    const loads:Array<(b:AudioBuffer)=>void>=[],urls:string[]=[];
    vi.spyOn(THREE.AudioLoader.prototype,'load').mockImplementation((url,onLoad)=>{urls.push(url);loads.push(onLoad!);});
    const audio=new FoleyAudio({context:{state:'running'}} as THREE.AudioListener);
    expect(loads).toHaveLength(4);expect(Object.keys(FOLEY)).toHaveLength(13);audio.dispose();
    for(const load of loads)load({} as AudioBuffer);expect(loads).toHaveLength(4);
    expect(Object.keys(FOLEY).some(cue=>/drip|drain|horn|step|fridge|launch|grow|charge|split|unstick|kill-confirm/.test(cue))).toBe(false);
});
