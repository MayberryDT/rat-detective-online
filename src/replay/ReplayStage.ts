import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RemotePlayers } from '../session/RemotePlayers';
import { ChaosView } from '../presentation/ChaosView';
import { CameraBlockers } from '../player/CameraBlockers';
import { SHOULDER } from '../player/ShoulderCamera';
import { REPLAY_ROUTE } from '../audio/PlayerAudioMix';
import type { GunshotCue } from '../audio/GunshotAudio';
import { isolateRagdollWorld } from '../rat/RatCorpseChain';
import { Dust, registerDust } from '../feel/Dust';
import type { DeathStyle } from '../rat/RatAnimator';
import type { SnapshotPose } from '../shared/SnapshotBuffer';
import type { PlayerData, Vec3Data } from '../shared/networkProtocol';
import type { ChaosState } from '../shared/chaosState';
import { incidentInfo } from '../shared/incidentCatalog';
import { FAULTY_COPY, faultyOf, heldWeapon, trapped } from '../shared/pickups';
import { feelState } from '../feel/feelState';
import { FEEL } from '../feel/feelTuning';
import { ReplayAudio } from './ReplayAudio';
import { NoirCity } from '../feel/NoirCity';
import { ReplayDirector, type DirectorView } from './ReplayDirector';
import type { ClipData, RecordedEvent, ReplayRecorder } from './ReplayRecorder';
import type { ReplayClip, ReplayMode, ReplayPlayer } from './types';

/** Playback (docs/replay/playback.md, X3): rats and bodies are shown `viewDelay` ms behind the clip's clock, as live
 * play shows other rats; bodies step at `corpseStep` seconds. Each rat's look comes with its movement (protocol 39:
 * a player's camera, a bot's aim; smooth-play plan, R3); only a clip recorded without it falls back to its shots,
 * each shot's direction its look for `shotLook` ms either side. */
export const PLAYBACK={viewDelay:100,corpseStep:1/60,shotLook:500} as const;

export interface ReplayStageDeps {
    renderer:THREE.WebGLRenderer;
    /** The live scene: the replay draws its city, never its live rats and chaos. */
    scene:THREE.Scene;
    /** For the replay's audio context. Fallen bodies rest their limbs on the live city through the corpse chain's
     * ray world, which the replay's own (isolated) physics world never replaces. */
    listener:THREE.AudioListener;
    /** Scene children a replay draws: the city's scenery, the stage's lights and ground. */
    shared:(object:THREE.Object3D)=>boolean;
    /** The local rat's flashlight, dark while the replay draws (it lights the live rat, not the clip). */
    flashlight:THREE.SpotLight;
    recorder:ReplayRecorder;
}

const TRAP_CUES={launch:'pickup-slap',set:'trap-set',snap:'trap-snap',hit:'trap-splinter',break:'trap-break'} as const;
type Track={times:number[];poses:number[]};
const POSE:SnapshotPose={x:0,y:0,z:0,qx:0,qy:0,qz:0,qw:1};
const QA=new THREE.Quaternion(),QB=new THREE.Quaternion();
const HEAD=new THREE.Vector3(),IMPACT=new THREE.Vector3(),HIT=new THREE.Vector3(),SPRAY=new THREE.Vector3(),AIM=new THREE.Vector3();
const LOOK={look:AIM,exact:false};

/** One clip on the stage: everything it creates lives in its own scene, physics world, dust and pools, is kept across
 * its loops (`rewind`) and goes with `dispose`. */
class Playback {
    readonly scene=new THREE.Scene();
    private readonly world=new CANNON.World();
    private readonly dust:Dust;
    private readonly remotes:RemotePlayers;
    private readonly chaos:ChaosView;
    private director!:ReplayDirector;
    /** Whose eyes the clip is seen through. */
    get subject():string|undefined {return this.director?.subject;}
    private readonly view:DirectorView;
    private roster?:Extract<ClipData['entries'][number],{roster:unknown}>;
    private readonly tracks=new Map<string,Track>();
    private readonly events:{at:number;event:RecordedEvent}[]=[];
    /** Recorded looks by rat: your own aim samples (`own`), else its shots' directions. Sorted by time. */
    private readonly aims=new Map<string,{own:boolean;times:number[];dirs:Vec3Data[]}>();
    private next=0;
    private cut=true;
    private lastChaos:ChaosState|null=null;
    /** The clip's clock, server ms. */
    t=0;
    constructor(readonly data:ClipData,private readonly audio:ReplayAudio,context:AudioContext,private readonly blockers:CameraBlockers,private readonly camera:THREE.PerspectiveCamera) {
        this.scene.matrixAutoUpdate=false;this.scene.name='exhibit-replay';
        // The replay's rats never touch the live world: no collisions with your rat, no corpse ray world of theirs.
        isolateRagdollWorld(this.world);
        // Its rats, supplies and traps puff into its own dust (supply cues have no sink here: they stay silent).
        this.dust=new Dust(this.scene);registerDust(this.scene,this.dust);
        this.remotes=new RemotePlayers(this.scene,this.world,()=>0);
        this.chaos=new ChaosView(this.scene,id=>this.remotes.get(id),context,true,audio.feedback,undefined,undefined,
            {clock:()=>this.t,synth:audio.synth,route:REPLAY_ROUTE,corpseStep:PLAYBACK.corpseStep,delay:PLAYBACK.viewDelay});
        this.chaos.onTrap=(event,trap)=>audio.feedback(TRAP_CUES[event],trap);
        // Case papers lie still in a replay (no city here to blow them through), on the program the game warmed.
        this.chaos.caseFiles.still=true;new NoirCity(new THREE.Scene()).adopt(this.chaos.caseFiles.root,true);
        for(const entry of data.entries){
            if('roster' in entry){this.roster??=entry;continue;}
            if('pose' in entry){const p=entry.pose;this.sample(p.id,entry.at,p);this.noteAim(p.id,entry.at,p.aim,true);continue;}
            const event=entry.event;
            if(event.type==='playerMoved'||event.type==='playerCorrected'){
                const p=event.player;this.sample(p.id,entry.at,{x:p.x,y:p.y,z:p.z,qx:p.meshQx,qy:p.meshQy,qz:p.meshQz,qw:p.meshQw});
                // Where it looked, exactly: the gameplay camera follows it.
                if(p.lookYaw!==undefined&&p.lookPitch!==undefined){const c=Math.cos(p.lookPitch);this.noteAim(p.id,entry.at,{x:Math.sin(p.lookYaw)*c,y:Math.sin(p.lookPitch),z:Math.cos(p.lookYaw)*c},true);}
                continue;
            }
            this.events.push({at:entry.at,event});
            if(event.type==='playerShot')this.noteAim(event.shooterId,entry.at,event.direction,false);
        }
        this.events.sort((a,b)=>a.at-b.at);
        for(const track of this.tracks.values())this.sortTrack(track);
        for(const aims of this.aims.values()){
            const order=aims.times.map((_,i)=>i).sort((a,b)=>aims.times[a]!-aims.times[b]!);
            aims.dirs=order.map(i=>aims.dirs[i]!);aims.times=order.map(i=>aims.times[i]!);
        }
        this.view={
            body:id=>{const rat=this.remotes.get(id);return rat&&!rat.dead?rat.mesh.position:this.chaos.corpseOf(id);},
            facing:id=>{const rat=this.remotes.get(id);return rat&&!rat.dead?rat.mesh.quaternion:undefined;},
            aim:id=>this.aim(id,this.t-PLAYBACK.viewDelay),
        };
        this.rewind();
    }

    /** Back to the clip's start: the rats from the roster keyframe, the view's moving things cleared, then everything
     * up to the start applied silently. The scene, its machines, pillars, pools and supply props stay, and so do the
     * rats: one in the roster takes its keyframe state as on a respawn (rebuilding them was most of each loop). */
    rewind():void {
        const started=performance.now();
        const clip=this.data.clip;
        // The view first, while its carrier and armed rats still exist; the rats are reset from the roster below.
        this.chaos.rewind();const viewAt=performance.now();
        const roster=this.roster?.roster??[],kept=new Set(roster.map(rat=>rat.data.id));
        for(const id of [...this.remotes.rats.keys()])if(!kept.has(id))this.remotes.remove(id);
        this.dust.clear();this.audio.stopAll();
        const clearedAt=performance.now();
        this.director=new ReplayDirector(clip,this.view,this.blockers);
        this.next=0;this.cut=true;this.lastChaos=null;
        this.t=this.roster?.at??clip.startAt;
        this.audio.muted=true;
        for(const rat of roster){
            const data={...rat.data,hp:rat.hp};
            if(!this.remotes.restart(data))this.join(data);
            if(rat.dead)this.remotes.get(rat.data.id)?.useSharedCorpse();
        }
        const joinedAt=performance.now();
        let lastChaos=-1;
        for(let i=0;i<this.events.length&&this.events[i]!.at<=clip.startAt;i++)if(this.events[i]!.event.type==='chaos')lastChaos=i;
        while(this.next<this.events.length&&this.events[this.next]!.at<=clip.startAt){
            const {at,event}=this.events[this.next]!;
            if(event.type!=='chaos'||this.next===lastChaos)this.apply(event,at,true);
            this.next++;
        }
        this.audio.muted=false;
        this.t=clip.startAt;
        // Timings for replay checks (scripts/verify-replay.mjs): a rewind is each loop's restart.
        performance.measure('replay-rewind',{start:started,end:performance.now()});
        performance.measure('replay-rewind-view',{start:started,end:viewAt});performance.measure('replay-rewind-clear',{start:viewAt,end:clearedAt});
        performance.measure('replay-rewind-rats',{start:clearedAt,end:joinedAt});performance.measure('replay-rewind-events',{start:joinedAt,end:performance.now()});
    }

    /** Advance by `dt` seconds on screen; false once the clip has ended. */
    update(dt:number):boolean {
        const scale=this.director.timeScale(this.t),clipDt=dt*scale;
        this.t=Math.min(this.data.clip.endAt,this.t+clipDt*1000);
        while(this.next<this.events.length&&this.events[this.next]!.at<=this.t){const {at,event}=this.events[this.next++]!;this.apply(event,at,false);}
        this.remotes.placeFrame(clipDt||1/60,id=>this.pose(id,this.t-PLAYBACK.viewDelay),this.cut);this.cut=false;
        this.remotes.presentFrame();
        this.director.frame(this.camera,dt);
        // The rat whose eyes these are looks as your own rat does in play (its outline and streak rules, its case cues).
        const pov=this.director.subject,own=pov&&this.remotes.get(pov);
        if(own&&!own.isPlayer)own.isPlayer=true;
        this.camera.updateMatrixWorld();this.audio.listen(this.camera);
        this.chaos.update(clipDt,this.camera,this.t);
        this.dust.update(clipDt);
        return this.t<this.data.clip.endAt;
    }

    private join(player:PlayerData):void {
        this.remotes.add(player);
        const rat=this.remotes.get(player.id);
        if(rat)rat.soundBus=this.audio;
    }
    private sample(id:string,at:number,p:SnapshotPose):void {
        let track=this.tracks.get(id);if(!track)this.tracks.set(id,track={times:[],poses:[]});
        track.times.push(at);track.poses.push(p.x,p.y,p.z,p.qx,p.qy,p.qz,p.qw);
    }
    private sortTrack(track:Track):void {
        const order=track.times.map((_,i)=>i).sort((a,b)=>track.times[a]!-track.times[b]!);
        const times=order.map(i=>track.times[i]!),poses=order.flatMap(i=>track.poses.slice(i*7,i*7+7));
        track.times=times;track.poses=poses;
    }
    /** A rat's recorded pose at `time` (between samples; held at either end). */
    private pose(id:string,time:number):SnapshotPose|undefined {
        const track=this.tracks.get(id);if(!track?.times.length)return;
        const {times,poses}=track;let lo=0,hi=times.length-1;
        if(time<=times[0]!)hi=0;else if(time>=times[hi]!)lo=hi;
        else while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]!<=time)lo=mid;else hi=mid;}
        const span=times[hi]!-times[lo]!,k=span>0?(time-times[lo]!)/span:0,a=lo*7,b=hi*7;
        POSE.x=poses[a]!+(poses[b]!-poses[a]!)*k;POSE.y=poses[a+1]!+(poses[b+1]!-poses[a+1]!)*k;POSE.z=poses[a+2]!+(poses[b+2]!-poses[a+2]!)*k;
        QA.set(poses[a+3]!,poses[a+4]!,poses[a+5]!,poses[a+6]!).slerp(QB.set(poses[b+3]!,poses[b+4]!,poses[b+5]!,poses[b+6]!),k);
        POSE.qx=QA.x;POSE.qy=QA.y;POSE.qz=QA.z;POSE.qw=QA.w;
        return POSE;
    }
    private noteAim(id:string,at:number,direction:Vec3Data,own:boolean):void {
        let aims=this.aims.get(id);
        if(!aims||own&&!aims.own)this.aims.set(id,aims={own,times:[],dirs:[]});
        else if(aims.own&&!own)return;
        aims.times.push(at);aims.dirs.push(direction);
    }
    /** Where `id` looked at `time` (unit): your own aim between samples (held at either end), or the nearest shot's. */
    private aim(id:string,time:number):{look:Vec3Data;exact:boolean}|undefined {
        const aims=this.aims.get(id);if(!aims?.times.length)return;
        const {times,dirs}=aims;let lo=0,hi=times.length-1;
        if(time<=times[0]!)hi=0;else if(time>=times[hi]!)lo=hi;
        else while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]!<=time)lo=mid;else hi=mid;}
        LOOK.exact=aims.own;
        if(!aims.own){
            const near=time-times[lo]!<=times[hi]!-time?lo:hi,d=dirs[near]!;
            if(Math.abs(times[near]!-time)>PLAYBACK.shotLook)return;
            AIM.set(d.x,d.y,d.z).normalize();return LOOK;
        }
        const span=times[hi]!-times[lo]!,k=span>0?(time-times[lo]!)/span:0,a=dirs[lo]!,b=dirs[hi]!;
        AIM.set(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k,a.z+(b.z-a.z)*k).normalize();return LOOK;
    }
    private carriesHotCase(id:string|null|undefined):boolean {const s=this.lastChaos;return !!id&&!!s&&s.case.owner===id&&s.assignment?.phase==='active';}

    /** A recorded event, as live play applies it to the world (no HUD, feel or headlines); `seek` keeps only its state. */
    private apply(event:RecordedEvent,at:number,seek:boolean):void {
        switch(event.type){
            case 'chaos':{
                const s=event.state;this.lastChaos=s;this.chaos.apply(s);
                const d=s.dispatch,incident=d.phase==='active'?incidentInfo(d.incident).id:undefined,wanted=incident==='most-wanted'?d.wanted:undefined;
                for(const [id,{entity}] of this.remotes.rats){
                    entity.setWanted(id===wanted);
                    const buff=s.buffs?.[id],left=(until?:number)=>Math.max(0,((until??0)-s.time)/1000);
                    entity.setPowerups(left(buff?.ironcladUntil),left(buff?.hustleUntil),left(buff?.stakeoutUntil));
                    const dud=faultyOf(s.buffs,id,s.time);
                    entity.setDud(trapped(s.buffs,id,s.time)?'HELD':dud&&FAULTY_COPY[dud].title);entity.exposed=dud==='stakeout';
                }
                break;
            }
            case 'playerShot':{
                if(seek)break;
                const owner=this.remotes.get(event.shooterId),s=this.lastChaos;
                const weapon=heldWeapon(s?.buffs,event.shooterId,at);
                if(owner){
                    // The Laser's zap comes with its beam; a Mousetrap is silent.
                    const incident=s?.dispatch.phase==='active'?incidentInfo(s.dispatch.incident).id:undefined;
                    const cue:GunshotCue|undefined=weapon?weapon==='tommy-gun'?'tommy':weapon==='persuader'?'shotgun':undefined:incident==='scattershot'?'shotgun':'normal';
                    if(cue)this.audio.gunshot(event.origin,cue);
                    owner.playShootAnimation(new THREE.Vector3(event.origin.x,event.origin.y,event.origin.z).addScaledVector(new THREE.Vector3(event.direction.x,event.direction.y,event.direction.z),30));
                }
                this.chaos.launch(event);
                break;
            }
            case 'shotResult':if(!seek)this.chaos.shotResult(event);break;
            case 'playerDamaged':{
                const entity=this.remotes.get(event.id);
                if(!entity||entity.dead)break;
                if(seek||event.hp===0){entity.hp=event.hp;entity.billboard.setHealth(event.hp);break;}
                const attacker=event.attackerId?this.remotes.get(event.attackerId):undefined;
                if(attacker&&event.attackerId!==event.id&&this.carriesHotCase(event.attackerId)){
                    HIT.copy(entity.mesh.position);HIT.y+=1;SPRAY.copy(HIT).sub(attacker.mesh.position).setY(0);
                    if(SPRAY.lengthSq()<1e-6)SPRAY.set(0,1,0);
                    this.chaos.carrierHit(HIT,SPRAY.normalize().setY(.6));
                }
                if(event.hp<entity.hp){
                    const direction=new THREE.Vector3();
                    if(attacker)direction.copy(entity.mesh.position).sub(attacker.mesh.position).setY(0);
                    entity.takeDamage(entity.hp-event.hp,direction);
                }
                break;
            }
            case 'playerHealed':{
                const entity=this.remotes.get(event.id);
                if(seek){if(entity&&!entity.dead){entity.hp=event.hp;entity.billboard.setHealth(event.hp);}break;}
                entity?.heal(event.hp,0,undefined,event.cause==='case-kill');
                break;
            }
            case 'playerDied':{
                const entity=this.remotes.get(event.victimId);
                if(!entity||entity.dead)break;
                if(!seek){
                    const headshot=event.headshot===true,s=this.lastChaos,incident=s?.dispatch.phase==='active'?incidentInfo(s.dispatch.incident).id:undefined;
                    // As live play: killed mid-launch flails; no killer flops; Improper Disposal flings; a kill spins.
                    const style:DeathStyle=entity.launchFlight&&feelState().on('launchFlight')?'flail':event.killerId===null||event.cause==='evidence-tampering'?'flop':incident==='improper-disposal'?'fling':'spin';
                    entity.setDeathStyle(style);this.chaos.noteDeathStyle(event.victimId,style,headshot);
                    const killer=event.killerId?this.remotes.get(event.killerId):undefined;
                    if(killer&&killer!==entity)killer.setStreak(event.killerStreak??0);
                    if(headshot&&feelState().on('headshot')){
                        const head=entity.mesh.getObjectByName('rat-head')?.getWorldPosition(HEAD)??HEAD.copy(entity.mesh.position).setY(entity.mesh.position.y+1.6);
                        if(event.incoming)IMPACT.set(event.incoming.x,event.incoming.y,event.incoming.z);
                        else if(killer)IMPACT.copy(entity.mesh.position).sub(killer.mesh.position).setY(0);
                        else IMPACT.set(0,0,1);
                        this.chaos.burst(head,IMPACT.normalize().negate(),FEEL.headshot.params.burst);
                    }
                    if(event.path&&event.victimId!==event.killerId)this.chaos.crossfire.showPath(event.path);
                }
                // The shared corpse (the next chaos state) carries the fall.
                entity.useSharedCorpse();
                break;
            }
            case 'playerRespawn':this.remotes.respawn(event.id,event);break;
            case 'playerJoined':this.join(event.player);break;
            case 'playerLeft':this.remotes.remove(event.id);break;
        }
    }

    dispose():void {
        this.chaos.dispose();this.remotes.dispose();
        registerDust(this.scene,undefined);this.dust.dispose();
        this.scene.removeFromParent();this.scene.clear();
    }
}

/** The exhibit player (`ReplayPlayer`): one clip at a time, drawn into the board's frame after the live frame or
 * fullscreen instead of it, heard on the replay bus. A replay never touches the live HUD, headlines, feel, camera
 * or live sound budget, and leaves nothing behind when it stops. */
export class ReplayStage implements ReplayPlayer {
    private playback?:Playback;
    private options?:{mode:ReplayMode;rect?:()=>DOMRect;loop?:boolean;onEnd?:()=>void};
    private ended=false;
    /** The gameplay camera's lens: an exhibit plays as its rat saw it. */
    private readonly camera=new THREE.PerspectiveCamera(SHOULDER.fov,16/9,.1,600);
    private readonly audio:ReplayAudio;
    private readonly hidden:THREE.Object3D[]=[];
    private readonly size=new THREE.Vector2();
    private overlay?:{scene:THREE.Scene;camera:THREE.OrthographicCamera;texture:THREE.CanvasTexture;mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>};
    constructor(private readonly deps:ReplayStageDeps) {
        this.audio=new ReplayAudio(deps.listener.context as AudioContext);
        // Nameplates (layer 1) read in an exhibit as in play.
        this.camera.layers.enable(1);
    }

    clips():ReplayClip[] {return this.deps.recorder.clips();}
    shared():string[] {return this.deps.recorder.shared();}
    current():ReplayClip|null {return this.playback?.data.clip??null;}
    /** True while a replay takes the whole screen (the live frame is not drawn). */
    get fullscreen():boolean {return !!this.playback&&this.options?.mode==='fullscreen';}
    play(clip:ReplayClip,options:{mode:ReplayMode;rect?:()=>DOMRect;loop?:boolean;onEnd?:()=>void}):void {
        const data=this.deps.recorder.data(clip.id);
        // The clip already built (going fullscreen, saving): start it again in place instead of building it anew.
        if(data&&this.playback?.data===data){this.options=options;this.ended=false;this.playback.rewind();return;}
        this.stop();
        if(!data)return;
        this.options=options;this.ended=false;
        this.audio.begin();
        this.start(data);
    }
    stop():void {
        if(!this.playback)return;
        this.playback.dispose();this.playback=undefined;this.options=undefined;
        this.audio.end();
    }
    /** For `?replay=dev` checks: the clip's clock (server ms), whose eyes, and whether it is playing. */
    debugState():{t:number;pov?:string;clip?:string;playing:boolean} {
        const p=this.playback;return p?{t:p.t,...(p.subject?{pov:p.subject}:{}),clip:p.data.clip.id,playing:!this.ended}:{t:0,playing:false};
    }
    clock():{ms:number;total:number} {
        const p=this.playback;if(!p)return {ms:0,total:0};
        const {startAt,endAt}=p.data.clip;
        return {ms:Math.max(0,p.t-startAt),total:endAt-startAt};
    }
    audioStream():MediaStream {return this.audio.stream();}
    canvas():HTMLCanvasElement {return this.deps.renderer.domElement;}
    setRecordingOverlay(source:HTMLCanvasElement|null):()=>void {
        if(this.overlay&&this.overlay.texture.image!==source){
            this.overlay.texture.dispose();this.overlay.mesh.geometry.dispose();this.overlay.mesh.material.dispose();this.overlay=undefined;
        }
        if(source&&!this.overlay){
            // A CanvasTexture uploads on its first draw; after that only when the painter says it redrew.
            const texture=new THREE.CanvasTexture(source);texture.colorSpace=THREE.SRGBColorSpace;
            const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
            const scene=new THREE.Scene();scene.add(mesh);
            this.overlay={scene,camera:new THREE.OrthographicCamera(-1,1,1,-1,0,1),texture,mesh};
        }
        const texture=this.overlay?.texture;
        return ()=>{if(texture&&this.overlay?.texture===texture)texture.needsUpdate=true;};
    }

    /** Advance the playing clip by `dt` seconds on screen (looping, or holding its last frame once it has ended). */
    update(dt:number):void {
        const playback=this.playback;
        if(!playback||this.ended)return;
        if(playback.update(dt))return;
        if(this.options?.loop){playback.rewind();return;}
        this.ended=true;this.options?.onEnd?.();
    }
    /** Draw the replay: into the frame's rectangle after the live frame, or fullscreen in its place. */
    render():void {
        const playback=this.playback,options=this.options;
        if(!playback||!options)return;
        const {renderer,scene,flashlight}=this.deps,canvas=renderer.domElement;
        renderer.getSize(this.size);
        let x=0,y=0,width=this.size.x,height=this.size.y;
        const frame=options.mode==='frame';
        if(frame){
            const rect=options.rect?.(),bounds=canvas.getBoundingClientRect();
            if(!rect||rect.width<2||rect.height<2)return;
            x=rect.left-bounds.left;y=bounds.bottom-rect.bottom;width=rect.width;height=rect.height;
        }
        if(Math.abs(this.camera.aspect-width/height)>1e-3){this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
        // The city is shared: the replay joins the scene for this draw only, and every live root that is not the
        // city, the stage's lights or its ground stays out of it (no live rats, chaos, effects or HUD props).
        const hidden=this.hidden;hidden.length=0;
        for(const child of scene.children)if(child.visible&&!this.deps.shared(child)){child.visible=false;hidden.push(child);}
        scene.add(playback.scene);
        const beam=flashlight.intensity;flashlight.intensity=0;
        if(frame){renderer.setScissorTest(true);renderer.setScissor(x,y,width,height);renderer.setViewport(x,y,width,height);}
        renderer.render(scene,this.camera);
        if(frame){renderer.setScissorTest(false);renderer.setViewport(0,0,this.size.x,this.size.y);}
        else if(this.overlay){
            // The recording's marks: the 2D canvas's texture (uploaded only when repainted), drawn over the picture.
            const clear=renderer.autoClear;renderer.autoClear=false;renderer.render(this.overlay.scene,this.overlay.camera);renderer.autoClear=clear;
        }
        flashlight.intensity=beam;scene.remove(playback.scene);
        for(const child of hidden)child.visible=true;
        hidden.length=0;
    }
    dispose():void {
        this.stop();this.setRecordingOverlay(null);this.audio.dispose();
    }

    private start(data:ClipData):void {
        const started=performance.now();
        // The camera's ray checks see the city only (live rats would block a view they are not in); built once a play.
        this.deps.scene.updateMatrixWorld();
        const blockers=new CameraBlockers(this.deps.scene.children.filter(o=>o.userData.aimTarget===true&&this.deps.shared(o)));
        performance.measure('replay-start-blockers',{start:started,end:performance.now()});
        this.playback=new Playback(data,this.audio,this.deps.listener.context as AudioContext,blockers,this.camera);
        performance.measure('replay-start',{start:started,end:performance.now()});
    }
}
