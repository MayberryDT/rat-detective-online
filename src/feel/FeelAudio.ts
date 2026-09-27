import {effectsOutput} from '../audio/PlayerAudioMix';

export type Surface='pavement'|'water'|'metal'|'wood';
export type Sting='case'|'delivery'|'closing';

const MAX_VOICES=6;

/** Polish 17: restrained, synthesized feel cues (no new asset files). Every cue
 * is short, bounded to a small voice budget with per-cue cooldowns, and routed
 * through the effects bus so Master/Effects volume apply. Nothing queues: a cue
 * that cannot play now is dropped. */
export class FeelAudio {
    private noise?:AudioBuffer;
    private voices=0;
    private readonly lastAt=new Map<string,number>();

    constructor(private readonly context:AudioContext){}

    private ready():boolean {
        // Offline contexts (the workshop's WAV cue sheet) render while "suspended".
        const offline=typeof OfflineAudioContext!=='undefined'&&this.context instanceof OfflineAudioContext;
        return (offline||this.context.state==='running')&&typeof this.context.createBiquadFilter==='function';
    }
    private allow(key:string,cooldown:number):boolean {
        if(!this.ready()||this.voices>=MAX_VOICES)return false;
        const now=this.context.currentTime;
        if(now-(this.lastAt.get(key)??-1e9)<cooldown)return false;
        this.lastAt.set(key,now);return true;
    }
    private white():AudioBuffer {
        if(this.noise)return this.noise;
        const buffer=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate),data=buffer.getChannelData(0);
        let seed=1234567;
        for(let i=0;i<data.length;i++){seed=(seed*1103515245+12345)&0x7fffffff;data[i]=seed/0x3fffffff-1;}
        return this.noise=buffer;
    }
    /** Output chain: gain → optional pan → effects bus. Returns the input node. */
    private out(volume:number,pan:number,duration:number):GainNode {
        const gain=this.context.createGain();gain.gain.value=volume;
        let tail:AudioNode=gain;
        if(pan!==0&&typeof this.context.createStereoPanner==='function'){const p=this.context.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));gain.connect(p);tail=p;}
        tail.connect(effectsOutput(this.context));
        this.voices++;
        setTimeout(()=>{this.voices--;gain.disconnect();if(tail!==gain)tail.disconnect();},duration*1000+80);
        return gain;
    }
    private burst(into:AudioNode,at:number,duration:number,type:BiquadFilterType,frequency:number,q:number,attack=.004):void {
        const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),env=this.context.createGain();
        source.buffer=this.white();source.playbackRate.value=.8+Math.random()*.4;
        filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+attack);env.gain.exponentialRampToValueAtTime(.001,at+duration);
        source.connect(filter);filter.connect(env);env.connect(into);
        source.start(at,Math.random()*.5,duration+.02);
    }
    private tone(into:AudioNode,at:number,duration:number,type:OscillatorType,from:number,to:number,level=1):void {
        const osc=this.context.createOscillator(),env=this.context.createGain();
        osc.type=type;osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),at+duration);
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(level,at+.01);env.gain.exponentialRampToValueAtTime(.001,at+duration);
        osc.connect(env);env.connect(into);osc.start(at);osc.stop(at+duration+.02);
    }

    /** One footstep on a surface. */
    step(key:string,surface:Surface,volume:number,pan:number):void {
        if(!this.allow(`step:${key}`,.12))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.3);
        if(surface==='water'){this.burst(out,at,.22,'bandpass',1400,.8,.01);this.burst(out,at+.03,.12,'highpass',3200,.6);}
        else if(surface==='metal'){this.burst(out,at,.05,'highpass',2500,.7);this.tone(out,at,.18,'triangle',1180+Math.random()*200,1100,.25);}
        else if(surface==='wood'){this.burst(out,at,.06,'lowpass',900,.9);this.tone(out,at,.1,'sine',190,120,.5);}
        else {this.burst(out,at,.05,'bandpass',1800+Math.random()*500,1.1);this.burst(out,at,.07,'lowpass',420,.7);}
    }
    /** Coat swish on a burst start or sharp turn. */
    rustle(volume:number):void {
        if(!this.allow('rustle',.5))return;
        const at=this.context.currentTime,out=this.out(volume,0,.35);
        const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),env=this.context.createGain();
        source.buffer=this.white();filter.type='bandpass';filter.Q.value=.9;
        filter.frequency.setValueAtTime(900,at);filter.frequency.exponentialRampToValueAtTime(2600,at+.22);
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.08);env.gain.exponentialRampToValueAtTime(.001,at+.3);
        source.connect(filter);filter.connect(env);env.connect(out);source.start(at,Math.random()*.5,.32);
    }
    /** Case rattle when a carrier lands. */
    jostle(volume:number):void {
        if(!this.allow('jostle',.35))return;
        const at=this.context.currentTime,out=this.out(volume,0,.2);
        this.tone(out,at,.05,'square',1650,1500,.35);this.tone(out,at+.055,.05,'square',1320,1250,.25);
    }
    /** Wet cheese layer on a hit. */
    squelch(volume:number,pan:number):void {
        if(!this.allow('squelch',.08))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.3);
        const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),env=this.context.createGain();
        source.buffer=this.white();filter.type='lowpass';filter.Q.value=6;
        filter.frequency.setValueAtTime(2400,at);filter.frequency.exponentialRampToValueAtTime(260,at+.16);
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.006);env.gain.exponentialRampToValueAtTime(.001,at+.2);
        source.connect(filter);filter.connect(env);env.connect(out);source.start(at,Math.random()*.5,.22);
        this.tone(out,at,.12,'sine',340,90,.35);
    }
    /** A ball passing close to your head. */
    whizz(volume:number,pan:number):void {
        if(!this.allow('whizz',.09))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.3);
        const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),env=this.context.createGain();
        source.buffer=this.white();filter.type='bandpass';filter.Q.value=8;
        filter.frequency.setValueAtTime(2600,at);filter.frequency.exponentialRampToValueAtTime(700,at+.22);
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.09);env.gain.exponentialRampToValueAtTime(.001,at+.24);
        source.connect(filter);filter.connect(env);env.connect(out);source.start(at,Math.random()*.5,.26);
    }
    /** Short noir brass stab for your kill. */
    brass(volume:number):void {
        if(!this.allow('brass',.25))return;
        const at=this.context.currentTime,out=this.out(volume,0,.6);
        const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.Q.value=2;
        filter.frequency.setValueAtTime(2400,at);filter.frequency.exponentialRampToValueAtTime(500,at+.45);filter.connect(out);
        for(const [f,d] of [[146.8,-6],[174.6,5],[220,-3],[293.7,4]])this.tone(filter,at,.5,'sawtooth',f*Math.pow(2,d/1200),f*Math.pow(2,d/1200)*.985,.28);
    }
    /** Music stings: case pickup, your delivery, closing seconds. */
    sting(kind:Sting,volume:number):void {
        if(!this.allow(`sting:${kind}`,kind==='closing'?20:1.5))return;
        const at=this.context.currentTime,out=this.out(volume,0,1.4);
        const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1800;filter.connect(out);
        if(kind==='case'){this.tone(filter,at,.18,'square',293.7,293.7,.25);this.tone(filter,at+.16,.32,'square',392,392,.25);}
        else if(kind==='delivery'){for(const f of [196,246.9,293.7,392])this.tone(filter,at,.9,'sawtooth',f,f,.16);}
        else for(let i=0;i<6;i++){this.tone(filter,at+i*.2,.12,'triangle',110,104,.4);this.tone(filter,at+i*.2+.1,.08,'square',880,860,.08);}
    }
    /** Distant thunder: a slow low rumble. */
    thunder(volume:number):void {
        if(!this.allow('thunder',4))return;
        const at=this.context.currentTime,out=this.out(volume,0,3.2);
        const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),env=this.context.createGain();
        source.buffer=this.white();source.loop=true;source.playbackRate.value=.5;filter.type='lowpass';filter.frequency.value=180;filter.Q.value=.6;
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.25);env.gain.setValueAtTime(.8,at+.9);env.gain.exponentialRampToValueAtTime(.001,at+3);
        source.connect(filter);filter.connect(env);env.connect(out);source.start(at);source.stop(at+3.1);
    }
    /** Continuous wind while flying, `level` 0…1. */
    setWind(level:number,volume:number):void {this.loop('wind',level,volume,400+level*900,.7);}
    /** Noir rain on the city, `level` 0…1 (muffled indoors by the world mix). */
    setRain(level:number,volume:number):void {this.loop('rain',level,volume,3200,.4);}

    private readonly loops=new Map<string,{source:AudioBufferSourceNode;filter:BiquadFilterNode;gain:GainNode}>();
    /** A looped filtered-noise bed that fades in and out; stopped once silent. */
    private loop(name:string,level:number,volume:number,frequency:number,q:number):void {
        if(!this.ready())return;
        let bed=this.loops.get(name);
        if(level<=.001&&!bed)return;
        if(!bed){
            const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();
            source.buffer=this.white();source.loop=true;filter.type='bandpass';filter.Q.value=q;filter.frequency.value=frequency;gain.gain.value=0;
            source.connect(filter);filter.connect(gain);gain.connect(effectsOutput(this.context));source.start();
            bed={source,filter,gain};this.loops.set(name,bed);
        }
        const at=this.context.currentTime;
        bed.gain.gain.setTargetAtTime(level*volume,at,.15);
        bed.filter.frequency.setTargetAtTime(frequency,at,.2);
        if(level<=.001){const done=bed;this.loops.delete(name);setTimeout(()=>{done.source.stop();done.source.disconnect();done.filter.disconnect();done.gain.disconnect();},600);}
    }
    dispose():void {for(const name of [...this.loops.keys()])this.loop(name,0,0,1,1);this.lastAt.clear();}
}
