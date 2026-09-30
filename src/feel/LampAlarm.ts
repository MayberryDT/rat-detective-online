import * as THREE from 'three';
import {STREET_LAMP_HEIGHT,type StreetLampPosition} from '../shared/streetLampLayout';
import type {Vec3Data} from '../shared/networkProtocol';
import {FEEL} from './feelTuning';
import {freezeStatic} from '../utils/freezeStatic';

const RED=new THREE.Color(1,.09,.04);

/** D2: when a pillar's bell takes the call, every streetlamp flashes red once, the
 * flash sweeping out across the city from the pillar. No lights: an additive
 * red halo on each lamp head and a red pool under it, two instanced draws that
 * exist only while the flash runs. */
export class LampAlarm {
    readonly root=new THREE.Group();
    private readonly lamps:THREE.Vector3[];
    private readonly halos:THREE.InstancedMesh;
    private readonly pools:THREE.InstancedMesh;
    private readonly poolMap:THREE.DataTexture;
    private readonly origin=new THREE.Vector3();
    private readonly colour=new THREE.Color();
    private age=Infinity;
    /** Seconds until the farthest lamp has flashed and faded. */
    private span=0;

    constructor(scene:THREE.Scene,lamps:readonly StreetLampPosition[]){
        this.root.name='dispatch-lamp-alarm';this.root.userData.noNoir=true;this.root.visible=false;
        this.lamps=lamps.map(([x,z])=>new THREE.Vector3(x,STREET_LAMP_HEIGHT+.2,z));
        const data=new Uint8Array(32*32*4);
        for(let y=0;y<32;y++)for(let x=0;x<32;x++){
            const r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),i=(y*32+x)*4;
            data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.max(0,1-r)**2*255);
        }
        this.poolMap=new THREE.DataTexture(data,32,32);this.poolMap.magFilter=THREE.LinearFilter;this.poolMap.needsUpdate=true;
        const glow=(map?:THREE.Texture)=>new THREE.MeshBasicMaterial({map,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
        const count=Math.max(1,this.lamps.length),dummy=new THREE.Object3D();
        this.halos=new THREE.InstancedMesh(new THREE.SphereGeometry(1.1,12,8),glow(),count);
        this.pools=new THREE.InstancedMesh(new THREE.PlaneGeometry(13,13).rotateX(-Math.PI/2),glow(this.poolMap),count);
        this.lamps.forEach((lamp,i)=>{
            dummy.position.copy(lamp);dummy.updateMatrix();this.halos.setMatrixAt(i,dummy.matrix);
            dummy.position.set(lamp.x,.08,lamp.z);dummy.updateMatrix();this.pools.setMatrixAt(i,dummy.matrix);
            this.halos.setColorAt(i,this.colour.setScalar(0));this.pools.setColorAt(i,this.colour);
        });
        for(const mesh of [this.halos,this.pools]){mesh.count=this.lamps.length;mesh.frustumCulled=false;this.root.add(mesh);}
        freezeStatic(this.root);scene.add(this.root);
    }

    /** Start the flash from `at`. */
    flash(at:Vec3Data):void {
        if(!this.lamps.length)return;
        this.origin.set(at.x,0,at.z);this.age=0;this.root.visible=true;
        let far=0;
        for(const lamp of this.lamps)far=Math.max(far,Math.hypot(lamp.x-at.x,lamp.z-at.z));
        this.span=far/FEEL.dispatchShot.params.sweep+1.4;
    }

    update(dt:number):void {
        if(this.age>this.span)return;
        this.age+=dt;
        if(this.age>this.span){this.root.visible=false;return;}
        const sweep=FEEL.dispatchShot.params.sweep;
        for(let i=0;i<this.lamps.length;i++){
            const lamp=this.lamps[i]!,local=this.age-Math.hypot(lamp.x-this.origin.x,lamp.z-this.origin.z)/sweep;
            // A hard snap to red, a short hold, then a fade.
            const level=local<0?0:local<.05?local/.05:local<.2?1:Math.exp(-(local-.2)/.3);
            this.colour.copy(RED).multiplyScalar(level);
            this.halos.setColorAt(i,this.colour);this.pools.setColorAt(i,this.colour.multiplyScalar(.8));
        }
        this.halos.instanceColor!.needsUpdate=true;this.pools.instanceColor!.needsUpdate=true;
    }

    dispose():void {
        this.root.removeFromParent();this.poolMap.dispose();
        for(const mesh of [this.halos,this.pools]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();}
    }
}
