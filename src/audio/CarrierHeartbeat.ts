import {CHAOS_TUNING,type CaseState} from '../shared/chaosState';
import {sincePing} from '../shared/caseHeartbeat';
import {effectsOutput} from './PlayerAudioMix';

/** The beats of the hot case's heartbeat in one ping (`casePingMs`), `slow` far from the scoring target and `fast`
 * beside it (`urgency` 0…1), in whole beats so a beat always lands on the ping. */
export function beatsPerPing(urgency:number,slow:number,fast:number):number {
    return Math.round(slow+(fast-slow)*Math.max(0,Math.min(1,urgency)));
}

type Part='lub'|'dub'|'brush';
const SECONDS:Record<Part,number>={lub:.5,dub:.5,brush:.45};
/** Seconds of audio scheduled ahead of the frame, so each beat lands sample-accurately on its ping-locked time. */
const LOOKAHEAD=.12;

/** A noir lub-dub, rendered once per context: a muted upright bass thumbed a fourth down (A1, then E1) over a soft kick
 * body, and a brushed snare tail for the beat that lands on a ping. */
function render(context:BaseAudioContext,part:Part):AudioBuffer {
    const rate=context.sampleRate,buffer=context.createBuffer(1,Math.ceil(rate*SECONDS[part]),rate),pcm=buffer.getChannelData(0);
    let seed=part==='brush'?29:part==='lub'?11:17,fast=0,slow=0,max=0;
    const noise=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x3fffffff-1;};
    const f=part==='lub'?55:41.2,decay=part==='lub'?7:8.5;
    for(let i=0;i<pcm.length;i++){
        const t=i/rate,n=noise();
        let v:number;
        if(part==='brush'){
            // Wire brushes swept across a snare: a band of hiss swelling in, then settling away.
            fast+=(n-fast)*.4;slow+=(n-slow)*.05;
            v=(fast-slow)*Math.min(1,t/.03)*Math.exp(-t*8);
        }else{
            // The string sits a touch sharp as it is thumbed, then settles; upper partials die fast (a palm-muted bass).
            const phase=2*Math.PI*(f*t+f*.06*(1-Math.exp(-30*t))/30);
            const string=(Math.sin(phase)+.45*Math.sin(2*phase)*Math.exp(-t*6)+.18*Math.sin(3*phase)*Math.exp(-t*12))*Math.min(1,t/.004)*Math.exp(-t*decay);
            const kick=t<.3?Math.sin(2*Math.PI*(100*t-140*t*t))*Math.exp(-t*26):0;
            fast+=(n-fast)*.2;
            v=string*.8+kick*.7+fast*Math.exp(-t*180)*.5;
        }
        pcm[i]=v;max=Math.max(max,Math.abs(v));
    }
    if(max>0)for(let i=0;i<pcm.length;i++)pcm[i]=pcm[i]!/max;
    return buffer;
}

/** The heartbeat only the carrier hears (K3), on the effects bus: Master and Effects volume apply, it ducks nothing and
 * nothing ducks it, and a suspended context (the agent mute) plays nothing. Every beat is locked to the case's ping
 * clock (`HEARTBEAT`), so the beat that lands on a ping lands with the flash others see. */
export class CarrierHeartbeat {
    private buffers?:Record<Part,AudioBuffer>;
    private readonly live=new Map<AudioBufferSourceNode,GainNode>();
    /** Server time of the latest beat scheduled from the ping clock. */
    private lastBeat=-Infinity;
    /** Context time until which a surge owns the beat. */
    private surgeUntil=0;
    constructor(private readonly context:BaseAudioContext){}

    /** Each frame while you carry: schedules the next ping-locked beat when it falls within the lookahead. `now` is
     * server time; `volume` the plain beat's level, `accent` its multiplier on a ping. */
    update(c:CaseState,now:number,urgency:number,volume:number,accent:number,slow:number,fast:number):void {
        const since=sincePing(c,now);
        if(since===Infinity||this.context.state!=='running')return;
        const beats=beatsPerPing(urgency,slow,fast),period=CHAOS_TUNING.casePingMs/beats,base=now-since;
        const k=Math.ceil(since/period),at=base+k*period;
        // A new ping restarts the clock a tick or two off the predicted one: that beat was already played.
        if(at-now>LOOKAHEAD*1000||at-this.lastBeat<period*.5)return;
        this.lastBeat=at;
        const when=this.context.currentTime+Math.max(0,(at-now)/1000);
        if(when<this.surgeUntil)return;
        const ping=k%beats===0;
        this.beat(when,volume*(ping?accent:1),Math.min(.2,period/1000*.26),ping);
    }
    /** A kill while carrying: `count` quick, rising beats `gap` s apart, holding off the ping clock until they are done. */
    surge(count:number,gap:number,volume:number):void {
        if(this.context.state!=='running')return;
        const start=this.context.currentTime+.02;
        for(let i=0;i<count;i++)this.beat(start+i*gap,volume*(1+.25*i),Math.min(.12,gap*.4),i===count-1);
        this.surgeUntil=start+count*gap;
    }
    /** Silence at once (loss, death, reset): anything still sounding or scheduled is cut within a few milliseconds. */
    stop():void {
        const t=this.context.currentTime;
        for(const [source,gain] of this.live){
            source.onended=null;
            gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(gain.gain.value,t);gain.gain.linearRampToValueAtTime(0,t+.012);
            try{source.stop(t+.015);}catch{/* never started */}
            source.onended=()=>{source.disconnect();gain.disconnect();};
        }
        this.live.clear();this.lastBeat=-Infinity;this.surgeUntil=0;
    }
    dispose():void {this.stop();this.buffers=undefined;}

    private beat(when:number,volume:number,gap:number,brushed:boolean):void {
        const buffers=this.buffers??={lub:render(this.context,'lub'),dub:render(this.context,'dub'),brush:render(this.context,'brush')};
        this.voice(buffers.lub,when,volume);
        this.voice(buffers.dub,when+gap,volume*.7);
        if(brushed)this.voice(buffers.brush,when+.01,volume*.45);
    }
    private voice(buffer:AudioBuffer,when:number,volume:number):void {
        const source=this.context.createBufferSource(),gain=this.context.createGain();
        source.buffer=buffer;gain.gain.value=volume;
        source.connect(gain);gain.connect(effectsOutput(this.context));
        source.onended=()=>{this.live.delete(source);source.disconnect();gain.disconnect();};
        this.live.set(source,gain);source.start(when);
    }
}
