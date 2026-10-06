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
    private readonly ringGeometry=new THREE.TorusGeometry(1,.13,5,18);
    private readonly accents=Array.from({length:12},()=>{const material=new THREE.MeshBasicMaterial({color:0xffd76b,transparent:true,depthWrite:false,toneMapped:false});const mesh=new THREE.Mesh(this.ringGeometry,material);mesh.visible=false;mesh.raycast=()=>{};return {mesh,material,age:10,life:.2,size:.1,origin:new THREE.Vector3(),direction:new THREE.Vector3()};});
    private accentCursor=0;
    private weaponAge=10;
    private weaponKind?:string;
    private pulse=0;
    private pickupAge=10;
    private pickupKind?:string;
    private saved?:{model:THREE.Object3D;position:THREE.Vector3;rotation:THREE.Euler};
    private cursor=0;
    private readonly axis=new THREE.Vector3(0,0,1);
    constructor(private readonly scene:THREE.Scene){for(const slot of this.slots)scene.add(slot.mesh);for(const a of this.accents)scene.add(a.mesh);}
    launch(origin:THREE.Vector3,direction:THREE.Vector3):void {this.emit(origin,direction,true);}
    launchWeapon(origin:THREE.Vector3,direction:THREE.Vector3,weapon?:string):void {
        this.launch(origin,direction);
        if(!weapon)return;
        const slot=this.slots[(this.cursor-1)%this.slots.length];
        slot.life=weapon==='laser'?.14:.065;slot.size*=weapon==='laser'?1.3:.8;
        this.weaponAge=0;this.weaponKind=weapon;this.pulse++;
        const a=this.accents[this.accentCursor++%this.accents.length];a.age=0;a.life=weapon==='laser'?.22:.065;a.size=weapon==='laser'?.15:.095;a.origin.copy(origin);a.direction.copy(direction);a.mesh.quaternion.setFromUnitVectors(this.axis,direction);a.mesh.visible=true;a.material.color.setHex(weapon==='laser'?0xc8f040:0xe8873e);
    }
    pickup(kind:string):void {this.pickupAge=0;this.pickupKind=kind;}
    weaponHit(at:THREE.Vector3,normal:THREE.Vector3,weapon:string):void {
        const a=this.accents[this.accentCursor++%this.accents.length];a.age=0;a.life=weapon==='laser'?.18:.09;a.size=weapon==='laser'?.25:.16;a.origin.copy(at);a.direction.copy(normal);a.mesh.quaternion.setFromUnitVectors(this.axis,normal);a.mesh.visible=true;a.material.color.setHex(weapon==='laser'?0xc8f040:0xe8873e);
    }
    hit(at:THREE.Vector3,normal:THREE.Vector3,target:THREE.Object3D):void {this.emit(at,normal,false,target);}
    private emit(at:THREE.Vector3,normal:THREE.Vector3,muzzle:boolean,target?:THREE.Object3D):void {
        const slot=this.slots[this.cursor++%this.slots.length],p=FEEL.heavyCheese.params;
        slot.age=0;slot.life=muzzle?p.muzzleLife:p.impactLife;slot.muzzle=muzzle;slot.target=target;
        slot.offset.copy(at);if(target)slot.offset.sub(target.position);
        slot.mesh.position.copy(at);slot.mesh.quaternion.setFromUnitVectors(this.axis,normal.clone().normalize());
        slot.size=muzzle?p.muzzleSize:p.impactSize;slot.mesh.visible=true;
    }
    /** Render-only receiver follow-through; restore before any input/raycast/muzzle sampling. */
    beforeRender(rat:THREE.Object3D):void {
        if(playerPreferences().current.reducedMotion)return;
        const picking=this.pickupAge<.35;const kind=picking?this.pickupKind:this.weaponKind;
        if(!kind||(!picking&&this.weaponAge>.3))return;
        const model=rat.getObjectByName('rat-weapon-'+kind);if(!model)return;
        this.saved={model,position:model.position.clone(),rotation:model.rotation.clone()};
        if(picking){const k=Math.sin(this.pickupAge/.35*Math.PI)*(1-this.pickupAge/.35);model.position.y-=k*.12;model.rotation.z+=k*.12;return;}
        const t=this.weaponAge/(this.weaponKind==='laser'?.22:.09),kick=Math.exp(-t*5)*Math.sin(Math.min(1,t*4)*Math.PI*.5);
        model.position.z-=kick*(this.weaponKind==='laser'?.12:.075);
        model.rotation.x-=kick*.08;model.rotation.z+=kick*.025*(this.pulse%2?1:-1);
    }
    afterRender():void {if(this.saved){this.saved.model.position.copy(this.saved.position);this.saved.model.rotation.copy(this.saved.rotation);this.saved=undefined;}}
    update(dt:number):void {
        this.weaponAge+=dt;this.pickupAge+=dt;
        for(const a of this.accents){if(!a.mesh.visible)continue;a.age+=dt;const t=a.age/a.life;if(t>=1){a.mesh.visible=false;continue;}const prefs=playerPreferences().current;
            a.mesh.position.copy(a.origin).addScaledVector(a.direction,prefs.reducedMotion?.08:.08+t*.4);
            const size=a.size*(prefs.reducedMotion?1:1+t*1.2);a.mesh.scale.setScalar(size);a.material.opacity=(1-t)*.65*prefs.flashStrength;
        }
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
    clear():void {this.afterRender();this.weaponAge=this.pickupAge=10;for(const a of this.accents)a.mesh.visible=false;for(const slot of this.slots){slot.mesh.visible=false;slot.target=undefined;}}
    dispose():void {this.afterRender();for(const a of this.accents){this.scene.remove(a.mesh);a.material.dispose();}this.ringGeometry.dispose();for(const slot of this.slots){this.scene.remove(slot.mesh);slot.material.dispose();}this.geometry.dispose();}
}
