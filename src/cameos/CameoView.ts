import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {CameoAnimator,CAMEO_DURATIONS,type CameoReaction} from './CameoAnimator';
import {CAMEO_LAYOUT,type CameoKind} from './cameoLayout';

export interface CameoVisitor {id:string;position:Vec3Data;dead?:boolean}
type State={model:THREE.Group;animator:CameoAnimator;kind:CameoKind;center:THREE.Vector3;reaction:CameoReaction;started:number;cooldown:number;direction:number;near:Set<string>;range:number};
type SeenShot={x:number;y:number;z:number;frame:number;triggered:number};
/** Cosmetic-only reactions. Never participates in collision, damage or scoring. */
export class CameoView {
    readonly root=new THREE.Group();
    private readonly states:State[]=[];
    private readonly shots=new Map<string,SeenShot>();
    private readonly from={x:0,y:0,z:0};
    private readonly to={x:0,y:0,z:0};
    private time=0;
    private frame=0;
    private nextScan=0;
    private disposed=false;
    private enabled=true;
    private awake=false;
    constructor(models:ReadonlyMap<CameoKind,THREE.Group>){
        this.root.name='superhero-cameos';
        for(const placement of CAMEO_LAYOUT){
            const model=models.get(placement.kind);if(!model)continue;
            model.name=`cameo-${placement.kind}`;model.position.set(placement.x,placement.y,placement.z);model.rotation.y=placement.yaw;
            // Match ordinary rats' accepted material lift, without any new lights.
            const materials=new Set<THREE.MeshStandardMaterial>();
            model.traverse(node=>{if(node instanceof THREE.Mesh){
                node.castShadow=false;node.receiveShadow=true;node.raycast=()=>{};
                for(const material of Array.isArray(node.material)?node.material:[node.material])if(material instanceof THREE.MeshStandardMaterial)materials.add(material);
            }});
            for(const material of materials){material.color.multiplyScalar(1.16);material.emissive.copy(material.color).lerp(new THREE.Color(0x73697b),.15).multiplyScalar(.5);material.emissiveIntensity=.28;}
            this.root.add(model);
            this.states.push({model,kind:placement.kind,animator:new CameoAnimator(model,placement.kind),center:new THREE.Vector3(placement.x,placement.y+1.1,placement.z),reaction:'idle',started:0,cooldown:0,direction:1,near:new Set(),range:placement.viewDistance});
            model.visible=false;
        }
    }
    /** The world/room owner resets transient state on welcome, reset and disconnect. */
    reset(){
        this.shots.clear();this.time=0;this.nextScan=0;this.awake=false;
        for(const s of this.states){s.reaction='idle';s.started=0;s.cooldown=0;s.near.clear();s.animator.reset();s.model.visible=false;}
    }
    setEnabled(value:boolean){this.enabled=value;this.root.visible=value;if(!value)this.reset();}
    beginFrame(dt:number,camera:Vec3Data){
        if(this.disposed)return;
        this.time+=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));this.frame++;this.awake=false;
        for(const [id,shot] of this.shots)if(this.frame-shot.frame>2)this.shots.delete(id);
        for(const s of this.states){
            const p=s.center,d=Math.hypot(camera.x-p.x,camera.y-p.y,camera.z-p.z);
            s.model.visible=this.enabled&&d<s.range;
            if(s.model.visible)this.awake=true;
            else{s.near.clear();s.reaction='idle';}
        }
        if(!this.awake)this.shots.clear();
    }
    private react(s:State,reaction:'shot'|'passerby',origin:Vec3Data){
        if(s.reaction==='shot'||(this.time<s.cooldown&&!(reaction==='shot'&&s.reaction==='passerby')))return false;
        if(reaction==='passerby'&&s.reaction!=='idle')return false;
        s.reaction=reaction;s.started=this.time;
        const dx=origin.x-s.center.x,dz=origin.z-s.center.z;
        s.direction=dx*Math.cos(s.model.rotation.y)-dz*Math.sin(s.model.rotation.y)<0?-1:1;
        s.cooldown=this.time+(reaction==='shot'?6.5:7);
        return true;
    }
    /** Consume actual displayed ball segments, including ricochets and local prediction. */
    observeShot(id:string,p:Vec3Data,radius:number,clear:(from:Vec3Data,to:Vec3Data)=>boolean){
        if(this.disposed||!this.awake||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)||!Number.isFinite(radius))return;
        let previous=this.shots.get(id);
        if(!previous){
            if(this.shots.size>=256)return;
            previous={x:p.x,y:p.y,z:p.z,frame:this.frame,triggered:0};this.shots.set(id,previous);
        }
        const dx=p.x-previous.x,dy=p.y-previous.y,dz=p.z-previous.z,lengthSq=dx*dx+dy*dy+dz*dz;
        // Stale/corrected jumps are not physical trajectories through a cameo.
        const sweep=this.frame-previous.frame<=1&&lengthSq<100;
        for(let i=0;i<this.states.length;i++){
            const s=this.states[i];if(!s.model.visible||(previous.triggered&(1<<i)))continue;
            const t=sweep&&lengthSq>0?THREE.MathUtils.clamp(((s.center.x-previous.x)*dx+(s.center.y-previous.y)*dy+(s.center.z-previous.z)*dz)/lengthSq,0,1):1;
            this.from.x=previous.x+dx*t;this.from.y=previous.y+dy*t;this.from.z=previous.z+dz*t;
            const reach=.8+Math.max(0,Math.min(radius,2.4));
            if(Math.hypot(this.from.x-s.center.x,this.from.y-s.center.y,this.from.z-s.center.z)>reach)continue;
            if(!clear(this.from,s.center))continue;
            previous.triggered|=1<<i;this.react(s,'shot',p);
        }
        previous.x=p.x;previous.y=p.y;previous.z=p.z;previous.frame=this.frame;
    }
    update(visitors:()=>Iterable<CameoVisitor>,clear:(from:Vec3Data,to:Vec3Data)=>boolean){
        if(this.disposed||!this.awake)return;
        // At most two small proximity scans per 150 ms, never one ray per frame/rat.
        if(this.time>=this.nextScan){
            this.nextScan=this.time+.15;
            for(const s of this.states){
                if(!s.model.visible)continue;
                const current=new Set<string>();
                for(const visitor of visitors()){
                    const p=visitor.position;
                    if(visitor.dead||Math.abs(p.y-s.model.position.y)>3||Math.hypot(p.x-s.center.x,p.z-s.center.z)>5)continue;
                    if(s.near.has(visitor.id)){current.add(visitor.id);continue;}
                    this.to.x=p.x;this.to.y=p.y+1.1;this.to.z=p.z;
                    if(clear(s.center,this.to)){current.add(visitor.id);this.react(s,'passerby',p);}
                }
                s.near=current;
            }
        }
        for(const s of this.states)if(s.model.visible){
            if(s.reaction!=='idle'&&this.time-s.started>=CAMEO_DURATIONS[s.reaction]){s.reaction='idle';s.started=this.time;}
            s.animator.sample(s.reaction,this.time-s.started,s.direction);
        }
    }
    dispose(){if(this.disposed)return;this.disposed=true;this.shots.clear();this.root.removeFromParent();disposeMeshResources(this.root);this.states.length=0;}
}
