import * as THREE from 'three';
import {feelState} from './feelState';
import {FEEL} from './feelTuning';

const PUFFS=40;
export interface BreathSource {id:string;position:THREE.Vector3;facing?:THREE.Quaternion}

/** Juice T3e: cold-night breath. Each rat puffs a small pale cloud every couple
 * of seconds from the muzzle. It's a lit material, so it only shows where the
 * real fixtures light it, and it gives away a rat's head in the shadows. */
export class BreathPuffs {
    private mesh?:THREE.InstancedMesh;
    private readonly puffs=Array.from({length:PUFFS},()=>({position:new THREE.Vector3(),drift:new THREE.Vector3(),age:Infinity}));
    private readonly timers=new Map<string,number>();
    private cursor=0;
    private readonly dummy=new THREE.Object3D();
    private readonly forward=new THREE.Vector3();

    constructor(private readonly scene:THREE.Scene){}

    update(dt:number,sources:readonly BreathSource[]):void {
        if(!(dt>0))return;
        const on=feelState().on('breathPuffs');
        if(on)for(const source of sources){
            let timer=this.timers.get(source.id);
            if(timer===undefined){timer=(source.id.length*.37)%FEEL.breathPuffs.params.interval;}
            timer-=dt;
            if(timer<=0){timer+=FEEL.breathPuffs.params.interval*(.85+((this.cursor*7)%5)/15);this.emit(source);}
            this.timers.set(source.id,timer);
        }
        if(!this.mesh)return;
        let count=0;
        for(const puff of this.puffs){
            if((puff.age+=dt)>=1.4)continue;
            const t=puff.age/1.4;
            this.dummy.position.copy(puff.position).addScaledVector(puff.drift,puff.age);
            this.dummy.scale.setScalar(.06+t*.22);this.dummy.updateMatrix();
            this.mesh.setMatrixAt(count++,this.dummy.matrix);
        }
        this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
        (this.mesh.material as THREE.MeshStandardMaterial).opacity=on?.35:0;
    }

    private emit(source:BreathSource):void {
        if(!this.mesh){
            this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),
                new THREE.MeshStandardMaterial({color:0xe9eef6,roughness:1,transparent:true,opacity:.35,depthWrite:false}),PUFFS);
            this.mesh.name='feel-breath';this.mesh.frustumCulled=false;this.mesh.userData.noNoir=true;this.scene.add(this.mesh);
        }
        this.forward.set(0,0,1);if(source.facing)this.forward.applyQuaternion(source.facing);
        const puff=this.puffs[this.cursor++%PUFFS]!;
        puff.position.copy(source.position).addScaledVector(this.forward,.62);puff.position.y+=1.55;
        puff.drift.copy(this.forward).multiplyScalar(.35).setY(.25);puff.age=0;
    }

    reset():void {for(const puff of this.puffs)puff.age=Infinity;this.timers.clear();if(this.mesh)this.mesh.count=0;}
    dispose():void {this.mesh?.removeFromParent();this.mesh?.geometry.dispose();(this.mesh?.material as THREE.Material|undefined)?.dispose();this.mesh?.dispose();}
}
