import type * as THREE from 'three';
import {CameraFeel} from './CameraFeel';
import {feelState,type FeelState} from './feelState';

/** One entry point from game events to presentation-only feel effects.
 * GameSession calls it at existing event sources; channels never parse
 * network messages themselves. */
export class FeelDirector {
    readonly camera:CameraFeel;
    constructor(readonly state:FeelState=feelState()){
        this.camera=new CameraFeel(()=>this.state.shake());
    }
    update(dt:number):void {this.camera.update(dt);}
    /** Offset the rendered view; `afterRender` must follow the same frame. */
    beforeRender(camera:THREE.PerspectiveCamera):void {this.camera.apply(camera);}
    afterRender(camera:THREE.PerspectiveCamera):void {this.camera.restore(camera);}
    /** Respawn, reconnect, round reset, leaving play. */
    reset():void {this.camera.reset();}
    dispose():void {this.reset();}
}
