import type * as THREE from 'three';
import {effectsOutput} from '../audio/PlayerAudioMix';

const OPEN=20000;

/** Polish 10 audio: muffle the world mix as health drops, and a synthesized
 * heartbeat at the last hit point. Inserted after the listener's own gain so
 * every spatial effect is muffled; Effects/Master volume still apply. */
export class NoirAudio {
    private filter?:BiquadFilterNode;
    private beatAt=0;

    constructor(private readonly listener:THREE.AudioListener){}

    /** `danger` 0 (healthy) … 1 (last hit point). `closed` is the muffled cutoff in Hz. */
    update(dt:number,danger:number,closed:number,period:number,volume:number):void {
        const context=this.listener.context;
        if(!this.filter&&danger<=0)return;
        if(context?.state!=='running'||typeof context.createBiquadFilter!=='function')return;
        const filter=this.ensureFilter();
        const target=danger>0?OPEN*Math.pow(closed/OPEN,danger):OPEN;
        filter.frequency.setTargetAtTime(target,context.currentTime,.12);
        if(danger<.9||volume<=0){this.beatAt=0;return;}
        this.beatAt-=dt;
        if(this.beatAt>0)return;
        this.beatAt=period;
        this.thump(context,0,volume);this.thump(context,.17,volume*.7);
    }

    reset():void {
        this.beatAt=0;
        if(this.filter)this.filter.frequency.setTargetAtTime(OPEN,this.listener.context.currentTime,.05);
    }

    dispose():void {
        if(!this.filter)return;
        const out=effectsOutput(this.listener.context);
        this.listener.gain.disconnect();this.filter.disconnect();
        this.listener.gain.connect(out);this.filter=undefined;
    }

    private ensureFilter():BiquadFilterNode {
        if(this.filter)return this.filter;
        const context=this.listener.context,out=effectsOutput(context);
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=OPEN;filter.Q.value=.5;
        this.listener.gain.disconnect();this.listener.gain.connect(filter);filter.connect(out);
        this.filter=filter;
        return filter;
    }

    /** One low "lub"/"dub": a sine pitch drop with a fast decay, outside the muffle. */
    private thump(context:AudioContext,delay:number,volume:number):void {
        const at=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();
        osc.type='sine';osc.frequency.setValueAtTime(68,at);osc.frequency.exponentialRampToValueAtTime(38,at+.16);
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);
        osc.connect(gain);gain.connect(effectsOutput(context));
        osc.start(at);osc.stop(at+.25);
        osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
}
