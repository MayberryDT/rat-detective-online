import * as THREE from 'three';
import {MAX_TRAPS,type TrapState} from '../shared/chaosState';
import {TRAP_SCALE,TRAP_TALL,WEAPON_TUNING} from '../shared/pickups';
import type {Vec3Data} from '../shared/networkProtocol';
import {kickDust} from '../feel/Dust';
import {PartKit,TRAP_PIECES,TRAP_PIVOTS,mousetrap,weaponFinish,type TrapPiece,type WeaponFinish} from '../utils/WeaponModel';

/** What a placed trap just did, for sounds: set down, snapped on a rat, took a hit, broke. */
export type TrapEvent='set'|'snap'|'hit'|'break';
/** Seconds: the set-down drop and settle, the snap's slam and hop, the bar's re-cock, a hit's jolt. */
const DROP=.16,SETTLE=.45,SLAM=.07,HOP=.36,COCK=.3,JOLT=.18;
const REARM=WEAPON_TUNING.trapRearmMs/1000,BREAK=WEAPON_TUNING.trapBrokenMs/1000;
/** Damage (0…1, from lost hit points) at which each crack opens and each corner chips off. */
const CRACKS=[.2,.45,.7] as const,CORNERS=[.3,.6] as const;
const GRAVITY=-24;
/** Splinters: a shared pool, each living `CHIP_LIFE` seconds. */
const CHIPS=72,CHIP_LIFE=1.1;
const CORNER_PIECES=['cornerFront','cornerBack'] as const,CRACK_PIECES=['crack0','crack1','crack2'] as const;
const listed=(traps:readonly TrapState[]|undefined,id:string):boolean=>{
    for(let i=0;i<Math.min(traps?.length??0,MAX_TRAPS);i++)if(traps![i]!.id===id)return true;
    return false;
};

/** Wood splinters and brass bits thrown off battered and broken traps: one instanced draw for every trap. */
class TrapDebris {
    readonly mesh:THREE.InstancedMesh;
    private readonly state=new Float32Array(CHIPS*14);
    private next=0;
    private alive=0;
    private readonly pose=new THREE.Object3D();
    private readonly tint=new THREE.Color();
    private readonly material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7,emissive:0x3a2810,emissiveIntensity:.6,fog:false});
    constructor(parent:THREE.Object3D){
        this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.05,.08),this.material,CHIPS);
        this.mesh.name='trap-splinters';this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.count=0;this.mesh.raycast=()=>{};
        for(let i=0;i<CHIPS;i++){this.state[i*14+12]=CHIP_LIFE;this.mesh.setColorAt(i,this.tint.setHex(0xffffff));}
        parent.add(this.mesh);
    }
    dispose():void {this.mesh.removeFromParent();this.mesh.geometry.dispose();this.material.dispose();this.mesh.dispose();}
    /** `count` splinters from `at` (world), thrown up and out with `speed`, landing on `floor`. */
    burst(at:THREE.Vector3,count:number,speed:number,floor:number,brass=0):void {
        for(let n=0;n<count;n++){
            const i=this.next,s=this.state,o=i*14,angle=Math.random()*Math.PI*2,out=speed*(.4+Math.random()*.6);
            this.next=(this.next+1)%CHIPS;
            s[o]=at.x;s[o+1]=at.y;s[o+2]=at.z;
            s[o+3]=Math.cos(angle)*out;s[o+4]=speed*(.8+Math.random()*.9);s[o+5]=Math.sin(angle)*out;
            s[o+6]=Math.random()*6;s[o+7]=Math.random()*6;s[o+8]=Math.random()*6;
            s[o+9]=(Math.random()-.5)*30;s[o+10]=(Math.random()-.5)*30;s[o+11]=(Math.random()-.5)*30;
            s[o+12]=0;s[o+13]=floor;
            this.mesh.setColorAt(i,this.tint.setHex(n<brass?0xffcf66:Math.random()<.3?0x9a6a36:0xf0c88a));
        }
        if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
        this.alive=CHIP_LIFE;
    }
    update(dt:number):void {
        if(this.alive<=0)return;
        this.alive-=dt;
        const s=this.state;
        for(let i=0;i<CHIPS;i++){
            const o=i*14;
            if(s[o+12]>=CHIP_LIFE){this.pose.scale.setScalar(0);}
            else{
                s[o+12]+=dt;s[o+4]+=GRAVITY*dt;
                for(let k=0;k<3;k++){s[o+k]+=s[o+3+k]*dt;s[o+6+k]+=s[o+9+k]*dt;}
                if(s[o+1]<s[o+13]+.03){s[o+1]=s[o+13]+.03;s[o+4]=Math.abs(s[o+4])*.25;s[o+3]*=.6;s[o+5]*=.6;s[o+9]*=.5;s[o+10]*=.5;s[o+11]*=.5;}
                this.pose.position.set(s[o],s[o+1],s[o+2]);this.pose.rotation.set(s[o+6],s[o+7],s[o+8]);
                this.pose.scale.setScalar(Math.min(1,(CHIP_LIFE-s[o+12])*4));
            }
            this.pose.updateMatrix();this.mesh.setMatrixAt(i,this.pose.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate=true;
        this.mesh.visible=this.alive>0;this.mesh.count=this.mesh.visible?CHIPS:0;
    }
}

/** One placed Mousetrap: set down with a thunk, SNAPs (the bar slams over, the whole trap hops) on each kill,
 * splinters on each hit and looks more battered as it loses hit points, and bursts apart (springs fly, pieces
 * scatter) when it breaks. Animated from snapshot changes on the local clock. */
class TrapVisual {
    readonly root=new THREE.Group();
    /** Trap space scaled to the gameplay footprint (`TRAP_SCALE`, `TRAP_TALL`): what you see is what snaps. */
    private readonly sized=new THREE.Group();
    private readonly body=new THREE.Group();
    private readonly pieces:Record<TrapPiece,THREE.Object3D>;
    id='';
    private hp:number=WEAPON_TUNING.trapHp;
    private snapAt?:number;
    private hitAt?:number;
    private broken=false;
    private setAge=Infinity;
    private snapAge=Infinity;
    private hitAge=Infinity;
    private breakAge=Infinity;
    private landed=true;
    private corners=0;
    /** Per piece while breaking: velocity, then spin. */
    private readonly flight=new Float32Array(TRAP_PIECES.length*6);
    private readonly at=new THREE.Vector3();
    constructor(templates:Record<TrapPiece,THREE.Group>){
        this.root.name='mousetrap';this.sized.scale.set(TRAP_SCALE,TRAP_TALL,TRAP_SCALE);this.sized.add(this.body);this.root.add(this.sized);
        const pieces:Partial<Record<TrapPiece,THREE.Object3D>>={};
        for(const piece of TRAP_PIECES){const part=templates[piece].clone();this.body.add(part);pieces[piece]=part;}
        this.pieces=pieces as Record<TrapPiece,THREE.Object3D>;
    }
    /** Take over `trap`; `fresh` plays the set-down. */
    reset(trap:TrapState,fresh:boolean):void {
        this.id=trap.id;this.hp=trap.hp;this.snapAt=trap.snapAt;this.hitAt=trap.hitAt;this.broken=trap.brokenAt!==undefined;
        this.setAge=fresh?0:Infinity;this.landed=!fresh;this.snapAge=this.hitAge=Infinity;this.breakAge=this.broken?BREAK:Infinity;
        this.corners=this.lostCorners();
        for(const piece of TRAP_PIECES){const part=this.pieces[piece],[x,y,z]=TRAP_PIVOTS[piece];part.position.set(x,y,z);part.rotation.set(0,0,0);part.scale.setScalar(1);part.visible=true;}
        this.root.visible=!this.broken;
        this.root.position.set(trap.x,trap.y,trap.z);this.root.rotation.set(0,trap.yaw,0);
    }
    /** Read a snapshot's entry: start the animations its changes call for and announce them. */
    sync(trap:TrapState,debris:TrapDebris,announce?:(event:TrapEvent,p:Vec3Data)=>void):void {
        this.root.position.set(trap.x,trap.y,trap.z);this.root.rotation.y=trap.yaw;
        if(trap.snapAt!==undefined&&trap.snapAt!==this.snapAt&&!this.broken){this.snapAge=0;announce?.('snap',trap);}
        if(trap.hitAt!==undefined&&trap.hitAt!==this.hitAt){
            this.hitAge=0;announce?.('hit',trap);
            this.at.set((Math.random()-.5)*1.2*TRAP_SCALE,.2*TRAP_TALL,(Math.random()-.5)*2*TRAP_SCALE).applyEuler(this.root.rotation).add(this.root.position);
            debris.burst(this.at,6,3.2,trap.y);
        }
        this.snapAt=trap.snapAt;this.hitAt=trap.hitAt;this.hp=trap.hp;
        const corners=this.lostCorners();
        for(let i=this.corners;i<corners;i++){
            const [x,y,z]=TRAP_PIVOTS[CORNER_PIECES[i]!];
            debris.burst(this.at.set(x*TRAP_SCALE,y*TRAP_TALL,z*TRAP_SCALE).applyEuler(this.root.rotation).add(this.root.position),8,4,trap.y);
        }
        this.corners=corners;
        if(trap.brokenAt!==undefined&&!this.broken){
            this.broken=true;this.breakAge=0;announce?.('break',trap);
            this.launch();debris.burst(this.at.set(trap.x,trap.y+.3*TRAP_TALL,trap.z),18,6,trap.y,6);
        }
    }
    private lostCorners():number {
        const damage=this.damage();let lost=0;
        for(const at of CORNERS)if(damage>=at)lost++;
        return lost;
    }
    private damage():number {return 1-Math.max(0,Math.min(WEAPON_TUNING.trapHp,this.hp))/WEAPON_TUNING.trapHp;}
    /** Break: every piece flies off, the springs highest. */
    private launch():void {
        for(let i=0;i<TRAP_PIECES.length;i++){
            const piece=TRAP_PIECES[i]!,[x,,z]=TRAP_PIVOTS[piece],spring=piece==='springLeft'||piece==='springRight',f=this.flight,o=i*6;
            const out=Math.hypot(x,z)||1,speed=spring?2.5:3.5;
            f[o]=(x/out+(Math.random()-.5)*.8)*speed;f[o+1]=spring?11+Math.random()*3:4+Math.random()*4;f[o+2]=(z/out+(Math.random()-.5)*.8)*speed;
            f[o+3]=(Math.random()-.5)*(spring?24:10);f[o+4]=(Math.random()-.5)*10;f[o+5]=(Math.random()-.5)*(spring?24:10);
        }
    }
    update(dt:number):void {
        this.setAge+=dt;this.snapAge+=dt;this.hitAge+=dt;
        if(this.broken){this.fly(dt);return;}
        const damage=this.damage();
        let x=0,y=0,squash=0,rx=0,rz=damage*.05;
        // Set down: dropped from a little height, then a thunk and a wobble.
        if(this.setAge<DROP){const t=this.setAge/DROP;y=(1-t*t)*1.2;squash=-.12*t;}
        else if(this.setAge<DROP+SETTLE){
            if(!this.landed){this.landed=true;kickDust(this.root.position,.8);}
            const s=(this.setAge-DROP)/SETTLE;squash=Math.sin(s*Math.PI*2.5)*(1-s)*.32;
        }
        // SNAP: the whole trap hops and lands.
        if(this.snapAge<HOP){const s=this.snapAge/HOP;y+=Math.sin(s*Math.PI)*.6;rz+=Math.sin(s*Math.PI*3)*.14*(1-s);rx-=Math.sin(s*Math.PI)*.2;}
        else if(this.snapAge<HOP+.2)squash+=Math.sin((this.snapAge-HOP)/.2*Math.PI)*.22;
        // A hit: a hard jolt.
        if(this.hitAge<JOLT){const s=this.hitAge/JOLT;x=Math.sin(s*42)*.08*(1-s);rz+=Math.sin(s*31)*.06*(1-s);}
        this.body.position.set(x,y,0);this.body.rotation.set(rx,0,rz);this.body.scale.set(1+squash*.5,1-squash,1+squash*.5);
        // The bar slams over the hinge, bounces, and is cocked back before the trap re-arms.
        let bar=0;
        const t=this.snapAge;
        if(t<SLAM)bar=Math.PI*(t/SLAM)**2;
        else if(t<REARM-COCK)bar=Math.PI-.35*Math.abs(Math.sin((t-SLAM)*20))*Math.exp(-(t-SLAM)*9);
        else if(t<REARM){const s=(t-(REARM-COCK))/COCK;bar=Math.PI*(1-s*s*(3-2*s));}
        const p=this.pieces;
        p.bar.rotation.set(bar,0,damage*.22);
        p.arm.rotation.x=t<REARM-.04?-1.5*Math.min(1,t/.06):0;
        // The cheese jumps on the pedal.
        const hop=t<.45?Math.sin(t/.45*Math.PI):0;
        p.bait.position.y=TRAP_PIVOTS.bait[1]+hop*.55;p.bait.rotation.y=hop*.8;
        // Battered: springs askew, cracks open, corners gone.
        p.springLeft.rotation.x=damage*.5;p.springRight.rotation.x=-damage*.35;
        for(let i=0;i<CRACK_PIECES.length;i++)p[CRACK_PIECES[i]!].visible=damage>=CRACKS[i]!;
        for(let i=0;i<CORNER_PIECES.length;i++)p[CORNER_PIECES[i]!].visible=i>=this.corners;
    }
    /** Pieces fly apart under gravity, bounce on the floor and shrink away before the entry goes. */
    private fly(dt:number):void {
        this.breakAge+=dt;
        if(this.breakAge>=BREAK){this.root.visible=false;return;}
        const f=this.flight,shrink=Math.min(1,(BREAK-this.breakAge)/.2);
        this.body.position.set(0,0,0);this.body.rotation.set(0,0,0);this.body.scale.setScalar(1);
        for(let i=0;i<TRAP_PIECES.length;i++){
            const part=this.pieces[TRAP_PIECES[i]!],o=i*6;
            f[o+1]+=GRAVITY*dt;
            part.position.x+=f[o]*dt;part.position.y+=f[o+1]*dt;part.position.z+=f[o+2]*dt;
            if(part.position.y<.05){part.position.y=.05;f[o+1]=Math.abs(f[o+1])*.3;f[o]*=.6;f[o+2]*=.6;}
            part.rotation.x+=f[o+3]*dt;part.rotation.y+=f[o+4]*dt;part.rotation.z+=f[o+5]*dt;
            part.scale.setScalar(shrink);
        }
    }
}

/** Every placed Mousetrap (`state.traps`), pooled up to `MAX_TRAPS`. A trap set while you watch drops in; one already
 * there when the view starts (a join or a reconnect) is simply there. Disposed with the view. */
export class TrapField {
    /** Raised for each change after the view's first state, for sounds. */
    onEvent?:(event:TrapEvent,p:Vec3Data)=>void;
    private readonly active=new Map<string,TrapVisual>();
    private readonly free:TrapVisual[]=[];
    private templates?:Record<TrapPiece,THREE.Group>;
    private readonly finish:WeaponFinish=weaponFinish();
    private readonly debris:TrapDebris;
    constructor(private readonly parent:THREE.Object3D){this.debris=new TrapDebris(parent);}
    /** The pieces, built once: every trap shares their shapes and finishes. */
    private parts():Record<TrapPiece,THREE.Group> {
        if(this.templates)return this.templates;
        const kits:Partial<Record<TrapPiece,PartKit>>={};
        mousetrap(piece=>{
            let kit=kits[piece];
            if(!kit){kit=new PartKit();const [x,y,z]=TRAP_PIVOTS[piece];kit.frame.makeTranslation(-x,-y,-z);kits[piece]=kit;}
            return kit;
        },this.finish);
        const templates:Partial<Record<TrapPiece,THREE.Group>>={};
        for(const piece of TRAP_PIECES){
            const group=kits[piece]?.build('mousetrap-'+piece)??new THREE.Group();
            group.traverse(part=>{if(part instanceof THREE.Mesh)part.raycast=()=>{};});
            templates[piece]=group;
        }
        return this.templates=templates as Record<TrapPiece,THREE.Group>;
    }
    /** Follow the snapshot's traps; `announce` is false for a view's first state. */
    apply(traps:readonly TrapState[]|undefined,announce:boolean):void {
        for(const [id,visual] of this.active)if(!listed(traps,id)){visual.root.removeFromParent();this.active.delete(id);this.free.push(visual);}
        for(let i=0;i<Math.min(traps?.length??0,MAX_TRAPS);i++){
            const trap=traps![i]!;
            const visual=this.active.get(trap.id);
            if(visual){visual.sync(trap,this.debris,announce?this.onEvent:undefined);continue;}
            const fresh=this.free.pop()??new TrapVisual(this.parts());
            fresh.reset(trap,announce&&trap.brokenAt===undefined);
            this.active.set(trap.id,fresh);this.parent.add(fresh.root);
            if(announce&&trap.brokenAt===undefined)this.onEvent?.('set',trap);
        }
    }
    update(dt:number):void {
        for(const visual of this.active.values())visual.update(dt);
        this.debris.update(dt);
    }
    dispose():void {
        for(const visual of this.active.values())visual.root.removeFromParent();
        this.active.clear();this.free.length=0;
        for(const group of Object.values(this.templates??{}))for(const part of group.children)if(part instanceof THREE.Mesh)part.geometry.dispose();
        for(const material of Object.values(this.finish))material.dispose();
        this.debris.dispose();
    }
}
