import * as THREE from 'three';
import {SEWER_MANHOLE,SEWER_PIPE_ENTRANCES,sewerPipeBoxes,sewerPipePoint,type SewerPipeEntrance} from '../shared/sewerLayout';
import { SEWER_TUNNEL_LAMP_DISTANCES } from './SewerLighting';

/** Battered walk-in drain pipe and open drop shaft; collisions live in sewerLayout. */
export class SewerPortals {
    private readonly root=new THREE.Group();
    private readonly geometries=new Set<THREE.BufferGeometry>();
    private readonly materials=new Map<number,THREE.MeshStandardMaterial>();
    private readonly boxGeometry=new THREE.BoxGeometry(1,1,1);
    constructor(private readonly scene:THREE.Scene){
        this.root.name='sewer-pipe-and-open-manhole';this.geometries.add(this.boxGeometry);
        // Every visible panel is the same shape and transform as its shared collider.
        for(const [i,b] of sewerPipeBoxes().entries()){
            this.box(b.x,b.y,b.z,b.w,b.h,b.d,i%7===0?0x534a38:0x354237,b.rx,b.rz);
        }
        for(const entry of SEWER_PIPE_ENTRANCES)this.pipe(entry);
        this.manhole();this.batch();this.scene.add(this.root);
    }
    private pipe(entry:SewerPipeEntrance){
        const horizontal=entry.axis==='x';
        const ringGeo=new THREE.TorusGeometry(entry.radius+.04,.17,6,32,Math.PI);
        if(horizontal)ringGeo.rotateY(-Math.PI/2);
        this.geometries.add(ringGeo);
        for(let distance=0;distance<=entry.length;distance+=2){
            const p=sewerPipePoint(entry,distance);
            this.mesh(ringGeo,distance===0?0x80745b:0x68604b).position.set(p.x,p.floorY+entry.springY,p.z);
            if(distance%6===0)for(let i=0;i<13;i++){
                const angle=i*Math.PI/12;
                const bolt=sewerPipePoint(entry,distance-.10,Math.cos(angle)*entry.radius);
                this.box(bolt.x,bolt.floorY+entry.springY+Math.sin(angle)*entry.radius,bolt.z,.19,.19,.19,0x968167);
            }
        }
        // Welded mouth flange and lamps belong to the pipe itself, without freestanding posts.
        for(const side of [-1,1]){
            const foot=sewerPipePoint(entry,0,side*entry.radius);
            this.box(foot.x,.36,foot.z,horizontal?.5:.82,.9,horizontal?.82:.5,0x68604b);
            const lamp=sewerPipePoint(entry,-.24,side*3.5);
            const light=this.box(lamp.x,3.48,lamp.z,horizontal?.08:.25,.55,horizontal?.25:.08,0xcaa969);
            (light.material as THREE.MeshStandardMaterial).emissiveIntensity=.8;
        }
        for(const distance of SEWER_TUNNEL_LAMP_DISTANCES){
            const p=sewerPipePoint(entry,distance);
            const lamp=this.box(p.x,p.floorY+4.92,p.z,horizontal?.75:.48,.12,horizontal?.48:.75,0x8dbfa5);
            (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity=.8;
        }
        // Long mineral runs and rust streaks sit against the inner wall of each curved throat.
        for(const side of [-1,1])for(let distance=3;distance<entry.length;distance+=4){
            const p=sewerPipePoint(entry,distance,side*4.2);
            this.box(p.x,p.floorY+.72,p.z,horizontal?1.7:.045,.6,horizontal?.045:1.7,
                distance%3?0x253529:0x555337);
        }
    }
    private manhole(){
        const m=SEWER_MANHOLE;
        // Square cast frame follows the exact street cutout; rounded circular throat.
        for(const side of [-1,1]){
            this.box(m.x+side*2.2,.065,m.z,.4,.13,4.8,0x4c5146);
            this.box(m.x,.065,m.z+side*2.2,4,.13,.4,0x4c5146);
            this.box(m.x+side*2.15,-1.5,m.z,.3,3,4.6,0x384236);
            this.box(m.x,-1.5,m.z+side*2.15,4,3,.3,0x384236);
            const lamp=this.box(m.x+side*1.86,-1,m.z,.12,.35,.7,0x8dbfa5);
            (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity=.8;
        }
        const collar=new THREE.Shape();collar.moveTo(-2.4,-2.4);collar.lineTo(2.4,-2.4);collar.lineTo(2.4,2.4);collar.lineTo(-2.4,2.4);collar.closePath();
        const hole=new THREE.Path();hole.absarc(0,0,2.05,0,Math.PI*2,true);collar.holes.push(hole);
        const collarGeometry=new THREE.ShapeGeometry(collar,32);collarGeometry.rotateX(-Math.PI/2);this.geometries.add(collarGeometry);
        this.mesh(collarGeometry,0x5a5d4d).position.set(m.x,.145,m.z);
        const ringGeometry=new THREE.TorusGeometry(2.07,.105,6,28);ringGeometry.rotateX(Math.PI/2);this.geometries.add(ringGeometry);
        for(const y of [.16,-1.35,-2.8])this.mesh(ringGeometry,0x71654b).position.set(m.x,y,m.z);
        // Open cover rests on the pavement beside the shaft, rather than pretending to be a ladder.
        const lid=new THREE.CylinderGeometry(1.99,1.99,.18,32);this.geometries.add(lid);
        this.mesh(lid,0x485047).position.set(m.x+4.5,.11,m.z+.8);
        for(let stripe=-3;stripe<=3;stripe++)this.box(m.x+4.5,.215,m.z+.8+stripe*.4,Math.sqrt(4-(stripe*.4)**2)*1.7,.035,.065,0x252e28);
        for(let i=0;i<12;i++){
            const a=i*Math.PI/6;
            this.box(m.x+Math.cos(a)*2.23,.20,m.z+Math.sin(a)*2.23,.11,.06,.11,0x9b8c62);
        }
        // Mineral runs continue down the shaft without obscuring its opening.
        for(let i=0;i<9;i++){
            const x=m.x-1.75+i*.43,h=.55+(i%4)*.44;
            this.box(x,-h/2-.35,m.z-1.993,.10,h,.018,i%2?0x596446:0x222b21);
        }
    }
    private batch(){
        const groups=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[]}>();
        for(const object of [...this.root.children]){
            const mesh=object as THREE.Mesh, material=mesh.material as THREE.Material;
            mesh.updateMatrix();
            const key=mesh.geometry.uuid+material.uuid;
            let group=groups.get(key);
            if(!group){group={geometry:mesh.geometry,material,matrices:[]};groups.set(key,group);}
            group.matrices.push(mesh.matrix.clone());this.root.remove(mesh);
        }
        for(const group of groups.values()){
            const mesh=new THREE.InstancedMesh(group.geometry,group.material,group.matrices.length);
            group.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();
            mesh.receiveShadow=true;this.root.add(mesh);
        }
    }
    private mesh(geometry:THREE.BufferGeometry,color:number){
        let material=this.materials.get(color);
        if(!material){material=new THREE.MeshStandardMaterial({color,roughness:.93,metalness:.22,emissive:color,emissiveIntensity:.07});this.materials.set(color,material);}
        const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;this.root.add(mesh);return mesh;
    }
    private box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rx=0,rz=0){
        const mesh=this.mesh(this.boxGeometry,color);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.rotation.set(rx,0,rz);return mesh;
    }
    dispose(){this.scene.remove(this.root);for(const g of this.geometries)g.dispose();for(const m of this.materials.values())m.dispose();}
}
