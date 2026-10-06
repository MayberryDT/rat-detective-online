import * as THREE from 'three';
import {FEEL} from './feelTuning';

const STEP=1/240;
const REST=1e-5;
const FOV_REST=.01;
/** A frame gap this long means any transient effect is stale; drop it. */
const STALE_GAP=.5;

/** View-only camera motion layered over the controller's shoulder camera.
 * `apply` offsets the camera just before rendering and `restore` puts back the
 * controller pose immediately afterwards. Firing also composes this view while
 * selecting the crosshair target, then restores before its new impulse.
 * Springs integrate in fixed substeps for frame-rate
 * independent settling. */
export class CameraFeel {
    private pitch=0;private yaw=0;private pitchV=0;private yawV=0;
    private readonly shift=new THREE.Vector3();
    private readonly shiftV=new THREE.Vector3();
    private fov=0;private fovV=0;private fovHold=0;
    private readonly basePosition=new THREE.Vector3();
    private readonly baseQuaternion=new THREE.Quaternion();
    private baseFov=0;
    private applied=false;
    /** Death camera: turn toward a live target by `lookWeight` (0…1) and pull back. */
    private lookTarget?:THREE.Vector3;
    private lookWeight=0;
    private lookBack=0;
    private readonly lookQuaternion=new THREE.Quaternion();
    private readonly lookMatrix=new THREE.Matrix4();

    constructor(private readonly scale:()=>number){}

    /** Angular impulse in radians per second; positive pitch looks up. */
    kick(pitch:number,yaw=0):void {this.pitchV+=pitch;this.yawV+=yaw;}
    /** Camera-space translation impulse in units per second. */
    push(velocity:THREE.Vector3):void {this.shiftV.add(velocity);}
    /** Transient field-of-view pulse peaking at about `degrees` (negative zooms in). */
    widen(degrees:number):void {
        const omega=Math.sqrt(FEEL.cameraSpring.params.fovStiffness);
        this.fovV+=degrees*omega*Math.E;
    }
    /** Sustained field-of-view offset (for example during launcher flight). */
    hold(degrees:number):void {this.fovHold=degrees;}

    /** Turn the rendered view toward `target` (weight 0…1) and back off `back` units. */
    look(target:THREE.Vector3|undefined,weight:number,back:number):void {
        this.lookTarget=target;this.lookWeight=target?Math.max(0,Math.min(1,weight)):0;this.lookBack=back;
    }

    get active():boolean {
        return this.lookWeight>0||this.pitch!==0||this.yaw!==0||this.pitchV!==0||this.yawV!==0||this.shift.lengthSq()!==0||
            this.shiftV.lengthSq()!==0||this.fov!==0||this.fovV!==0||this.fovHold!==0;
    }
    offsets():{pitch:number;yaw:number;x:number;y:number;z:number;fov:number} {
        return {pitch:this.pitch,yaw:this.yaw,x:this.shift.x,y:this.shift.y,z:this.shift.z,fov:this.fov};
    }

    update(dt:number):void {
        if(!this.active)return;
        if(!(dt>0))return;
        if(dt>=STALE_GAP){this.settle();this.fov=this.fovHold;this.fovV=0;return;}
        const {stiffness,damping,maxTurn,maxShift,maxWiden,fovStiffness}=FEEL.cameraSpring.params;
        const c=2*damping*Math.sqrt(stiffness),fovC=2*Math.sqrt(fovStiffness);
        for(let left=dt;left>1e-9;left-=STEP){
            const h=Math.min(STEP,left);
            this.pitchV+=(-stiffness*this.pitch-c*this.pitchV)*h;this.pitch+=this.pitchV*h;
            this.yawV+=(-stiffness*this.yaw-c*this.yawV)*h;this.yaw+=this.yawV*h;
            this.shiftV.x+=(-stiffness*this.shift.x-c*this.shiftV.x)*h;
            this.shiftV.y+=(-stiffness*this.shift.y-c*this.shiftV.y)*h;
            this.shiftV.z+=(-stiffness*this.shift.z-c*this.shiftV.z)*h;
            this.shift.addScaledVector(this.shiftV,h);
            this.fovV+=(-fovStiffness*(this.fov-this.fovHold)-fovC*this.fovV)*h;this.fov+=this.fovV*h;
            if(Math.abs(this.pitch)>maxTurn){this.pitch=Math.sign(this.pitch)*maxTurn;if(this.pitchV*this.pitch>0)this.pitchV=0;}
            if(Math.abs(this.yaw)>maxTurn){this.yaw=Math.sign(this.yaw)*maxTurn;if(this.yawV*this.yaw>0)this.yawV=0;}
            const length=this.shift.length();
            if(length>maxShift){
                this.shift.multiplyScalar(maxShift/length);
                const outward=this.shiftV.dot(this.shift)/maxShift;
                if(outward>0)this.shiftV.addScaledVector(this.shift,-outward/maxShift);
            }
            if(Math.abs(this.fov)>maxWiden){this.fov=Math.sign(this.fov)*maxWiden;if(this.fovV*this.fov>0)this.fovV=0;}
        }
        if(Math.abs(this.pitch)<REST&&Math.abs(this.pitchV)<REST*10){this.pitch=0;this.pitchV=0;}
        if(Math.abs(this.yaw)<REST&&Math.abs(this.yawV)<REST*10){this.yaw=0;this.yawV=0;}
        if(this.shift.lengthSq()<REST*REST&&this.shiftV.lengthSq()<REST*REST*100){this.shift.set(0,0,0);this.shiftV.set(0,0,0);}
        if(Math.abs(this.fov-this.fovHold)<FOV_REST&&Math.abs(this.fovV)<FOV_REST*10){this.fov=this.fovHold;this.fovV=0;}
    }

    apply(camera:THREE.PerspectiveCamera):void {
        this.applied=false;
        const scale=this.scale();
        if(!(scale>0)||!this.active)return;
        this.basePosition.copy(camera.position);this.baseQuaternion.copy(camera.quaternion);this.baseFov=camera.fov;
        if(this.lookTarget&&this.lookWeight>0){
            camera.translateZ(this.lookBack*this.lookWeight*scale);
            this.lookMatrix.lookAt(camera.position,this.lookTarget,camera.up);
            this.lookQuaternion.setFromRotationMatrix(this.lookMatrix);
            camera.quaternion.slerp(this.lookQuaternion,this.lookWeight*scale);
        }
        camera.rotateY(this.yaw*scale);camera.rotateX(this.pitch*scale);
        camera.translateX(this.shift.x*scale);camera.translateY(this.shift.y*scale);camera.translateZ(this.shift.z*scale);
        if(this.fov!==0){camera.fov=this.baseFov+this.fov*scale;camera.updateProjectionMatrix();}
        camera.updateMatrixWorld();
        this.applied=true;
    }

    restore(camera:THREE.PerspectiveCamera):void {
        if(!this.applied)return;
        this.applied=false;
        camera.position.copy(this.basePosition);camera.quaternion.copy(this.baseQuaternion);
        if(camera.fov!==this.baseFov){camera.fov=this.baseFov;camera.updateProjectionMatrix();}
        camera.updateMatrixWorld();
    }

    /** Drop every offset immediately (respawn, reconnect, round reset, teardown). */
    reset():void {this.settle();this.fov=0;this.fovV=0;this.fovHold=0;this.lookTarget=undefined;this.lookWeight=0;}

    private settle():void {
        this.pitch=this.yaw=this.pitchV=this.yawV=0;
        this.shift.set(0,0,0);this.shiftV.set(0,0,0);
    }
}
