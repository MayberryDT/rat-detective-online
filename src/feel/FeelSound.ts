import type {SupplyCue} from './supplyCues';
import * as THREE from 'three';
import {LANDMARK_INTERIORS} from '../shared/landmarkLayout';
import type {Vec3Data} from '../shared/networkProtocol';
import {FeelAudio,type Sting,type Surface} from './FeelAudio';
import type {FeelState} from './feelState';
import {FEEL} from './feelTuning';

/** Icebox's open rear catwalk (steel). */
const CATWALK={xmin:108,xmax:124,zmin:-90,zmax:-78,y:8.7};

export function surfaceAt(p:Vec3Data):Surface {
    if(p.y<-.5)return 'water';
    if(Math.abs(p.y-CATWALK.y)<1.2&&p.x>CATWALK.xmin&&p.x<CATWALK.xmax&&p.z>CATWALK.zmin&&p.z<CATWALK.zmax)return 'metal';
    return p.y>7.5?'wood':'pavement';
}
export function spaceAt(p:Vec3Data):'open'|'sewer'|'interior' {
    if(p.y<-.5)return 'sewer';
    for(const hall of LANDMARK_INTERIORS)
        if(Math.abs(p.x-hall.cx)<hall.w/2&&Math.abs(p.z-hall.cz)<hall.d/2&&p.y<Math.max(...hall.levels)+4)return 'interior';
    return 'open';
}

interface Walker {last:THREE.Vector3;timer:number;seen:number}
export interface FootstepSource {id:string;position:THREE.Vector3;grounded?:boolean}

/** Polish 17: decides when the synthesized feel cues play (footsteps, rustle,
 * jostle, squelch, whizz, brass, stings, wind). Bounded and dropped, never queued. */
export class FeelSound {
    private audio?:FeelAudio;
    private readonly walkers=new Map<string,Walker>();
    private readonly whizzed=new Set<string>();
    private frame=0;
    private wasFast=false;
    private readonly right=new THREE.Vector3();
    private readonly toSource=new THREE.Vector3();

    constructor(private readonly state:FeelState){}
    attach(context:AudioContext):void {this.audio=new FeelAudio(context);}
    private get on():boolean {return !!this.audio&&this.state.on('sound');}

    /** Stereo position of a world point relative to the view, -1 … 1. */
    private pan(at:Vec3Data,view:THREE.Camera):number {
        this.right.set(1,0,0).applyQuaternion(view.quaternion);
        this.toSource.set(at.x-view.position.x,0,at.z-view.position.z);
        const length=this.toSource.length();
        return length<.5?0:THREE.MathUtils.clamp(this.toSource.dot(this.right)/length,-1,1)*.8;
    }

    footsteps(dt:number,sources:Iterable<FootstepSource>,self:THREE.Vector3|undefined,view:THREE.Camera):void {
        if(!this.on||!(dt>0))return;
        const p=FEEL.sound.params;this.frame++;
        for(const source of sources){
            let walker=this.walkers.get(source.id);
            if(!walker){walker={last:source.position.clone(),timer:.05,seen:this.frame};this.walkers.set(source.id,walker);continue;}
            walker.seen=this.frame;
            const dx=source.position.x-walker.last.x,dz=source.position.z-walker.last.z,dy=source.position.y-walker.last.y;
            walker.last.copy(source.position);
            const speed=Math.hypot(dx,dz)/dt;
            if(speed>40||dt>.1){walker.timer=.05;continue;}
            const grounded=source.grounded??Math.abs(dy/dt)<1.5;
            const local=source.id==='self',distance=local||!self?0:source.position.distanceTo(self);
            if(!grounded||speed<3||distance>p.stepRange){walker.timer=Math.min(walker.timer,.05);continue;}
            if((walker.timer-=dt)>0)continue;
            walker.timer=THREE.MathUtils.clamp(.44-speed*.013,.2,.44);
            const pace=Math.min(1,speed/18),fade=local?1:Math.pow(1-distance/p.stepRange,2);
            this.audio!.step(source.id,surfaceAt(source.position),(local?p.step:p.remoteStep)*(.35+.65*pace)*fade,local?0:this.pan(source.position,view));
        }
        if(this.frame%120===0)for(const [id,walker] of this.walkers)if(walker.seen!==this.frame)this.walkers.delete(id);
    }

    /** Local-only motion cues: coat rustle on a burst start, case rattle on landing, flight wind. */
    localMotion(horizontalSpeed:number,landed:number,carrying:boolean,flight:number):void {
        if(!this.on){this.audio?.setWind(0,0);return;}
        const p=FEEL.sound.params,fast=horizontalSpeed>9;
        if(fast&&!this.wasFast)this.audio!.rustle(p.rustle);
        this.wasFast=horizontalSpeed>9||(this.wasFast&&horizontalSpeed>4);
        if(landed>8&&carrying)this.audio!.jostle(p.jostle*Math.min(1,landed/25));
        this.audio!.setWind(flight,p.wind);
    }

    thunder():void {if(this.on)this.audio!.thunder(FEEL.sound.params.thunder);}
    /** Noir rain bed, `level` 0…1. */
    rain(level:number):void {if(this.audio)this.audio.setRain(this.on?level:0,FEEL.sound.params.rain);}
    squelch(at:Vec3Data|undefined,view:THREE.Camera):void {if(this.on)this.audio!.squelch(FEEL.sound.params.squelch,at?this.pan(at,view):0);}
    brass():void {if(this.on)this.audio!.brass(FEEL.sound.params.brass);}
    flashbulb():void {if(this.on)this.audio!.flashbulb(FEEL.sound.params.flashbulb);}
    /** A shorted-out gun's trigger: a dry click. */
    jam():void {if(this.on)this.audio!.jam(FEEL.sound.params.jam);}
    /** A supply claimed (any rat) or restocked; fades and pans like a world sound. */
    supply(cue:SupplyCue,at:Vec3Data,view:THREE.Camera):void {
        if(!this.on)return;
        const fade=Math.max(0,1-Math.hypot(at.x-view.position.x,at.y-view.position.y,at.z-view.position.z)/FEEL.sound.params.supplyRange)**2;
        if(fade<.02)return;
        if(cue==='claim')this.audio!.supplyClaim(FEEL.sound.params.supply*fade,this.pan(at,view));
        else this.audio!.lampOn(FEEL.sound.params.supply*fade,this.pan(at,view));
    }
    /** The Hunch power-up comes on (full health) and breaks (first hit). */
    hunchGained():void {if(this.on)this.audio!.hunchGained(FEEL.sound.params.hunch);}
    hunchLost():void {if(this.on)this.audio!.hunchLost(FEEL.sound.params.hunch);}
    /** The Hunch: your detective made someone (camera shutter). */
    shutter():void {if(this.on)this.audio!.shutter(FEEL.sound.params.shutter);}
    /** The Hunch: someone made you (violin sting). */
    made():void {if(this.on)this.audio!.made(FEEL.sound.params.made);}
    headshot(at:Vec3Data,view:THREE.Camera,involved:boolean):void {
        if(!this.on)return;
        // Other rats' headshots fade out across the city like any world sound.
        const fade=involved?1:Math.max(0,1-Math.hypot(at.x-view.position.x,at.y-view.position.y,at.z-view.position.z)/FEEL.sound.params.headshotRange)**2;
        if(fade>.02)this.audio!.headshot(FEEL.sound.params.headshot*fade,this.pan(at,view));
    }
    sting(kind:Sting):void {if(this.on)this.audio!.sting(kind,FEEL.sound.params.sting);}
    /** Distance fade for a world cue, 1 at the camera to 0 at `range`. */
    private fade(at:Vec3Data,view:THREE.Camera,range:number):number {
        return Math.max(0,1-Math.hypot(at.x-view.position.x,at.y-view.position.y,at.z-view.position.z)/range)**2;
    }
    /** Pressure Surge rumble, `level` 0…1. */
    rumble(level:number):void {if(this.audio)this.audio.setRumble(this.on?level:0,FEEL.surgeLook.params.rumble);}
    /** A body's limbs jolted by a shot. */
    squeak(at:Vec3Data,view:THREE.Camera):void {
        if(!this.on)return;
        const p=FEEL.ragdoll.params,fade=this.fade(at,view,p.squeakRange);
        if(fade>.02)this.audio!.squeak(p.squeak*fade,this.pan(at,view));
    }
    /** A launched rat screams; your own at full volume. */
    scream(at:Vec3Data|undefined,view:THREE.Camera):void {
        if(!this.on)return;
        const p=FEEL.launchFlight.params,fade=at?this.fade(at,view,p.screamRange):1;
        if(fade>.02)this.audio!.scream(p.scream*fade,at?this.pan(at,view):0);
    }
    /** A launched rat lands; `heavy` 0…1 from the fall. */
    landing(at:Vec3Data,view:THREE.Camera,heavy:number):void {
        if(!this.on)return;
        const p=FEEL.launchLanding.params,fade=this.fade(at,view,p.shakeRange*2.5);
        if(fade>.02)this.audio!.landingThud(p.thud*fade*(.5+heavy*.5),this.pan(at,view),heavy);
    }
    /** A thrown case starts falling: the bomb whistle for about `seconds`. */
    whistle(at:Vec3Data,view:THREE.Camera,seconds:number):void {
        if(!this.on)return;
        const p=FEEL.launchLanding.params,fade=this.fade(at,view,90);
        if(fade>.02)this.audio!.whistle(p.whistle*fade,this.pan(at,view),seconds);
    }

    /** Balls from other rats passing within `whizz` units of your head; true when one whizzed by. */
    projectiles(shots:readonly {id:string;owner:string|null;p:Vec3Data;v:Vec3Data}[],myId:string,head:THREE.Vector3,view:THREE.Camera):boolean {
        if(!this.on)return false;
        let whizzed=false;
        const reach=FEEL.sound.params.whizzRange;
        for(const shot of shots){
            if(shot.owner===myId||this.whizzed.has(shot.id))continue;
            // Closest approach along the next ~60 ms of flight.
            const vx=shot.v.x*.06,vy=shot.v.y*.06,vz=shot.v.z*.06,ox=head.x-shot.p.x,oy=head.y-shot.p.y,oz=head.z-shot.p.z;
            const len=vx*vx+vy*vy+vz*vz,t=len>0?THREE.MathUtils.clamp((ox*vx+oy*vy+oz*vz)/len,0,1):0;
            const d=Math.hypot(ox-vx*t,oy-vy*t,oz-vz*t);
            if(d>reach||d<.45)continue;
            this.whizzed.add(shot.id);whizzed=true;
            this.audio!.whizz(FEEL.sound.params.whizz,this.pan(shot.p,view));
        }
        if(this.whizzed.size>256)this.whizzed.clear();
        return whizzed;
    }

    reset():void {this.walkers.clear();this.whizzed.clear();this.wasFast=false;this.audio?.setWind(0,0);this.audio?.setRumble(0,0);}
    dispose():void {this.reset();this.audio?.dispose();}
}
