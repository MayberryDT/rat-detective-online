import * as THREE from 'three';
import type {IncidentId} from '../shared/incidentCatalog';
import {CameraFeel} from './CameraFeel';
import {feelState,type FeelState} from './feelState';
import {FEEL} from './feelTuning';

/** One entry point from game events to presentation-only feel effects.
 * GameSession calls it at existing event sources; channels never parse
 * network messages themselves. */
export class FeelDirector {
    readonly camera:CameraFeel;
    private incident?:IncidentId;
    private readonly impulse=new THREE.Vector3();
    constructor(readonly state:FeelState=feelState()){
        this.camera=new CameraFeel(()=>this.state.shake());
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

    update(dt:number):void {this.camera.update(dt);}
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.camera.reset();}
    dispose():void {this.reset();}
}
