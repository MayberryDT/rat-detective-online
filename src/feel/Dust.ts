import * as THREE from 'three';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';
import {freezeStatic} from '../utils/freezeStatic';

const PUFFS=48;

/** Polish 16: soft dust puffs on hard landings, skids and launches. One pooled
 * instanced draw; cosmetic only. The game registers one scene-wide instance. */
export class Dust {
    private geometry?:THREE.IcosahedronGeometry;
    private material?:THREE.MeshStandardMaterial;
    private mesh?:THREE.InstancedMesh;
    private readonly puffs=Array.from({length:PUFFS},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:Infinity,life:1,size:1}));
    private cursor=0;
    private active=false;
    private readonly dummy=new THREE.Object3D();

    constructor(private readonly scene:THREE.Scene){}

    /** Built on the first puff, so sessions without dust pay nothing. */
    private build():THREE.InstancedMesh {
        if(this.mesh)return this.mesh;
        this.geometry=new THREE.IcosahedronGeometry(1,1);
        this.material=new THREE.MeshStandardMaterial({color:0x6d6474,roughness:1,transparent:true,opacity:.42,depthWrite:false});
        this.mesh=new THREE.InstancedMesh(this.geometry,this.material,PUFFS);
        this.mesh.name='feel-dust';this.mesh.count=0;this.mesh.frustumCulled=false;
        freezeStatic(this.mesh);this.scene.add(this.mesh);
        return this.mesh;
    }

    /** A ring of puffs at a rat's feet; `strength` 0…1 scales count, spread and size. */
    puff(at:THREE.Vector3,strength:number):void {
        if(!feelState().on('movement'))return;
        this.build();
        const s=Math.max(.2,Math.min(1,strength)),count=Math.round(4+s*FEEL.movement.params.dust);
        const phase=this.cursor*2.39996;
        for(let i=0;i<count;i++){
            const puff=this.puffs[this.cursor++%PUFFS]!,angle=phase+i*Math.PI*2/count,speed=1.5+s*3.5;
            puff.position.set(at.x+Math.cos(angle)*.3,at.y+.12,at.z+Math.sin(angle)*.3);
            puff.velocity.set(Math.cos(angle)*speed,.8+s*.9,Math.sin(angle)*speed);
            puff.age=0;puff.life=.45+s*.35;puff.size=.14+s*.2;
        }
        this.active=true;
    }

    /** A muzzle cough of smoke drifting forward along `direction`. */
    smoke(at:THREE.Vector3,direction:THREE.Vector3,strength:number):void {
        this.build();
        const count=Math.round(3+strength*5);
        for(let i=0;i<count;i++){
            const puff=this.puffs[this.cursor++%PUFFS]!,spread=.6+Math.random()*.8;
            puff.position.copy(at);
            puff.velocity.copy(direction).multiplyScalar(2+Math.random()*3*strength).add({x:(Math.random()-.5)*spread,y:.6+Math.random()*.8,z:(Math.random()-.5)*spread});
            puff.age=0;puff.life=.6+Math.random()*.5;puff.size=.1+strength*.14;
        }
        this.active=true;
    }

    update(dt:number):void {
        if(!this.active||!this.mesh)return;
        let count=0;
        for(let slot=0;slot<PUFFS;slot++){
            const puff=this.puffs[(this.cursor+slot)%PUFFS]!;
            if((puff.age+=dt)>=puff.life)continue;
            puff.velocity.multiplyScalar(Math.exp(-5*dt));puff.velocity.y-=dt*.6;
            puff.position.addScaledVector(puff.velocity,dt);
            const t=puff.age/puff.life;
            this.dummy.position.copy(puff.position);
            this.dummy.scale.setScalar(puff.size*(.6+1.4*t)*(1-t*t));
            this.dummy.updateMatrix();this.mesh.setMatrixAt(count++,this.dummy.matrix);
        }
        this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
        this.active=count>0;
    }

    clear():void {for(const puff of this.puffs)puff.age=Infinity;if(this.mesh)this.mesh.count=0;this.active=false;}

    dispose():void {this.mesh?.removeFromParent();this.mesh?.dispose();this.geometry?.dispose();this.material?.dispose();}
}

let registered:Dust|undefined;
/** Scene-wide dust used by every rat's animation events. */
export function registerDust(dust:Dust|undefined):void {registered=dust;}
export function kickDust(at:THREE.Vector3,strength:number):void {registered?.puff(at,strength);}
/** Bad Ammunition muzzle smoke. */
export function muzzleSmoke(at:THREE.Vector3,direction:THREE.Vector3,strength:number):void {registered?.smoke(at,direction,strength);}
