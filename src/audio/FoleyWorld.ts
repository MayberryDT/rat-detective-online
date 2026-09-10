import * as THREE from 'three';
import type {ChaosState} from '../shared/chaosState';
import type {Vec3Data} from '../shared/networkProtocol';
import {FoleyAudio} from './FoleyAudio';
import {MotionFoley} from './MotionFoley';
import {registerWorldSound} from './WorldSoundEvents';
import {FOLEY,type FoleyPlay,type FoleyCue} from './foleyCatalog';

type Accent={cue:FoleyCue;p:Vec3Data;key:string};
/** One accent for a readable action. Ordinary ricochets and autonomous scenery
 * deliberately have no new sound. No per-frame ambient or flyby emitters. */
export class FoleyWorld {
    readonly motion:MotionFoley;
    private readonly unregister:()=>void;
    private readonly blockers:THREE.Object3D[];
    private readonly frustum=new THREE.Frustum();
    private readonly matrix=new THREE.Matrix4();
    private readonly point=new THREE.Vector3();
    private readonly ear=new THREE.Vector3();
    private readonly right=new THREE.Vector3();
    private readonly direction=new THREE.Vector3();
    private readonly ray=new THREE.Raycaster();
    private readonly contacts:THREE.Intersection[]=[];
    private cameraReady=false;
    private enabled=false;
    private previous?:{time:number};
    private inspectedAt=-Infinity;
    private readonly candidates:Accent[]=[];
    readonly play:FoleyPlay=(cue,p,options={})=>{
        if(!this.enabled||!p||!this.inView(cue,p))return;
        const now=performance.now();if(now-this.inspectedAt<160)return;this.inspectedAt=now;
        if(this.unobstructed(p))this.audio.play(cue,p,options);
    };
    constructor(private readonly audio:FoleyAudio,scene:THREE.Scene){
        // Same authored static blocker selection used by the shoulder camera.
        this.blockers=scene.children.filter(o=>o.userData.aimTarget===true);
        this.motion=new MotionFoley(this.play);this.unregister=registerWorldSound(scene,this.play);
    }
    setEnabled(enabled:boolean):void {if(this.enabled&&!enabled)this.reset();this.enabled=enabled;this.audio.setEnabled(enabled);}
    listener(camera:THREE.Camera):void {
        // Read the camera only; rendering owns child AudioListener updates.
        camera.updateWorldMatrix(true,false);this.ear.setFromMatrixPosition(camera.matrixWorld);this.right.setFromMatrixColumn(camera.matrixWorld,0);
        this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        this.cameraReady=true;this.audio.update(this.ear,this.right);
    }
    private inView(cue:FoleyCue,p:Vec3Data):boolean {
        this.point.set(p.x,p.y,p.z);
        return this.cameraReady&&Number.isFinite(p.x+p.y+p.z)&&this.ear.distanceTo(this.point)<FOLEY[cue].range&&this.frustum.containsPoint(this.point);
    }
    private unobstructed(p:Vec3Data):boolean {
        this.direction.set(p.x,p.y,p.z).sub(this.ear);const distance=this.direction.length();
        if(distance<1)return true;
        this.ray.set(this.ear,this.direction.normalize());this.ray.far=Math.max(0,distance-.8);this.contacts.length=0;
        this.ray.intersectObjects(this.blockers,true,this.contacts);return this.contacts.length===0;
    }
    apply(state:ChaosState):void {
        const previous=this.previous;if(previous&&state.time<=previous.time)return;
        this.previous={time:state.time};
        if(!previous||state.time-previous.time>=500||!this.enabled)return;
        this.candidates.length=0;
        for(const {foley,p,n,energy=0} of state.impacts){
            let cue:FoleyCue|undefined;
            if(foley==='case-bounce'&&energy>=12)cue=n.y>.5?'case-floor':'case-wall';
            else if((foley==='corpse-bounce'&&energy>=16)||foley==='corpse-kick'||foley==='corpse-hit')cue=foley;
            if(cue)this.candidates.push({cue,p,key:Math.floor(p.x/4)+':'+Math.floor(p.z/4)});
        }
        const now=performance.now();if(now-this.inspectedAt<160)return;
        this.candidates.sort((a,b)=>this.ear.distanceToSquared(a.p as THREE.Vector3)-this.ear.distanceToSquared(b.p as THREE.Vector3));
        let rays=0;
        for(const accent of this.candidates){
            if(!this.inView(accent.cue,accent.p))continue;
            this.inspectedAt=now;
            // At most three rays every 160ms; never replay dropped candidates.
            if(this.unobstructed(accent.p)){this.audio.play(accent.cue,accent.p,{key:accent.key});break;}
            if(++rays>=3)break;
        }
    }
    reset():void {this.previous=undefined;this.candidates.length=0;this.motion.clear();this.inspectedAt=-Infinity;this.audio.setEnabled(false);this.audio.setEnabled(this.enabled);}
    dispose():void {this.unregister();this.setEnabled(false);this.reset();}
}
