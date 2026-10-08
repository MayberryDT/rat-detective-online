import * as THREE from 'three';
import type { Vec3Data } from '../shared/networkProtocol';
import type { HighlightKind } from '../shared/highlights';
import type { CameraBlockers } from '../player/CameraBlockers';
import { SHOULDER, ShoulderCamera, viewAlong } from '../player/ShoulderCamera';
import { FEEL } from '../feel/feelTuning';
import type { ReplayClip } from './types';

/** The director's camera speeds: `yaw` and `pitch` are how fast the view turns to a look read from a shot (1/s), for
 * a clip recorded without looks; such a look tilts at most `shotTilt` rad from the default pitch (a bot's lob aims far
 * steeper than any player's camera). A recorded look is followed exactly. Clips play at real time: no slow motion
 * (Tyler, 8 October: "I just want to see what that user saw"). */
export const DIRECTOR={yaw:12,pitch:6,shotTilt:.35} as const;

/** What the director reads from the replay each frame. */
export interface DirectorView {
    /** A rat's body: the living rat, or its corpse once it has fallen. */
    body(id:string):THREE.Vector3|undefined;
    /** A living rat's facing (its mesh rotation). */
    facing(id:string):THREE.Quaternion|undefined;
    /** Where `id` looked on screen now, when the clip recorded it: `exact` for your own camera, else a shot's direction. */
    aim(id:string):{look:Vec3Data;exact:boolean}|undefined;
}

/** Moments whose main actor (`actors[0]`) only ends it: seen through the second rat's eyes. */
const SECOND:Partial<Record<HighlightKind,true>>={'so-close':true};
const FORWARD=new THREE.Vector3();
const LOOK=new THREE.Matrix4(),TURN=new THREE.Quaternion();

/** The exhibit camera is a screen recording (Tyler, 2 October, protocol 31): one rat's gameplay shoulder camera for the
 * whole clip, looking where that rat looked, with live play's death camera when it falls. */
export class ReplayDirector {
    private readonly shoulder:ShoulderCamera;
    private readonly view=new THREE.Spherical(SHOULDER.radius,SHOULDER.phi,0);
    private readonly target=new THREE.Spherical();
    private readonly candidates:string[];
    /** Whose eyes: the first candidate seen in the recording, kept for the clip. */
    private pov?:string;
    private started=false;
    /** The POV rat's last living spot: the camera stays there when it dies, as live play's does. */
    private readonly alive=new THREE.Vector3();
    private wasAlive=false;
    private deathAge=0;
    private readonly ray=new THREE.Raycaster();
    private readonly moment:THREE.Vector3;
    constructor(clip:ReplayClip,private readonly replay:DirectorView,private readonly blockers:CameraBlockers) {
        this.shoulder=new ShoulderCamera(blockers);
        this.moment=new THREE.Vector3(clip.p.x,clip.p.y,clip.p.z);
        const actors=[...new Set(clip.actors)];
        if(SECOND[clip.kind]&&actors.length>1)actors.unshift(actors.splice(1,1)[0]!);
        this.candidates=actors;
    }

    /** Clip-time speed: real time, always. */
    timeScale(_t:number):number {return 1;}

    /** Whose eyes the clip is seen through, once a frame has chosen them. */
    get subject():string|undefined {return this.pov;}

    /** Place `camera` after `dt` seconds on screen. */
    frame(camera:THREE.PerspectiveCamera,dt:number):void {
        this.pov??=this.candidates.find(id=>this.replay.body(id));
        const id=this.pov,body=id?this.replay.body(id):undefined;
        if(!id||!body&&!this.wasAlive){this.establishing(camera);return;}
        const facing=body&&this.replay.facing(id),snap=!this.started;
        this.started=true;
        if(facing){
            this.alive.copy(body);this.wasAlive=true;this.deathAge=0;
            this.look(id,facing,snap,dt);
            this.shoulder.place(camera,this.alive,this.view);
            return;
        }
        // Dead: live play's death camera. The shoulder camera holds where the rat fell and turns to its body.
        this.shoulder.place(camera,this.wasAlive?this.alive:body!,this.view);
        if(!body)return;
        const d=FEEL.deathCam.params;this.deathAge+=dt;
        const weight=Math.min(1,this.deathAge/d.turn);
        camera.translateZ(d.pullBack*weight);
        LOOK.lookAt(camera.position,body,camera.up);
        camera.quaternion.slerp(TURN.setFromRotationMatrix(LOOK),weight);
    }

    /** Turn the view to where `id` looked: its recorded aim, else its facing at the default pitch. */
    private look(id:string,facing:THREE.Quaternion,snap:boolean,dt:number):void {
        const aim=this.replay.aim(id),target=this.target;
        if(aim){
            viewAlong(target,aim.look);
            if(!aim.exact)target.phi=Math.max(SHOULDER.phi-DIRECTOR.shotTilt,Math.min(SHOULDER.phi+DIRECTOR.shotTilt,target.phi));
        }
        else{
            // A rat faces the way its camera looks (`turnFacing`): the camera sits behind it.
            FORWARD.set(0,0,1).applyQuaternion(facing);
            target.theta=Math.atan2(FORWARD.x,FORWARD.z)-Math.PI;target.phi=SHOULDER.phi;
        }
        // Your own recorded camera is followed exactly; a look read from the body or a shot is eased into.
        if(snap||aim?.exact){this.view.theta=target.theta;this.view.phi=target.phi;return;}
        let turn=target.theta-this.view.theta;
        turn-=Math.round(turn/(Math.PI*2))*Math.PI*2;
        this.view.theta+=turn*(1-Math.exp(-DIRECTOR.yaw*dt));
        this.view.phi+=(target.phi-this.view.phi)*(1-Math.exp(-DIRECTOR.pitch*dt));
    }

    /** No actor in the recording: a still, wide view of the moment's place, clear of walls. */
    private establishing(camera:THREE.PerspectiveCamera):void {
        const pivot=this.moment.clone().setY(this.moment.y+1),offset=new THREE.Vector3(12.7,9,12.7);
        this.ray.set(pivot,offset.clone().normalize());this.ray.far=offset.length();
        const hit=this.blockers.first(this.ray);
        camera.position.copy(pivot).addScaledVector(this.ray.ray.direction,hit?Math.max(.3,hit.distance-.3):this.ray.far);
        camera.lookAt(pivot);
    }
}
