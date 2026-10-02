import * as THREE from 'three';
import type { ChaosState } from '../shared/chaosState';
import type { Vec3Data } from '../shared/networkProtocol';
import type { HighlightKind } from '../shared/highlights';
import { ASSIGNMENT_DESTINATIONS, activeDestination } from '../shared/assignments';
import { activeZone } from '../shared/jurisdiction';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import type { CameraBlockers } from '../player/CameraBlockers';
import type { ReplayClip } from './types';

/** The director's timing (docs/replay/playback.md, X3): on the key beat (the marker's `at`) time runs at `slow` for
 * `hold` ms of clip time (about 1 s on screen), easing in and out over `ease` ms; with reduced motion the hold is
 * `reducedHold`. `follow` is how fast a moving camera catches its subject (1/s); a cut snaps. */
export const DIRECTOR={slow:.3,hold:300,ease:180,reducedHold:120,follow:5,orbit:.16} as const;

/** What the director reads from the replay each frame. */
export interface DirectorView {
    /** A rat's body: the living rat, or its corpse once it has fallen. */
    body(id:string):THREE.Vector3|undefined;
    /** A living rat's facing (its mesh rotation). */
    facing(id:string):THREE.Quaternion|undefined;
    /** The latest chaos state the replay has shown. */
    state():ChaosState|null;
    /** Clip times (server ms) at which `id` made a kill. */
    kills(id:string):readonly number[];
}

/** `anchor`: the subject the camera must keep a clear line to; `pivot`: where it looks. */
type Shot={key:string;pivot:THREE.Vector3;camera:THREE.Vector3;anchor:THREE.Vector3};
const TRICK:ReadonlySet<HighlightKind>=new Set(['bank-shot','laser-ricochet','airborne']);
const BODY:ReadonlySet<HighlightKind>=new Set(['sent-flying','splashdown','body-blow','squashed']);
const WIDE:ReadonlySet<HighlightKind>=new Set(['pileup','big-cheese']);
const PULL_BACK:ReadonlySet<HighlightKind>=new Set(['so-close','carrier-down','delivery','steal-score','round-winner']);
const UP=new THREE.Vector3(0,1,0);

/** Per-kind camera work for one clip: shots from the clip's actors and the moment's place, cuts on beats, slow motion
 * on the key beat, never a shake. The camera keeps clear of walls with the shoulder camera's own ray checks. */
export class ReplayDirector {
    private readonly ray=new THREE.Raycaster();
    private readonly look=new THREE.Vector3();
    private readonly forward=new THREE.Vector3();
    private readonly scratch=new THREE.Vector3();
    private readonly moment:THREE.Vector3;
    private shot?:Shot;
    /** The held side for a followed body: chosen when its shot starts, so the camera never swings around it. */
    private readonly side=new THREE.Vector3();
    private readonly doer:string;
    private readonly victim:string;
    constructor(private readonly clip:ReplayClip,private readonly view:DirectorView,private readonly blockers:CameraBlockers,private readonly reduced:boolean) {
        this.moment=new THREE.Vector3(clip.p.x,clip.p.y,clip.p.z);
        this.doer=clip.actors[0]??'';this.victim=clip.actors[1]??this.doer;
    }

    /** Clip-time speed at clip time `t`: 1, easing to `DIRECTOR.slow` around the key beat. */
    timeScale(t:number):number {
        const hold=(this.reduced?DIRECTOR.reducedHold:DIRECTOR.hold)/2,d=Math.abs(t-this.clip.at);
        if(d<=hold)return DIRECTOR.slow;
        if(d>=hold+DIRECTOR.ease)return 1;
        return DIRECTOR.slow+(1-DIRECTOR.slow)*(d-hold)/DIRECTOR.ease;
    }

    /** Place `camera` for clip time `t` after `dt` seconds on screen. */
    frame(camera:THREE.PerspectiveCamera,t:number,dt:number):void {
        const next=this.reduced?this.still(t):this.plan(t);
        if(!next)return;
        const cut=!this.shot||next.key!==this.shot.key;
        this.clear(next);
        if(cut||this.reduced){this.shot=next;camera.position.copy(next.camera);this.look.copy(next.pivot);}
        else{
            // Ease towards the shot; a still shot's held pose never moves.
            const k=1-Math.exp(-DIRECTOR.follow*dt);
            this.shot=next;camera.position.lerp(next.camera,k);this.look.lerp(next.pivot,k);
        }
        camera.lookAt(this.look);
    }

    /** Reduced motion: held shots, wide on the moment before the key beat and close on it after, each fixed when cut to. */
    private still(t:number):Shot|undefined {
        const key=t<this.clip.at?'wide':'close';
        if(this.shot?.key===key)return this.shot;
        const subject=key==='wide'?this.moment:this.view.body(this.victim)??this.moment;
        return this.place(key,subject,this.sideOf(subject),key==='wide'?18:9,key==='wide'?9:4);
    }

    private plan(t:number):Shot|undefined {
        const kind=this.clip.kind,at=this.clip.at;
        if(WIDE.has(kind)){
            // A wide, slow orbit around the spot.
            const angle=(t-this.clip.startAt)/1000*DIRECTOR.orbit;
            this.side.set(Math.sin(angle),0,Math.cos(angle));
            return this.place('orbit',this.moment,this.side,18,10);
        }
        if(kind==='multi-kill'){
            // Behind the killer, a quick cut at each kill (alternating shoulders).
            const kills=this.view.kills(this.doer).filter(time=>time<=t).length;
            return this.behind(`kill-${kills}`,this.doer,kills%2?-1.6:1.6,7,3)??this.body('kill-body',this.victim);
        }
        if(kind==='long-shot')
            return t<at-250?this.behind('shoulder',this.doer,1.25,5,2.6)??this.body('victim',this.victim):this.body('victim',this.victim);
        if(TRICK.has(kind)){
            if(t<at-1200)return this.behind('shooter',this.doer,1.25,5.5,2.6)??this.body('victim',this.victim);
            const ball=t<at?this.ball():undefined;
            if(ball)return this.place('ball',ball,this.sideOf(ball,'ball'),6,2.5);
            return this.body('victim',this.victim);
        }
        if(BODY.has(kind))return this.body('body',this.victim);
        if(PULL_BACK.has(kind)){
            const subject=kind==='delivery'||kind==='steal-score'||kind==='round-winner'?this.doer:this.victim;
            if(t<at+300)return this.behind('carrier',subject,1.25,6,3)??this.body('carrier-body',subject);
            // Pull back and up to show where it was going: the drop-off or the zone.
            const target=this.target(),from=this.view.body(subject)??this.moment;
            const pivot=this.scratch.copy(from);if(target)pivot.lerp(target,.5);
            return this.place('pull-back',pivot.clone(),this.sideOf(from,'pull-back'),target?Math.max(16,from.distanceTo(target)*.8):16,14);
        }
        return this.body('subject',this.victim);
    }

    /** Over `id`'s shoulder (`shoulder` units to its right), `back` behind and `up` above, looking where it faces. */
    private behind(key:string,id:string,shoulder:number,back:number,up:number):Shot|undefined {
        const p=this.view.body(id),q=this.view.facing(id);
        if(!p||!q)return;
        const forward=this.forward.set(0,0,1).applyQuaternion(q).setY(0);
        if(forward.lengthSq()<1e-6)forward.set(0,0,1);
        forward.normalize();
        const right=this.scratch.crossVectors(forward,UP).normalize();
        const anchor=p.clone().setY(p.y+2.2).addScaledVector(right,shoulder);
        const camera=anchor.clone().addScaledVector(forward,-back).setY(p.y+1+up);
        return {key,pivot:anchor.clone().addScaledVector(forward,8),camera,anchor};
    }
    /** Follow a body (alive or fallen) from the side held since the shot began. */
    private body(key:string,id:string):Shot|undefined {
        const p=this.view.body(id)??this.moment;
        return this.place(key,p,this.sideOf(p,key),8,4);
    }
    /** A camera `distance` from `subject` along `side`, `height` above it, looking at it. */
    private place(key:string,subject:THREE.Vector3,side:THREE.Vector3,distance:number,height:number):Shot {
        const pivot=subject.clone();pivot.y+=1;
        const camera=pivot.clone().addScaledVector(side,distance);camera.y+=height;
        return {key,pivot,camera,anchor:pivot};
    }
    /** The side a new shot of `subject` keeps: where the camera already is (no swing round), else the moment's side. */
    private sideOf(subject:THREE.Vector3,key?:string):THREE.Vector3 {
        if(key&&this.shot?.key===key)return this.side;
        const from=this.shot?.camera??this.view.body(this.doer)??this.scratch.copy(subject).add(this.forward.set(1,0,1));
        this.side.copy(from).sub(subject).setY(0);
        if(this.side.lengthSq()<1e-4)this.side.set(1,0,1);
        return this.side.normalize();
    }
    /** The shooter's ball in play nearest its victim. */
    private ball():THREE.Vector3|undefined {
        const shots=this.view.state()?.shots,victim=this.view.body(this.victim);
        let best:Vec3Data|undefined,distance=Infinity;
        for(const shot of shots??[]){
            if(shot.owner!==this.doer)continue;
            const d=victim?Math.hypot(shot.p.x-victim.x,shot.p.y-victim.y,shot.p.z-victim.z):0;
            if(d<distance){distance=d;best=shot.p;}
        }
        return best&&new THREE.Vector3(best.x,best.y,best.z);
    }
    /** Where the case scores: the Paper Chase drop-off or the active Jurisdiction zone. */
    private target():THREE.Vector3|undefined {
        const a=this.view.state()?.assignment;if(!a)return;
        const next=activeDestination(a);
        const t=next?ASSIGNMENT_DESTINATIONS[next].approach:a.jurisdiction?JURISDICTION_ZONES[activeZone(a.jurisdiction)].posts[0]:undefined;
        return t&&new THREE.Vector3(t.x,t.y,t.z);
    }
    /** Pull the shot's camera in front of any wall between it and its subject (the shoulder camera's rule). */
    private clear(shot:Shot):void {
        const offset=this.scratch.subVectors(shot.camera,shot.anchor),length=offset.length();
        if(length<1e-3)return;
        this.ray.set(shot.anchor,offset.divideScalar(length));this.ray.far=length;
        const hit=this.blockers.first(this.ray);
        if(hit)shot.camera.copy(shot.anchor).addScaledVector(this.ray.ray.direction,Math.max(.3,hit.distance-.3));
    }
}
