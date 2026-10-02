import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {reducedMotion} from '../ui/motion';

/** Crossfire's fire (Tyler, 2 October: "flaming balls of cheese that really speed up off walls"). Every frame a bounced
 * ball leaves `flames` (+ `hotFlames` at full heat) soft flame tongues along the way it came, stretched along its flight
 * and overlapping, each burning out once the ball is `reach` (+ `reachStep` a heat step) units on (at least `minLife`,
 * at most `flameLife` s), so the fire runs yellow-white at the ball through orange to deep red at the tail; about
 * `embers` embers a frame (living `emberLife` s, cooling as they fall) and now and then a grey wisp of smoke
 * (`smokeChance`, `smokeLife` s). At most `budget` flames a frame across every ball, so a busy volley stays readable. At
 * full heat the white-hot core burns inside a flickering fireball `fireball`× the ball. A bounce splashes `splash`
 * flames and `splashEmbers` embers off the wall at up to `splashSpeed` u/s over a soft orange flash up to `flash` units
 * across for `flashMs`. Fixed additive pools (smoke a soft normal blend), no lights, nothing allocated per frame. */
export const CROSSFIRE_FLAMES={flames:6,hotFlames:2,reach:3,reachStep:2.5,minLife:.03,flameLife:.18,flameSize:.2,budget:60,embers:1.2,emberLife:.7,
    smokeChance:.35,smokeLife:1.1,fireball:2.4,splash:12,splashEmbers:8,splashSpeed:8,flash:.9,flashMs:90,
    streakMin:1.4,streakMax:12,streakPerSpeed:.016,edge:.09,edgeStep:.03} as const;
const F=CROSSFIRE_FLAMES,FLAMES=512,EMBERS=192,SMOKES=64,FLASHES=8,GLOWS=128,CORES=64,BALL=.15;
/** A hot ball's streak in units at `speed` u/s: `streakPerSpeed` a unit of speed, from `streakMin` (a fresh ricochet)
 * to `streakMax` (a tracer round at full heat). Its fire-orange edge is `edge` (+ `edgeStep` a heat step) units thick. */
export const heatStreak=(speed:number)=>Math.min(F.streakMax,Math.max(F.streakMin,speed*F.streakPerSpeed));

/** A normal-blended material whose instance colour's red channel is each instance's opacity (its colour stays the
 * material's): soft smoke and soot that fade one by one. */
export function fadeByInstanceColor(material:THREE.MeshBasicMaterial,key:string):THREE.MeshBasicMaterial {
    material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.a *= vColor.r; diffuseColor.rgb = diffuse;');
    };
    material.customProgramCacheKey=()=>key;
    return material;
}

/** A white sprite whose alpha is `shape(x, y)` (each −1 to 1) broken up by soft value noise. */
function spriteTexture(width:number,height:number,shape:(x:number,y:number)=>number):THREE.DataTexture {
    const data=new Uint8Array(width*height*4),grid=9,cells=new Float32Array(grid*grid);
    let seed=11;for(let i=0;i<cells.length;i++){seed=(seed*1103515245+12345)&0x7fffffff;cells[i]=seed/0x7fffffff;}
    for(let j=0;j<height;j++)for(let i=0;i<width;i++){
        const gx=i/(width-1)*(grid-1),gy=j/(height-1)*(grid-1),x0=Math.min(grid-2,Math.floor(gx)),y0=Math.min(grid-2,Math.floor(gy)),fx=gx-x0,fy=gy-y0;
        const top=cells[y0*grid+x0]!*(1-fx)+cells[y0*grid+x0+1]!*fx,bottom=cells[(y0+1)*grid+x0]!*(1-fx)+cells[(y0+1)*grid+x0+1]!*fx;
        const alpha=shape(i/(width-1)*2-1,j/(height-1)*2-1)*(.55+.45*(top*(1-fy)+bottom*fy)),k=(j*width+i)*4;
        data[k]=data[k+1]=data[k+2]=255;data[k+3]=Math.round(255*Math.max(0,Math.min(1,alpha)));
    }
    const texture=new THREE.DataTexture(data,width,height);
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    return texture;
}

interface Particle {p:THREE.Vector3;v:THREE.Vector3;d:THREE.Vector3;age:number;life:number;size:number;stretch:number;bright:number;hot:boolean;follow:boolean;live:boolean}
const particles=(count:number):Particle[]=>Array.from({length:count},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),d:new THREE.Vector3(1,0,0),age:0,life:1,size:1,stretch:1,bright:1,hot:false,follow:false,live:false}));

export class CrossfireFlames {
    private readonly root=new THREE.Group();
    /** Teardrop flame tongues, head forward along +x. */
    private readonly flameTexture=spriteTexture(64,32,(x,y)=>{
        const dx=x-.4,rx=dx>0?.6:1.4,ry=.9-.45*Math.min(1,Math.max(0,-dx/1.4)),d=Math.hypot(dx/rx,y/ry);
        return Math.max(0,1-d)**1.6;
    });
    /** Soft round puffs: smoke, flashes. */
    private readonly puffTexture=spriteTexture(32,32,(x,y)=>Math.max(0,1-Math.hypot(x,y))**2);
    private readonly flames:THREE.InstancedMesh;
    /** This frame's fireballs at full heat (flame tongues, not aged). */
    private readonly cores:THREE.InstancedMesh;
    private readonly embers:THREE.InstancedMesh;
    private readonly smoke:THREE.InstancedMesh;
    /** This frame's streak edges. */
    private readonly glows:THREE.InstancedMesh;
    private readonly flashes:THREE.InstancedMesh;
    private readonly flameSlots=particles(FLAMES);
    private readonly emberSlots=particles(EMBERS);
    private readonly smokeSlots=particles(SMOKES);
    private readonly flashSlots=particles(FLASHES);
    private flameCursor=0;
    private emberCursor=0;
    private smokeCursor=0;
    private flashCursor=0;
    private spent=0;
    private still=false;
    private readonly camera=new THREE.Vector3();
    private readonly facing=new THREE.Quaternion();
    private readonly basis=new THREE.Matrix4();
    private readonly dummy=new THREE.Object3D();
    private readonly zero=new THREE.Matrix4().makeScale(0,0,0);
    private readonly axis=new THREE.Vector3(0,0,1);
    private readonly dir=new THREE.Vector3();
    private readonly side=new THREE.Vector3();
    private readonly up=new THREE.Vector3();
    private readonly lift=new THREE.Vector3();
    private readonly toward=new THREE.Vector3();
    private readonly color=new THREE.Color();
    // Fire colours (linear, additive, modest so overlap builds the heat rather than one tongue clipping to white):
    // yellow-white at the ball (whiter at full heat), orange, deep red at the tail.
    private readonly whiteHot=new THREE.Color(.95,.85,.62);
    private readonly yellow=new THREE.Color(.95,.66,.26);
    private readonly orange=new THREE.Color(.8,.27,.04);
    private readonly red=new THREE.Color(.28,.02,0);
    private readonly emberColor=new THREE.Color(2,.75,.18);
    private readonly fire=new THREE.Color(1.15,.42,.07);
    private readonly flashColor=new THREE.Color(1,.52,.14);
    constructor(scene:THREE.Scene){
        const additive=(map?:THREE.Texture)=>new THREE.MeshBasicMaterial({map:map??null,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
        const plane=new THREE.PlaneGeometry(1,1),flame=additive(this.flameTexture),puff=additive(this.puffTexture);
        this.flames=new THREE.InstancedMesh(plane,flame,FLAMES);
        this.cores=new THREE.InstancedMesh(plane,flame,CORES);
        this.embers=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.03,0),additive(),EMBERS);
        this.smoke=new THREE.InstancedMesh(plane,fadeByInstanceColor(new THREE.MeshBasicMaterial({color:0x5f5a56,map:this.puffTexture,transparent:true,depthWrite:false,side:THREE.DoubleSide}),'crossfire-smoke-fade'),SMOKES);
        this.glows=new THREE.InstancedMesh(new THREE.SphereGeometry(1,14,10),additive(),GLOWS);
        puff.polygonOffset=true;puff.polygonOffsetFactor=-3;puff.polygonOffsetUnits=-3;
        this.flashes=new THREE.InstancedMesh(plane,puff,FLASHES);
        const names=['crossfire-flames','crossfire-fireballs','crossfire-embers','crossfire-smoke','crossfire-fire-glows','crossfire-flashes'];
        [this.flames,this.cores,this.embers,this.smoke,this.glows,this.flashes].forEach((mesh,i)=>{
            mesh.name=names[i]!;mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.setColorAt(0,this.color.setRGB(0,0,0));this.root.add(mesh);
        });
        this.root.name='crossfire-fire';scene.add(this.root);
    }

    /** One bounced ball this frame at `p` flying at `v`, `level` heat steps past red (0 to 2), over the last `dt` s: its
     * flames, embers and smoke, at full heat its fireball, and the fire-orange edge of its `streak` units of trail (none
     * at 0). `bright` scales it (your own softer; a ball that is no threat to you dimmed). */
    ball(p:Vec3Data,v:Vec3Data,level:number,bright:number,dt:number,streak:number):void {
        const speed=Math.hypot(v.x,v.y,v.z);if(speed<.01)return;
        this.dir.set(v.x/speed,v.y/speed,v.z/speed);
        const travel=speed*Math.min(dt,.05),full=level>=2,frames=Math.min(2,dt*60);
        const life=Math.max(F.minLife,Math.min(F.flameLife,(F.reach+F.reachStep*level)/speed));
        const count=Math.min(F.flames+(full?F.hotFlames:0),F.budget-this.spent),spacing=travel/Math.max(1,count);
        for(let i=0;i<count;i++,this.spent++){
            // Spread over the frame's path; the farther back, the older (more orange) it starts.
            const index=this.flameCursor++%FLAMES,slot=this.flameSlots[index]!,back=spacing*(i+Math.random());
            slot.p.set(p.x-this.dir.x*back+(Math.random()-.5)*.06,p.y-this.dir.y*back+(Math.random()-.5)*.06,p.z-this.dir.z*back+(Math.random()-.5)*.06);
            slot.v.set((Math.random()-.5)*1.2,1.2+Math.random(),(Math.random()-.5)*1.2);slot.d.copy(this.dir);slot.follow=false;
            slot.life=life*(.7+.3*Math.random());slot.age=travel>0?slot.life*.5*back/travel:0;
            slot.size=F.flameSize*(1+.3*level)*(.8+.4*Math.random());slot.stretch=Math.max(1.8,(spacing*1.8+slot.size)/slot.size);
            slot.bright=bright;slot.hot=full;
            this.place(this.flames,index,slot,1-slot.age/slot.life);this.flames.count=Math.max(this.flames.count,index+1);this.flames.visible=true;
        }
        for(let n=Math.floor(F.embers*frames+Math.random());n>0;n--)this.ember(p,travel*Math.random(),speed,bright);
        if(Math.random()<F.smokeChance*frames){
            const index=this.smokeCursor++%SMOKES,slot=this.smokeSlots[index]!;
            slot.p.set(p.x-this.dir.x*travel,p.y-this.dir.y*travel,p.z-this.dir.z*travel);
            slot.v.set((Math.random()-.5)*.6,.9+Math.random()*.5,(Math.random()-.5)*.6);
            slot.age=0;slot.life=F.smokeLife*(.7+.3*Math.random());slot.size=.22+.08*level;slot.bright=bright;
            this.place(this.smoke,index,slot,1);this.smoke.count=Math.max(this.smoke.count,index+1);this.smoke.visible=true;
        }
        if(full&&this.cores.count<CORES-1){
            // An orange fireball around a smaller yellow-white heart, both tongues pointing along the flight.
            const flicker=this.still?1:.88+.24*Math.random(),r=BALL*F.fireball*flicker;
            this.dummy.position.set(p.x,p.y,p.z).addScaledVector(this.dir,-r*.4);this.face(this.dir,p);
            this.dummy.scale.set(r*2.6,r*1.3,1);this.core(this.color.copy(this.fire).multiplyScalar(.55*bright*flicker));
            this.dummy.scale.set(r*1.4,r*.65,1);this.core(this.color.copy(this.whiteHot).multiplyScalar(.8*bright));
        }
        if(streak>0&&this.glows.count<GLOWS){
            // The streak's fire-orange edge, around the core trail the view draws.
            const w=F.edge+F.edgeStep*level;
            this.dummy.position.set(p.x,p.y,p.z).addScaledVector(this.dir,-BALL-streak/2);this.dummy.quaternion.setFromUnitVectors(this.axis,this.dir);
            this.dummy.scale.set(w,w,streak/2+w);this.dummy.updateMatrix();
            const at=this.glows.count++;this.glows.setMatrixAt(at,this.dummy.matrix);this.glows.setColorAt(at,this.color.copy(this.fire).multiplyScalar(bright*.8));
            this.glows.visible=true;this.glows.instanceMatrix.needsUpdate=true;this.glows.instanceColor!.needsUpdate=true;
        }
    }
    /** One fireball tongue this frame, posed by `dummy`. */
    private core(color:THREE.Color):void {
        this.dummy.updateMatrix();
        const at=this.cores.count++;this.cores.setMatrixAt(at,this.dummy.matrix);this.cores.setColorAt(at,color);
        this.cores.visible=true;this.cores.instanceMatrix.needsUpdate=true;this.cores.instanceColor!.needsUpdate=true;
    }
    /** An ember `back` units behind `p` along `dir`, flung a little along a flight of `speed`. */
    private ember(p:Vec3Data,back:number,speed:number,bright:number):void {
        const index=this.emberCursor++%EMBERS,slot=this.emberSlots[index]!;
        slot.p.set(p.x-this.dir.x*back,p.y-this.dir.y*back,p.z-this.dir.z*back);
        slot.v.set((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3).addScaledVector(this.dir,speed*.01);
        slot.age=0;slot.life=F.emberLife*(.5+.5*Math.random());slot.size=.6+.8*Math.random();slot.bright=bright;
        this.place(this.embers,index,slot,1);this.embers.count=Math.max(this.embers.count,index+1);this.embers.visible=true;
    }
    /** Turn `dummy` so a sprite at `p` lies along `along` and faces the camera as far as it can. */
    private face(along:THREE.Vector3,p:Vec3Data):void {
        this.toward.set(this.camera.x-p.x,this.camera.y-p.y,this.camera.z-p.z);
        this.toward.addScaledVector(along,-this.toward.dot(along));
        if(this.toward.lengthSq()<1e-6)this.toward.set(Math.abs(along.y)<.9?0:1,Math.abs(along.y)<.9?1:0,0).cross(along);
        this.toward.normalize();this.lift.crossVectors(this.toward,along);
        this.basis.makeBasis(along,this.lift,this.toward);this.dummy.quaternion.setFromRotationMatrix(this.basis);
    }

    /** A Crossfire bounce at `p` off a surface facing `normal`, at heat step `heat` (0 to 2): fire and embers splash off
     * the wall over a brief soft flash. */
    splash(p:Vec3Data,normal:Vec3Data,heat:number):void {
        this.dir.set(normal.x,normal.y,normal.z).normalize();
        this.side.set(Math.abs(this.dir.y)<.9?0:1,Math.abs(this.dir.y)<.9?1:0,0).cross(this.dir).normalize();this.up.crossVectors(this.dir,this.side);
        for(let i=0;i<F.splash;i++){
            const index=this.flameCursor++%FLAMES,slot=this.flameSlots[index]!,angle=i*2.39996+Math.random(),speed=F.splashSpeed*(.45+.55*Math.random());
            slot.p.set(p.x,p.y,p.z).addScaledVector(this.dir,.25);
            slot.v.copy(this.dir).multiplyScalar(speed*.8).addScaledVector(this.side,Math.cos(angle)*speed*.6).addScaledVector(this.up,Math.sin(angle)*speed*.6);
            slot.d.copy(slot.v).normalize();slot.follow=true;
            slot.age=0;slot.life=.22+.15*Math.random();slot.size=F.flameSize*(1.3+.3*heat)*(.7+.6*Math.random());slot.stretch=1.7;slot.bright=1;slot.hot=heat>=2;
            this.place(this.flames,index,slot,1);this.flames.count=Math.max(this.flames.count,index+1);
        }
        this.flames.visible=true;
        for(let i=0;i<F.splashEmbers;i++)this.ember(p,-.2,F.splashSpeed*60*Math.random(),1);
        const index=this.flashCursor++%FLASHES,slot=this.flashSlots[index]!;
        // The drawn facade usually stands 0.2–0.3 in front of the collision surface the bounce hit.
        slot.p.set(p.x,p.y,p.z).addScaledVector(this.dir,.33);slot.d.copy(this.dir);slot.age=0;slot.life=F.flashMs/1000;slot.size=F.flash*(.8+.1*heat);slot.bright=1;
        this.place(this.flashes,index,slot,1);this.flashes.count=Math.max(this.flashes.count,index+1);this.flashes.visible=true;
    }

    /** Age everything a frame, seen from `camera`; the frame's fireballs, streak edges and flame budget start afresh
     * (call before `ball`). */
    update(dt:number,camera:THREE.Camera):void {
        this.spent=0;this.still=reducedMotion();
        camera.getWorldPosition(this.camera);camera.getWorldQuaternion(this.facing);
        if(this.glows.count){this.glows.count=0;this.glows.visible=false;}
        if(this.cores.count){this.cores.count=0;this.cores.visible=false;}
        this.age(this.flames,this.flameSlots,dt,0,4);
        this.age(this.embers,this.emberSlots,dt,-7,1.5);
        this.age(this.smoke,this.smokeSlots,dt,0,.6);
        this.age(this.flashes,this.flashSlots,dt,0,0);
    }

    private age(mesh:THREE.InstancedMesh,slots:Particle[],dt:number,gravity:number,drag:number):void {
        if(!mesh.visible)return;
        let live=false;
        for(let i=0;i<mesh.count;i++){
            const slot=slots[i]!;if(!slot.live)continue;
            if((slot.age+=dt)>=slot.life){slot.live=false;mesh.setMatrixAt(i,this.zero);continue;}
            live=true;
            // A flash keeps its wall's normal in `d`, and stays on the wall.
            if(mesh!==this.flashes){slot.v.y+=gravity*dt;slot.v.multiplyScalar(Math.exp(-drag*dt));slot.p.addScaledVector(slot.v,dt);}
            if(slot.follow&&slot.v.lengthSq()>.01)slot.d.copy(slot.v).normalize();
            this.place(mesh,i,slot,1-slot.age/slot.life);
        }
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        if(!live){mesh.visible=false;mesh.count=0;}
    }

    /** Write slot `i` of `mesh` with `left` (1 to 0) of its life to go. */
    private place(mesh:THREE.InstancedMesh,i:number,slot:Particle,left:number):void {
        slot.live=true;const f=1-left;
        this.dummy.position.copy(slot.p);
        if(mesh===this.flames){
            // A tongue along its way, swelling a little then guttering out, flickering: yellow-white (whiter at full
            // heat), orange, deep red.
            const flicker=this.still?1:.75+.5*Math.random(),size=slot.size*(.75+.6*f)*Math.min(1,left*3)*(this.still?1:.85+.3*Math.random());
            this.face(slot.d,slot.p);this.dummy.scale.set(size*slot.stretch,size,1);
            const start=slot.hot?this.whiteHot:this.yellow;
            if(f<.3)this.color.copy(start).lerp(this.orange,f/.3);else this.color.copy(this.orange).lerp(this.red,(f-.3)/.7);
            mesh.setColorAt(i,this.color.multiplyScalar(slot.bright*Math.pow(left,.7)*flicker));
        }else if(mesh===this.embers){
            this.dummy.quaternion.identity();this.dummy.scale.setScalar(slot.size*(.6+.4*left));
            mesh.setColorAt(i,this.color.copy(this.emberColor).lerp(this.red,f).multiplyScalar(slot.bright*Math.sqrt(left)));
        }else if(mesh===this.smoke){
            // A grey wisp: fading in, then thinning out as it spreads.
            this.dummy.quaternion.copy(this.facing);this.dummy.scale.setScalar(slot.size*(1+3*f));
            const alpha=.2*slot.bright*left*Math.min(1,f*6);mesh.setColorAt(i,this.color.setRGB(alpha,alpha,alpha));
        }else{
            this.dummy.quaternion.setFromUnitVectors(this.axis,slot.d);
            this.dummy.scale.setScalar(slot.size*(.6+.4*Math.sqrt(f)));
            mesh.setColorAt(i,this.color.copy(this.flashColor).multiplyScalar(slot.bright*left*left));
        }
        this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }

    dispose():void {
        this.root.removeFromParent();
        const meshes=[this.flames,this.cores,this.embers,this.smoke,this.glows,this.flashes];
        for(const resource of new Set(meshes.flatMap(mesh=>[mesh.geometry,mesh.material as THREE.Material])))resource.dispose();
        for(const mesh of meshes)mesh.dispose();
        this.flameTexture.dispose();this.puffTexture.dispose();
    }
}
