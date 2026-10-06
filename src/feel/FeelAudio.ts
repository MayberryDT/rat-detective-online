import {effectsOutput} from '../audio/PlayerAudioMix';

export type Surface='pavement'|'water'|'metal'|'wood';
export type Sting='case'|'delivery';

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
    private readonly combatGains=new Set<GainNode>();
    resetCombat():void {for(const gain of this.combatGains)gain.disconnect();this.combatGains.clear();}
    private combatOut(volume:number,duration:number):GainNode {
        const gain=this.out(volume,0,duration);this.combatGains.add(gain);
        setTimeout(()=>this.combatGains.delete(gain),(duration+.08)*1000);return gain;
    }
    /** Heavy cheese review: dry pressure attack, hollow push, sticky air. No borrowed sample. */
    pressure():void {
        if(!this.allow('pressure',.025))return;
        const t=this.context.currentTime,out=this.combatOut(.38,.18);
        this.burst(out,t,.018,'highpass',1900,.7,.001);
        this.tone(out,t,.095,'triangle',360,125,.85);
        this.tone(out,t,.07,'sine',175,95,.8);
        this.burst(out,t+.012,.105,'bandpass',850,2,.002);
    }
    /** Confirmed body contact only: broad slap + mass + descending wet formant. */
    bodySmack():void {
        if(!this.allow('body-smack',.025))return;
        const t=this.context.currentTime,out=this.combatOut(.34,.22);
        this.burst(out,t,.026,'bandpass',1850,.65,.001);
        this.tone(out,t,.13,'sine',260,85,1.15);
        const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),env=this.context.createGain();
        source.buffer=this.white();filter.type='bandpass';filter.Q.value=3.5;
        filter.frequency.setValueAtTime(1900,t);filter.frequency.exponentialRampToValueAtTime(350,t+.13);
        env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(.85,t+.008);env.gain.exponentialRampToValueAtTime(.001,t+.17);
        source.connect(filter).connect(env).connect(out);source.start(t,Math.random()*.4,.18);
    }

    arsenal(kind:'laser'|'tommy-gun'|'mousetrap'|'pickup'|'trap-snap'|'trap-release'|'laser-hit'|'tommy-hit'|'laser-pickup'|'tommy-pickup'|'trap-pickup'):void {
        if(this.combatGains.size>=12)return;
        if(!this.allow('arsenal-'+kind,kind==='tommy-gun'?.035:kind==='tommy-hit'?.045:.08))return;
        const t=this.context.currentTime;
        if(kind==='tommy-gun'){
            // CHUK, then the bolt's dry return. Short enough to leave gaps at 20/s.
            const out=this.combatOut(.27,.09);
            this.burst(out,t,.012,'bandpass',1250,.7,.001);
            this.tone(out,t,.04,'triangle',430+Math.random()*25,115,.95);
            this.tone(out,t,.032,'sine',185,80,.8);
            this.burst(out,t+.026,.013,'highpass',2600,1,.001);
        }else if(kind==='laser'){
            // A heavy pressure punch underneath a tearing, descending electrical strand.
            const out=this.combatOut(.32,.32);
            this.tone(out,t,.11,'sine',310,65,1.05);
            this.burst(out,t,.022,'bandpass',1450,.7,.001);
            this.tone(out,t,.21,'sawtooth',1850,180,.4);
            this.tone(out,t+.012,.16,'triangle',720,140,.4);
            this.burst(out,t+.035,.19,'bandpass',2100,7,.003);
            this.burst(out,t+.17,.055,'lowpass',650,1,.002);
        }else if(kind==='trap-snap'){
            const out=this.combatOut(.34,.36);
            this.burst(out,t,.018,'highpass',2200,.8,.001);
            this.tone(out,t,.15,'triangle',155,48,1.1);
            this.burst(out,t+.008,.07,'bandpass',430,1,.001);
            this.tone(out,t+.016,.24,'sine',1120,740,.3);
            this.tone(out,t+.024,.19,'sine',1670,1130,.18);
            this.burst(out,t+.09,.04,'bandpass',750,2,.002);
        }else if(kind==='laser-hit'||kind==='tommy-hit'){
            const out=this.combatOut(.18,kind==='laser-hit'?.2:.07);
            this.burst(out,t,kind==='laser-hit'?.12:.035,'bandpass',kind==='laser-hit'?3100:550,3,.001);
            this.tone(out,t,.06,'triangle',kind==='laser-hit'?700:180,90,.6);
        }else if(kind==='trap-release'){
            const out=this.combatOut(.18,.2);
            this.tone(out,t,.13,'sine',430,860,.4);
            this.burst(out,t,.025,'bandpass',1100,3,.001);
        }else if(kind==='pickup'||kind.endsWith('-pickup')){
            // Board/receiver weight first; spring/coil catches into the hand afterwards.
            const out=this.combatOut(.3,.3);
            this.tone(out,t,.12,'triangle',190,65,.9);
            this.burst(out,t,.03,'bandpass',550,1,.001);
            if(kind==='laser-pickup'){this.tone(out,t+.035,.23,'sawtooth',240,1100,.22);this.burst(out,t+.045,.12,'bandpass',2400,5,.002);}
            else if(kind==='tommy-pickup'){this.burst(out,t+.04,.025,'bandpass',1100,1,.001);this.burst(out,t+.11,.02,'highpass',2300,2,.001);this.tone(out,t+.08,.08,'triangle',300,90,.5);}
            else {this.tone(out,t+.045,.17,'sine',660,1050,.5);this.tone(out,t+.05,.2,'sine',1320,1570,.18);}
            this.burst(out,t+.09,.025,'highpass',2200,2,.001);
        }else{
            const out=this.combatOut(.32,.27);
            this.tone(out,t,.13,'triangle',145,55,1);
            this.burst(out,t,.055,'bandpass',500,.8,.001);
            this.tone(out,t+.015,.22,'sine',870,530,.3);
            this.burst(out,t+.075,.024,'bandpass',1400,3,.001);
        }
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
    /** Juice T4: a headshot. A hard wooden knock, a falling whistle and a short bell ring. */
    headshot(volume:number,pan=0):void {
        if(!this.allow('headshot',.12))return;
        const at=this.context.currentTime,out=this.out(volume,pan,1.1);
        const knock=this.context.createBufferSource(),band=this.context.createBiquadFilter(),env=this.context.createGain();
        knock.buffer=this.white();band.type='bandpass';band.frequency.value=900;band.Q.value=3;
        env.gain.setValueAtTime(1,at);env.gain.exponentialRampToValueAtTime(.001,at+.07);
        knock.connect(band).connect(env).connect(out);knock.start(at);knock.stop(at+.08);
        this.tone(out,at,.09,'square',220,70,.5);
        this.tone(out,at+.02,.38,'sine',1760,620,.22);
        for(const f of [1318.5,1975.5])this.tone(out,at+.05,.9,'triangle',f,f*.996,.12);
    }
    /** Juice T5: a flashbulb pop, then the bulb's short whine. */
    flashbulb(volume:number):void {
        if(!this.allow('flashbulb',.2))return;
        const at=this.context.currentTime,out=this.out(volume,0,.6);
        const pop=this.context.createBufferSource(),high=this.context.createBiquadFilter(),env=this.context.createGain();
        pop.buffer=this.white();high.type='highpass';high.frequency.value=2500;
        env.gain.setValueAtTime(1,at);env.gain.exponentialRampToValueAtTime(.001,at+.09);
        pop.connect(high).connect(env).connect(out);pop.start(at);pop.stop(at+.1);
        this.tone(out,at+.03,.5,'sine',5200,3900,.08);
    }
    /** A dry click: the hammer falls on nothing, then a sad spring (a shorted-out gun's trigger). */
    jam(volume:number):void {
        if(!this.allow('jam',.08))return;
        const at=this.context.currentTime,out=this.out(volume,0,.5);
        this.burst(out,at,.02,'highpass',2600,1,.001);
        this.burst(out,at+.07,.015,'highpass',3400,1,.001);
        this.tone(out,at+.09,.35,'triangle',520,180,.18);
    }
    /** A supply snatched: a quick whoosh up and a bright double click, like a flashbulb latch. */
    supplyClaim(volume:number,pan:number):void {
        if(!this.allow('supply-claim',.08))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.5);
        this.burst(out,at,.18,'bandpass',1800,1.2,.03);
        this.tone(out,at,.2,'sine',520,1560,.25);
        this.burst(out,at+.16,.02,'highpass',4200,.8,.001);this.burst(out,at+.21,.02,'highpass',3600,.8,.001);
    }
    /** A supply lamp clicks back on: a switch, a warm thump and a short filament hum. */
    lampOn(volume:number,pan:number):void {
        if(!this.allow('lamp-on',.1))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.6);
        this.burst(out,at,.02,'highpass',3000,.9,.001);
        this.tone(out,at+.02,.18,'sine',120,70,.35);
        this.tone(out,at+.04,.4,'sawtooth',60,60,.06);this.tone(out,at+.06,.35,'triangle',659.25,659.25,.08);
    }
    /** The Hunch comes on: a low muted-trumpet "aha", then a bright rising sparkle. */
    hunchGained(volume:number):void {
        if(!this.allow('hunch-on',.6))return;
        const at=this.context.currentTime,out=this.out(volume,0,1.3);
        const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2600;filter.Q.value=1.5;filter.connect(out);
        this.tone(filter,at,.28,'sawtooth',196,196,.22);this.tone(filter,at,.28,'sawtooth',246.9,246.9,.16);
        for(const [i,f] of [[0,783.99],[1,987.77],[2,1174.66],[3,1567.98]] as const)this.tone(out,at+.12+i*.06,.7,'triangle',f,f*1.002,.13);
        this.burst(out,at+.1,.35,'highpass',6000,.7,.02);
    }
    /** The Hunch breaks: a cracking snap and a sour falling slide. */
    hunchLost(volume:number):void {
        if(!this.allow('hunch-off',.4))return;
        const at=this.context.currentTime,out=this.out(volume,0,.9);
        this.burst(out,at,.05,'highpass',2400,.8,.001);this.burst(out,at+.03,.12,'bandpass',900,2,.005);
        this.tone(out,at+.02,.6,'triangle',880,392,.2);this.tone(out,at+.02,.6,'triangle',830.6,370,.12);
    }
    /** The Hunch: a camera shutter. Two dry clicks around a short film-advance whirr. */
    shutter(volume:number):void {
        if(!this.allow('shutter',.35))return;
        const at=this.context.currentTime,out=this.out(volume,0,.3);
        this.burst(out,at,.018,'highpass',3800,.8,.001);
        this.burst(out,at+.02,.09,'bandpass',1400,6,.01);
        this.burst(out,at+.085,.022,'highpass',3000,.8,.001);
    }
    /** The Hunch: you've been made. A high, tense violin pair sliding up a hair, with a low pizzicato. */
    made(volume:number):void {
        if(!this.allow('made',1))return;
        const at=this.context.currentTime,out=this.out(volume,0,1.2);
        const filter=this.context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=2200;filter.Q.value=.9;filter.connect(out);
        for(const [f,d] of [[1318.5,0],[1396.9,.03]])this.tone(filter,at+d,.9,'sawtooth',f,f*1.035,.22);
        this.tone(out,at,.25,'triangle',98,92,.5);
    }
    /** Music stings: case pickup, your delivery. */
    sting(kind:Sting,volume:number):void {
        if(!this.allow(`sting:${kind}`,1.5))return;
        const at=this.context.currentTime,out=this.out(volume,0,1.4);
        const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1800;filter.connect(out);
        if(kind==='case'){this.tone(filter,at,.18,'square',293.7,293.7,.25);this.tone(filter,at+.16,.32,'square',392,392,.25);}
        else for(const f of [196,246.9,293.7,392])this.tone(filter,at,.9,'sawtooth',f,f,.16);
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
    /** A shot body's limbs jolt: a rubbery squeak. */
    squeak(volume:number,pan:number):void {
        if(!this.allow('squeak',.06))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.3),pitch=1300+Math.random()*500;
        this.tone(out,at,.09,'sine',pitch,pitch*1.7,.8);
        this.tone(out,at+.07,.12,'triangle',pitch*1.6,pitch*.9,.5);
    }
    /** A launched rat's scream: a squeaky vibrato wail that climbs then trails off. */
    scream(volume:number,pan:number):void {
        if(!this.allow('scream',.25))return;
        const at=this.context.currentTime,out=this.out(volume,pan,1.3);
        const osc=this.context.createOscillator(),env=this.context.createGain(),vibrato=this.context.createOscillator(),depth=this.context.createGain();
        const pitch=900+Math.random()*500;
        osc.type='sawtooth';osc.frequency.setValueAtTime(pitch,at);osc.frequency.linearRampToValueAtTime(pitch*1.6,at+.25);osc.frequency.exponentialRampToValueAtTime(pitch*.7,at+1.1);
        vibrato.frequency.value=11;depth.gain.value=pitch*.06;vibrato.connect(depth);depth.connect(osc.frequency);
        const filter=this.context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=pitch*1.4;filter.Q.value=2.5;
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.04);env.gain.setValueAtTime(.8,at+.6);env.gain.exponentialRampToValueAtTime(.001,at+1.15);
        osc.connect(filter);filter.connect(env);env.connect(out);osc.start(at);vibrato.start(at);osc.stop(at+1.2);vibrato.stop(at+1.2);
    }
    /** A launched rat hitting the street: body thump, crunch of pavement and a short rumble. */
    landingThud(volume:number,pan:number,heavy:number):void {
        if(!this.allow('landing-thud',.08))return;
        const at=this.context.currentTime,out=this.out(volume,pan,.9);
        this.tone(out,at,.35+heavy*.2,'sine',120,38,1);
        this.tone(out,at,.12,'triangle',260,90,.5);
        this.burst(out,at,.25+heavy*.3,'lowpass',900+heavy*600,1.2,.002);
        this.burst(out,at+.02,.18,'bandpass',2400,2,.002);
    }
    /** The falling-bomb whistle of a thrown case, `seconds` long, sliding down. */
    whistle(volume:number,pan:number,seconds:number):void {
        if(!this.allow('whistle',.5))return;
        const at=this.context.currentTime,d=Math.max(.6,Math.min(4,seconds)),out=this.out(volume,pan,d+.1);
        const osc=this.context.createOscillator(),env=this.context.createGain();
        osc.type='sine';osc.frequency.setValueAtTime(2100,at);osc.frequency.exponentialRampToValueAtTime(420,at+d);
        env.gain.setValueAtTime(0,at);env.gain.linearRampToValueAtTime(1,at+.2);env.gain.setValueAtTime(1,at+d-.08);env.gain.linearRampToValueAtTime(0,at+d);
        osc.connect(env);env.connect(out);osc.start(at);osc.stop(at+d+.02);
    }
    /** Continuous wind while flying, `level` 0…1. */
    setWind(level:number,volume:number):void {this.loop('wind',level,volume,400+level*900,.7);}
    /** Pressure Surge: a deep city-wide rumble that rises with `level` 0…1. */
    setRumble(level:number,volume:number):void {this.loop('rumble',level,volume,45+level*50,.9);}
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
