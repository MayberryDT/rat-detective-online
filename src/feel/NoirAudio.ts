import type * as THREE from 'three';
import {effectsOutput} from '../audio/PlayerAudioMix';

const OPEN=20000;

/** Polish 10 audio: muffle the world mix as health drops, and a synthesized
 * heartbeat at the last hit point. Inserted after the listener's own gain so
 * every spatial effect is muffled; Effects/Master volume still apply. */
export class NoirAudio {
    private filter?:BiquadFilterNode;
    private echo?:{send:GainNode;delay:DelayNode;feedback:GainNode;tone:BiquadFilterNode};
    private beatAt=0;
    /** Listener surroundings (polish 17): sewers echo, landmark interiors are muffled. */
    space:'open'|'sewer'|'interior'='open';
    spaceMix={interiorCutoff:5200,echo:.26};

    constructor(private readonly listener:THREE.AudioListener){}

    /** `danger` 0 (healthy) … 1 (last hit point). `closed` is the muffled cutoff in Hz. */
    update(dt:number,danger:number,closed:number,period:number,volume:number):void {
        const context=this.listener.context;
        if(!this.filter&&danger<=0&&this.space==='open')return;
        if(context?.state!=='running'||typeof context.createBiquadFilter!=='function')return;
        const filter=this.ensureFilter();
        const muffle=danger>0?OPEN*Math.pow(closed/OPEN,danger):OPEN;
        const target=Math.min(muffle,this.space==='interior'?this.spaceMix.interiorCutoff:OPEN);
        filter.frequency.setTargetAtTime(target,context.currentTime,.12);
        this.echo?.send.gain.setTargetAtTime(this.space==='sewer'?this.spaceMix.echo:0,context.currentTime,.25);
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
        if(this.echo){for(const node of Object.values(this.echo))node.disconnect();this.echo=undefined;}
    }

    private ensureFilter():BiquadFilterNode {
        if(this.filter)return this.filter;
        const context=this.listener.context,out=effectsOutput(context);
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=OPEN;filter.Q.value=.5;
        this.listener.gain.disconnect();this.listener.gain.connect(filter);filter.connect(out);
        this.filter=filter;
        // A short, damped slap-back for the sewers; silent until the listener is below ground.
        const send=context.createGain(),delay=context.createDelay(1),feedback=context.createGain(),tone=context.createBiquadFilter();
        send.gain.value=0;delay.delayTime.value=.19;feedback.gain.value=.34;tone.type='lowpass';tone.frequency.value=1800;
        filter.connect(send);send.connect(delay);delay.connect(tone);tone.connect(feedback);feedback.connect(delay);tone.connect(out);
        this.echo={send,delay,feedback,tone};
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
