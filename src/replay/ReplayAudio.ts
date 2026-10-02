import * as THREE from 'three';
import type { Vec3Data } from '../shared/networkProtocol';
import type { EntitySoundBus } from '../audio/EntityAudio';
import { FEEDBACK_CUES, type FeedbackCue } from '../audio/FeedbackAudio';
import { GUNSHOT_VOLUME, type GunshotCue } from '../audio/GunshotAudio';
import { synthBuffer, type SynthCue } from '../audio/IncidentAudio';
import { REPLAY_ROUTE, fadeLiveWorld, replayStream } from '../audio/PlayerAudioMix';
import { worldSoundGain } from '../audio/worldSoundGain';

/** The recorded world cues a replay plays: the case, armour, the Laser and the Mousetrap (UI and your own claims never). */
const WORLD_CUES:readonly FeedbackCue[]=['case-hit','case-grip-1','case-grip-2','armor-clang','laser-fire','laser-hit','trap-set','trap-snap','trap-splinter','trap-break'];
const GUNSHOT_FILES:Record<Exclude<GunshotCue,'malfunction'|'tommy'>,string>={normal:'/sounds/gunshot.mp3',shotgun:'/sounds/weapons/scattershot.wav'};
const TOMMY_ROUNDS=4;

interface Voice {source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode;level:number;cut():void}

/** An exhibit replay's sounds (docs/replay/playback.md): the game's own recordings and synths, placed from the
 * director's camera, on the replay bus with its own voice budget. One per session; `begin`/`end` bracket a replay
 * (the live world fades under it) and `stopAll` leaves no voice behind. */
export class ReplayAudio implements EntitySoundBus {
    private readonly buffers=new Map<string,AudioBuffer>();
    private readonly voices=new Set<Voice>();
    private readonly ear=new THREE.Vector3();
    private readonly right=new THREE.Vector3(1,0,0);
    private tommy=0;
    private disposed=false;
    /** While a replay seeks to its start, nothing sounds. */
    muted=false;
    constructor(private readonly context:AudioContext) {}

    /** Load the recordings once (the browser caches what the live game already fetched). */
    private load():void {
        if(this.buffers.size)return;
        const loader=new THREE.AudioLoader();
        const files=[...WORLD_CUES.map(cue=>`/sounds/feedback/${FEEDBACK_CUES[cue].file}.wav`),...Object.values(GUNSHOT_FILES),
            ...Array.from({length:TOMMY_ROUNDS},(_,i)=>`/sounds/weapons/tommy-${i}.wav`)];
        for(const file of files)loader.load(file,buffer=>{if(!this.disposed)this.buffers.set(file,buffer);},undefined,()=>{});
    }
    begin():void {this.load();fadeLiveWorld(this.context,true);}
    end():void {this.stopAll();fadeLiveWorld(this.context,false);}
    /** The replay bus as a stream, for saving. */
    stream():MediaStream {return replayStream(this.context);}
    /** Where the replay is heard from: the director's camera. */
    listen(camera:THREE.Camera):void {camera.getWorldPosition(this.ear);this.right.setFromMatrixColumn(camera.matrixWorld,0);}

    /** A rat's hit or death (RatEntity's bus). */
    play(buffer:AudioBuffer,volume:number,origin?:Vec3Data):void {this.voice(buffer,volume,origin);}
    gunshot(origin:Vec3Data,cue:GunshotCue):void {
        const file=cue==='tommy'?`/sounds/weapons/tommy-${this.tommy++%TOMMY_ROUNDS}.wav`:cue==='shotgun'?GUNSHOT_FILES.shotgun:GUNSHOT_FILES.normal;
        const buffer=this.buffers.get(file);
        if(buffer)this.voice(buffer,GUNSHOT_VOLUME,origin,cue==='malfunction'?1.45:cue==='normal'?1:.95+Math.random()*.1);
    }
    readonly synth=(cue:SynthCue,origin?:Vec3Data,pitch=1,volume=1):void=>{this.voice(synthBuffer(this.context,cue),volume,origin,pitch);};
    readonly feedback=(cue:FeedbackCue,origin?:Vec3Data):void=>{
        if(!WORLD_CUES.includes(cue))return;
        const {file,volume,rate=1}=FEEDBACK_CUES[cue],buffer=this.buffers.get(`/sounds/feedback/${file}.wav`);
        if(buffer)this.voice(buffer,volume,origin,rate);
    };

    private voice(buffer:AudioBuffer,volume:number,origin?:Vec3Data,rate=1):void {
        const ctx=this.context;
        if(this.disposed||this.muted||ctx.state!=='running')return;
        let level=volume,pan=0;
        if(origin){
            const dx=origin.x-this.ear.x,dy=origin.y-this.ear.y,dz=origin.z-this.ear.z,distance=Math.hypot(dx,dy,dz);
            level*=worldSoundGain(distance);
            pan=Math.max(-.85,Math.min(.85,(dx*this.right.x+dy*this.right.y+dz*this.right.z)/Math.max(1,distance)));
        }
        if(level<.001)return;
        const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();
        const voice:Voice={source,gain,pan:panner,level,cut:()=>this.release(voice)};
        if(!REPLAY_ROUTE.admit(ctx,voice))return;
        source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;panner.pan.value=pan;
        source.connect(gain);gain.connect(panner);panner.connect(REPLAY_ROUTE.output(ctx));
        source.onended=voice.cut;this.voices.add(voice);
        try{source.start();}catch{this.release(voice);}
    }
    private release(voice:Voice):void {
        if(!this.voices.delete(voice))return;
        REPLAY_ROUTE.end(this.context,voice);
        voice.source.onended=null;
        try{voice.source.stop();}catch{/* Never started or already ended. */}
        voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect();
    }
    stopAll():void {for(const voice of [...this.voices])this.release(voice);}
    dispose():void {this.end();this.disposed=true;this.buffers.clear();}
}
