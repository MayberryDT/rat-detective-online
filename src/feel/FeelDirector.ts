import * as THREE from 'three';
import type {IncidentId} from '../shared/incidentCatalog';
import {CameraFeel} from './CameraFeel';
import {ScreenFeel} from './ScreenFeel';
import {feelState,type FeelState} from './feelState';
import {FEEL} from './feelTuning';

/** One entry point from game events to presentation-only feel effects.
 * GameSession calls it at existing event sources; channels never parse
 * network messages themselves. */
export class FeelDirector {
    readonly camera:CameraFeel;
    readonly screen:ScreenFeel;
    private incident?:IncidentId;
    private readonly impulse=new THREE.Vector3();
    private readonly inverse=new THREE.Quaternion();
    constructor(readonly state:FeelState=feelState(),doc:Document|undefined=globalThis.document){
        this.camera=new CameraFeel(()=>this.state.shake());
        this.screen=new ScreenFeel(()=>this.state.flash(),doc);
    }
    /** The active Dispatch incident, for effects that scale with heavier volleys. */
    setIncident(incident?:IncidentId):void {this.incident=incident;}

    /** A local shot left the muzzle. */
    shot():void {
        if(!this.state.on('shotKick'))return;
        const p=FEEL.shotKick.params;
        const scale=this.incident==='scattershot'?p.scattershot:this.incident==='popcorn-panic'?p.popcorn:1;
        this.camera.kick(p.pitch*scale,(Math.random()*2-1)*p.yawJitter*p.pitch*scale);
        this.camera.push(this.impulse.set(0,0,p.push*scale));
    }

    /** You took nonlethal damage. `from` is the attacker's live position when known. */
    hurt(damage:number,victim:THREE.Vector3,from:THREE.Vector3|undefined,view:THREE.Camera):void {
        if(this.state.on('damageDirection'))this.screen.damage(from,damage);
        if(!this.state.on('hitJolt'))return;
        const p=FEEL.hitJolt.params,scale=1+Math.max(0,Math.min(3,damage)-1)*p.perDamage;
        if(from)this.impulse.copy(victim).sub(from).setY(0);
        if(!from||this.impulse.lengthSq()<1e-6)this.impulse.set(Math.random()-.5,0,Math.random()-.5);
        this.impulse.normalize().applyQuaternion(this.inverse.copy(view.quaternion).invert());
        this.camera.kick(p.dip*scale,-this.impulse.x*p.yaw*scale);
        this.camera.push(this.impulse.multiplyScalar(p.push*scale*.1));
    }

    /** `self` is the local rat's position, for direction arrows. */
    update(dt:number,view:THREE.Camera,self?:THREE.Vector3):void {
        this.camera.update(dt);
        this.screen.update(dt,view,self);
    }
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.camera.reset();this.screen.reset();}
    dispose():void {this.camera.reset();this.screen.dispose();}
}
