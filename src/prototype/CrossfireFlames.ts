import * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {reducedMotion} from '../ui/motion';

/** Crossfire's fire (Tyler, 2 October: "flaming balls of cheese that really speed up off walls"). Every frame a bounced
 * ball leaves up to `flames` flickering flame puffs along the way it came, each burning out once the ball is `reach`
 * (+ `reachStep` a heat step) units on, so the fire trails a fast ball as far as its streak and no further (at least
 * `minLife`, at most `flameLife` s); now and then an ember (`emberChance` a frame, living `emberLife` s, cooling as it
 * falls) and a wisp of smoke (`smokeChance`, `smokeLife` s). At most `budget` flames a frame across every ball, so a
 * busy volley stays readable. At full heat the white-hot core burns inside a flickering fireball `fireball`× the ball.
 * A bounce splashes `splash` flames off the wall at up to `splashSpeed` u/s and flashes a disc up to `flash` units
 * across for `flashMs`. Fixed additive pools (smoke alone is a dim normal blend), no lights, nothing allocated per frame. */
export const CROSSFIRE_FLAMES={flames:3,reach:3,reachStep:2.5,minLife:.03,flameLife:.16,flameSize:.2,budget:24,emberChance:.4,emberLife:.6,
    smokeChance:.2,smokeLife:.8,fireball:2.4,splash:9,splashSpeed:8,flash:1.8,flashMs:170,streakMin:1.4,streakMax:12,streakPerSpeed:.016,edge:.09,edgeStep:.03} as const;
const F=CROSSFIRE_FLAMES,FLAMES=192,EMBERS=64,SMOKES=32,FLASHES=8,GLOWS=128,BALL=.15;
/** A hot ball's streak in units at `speed` u/s: `streakPerSpeed` a unit of speed, from `streakMin` (a fresh ricochet)
 * to `streakMax` (a tracer round at full heat). Its fire-orange edge is `edge` (+ `edgeStep` a heat step) units thick. */
export const heatStreak=(speed:number)=>Math.min(F.streakMax,Math.max(F.streakMin,speed*F.streakPerSpeed));

interface Particle {p:THREE.Vector3;v:THREE.Vector3;age:number;life:number;size:number;bright:number;hot:boolean;live:boolean}
const particles=(count:number):Particle[]=>Array.from({length:count},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:0,life:1,size:1,bright:1,hot:false,live:false}));

export class CrossfireFlames {
    private readonly root=new THREE.Group();
    private readonly flames:THREE.InstancedMesh;
    private readonly embers:THREE.InstancedMesh;
    private readonly smoke:THREE.InstancedMesh;
    /** This frame's fireballs and streak edges. */
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
    private readonly dummy=new THREE.Object3D();
    private readonly zero=new THREE.Matrix4().makeScale(0,0,0);
    private readonly axis=new THREE.Vector3(0,0,1);
    private readonly dir=new THREE.Vector3();
    private readonly side=new THREE.Vector3();
    private readonly up=new THREE.Vector3();
    private readonly color=new THREE.Color();
    // Flame colours, young to old: white-hot (at full heat) or yellow, orange, ember red; linear and over-bright (additive).
    private readonly whiteHot=new THREE.Color(2.4,2.1,1.5);
    private readonly yellow=new THREE.Color(1.9,1.05,.32);
    private readonly orange=new THREE.Color(1.3,.4,.06);
    private readonly red=new THREE.Color(.4,.05,0);
    private readonly ember=new THREE.Color(1.8,.62,.12);
    private readonly fire=new THREE.Color(1.15,.42,.07);
    constructor(scene:THREE.Scene){
        const additive=()=>new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
        const puff=new THREE.SphereGeometry(1,8,6);
        this.flames=new THREE.InstancedMesh(puff,additive(),FLAMES);
        this.embers=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.035,0),additive(),EMBERS);
        this.smoke=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:0x2b2623,transparent:true,opacity:.2,depthWrite:false}),SMOKES);
        this.glows=new THREE.InstancedMesh(new THREE.SphereGeometry(1,14,10),additive(),GLOWS);
        // A flash is a disc hottest at its centre, fading to nothing at its rim (additive: black is invisible).
        const disc=new THREE.CircleGeometry(.5,20),colors=new Float32Array(disc.getAttribute('position').count*3);
        colors.set([1,1,1],0);disc.setAttribute('color',new THREE.BufferAttribute(colors,3));
        const flash=additive();flash.vertexColors=true;flash.side=THREE.DoubleSide;flash.polygonOffset=true;flash.polygonOffsetFactor=-3;flash.polygonOffsetUnits=-3;
        this.flashes=new THREE.InstancedMesh(disc,flash,FLASHES);
        const names=['crossfire-flames','crossfire-embers','crossfire-smoke','crossfire-fire-glows','crossfire-flashes'];
        [this.flames,this.embers,this.smoke,this.glows,this.flashes].forEach((mesh,i)=>{
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
        const travel=speed*Math.min(dt,.05),full=level>=2,still=reducedMotion();
        const life=Math.max(F.minLife,Math.min(F.flameLife,(F.reach+F.reachStep*level)/speed));
        const count=Math.min(F.flames+(full?1:0),F.budget-this.spent);
        for(let i=0;i<count;i++,this.spent++){
            const index=this.flameCursor++%FLAMES,slot=this.flameSlots[index]!,back=travel*Math.random();
            slot.p.set(p.x-this.dir.x*back+(Math.random()-.5)*.08,p.y-this.dir.y*back+(Math.random()-.5)*.08,p.z-this.dir.z*back+(Math.random()-.5)*.08);
            slot.v.set((Math.random()-.5)*1.2,1.2+Math.random(),(Math.random()-.5)*1.2);
            slot.age=0;slot.life=life*(.6+.4*Math.random());slot.size=F.flameSize*(1+.35*level)*(.7+.6*Math.random());slot.bright=bright;slot.hot=full;
            this.place(this.flames,index,slot,1);this.flames.count=Math.max(this.flames.count,index+1);this.flames.visible=true;
        }
        if(Math.random()<F.emberChance*Math.min(2,dt*60)){
            const index=this.emberCursor++%EMBERS,slot=this.emberSlots[index]!,back=travel*Math.random();
            slot.p.set(p.x-this.dir.x*back,p.y-this.dir.y*back,p.z-this.dir.z*back);
            slot.v.set((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3).addScaledVector(this.dir,speed*.01);
            slot.age=0;slot.life=F.emberLife*(.6+.4*Math.random());slot.size=1;slot.bright=bright;
            this.place(this.embers,index,slot,1);this.embers.count=Math.max(this.embers.count,index+1);this.embers.visible=true;
        }
        if(Math.random()<F.smokeChance*Math.min(2,dt*60)){
            const index=this.smokeCursor++%SMOKES,slot=this.smokeSlots[index]!;
            slot.p.set(p.x-this.dir.x*travel,p.y-this.dir.y*travel,p.z-this.dir.z*travel);
            slot.v.set((Math.random()-.5)*.6,.9+Math.random()*.5,(Math.random()-.5)*.6);
            slot.age=0;slot.life=F.smokeLife*(.7+.3*Math.random());slot.size=.18+.08*level;slot.bright=1;
            this.place(this.smoke,index,slot,1);this.smoke.count=Math.max(this.smoke.count,index+1);this.smoke.visible=true;
        }
        if(full&&this.glows.count<GLOWS){
            // Stretched a little along its flight; flickering unless motion is reduced.
            const flicker=still?1:.88+.24*Math.random(),r=BALL*F.fireball*flicker;
            this.dummy.position.set(p.x,p.y,p.z).addScaledVector(this.dir,-r*.35);this.dummy.quaternion.setFromUnitVectors(this.axis,this.dir);
            this.dummy.scale.set(r,r,r*1.7);this.glow(this.color.copy(this.fire).multiplyScalar(bright*(still?1:.85+.3*Math.random())));
        }
        if(streak>0&&this.glows.count<GLOWS){
            // The streak's fire-orange edge, around the core trail the view draws.
            const w=F.edge+F.edgeStep*level;
            this.dummy.position.set(p.x,p.y,p.z).addScaledVector(this.dir,-BALL-streak/2);this.dummy.quaternion.setFromUnitVectors(this.axis,this.dir);
            this.dummy.scale.set(w,w,streak/2+w);this.glow(this.color.copy(this.fire).multiplyScalar(bright*.8));
        }
    }
    /** One glow this frame, posed by `dummy`. */
    private glow(color:THREE.Color):void {
        this.dummy.updateMatrix();
        const at=this.glows.count++;this.glows.setMatrixAt(at,this.dummy.matrix);this.glows.setColorAt(at,color);
        this.glows.visible=true;this.glows.instanceMatrix.needsUpdate=true;this.glows.instanceColor!.needsUpdate=true;
    }

    /** A Crossfire bounce at `p` off a surface facing `normal`, at heat step `heat` (0 to 2): fire splashes off the wall
     * and the wall flashes. */
    splash(p:Vec3Data,normal:Vec3Data,heat:number):void {
        this.dir.set(normal.x,normal.y,normal.z).normalize();
        this.side.set(Math.abs(this.dir.y)<.9?0:1,Math.abs(this.dir.y)<.9?1:0,0).cross(this.dir).normalize();this.up.crossVectors(this.dir,this.side);
        for(let i=0;i<F.splash;i++){
            const index=this.flameCursor++%FLAMES,slot=this.flameSlots[index]!,angle=i*2.39996+Math.random(),speed=F.splashSpeed*(.45+.55*Math.random());
            slot.p.set(p.x,p.y,p.z).addScaledVector(this.dir,.25);
            slot.v.copy(this.dir).multiplyScalar(speed*.8).addScaledVector(this.side,Math.cos(angle)*speed*.6).addScaledVector(this.up,Math.sin(angle)*speed*.6);
            slot.age=0;slot.life=.2+.15*Math.random();slot.size=F.flameSize*(1.3+.4*heat)*(.7+.6*Math.random());slot.bright=1;slot.hot=heat>=2;
            this.place(this.flames,index,slot,1);this.flames.count=Math.max(this.flames.count,index+1);
        }
        this.flames.visible=true;
        const index=this.flashCursor++%FLASHES,slot=this.flashSlots[index]!;
        // The drawn facade usually stands 0.2–0.3 in front of the collision surface the bounce hit.
        slot.p.set(p.x,p.y,p.z).addScaledVector(this.dir,.33);slot.v.copy(this.dir);slot.age=0;slot.life=F.flashMs/1000;slot.size=F.flash*(.7+.15*heat);slot.bright=1+.4*heat;
        this.place(this.flashes,index,slot,1);this.flashes.count=Math.max(this.flashes.count,index+1);this.flashes.visible=true;
    }

    /** Age everything a frame; the frame's glows and flame budget start afresh (call before `ball`). */
    update(dt:number):void {
        this.spent=0;
        if(this.glows.count){this.glows.count=0;this.glows.visible=false;}
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
            // A flash keeps its wall's normal in `v`, and stays on the wall.
            if(mesh!==this.flashes){slot.v.y+=gravity*dt;slot.v.multiplyScalar(Math.exp(-drag*dt));slot.p.addScaledVector(slot.v,dt);}
            this.place(mesh,i,slot,1-slot.age/slot.life);
        }
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        if(!live){mesh.visible=false;mesh.count=0;}
    }

    /** Write slot `i` of `mesh` with `left` (1 to 0) of its life to go. */
    private place(mesh:THREE.InstancedMesh,i:number,slot:Particle,left:number):void {
        slot.live=true;const f=1-left;
        this.dummy.position.copy(slot.p);this.dummy.quaternion.identity();
        if(mesh===this.flames){
            // Swelling a little, then guttering out: white-hot or yellow, orange, ember red.
            this.dummy.scale.setScalar(slot.size*(.7+.9*f)*Math.min(1,left*3));
            const start=slot.hot?this.whiteHot:this.yellow;
            if(f<.35)this.color.copy(start).lerp(this.orange,f/.35);else this.color.copy(this.orange).lerp(this.red,(f-.35)/.65);
            mesh.setColorAt(i,this.color.multiplyScalar(slot.bright*left));
        }else if(mesh===this.embers){
            this.dummy.scale.setScalar(.6+.4*left);
            mesh.setColorAt(i,this.color.copy(this.ember).lerp(this.red,f).multiplyScalar(slot.bright*Math.sqrt(left)));
        }else if(mesh===this.smoke){
            // Smoke cannot fade by colour (it is not additive): it grows, then shrinks away.
            this.dummy.scale.setScalar(slot.size*(1+2.5*f)*Math.min(1,left*2.5));
        }else{
            this.dummy.quaternion.setFromUnitVectors(this.axis,slot.v);
            this.dummy.scale.setScalar(slot.size*(.45+.55*Math.sqrt(f)));
            mesh.setColorAt(i,this.color.copy(this.whiteHot).lerp(this.orange,f).multiplyScalar(slot.bright*left*left));
        }
        this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }

    dispose():void {
        this.root.removeFromParent();
        for(const mesh of [this.flames,this.embers,this.smoke,this.glows,this.flashes]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
    }
}
