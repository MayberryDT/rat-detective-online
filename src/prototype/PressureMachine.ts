import * as THREE from 'three';
import {LAUNCH_MACHINES,PRESSURE_TUNING,type LaunchMachine,type ChaosState,type SurgeVent} from '../shared/chaosState';
import {SURGE} from '../shared/launcherVelocity';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {LauncherAudio} from '../audio/LauncherAudio';
import {buildMachine,createMachineMaterials,TRIGGER_SCALE as TRIGGER_BASE,type MachineMaterials,type MachineModel} from './LaunchMachineModels';
import {freezeStatic} from '../utils/freezeStatic';

const STEAM=180;
const smooth=(edge0:number,edge1:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-edge0)/(edge1-edge0)));return t*t*(3-2*t);};

interface MachineView {
    model:MachineModel;
    /** Firing time whose sound played (NaN before the first snapshot), and the hang time whose whine played. */
    heardFire:number;heardTell:number;
    steamDebt:number;creakAt:number;popped:boolean;
    /** Wind-tunnel blade angle, integrated so its speed can follow pressure. */
    spin:number;
    /** Latest trigger hit: seconds since it (Infinity for none), the push direction in the machine's frame, and whether it was wasted on the cooldown. */
    hitAge:number;hitX:number;hitZ:number;hitBusy:boolean;
    /** Needle overshoot from the latest hit. */
    needleKick:number;
}

/** Six municipal launchers, each beside its pad with its big red trigger on top.
 * Pressure reads in four stages: building (needle, slow pulse, wisps), straining
 * (swelling, shudder, steam from more seams, creaks), danger (violent rattle,
 * red glow, siren, popping bolts) and blow. Machine bodies are shared cover. */
export class PressureMachine {
    private readonly root=new THREE.Group();
    private readonly launchAudio:LauncherAudio;
    private readonly materials:MachineMaterials;
    private readonly views:MachineView[]=[];
    /** Called once when a machine fires in the presented timeline, with whether it misfired high. */
    onFire?:(machine:LaunchMachine,boost:boolean)=>void;
    /** Called for each cheese ball the authority counted on a machine's trigger (`busy`: wasted on the cooldown). */
    onTriggerHit?:(machine:LaunchMachine,at:THREE.Vector3,busy:boolean,level:number)=>void;
    /** Called once when a Pressure Surge street launcher erupts. */
    onVent?:(vent:SurgeVent)=>void;
    /** Pooled street-launcher visuals: a rattling manhole cover over a glowing hole. */
    private readonly ventViews:{root:THREE.Group;cover:THREE.Group;glow:THREE.Mesh;id:string|null;erupted:boolean;warned:boolean;debt:number}[]=[];
    private readonly ventGeometry={cover:new THREE.CylinderGeometry(.75,.75,.1,20),hole:new THREE.CircleGeometry(1,24),ring:new THREE.RingGeometry(1,1.35,32)};
    private streetSteamDebt=0;
    private readonly steamMesh:THREE.InstancedMesh;
    private readonly steam=Array.from({length:STEAM},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:Infinity,life:1,size:.3}));
    private steamCursor=0;
    private readonly dummy=new THREE.Object3D();
    private readonly world=new THREE.Vector3();
    private lastNow=NaN;
    /** Latest pressure per machine (0…1), for pitching the next trigger hit. */
    private readonly levels=new Map<string,number>();
    private readonly hitAt=new THREE.Vector3();

    constructor(scene:THREE.Scene,audio?:AudioContext){
        this.launchAudio=new LauncherAudio(audio);
        this.root.name='municipal-launch-contraptions';
        this.materials=createMachineMaterials();
        for(const machine of LAUNCH_MACHINES){
            const model=buildMachine(machine,this.materials);
            this.root.add(model.base,model.pad,model.glow);
            this.views.push({model,heardFire:NaN,heardTell:NaN,steamDebt:0,creakAt:0,popped:false,spin:0,hitAge:Infinity,hitX:0,hitZ:0,hitBusy:false,needleKick:0});
        }
        this.steamMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0xd9dcd6,transparent:true,opacity:.3,depthWrite:false}),STEAM);
        this.steamMesh.name='launcher-steam';this.steamMesh.count=0;this.steamMesh.frustumCulled=false;this.root.add(this.steamMesh);
        // One Surge vent up front (hidden, free), so the title's warm-up compiles its programs.
        this.ventView();
        scene.add(this.root);
        // Only what `update`/`animate` moves keeps updating: every other matrix is composed once.
        freezeStatic(this.root,[...this.views.flatMap(({model})=>[model.body,model.trigger,...model.needle?[model.needle]:[],...Object.values(model.parts),...model.parts.streamers?.children??[]]),
            ...this.ventViews.flatMap(({root,cover})=>[root,cover])]);
    }

    /** A trigger hit reported at `p` (world) by the snapshot: the trigger punches in and
     * springs back, the machine rocks away from it, the needle jumps, steam and paint
     * chips spit out, and a clank pitched to how full it is rings out. Returns false
     * when `p` is on no machine's trigger (for example a Dispatch box). */
    triggerHit(p:{x:number;y:number;z:number},busy:boolean,camera?:THREE.Camera):boolean {
        const view=this.views.find(v=>{const t=v.model.machine.target;return Math.abs(p.x-t.x)<t.w/2+.8&&Math.abs(p.y-t.y)<t.h/2+.8&&Math.abs(p.z-t.z)<t.d/2+.8;});
        if(!view)return false;
        const machine=view.model.machine,level=this.levels.get(machine.id)??0;
        this.hitAt.set(p.x,p.y,p.z);
        // The push, in the machine's own frame: away from where the ball struck.
        view.model.base.worldToLocal(this.world.copy(this.hitAt));
        const d=Math.hypot(this.world.x,this.world.z)||1;
        view.hitX=-this.world.x/d;view.hitZ=-this.world.z/d;view.hitAge=0;view.hitBusy=busy;
        if(!busy)view.needleKick=.35;
        for(let i=0;i<(busy?2:10);i++)this.puff(this.hitAt,2+Math.random()*4,.5+Math.random()*.5,.12+Math.random()*.1);
        this.launchAudio.play(machine.kind,machine.pad,camera,busy?'clunk':'pump',false,level);
        this.onTriggerHit?.(machine,this.hitAt,busy,level);
        return true;
    }

    private puff(at:THREE.Vector3,up:number,life:number,size:number){
        const s=this.steam[this.steamCursor++%STEAM]!;
        s.p.copy(at);s.v.set((Math.random()-.5)*1.2,up*(.7+Math.random()*.6),(Math.random()-.5)*1.2);
        s.age=0;s.life=life*(.8+Math.random()*.4);s.size=size;
    }

    /** `surging` while Pressure Surge is active: steam then rises from the streets around the camera. */
    update(state:ChaosState['pressure'],now:number,camera?:THREE.Camera,surging=false){
        const dt=Number.isFinite(this.lastNow)?Math.min(.1,Math.max(0,(now-this.lastNow)/1000)):0;this.lastNow=now;
        const t=now/1000;
        this.launchAudio.update(camera);
        this.updateVents(state?.vents,now,camera,dt,t);
        if(surging&&camera&&dt>0){
            // P4: every street breathes steam during the surge.
            this.streetSteamDebt+=dt*14;
            while(this.streetSteamDebt>=1){
                this.streetSteamDebt--;
                const a=Math.random()*Math.PI*2,r=8+Math.random()*34;
                this.world.set(camera.position.x+Math.sin(a)*r,.1,camera.position.z+Math.cos(a)*r);
                this.puff(this.world,2+Math.random()*3,1.6+Math.random()*1.4,.18+Math.random()*.16);
            }
        }
        for(const view of this.views){
            const {model}=view,machine=model.machine,id=machine.id,kind=machine.kind;
            const fired=state?.fired?.[id]??0,blowAt=state?.blowing?.[id];
            const level=Math.min(1,(state?.levels?.[id]??0)/PRESSURE_TUNING.full);
            const hang=blowAt!==undefined&&now<blowAt;
            const fireAge=(now-fired)/1000;
            // A join mid-cooldown hears nothing; each later firing gets one hang whine and one firing sound.
            if(Number.isNaN(view.heardFire)){view.heardFire=fired;view.heardTell=blowAt??NaN;}
            if(hang&&view.heardTell!==blowAt){view.heardTell=blowAt;this.launchAudio.play(kind,machine.pad,camera,'tell');}
            if(fired>0&&fireAge>=0&&fireAge<1&&view.heardFire!==fired){
                view.heardFire=fired;view.popped=false;
                const boost=state?.boosts?.[id]===fired;
                this.launchAudio.play(kind,machine.pad,camera,'fire',boost);
                this.onFire?.(machine,boost);
            }
            this.levels.set(id,level);
            const intensity=hang?1:level,strain=smooth(.4,.75,intensity),danger=hang?1:smooth(.75,.95,intensity);
            this.launchAudio.setPressure(id,machine.pad,intensity,danger,camera);
            // Strain accents: creaks while straining, a popped bolt on entering danger.
            if(strain>.2&&now>=view.creakAt){view.creakAt=now+1400-strain*900+Math.random()*900;this.launchAudio.play(kind,machine.pad,camera,'creak');}
            if(danger>.5&&!view.popped){view.popped=true;this.launchAudio.play(kind,machine.pad,camera,'pop');}
            if(intensity<.3)view.popped=false;
            // The trigger throbs (never glows) as pressure builds, quicker in the hang.
            const rate=hang?12:1+intensity*6,pulse=.5+.5*Math.sin(t*Math.PI*2*rate);
            // A hit punches the trigger flat and it springs back with a wobble.
            view.hitAge+=dt;view.needleKick*=Math.exp(-dt*9);
            const punch=view.hitAge<.6?Math.exp(-view.hitAge*9)*Math.cos(view.hitAge*34)*(view.hitBusy?.5:1):0;
            const size=TRIGGER_BASE*(1+.04*pulse*intensity+(hang?.05:0));
            model.trigger.scale.set(size*(1+.16*punch),size*(1-.24*punch),size*(1+.16*punch));
            // The body swells and shudders; the whole machine bulges in the danger stage.
            const shake=strain*.025+danger*.07+(hang?.06:0);
            model.body.position.set(Math.sin(t*61)*shake+view.hitX*.18*punch,Math.abs(Math.sin(t*47))*shake*.6,Math.cos(t*53)*shake+view.hitZ*.18*punch);
            model.body.rotation.set(view.hitZ*.08*punch,0,-view.hitX*.08*punch);
            const swell=1+.035*intensity*intensity+.05*danger*Math.abs(Math.sin(t*28));
            model.body.scale.set(swell,1+.02*intensity+.03*danger*Math.abs(Math.sin(t*33)),swell);
            if(model.needle)model.needle.rotation.z=2.36-(intensity+view.needleKick*(1-intensity))*4.71+Math.sin(t*40)*.06*danger;
            (model.glow.material as THREE.MeshBasicMaterial).opacity=danger*.28*(.7+.3*Math.sin(t*14))+(hang?.3:0);
            // Steam: wisps when building, more seams and a taller plume as it rises.
            if(intensity>.03&&dt>0){
                view.steamDebt+=dt*(1.5+intensity*10+danger*22);
                while(view.steamDebt>=1){
                    view.steamDebt--;
                    const seam=model.seams[Math.floor(Math.random()*Math.min(model.seams.length,1+Math.floor(intensity*model.seams.length)))]!;
                    this.world.copy(seam);model.base.localToWorld(this.world);
                    this.puff(this.world,1.2+intensity*6,.8+intensity*1.8,.12+intensity*.2);
                }
            }
            this.animate(view,level,strain,danger,hang,fireAge,t,dt);
        }
        this.updateSteam(dt);
    }

    /** Each machine's own strain and firing motion. `fireAge` is seconds since its latest firing. */
    private animate(view:MachineView,level:number,strain:number,danger:number,hang:boolean,fireAge:number,t:number,dt:number){
        const {model}=view,parts=model.parts,kind=model.machine.kind;
        const a=fireAge>=0?fireAge:Infinity;
        // Launch envelope: snap out in 0.08 s, ease back over about a second.
        const kick=a<.08?a/.08:a<1.3?Math.exp(-(a-.08)*3):0;
        const jitter=Math.sin(t*57)*(strain*.03+danger*.08+(hang?.1:0));
        if(kind==='pressure'){
            const plate=parts.plate!,ram=parts.ram!;
            plate.position.y=-.08*level-(hang?.12:0)+kick*5.5+jitter*.3;
            ram.scale.y=Math.max(.01,plate.position.y+.2);ram.position.y=ram.scale.y/2;
        }else if(kind==='dumpster'){
            parts.floor!.rotation.x=-1.15*kick+jitter*.15;
            parts.lid!.rotation.x=.04*strain+Math.abs(jitter)*.6+(hang?.25:0)+2.3*(a<.6?Math.min(1,a/.1):a<1.2?(1.2-a)/.6:0);
        }else if(kind==='freight'){
            const punch=a<.08?a/.08:a<.6?1-(a-.08)/.52:0;
            parts.piston!.position.z=.95-.9*level-(hang?.15:0)+punch*3.4+jitter*.4;
            parts.sled!.rotation.x=-.5*kick;
        }else if(kind==='geyser'){
            const cover=parts.cover!,flying=a<2.1;
            cover.position.y=flying?Math.max(.2,.2+26*a-12.5*a*a):.2+Math.abs(Math.sin(t*23))*(.05*strain+.22*danger+(hang?.3:0));
            cover.rotation.x=flying?a*9:Math.sin(t*31)*.06*danger;cover.rotation.z=flying?a*5:Math.cos(t*27)*.06*danger;
            ((parts.well as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setScalar(.25+.75*Math.max(level,kick)).multiply(GEYSER_GREEN);
        }else if(kind==='mousetrap'){
            // The bar strains back, snaps over and bounces, then is slowly re-cocked.
            const snap=a<.08?a/.08:a<1?1:a<2?1-smooth(1,2,a):0,settle=a<1?Math.sin(Math.min(1,a/.6)*Math.PI*3)*Math.exp(-a*5)*.3:0;
            parts.bar!.rotation.x=Math.PI+.4*level+(hang?.15:0)+jitter-snap*Math.PI+settle;
        }else{
            view.spin+=dt*(.6+level*22+(hang?30:0)+kick*70);
            parts.blades!.rotation.y=view.spin;
            const ribbons=parts.streamers!.children;
            for(let i=0;i<ribbons.length;i++)ribbons[i]!.rotation.x=-(.15+.9*level+kick*1.2)*(.7+.3*Math.sin(t*9+i));
        }
    }

    /** Street launchers: warning (cover rattles harder, hole glows, steam jets, a whine
     * half a second out), then the eruption (cover blasts off, a steam column). */
    private updateVents(vents:readonly SurgeVent[]|undefined,now:number,camera:THREE.Camera|undefined,dt:number,t:number){
        for(const view of this.ventViews){
            if(!view.id)continue;
            let live=false;
            if(vents)for(const vent of vents)if(vent.id===view.id){live=true;break;}
            if(!live){view.id=null;view.root.visible=false;}
        }
        if(!vents)return;
        for(const vent of vents){
            let view=this.ventViews.find(v=>v.id===vent.id);
            if(!view){
                view=this.ventViews.find(v=>v.id===null)??this.ventView();
                if(!view)continue;
                // A vent seen first after it erupted (a late join) does not replay the blast.
                Object.assign(view,{id:vent.id,erupted:now>=vent.at,warned:now>=vent.at-500,debt:0});view.root.visible=true;
            }
            view.root.position.set(vent.x,vent.y+.02,vent.z);
            const lead=(vent.at-now)/SURGE.warnMs,age=(now-vent.at)/1000;
            // Sounds keep their source position, so each cue gets its own pad (only on the rare cue frames).
            const pad=()=>({x:vent.x,y:vent.y,z:vent.z,radius:SURGE.radius});
            if(lead>0){
                const build=1-Math.min(1,lead);
                view.cover.position.y=.06+Math.abs(Math.sin(t*(20+build*30)))*build*.25;
                view.cover.rotation.set(Math.sin(t*37)*.12*build,0,Math.cos(t*31)*.12*build);
                (view.glow.material as THREE.MeshBasicMaterial).opacity=.25+.6*build*(.7+.3*Math.sin(t*20));
                view.debt+=dt*(6+build*30);
                while(view.debt>=1){view.debt--;this.world.set(vent.x+(Math.random()-.5)*1.4,vent.y+.2,vent.z+(Math.random()-.5)*1.4);this.puff(this.world,3+build*6,.8+build,.2+build*.2);}
                if(!view.warned&&lead<=.5){view.warned=true;this.launchAudio.play('geyser',pad(),camera,'tell');}
            }else{
                if(!view.erupted){
                    view.erupted=true;
                    this.launchAudio.play('geyser',pad(),camera,'fire',!!vent.boost);this.onVent?.(vent);
                    for(let i=0;i<30;i++){this.world.set(vent.x+(Math.random()-.5),vent.y+.3,vent.z+(Math.random()-.5));this.puff(this.world,12+Math.random()*20,1.1+Math.random(),.22+Math.random()*.2);}
                }
                view.cover.position.y=Math.max(.06,.06+30*age-12.5*age*age);view.cover.rotation.set(age*11,0,age*6);
                (view.glow.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.9-age*.6);
            }
        }
    }
    private ventView():PressureMachine['ventViews'][number]|undefined {
        if(this.ventViews.length>=SURGE.maxVents)return undefined;
        const root=new THREE.Group();root.name='surge-street-launcher';root.visible=false;
        const hole=new THREE.Mesh(this.ventGeometry.hole,new THREE.MeshBasicMaterial({color:0x0c0f0e}));hole.rotation.x=-Math.PI/2;hole.position.y=.01;
        const glow=new THREE.Mesh(this.ventGeometry.ring,new THREE.MeshBasicMaterial({color:0xff5a20,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));
        glow.rotation.x=-Math.PI/2;glow.position.y=.03;
        const cover=new THREE.Group(),lid=new THREE.Mesh(this.ventGeometry.cover,this.materials.iron);lid.castShadow=true;cover.add(lid);
        root.add(hole,glow,cover);freezeStatic(root,[root,cover]);this.root.add(root);
        const view={root,cover,glow,id:null,erupted:false,warned:false,debt:0};this.ventViews.push(view);
        return view;
    }

    private updateSteam(dt:number){
        let count=0;
        for(let i=0;i<STEAM;i++){
            const s=this.steam[i]!;
            if((s.age+=dt)>=s.life)continue;
            s.v.multiplyScalar(Math.exp(-1.2*dt));s.p.addScaledVector(s.v,dt);
            const k=s.age/s.life;
            this.dummy.position.copy(s.p);this.dummy.scale.setScalar(s.size*(1+k*3)*(1-k*k));this.dummy.updateMatrix();
            this.steamMesh.setMatrixAt(count++,this.dummy.matrix);
        }
        this.steamMesh.count=count;if(count)this.steamMesh.instanceMatrix.needsUpdate=true;
    }

    dispose(){
        this.launchAudio.dispose();this.root.removeFromParent();this.steamMesh.dispose();
        for(const geometry of Object.values(this.ventGeometry))geometry.dispose();
        disposeMeshResources(this.root);
        for(const material of Object.values(this.materials))material.dispose();
    }
}
const GEYSER_GREEN=new THREE.Color(0x5aff9a);
