import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {MARKS,type CaseTip,type ChalkMark,type MuckRun} from '../shared/cityMarks';
import {PawPrints} from './PawPrints';
import {CASE_RED} from './caseRed';

/** Muck off a sewer floor: wet olive slime, light enough to read on the dark street. */
export const MUCK_INK=0x6f7a3a;
/** The outline's square on the ground (a sprawled rat with room for its tail), and how rain wears it: from full to
 * `worn` over `wearMs`. A new outline is drawn in over `drawMs` as the body goes. */
const CHALK={size:3.4,worn:.4,wearMs:180_000,drawMs:900} as const;
/** The tip: its note, and the chalk arrow toward where the witness saw the carrier (`min`…`max` long, longer the
 * farther away). */
const TIP={note:{w:.62,d:.78},arrow:{w:.9,min:2.2,max:5.5,per:.12},drawMs:700} as const;
const UP=new THREE.Vector3(0,1,0);

interface Marks {chalk?:readonly ChalkMark[];tips?:readonly CaseTip[];muck?:readonly MuckRun[]}

/** What the chaos leaves (`cityMarks.ts`), presentation of the authority's marks: chalk outlines with each dead rat's
 * dropped fedora, a witness's tip (a red-edged note and a chalk arrow) and sewer muck prints. Instanced batches, lit
 * as evidence with the case files; GPU depth owns occlusion. Matte chalk, never glowing. */
export class CityMarksView {
    readonly root=new THREE.Group();
    readonly muck=new PawPrints(MUCK_INK,{afterMs:0,name:'sewer-muck-prints'});
    private readonly chalk:Decals;
    private readonly notes:Decals;
    private readonly arrows:Decals;
    private readonly hats:THREE.InstancedMesh;
    private readonly pose=new THREE.Object3D();
    private readonly color=new THREE.Color();
    constructor(){
        this.root.name='city-marks';
        this.chalk=new Decals('chalk-outlines',CHALK.size,CHALK.size,MARKS.chalk,0xe8e2d2,chalkOutlineTexture);
        this.notes=new Decals('witness-tips',TIP.note.w,TIP.note.d,MARKS.tips,0xffffff,tipNoteTexture);
        this.arrows=new Decals('witness-arrows',TIP.arrow.w,1,MARKS.tips,0xe8e2d2,chalkArrowTexture);
        this.hats=new THREE.InstancedMesh(hatGeometry(),new THREE.MeshStandardMaterial({roughness:.85,metalness:0}),MARKS.chalk);
        this.hats.name='dropped-fedoras';this.hats.count=0;this.hats.frustumCulled=false;this.hats.castShadow=false;this.hats.receiveShadow=true;
        this.hats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.hats.raycast=()=>{};
        this.root.add(this.chalk.mesh,this.notes.mesh,this.arrows.mesh,this.hats,this.muck.mesh);
    }
    /** `now`: the authority's clock. `still`: a replay (everything as it lies). */
    update(marks:Marks,now:number,eye:THREE.Vector3,frustum:THREE.Frustum,motion:boolean,still:boolean):void {
        const chalk=marks.chalk??[],tips=marks.tips??[];
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
        this.notes.begin();this.arrows.begin();
        for(const t of tips){
            const age=Math.max(0,now-t.at),drawn=still?1:Math.min(1,age/TIP.drawMs);
            const dx=t.to.x-t.p.x,dz=t.to.z-t.p.z,h=Math.atan2(dx,dz),d=Math.hypot(dx,dz);
            this.notes.add(t.p,h+.35,1,Math.min(1,drawn*2));
            // The arrow starts past the note, drawn out toward where the carrier was seen.
            const length=THREE.MathUtils.clamp(d*TIP.arrow.per+TIP.arrow.min,TIP.arrow.min,TIP.arrow.max)*drawn;
            if(length>.2)this.arrows.add({x:t.p.x+Math.sin(h)*(.55+length/2),y:t.p.y+.003,z:t.p.z+Math.cos(h)*(.55+length/2)},h,length,1);
        }
        this.notes.end();this.arrows.end();
        this.muck.update(marks.muck??[],now,eye,frustum,motion,still);
    }
    warm():void {for(const d of [this.chalk,this.notes,this.arrows])d.warm();this.muck.warm();}
    clear():void {for(const d of [this.chalk,this.notes,this.arrows])d.clear();this.hats.count=0;this.hats.visible=false;this.muck.clear();}
    dispose():void {this.clear();for(const d of [this.chalk,this.notes,this.arrows])d.dispose();this.hats.geometry.dispose();(this.hats.material as THREE.Material).dispose();this.hats.dispose();this.muck.dispose();}
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

let arrow:THREE.CanvasTexture|undefined;
/** A chalk arrow along the canvas toward its foot (+z): a shaft and an open head. */
function chalkArrowTexture():THREE.CanvasTexture {
    if(arrow)return arrow;
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;
    const g=canvas.getContext('2d')!;g.strokeStyle='#fff';g.lineCap=g.lineJoin='round';
    const pen=chalkPen(g,1941);
    pen.stroke([[32,10],[31,120],[33,236]],7);pen.stroke([[10,206],[32,244],[54,206]],7);
    pen.dust(60,64,256);
    arrow=new THREE.CanvasTexture(canvas);arrow.colorSpace=THREE.SRGBColorSpace;
    return arrow;
}

let note:THREE.CanvasTexture|undefined;
/** The witness's note: crumpled cream paper, a case-red edge and a hurried scrawl. */
function tipNoteTexture():THREE.CanvasTexture {
    if(note)return note;
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=200;
    const g=canvas.getContext('2d')!;
    g.fillStyle='#e9e1cb';g.beginPath();g.moveTo(8,6);g.lineTo(150,12);g.lineTo(154,190);g.lineTo(6,194);g.closePath();g.fill();
    g.strokeStyle=`#${CASE_RED.toString(16).padStart(6,'0')}`;g.lineWidth=6;g.stroke();
    // Crumple creases.
    g.strokeStyle='rgba(90,70,40,.35)';g.lineWidth=1.5;
    for(const [a,b,c,d] of [[10,60,150,90],[30,190,120,10],[8,140,154,120]] as const){g.beginPath();g.moveTo(a,b);g.lineTo(c,d);g.stroke();}
    g.fillStyle='#2a2218';g.font='bold 30px "Courier New", monospace';g.textAlign='center';
    g.save();g.translate(80,100);g.rotate(Math.PI);g.fillText('SAW',0,-26);g.fillText("'EM",0,8);g.font='bold 40px sans-serif';g.fillText('↑',0,52);g.restore();
    note=new THREE.CanvasTexture(canvas);note.colorSpace=THREE.SRGBColorSpace;note.anisotropy=4;
    return note;
}
