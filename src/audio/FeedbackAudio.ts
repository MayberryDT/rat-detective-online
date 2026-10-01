import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {worldSoundGain} from './worldSoundGain';
import {AudioVoicePool} from './AudioVoicePool';
export type FeedbackCue='pickup-ironclad'|'pickup-hustle'|'pickup-quick-fix'|'pickup-stakeout'|'pickup-tommy-gun'|'pickup-laser'|'pickup-mousetrap'|'pickup-slap'|'armor-clang'|'stakeout-shutter'|'pip-tick'|'case-pickup'|'case-lost'|'case-taken'|'case-drop'|'case-hit'|'case-grip-1'|'case-grip-2'|'laser-fire'|'laser-hit'|'trap-set'|'trap-snap'|'trap-splinter'|'trap-break'|'trap-refused'|'menu-open'|'menu-close'|'death'|'respawn'|'victory'|'dispatch'|'ready'|'tick'|'notice'|'case-point'|'verified'|'countdown'|'countdown-final';
const cues:Record<FeedbackCue,{file:string;volume:number;cooldown:number;rate?:number}>={
    'pickup-ironclad':{file:'pickup-ironclad',volume:.7,cooldown:150},
    'pickup-hustle':{file:'pickup-hustle',volume:.65,cooldown:150},
    'pickup-quick-fix':{file:'pickup-quick-fix',volume:.65,cooldown:150},
    'pickup-stakeout':{file:'pickup-stakeout',volume:.65,cooldown:150},
    // The arsenal (protocol 27): claims and the Laser's pulp ray-gun zap and crack (scripts/generate-pickup-sounds.py);
    // the Mousetrap's foley is cut from the cartoon recordings (scripts/generate-feedback-sounds.py).
    'pickup-tommy-gun':{file:'pickup-tommy-gun',volume:.65,cooldown:150},
    'pickup-laser':{file:'pickup-laser',volume:.65,cooldown:150},
    'pickup-mousetrap':{file:'pickup-mousetrap',volume:.65,cooldown:150},
    'laser-fire':{file:'laser-fire',volume:.6,cooldown:50},
    'laser-hit':{file:'laser-hit',volume:.5,cooldown:50},
    'trap-set':{file:'trap-set',volume:.55,cooldown:120},
    'trap-snap':{file:'trap-snap',volume:.85,cooldown:80},
    'trap-splinter':{file:'trap-splinter',volume:.32,cooldown:45},
    'trap-break':{file:'trap-break',volume:.6,cooldown:150},
    'trap-refused':{file:'trap-refused',volume:.45,cooldown:150},
    'pickup-slap':{file:'pickup-slap',volume:.58,cooldown:100},
    'armor-clang':{file:'armor-clang',volume:.8,cooldown:75},
    'stakeout-shutter':{file:'stakeout-shutter',volume:.35,cooldown:40},
    'pip-tick':{file:'pip-tick',volume:.18,cooldown:40},
    // The case's own foley (1 October, scripts/generate-pickup-sounds.py): yours, lost, someone else's, knocked loose, shot.
    'case-pickup':{file:'case-claim',volume:.72,cooldown:150},
    'case-lost':{file:'case-dropped',volume:.62,cooldown:150},
    'case-taken':{file:'case-snatched',volume:.34,cooldown:300},
    'case-drop':{file:'case-loose',volume:.36,cooldown:300},
    'case-hit':{file:'case-thwack',volume:.5,cooldown:90},
    // A carried case taking a hit without coming loose: a knock and latch rattle, rising as the grip weakens.
    'case-grip-1':{file:'case-knock',volume:.62,cooldown:60,rate:1.15},
    'case-grip-2':{file:'case-knock',volume:.75,cooldown:60,rate:1.4},
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
        // Rapid impact/ledger/claim-payoff chatter never crowds out ownership or death cues.
        if(this.voices.size>=6&&(cue==='case-hit'||cue==='tick'||cue==='notice'||cue==='stakeout-shutter'||cue==='pip-tick'||cue==='trap-splinter'))return;
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
