import * as THREE from 'three';
import type {LaserBeam} from '../shared/chaosState';
import type {Vec3Data} from '../shared/networkProtocol';
import {WEAPON_TUNING as W} from '../shared/pickups';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';

/** Molten cheese (Tyler: "greasy, cheesy yellow green"): a hot pale-yellow centre, a gooey yellow strand and a greasy
 * green sheen; strike flares (and a fresh splat's glow) yellow at the end, yellow-green at a bounce (the ray gun's
 * coil and dome match). */
const HOT=0xfff2a6,SHEEN=0x8cff2e,FLARE_END=0xffdf4a,FLARE_BOUNCE=0xdcff48;
/** Points per straight leg, and the most a beam can have (muzzle, two reflections, stop). */
const SEGMENTS=16,MAX_LEGS=W.laserBounces+1,MAX_PATH=MAX_LEGS*SEGMENTS+1;
/** Beams in flight at once: every rat's (`MAX_BEAMS`) plus your own predictions; strike flares; falling gobs. */
const POOL=20,FLARES=24,GOBS=120;
/** Gobs fall a little slower than a ball: melted cheese is heavy but sticky. */
const GRAVITY=8;
export type LaserSound=(cue:'laser-fire'|'laser-hit',at?:Vec3Data)=>void;

/** Byte texture helper: `paint` returns [r, g, b, a] (0…255, sRGB colour) for u, v in −1…1 (v up). */
function texture(width:number,height:number,srgb:boolean,paint:(u:number,v:number)=>readonly [number,number,number,number]):THREE.DataTexture {
    const data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const c=paint((x+.5)/width*2-1,(y+.5)/height*2-1),i=(y*width+x)*4;
        data[i]=Math.round(c[0]);data[i+1]=Math.round(c[1]);data[i+2]=Math.round(c[2]);data[i+3]=Math.round(Math.max(0,Math.min(255,c[3])));
    }
    const t=new THREE.DataTexture(data,width,height);t.magFilter=t.minFilter=THREE.LinearFilter;
    if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
}
const mix=(a:number,b:number,k:number)=>a+(b-a)*k;
const smooth=(e0:number,e1:number,x:number)=>{const k=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return k*k*(3-2*k);};
/** Amber (edge), cheese yellow (body), greasy olive green and a glossy near-white. */
const AMBER=[196,112,6],YELLOW=[255,206,46],GREASE=[150,196,24],GLOSS=[255,250,214];
function shade(body:number,grease:number,gloss:number,alpha:number):[number,number,number,number] {
    const c=[0,1,2].map(k=>mix(mix(mix(AMBER[k]!,YELLOW[k]!,body),GREASE[k]!,grease),GLOSS[k]!,gloss));
    return [c[0]!,c[1]!,c[2]!,alpha];
}

/** A soft white falloff for every additive ribbon and flare: across the width (v) or radial. */
const falloff=(radial:boolean)=>texture(64,64,false,(u,v)=>{
    const d=radial?Math.min(1,Math.hypot(u,v)):Math.abs(v);
    // Ribbons fall off softly across their width; flares and the splat's glow keep a hot, nearly solid middle.
    return [255,255,255,255*(radial?Math.min(1,1.6*(1-d)**1.5):(1-d)**2)];
});
/** The strand's cross-section: a rounded yellow body darkening to amber at the edge, a greasy green line just inside
 * the edge and a glossy streak off centre. Camera-facing, so v runs across the strand. */
const strand=()=>texture(4,64,true,(_u,v)=>{
    const d=Math.abs(v);
    return shade(Math.sqrt(Math.max(0,1-d*d)),.6*Math.exp(-(((d-.8)/.1)**2)),.8*Math.exp(-(((v-.36)/.12)**2)),255*(1-smooth(.78,1,d)));
});
/** A matcap for the gobs (lit by no light): a yellow ball, darker below, a wet highlight and a green greasy rim. */
const matcap=()=>texture(64,64,true,(u,v)=>{
    const r=Math.min(1,Math.hypot(u,v)),nz=Math.sqrt(Math.max(0,1-r*r));
    return shade(Math.min(1,.25+.6*nz+.3*v),.75*smooth(.72,1,r),.95*Math.exp(-((u+.32)**2+(v-.42)**2)/.03),255);
});
/** The splat on a wall: a ragged molten blob with pores and a few flung gobs. */
function splat():THREE.DataTexture {
    let seed=97;const noise=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    const pores=Array.from({length:9},()=>{const a=noise()*6.283,r=noise()*.38;return {x:Math.cos(a)*r,y:Math.sin(a)*r,s:.035+noise()*.04};});
    const flung=Array.from({length:7},(_,i)=>{const a=i*.9+noise()*.5,r=.8+noise()*.14;return {x:Math.cos(a)*r,y:Math.sin(a)*r,s:.04+noise()*.05};});
    return texture(128,128,true,(u,v)=>{
        const angle=Math.atan2(v,u),edge=.68+.08*Math.sin(angle*5+1)+.05*Math.sin(angle*9+2.3)+.03*Math.sin(angle*14);
        const d=Math.hypot(u,v)/edge;
        let alpha=d<1?Math.min(1,(1-d)*10):0,body=Math.sqrt(Math.max(0,1-d));
        for(const g of flung){const k=Math.hypot(u-g.x,v-g.y)/g.s;if(k<1){alpha=Math.max(alpha,Math.min(1,(1-k)*5));body=Math.max(body,(1-k)*.8);}}
        if(alpha<=0)return [0,0,0,0];
        let pore=0;for(const p of pores){const k=Math.hypot(u-p.x,v-p.y)/p.s;if(k<1)pore=Math.max(pore,1-k*k);}
        return shade(body*(1-.75*pore),d<1?.45*smooth(.7,1,d):0,.6*Math.exp(-((u+.18)**2+(v-.22)**2)/.025)*(1-pore),255*alpha*(1-.25*pore));
    });
}
/** Runs under a wall splat: four drips from the top edge, each ending in a bulb (scaled down the wall as they slide). */
function runs():THREE.DataTexture {
    const drips=[{x:-.55,w:.11,len:.55},{x:-.12,w:.15,len:.92},{x:.24,w:.09,len:.38},{x:.58,w:.12,len:.72}];
    return texture(64,128,true,(u,v)=>{
        const down=(1-v)/2;let alpha=down<.08&&Math.abs(u)<.78?1:0,body=alpha?.7:0;
        for(const d of drips){
            const hw=d.w*(1-.3*Math.min(1,down/d.len)),k=Math.abs(u-d.x)/hw;
            if(down<d.len&&k<1){alpha=Math.max(alpha,Math.min(1,(1-k)*4));body=Math.max(body,Math.sqrt(1-k*k));}
            const b=Math.hypot((u-d.x)/(d.w*1.35),(down-d.len)/(d.w*.7));
            if(b<1){alpha=Math.max(alpha,Math.min(1,(1-b)*4));body=Math.max(body,Math.sqrt(1-b*b));}
        }
        return alpha?shade(body,.35*(1-body),.5*Math.exp(-(((u+.04)/.05)**2))*body,255*alpha):[0,0,0,0];
    });
}

interface Ribbon {mesh:THREE.Mesh;geometry:THREE.BufferGeometry;position:THREE.BufferAttribute;material:THREE.MeshBasicMaterial}
interface Beam {sheen:Ribbon;strand:Ribbon;hot:Ribbon;path:Float32Array;count:number;legs:Float32Array;legCount:number;age:number;life:number;seed:number;gobs:number;shedAt:number}
interface Flare {sprite:THREE.Sprite;age:number;life:number;size:number}
interface Splat {blob:THREE.Mesh;runs:THREE.Mesh;glow:THREE.Mesh;age:number;size:number;drips:boolean}
interface Gob {position:THREE.Vector3;velocity:THREE.Vector3;age:number;life:number;hang:number;size:number}

/** Laser beams (presentation only): a strand of molten cheese through the beam's points, a thin hot centre and a greasy
 * green sheen, wobbling like goo and sagging, necking and cooling as it fades over `laserBeamMs`; gobs drip off it and
 * fall (bounded pool); a flare at every strike and a cheese splat (bounded pool) whose drips slide down walls.
 * Emissive geometry only, no lights. The shooter's own prediction draws at once; its authoritative copy is skipped. */
export class LaserBeamVisual {
    readonly root=new THREE.Group();
    private readonly beams:Beam[]=[];
    private readonly flares:Flare[]=[];
    private readonly splats:Splat[]=[];
    private readonly gobs:Gob[]=[];
    private nextBeam=0;private nextFlare=0;private nextSplat=0;private nextGob=0;
    private readonly ribbonTexture=falloff(false);
    private readonly flareTexture=falloff(true);
    private readonly strandTexture=strand();
    private readonly splatTexture=splat();
    private readonly runsTexture=runs();
    private readonly matcapTexture=matcap();
    private readonly flareMaterial=new THREE.SpriteMaterial({map:this.flareTexture,color:FLARE_END,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false});
    private readonly decalGeometry=new THREE.PlaneGeometry(1,1);
    /** Runs hang from the splat's centre: the plane's top edge at the origin. */
    private readonly runsGeometry=new THREE.PlaneGeometry(1,1).translate(0,-.5,0);
    private readonly gobGeometry=new THREE.IcosahedronGeometry(1,2);
    private readonly gobMaterial=new THREE.MeshMatcapMaterial({matcap:this.matcapTexture,toneMapped:false});
    private readonly gobMesh:THREE.InstancedMesh;
    /** Beams already shown or skipped, by shot id; swapped each snapshot so only current ids are kept. */
    private seen=new Set<string>();private current=new Set<string>();
    private readonly predicted=new Set<string>();
    private primed=false;
    private readonly a=new THREE.Vector3();private readonly b=new THREE.Vector3();private readonly c=new THREE.Vector3();
    private readonly side=new THREE.Vector3();private readonly toEye=new THREE.Vector3();private readonly eye=new THREE.Vector3();
    private readonly normal=new THREE.Vector3();
    private readonly basis=new THREE.Matrix4();private readonly matrix=new THREE.Matrix4();
    private readonly turn=new THREE.Quaternion();private readonly still=new THREE.Quaternion();private readonly scale=new THREE.Vector3();
    constructor(scene:THREE.Scene,private readonly sound?:LaserSound){
        this.root.name='laser-beams';scene.add(this.root);
        const index:number[]=[];
        for(let i=0;i<MAX_PATH-1;i++){const k=i*2;index.push(k,k+1,k+2,k+1,k+3,k+2);}
        const ribbon=(map:THREE.Texture,color:number,additive:boolean,order:number):Ribbon=>{
            const geometry=new THREE.BufferGeometry(),position=new THREE.BufferAttribute(new Float32Array(MAX_PATH*6),3);
            const uv=new Float32Array(MAX_PATH*4);for(let i=0;i<MAX_PATH;i++){uv[i*4]=uv[i*4+2]=.5;uv[i*4+1]=0;uv[i*4+3]=1;}
            position.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',position);geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(index);
            const material=new THREE.MeshBasicMaterial({map,color,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false,transparent:true,side:THREE.DoubleSide,toneMapped:false});
            const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=order;mesh.raycast=()=>{};this.root.add(mesh);
            return {mesh,geometry,position,material};
        };
        for(let i=0;i<POOL;i++)this.beams.push({sheen:ribbon(this.ribbonTexture,SHEEN,true,2),strand:ribbon(this.strandTexture,0xffffff,false,3),hot:ribbon(this.ribbonTexture,HOT,true,4),
            path:new Float32Array(MAX_PATH*3),count:0,legs:new Float32Array((MAX_LEGS+1)*3),legCount:0,age:0,life:0,seed:i,gobs:0,shedAt:0});
        for(let i=0;i<FLARES;i++){
            const sprite=new THREE.Sprite(this.flareMaterial.clone());sprite.visible=false;sprite.renderOrder=5;sprite.raycast=()=>{};this.root.add(sprite);
            this.flares.push({sprite,age:0,life:0,size:0});
        }
        const count=Math.round(FEEL.laser.params.splats);
        const decal=(geometry:THREE.BufferGeometry,map:THREE.Texture,order:number,additive=false)=>{
            const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map,color:additive?FLARE_BOUNCE:0xffffff,transparent:true,depthWrite:false,toneMapped:false,
                blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,polygonOffset:true,polygonOffsetFactor:-order,polygonOffsetUnits:-order}));
            mesh.visible=false;mesh.raycast=()=>{};mesh.renderOrder=order;this.root.add(mesh);return mesh;
        };
        for(let i=0;i<count;i++)this.splats.push({runs:decal(this.runsGeometry,this.runsTexture,1),blob:decal(this.decalGeometry,this.splatTexture,2),glow:decal(this.decalGeometry,this.flareTexture,3,true),age:Infinity,size:0,drips:false});
        this.gobMesh=new THREE.InstancedMesh(this.gobGeometry,this.gobMaterial,GOBS);
        this.gobMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.gobMesh.count=0;this.gobMesh.visible=false;this.gobMesh.frustumCulled=false;this.gobMesh.raycast=()=>{};
        this.root.add(this.gobMesh);
        for(let i=0;i<GOBS;i++)this.gobs.push({position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:Infinity,life:0,hang:0,size:0});
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
        const feel=feelState().on('laser');
        beam.legCount=legs;beam.count=(legs-1)*SEGMENTS+1;beam.age=0;beam.life=W.laserBeamMs/1000;beam.seed=(beam.seed*7+13)%9973;
        beam.gobs=feel?Math.round(FEEL.laser.params.gobs):0;beam.shedAt=.03;
        beam.sheen.mesh.visible=beam.strand.mesh.visible=beam.hot.mesh.visible=true;
        this.sound?.('laser-fire',local?undefined:points[0]);
        for(let i=1;i<legs;i++){
            const p=points[i]!;if(!p.on)continue;
            this.flare(p,points[i-1]!,i===legs-1);
            if(p.on==='world'&&feel)this.splat(points,i);
        }
        const end=points[legs-1]!;if(end.on)this.sound?.('laser-hit',end);
    }
    /** A strike flare, pulled back along the arriving leg so the wall or body it hit does not hide it. */
    private flare(at:Vec3Data,from:Vec3Data,end:boolean):void {
        const flare=this.flares[this.nextFlare]!;this.nextFlare=(this.nextFlare+1)%FLARES;
        this.a.set(from.x-at.x,from.y-at.y,from.z-at.z);const length=this.a.length();
        this.a.multiplyScalar(length>1e-6?Math.min(.5,length/2)/length:0);
        flare.sprite.position.set(at.x+this.a.x,at.y+this.a.y,at.z+this.a.z);flare.sprite.visible=true;flare.age=0;flare.life=.3;flare.size=end?3:2.1;
        flare.sprite.material.color.setHex(end?FLARE_END:FLARE_BOUNCE);
    }
    /** A wall strike: the splat lies on the wall facing back along the beam (a reflection's normal halves the turn), its
     * runs pointing down the wall, and a few gobs fly off it. */
    private splat(points:LaserBeam['points'],i:number):void {
        if(!this.splats.length)return;
        const p=points[i]!,before=points[i-1]!,after=points[i+1],tune=FEEL.laser.params;
        this.a.set(p.x-before.x,p.y-before.y,p.z-before.z).normalize();
        if(after){this.b.set(after.x-p.x,after.y-p.y,after.z-p.z).normalize();this.normal.subVectors(this.b,this.a);}
        else this.normal.copy(this.a).negate();
        if(this.normal.lengthSq()<1e-6)this.normal.copy(this.a).negate();
        this.normal.normalize();
        // The decal's up is world up laid on the wall (on a floor or ceiling, any direction across it).
        const n=this.normal,wall=Math.abs(n.y)<.6;
        this.b.set(0,1,0).addScaledVector(n,-n.y);
        if(this.b.lengthSq()<.04)this.b.set(1,0,0).addScaledVector(n,-n.x);
        this.b.normalize();this.c.crossVectors(this.b,n);
        this.turn.setFromRotationMatrix(this.basis.makeBasis(this.c,this.b,n));
        const splat=this.splats[this.nextSplat]!;this.nextSplat=(this.nextSplat+1)%this.splats.length;
        splat.size=tune.splatSize*(.85+((this.nextSplat*37)%10)/30);splat.age=0;splat.drips=wall;
        for(const mesh of [splat.blob,splat.runs,splat.glow]){
            mesh.position.set(p.x+n.x*.02,p.y+n.y*.02,p.z+n.z*.02);mesh.quaternion.copy(this.turn);mesh.visible=true;
        }
        splat.blob.rotateZ(this.nextSplat*2.39);splat.blob.scale.setScalar(splat.size);splat.glow.scale.setScalar(splat.size*1.3);
        splat.runs.visible=wall;splat.runs.scale.set(splat.size*.8,.01,1);
        for(let k=0;k<4;k++){
            const angle=k*1.57+Math.random()*.9,speed=1.4+Math.random()*1.6;
            this.gob(p.x+n.x*.06,p.y+n.y*.06,p.z+n.z*.06,0,.55+Math.random()*.25,tune.gobSize*(1+Math.random()*.6));
            const g=this.gobs[(this.nextGob+GOBS-1)%GOBS]!;
            g.velocity.copy(n).multiplyScalar(speed).addScaledVector(this.c,Math.cos(angle)*1.3).addScaledVector(this.b,Math.sin(angle)*1.1+.8);
        }
    }
    /** Start a gob at rest: it hangs (swelling) for `hang` s, then falls and shrinks. */
    private gob(x:number,y:number,z:number,hang:number,life:number,size:number):void {
        const g=this.gobs[this.nextGob]!;this.nextGob=(this.nextGob+1)%GOBS;
        g.position.set(x,y,z);g.velocity.set(0,0,0);g.age=0;g.hang=hang;g.life=hang+life;g.size=size;
    }
    update(dt:number,camera:THREE.Camera):void {
        camera.getWorldPosition(this.eye);
        const p=FEEL.laser.params;
        for(const beam of this.beams){
            if(!beam.strand.mesh.visible)continue;
            beam.age+=dt;
            const t=beam.age/beam.life;
            if(t>=1){beam.sheen.mesh.visible=beam.strand.mesh.visible=beam.hot.mesh.visible=false;continue;}
            this.trace(beam,t,p.wobble,p.sag);
            // Gobs drip off the strand through most of its life.
            while(beam.gobs>0&&beam.age>=beam.shedAt){beam.gobs--;beam.shedAt+=beam.life*.7/Math.max(1,p.gobs);this.shed(beam,p.gobSize);}
            const flash=beam.age<.06?1.5:1;
            // The hot centre goes first; the greasy sheen lingers; the strand stays thick and opaque until it sags and breaks.
            beam.hot.material.opacity=Math.min(1,(1-t)**2*1.3);beam.sheen.material.opacity=(1-t)*p.glow;
            beam.strand.material.opacity=t<.72?1:1-(t-.72)/.28;
            beam.strand.material.color.setRGB(1,1-.14*t,1-.4*t);
            this.ribbon(beam,beam.sheen,p.sheen*flash,.15,t*.3,t);
            this.ribbon(beam,beam.strand,p.strand*flash,.28,.65*t**1.2,t);
            this.ribbon(beam,beam.hot,p.core*flash*(1-.5*t),.2,.8*t,t);
        }
        for(const flare of this.flares){
            if(!flare.sprite.visible)continue;
            flare.age+=dt;const t=flare.age/flare.life;
            if(t>=1){flare.sprite.visible=false;continue;}
            flare.sprite.scale.setScalar(flare.size*(.6+t*.8));flare.sprite.material.opacity=(1-t)**2;
        }
        for(const splat of this.splats){
            if(!splat.blob.visible)continue;
            splat.age+=dt;
            if(splat.age>=p.splatLife){splat.blob.visible=splat.runs.visible=splat.glow.visible=false;continue;}
            // Fresh cheese glows hot, then cools to a settled yellow; the runs slide down over the first two seconds.
            const fade=Math.min(1,(p.splatLife-splat.age)/2),hot=Math.max(0,1-splat.age/1.6);
            const blob=splat.blob.material as THREE.MeshBasicMaterial,runs=splat.runs.material as THREE.MeshBasicMaterial;
            blob.opacity=runs.opacity=fade*.95;blob.color.setScalar(.82+.5*hot);runs.color.setScalar(.78+.45*hot);
            if(splat.drips)splat.runs.scale.y=splat.size*(.1+.85*(1-(1-Math.min(1,splat.age/2.2))**2));
            const glow=Math.max(0,1-splat.age/1.2);splat.glow.visible=glow>0;
            (splat.glow.material as THREE.MeshBasicMaterial).opacity=glow*glow*(.5+.15*Math.sin(splat.age*40));
        }
        this.updateGobs(dt);
    }
    /** A gob swelling on the strand at a random point between its ends. */
    private shed(beam:Beam,size:number):void {
        const i=1+Math.floor(Math.random()*(beam.count-2)),o=i*3;
        this.gob(beam.path[o]!,beam.path[o+1]!,beam.path[o+2]!,.06+Math.random()*.1,.5+Math.random()*.45,size*(.55+Math.random()*.8));
        const g=this.gobs[(this.nextGob+GOBS-1)%GOBS]!;g.velocity.set((Math.random()-.5)*.5,-Math.random()*.3,(Math.random()-.5)*.5);
    }
    private updateGobs(dt:number):void {
        let count=0;
        for(let k=0;k<GOBS;k++){
            const g=this.gobs[(this.nextGob+k)%GOBS]!;
            if(g.age>=g.life)continue;
            g.age+=dt;if(g.age>=g.life)continue;
            let size=g.size,stretch=1;
            if(g.age<g.hang){const u=g.age/g.hang;size*=.35+.65*u;stretch=1+.5*u;}
            else{
                g.velocity.y-=GRAVITY*dt;g.position.addScaledVector(g.velocity,dt);
                const u=(g.age-g.hang)/(g.life-g.hang);size*=(1-u)**.6;stretch=1+Math.min(1.3,Math.hypot(g.velocity.x,g.velocity.y,g.velocity.z)*.16);
            }
            // A teardrop: long along y as it falls, hanging below where it started while it swells.
            this.scale.set(size/Math.sqrt(stretch),size*stretch,size/Math.sqrt(stretch));
            this.a.copy(g.position);if(g.age<g.hang)this.a.y-=size*stretch*.6;
            this.gobMesh.setMatrixAt(count++,this.matrix.compose(this.a,this.still,this.scale));
        }
        this.gobMesh.count=count;this.gobMesh.visible=count>0;
        if(count)this.gobMesh.instanceMatrix.needsUpdate=true;
    }
    /** Lay the centreline: each leg wobbles like goo in a slow travelling wave and sags under its weight, its ends stuck
     * where they hit (muzzle, walls, stop). */
    private trace(beam:Beam,t:number,wobble:number,sag:number):void {
        let n=0;const seed=beam.seed*.37,age=beam.age;
        for(let leg=0;leg<beam.legCount-1;leg++){
            const l=leg*3,ax=beam.legs[l]!,ay=beam.legs[l+1]!,az=beam.legs[l+2]!,bx=beam.legs[l+3]!,by=beam.legs[l+4]!,bz=beam.legs[l+5]!;
            this.a.set(bx-ax,by-ay,bz-az);const length=this.a.length();this.a.divideScalar(length||1);
            // Two fixed perpendiculars to the leg.
            this.b.set(Math.abs(this.a.y)<.9?0:1,Math.abs(this.a.y)<.9?1:0,0).cross(this.a).normalize();this.c.crossVectors(this.a,this.b);
            const wave=wobble*(1-.35*t)*Math.min(1,length/3)*Math.min(1,age/.04+.3),droop=sag*Math.min(1,length/10)*t**1.4;
            for(let s=leg?1:0;s<=SEGMENTS;s++){
                const u=s/SEGMENTS,env=Math.sin(Math.PI*u),phase=u*length*.8-age*9+seed+leg*1.7;
                const w1=Math.sin(phase)*env*wave,w2=Math.sin(phase*.6+1.3-age*4)*env*wave*.6,o=n*3;
                beam.path[o]=ax+(bx-ax)*u+this.b.x*w1+this.c.x*w2;
                beam.path[o+1]=ay+(by-ay)*u+this.b.y*w1+this.c.y*w2-droop*env;
                beam.path[o+2]=az+(bz-az)*u+this.b.z*w1+this.c.z*w2;
                n++;
            }
        }
    }
    /** A camera-facing strip of `width` along the centreline: lumpy (`lump`, a share of the width rolling along it) and
     * necking thin mid-leg as it stretches (`neck`, a share). */
    private ribbon(beam:Beam,ribbon:Ribbon,width:number,lump:number,neck:number,t:number):void {
        const out=ribbon.position.array as Float32Array,path=beam.path,n=beam.count,roll=beam.age*5+beam.seed;
        for(let i=0;i<n;i++){
            const i0=Math.max(0,i-1)*3,i1=Math.min(n-1,i+1)*3,o=i*3;
            this.a.set(path[i1]!-path[i0]!,path[i1+1]!-path[i0+1]!,path[i1+2]!-path[i0+2]!);
            this.toEye.set(this.eye.x-path[o]!,this.eye.y-path[o+1]!,this.eye.z-path[o+2]!);
            this.side.crossVectors(this.a,this.toEye);
            const env=Math.sin(Math.PI*(i%SEGMENTS)/SEGMENTS);
            const w=width*(1+lump*Math.sin(i*1.9+roll)*(.6+.4*t))*(1-neck*env);
            const length=this.side.length();if(length>1e-6)this.side.multiplyScalar(w/2/length);
            out[i*6]=path[o]!+this.side.x;out[i*6+1]=path[o+1]!+this.side.y;out[i*6+2]=path[o+2]!+this.side.z;
            out[i*6+3]=path[o]!-this.side.x;out[i*6+4]=path[o+1]!-this.side.y;out[i*6+5]=path[o+2]!-this.side.z;
        }
        ribbon.position.needsUpdate=true;ribbon.geometry.setDrawRange(0,(n-1)*6);
    }
    /** Round reset or reconnect. */
    clear():void {
        for(const beam of this.beams)beam.sheen.mesh.visible=beam.strand.mesh.visible=beam.hot.mesh.visible=false;
        for(const flare of this.flares)flare.sprite.visible=false;
        for(const splat of this.splats)splat.blob.visible=splat.runs.visible=splat.glow.visible=false;
        for(const g of this.gobs)g.age=Infinity;
        this.gobMesh.count=0;this.gobMesh.visible=false;
        this.seen.clear();this.current.clear();this.predicted.clear();this.primed=false;
    }
    dispose():void {
        this.root.removeFromParent();
        for(const beam of this.beams)for(const r of [beam.sheen,beam.strand,beam.hot]){r.geometry.dispose();r.material.dispose();}
        for(const flare of this.flares)flare.sprite.material.dispose();
        for(const splat of this.splats)for(const mesh of [splat.blob,splat.runs,splat.glow])(mesh.material as THREE.Material).dispose();
        this.gobMesh.dispose();this.gobGeometry.dispose();this.gobMaterial.dispose();
        this.flareMaterial.dispose();this.decalGeometry.dispose();this.runsGeometry.dispose();
        for(const map of [this.ribbonTexture,this.flareTexture,this.strandTexture,this.splatTexture,this.runsTexture,this.matcapTexture])map.dispose();
    }
}
