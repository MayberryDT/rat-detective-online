import * as THREE from 'three';
import {FEEL} from './feelTuning';
import {playerPreferences} from '../settings/PlayerPreferences';

/** Explicitly enabled review treatment. Bounded scene-root decorations never enter aim/collision queries. */
export class HeavyCheese {
    private readonly geometry=new THREE.SphereGeometry(1,10,6);
    private readonly slots=Array.from({length:16},()=>{
        const material=new THREE.MeshBasicMaterial({color:0xffd76b,transparent:true,depthWrite:false,toneMapped:false});
        const mesh=new THREE.Mesh(this.geometry,material);mesh.visible=false;mesh.raycast=()=>{};
        return {mesh,material,age:10,life:.18,muzzle:false,target:undefined as THREE.Object3D|undefined,offset:new THREE.Vector3(),size:1};
    });
    private cursor=0;
    private readonly axis=new THREE.Vector3(0,0,1);
    constructor(private readonly scene:THREE.Scene){for(const slot of this.slots)scene.add(slot.mesh);}
    launch(origin:THREE.Vector3,direction:THREE.Vector3):void {this.emit(origin,direction,true);}
    launchWeapon(origin:THREE.Vector3,direction:THREE.Vector3,weapon?:string):void {
        this.launch(origin,direction);
        if(!weapon)return;
        const slot=this.slots[(this.cursor-1)%this.slots.length];
        slot.life=weapon==='laser'?.13:.07;slot.size*=weapon==='laser'?1.25:.7;
    }
    hit(at:THREE.Vector3,normal:THREE.Vector3,target:THREE.Object3D):void {this.emit(at,normal,false,target);}
    private emit(at:THREE.Vector3,normal:THREE.Vector3,muzzle:boolean,target?:THREE.Object3D):void {
        const slot=this.slots[this.cursor++%this.slots.length],p=FEEL.heavyCheese.params;
        slot.age=0;slot.life=muzzle?p.muzzleLife:p.impactLife;slot.muzzle=muzzle;slot.target=target;
        slot.offset.copy(at);if(target)slot.offset.sub(target.position);
        slot.mesh.position.copy(at);slot.mesh.quaternion.setFromUnitVectors(this.axis,normal.clone().normalize());
        slot.size=muzzle?p.muzzleSize:p.impactSize;slot.mesh.visible=true;
    }
    update(dt:number):void {
        const prefs=playerPreferences().current;
        for(const slot of this.slots){
            if(!slot.mesh.visible)continue;
            slot.age+=dt;const t=slot.age/slot.life;
            if(t>=1){slot.mesh.visible=false;slot.target=undefined;continue;}
            if(slot.target)slot.mesh.position.copy(slot.target.position).add(slot.offset);
            const attack=Math.min(1,.45+t*5),release=1-t;
            const size=slot.size*(prefs.reducedMotion?1:attack*(1+.25*Math.sin(t*Math.PI)));
            slot.mesh.scale.set(size,size*.8,slot.muzzle?size*(1.6-t):size*(.18+.22*t));
            slot.material.opacity=(slot.muzzle?prefs.flashStrength:.85)*release;
        }
    }
    clear():void {for(const slot of this.slots){slot.mesh.visible=false;slot.target=undefined;}}
    dispose():void {for(const slot of this.slots){this.scene.remove(slot.mesh);slot.material.dispose();}this.geometry.dispose();}
}
