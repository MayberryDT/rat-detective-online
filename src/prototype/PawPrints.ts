import * as THREE from 'three';
import type {CasePrints} from '../shared/caseClues';
import type {Vec3Data} from '../shared/networkProtocol';
import type {PaperSupport} from './CaseFiles';
import {CASE_RED} from './caseRed';

/** Ink colours to compare: the case's red, or pale chalk. */
export const PAW_INK={red:CASE_RED,chalk:0xd9d2c1} as const;
/** Prints drawn at once, and how far from the rat they read (past that a print is a smudge), fading over the last `FADE`. */
const MAX=128,RANGE=40,FADE=8;
/** A print's size on the ground (width across the paw, length heel to toe): bigger than a rat's paw, so it reads. */
const SIZE={w:.48,d:.62};
/** A new run stamps in print by print once its papers have landed; a retired one fades. */
const STAMP_MS=140,STAMP_GAP=110,FADE_MS=900,AFTER_PAPERS_MS=1300,ARRIVING_WINDOW=2600;
const UP=new THREE.Vector3(0,1,0);

interface Print {x:number;y:number;z:number;h:number;normal?:THREE.Vector3;supported?:boolean}
interface Run {r:CasePrints;prints:Print[];arrive?:number;leave?:number;shown:boolean}

/** Paw prints beside the case papers (Tyler, 8 October), presentation only: the authority lays each run with a fixed
 * id and place: pairs of inked paws across the gap from one paper group to the next, darkest by the papers they leave.
 * A new run stamps in print by print after its papers land (a rat walking across); a retired one fades. Drawn only near
 * the rat. One instanced batch, lit like the papers (NoirCity evidence, adopted with the case files); GPU depth owns
 * occlusion. Matte and steady: never the hot carrier's glowing prints. */
export class PawPrints {
    readonly mesh:THREE.InstancedMesh;
    /** For E2E traces: runs stamped in, runs faded out, and runs that vanished while on screen. */
    readonly stats={stamped:0,faded:0,popped:0};
    /** Cached static-city support under a print (CaseFiles shares its own). */
    support:(p:Vec3Data)=>PaperSupport|undefined=()=>undefined;
    private readonly runs=new Map<string,Run>();
    private readonly material:THREE.MeshStandardMaterial;
    private readonly inks:THREE.InstancedBufferAttribute;
    private readonly pose=new THREE.Object3D();
    private readonly turn=new THREE.Quaternion();
    private readonly sphere=new THREE.Sphere(new THREE.Vector3(),.45);
    private readonly candidates:{run:Run;i:number;d:number}[]=[];
    private readonly live=new Set<string>();
    private primed=false;

    constructor(ink:number=PAW_INK.red){
        const geometry=new THREE.PlaneGeometry(SIZE.w,SIZE.d);geometry.rotateX(-Math.PI/2);
        // Per print: its ink (0…1) and which paw (1: the right, the left one's art mirrored).
        this.inks=new THREE.InstancedBufferAttribute(new Float32Array(MAX*2),2);this.inks.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('pawInk',this.inks);
        this.material=new THREE.MeshStandardMaterial({map:pawTexture(),color:ink,emissive:ink,emissiveIntensity:.4,roughness:1,metalness:0,
            transparent:true,depthWrite:false,side:THREE.FrontSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-8});
        this.material.onBeforeCompile=shader=>{
            shader.vertexShader=shader.vertexShader
                .replace('#include <common>','#include <common>\nattribute vec2 pawInk;\nvarying float vPawInk;')
                .replace('#include <uv_vertex>','#include <uv_vertex>\nvPawInk=pawInk.x;\n#ifdef USE_MAP\nvMapUv.x=mix(vMapUv.x,1.-vMapUv.x,pawInk.y);\n#endif');
            shader.fragmentShader=shader.fragmentShader
                .replace('#include <common>','#include <common>\nvarying float vPawInk;')
                .replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=vPawInk;');
        };
        this.material.customProgramCacheKey=()=>'case-paw-prints-v2';
        this.mesh=new THREE.InstancedMesh(geometry,this.material,MAX);
        this.mesh.name='case-paw-prints';this.mesh.count=0;this.mesh.visible=false;this.mesh.frustumCulled=false;this.mesh.raycast=()=>{};
        this.mesh.receiveShadow=true;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    setInk(color:number):void {this.material.color.setHex(color);this.material.emissive.setHex(color);}

    /** `eye`: the local rat. `motion`: stamping in (else prints only fade in); `still`: a replay, everything as it lies. */
    update(prints:readonly CasePrints[],now:number,eye:THREE.Vector3,frustum:THREE.Frustum,motion:boolean,still:boolean):void {
        this.sync(prints,now,eye,still);
        const candidates=this.candidates;candidates.length=0;
        for(const [id,run] of this.runs){
            if(run.leave!==undefined&&now>=run.leave+FADE_MS){this.runs.delete(id);continue;}
            if(run.arrive!==undefined&&now>=run.arrive+(run.prints.length-1)*STAMP_GAP+STAMP_MS)run.arrive=undefined;
            run.shown=false;
            for(let i=0;i<run.prints.length;i++){
                const p=run.prints[i]!,d=Math.hypot(p.x-eye.x,p.y-eye.y,p.z-eye.z);if(d>RANGE)continue;
                this.sphere.center.set(p.x,p.y,p.z);if(!frustum.intersectsSphere(this.sphere))continue;
                candidates.push({run,i,d});
            }
        }
        candidates.sort((a,b)=>a.d-b.d);
        let n=0;
        for(const {run,i,d} of candidates){
            if(n===MAX)break;
            // Darkest beside the papers, a little fainter toward the next.
            let ink=1-.3*i/Math.max(1,run.prints.length-1),scale=1;
            if(run.arrive!==undefined){
                const t=now-(run.arrive+i*STAMP_GAP);if(t<0)continue;
                if(t<STAMP_MS){const u=t/STAMP_MS;ink*=u;if(motion)scale=1+.35*(1-u)*(1-u);}
            }
            if(run.leave!==undefined)ink*=1-(now-run.leave)/FADE_MS;
            ink*=1-THREE.MathUtils.smoothstep(d,RANGE-FADE,RANGE);
            if(ink<=.01)continue;
            const p=run.prints[i]!;
            if(p.supported===undefined){
                const s=this.support(p);p.supported=!!s;
                if(s){p.y=s.y+.008;p.normal=new THREE.Vector3(s.normal.x,s.normal.y,s.normal.z).normalize();}
            }
            const pose=this.pose;
            pose.position.set(p.x,p.y,p.z);
            pose.quaternion.setFromUnitVectors(UP,p.normal??UP);
            this.turn.setFromAxisAngle(UP,p.h);pose.quaternion.multiply(this.turn);
            pose.scale.set(scale,1,scale);pose.updateMatrix();
            // Right paws are the left ones' art mirrored (in the texture, so both face up to the light).
            this.mesh.setMatrixAt(n,pose.matrix);this.inks.setXY(n,ink,i%2);n++;run.shown=true;
        }
        this.mesh.count=n;this.mesh.visible=n>0;
        this.mesh.instanceMatrix.needsUpdate=true;this.inks.needsUpdate=true;
    }
    /** This view of every live run, for E2E continuity traces: where it starts and ends, and the last print's heading. */
    trace():{id:string;state:string;shown:boolean;first:Vec3Data;end:Vec3Data;h:number}[] {
        return [...this.runs.values()].map(run=>{const a=run.prints[0]!,b=run.prints[run.prints.length-1]!;
            return {id:run.r.id,state:run.leave!==undefined?'fading':run.arrive!==undefined?'stamping':'down',shown:run.shown,first:{x:a.x,y:a.y,z:a.z},end:{x:b.x,y:b.y,z:b.z},h:b.h};});
    }
    warm():void {this.mesh.count=1;this.mesh.visible=true;this.mesh.setMatrixAt(0,new THREE.Matrix4());this.mesh.instanceMatrix.needsUpdate=true;}
    clear():void {this.runs.clear();this.primed=false;this.mesh.count=0;this.mesh.visible=false;}
    dispose():void {this.clear();this.mesh.geometry.dispose();this.material.map?.dispose();this.material.dispose();this.mesh.dispose();}

    /** New runs stamp in if born moments ago near this view; gone ones fade if they were on screen. */
    private sync(prints:readonly CasePrints[],now:number,eye:THREE.Vector3,still:boolean):void {
        const live=this.live;live.clear();
        for(const r of prints){
            live.add(r.id);if(this.runs.has(r.id))continue;
            const run:Run={r,prints:[],shown:false};
            for(let i=0;i+3<r.f.length;i+=4)run.prints.push({x:r.f[i]!,y:r.f[i+1]!,z:r.f[i+2]!,h:r.f[i+3]!});
            if(this.primed&&!still&&now-r.at<ARRIVING_WINDOW&&run.prints.length&&Math.hypot(run.prints[0]!.x-eye.x,run.prints[0]!.z-eye.z)<50){
                run.arrive=Math.max(now,r.at+AFTER_PAPERS_MS);this.stats.stamped++;
            }
            this.runs.set(r.id,run);
        }
        for(const [id,run] of this.runs){
            if(live.has(id)||run.leave!==undefined)continue;
            if(!run.shown||still){this.runs.delete(id);continue;}
            run.leave=now;this.stats.faded++;
        }
        this.primed=true;
    }
}

/** One inked paw, white on clear (the material tints it): a palm pad, four toes and claw nicks, the toes toward the
 * canvas's foot (the plane's +z, the heading). Speckled where the ink missed, like a stamp. */
function pawTexture():THREE.CanvasTexture {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=160;
    const g=canvas.getContext('2d')!;
    g.fillStyle='#fff';
    const blob=(x:number,y:number,rx:number,ry:number,turn=0)=>{g.beginPath();g.ellipse(x,y,rx,ry,turn,0,Math.PI*2);g.fill();};
    // Palm: a broad pad with a notch at the heel.
    blob(64,62,30,25);blob(46,44,15,14,.4);blob(82,44,15,14,-.4);
    // Toes, splayed.
    blob(28,104,11,15,.45);blob(50,124,11,16,.15);blob(78,124,11,16,-.15);blob(100,104,11,15,-.45);
    // Claw nicks past each toe.
    g.strokeStyle='#fff';g.lineWidth=3.5;g.lineCap='round';
    for(const [x,y,dx,dy] of [[22,120,-5,9],[47,141,-2,11],[81,141,2,11],[106,120,5,9]] as const){g.beginPath();g.moveTo(x,y);g.lineTo(x+dx,y+dy);g.stroke();}
    // Where the ink missed: small clear specks, the same every time.
    g.globalCompositeOperation='destination-out';
    let seed=20261008;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<140;i++){g.globalAlpha=.35+random()*.65;g.beginPath();g.arc(random()*128,random()*160,.8+random()*2.2,0,Math.PI*2);g.fill();}
    g.globalAlpha=1;g.globalCompositeOperation='source-over';
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    return texture;
}
