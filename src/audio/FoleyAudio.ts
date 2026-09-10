import * as THREE from 'three';
import {AudioVoicePool} from './AudioVoicePool';
import {FOLEY,type FoleyCue,type FoleyPlay} from './foleyCatalog';
import {worldSoundGain} from './worldSoundGain';

type Point={x:number;y:number;z:number};
type Voice={sound:THREE.Audio;pan:StereoPannerNode;cue:FoleyCue;origin?:Point;gain:number};
/** Brief world accents and fuller menu/result cues. No ambient loops or backlog. */
export class FoleyAudio {
    private readonly pool:AudioVoicePool;
    private readonly voices=new Set<Voice>();
    private readonly panners=new Map<THREE.Audio,StereoPannerNode>();
    private readonly buffers=new Map<FoleyCue,AudioBuffer>();
    private readonly last=new Map<string,number>();
    private readonly ear=new THREE.Vector3();
    private readonly right=new THREE.Vector3(1,0,0);
    private disposed=false;
    private enabled=true;
    private worldAt=-Infinity;
    constructor(private readonly listener:THREE.AudioListener){
        this.pool=new AudioVoicePool(listener,8);
        const loader=new THREE.AudioLoader(),pending=(Object.keys(FOLEY) as FoleyCue[])
            .sort((a,b)=>FOLEY[b].priority-FOLEY[a].priority)[Symbol.iterator]();
        const next=()=>{
            if(this.disposed)return;
            const item=pending.next();if(item.done)return;
            loader.load(`/sounds/chaos/${item.value}.wav`,buffer=>{if(!this.disposed)this.buffers.set(item.value,buffer);next();},undefined,
                ()=>{if(!this.disposed)console.warn(`Foley unavailable: ${item.value}`);next();});
        };
        for(let i=0;i<4;i++)next();
    }
    update(position:Point,right:Point={x:1,y:0,z:0}):void {
        this.ear.set(position.x,position.y,position.z);this.right.set(right.x,right.y,right.z);
        if(!this.enabled||this.listener.context.state!=='running'){this.stopAll();return;}
        for(const voice of this.voices)this.position(voice);
    }
    setEnabled(enabled:boolean):void {this.enabled=enabled;if(!enabled){this.stopAll();this.last.clear();this.worldAt=-Infinity;}}
    private distanceGain(cue:FoleyCue,origin?:Point):number {
        if(!origin)return FOLEY[cue].range===0?1:0;
        const distance=Math.hypot(origin.x-this.ear.x,origin.y-this.ear.y,origin.z-this.ear.z),range=FOLEY[cue].range;
        if(!Number.isFinite(distance)||range<=0)return 0;
        const rangeGain=distance<=6?1:Math.max(0,1-(distance-6)/(range-6))**2;
        return worldSoundGain(distance,rangeGain);
    }
    private position(voice:Voice):void {
        let pan=0;
        if(voice.origin){
            const dx=voice.origin.x-this.ear.x,dy=voice.origin.y-this.ear.y,dz=voice.origin.z-this.ear.z;
            const length=Math.hypot(dx,dy,dz);
            if(length>1)pan=Math.max(-.85,Math.min(.85,(dx*this.right.x+dy*this.right.y+dz*this.right.z)/length));
        }
        voice.pan.pan.setTargetAtTime(pan,this.listener.context.currentTime,.015);
        voice.sound.setVolume(voice.gain*this.distanceGain(voice.cue,voice.origin));
    }
    readonly play:FoleyPlay=(cue,origin,options={})=>{
        const config=FOLEY[cue],buffer=this.buffers.get(cue),ctx=this.listener.context;
        if(this.disposed||!this.enabled||!buffer||ctx.state!=='running')return;
        const gain=config.volume*Math.max(0,Math.min(1.3,options.gain??1));
        if(!Number.isFinite(gain)||gain*this.distanceGain(cue,origin)<.004)return;
        const now=ctx.currentTime*1000,key=cue+':'+(options.key??''),world=config.range>0;
        if(now-(this.last.get(key)??-Infinity)<config.cooldown||now-(this.last.get(cue)??-Infinity)<Math.min(180,config.cooldown))return;
        // Let the short result-screen phrase finish without layering other new
        // cues over it. Reset/hide still stops the bus.
        if([...this.voices].some(v=>v.cue==='victory'))return;
        if(cue==='victory')this.stopAll();
        if(cue==='name-stamp')for(const voice of this.voices)if(voice.cue==='name-tick')this.release(voice);
        if(world&&(now-this.worldAt<160||[...this.voices].filter(v=>v.origin).length>=3))return;
        if(this.voices.size>=8){
            const victim=[...this.voices].find(v=>v.origin);
            if(world||!victim)return;this.release(victim);
        }
        const sound=this.pool.acquire();if(!sound)return;
        let pan=this.panners.get(sound);
        if(!pan){pan=ctx.createStereoPanner();sound.gain.disconnect();sound.gain.connect(pan);pan.connect(this.listener.getInput());this.panners.set(sound,pan);}
        const voice:Voice={sound,pan,cue,origin:origin?{...origin}:undefined,gain};
        this.voices.add(voice);sound.setBuffer(buffer);sound.setLoop(false);
        // Fixed playback by default; no random pitch variation.
        const rate=options.rate??1;sound.setPlaybackRate(Math.max(.65,Math.min(1.5,Number.isFinite(rate)?rate:1)));
        this.position(voice);sound.onEnded=()=>{this.pool.finish(sound);this.voices.delete(voice);};
        try{sound.play();}catch{this.release(voice);return;}
        this.last.delete(key);this.last.set(key,now);this.last.set(cue,now);if(world)this.worldAt=now;
        while(this.last.size>128)this.last.delete(this.last.keys().next().value!);
    };
    private release(voice:Voice):void {if(this.voices.delete(voice))this.pool.release(voice.sound);}
    private stopAll():void {for(const voice of this.voices)this.release(voice);}
    dispose():void {
        if(this.disposed)return;this.disposed=true;this.stopAll();this.pool.dispose();
        for(const pan of this.panners.values())pan.disconnect();this.panners.clear();this.buffers.clear();this.last.clear();
    }
}
