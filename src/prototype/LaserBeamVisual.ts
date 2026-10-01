import * as THREE from 'three';
import type {LaserBeam} from '../shared/chaosState';
import type {Vec3Data} from '../shared/networkProtocol';
import {WEAPON_TUNING as W} from '../shared/pickups';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';

/** Pulp electric green: white-hot core, green glow and the scorch's ember (ArsenalArt's ray gun coil matches). */
const CORE=0xd8ffe4,GLOW=0x39ff7a;
/** Zigzag points per straight leg, and the most a beam can have (muzzle, two reflections, stop). */
const SEGMENTS=10,MAX_LEGS=W.laserBounces+1,MAX_PATH=MAX_LEGS*SEGMENTS+1;
/** Beams in flight at once: every rat's (`MAX_BEAMS`) plus your own predictions. */
const POOL=20,FLARES=24;
export type LaserSound=(cue:'laser-fire'|'laser-hit',at?:Vec3Data)=>void;

/** One soft-edged texture for every additive ribbon and flare: a cross-section (u) or radial (both) falloff. */
function falloff(radial:boolean):THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,d=radial?Math.min(1,Math.hypot(u,v)):Math.abs(v);
        // Ribbons fall off softly across their width; flares and embers keep a hot, nearly solid middle.
        const a=Math.round(255*(radial?Math.min(1,1.6*(1-d)**1.5):(1-d)**2)),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=a;
    }
    const texture=new THREE.DataTexture(data,size,size);texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
/** Soot: a dark ragged disc. */
function soot():THREE.DataTexture {
    const size=64,data=new Uint8Array(size*size*4);let seed=97;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        seed=(seed*1103515245+12345)&0x7fffffff;
        const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,angle=Math.atan2(v,u),edge=.62+.18*Math.sin(angle*5)+.1*Math.sin(angle*11+1);
        const d=Math.hypot(u,v)/edge,i=(y*size+x)*4;
        data[i]=data[i+1]=data[i+2]=8;data[i+3]=d>=1?0:Math.round(255*Math.min(1,(1-d)*3.5)*(.8+.2*seed/0x7fffffff));
    }
    const texture=new THREE.DataTexture(data,size,size);texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

interface Ribbon {mesh:THREE.Mesh;geometry:THREE.BufferGeometry;position:THREE.BufferAttribute;material:THREE.MeshBasicMaterial}
interface Beam {core:Ribbon;glow:Ribbon;path:Float32Array;count:number;legs:Float32Array;legCount:number;age:number;life:number;jitterAt:number;seed:number}
interface Flare {sprite:THREE.Sprite;age:number;life:number;size:number}
interface Scorch {soot:THREE.Mesh;ember:THREE.Mesh;age:number}

/** Laser beams (presentation only): a thick white-hot core and a soft additive glow zigzagging through the beam's
 * points, crackling and fading over `laserBeamMs`; a flare at every strike and a scorch (bounded pool) on walls.
 * Emissive geometry only, no lights. The shooter's own prediction draws at once; its authoritative copy is skipped. */
export class LaserBeamVisual {
    readonly root=new THREE.Group();
    private readonly beams:Beam[]=[];
    private readonly flares:Flare[]=[];
    private readonly scorches:Scorch[]=[];
    private nextBeam=0;private nextFlare=0;private nextScorch=0;
    private readonly ribbonTexture=falloff(false);
    private readonly flareTexture=falloff(true);
    private readonly sootTexture=soot();
    private readonly flareMaterial=new THREE.SpriteMaterial({map:this.flareTexture,color:GLOW,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false});
    private readonly decalGeometry=new THREE.PlaneGeometry(1,1);
    private readonly emberMaterial:THREE.MeshBasicMaterial;
    /** Beams already shown or skipped, by shot id; swapped each snapshot so only current ids are kept. */
    private seen=new Set<string>();private current=new Set<string>();
    private readonly predicted=new Set<string>();
    private primed=false;
    private readonly a=new THREE.Vector3();private readonly b=new THREE.Vector3();private readonly c=new THREE.Vector3();
    private readonly side=new THREE.Vector3();private readonly toEye=new THREE.Vector3();private readonly eye=new THREE.Vector3();
    private readonly normal=new THREE.Vector3();private readonly z=new THREE.Vector3(0,0,1);
    constructor(scene:THREE.Scene,private readonly sound?:LaserSound){
        this.root.name='laser-beams';scene.add(this.root);
        this.emberMaterial=new THREE.MeshBasicMaterial({map:this.flareTexture,color:GLOW,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2});
        const index:number[]=[];
        for(let i=0;i<MAX_PATH-1;i++){const k=i*2;index.push(k,k+1,k+2,k+1,k+3,k+2);}
        const ribbon=(color:number,order:number):Ribbon=>{
            const geometry=new THREE.BufferGeometry(),position=new THREE.BufferAttribute(new Float32Array(MAX_PATH*6),3);
            const uv=new Float32Array(MAX_PATH*4);for(let i=0;i<MAX_PATH;i++){uv[i*4]=uv[i*4+2]=.5;uv[i*4+1]=0;uv[i*4+3]=1;}
            position.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',position);geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(index);
            const material=new THREE.MeshBasicMaterial({map:this.ribbonTexture,color,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,side:THREE.DoubleSide,toneMapped:false});
            const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=order;mesh.raycast=()=>{};this.root.add(mesh);
            return {mesh,geometry,position,material};
        };
        for(let i=0;i<POOL;i++)this.beams.push({glow:ribbon(GLOW,2),core:ribbon(CORE,3),path:new Float32Array(MAX_PATH*3),count:0,legs:new Float32Array((MAX_LEGS+1)*3),legCount:0,age:0,life:0,jitterAt:0,seed:i});
        for(let i=0;i<FLARES;i++){
            const sprite=new THREE.Sprite(this.flareMaterial.clone());sprite.visible=false;sprite.renderOrder=4;sprite.raycast=()=>{};this.root.add(sprite);
            this.flares.push({sprite,age:0,life:0,size:0});
        }
        const count=Math.round(FEEL.laser.params.scorches);
        for(let i=0;i<count;i++){
            const sootMesh=new THREE.Mesh(this.decalGeometry,new THREE.MeshBasicMaterial({map:this.sootTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false}));
            const ember=new THREE.Mesh(this.decalGeometry,this.emberMaterial.clone());
            sootMesh.visible=ember.visible=false;sootMesh.raycast=ember.raycast=()=>{};sootMesh.renderOrder=1;ember.renderOrder=2;
            this.root.add(sootMesh,ember);this.scorches.push({soot:sootMesh,ember,age:Infinity});
        }
    }
    /** Your own beam, drawn on the press (`laserPath` against your city). */
    predict(id:string,points:LaserBeam['points']):void {
        this.predicted.add(id);if(this.predicted.size>32)this.predicted.delete(this.predicted.values().next().value!);
        this.start(points,true);
    }
    /** Authoritative beams from a snapshot: each new one (not your prediction) draws once, with its zap and crack.
     * A view's first snapshot only notes what is already in flight. */
    apply(beams:readonly LaserBeam[]|undefined):void {
        const swap=this.seen,first=!this.primed;this.seen=this.current;this.current=swap;this.current.clear();this.primed=true;
        for(const beam of beams??[]){
            this.current.add(beam.id);
            if(first||this.seen.has(beam.id)||this.predicted.has(beam.id))continue;
            this.start(beam.points,false);
        }
    }
    private start(points:LaserBeam['points'],local:boolean):void {
        if(points.length<2)return;
        const beam=this.beams[this.nextBeam]!;this.nextBeam=(this.nextBeam+1)%POOL;
        const legs=Math.min(points.length,MAX_LEGS+1);
        for(let i=0;i<legs;i++){const p=points[i]!;beam.legs[i*3]=p.x;beam.legs[i*3+1]=p.y;beam.legs[i*3+2]=p.z;}
        beam.legCount=legs;beam.count=(legs-1)*SEGMENTS+1;beam.age=0;beam.life=W.laserBeamMs/1000;beam.jitterAt=-1;beam.seed=(beam.seed*7+13)%9973;
        beam.core.mesh.visible=beam.glow.mesh.visible=true;
        this.sound?.('laser-fire',local?undefined:points[0]);
        const feel=feelState().on('laser');
        for(let i=1;i<legs;i++){
            const p=points[i]!;if(!p.on)continue;
            this.flare(p,points[i-1]!,i===legs-1?3.2:2.2);
            if(p.on==='world'&&feel)this.scorch(points,i);
        }
        const end=points[legs-1]!;if(end.on)this.sound?.('laser-hit',end);
    }
    /** A strike flare, pulled back along the arriving leg so the wall or body it hit does not hide it. */
    private flare(at:Vec3Data,from:Vec3Data,size:number):void {
        const flare=this.flares[this.nextFlare]!;this.nextFlare=(this.nextFlare+1)%FLARES;
        this.a.set(from.x-at.x,from.y-at.y,from.z-at.z);const length=this.a.length();
        this.a.multiplyScalar(length>1e-6?Math.min(.5,length/2)/length:0);
        flare.sprite.position.set(at.x+this.a.x,at.y+this.a.y,at.z+this.a.z);flare.sprite.visible=true;flare.age=0;flare.life=.28;flare.size=size;
    }
    /** A wall strike: the soot lies on the wall facing back along the beam (a reflection's normal halves the turn). */
    private scorch(points:LaserBeam['points'],i:number):void {
        if(!this.scorches.length)return;
        const p=points[i]!,before=points[i-1]!,after=points[i+1];
        this.a.set(p.x-before.x,p.y-before.y,p.z-before.z).normalize();
        if(after){this.b.set(after.x-p.x,after.y-p.y,after.z-p.z).normalize();this.normal.subVectors(this.b,this.a);}
        else this.normal.copy(this.a).negate();
        if(this.normal.lengthSq()<1e-6)this.normal.copy(this.a).negate();
        this.normal.normalize();
        const scorch=this.scorches[this.nextScorch]!;this.nextScorch=(this.nextScorch+1)%this.scorches.length;
        const size=FEEL.laser.params.scorchSize*(.85+((this.nextScorch*37)%10)/30);
        for(const mesh of [scorch.soot,scorch.ember]){
            mesh.position.set(p.x+this.normal.x*.02,p.y+this.normal.y*.02,p.z+this.normal.z*.02);
            mesh.quaternion.setFromUnitVectors(this.z,this.normal);mesh.rotateZ(this.nextScorch*2.39);mesh.visible=true;
        }
        scorch.soot.scale.setScalar(size);scorch.ember.scale.setScalar(size*.9);scorch.age=0;
    }
    update(dt:number,camera:THREE.Camera):void {
        camera.getWorldPosition(this.eye);
        const p=FEEL.laser.params;
        for(const beam of this.beams){
            if(!beam.core.mesh.visible)continue;
            beam.age+=dt;
            const t=beam.age/beam.life;
            if(t>=1){beam.core.mesh.visible=beam.glow.mesh.visible=false;continue;}
            // The zigzag crackles: new kinks every 40 ms, wider at birth.
            if(beam.age>=beam.jitterAt){beam.jitterAt=beam.age+.04;beam.seed=(beam.seed*16807)%2147483647;this.trace(beam,p.zigzag*(1.4-t));}
            const fade=(1-t)**1.6,flash=beam.age<.06?1.7:1;
            beam.core.material.opacity=Math.min(1,fade*1.4);beam.glow.material.opacity=fade*p.glow;
            this.ribbon(beam,beam.core,p.core*flash*(1-t*.5));this.ribbon(beam,beam.glow,p.width*flash);
        }
        for(const flare of this.flares){
            if(!flare.sprite.visible)continue;
            flare.age+=dt;const t=flare.age/flare.life;
            if(t>=1){flare.sprite.visible=false;continue;}
            flare.sprite.scale.setScalar(flare.size*(.6+t*.8));flare.sprite.material.opacity=(1-t)**2;
        }
        for(const scorch of this.scorches){
            if(!scorch.soot.visible)continue;
            scorch.age+=dt;
            if(scorch.age>=p.scorchLife){scorch.soot.visible=scorch.ember.visible=false;continue;}
            (scorch.soot.material as THREE.MeshBasicMaterial).opacity=Math.min(1,(p.scorchLife-scorch.age)/2)*.85;
            const glow=Math.max(0,1-scorch.age/2.5);scorch.ember.visible=glow>0;
            (scorch.ember.material as THREE.MeshBasicMaterial).opacity=glow*glow*(.8+.2*Math.sin(scorch.age*60));
        }
    }
    /** Lay the centreline: straight legs split into kinks pushed sideways (ends pinned). */
    private trace(beam:Beam,amplitude:number):void {
        let seed=beam.seed,n=0;
        for(let leg=0;leg<beam.legCount-1;leg++){
            const l=leg*3,ax=beam.legs[l]!,ay=beam.legs[l+1]!,az=beam.legs[l+2]!,bx=beam.legs[l+3]!,by=beam.legs[l+4]!,bz=beam.legs[l+5]!;
            this.a.set(bx-ax,by-ay,bz-az);const length=this.a.length();this.a.divideScalar(length||1);
            // Two fixed perpendiculars to the leg.
            this.b.set(Math.abs(this.a.y)<.9?0:1,Math.abs(this.a.y)<.9?1:0,0).cross(this.a).normalize();this.c.crossVectors(this.a,this.b);
            const kink=Math.min(amplitude,length*.06);
            for(let s=leg?1:0;s<=SEGMENTS;s++){
                const u=s/SEGMENTS,pin=s===0||s===SEGMENTS?0:1;
                seed=(seed*16807)%2147483647;const r1=seed/2147483647-.5;seed=(seed*16807)%2147483647;const r2=seed/2147483647-.5;
                const o=n*3;
                beam.path[o]=ax+(bx-ax)*u+(this.b.x*r1+this.c.x*r2)*kink*2*pin;
                beam.path[o+1]=ay+(by-ay)*u+(this.b.y*r1+this.c.y*r2)*kink*2*pin;
                beam.path[o+2]=az+(bz-az)*u+(this.b.z*r1+this.c.z*r2)*kink*2*pin;
                n++;
            }
        }
    }
    /** A camera-facing strip of `width` along the centreline. */
    private ribbon(beam:Beam,ribbon:Ribbon,width:number):void {
        const out=ribbon.position.array as Float32Array,path=beam.path,n=beam.count;
        for(let i=0;i<n;i++){
            const i0=Math.max(0,i-1)*3,i1=Math.min(n-1,i+1)*3,o=i*3;
            this.a.set(path[i1]!-path[i0]!,path[i1+1]!-path[i0+1]!,path[i1+2]!-path[i0+2]!);
            this.toEye.set(this.eye.x-path[o]!,this.eye.y-path[o+1]!,this.eye.z-path[o+2]!);
            this.side.crossVectors(this.a,this.toEye);
            const length=this.side.length();if(length>1e-6)this.side.multiplyScalar(width/2/length);
            out[i*6]=path[o]!+this.side.x;out[i*6+1]=path[o+1]!+this.side.y;out[i*6+2]=path[o+2]!+this.side.z;
            out[i*6+3]=path[o]!-this.side.x;out[i*6+4]=path[o+1]!-this.side.y;out[i*6+5]=path[o+2]!-this.side.z;
        }
        ribbon.position.needsUpdate=true;ribbon.geometry.setDrawRange(0,(n-1)*6);
    }
    /** Round reset or reconnect. */
    clear():void {
        for(const beam of this.beams)beam.core.mesh.visible=beam.glow.mesh.visible=false;
        for(const flare of this.flares)flare.sprite.visible=false;
        for(const scorch of this.scorches)scorch.soot.visible=scorch.ember.visible=false;
        this.seen.clear();this.current.clear();this.predicted.clear();this.primed=false;
    }
    dispose():void {
        this.root.removeFromParent();
        for(const beam of this.beams)for(const r of [beam.core,beam.glow]){r.geometry.dispose();r.material.dispose();}
        for(const flare of this.flares)flare.sprite.material.dispose();
        for(const scorch of this.scorches){(scorch.soot.material as THREE.Material).dispose();(scorch.ember.material as THREE.Material).dispose();}
        this.flareMaterial.dispose();this.emberMaterial.dispose();this.decalGeometry.dispose();
        this.ribbonTexture.dispose();this.flareTexture.dispose();this.sootTexture.dispose();
    }
}
