import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {MARKS,type ChalkMark,type Flock,type MuckRun,type WaxRun} from '../shared/cityMarks';
import {PigeonFlocks} from './PigeonFlocks';
import {PawPrints} from './PawPrints';

/** Muck off a sewer floor: wet olive slime, light enough to read on the dark street. */
export const MUCK_INK=0x6f7a3a;
/** The outline's square on the ground (a sprawled rat with room for its tail), and how rain wears it: from full to
 * `worn` over `wearMs`. A new outline is drawn in over `drawMs` as the body goes. */
const CHALK={size:3.4,worn:.4,wearMs:180_000,drawMs:900} as const;
/** Hot wax: a drop's size, how long it glows, how long it takes to cool dark, and how near it is drawn. */
const WAX={size:.95,glowMs:3_500,coolMs:20_000,range:70} as const;
const UP=new THREE.Vector3(0,1,0);

interface Marks {chalk?:readonly ChalkMark[];muck?:readonly MuckRun[];wax?:readonly WaxRun[];flocks?:readonly Flock[]}

/** What the chaos leaves (`cityMarks.ts`), presentation of the authority's marks: chalk outlines with each dead rat's
 * dropped fedora, sewer muck prints, the hot case's wax (bright orange as it lands, cooling to a dark red bead) and
 * the pigeons it spooks. Instanced batches, lit as evidence with the case files; GPU depth owns occlusion. */
export class CityMarksView {
    readonly root=new THREE.Group();
    readonly muck=new PawPrints(MUCK_INK,{afterMs:0,name:'sewer-muck-prints'});
    private readonly chalk:Decals;
    private readonly wax:THREE.InstancedMesh;
    readonly pigeons=new PigeonFlocks();
    private readonly hats:THREE.InstancedMesh;
    private readonly pose=new THREE.Object3D();
    private readonly color=new THREE.Color();
    constructor(){
        this.root.name='city-marks';
        this.chalk=new Decals('chalk-outlines',CHALK.size,CHALK.size,MARKS.chalk,0xe8e2d2,chalkOutlineTexture);
        const drop=new THREE.PlaneGeometry(WAX.size,WAX.size);drop.rotateX(-Math.PI/2);
        this.wax=new THREE.InstancedMesh(drop,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,
            polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-8}),MARKS.wax*MARKS.waxRun);
        this.wax.name='hot-wax';this.wax.count=0;this.wax.frustumCulled=false;this.wax.raycast=()=>{};this.wax.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.wax.setColorAt(0,new THREE.Color());
        this.hats=new THREE.InstancedMesh(hatGeometry(),new THREE.MeshStandardMaterial({roughness:.85,metalness:0}),MARKS.chalk);
        this.hats.name='dropped-fedoras';this.hats.count=0;this.hats.frustumCulled=false;this.hats.castShadow=false;this.hats.receiveShadow=true;
        this.hats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.hats.raycast=()=>{};
        this.root.add(this.chalk.mesh,this.hats,this.muck.mesh,this.wax,this.pigeons.root);
    }
    /** `now`: the authority's clock. `still`: a replay (everything as it lies). */
    update(marks:Marks,now:number,eye:THREE.Vector3,frustum:THREE.Frustum,motion:boolean,still:boolean,view:THREE.Camera):void {
        const chalk=marks.chalk??[];
        this.chalk.begin();this.hats.count=0;
        for(const m of chalk){
            const age=Math.max(0,now-m.at),drawn=still?1:Math.min(1,age/CHALK.drawMs);
            const ink=drawn*(1-(1-CHALK.worn)*Math.min(1,age/CHALK.wearMs));
            this.chalk.add(m.p,m.h,1,ink);
            // The fedora lies past the head, a little to one side, brim down and tipped.
            const side=(hash(m.id)&1)?1:-1,fx=Math.sin(m.h),fz=Math.cos(m.h);
            const pose=this.pose;
            pose.position.set(m.p.x+fx*1.25+fz*.45*side,m.p.y+.02,m.p.z+fz*1.25-fx*.45*side);
            pose.rotation.set(.12*side,m.h+side*.6,.08);pose.scale.setScalar(Math.min(1,.4+drawn));pose.updateMatrix();
            const n=this.hats.count++;this.hats.setMatrixAt(n,pose.matrix);this.hats.setColorAt(n,this.color.setHex(m.c));
        }
        this.chalk.end();
        this.hats.visible=this.hats.count>0;this.hats.instanceMatrix.needsUpdate=true;if(this.hats.instanceColor)this.hats.instanceColor.needsUpdate=true;
        this.updateWax(marks.wax??[],now,eye,still);
        this.pigeons.update(marks.flocks??[],now,still,view);
        this.muck.update(marks.muck??[],now,eye,frustum,motion,still);
    }
    /** Each drop glows bright as it lands, then cools to a dark bead (a fresh one says the carrier passed moments ago). */
    private updateWax(runs:readonly WaxRun[],now:number,eye:THREE.Vector3,still:boolean):void {
        let n=0;const pose=this.pose,color=this.color;
        if(runs.length)this.ensureWaxArt();
        for(const r of runs)for(let i=0;i+3<r.f.length;i+=4){
            const x=r.f[i]!,y=r.f[i+1]!,z=r.f[i+2]!;
            if(Math.hypot(x-eye.x,z-eye.z)>WAX.range)continue;
            const age=still?WAX.glowMs:Math.max(0,now-(r.at+r.f[i+3]!));
            const hot=1-Math.min(1,age/WAX.glowMs),cool=Math.min(1,age/WAX.coolMs),fade=1-Math.max(0,(age-(MARKS.waxMs-3000))/3000);
            // White-orange as it lands, the case's red as it sets, a dark bead at the end.
            color.setRGB((.55+.6*(1-cool)+1.8*hot)*fade,(.05+.16*(1-cool)+.9*hot)*fade,(.04+.06*(1-cool)+.35*hot)*fade);
            pose.position.set(x,y,z);pose.rotation.set(0,(i*1.7+r.at)%6.28,0);pose.scale.setScalar(.75+.6*hot+.25*((i>>2)%3)/2);pose.updateMatrix();
            this.wax.setMatrixAt(n,pose.matrix);this.wax.setColorAt(n,color);n++;
        }
        this.wax.count=n;this.wax.visible=n>0;this.wax.instanceMatrix.needsUpdate=true;if(this.wax.instanceColor)this.wax.instanceColor.needsUpdate=true;
    }
    /** The wax art is drawn on first use, as the warm-up does. */
    private ensureWaxArt():void {const material=this.wax.material as THREE.MeshBasicMaterial;if(!material.map){material.map=waxTexture();material.needsUpdate=true;}}
    warm():void {this.ensureWaxArt();this.chalk.warm();this.muck.warm();this.pigeons.warm();this.wax.count=1;this.wax.visible=true;this.wax.setMatrixAt(0,new THREE.Matrix4());this.hats.count=1;this.hats.visible=true;this.hats.setMatrixAt(0,new THREE.Matrix4());this.hats.setColorAt(0,this.color.setHex(0));}
    clear():void {this.chalk.clear();this.hats.count=0;this.hats.visible=false;this.wax.count=0;this.wax.visible=false;this.muck.clear();this.pigeons.clear();}
    dispose():void {this.clear();this.chalk.dispose();this.hats.geometry.dispose();(this.hats.material as THREE.Material).dispose();this.hats.dispose();this.wax.geometry.dispose();(this.wax.material as THREE.Material).dispose();this.wax.dispose();this.muck.dispose();this.pigeons.dispose();}
}

/** Flat instanced decals with a per-instance ink (alpha) and a length scale along their heading. */
class Decals {
    readonly mesh:THREE.InstancedMesh;
    private readonly inks:THREE.InstancedBufferAttribute;
    private readonly material:THREE.MeshStandardMaterial;
    private readonly pose=new THREE.Object3D();
    private readonly turn=new THREE.Quaternion();
    private n=0;
    constructor(name:string,w:number,d:number,max:number,tint:number,private readonly art:()=>THREE.Texture){
        const geometry=new THREE.PlaneGeometry(w,d);geometry.rotateX(-Math.PI/2);
        this.inks=new THREE.InstancedBufferAttribute(new Float32Array(max),1);this.inks.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('markInk',this.inks);
        this.material=new THREE.MeshStandardMaterial({color:tint,emissive:tint,emissiveIntensity:.32,roughness:1,metalness:0,
            transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-8});
        this.material.onBeforeCompile=shader=>{
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float markInk;\nvarying float vMarkInk;')
                .replace('#include <uv_vertex>','#include <uv_vertex>\nvMarkInk=markInk;');
            shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vMarkInk;')
                .replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=vMarkInk;');
        };
        this.material.customProgramCacheKey=()=>'city-mark-v1';
        this.mesh=new THREE.InstancedMesh(geometry,this.material,max);
        this.mesh.name=name;this.mesh.count=0;this.mesh.visible=false;this.mesh.frustumCulled=false;this.mesh.raycast=()=>{};
        this.mesh.receiveShadow=true;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    begin():void {this.n=0;}
    add(p:{x:number;y:number;z:number},h:number,length:number,ink:number):void {
        if(ink<=.01||this.n>=this.inks.count)return;
        if(!this.material.map){this.material.map=this.art();this.material.needsUpdate=true;}
        const pose=this.pose;pose.position.set(p.x,p.y,p.z);
        pose.quaternion.identity();this.turn.setFromAxisAngle(UP,h);pose.quaternion.multiply(this.turn);
        pose.scale.set(1,1,length);pose.updateMatrix();
        this.mesh.setMatrixAt(this.n,pose.matrix);this.inks.setX(this.n,ink);this.n++;
    }
    end():void {this.mesh.count=this.n;this.mesh.visible=this.n>0;this.mesh.instanceMatrix.needsUpdate=true;this.inks.needsUpdate=true;}
    warm():void {if(!this.material.map){this.material.map=this.art();this.material.needsUpdate=true;}this.mesh.count=1;this.mesh.visible=true;this.mesh.setMatrixAt(0,new THREE.Matrix4());this.inks.setX(0,0);this.mesh.instanceMatrix.needsUpdate=true;}
    clear():void {this.n=0;this.mesh.count=0;this.mesh.visible=false;}
    dispose():void {this.mesh.geometry.dispose();this.material.dispose();this.mesh.dispose();}
}

const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;};

/** A dropped fedora at the rat model's size: a brim and a dented crown (the band is left on the head it came off). */
function hatGeometry():THREE.BufferGeometry {
    const brim=new THREE.LatheGeometry([[0,-.0175],[.628,-.0175],[.64,-.008],[.64,.008],[.628,.0175],[0,.0175]].map(([r,y])=>new THREE.Vector2(r,y)),32);
    brim.scale(1,1,.8);
    const crown=new THREE.CylinderGeometry(.315,.35,.38,20,1);crown.scale(1,1,.86);crown.translate(0,.2,0);
    const merged=mergeGeometries([brim.toNonIndexed(),crown.toNonIndexed()])!;merged.computeVertexNormals();
    return merged;
}

/** Seeded scribble helpers: chalk is a dry, broken line. */
function chalkPen(g:CanvasRenderingContext2D,seed:number){
    let s=seed>>>0;const random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
    /** A chalk stroke along the points: several thin, jittered passes. */
    const stroke=(pts:[number,number][],width:number,closed=false)=>{
        for(let pass=0;pass<4;pass++){
            g.globalAlpha=.35+random()*.4;g.lineWidth=width*(.6+random()*.5);g.beginPath();
            pts.forEach(([x,y],i)=>{const j=width*.35;const px=x+(random()-.5)*j,py=y+(random()-.5)*j;i?g.lineTo(px,py):g.moveTo(px,py);});
            if(closed)g.closePath();g.stroke();
        }
        g.globalAlpha=1;
    };
    const dust=(count:number,w:number,h:number)=>{g.globalCompositeOperation='destination-out';for(let i=0;i<count;i++){g.globalAlpha=.3+random()*.7;g.beginPath();g.arc(random()*w,random()*h,.6+random()*1.8,0,Math.PI*2);g.fill();}g.globalAlpha=1;g.globalCompositeOperation='source-over';};
    return {stroke,dust,random};
}
let outline:THREE.CanvasTexture|undefined;
/** A sprawled rat in chalk, head toward the canvas's foot (the plane's +z, the heading): one rough contour around the
 * whole body (head and ears, body, flung sleeves and feet, a long curling tail), as police draw them. The body is
 * filled on a scratch canvas, grown a few pixels in every direction, then the body itself is cut out: what is left is
 * its outline. */
function chalkOutlineTexture():THREE.CanvasTexture {
    if(outline)return outline;
    const size=256,shape=document.createElement('canvas');shape.width=shape.height=size;
    const b=shape.getContext('2d')!;b.fillStyle=b.strokeStyle='#fff';b.lineCap=b.lineJoin='round';
    const blob=(x:number,y:number,rx:number,ry:number,turn=0)=>{b.beginPath();b.ellipse(x,y,rx,ry,turn,0,Math.PI*2);b.fill();};
    const limb=(width:number,...pts:[number,number][])=>{b.lineWidth=width;b.beginPath();pts.forEach(([x,y],i)=>i?b.lineTo(x,y):b.moveTo(x,y));b.stroke();};
    blob(128,190,30,27);blob(98,212,15,17,-.5);blob(158,212,15,17,.5);blob(128,224,11,14);   // head, ears, snout
    blob(128,128,38,50);                                                                      // body
    limb(20,[100,150],[66,170],[44,198]);limb(20,[156,146],[192,152],[218,128]);              // sleeves, flung
    limb(22,[110,88],[92,52],[72,36]);limb(22,[146,88],[166,54],[190,44]);                    // legs
    limb(9,[128,80],[134,52],[156,28],[190,20],[214,34],[208,56],[188,58]);                   // tail, curling
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const g=canvas.getContext('2d')!;
    for(let i=0;i<20;i++){const a=i/20*Math.PI*2;g.drawImage(shape,Math.cos(a)*6,Math.sin(a)*6);}
    g.globalCompositeOperation='destination-out';g.drawImage(shape,0,0);g.globalCompositeOperation='source-over';
    chalkPen(g,1940).dust(900,size,size);
    outline=new THREE.CanvasTexture(canvas);outline.colorSpace=THREE.SRGBColorSpace;outline.anisotropy=4;
    return outline;
}

let drop:THREE.CanvasTexture|undefined;
/** A splash of wax, white on clear (instance colour tints it): a round bead with a few splatter droplets. */
function waxTexture():THREE.CanvasTexture {
    if(drop)return drop;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const g=canvas.getContext('2d')!;g.fillStyle='#fff';
    const bead=(x:number,y:number,r:number)=>{g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();};
    // A soft halo (the glow while hot, a stain once cool) under the bead and its splatter.
    const halo=g.createRadialGradient(32,32,4,32,32,31);halo.addColorStop(0,'rgba(255,255,255,.55)');halo.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=halo;g.fillRect(0,0,64,64);g.fillStyle='#fff';
    bead(32,32,11);bead(43,25,4.5);bead(21,40,3.5);bead(40,44,3);bead(23,22,2.5);bead(49,37,2);
    drop=new THREE.CanvasTexture(canvas);drop.colorSpace=THREE.SRGBColorSpace;
    return drop;
}
