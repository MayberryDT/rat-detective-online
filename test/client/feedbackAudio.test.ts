import {worldSoundGain} from '../../src/audio/worldSoundGain';
import {afterEach,expect,it,vi} from 'vitest';
import {FeedbackAudio} from '../../src/audio/FeedbackAudio';
import type {AudioListener} from 'three';
const state=vi.hoisted(()=>({loads:[] as Array<(b:AudioBuffer)=>void>,sounds:[] as any[]}));
vi.mock('three',async original=>({...await original<typeof import('three')>(),
 AudioLoader:class{load(_url:string,done:(b:AudioBuffer)=>void){state.loads.push(done);}},
 Audio:class{
  isPlaying=false;volume=0;gain={disconnect:vi.fn()};setBuffer(){}setPlaybackRate=vi.fn();setVolume(v:number){this.volume=v;}play(){this.isPlaying=true;}
  stop=vi.fn(()=>{this.isPlaying=false;});disconnect=vi.fn();onEnded=()=>{this.isPlaying=false;};
  constructor(){state.sounds.push(this);}
 }
}));
let audio:FeedbackAudio;
afterEach(()=>{audio?.dispose();state.loads.length=0;state.sounds.length=0;});
function fixture(){
 const context={state:'running',currentTime:0};
 audio=new FeedbackAudio({context,getWorldPosition:(p:any)=>p.set(0,0,0)} as unknown as AudioListener);
 state.loads.forEach(load=>load({} as AudioBuffer));return context;
}
it('debounces repeated snapshots/collision chatter but keeps ownership changes distinct',()=>{
 const ctx=fixture();audio.play('case-pickup');audio.play('case-pickup');audio.play('case-lost');
 expect(state.sounds).toHaveLength(2);expect(state.sounds[0].volume).toBe(.6);
 ctx.currentTime=.2;audio.play('case-pickup');expect(state.sounds).toHaveLength(3);
});
it('bounds chatter without blocking a fresh important cue and cleans every voice',()=>{
 const ctx=fixture();for(let i=0;i<30;i++){ctx.currentTime+=.1;audio.play('case-hit',{x:50,y:0,z:0});}
 expect(state.sounds).toHaveLength(6);expect(state.sounds[0].volume).toBeCloseTo(.48*worldSoundGain(50));
 audio.play('case-pickup');audio.play('case-lost');audio.play('death');
 expect(state.sounds.filter(s=>s.isPlaying)).toHaveLength(8);expect(state.sounds.at(-1).isPlaying).toBe(true);
 state.sounds.at(-1).onEnded();audio.dispose();expect(state.sounds.filter(s=>s.isPlaying)).toHaveLength(0);
 expect(state.sounds.every(s=>s.gain.disconnect.mock.calls.length===1)).toBe(true);
 expect(state.sounds).toHaveLength(8);
});
it('drops suspended events and ignores delayed loads after disposal',()=>{
 const ctx=fixture();ctx.state='suspended';audio.play('death');expect(state.sounds).toHaveLength(0);
 ctx.state='running';audio.play('respawn');expect(state.sounds).toHaveLength(1);
 audio.dispose();state.loads.forEach(load=>load({} as AudioBuffer));audio.play('death');expect(state.sounds).toHaveLength(1);
});
