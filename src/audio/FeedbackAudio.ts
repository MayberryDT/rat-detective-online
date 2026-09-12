import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {worldSoundGain} from './worldSoundGain';
import {AudioVoicePool} from './AudioVoicePool';
export type FeedbackCue='pickup-ironclad'|'pickup-hustle'|'pickup-quick-fix'|'pickup-slap'|'armor-clang'|'case-pickup'|'case-lost'|'case-taken'|'case-drop'|'case-hit'|'menu-open'|'menu-close'|'death'|'respawn'|'victory'|'dispatch'|'ready'|'tick'|'notice'|'case-point'|'verified'|'countdown'|'countdown-final';
const cues:Record<FeedbackCue,{file:string;volume:number;cooldown:number;rate?:number}>={
    'pickup-ironclad':{file:'pickup-ironclad',volume:.7,cooldown:150},
    'pickup-hustle':{file:'pickup-hustle',volume:.65,cooldown:150},
    'pickup-quick-fix':{file:'pickup-quick-fix',volume:.65,cooldown:150},
    'pickup-slap':{file:'pickup-slap',volume:.58,cooldown:100},
    'armor-clang':{file:'armor-clang',volume:.8,cooldown:75},
    'case-pickup':{file:'case-pickup',volume:.6,cooldown:150},
    'case-lost':{file:'case-lost',volume:.6,cooldown:150},
    'case-taken':{file:'case-taken',volume:.24,cooldown:300},
    'case-drop':{file:'menu-close',volume:.22,cooldown:300},
    'case-hit':{file:'case-hit',volume:.48,cooldown:90},
    'menu-open':{file:'menu-open',volume:.24,cooldown:150},
    'menu-close':{file:'menu-close',volume:.18,cooldown:150},
    death:{file:'death',volume:.42,cooldown:500},
    respawn:{file:'respawn',volume:.34,cooldown:500},
    victory:{file:'case-pickup',volume:.4,cooldown:500},
    dispatch:{file:'dispatch',volume:.4,cooldown:300},
    ready:{file:'case-taken',volume:.24,cooldown:300},
    tick:{file:'tick',volume:.1,cooldown:65},
    'case-point':{file:'case-pickup',volume:.65,cooldown:100,rate:1.3},
    verified:{file:'dispatch',volume:.5,cooldown:200,rate:1.2},
    countdown:{file:'tick',volume:.3,cooldown:200},
    'countdown-final':{file:'tick',volume:.48,cooldown:200,rate:1.5},
    notice:{file:'menu-open',volume:.1,cooldown:200},
};
/** Edited cartoon foley, with no backlog and bounded overlap. */
export class FeedbackAudio {
    private readonly buffers=new Map<string,AudioBuffer>();
    private readonly voices=new Set<THREE.Audio>();
    private readonly last=new Map<FeedbackCue,number>();
    private readonly ear=new THREE.Vector3();
    private disposed=false;
    private readonly pool:AudioVoicePool;
    constructor(private readonly listener:THREE.AudioListener){
        this.pool=new AudioVoicePool(listener,8);
        const loader=new THREE.AudioLoader();
        for(const file of new Set(Object.values(cues).map(c=>c.file)))
            loader.load(`/sounds/feedback/${file}.wav`,buffer=>{if(!this.disposed)this.buffers.set(file,buffer);},undefined,
                ()=>{if(!this.disposed)console.warn(`Feedback sound could not load: ${file}`);});
    }
    play(cue:FeedbackCue,origin?:Vec3Data):void {
        const {file,volume,cooldown,rate=1}=cues[cue],buffer=this.buffers.get(file);
        if(this.disposed||!buffer||this.listener.context.state!=='running')return;
        const now=this.listener.context.currentTime*1000;
        if(now-(this.last.get(cue)??-Infinity)<cooldown)return;
        this.last.set(cue,now);
        let gain=1;
        if(origin){this.listener.getWorldPosition(this.ear);gain=worldSoundGain(Math.hypot(origin.x-this.ear.x,origin.y-this.ear.y,origin.z-this.ear.z));}
        // Rapid impact/ledger chatter never crowds out ownership or death cues.
        if(this.voices.size>=6&&(cue==='case-hit'||cue==='tick'||cue==='notice'))return;
        if(this.voices.size>=8)this.release(this.voices.values().next().value!);
        const sound=this.pool.acquire();if(!sound)return;
        sound.setBuffer(buffer);sound.setVolume(volume*gain);sound.setPlaybackRate(rate);
        sound.onEnded=()=>{this.pool.finish(sound);this.voices.delete(sound);};
        this.voices.add(sound);try{sound.play();}catch{this.release(sound);}
    }
    private release(sound:THREE.Audio):void{
        if(!this.voices.delete(sound))return;
        this.pool.release(sound);
    }
    dispose():void{this.disposed=true;for(const sound of this.voices)this.release(sound);this.pool.dispose();this.buffers.clear();this.last.clear();}
}
