import * as THREE from 'three';
import {SAFE,type SafeState} from '../shared/safes';
import {PickupRespawnVisual} from './PickupRespawnVisual';

/** What a safe just did, for sounds: took a hit, cracked open. */
export type SafeEvent='hit'|'crack';
/** Seconds: a hit's rattle, the door swinging open. */
const RATTLE=.22,SWING=.5;
/** Sparks and brass bits off a hit or the crack: one shared pool. */
const BITS=48,BIT_LIFE=.9,GRAVITY=-22;

/** A penthouse safe (`safes.ts`): dark green steel with brass trim, a dial and a handle. It heats as it is shot (the door
 * glows from dull red to orange: how near it is to cracking, readable across a room), rattles at each hit, and cracks
 * with its door swinging wide and a burst of brass; open, a restock dial counts down above it. */
class SafeModel {
    readonly root=new THREE.Group();
    private readonly door=new THREE.Group();
    private readonly doorMaterial:THREE.MeshStandardMaterial;
    private readonly dial:THREE.Mesh;
    private readonly restock=new PickupRespawnVisual('ironclad');
    private hitAt=0;rattle=0;private open=0;private wasOpen=false;
    constructor(parent:THREE.Object3D,materials:{steel:THREE.MeshStandardMaterial;brass:THREE.MeshStandardMaterial;dark:THREE.MeshStandardMaterial}){
        const h=SAFE.half;
        this.root.name='penthouse-safe';
        const body=new THREE.Mesh(new THREE.BoxGeometry(h.x*2,h.y*2,h.z*2),materials.steel);body.position.y=h.y;
        const plinth=new THREE.Mesh(new THREE.BoxGeometry(h.x*2+.12,.12,h.z*2+.12),materials.brass);plinth.position.y=.06;
        const cap=new THREE.Mesh(new THREE.BoxGeometry(h.x*2+.08,.08,h.z*2+.08),materials.brass);cap.position.y=h.y*2+.04;
        // A dark mouth behind the door, seen once it swings open.
        const mouth=new THREE.Mesh(new THREE.BoxGeometry(h.x*1.6,h.y*1.5,.04),materials.dark);mouth.position.set(0,h.y,h.z+.005);
        this.doorMaterial=materials.steel.clone();this.doorMaterial.emissive.setHex(0xff3a10);this.doorMaterial.emissiveIntensity=0;
        // The door hinges on the safe's left front edge (its local −x), facing +z.
        this.door.position.set(-h.x*.82,h.y,h.z+.02);
        const slab=new THREE.Mesh(new THREE.BoxGeometry(h.x*1.64,h.y*1.56,.08),this.doorMaterial);slab.position.x=h.x*.82;
        this.dial=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.06,18).rotateX(Math.PI/2),materials.brass);this.dial.position.set(h.x*.82,h.y*.25,.07);
        const handle=new THREE.Mesh(new THREE.BoxGeometry(.06,.34,.06),materials.brass);handle.position.set(h.x*1.35,-h.y*.2,.08);
        const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,h.y*1.4,8),materials.brass);
        this.door.add(slab,this.dial,handle,hinge);
        // The dial is not turned with the safe: it faces the camera in world space.
        this.restock.root.visible=false;parent.add(this.restock.root);
        this.root.add(body,plinth,cap,mouth,this.door);
        for(const mesh of [body,plinth,cap,mouth,slab,this.dial,handle,hinge]){mesh.castShadow=false;mesh.receiveShadow=true;mesh.raycast=()=>{};}
        parent.add(this.root);
    }
    /** Returns what happened since the last state: a new hit, or the crack. */
    apply(state:SafeState,first:boolean):SafeEvent|undefined {
        this.root.position.set(state.x,state.y,state.z);this.root.rotation.set(0,state.yaw,0);
        const damage=1-state.hp/SAFE.hits,cracked=state.hp<=0;
        // The door heats with damage: nothing at first, a dull red glow by half, orange near the end; open, it is cold.
        this.doorMaterial.emissiveIntensity=cracked||damage<.15?0:(damage-.15)*.28;
        this.doorMaterial.emissive.setHex(damage>.7?0xd0500e:0xa82008);
        this.restock.root.position.set(state.x,state.y+SAFE.half.y*2+1.1,state.z);
        let event:SafeEvent|undefined;
        if(cracked&&!this.wasOpen){if(!first)event='crack';else this.open=1;}
        else if(!cracked&&state.hitAt!==undefined&&state.hitAt!==this.hitAt&&!first)event='hit';
        if(event)this.rattle=RATTLE;
        if(!cracked&&this.wasOpen)this.open=0;
        this.hitAt=state.hitAt??0;this.wasOpen=cracked;
        return event;
    }
    update(dt:number,now:number,at:number|undefined,camera:THREE.Camera):void {
        this.open=this.wasOpen?Math.min(1,this.open+dt/SWING):0;
        // An overshooting swing, then it hangs wide.
        const swing=this.open<1?Math.sin(this.open*Math.PI*.5)*1.15:1;
        this.door.rotation.y=-1.9*Math.min(1.08,swing);
        if(this.rattle>0){this.rattle=Math.max(0,this.rattle-dt);const k=this.rattle/RATTLE;this.root.rotation.z=Math.sin(now*.09)*.05*k;this.dial.rotation.z+=dt*30*k;}
        else this.root.rotation.z=0;
        this.restock.root.visible=this.wasOpen&&at!==undefined;
        if(this.restock.root.visible)this.restock.update(now,at!,camera,SAFE.restockMs);
    }
    dispose():void {this.root.removeFromParent();this.restock.dispose();this.doorMaterial.dispose();
        this.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
}

/** Sparks off a hit and brass off the crack: one instanced draw for every safe. */
class SafeBits {
    readonly mesh:THREE.InstancedMesh;
    private readonly state=new Float32Array(BITS*8);
    private next=0;private alive=0;
    private readonly pose=new THREE.Object3D();
    private readonly tint=new THREE.Color();
    constructor(parent:THREE.Object3D,material:THREE.MeshBasicMaterial){
        this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.09,.09,.09),material,BITS);
        this.mesh.name='safe-bits';this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.count=0;this.mesh.raycast=()=>{};
        for(let i=0;i<BITS;i++){this.state[i*8+6]=BIT_LIFE;this.mesh.setColorAt(i,this.tint.setHex(0xffffff));}
        parent.add(this.mesh);
    }
    burst(at:THREE.Vector3,count:number,speed:number,floor:number,colour:number):void {
        for(let n=0;n<count;n++){
            const i=this.next,o=i*8,a=Math.random()*Math.PI*2,out=speed*(.3+Math.random()*.7);this.next=(this.next+1)%BITS;
            this.state.set([at.x,at.y,at.z,Math.cos(a)*out,speed*(.6+Math.random()),Math.sin(a)*out,0,floor],o);
            this.mesh.setColorAt(i,this.tint.setHex(colour));
        }
        if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
        this.alive=BIT_LIFE;
    }
    update(dt:number):void {
        if(this.alive<=0){this.mesh.visible=false;return;}
        this.alive-=dt;
        let count=0;
        for(let i=0;i<BITS;i++){
            const o=i*8,s=this.state;if(s[o+6]!>=BIT_LIFE)continue;
            s[o+6]=s[o+6]!+dt;s[o+4]=s[o+4]!+GRAVITY*dt;
            s[o]=s[o]!+s[o+3]!*dt;s[o+1]=Math.max(s[o+7]!,s[o+1]!+s[o+4]!*dt);s[o+2]=s[o+2]!+s[o+5]!*dt;
            this.pose.position.set(s[o]!,s[o+1]!,s[o+2]!);this.pose.scale.setScalar(1-s[o+6]!/BIT_LIFE);this.pose.rotation.set(s[o+6]!*9,i,s[o+6]!*7);this.pose.updateMatrix();
            this.mesh.setMatrixAt(count,this.pose.matrix);
            if(count!==i&&this.mesh.instanceColor){this.mesh.getColorAt(i,this.tint);this.mesh.setColorAt(count,this.tint);}
            count++;
        }
        this.mesh.count=count;this.mesh.visible=count>0;this.mesh.instanceMatrix.needsUpdate=true;
        if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
    }
    dispose():void {this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.dispose();}
}

/** Every penthouse safe the room sends. `onEvent` plays the hit's clang and the crack. */
export class SafeField {
    readonly root=new THREE.Group();
    onEvent?:(event:SafeEvent,safe:SafeState)=>void;
    private readonly models=new Map<string,SafeModel>();
    private readonly states=new Map<string,SafeState>();
    private readonly materials={
        steel:new THREE.MeshStandardMaterial({color:0x22302a,metalness:.55,roughness:.42}),
        brass:new THREE.MeshStandardMaterial({color:0xc89a3c,metalness:.8,roughness:.35}),
        dark:new THREE.MeshStandardMaterial({color:0x050505,roughness:1}),
    };
    private readonly bitMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
    private readonly bits:SafeBits;
    private readonly point=new THREE.Vector3();
    constructor(parent:THREE.Object3D){this.root.name='penthouse-safes';parent.add(this.root);this.bits=new SafeBits(this.root,this.bitMaterial);}
    /** `seen`: false for the first state after a welcome (nothing replays). */
    apply(safes:readonly SafeState[]|undefined,seen:boolean):void {
        const live=new Set<string>();
        for(const state of safes??[]){
            live.add(state.id);
            let model=this.models.get(state.id);const first=!seen||!model;
            if(!model){model=new SafeModel(this.root,this.materials);this.models.set(state.id,model);}
            const event=model.apply(state,first);this.states.set(state.id,state);
            if(!event)continue;
            const h=SAFE.half;this.point.set(state.x,state.y+h.y*1.2,state.z);
            if(event==='hit')this.bits.burst(this.point,5,5,state.y,0xffb24a);
            else this.bits.burst(this.point,26,7,state.y,0xffcf66);
            this.onEvent?.(event,state);
        }
        for(const [id,model] of this.models)if(!live.has(id)){model.dispose();this.models.delete(id);this.states.delete(id);}
    }
    update(dt:number,now:number,camera:THREE.Camera):void {
        for(const [id,model] of this.models)model.update(dt,now,this.states.get(id)?.at,camera);
        this.bits.update(dt);
    }
    /** The load's stand-in: a safe, open with its dial, and a burst of bits, so every program links before play. */
    warm(camera:THREE.Camera):void {
        this.apply([{id:'warm',x:0,y:0,z:0,yaw:0,hp:0,n:0,at:SAFE.restockMs}],false);
        this.bits.burst(this.point.set(0,1,0),2,1,0,0xffcf66);this.update(1/60,0,camera);
    }
    clear():void {for(const model of this.models.values())model.dispose();this.models.clear();this.states.clear();}
    dispose():void {this.clear();this.bits.dispose();this.root.removeFromParent();for(const m of Object.values(this.materials))m.dispose();this.bitMaterial.dispose();}
}
