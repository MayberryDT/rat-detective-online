import * as THREE from 'three';
import {grayboxBoxes,CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../shared/grayboxLayout';
import {sewerBoxes} from '../shared/sewerLayout';
import type {WorldSpec} from '../shared/worldSpec';

/** Battered curbside stock and sewer deposits, batched by material and shape. */
export class CityGrime {
    private geometry={box:new THREE.BoxGeometry(1,1,1),round:new THREE.CylinderGeometry(.5,.5,1,12),bag:new THREE.IcosahedronGeometry(.5,1)};
    private batches=new Map<string,THREE.Matrix4[]>();
    private meshes:THREE.InstancedMesh[]=[];
    private materials:THREE.Material[]=[];
    private dummy=new THREE.Object3D();
    private drops:THREE.InstancedMesh;
    private dripSites:THREE.Vector3[]=[];
    private time=0;
    constructor(scene:THREE.Scene,spec:WorldSpec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION}){
        const boxes=grayboxBoxes(spec);
        for(const [i,b] of boxes.filter(b=>b.debris).entries()){
            const {x,y,z,w,h,d}=b;
            if(b.debris==='dumpster'){
                this.part('box',0x334236,x,y,z,w,h,d);
                this.part('box',0x192421,x,h+.05,z,w+.12,.16,d+.12);
                this.part('box',0x758071,x,h*.7,z+d/2+.03,w*.38,.21,.035);
                for(const sx of [-1,1]){
                    this.part('box',0x141b20,x+sx*w*.38,.18,z,.28,.3,d*.7);
                    this.part('box',0x765137,x+sx*w*.32,h*.45,z+d/2+.04,.4,.22,.02,0,0,sx*.16);
                }
                for(let dx=-w/2+.3;dx<w/2;dx+=.55)this.part('box',0x465349,x+dx,y,z+d/2+.02,.07,h*.85,.04);
            }else if(b.debris==='crate'){
                this.part('box',0x63513c,x,y,z,w,h,d);
                for(const yy of [.15,.48,.81,1.14])this.part('box',0x30281f,x,yy,z+d/2+.01,w,.025,.02);
                this.part('box',0x958062,x,y,z+d/2+.04,w*.95,.10,.05,0,0,.75);
            }else{
                this.part('round',0x62695f,x,y,z,w,h,d);
                this.part('round',0x28352d,x,h+.06,z,w*1.1,.12,d*1.1);
                for(let angle=0;angle<Math.PI*2;angle+=Math.PI/6)this.part('box',0x3e4942,x+Math.cos(angle)*w*.49,y,z+Math.sin(angle)*d*.49,.045,h*.9,.045);
                this.part('box',0x727b6e,x,h+.14,z,.3,.1,.08);
            }
            // Low litter accumulates around the protected curbside stock, never in doorways.
            for(let j=0;j<5;j++){
                const angle=(i*2.13+j*1.7),r=.7+j*.18;
                const px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r;
                this.part('bag',j%2?0x292d2d:0x403b30,px,.28,pz,.65,.58,.62,0,angle,0);
                this.part('box',0x77715c,px,.57,pz,.1,.12,.08,0,angle,.3);
                this.part('box',0x948b70,px+.38,.035,pz+.2,.38,.018,.26,0,angle,0);
                this.part('bag',0x817241,px-.25,.065,pz-.2,.23,.12,.19);
            }
        }
        const walls=sewerBoxes().filter(b=>b.h>5.5&&b.h<6.5&&(b.w<=1.01||b.d<=1.01));
        for(const [i,wall] of walls.entries()){
            const alongX=wall.w>wall.d,span=alongX?wall.w:wall.d;
            if(span<3)continue;
            // Both faces stay shallow against the existing wall; only the exposed face is seen.
            for(const side of [-1,1]){
                const x=wall.x+(alongX?0:side*.53),z=wall.z+(alongX?side*.53:0);
                this.part('box',0x263b27,x,-6.55,z,alongX?span:.045,.8,alongX?.045:span);
                for(let u=-span/2+1;u<span/2-.5;u+=2.4){
                    const xx=x+(alongX?u:0),zz=z+(alongX?0:u);
                    const length=.8+((i+Math.floor(u*3))%5+5)%5*.31;
                    this.part('box',0x1d2b23,xx,-3.6,zz,alongX?.15:.035,length,alongX?.035:.15);
                    // Broken mortar lines and hairline diagonal cracks.
                    this.part('box',0x111d1b,xx,-4.8,zz,alongX?.025:.035,.9,alongX?.035:.025,0,0,alongX?.32:0);
                    this.part('box',0x151f1c,xx,-4.65,zz,alongX?.65:.035,.028,alongX?.035:.65);
                }
            }
            // Exposed pipes sit just inside both wall faces, not buried in the masonry.
            const length=Math.max(.4,span-.25);
            for(const side of [-1,1]){
                const px=wall.x+(alongX?0:side*.73),pz=wall.z+(alongX?side*.73:0);
                this.part('round',0x3a4b42,px,-1.9,pz,.36,length,.36,alongX?0:Math.PI/2,0,alongX?Math.PI/2:0);
                for(let u=-span/2+.6;u<span/2;u+=3.8){
                    this.part('round',0x79644b,px+(alongX?u:0),-1.9,pz+(alongX?0:u),.54,.12,.54,alongX?0:Math.PI/2,0,alongX?Math.PI/2:0);
                }
            }
        }
        // Puddles and matted waste follow the actual hall floors, with a dry navigation strip.
        for(const [i,floor] of sewerBoxes().filter(b=>b.y< -7&&b.h===1).entries()){
            for(let j=0;j<Math.min(10,Math.ceil((floor.w+floor.d)/12));j++){
                const u=(j+.5)/Math.min(10,Math.ceil((floor.w+floor.d)/12))-.5;
                const x=floor.x+(floor.w>floor.d?u*floor.w:floor.w*.27),z=floor.z+(floor.d>=floor.w?u*floor.d:floor.d*.27);
                this.part('round',0x253c31,x,-6.978,z,1.2+(i+j)%3,.025,.65+(j%2)*.7);
                this.part('bag',0x39452a,x+.48,-6.93,z,.65,.1,.38);
                this.part('box',0x8a8064,x-.4,-6.955,z+.3,.33,.025,.24,0,j,0);
                if(this.dripSites.length<48)this.dripSites.push(new THREE.Vector3(x,-1.1,z));
            }
        }
        for(const [key,matrices] of this.batches){
            const [shape,color]=key.split(':');const tone=Number(color);
            const material=new THREE.MeshStandardMaterial({color:tone,roughness:tone===0x253c31?.25:.95,metalness:shape==='round'?.25:0,emissive:tone,emissiveIntensity:.06});this.materials.push(material);
            const mesh=new THREE.InstancedMesh(this.geometry[shape as keyof CityGrime['geometry']],material,matrices.length);
            matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.receiveShadow=true;scene.add(mesh);this.meshes.push(mesh);
        }
        this.batches.clear();
        const dripMat=new THREE.MeshBasicMaterial({color:0x74978c,transparent:true,opacity:.36});this.materials.push(dripMat);
        this.drops=new THREE.InstancedMesh(this.geometry.bag,dripMat,this.dripSites.length);this.drops.frustumCulled=false;scene.add(this.drops);this.meshes.push(this.drops);this.update(0);
    }
    private part(shape:keyof CityGrime['geometry'],color:number,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0){
        this.dummy.position.set(x,y,z);this.dummy.scale.set(w,h,d);this.dummy.rotation.set(rx,ry,rz);this.dummy.updateMatrix();
        const key=shape+':'+color;if(!this.batches.has(key))this.batches.set(key,[]);this.batches.get(key)!.push(this.dummy.matrix.clone());
    }
    update(dt:number){this.time+=Math.min(dt,.1);this.dripSites.forEach((site,i)=>{
        const phase=(this.time*.23+i*.371)%1;this.dummy.position.copy(site);this.dummy.position.y-=phase*5.8;
        this.dummy.scale.set(.035,.13,.035);this.dummy.rotation.set(0,0,0);this.dummy.updateMatrix();this.drops.setMatrixAt(i,this.dummy.matrix);
    });this.drops.instanceMatrix.needsUpdate=true;}
    dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();}for(const geometry of Object.values(this.geometry))geometry.dispose();for(const material of this.materials)material.dispose();}
}
