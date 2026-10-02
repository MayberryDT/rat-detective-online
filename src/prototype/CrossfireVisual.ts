import * as THREE from 'three';
import {CROSSFIRE} from '../shared/chaosState';
import type {Vec3Data} from '../shared/networkProtocol';
import {playSynth} from '../audio/IncidentAudio';
import {disposeMeshResources} from '../utils/disposeMeshResources';

/** Crossfire juice (Tyler, 2 October: "make the whole city a pinball table"). Each bounce throws `sparks` sparks (living
 * `sparkLife` s, flying up to `sparkSpeed` u/s) and leaves a glowing scorch `scorch` units across that fades over
 * `scorchMs` (at most `scorches` at once), and rings a ricochet at `ricochet` volume whose pitch rises `pitchStep` a
 * bounce for `pitchSteps` bounces. A bank kill's path glows `pathWidth` thick for `pathMs`. The aim guide dots the way
 * to the first wall (dots at least `guideGap` apart, `guideDots` in all) and `guideBounce` units of the rebound. */
export const CROSSFIRE_JUICE={sparks:7,sparkLife:.35,sparkSpeed:14,scorch:.42,scorchMs:3500,scorches:24,ricochet:.75,pitchStep:.14,pitchSteps:5,
    pathWidth:.08,pathMs:2500,guideGap:1.1,guideDots:40,guideBounce:12} as const;
const J=CROSSFIRE_JUICE,SPARKS=48,SEGMENTS=CROSSFIRE.pathPoints+1,BOUNCE_DOTS=Math.ceil(J.guideBounce/J.guideGap);

/** Linear colours by Crossfire heat (index heat − 1): red, orange, white-hot. Ball tints multiply the red Crossfire ball
 * material (your own; another rat's glow brighter); glows and trails are absolute. `dim` is the clarity batch's level
 * for another rat's ball that is no threat to you. */
export function heatPalette(dim:number){
    const own=[new THREE.Color(1,1,1),new THREE.Color(1.27,5.8,1.25),new THREE.Color(4,22,26)];
    const enemy=[new THREE.Color(2.4,1.4,1.2),new THREE.Color(2.4,8,1.6),new THREE.Color(6,32,36)];
    const glow=[new THREE.Color(0xff240b),new THREE.Color(0xff7a14),new THREE.Color(0xfff1c8)];
    // Another rat's ball keeps a hot red-orange rim at heat 3, so the white-hot core still reads as a threat.
    const rim=[glow[0]!,glow[1]!,new THREE.Color(0xff4a12)];
    const trail=[new THREE.Color(0xff3015),new THREE.Color(0xff8a20),new THREE.Color(0xfff0c8)];
    const calm=(colors:THREE.Color[])=>colors.map(c=>c.clone().multiplyScalar(dim));
    return {own,enemy,calm:calm(enemy),glow,rim,calmRim:calm(rim),trail,calmTrail:calm(trail)};
}
/** One world ray from `from` to `to`: true on a hit, with its point and outward normal written out. */
export type SceneryCast=(from:Vec3Data,to:Vec3Data,point:THREE.Vector3,normal:THREE.Vector3)=>boolean;

/** Every Crossfire bounce's sparks, scorch and ricochet; a bank kill's glowing path; your aim guide. Fixed pools, no
 * lights, nothing allocated per frame. */
export class CrossfireVisual {
    private readonly root=new THREE.Group();
    private readonly glow=heatPalette(1).glow;
    private readonly sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,.035,1),
        new THREE.MeshBasicMaterial({transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),SPARKS);
    private readonly sparkSlots=Array.from({length:SPARKS},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:Infinity,life:1}));
    private sparkCursor=0;
    private sparksLive=false;
    private readonly scorches:THREE.InstancedMesh;
    private readonly scorchSlots=Array.from({length:J.scorches},()=>({age:Infinity,heat:0}));
    private scorchCursor=0;
    private scorchesLive=false;
    private readonly pathMaterial=new THREE.MeshBasicMaterial({color:0xff2a10,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false});
    private readonly path=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),this.pathMaterial,SEGMENTS);
    private pathAge=Infinity;
    private readonly dots=new THREE.InstancedMesh(new THREE.SphereGeometry(.07,6,4),
        new THREE.MeshBasicMaterial({transparent:true,opacity:.6,depthWrite:false,toneMapped:false}),J.guideDots);
    private readonly dotNear=new THREE.Color(1,.85,.7);
    private readonly dotFar=new THREE.Color(1,.3,.16);
    private readonly dummy=new THREE.Object3D();
    private readonly a=new THREE.Vector3();
    private readonly b=new THREE.Vector3();
    private readonly n=new THREE.Vector3();
    private readonly side=new THREE.Vector3();
    private readonly up=new THREE.Vector3();
    private readonly aim=new THREE.Vector3();
    private readonly hit=new THREE.Vector3();
    private readonly direction=new THREE.Vector3();
    private readonly faceAxis=new THREE.Vector3(0,0,1);
    /** Your rat's model and its gun's muzzle, looked up once per model. */
    private rat?:THREE.Object3D;
    private muzzleNode?:THREE.Object3D;
    private readonly muzzle=new THREE.Vector3();
    private readonly black=new THREE.Color(0,0,0);
    private readonly white=new THREE.Color(1,1,1);
    private readonly color=new THREE.Color();
    constructor(scene:THREE.Scene){
        // A scorch is a disc hottest at its centre, fading to nothing at its rim (additive: black is invisible).
        const disc=new THREE.CircleGeometry(J.scorch/2,18),colors=new Float32Array(disc.getAttribute('position').count*3);
        colors.set([1,1,1],0);disc.setAttribute('color',new THREE.BufferAttribute(colors,3));
        this.scorches=new THREE.InstancedMesh(disc,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,
            toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),J.scorches);
        const names=['crossfire-sparks','crossfire-scorches','crossfire-bank-path','crossfire-aim-guide'];
        [this.sparks,this.scorches,this.path,this.dots].forEach((mesh,i)=>{
            mesh.name=names[i]!;mesh.frustumCulled=false;mesh.visible=false;mesh.count=0;mesh.setColorAt(0,this.black);this.root.add(mesh);
        });
        this.path.renderOrder=10;
        this.root.name='crossfire-juice';scene.add(this.root);
    }

    /** A Crossfire world bounce at `p` off a surface facing `normal`, the ball's `bounces`th: sparks, a scorch and a ricochet. */
    bounce(p:Vec3Data,normal:Vec3Data,bounces:number):void {
        const heat=Math.min(CROSSFIRE.maxHeat,bounces)-1,glow=this.glow[heat]!;
        this.n.set(normal.x,normal.y,normal.z).normalize();
        this.side.set(Math.abs(this.n.y)<.9?0:1,Math.abs(this.n.y)<.9?1:0,0).cross(this.n).normalize();this.up.crossVectors(this.n,this.side);
        for(let i=0;i<J.sparks;i++){
            const index=this.sparkCursor++%SPARKS,spark=this.sparkSlots[index]!,angle=(this.sparkCursor+i)*2.39996,speed=J.sparkSpeed*(.55+.45*Math.random());
            spark.v.copy(this.n).multiplyScalar(speed*.7).addScaledVector(this.side,Math.cos(angle)*speed*.8).addScaledVector(this.up,Math.sin(angle)*speed*.8);
            spark.p.set(p.x,p.y,p.z);spark.age=0;spark.life=J.sparkLife*(.6+.4*Math.random());
            this.sparks.setColorAt(index,glow);
        }
        this.sparks.count=SPARKS;this.sparks.visible=this.sparksLive=true;this.sparks.instanceColor!.needsUpdate=true;
        const index=this.scorchCursor++%J.scorches,slot=this.scorchSlots[index]!;
        slot.age=0;slot.heat=heat;
        // The drawn facade usually stands 0.2–0.3 in front of the collision surface the bounce hit.
        this.dummy.position.set(p.x,p.y,p.z).addScaledVector(this.n,.32);this.dummy.quaternion.setFromUnitVectors(this.faceAxis,this.n);
        this.dummy.scale.setScalar(.8+.25*heat);this.dummy.updateMatrix();
        this.scorches.setMatrixAt(index,this.dummy.matrix);this.scorches.instanceMatrix.needsUpdate=true;
        this.scorches.count=Math.max(this.scorches.count,index+1);this.scorches.visible=this.scorchesLive=true;
        playSynth('ricochet',p,1+J.pitchStep*(Math.min(bounces,J.pitchSteps+1)-1),J.ricochet);
    }

    /** A bank kill you made or took: its path (muzzle, bounces, hit) glows red and fades. */
    showPath(points:readonly Vec3Data[]):void {
        let count=0;
        for(let i=1;i<points.length&&count<SEGMENTS;i++){
            const from=points[i-1]!,to=points[i]!;
            this.a.set(from.x,from.y,from.z);this.b.set(to.x,to.y,to.z);
            const length=this.a.distanceTo(this.b);if(length<.01)continue;
            this.dummy.position.addVectors(this.a,this.b).multiplyScalar(.5);this.dummy.lookAt(this.b);
            this.dummy.scale.set(J.pathWidth,J.pathWidth,length);this.dummy.updateMatrix();
            this.path.setColorAt(count,this.white);this.path.setMatrixAt(count++,this.dummy.matrix);
        }
        this.path.count=count;this.path.visible=count>0;this.path.instanceMatrix.needsUpdate=true;if(this.path.instanceColor)this.path.instanceColor.needsUpdate=true;this.pathAge=count?0:Infinity;
    }

    /** Your aim guide: dots from your `rat`'s muzzle along the crosshair to the first wall, then `guideBounce` units of the
     * rebound. Two rays (`cast`) a frame: the crosshair's, then the muzzle's to where it points. Hidden without a `rat`. */
    guide(rat:THREE.Object3D|undefined,camera:THREE.Camera,cast:SceneryCast):void {
        if(rat!==this.rat){this.rat=rat;this.muzzleNode=rat?.getObjectByName('rat-muzzle');}
        if(!this.muzzleNode){this.dots.visible=false;return;}
        const muzzle=this.muzzleNode.getWorldPosition(this.muzzle);
        camera.getWorldDirection(this.direction);camera.getWorldPosition(this.a);this.b.copy(this.a).addScaledVector(this.direction,200);
        if(!cast(this.a,this.b,this.aim,this.n))this.aim.copy(this.b);
        this.direction.subVectors(this.aim,muzzle);const reach=this.direction.length();
        if(reach<.3){this.dots.visible=false;return;}
        this.direction.divideScalar(reach);this.b.copy(muzzle).addScaledVector(this.direction,reach+.5);
        if(!cast(muzzle,this.b,this.hit,this.n)){this.dots.visible=false;return;}
        const out=muzzle.distanceTo(this.hit),gap=Math.max(J.guideGap,out/(J.guideDots-BOUNCE_DOTS));
        let count=0;
        this.dummy.quaternion.identity();this.dummy.scale.setScalar(1);
        for(let d=gap*.6;d<out&&count<J.guideDots-BOUNCE_DOTS;d+=gap){
            this.dummy.position.copy(muzzle).addScaledVector(this.direction,d);this.dummy.updateMatrix();
            this.dots.setColorAt(count,this.dotNear);this.dots.setMatrixAt(count++,this.dummy.matrix);
        }
        // The rebound: the incoming direction mirrored in the wall.
        this.direction.addScaledVector(this.n,-2*this.direction.dot(this.n));
        for(let k=0;k<BOUNCE_DOTS&&count<J.guideDots;k++){
            const d=J.guideGap*(k+.5);
            this.dummy.position.copy(this.hit).addScaledVector(this.direction,d);this.dummy.updateMatrix();
            this.color.copy(this.dotFar).multiplyScalar(1-k/BOUNCE_DOTS*.7);
            this.dots.setColorAt(count,this.color);this.dots.setMatrixAt(count++,this.dummy.matrix);
        }
        this.dots.count=count;this.dots.visible=count>0;this.dots.instanceMatrix.needsUpdate=true;this.dots.instanceColor!.needsUpdate=true;
    }

    update(dt:number):void {
        if(this.sparksLive){
            let live=false;
            for(let i=0;i<SPARKS;i++){
                const spark=this.sparkSlots[i]!;
                if((spark.age+=dt)>=spark.life){this.dummy.scale.setScalar(0);this.dummy.position.copy(spark.p);}
                else{
                    live=true;spark.v.y-=dt*9;spark.v.multiplyScalar(Math.exp(-4*dt));spark.p.addScaledVector(spark.v,dt);
                    const fade=1-spark.age/spark.life;
                    this.dummy.position.copy(spark.p);this.dummy.lookAt(this.a.copy(spark.p).add(spark.v));
                    this.dummy.scale.set(fade,fade,Math.max(.02,spark.v.length()*.04*fade));
                }
                this.dummy.updateMatrix();this.sparks.setMatrixAt(i,this.dummy.matrix);
            }
            this.sparks.instanceMatrix.needsUpdate=true;this.sparks.visible=this.sparksLive=live;
        }
        if(this.scorchesLive){
            let live=false;
            for(let i=0;i<this.scorches.count;i++){
                const slot=this.scorchSlots[i]!,fade=1-(slot.age+=dt)*1000/J.scorchMs;
                if(fade>0)live=true;
                // Bright at first, cooling slowly, then gone.
                this.scorches.setColorAt(i,fade>0?this.color.copy(this.glow[slot.heat]!).multiplyScalar(fade*fade*1.4):this.black);
            }
            this.scorches.instanceColor!.needsUpdate=true;this.scorches.visible=this.scorchesLive=live;
        }
        if(this.pathAge<Infinity){
            this.pathAge+=dt*1000;
            const left=1-this.pathAge/J.pathMs;
            if(left<=0){this.pathAge=Infinity;this.path.visible=false;}
            else this.pathMaterial.opacity=.9*Math.min(1,left*2.5);
        }
    }

    dispose():void {
        this.root.removeFromParent();disposeMeshResources(this.root);
        for(const mesh of [this.sparks,this.scorches,this.path,this.dots])mesh.dispose();
    }
}
