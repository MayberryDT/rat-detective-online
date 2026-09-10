import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {PARKED_VEHICLES,VEHICLE_SHAPES,VEHICLE_SCALE,type ParkedVehicle} from '../shared/vehicleLayout';

/** Parked municipal/delivery stock. Primary body volumes match vehicleLayout's cover. */
export class ParkedVehicles {
    private readonly geometry={box:new THREE.BoxGeometry(1,1,1),body:new RoundedBoxGeometry(1,1,1,2,.055),wheel:new THREE.CylinderGeometry(.5,.5,1,16)};
    private readonly groups=new Map<string,{shape:keyof ParkedVehicles['geometry'];color:number;emissive:boolean;matrices:THREE.Matrix4[]}>();
    private readonly meshes:THREE.Mesh[]=[];
    private readonly materials:THREE.Material[]=[];
    private readonly decals:THREE.Texture[]=[];
    private readonly dummy=new THREE.Object3D();
    private readonly root=new THREE.Object3D();
    constructor(private scene:THREE.Scene){
        for(const vehicle of PARKED_VEHICLES)this.build(vehicle);
        for(const group of this.groups.values()){
            const mat=new THREE.MeshStandardMaterial({color:group.color,roughness:.72,metalness:group.shape==='wheel'?.05:.25,emissive:group.emissive?group.color:0,emissiveIntensity:group.emissive?.6:0});
            this.materials.push(mat);
            if(!group.emissive)mat.userData.streetSurface='obstacle';
            const mesh=new THREE.InstancedMesh(this.geometry[group.shape],mat,group.matrices.length);
            group.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
            mesh.computeBoundingSphere();mesh.castShadow=group.shape==='body';mesh.receiveShadow=true;
            scene.add(mesh);this.meshes.push(mesh);
        }
        this.groups.clear();
    }
    private build(v:ParkedVehicle){
        const shape=VEHICLE_SHAPES[v.kind],black=0x181b22,chrome=0x9a9486,glass=0x344b59;
        this.root.position.set(v.x,0,v.z);this.root.rotation.set(0,v.heading*Math.PI/2,0);this.root.scale.setScalar(VEHICLE_SCALE);this.root.updateMatrix();
        const box=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,emissive=false)=>this.part('box',color,x,y,z,w,h,d,0,0,0,emissive);
        for(const p of shape.parts){
            const color=p.role==='chassis'?black:p.role==='cargo'&&v.kind==='reefer'?0x9baba9:v.color;
            this.part('body',color,p.x,p.y,p.z,p.w,p.h,p.d);
            if(p.role==='cab'){
                box(glass,0,p.y+p.h*.18,p.z+p.d/2+.018,p.w*.81,p.h*.38,.025);
                box(chrome,0,p.y+p.h*.18,p.z+p.d/2+.04,.05,p.h*.38,.025);
                for(const side of [-1,1]){
                    box(glass,side*(p.w/2+.018),p.y+p.h*.2,p.z,.025,p.h*.40,p.d*.73);
                    box(chrome,side*(p.w/2+.025),p.y-p.h*.1,p.z-.35,.035,.07,.28);
                    box(black,side*(p.w/2+.10),p.y+p.h*.1,p.z+p.d*.3,.14,.34,.20);
                }
                // Beltline trim, recessed door seams, and small windshield wipers.
                for(const side of [-1,1]){
                    box(chrome,side*(p.w/2+.03),p.y-.04,p.z,.035,.045,p.d*.9);
                    box(black,side*(p.w/2+.025),p.y-.2,p.z-p.d*.38,.02,p.h*.62,.018);
                    box(chrome,side*(p.w/2+.09),p.y-p.h/2+.08,p.z,.20,.07,p.d*.7);
                    this.part('box',black,side*p.w*.22,p.y+p.h*.03,p.z+p.d/2+.055,.025,.27,.025,0,0,side*.55);
                }
                box(v.color,0,p.y+p.h/2+.035,p.z,p.w*.98,.12,p.d*.98);
            }
            if(p.role==='cargo'){
                for(const side of [-1,1]){
                    box(chrome,side*(p.w/2+.02),p.y-p.h/2+.2,p.z,.025,.11,p.d-.15);
                    if(v.kind==='reefer')for(let z=p.z-p.d/2+.35;z<p.z+p.d/2-.1;z+=.55)
                        box(0x687b7c,side*(p.w/2+.025),p.y,z,.04,p.h-.35,.06);
                }
                const rear=p.z-p.d/2-.025;
                box(chrome,0,p.y,rear,.055,p.h-.2,.035);
                for(const side of [-1,1]){
                    box(chrome,side*p.w*.32,p.y,rear-.02,.05,p.h*.78,.04);
                    box(0xa98355,side*.23,p.y-.1,rear-.05,.14,.20,.08);
                    box(0x9d2825,side*p.w*.38,p.y-p.h/2+.28,rear,.22,.19,.06,true);
                }
                if(v.kind==='reefer'){
                    box(0x6a7777,0,p.y+p.h*.3,p.z+p.d/2+.08,1.5,.65,.22);
                    for(const x of [-.5,-.25,0,.25,.5])box(black,x,p.y+p.h*.3,p.z+p.d/2+.20,.055,.5,.04);
                }
            }
            if(p.role==='bed'){
                box(black,0,p.y+p.h/2+.012,p.z,p.w-.3,.03,p.d-.25);
                for(const side of [-1,1])box(v.color,side*(p.w/2-.06),p.y+p.h*.35,p.z,.12,p.h*.65,p.d);
            }
        }
        // Rear bumper, inset plate, amber turn signals and running boards.
        box(chrome,0,.59,-shape.d/2-.045,shape.w*.86,.16,.15);
        box(black,0,.89,-shape.d/2-.06,.55,.24,.035);
        box(0xc0b69a,0,.89,-shape.d/2-.085,.43,.14,.012);
        for(const side of [-1,1]){
            box(0xa13e28,side*shape.w*.37,1.03,-shape.d/2-.045,.24,.18,.035,true);
            box(0xb88948,side*shape.w*.39,1.0,shape.d/2+.06,.17,.12,.05,true);
            box(black,side*shape.w*.44,.43,0,.16,.10,shape.d*.52);
        }
        const nose=shape.d/2+.035;
        box(chrome,0,.62,nose,shape.w*.88,.18,.18);
        box(black,0,1.15,nose+.025,shape.w*.42,.55,.06);
        for(let y=.95;y<1.4;y+=.11)box(chrome,0,y,nose+.06,shape.w*.38,.035,.025);
        for(const side of [-1,1]){
            this.part('wheel',0xe1c990,side*shape.w*.33,1.26,nose+.06,.35,.08,.35,Math.PI/2,0,0,true);
            box(chrome,side*shape.w*.33,1.26,nose,.45,.44,.07);
        }
        for(const wheel of shape.wheels){
            this.part('wheel',black,wheel.x,wheel.y,wheel.z,wheel.radius*2,wheel.width,wheel.radius*2,0,0,Math.PI/2);
            this.part('wheel',chrome,wheel.x+Math.sign(wheel.x)*wheel.width*.51,wheel.y,wheel.z,wheel.radius*.92,.04,wheel.radius*.92,0,0,Math.PI/2);
            // Five recessed wheel bolts distinguish the hubs from flat discs.
            for(let bolt=0;bolt<5;bolt++){
                const angle=bolt*Math.PI*2/5;
                box(black,wheel.x+Math.sign(wheel.x)*(wheel.width*.51+.026),
                    wheel.y+Math.sin(angle)*wheel.radius*.28,wheel.z+Math.cos(angle)*wheel.radius*.28,.018,.055,.055);
            }
            box(v.color,wheel.x,wheel.y+wheel.radius*.86,wheel.z,wheel.width+.1,.13,wheel.radius*1.75);
        }
        const label=v.id.startsWith('icebox')?'ICEBOX\nCOLD STORAGE':v.id.startsWith('records')?'RECORDS BUREAU\nDOCUMENT SERVICE':v.id.startsWith('needleworks')?'NEEDLEWORKS\nGARMENT DELIVERY':v.id.startsWith('pump')?'MUNICIPAL\nWATER WORKS':'';
        if(label)this.lettering(v,label);
    }
    private lettering(v:ParkedVehicle,text:string){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
        const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b1a993';ctx.fillRect(0,0,512,160);ctx.fillStyle='#293038';ctx.textAlign='center';
        text.split('\n').forEach((line,i)=>{ctx.font=i?'25px serif':'bold 34px serif';ctx.fillText(line,256,65+i*50);});
        const texture=new THREE.CanvasTexture(canvas);this.decals.push(texture);
        const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.95});this.materials.push(mat);
        const shape=VEHICLE_SHAPES[v.kind],cargo=shape.parts.find(p=>p.role==='cargo')??shape.parts.find(p=>p.role==='cab')!;
        for(const side of [-1,1]){
            const mesh=new THREE.Mesh(new THREE.PlaneGeometry(v.kind==='pickup'?1.1:2.35,v.kind==='pickup'?.4:.72),mat);
            mesh.position.set(side*(cargo.w/2+.06),cargo.y+.15,cargo.z).multiplyScalar(VEHICLE_SCALE).applyAxisAngle(new THREE.Vector3(0,1,0),v.heading*Math.PI/2).add(new THREE.Vector3(v.x,0,v.z));
            mesh.scale.setScalar(VEHICLE_SCALE);mesh.rotation.y=v.heading*Math.PI/2+side*Math.PI/2;this.scene.add(mesh);this.meshes.push(mesh);
        }
    }
    private part(shape:keyof ParkedVehicles['geometry'],color:number,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0,emissive=false){
        this.dummy.position.set(x,y,z);this.dummy.scale.set(w,h,d);this.dummy.rotation.set(rx,ry,rz);this.dummy.updateMatrix();
        const matrix=new THREE.Matrix4().multiplyMatrices(this.root.matrix,this.dummy.matrix),key=`${shape}:${color}:${emissive}`;
        if(!this.groups.has(key))this.groups.set(key,{shape,color,emissive,matrices:[]});this.groups.get(key)!.matrices.push(matrix);
    }
    dispose(){for(const mesh of this.meshes){this.scene.remove(mesh);if(mesh instanceof THREE.InstancedMesh)mesh.dispose();else mesh.geometry.dispose();}for(const g of Object.values(this.geometry))g.dispose();for(const m of this.materials)m.dispose();for(const t of this.decals)t.dispose();}
}
