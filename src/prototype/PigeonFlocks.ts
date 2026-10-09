import * as THREE from 'three';
import type {Flock} from '../shared/cityMarks';
import {MARKS} from '../shared/cityMarks';

/** A flock: how many birds, how high and wide they climb and circle (units), and when they scatter (ms). Made to be
 * seen across the city (Tyler: "super obvious"): big pale birds, out of the fog, well above the roofs. */
const FLOCK={birds:44,span:2.6,climb:30,circle:13,scatterMs:6_600,feathers:28} as const;
const BIRDS=MARKS.flocks*FLOCK.birds,FEATHERS=MARKS.flocks*FLOCK.feathers;

interface Bird {angle:number;spin:number;lift:number;radius:number;flap:number;rate:number;out:number;tilt:number}
interface Seen {flock:Flock;birds:Bird[];fired:boolean}

const seeded=(id:string)=>{let s=0;for(let i=0;i<id.length;i++)s=Math.imul(s^id.charCodeAt(i),16777619)>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};};

/** Pigeons the hot case flushes (`cityMarks.ts`), presentation of the authority's flocks: a burst off the street with
 * a puff of feathers, a climbing spiral over the spot that holds for a few seconds high above the roofs, then the birds
 * scatter. One instanced batch of flapping V's and one of falling feathers; unlit, out of the fog, pale against the
 * night sky. `onFlush` plays the wing clatter where it happens. */
export class PigeonFlocks {
    readonly root=new THREE.Group();
    onFlush?:(p:THREE.Vector3)=>void;
    private readonly birds:THREE.InstancedMesh;
    private readonly feathers:THREE.InstancedMesh;
    private readonly seen=new Map<string,Seen>();
    private readonly pose=new THREE.Object3D();
    private readonly point=new THREE.Vector3();
    constructor(){
        this.root.name='pigeon-flocks';
        // A pigeon as the eye sees one in flight, always facing the camera: a silhouette with its wings raised. The flap
        // mirrors it top to bottom (wings down): its y scale runs from +1 to about −.7.
        const shape=new THREE.PlaneGeometry(1,.62);
        // The pigeon art is drawn on first use (`ensureArt`): the load's warm-up does it, so its program links before play.
        this.birds=new THREE.InstancedMesh(shape,new THREE.MeshBasicMaterial({alphaTest:.5,side:THREE.DoubleSide,fog:false}),BIRDS);
        const feather=new THREE.PlaneGeometry(.22,.5);
        this.feathers=new THREE.InstancedMesh(feather,new THREE.MeshBasicMaterial({color:0xf2f2ee,side:THREE.DoubleSide,fog:false}),FEATHERS);
        for(const mesh of [this.birds,this.feathers]){mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);}
    }
    /** `now`: the authority's clock. `still`: a replay (no new clatter). */
    /** `view`: the camera (birds face it, and shrink right at the lens). */
    update(flocks:readonly Flock[],now:number,still:boolean,view:THREE.Camera):void {
        const facing=view.quaternion,lens=view.position;
        const live=new Set<string>();
        if(flocks.length)this.ensureArt();
        let b=0,f=0;
        for(const flock of flocks){
            live.add(flock.id);
            let seen=this.seen.get(flock.id);
            if(!seen){
                const random=seeded(flock.id);
                seen={flock,fired:still||now-flock.at>1200,birds:Array.from({length:FLOCK.birds},()=>({angle:random()*Math.PI*2,spin:(.8+random()*.7)*(random()<.5?-1:1),
                    lift:.15+random()*.85,radius:.35+random()*.9,flap:random()*6.28,rate:15+random()*7,out:random()*Math.PI*2,tilt:random()-.5}))};
                this.seen.set(flock.id,seen);
            }
            const t=(now-flock.at)/1000;if(t<0)continue;
            if(!seen.fired){seen.fired=true;this.onFlush?.(this.point.set(flock.p.x,flock.p.y+2,flock.p.z));}
            for(const bird of seen.birds){
                if(b>=BIRDS)break;
                // Burst out across the street at head height (in the shoulder camera's view), climb to circle over the roofs
                // (seen from blocks away), then scatter outward and away.
                const burst=Math.min(1,t/.9),climb=Math.min(1,Math.max(0,(t-2.2)/2.6)),scatter=Math.max(0,(t*1000-FLOCK.scatterMs)/1000);
                const ease=climb*climb*(3-2*climb);
                const angle=bird.angle+bird.spin*t*1.2,radius=(1.5+FLOCK.circle*bird.radius*(1-Math.pow(1-burst,3)))*(1-.35*ease)+scatter*scatter*9;
                const height=.8+(.6+3.2*bird.lift)*burst*(1-ease)+(10+FLOCK.climb*bird.lift)*ease+scatter*6+Math.sin(t*3+bird.flap)*.4;
                const x=flock.p.x+Math.cos(angle)*radius+Math.cos(bird.out)*scatter*14,z=flock.p.z+Math.sin(angle)*radius+Math.sin(bird.out)*scatter*14;
                const size=FLOCK.span*Math.min(1,t*3+.3)*(1-Math.min(1,scatter/2.5));
                const near=Math.min(1,Math.max(0,(Math.hypot(x-lens.x,flock.p.y+height-lens.y,z-lens.z)-2)/6));
                if(size*near<=.01)continue;
                const pose=this.pose;pose.position.set(x,flock.p.y+height,z);
                // Facing the camera, tipped as it banks round the circle.
                pose.quaternion.copy(facing);pose.rotateZ(bird.spin*.25+bird.tilt*.4);
                const wings=Math.sin(bird.flap+t*bird.rate);
                pose.scale.set(size*near,size*near*(wings>0?1:-.7)*(.55+.45*Math.abs(wings)),size*near);pose.updateMatrix();
                this.birds.setMatrixAt(b++,pose.matrix);
            }
            // Feathers: a puff off the street that drifts down, swaying, for a few seconds.
            if(t<5){const random=seeded(flock.id+'f');
                for(let i=0;i<FLOCK.feathers&&f<FEATHERS;i++){
                    const a=random()*Math.PI*2,r=random()*3.5,up=2+random()*6,drift=t*(.4+random()*.5);
                    const pose=this.pose;pose.position.set(flock.p.x+Math.cos(a)*(r+drift),flock.p.y+Math.max(.05,up*Math.min(1,t*4)-t*.9*up/4),flock.p.z+Math.sin(a)*(r+drift));
                    pose.rotation.set(Math.sin(t*3+i)*.9,a+t,Math.cos(t*2.3+i)*.6);pose.scale.setScalar(1-t/5);pose.updateMatrix();
                    this.feathers.setMatrixAt(f++,pose.matrix);
                }}
        }
        for(const id of this.seen.keys())if(!live.has(id))this.seen.delete(id);
        this.birds.count=b;this.birds.visible=b>0;this.birds.instanceMatrix.needsUpdate=true;
        this.feathers.count=f;this.feathers.visible=f>0;this.feathers.instanceMatrix.needsUpdate=true;
    }
    private ensureArt():void {const material=this.birds.material as THREE.MeshBasicMaterial;if(!material.map){material.map=pigeonTexture();material.needsUpdate=true;}}
    warm():void {this.ensureArt();for(const mesh of [this.birds,this.feathers]){mesh.count=1;mesh.visible=true;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.instanceMatrix.needsUpdate=true;}}
    clear():void {this.seen.clear();for(const mesh of [this.birds,this.feathers]){mesh.count=0;mesh.visible=false;}}
    dispose():void {this.clear();for(const mesh of [this.birds,this.feathers]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}}
}

let art:THREE.CanvasTexture|undefined;
/** A pigeon in flight, wings raised, from behind or below: pale grey with darker wingtips and a dark edge, so it reads
 * against the night sky and the dark streets alike. */
function pigeonTexture():THREE.CanvasTexture {
    if(art)return art;
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=80;
    const g=canvas.getContext('2d')!;
    const bird=()=>{g.beginPath();
        // Left wing up and out, a scalloped trailing edge back to the body; the right wing the same mirrored.
        g.moveTo(64,52);g.quadraticCurveTo(44,28,8,10);g.quadraticCurveTo(22,30,18,34);g.quadraticCurveTo(30,36,28,42);g.quadraticCurveTo(42,44,52,58);
        g.lineTo(76,58);g.quadraticCurveTo(86,44,100,42);g.quadraticCurveTo(98,36,110,34);g.quadraticCurveTo(106,30,120,10);g.quadraticCurveTo(84,28,64,52);g.closePath();};
    g.lineJoin='round';
    bird();g.fillStyle='#2b2f38';g.lineWidth=7;g.strokeStyle='#2b2f38';g.stroke();g.fill();
    bird();g.fillStyle='#d9dde6';g.fill();
    // Body and head, a dark band across each wingtip.
    g.fillStyle='#c7ccd6';g.beginPath();g.ellipse(64,56,9,13,0,0,Math.PI*2);g.fill();
    g.fillStyle='#8d93a3';g.beginPath();g.arc(64,44,6,0,Math.PI*2);g.fill();
    g.fillStyle='#4a4f5c';for(const [x,y] of [[16,18],[112,18]] as const){g.beginPath();g.ellipse(x,y,9,5,x<64?.6:-.6,0,Math.PI*2);g.fill();}
    art=new THREE.CanvasTexture(canvas);art.colorSpace=THREE.SRGBColorSpace;
    return art;
}
