import * as THREE from 'three';
import {DISPATCH_STATIONS,type ChaosState} from '../shared/chaosState';
import {INCIDENTS,incidentInfo} from '../shared/incidentCatalog';
import {DispatchAudio,DISPATCH_VOICES,sirenVolume} from '../audio/DispatchAudio';
import {worldSoundGain} from '../audio/worldSoundGain';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {buildPillar,createPillarKit,disposePillarKit,FACE_WINDOW,type PillarKit,type PillarModel} from './DispatchPillarModel';
import {freezeStatic} from '../utils/freezeStatic';

export type DispatchStation=typeof DISPATCH_STATIONS[number];
type Dispatch=ChaosState['dispatch'];
const SPARKS=64,SHARDS=36;

interface PillarView {
    station:DispatchStation;model:PillarModel;
    /** Latest hit: seconds since it (Infinity for none), the push direction in the pillar's frame, and whether the line was busy. */
    hitAge:number;hitX:number;hitZ:number;hitBusy:boolean;
    /** The call-box glass was shot out; it stays broken until the line is ready again. */
    broken:boolean;
    /** This frame: distance and stereo pan from the listener, and how the bell rings. */
    distance:number;pan:number;ringing:boolean;berserk:boolean;
}
interface Particle {p:THREE.Vector3;v:THREE.Vector3;spin:THREE.Vector3;age:number;life:number;floor:number}

/** The street alarm pillars. They share the one Dispatch lifecycle: ready (bursts
 * of ringing, trembling, a turning beacon washing the pavement red, the nearest
 * sirens whooping), the shot (the hit bell goes berserk, sparks, the call box
 * glass shatters), rolling (every bell rings while the faces spin through the
 * incidents), active (the incident and its countdown, the last three seconds
 * ticked, a finale and the all clear) and cooldown (LINE BUSY). Every hit, even
 * while busy, jolts its pillar. The face text is information and always shows;
 * the rest honours the `dispatchPillar` and `dispatchShot` feel switches. */
export class DispatchPillars {
    /** Solid pillars: aim, camera and sound-occlusion rays hit them. */
    readonly root=new THREE.Group();
    private readonly fx=new THREE.Group();
    private readonly kit:PillarKit;
    private readonly views:PillarView[]=[];
    private readonly audio:DispatchAudio;
    /** The ball that started an incident hit this bell. */
    onShot?:(station:DispatchStation,at:THREE.Vector3)=>void;
    private phase?:Dispatch['phase'];
    private serial=-1;
    /** Seconds left in the active incident as last seen, for the last-three ticks. */
    private left=0;
    private shot=-1;private shotAge=Infinity;private finaleAge=Infinity;private tickAge=Infinity;
    private spin=0;private lastNow=NaN;private faceKey=-1;
    private readonly sirenSlots=new Int8Array(DISPATCH_VOICES.siren).fill(-1);
    private readonly bellSlots=new Int8Array(DISPATCH_VOICES.bell).fill(-1);
    private readonly chosen=new Int8Array(DISPATCH_VOICES.bell);
    private readonly sparks:THREE.InstancedMesh;
    private readonly shards:THREE.InstancedMesh;
    private readonly sparkPool:Particle[];
    private readonly shardPool:Particle[];
    private sparkCursor=0;private shardCursor=0;
    private readonly dummy=new THREE.Object3D();
    private readonly ear=new THREE.Vector3();
    private readonly hitAt=new THREE.Vector3();
    private readonly scratch=new THREE.Vector3();
    private readonly axis=new THREE.Vector3(0,0,1);

    constructor(scene:THREE.Scene,audio?:AudioContext){
        this.audio=new DispatchAudio(audio);
        this.kit=createPillarKit();
        this.root.name='dispatch-alarm-pillars';this.root.userData.aimTarget=true;this.root.userData.noNoir=true;
        for(const station of DISPATCH_STATIONS){
            const model=buildPillar(this.kit,station.bell,station.face);
            model.base.position.set(station.x,station.y,station.z);model.base.name='dispatch-'+station.id;
            this.root.add(model.base);
            this.views.push({station,model,hitAge:Infinity,hitX:0,hitZ:0,hitBusy:false,broken:false,distance:Infinity,pan:0,ringing:false,berserk:false});
        }
        const particle=():Particle=>({p:new THREE.Vector3(),v:new THREE.Vector3(),spin:new THREE.Vector3(),age:Infinity,life:1,floor:0});
        this.sparkPool=Array.from({length:SPARKS},particle);this.shardPool=Array.from({length:SHARDS},particle);
        this.sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(.04,.04,.3),new THREE.MeshBasicMaterial({color:0xffb347,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,toneMapped:false}),SPARKS);
        const shard=new THREE.BufferGeometry();shard.setAttribute('position',new THREE.Float32BufferAttribute([0,.14,0,-.09,-.07,0,.11,-.09,0],3));shard.computeVertexNormals();
        this.shards=new THREE.InstancedMesh(shard,new THREE.MeshStandardMaterial({color:0xd8ecf5,emissive:0x223038,transparent:true,opacity:.6,roughness:.05,metalness:.3,side:THREE.DoubleSide,depthWrite:false}),SHARDS);
        for(const mesh of [this.sparks,this.shards]){mesh.count=0;mesh.frustumCulled=false;this.fx.add(mesh);}
        this.fx.name='dispatch-pillar-fx';this.fx.userData.noNoir=true;
        scene.add(this.root,this.fx);
        // The post trembles, the bell rocks, the hammer strikes and the beacon turns; nothing else moves.
        freezeStatic(this.root,this.views.flatMap(({model})=>[model.body,model.bell,model.hammer,model.lamp,model.rotor,model.sweep]));
        freezeStatic(this.fx);
    }

    /** A ball the authority counted on a bell at `p` (world). `busy` hits land while the
     * line is busy. Returns false when `p` is on no pillar's bell. */
    hit(p:{x:number;y:number;z:number},busy:boolean,camera?:THREE.Camera):boolean {
        let index=-1,best=Infinity;
        for(let i=0;i<this.views.length;i++){
            const t=this.views[i]!.station.target,dx=p.x-t.x,dy=p.y-t.y,dz=p.z-t.z;
            if(Math.abs(dx)>t.w/2+.8||Math.abs(dy)>t.h/2+.8||Math.abs(dz)>t.d/2+.8)continue;
            const d=dx*dx+dy*dy+dz*dz;if(d<best){best=d;index=i;}
        }
        if(index<0)return false;
        const view=this.views[index]!,station=view.station,t=station.target,f=station.face,state=feelState();
        this.hitAt.set(p.x,p.y,p.z);
        // The push, in the pillar's own frame: away from where the ball struck.
        const wx=p.x-t.x,wz=p.z-t.z,lx=wx*Math.cos(f)-wz*Math.sin(f),lz=wx*Math.sin(f)+wz*Math.cos(f),l=Math.hypot(lx,lz)||1;
        view.hitX=-lx/l;view.hitZ=-lz/l;view.hitAge=0;view.hitBusy=busy;
        if(camera){camera.getWorldPosition(this.ear);this.listen(view,camera);}
        const heard=camera?view.distance:Infinity;
        if(busy){
            if(state.on('dispatchPillar')){
                for(let i=0;i<6;i++)this.spark(this.hitAt,4,.35);
                this.audio.play('clank',.55*worldSoundGain(heard,1-Math.max(0,heard-8)/72),view.pan);
            }
            return true;
        }
        this.shot=index;this.shotAge=0;
        if(state.on('dispatchShot')){
            for(let i=0;i<40;i++)this.spark(this.hitAt,9,.7);
            if(!view.broken)this.shatter(view);
            this.audio.play('strike',.7*worldSoundGain(heard,1-Math.max(0,heard-8)/112),view.pan);
            this.audio.play('squawk',FEEL.dispatchShot.params.squawk);
        }
        this.onShot?.(station,this.hitAt);
        return true;
    }

    /** The view's distance and stereo pan from the listener at `ear`, facing as `camera`. */
    private listen(view:PillarView,camera:THREE.Camera){
        const t=view.station.target,dx=t.x-this.ear.x,dy=t.y-this.ear.y,dz=t.z-this.ear.z,e=camera.matrixWorld.elements;
        view.distance=Math.hypot(dx,dy,dz);
        view.pan=Math.max(-.85,Math.min(.85,(dx*e[0]!+dy*e[1]!+dz*e[2]!)/Math.max(1,view.distance)));
    }

    private spark(at:THREE.Vector3,speed:number,life:number){
        const s=this.sparkPool[this.sparkCursor++%SPARKS]!;
        s.p.copy(at);s.v.set(Math.random()-.5,Math.random()*.9,Math.random()-.5).normalize().multiplyScalar(speed*(.4+Math.random()*.6));
        s.age=0;s.life=life*(.6+Math.random()*.6);s.floor=-Infinity;
    }
    private shatter(view:PillarView){
        view.broken=true;
        const {station,model}=view,f=station.face,fx=Math.sin(f),fz=Math.cos(f);
        model.face.getWorldPosition(this.scratch);
        for(let i=0;i<16;i++){
            const s=this.shardPool[this.shardCursor++%SHARDS]!,side=(Math.random()-.5)*FACE_WINDOW.w;
            s.p.set(this.scratch.x+fz*side,this.scratch.y+(Math.random()-.5)*FACE_WINDOW.h,this.scratch.z-fx*side);
            const out=2+Math.random()*3.5;
            s.v.set(fx*out+fz*(Math.random()-.5)*3,1+Math.random()*2.5,fz*out-fx*(Math.random()-.5)*3);
            s.spin.set(Math.random()*14-7,Math.random()*14-7,Math.random()*14-7);
            s.age=0;s.life=2.4+Math.random();s.floor=station.y+.03;
        }
    }

    /** Each frame, with the authoritative dispatch state at presentation time `now` (ms). */
    update(d:Dispatch,now:number,camera?:THREE.Camera){
        const dt=Number.isFinite(this.lastNow)?Math.min(.1,Math.max(0,(now-this.lastNow)/1000)):0;this.lastNow=now;
        const t=now/1000,state=feelState(),juice=state.on('dispatchPillar'),p=FEEL.dispatchPillar.params;
        if(d.phase==='ready'){this.shot=-1;for(const view of this.views)view.broken=false;}
        // Phase changes: a join mid-incident hears nothing; a fresh end plays the finale and the all clear.
        if(d.phase!==this.phase||d.serial!==this.serial){
            if(juice&&this.phase==='active'&&d.phase==='cooldown'&&now-d.started<1000){
                this.finaleAge=0;this.audio.play('finale',p.finale);this.audio.play('whistle',p.whistle,0,.9);
            }
            this.phase=d.phase;this.serial=d.serial;
        }
        const left=d.phase==='active'?Math.max(0,Math.ceil((d.until-now)/1000)):0;
        if(left!==this.left){
            if(juice&&left>=1&&left<=3&&this.left===left+1){this.tickAge=0;this.tickNearest(camera);}
            this.left=left;
        }
        this.shotAge+=dt;this.finaleAge+=dt;this.tickAge+=dt;
        const beaconOn=d.phase!=='cooldown',finale=this.finaleAge<.9,rolling=d.phase==='rolling';
        this.spin+=dt*(rolling||finale?9:4.5);
        camera?.getWorldPosition(this.ear);
        this.kit.beacon.emissiveIntensity=beaconOn?(juice?1.1+Math.sin(t*9)*.35:1.1):.05;
        for(let i=0;i<this.views.length;i++){
            const view=this.views[i]!,model=view.model;
            if(camera)this.listen(view,camera);
            view.berserk=finale||i===this.shot&&(rolling||this.shotAge<1);
            view.ringing=view.berserk||rolling||d.phase==='ready'&&(t+i*.61)%3.2<1.3;
            view.hitAge+=dt;
            model.glass.visible=!view.broken;model.remnant.visible=view.broken;
            model.reflector.visible=beaconOn;
            model.lamp.rotation.y=model.rotor.rotation.y=model.sweep.rotation.z=this.spin;
            model.rotor.visible=model.sweep.visible=juice&&beaconOn;
            if(!juice){
                model.hammer.rotation.x=.25;model.ghosts.visible=false;
                model.body.position.set(0,0,0);model.body.rotation.set(0,0,0);model.bell.rotation.set(0,0,0);
                continue;
            }
            // The hammer blurs while ringing, strikes once per final tick, and rests off the rim.
            const rate=view.berserk?26:17;
            model.hammer.rotation.x=view.ringing?.21+.21*Math.sin(t*Math.PI*2*rate+i):this.tickAge<.2?.25*Math.min(1,this.tickAge/.12):.25;
            model.ghosts.visible=view.ringing;
            // A hit rocks the pillar away from the ball and wobbles back; ringing makes it tremble.
            const punch=view.hitAge<.8?Math.exp(-view.hitAge*6)*Math.cos(view.hitAge*28)*(view.hitBusy?.5:1):0;
            const shake=view.berserk?.045:view.ringing?.012:0;
            model.body.position.set(Math.sin(t*61+i)*shake,0,Math.cos(t*53+i)*shake);
            model.body.rotation.set(view.hitZ*.07*punch+Math.sin(t*47)*shake*.3,0,-view.hitX*.07*punch+Math.cos(t*43)*shake*.3);
            model.bell.rotation.set(view.hitZ*.18*punch+Math.sin(t*38)*shake*1.5,0,-view.hitX*.18*punch);
        }
        this.updateSound(d,juice,p.bell,p.bellRange);
        this.drawFace(d,now);
        this.updateParticles(dt);
    }

    private tickNearest(camera?:THREE.Camera){
        let nearest:PillarView|undefined;
        for(const view of this.views)if(!nearest||view.distance<nearest.distance)nearest=view;
        if(nearest&&camera)this.audio.play('tick',.6*worldSoundGain(nearest.distance,1-Math.max(0,nearest.distance-8)/62),nearest.pan);
    }

    /** Pick up to `max` nearest views within `range` (ringing ones only when `ringing`) into `chosen`; returns how many. */
    private nearest(max:number,range:number,ringing:boolean):number {
        let n=0;
        for(;n<max;n++){
            let best=-1;
            for(let i=0;i<this.views.length;i++){
                const view=this.views[i]!;
                if(view.distance>=range||ringing&&!view.ringing)continue;
                let taken=false;for(let k=0;k<n;k++)if(this.chosen[k]===i)taken=true;
                if(!taken&&(best<0||view.distance<this.views[best]!.distance))best=i;
            }
            if(best<0)break;
            this.chosen[n]=best;
        }
        return n;
    }
    /** Keep each slot on its pillar while that pillar is still chosen; fill the rest. */
    private assign(slots:Int8Array,n:number){
        for(let s=0;s<slots.length;s++){
            let kept=false;for(let k=0;k<n;k++)if(this.chosen[k]===slots[s])kept=true;
            if(!kept)slots[s]=-1;
        }
        for(let k=0;k<n;k++){
            const view=this.chosen[k]!;
            if(slots.includes(view))continue;
            const free=slots.indexOf(-1);if(free>=0)slots[free]=view;
        }
    }
    private updateSound(d:Dispatch,juice:boolean,bell:number,range:number){
        // The siren is how players find the pillars: only the nearest two ready ones whoop, loud and far.
        this.assign(this.sirenSlots,d.phase==='ready'?this.nearest(DISPATCH_VOICES.siren,85,false):0);
        for(let s=0;s<this.sirenSlots.length;s++){
            const view=this.views[this.sirenSlots[s]!];
            if(!view){this.audio.siren(s,0,0);continue;}
            this.audio.siren(s,sirenVolume(view.distance),view.pan);
        }
        this.assign(this.bellSlots,juice?this.nearest(DISPATCH_VOICES.bell,range,true):0);
        for(let s=0;s<this.bellSlots.length;s++){
            const index=this.bellSlots[s]!,view=this.views[index];
            if(!view){this.audio.bell(s,-1,0,0);continue;}
            this.audio.bell(s,index,bell*(view.berserk?1.4:1)*worldSoundGain(view.distance,1-Math.max(0,view.distance-8)/(range-8)),view.pan,view.berserk?1.25:1);
        }
    }

    /** The call-box faces share one canvas, redrawn only when what it says changes. */
    private drawFace(d:Dispatch,now:number){
        const incident=INCIDENTS.indexOf(incidentInfo(d.incident)),left=Math.max(0,Math.ceil((d.until-now)/1000));
        const landed=d.phase==='rolling'&&now>=d.until-450,spinning=Math.floor(now/85)%INCIDENTS.length;
        const key=d.phase==='ready'?0:d.phase==='rolling'?(landed?200+incident:100+spinning):d.phase==='active'?(left<=3?10000:20000)+left*100+incident:30000+left;
        if(key===this.faceKey)return;
        this.faceKey=key;
        const ctx=this.kit.faceCanvas.getContext('2d');if(!ctx)return;
        const W=256,H=192,cream='#f1dfb4',amber='#e8b04a',red='#ff3b2a';
        ctx.fillStyle='#0f0b0e';ctx.fillRect(0,0,W,H);
        ctx.fillStyle='#3a2a1e';ctx.fillRect(6,6,W-12,3);ctx.fillRect(6,H-9,W-12,3);ctx.fillRect(6,6,3,H-12);ctx.fillRect(W-9,6,3,H-12);
        ctx.textAlign='center';ctx.textBaseline='middle';
        const text=(value:string,y:number,max:number,color:string)=>{
            const size=Math.min(max,Math.floor(228/(.6*value.length)));
            ctx.font=`bold ${size}px monospace`;ctx.fillStyle=color;ctx.fillText(value,W/2,y);
        };
        const title=(value:string,y:number,max:number,color:string)=>{
            const words=value.toUpperCase(),space=words.indexOf(' ');
            if(space<0||words.length<=11){text(words,y,max,color);return;}
            text(words.slice(0,space),y-max*.5,max,color);text(words.slice(space+1),y+max*.5,max,color);
        };
        if(d.phase==='ready'){text('POLICE · FIRE',34,20,amber);text('DISPATCH',92,44,cream);text('SHOOT THE BELL',152,24,red);}
        else if(d.phase==='rolling'&&!landed){text('DISPATCHING',30,22,amber);title(INCIDENTS[spinning]!.title,108,34,cream);}
        else if(d.phase==='rolling'){
            text('DISPATCHED',30,22,amber);
            ctx.fillStyle=red;ctx.fillRect(18,58,W-36,5);ctx.fillRect(18,160,W-36,5);ctx.fillRect(18,58,5,107);ctx.fillRect(W-23,58,5,107);
            title(INCIDENTS[incident]!.title,111,36,red);
        }else if(d.phase==='active'){
            title(INCIDENTS[incident]!.title,40,24,amber);
            if(left<=3)text(String(left),128,110,red);
            else{text(`0:${String(left).padStart(2,'0')}`,122,64,cream);text('IN PROGRESS',172,16,amber);}
        }else{text('DISPATCH',34,20,amber);text('LINE BUSY',96,40,red);text(`OPEN IN ${left}`,152,22,cream);}
        this.kit.faceTexture.needsUpdate=true;
    }

    private updateParticles(dt:number){
        let count=0;
        for(const s of this.sparkPool){
            if((s.age+=dt)>=s.life)continue;
            s.v.y-=14*dt;s.p.addScaledVector(s.v,dt);
            this.dummy.position.copy(s.p);
            this.dummy.quaternion.setFromUnitVectors(this.axis,this.scratch.copy(s.v).normalize());
            this.dummy.scale.setScalar(1-s.age/s.life);this.dummy.updateMatrix();
            this.sparks.setMatrixAt(count++,this.dummy.matrix);
        }
        this.sparks.count=count;if(count)this.sparks.instanceMatrix.needsUpdate=true;
        count=0;
        for(const s of this.shardPool){
            if((s.age+=dt)>=s.life)continue;
            if(s.p.y>s.floor){
                s.v.y-=16*dt;s.p.addScaledVector(s.v,dt);
                // Landed: it lies flat on the pavement at the yaw it fell with.
                if(s.p.y<=s.floor){s.p.y=s.floor;s.spin.set(0,s.spin.y*s.age,0);}
            }
            if(s.p.y<=s.floor)this.dummy.rotation.set(-Math.PI/2,0,s.spin.y);
            else this.dummy.rotation.set(s.spin.x*s.age,s.spin.y*s.age,s.spin.z*s.age);
            this.dummy.position.copy(s.p);this.dummy.scale.setScalar(Math.min(1,(s.life-s.age)/.4));this.dummy.updateMatrix();
            this.shards.setMatrixAt(count++,this.dummy.matrix);
        }
        this.shards.count=count;if(count)this.shards.instanceMatrix.needsUpdate=true;
    }

    dispose(){
        this.audio.dispose();this.root.removeFromParent();this.fx.removeFromParent();
        for(const mesh of [this.sparks,this.shards]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
        disposePillarKit(this.kit);
    }
}
