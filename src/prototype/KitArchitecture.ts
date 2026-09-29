import * as THREE from 'three';
import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import { FINISH_COLORS, GLOWING_FINISHES, pieceQuaternion, type Finish, type KitBuilder } from '../shared/city/kit/kit';
import { kitCity } from '../shared/city/kit/city';

/** Draws the kit city's look: one instanced mesh per finish, shape and shadow role,
 * one shared material per finish, and flat canvas signs. No bodies (the colliders
 * come from the graybox boxes). */
export class KitArchitecture {
    private readonly box=new THREE.BoxGeometry(1,1,1);
    private readonly round=new THREE.CylinderGeometry(.5,.5,1,14);
    private readonly meshes:THREE.InstancedMesh[]=[];
    private readonly materials=new Map<Finish,THREE.MeshStandardMaterial>();
    private readonly extra:THREE.Material[]=[];
    private readonly signs:THREE.Mesh[]=[];
    private readonly textures:THREE.Texture[]=[];
    private readonly flickers:Array<{mesh:THREE.InstancedMesh;index:number;period:number;offset:number}>=[];
    private readonly tint=new THREE.Color();
    private time=0;
    constructor(private readonly scene:THREE.Scene,city:KitBuilder=kitCity()){
        const batches=new Map<string,{finish:Finish;shape:'box'|'round';shadow:boolean;matrices:THREE.Matrix4[];flicker:number[]}>();
        const position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion();
        for(const p of city.pieces){
            const key=`${p.finish}:${p.shape}:${p.castShadow?1:0}`;
            let batch=batches.get(key);
            if(!batch){batch={finish:p.finish,shape:p.shape,shadow:!!p.castShadow,matrices:[],flicker:[]};batches.set(key,batch);}
            const q=pieceQuaternion(p);quaternion.set(q.x,q.y,q.z,q.w);
            if(p.flicker)batch.flicker.push(batch.matrices.length);
            batch.matrices.push(new THREE.Matrix4().compose(position.set(p.x,p.y,p.z),quaternion,scale.set(p.w,p.h,p.d)));
        }
        for(const batch of batches.values()){
            const material=this.material(batch.finish,batch.flicker.length>0);
            const mesh=new THREE.InstancedMesh(batch.shape==='round'?this.round:this.box,material,batch.matrices.length);
            batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
            if(batch.flicker.length){
                for(let i=0;i<batch.matrices.length;i++)mesh.setColorAt(i,this.tint.setRGB(1,1,1));
                for(const index of batch.flicker){
                    const e=batch.matrices[index]!.elements,hash=Math.abs(Math.round(e[12]*31+e[13]*17+e[14]*13));
                    this.flickers.push({mesh,index,period:18+hash%25,offset:hash%47});
                }
            }
            mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=batch.shadow;
            mesh.matrixAutoUpdate=false;mesh.updateMatrix();
            mesh.name=`kit-${batch.finish}-${batch.shape}`;
            scene.add(mesh);this.meshes.push(mesh);
        }
        for(const s of city.signs)this.sign(s.lines,s.x,s.y,s.z,s.w,s.h,s.ry,s.bg,s.fg,!!s.glow);
    }
    /** Pieces carry no aim or collision; only the graybox colliders do. */
    get objects():readonly THREE.Object3D[] {return [...this.meshes,...this.signs];}
    update(dt:number):void {
        this.time+=Math.min(dt,.1);
        for(const w of this.flickers){
            const phase=(this.time+w.offset)%w.period;
            const fade=THREE.MathUtils.smoothstep(phase,0,2)*(1-THREE.MathUtils.smoothstep(phase,7,9));
            const level=1-fade*.88;
            w.mesh.setColorAt(w.index,this.tint.setRGB(level,level,level));
            w.mesh.instanceColor!.needsUpdate=true;
        }
    }
    private material(finish:Finish,flicker:boolean):THREE.MeshStandardMaterial {
        const key=flicker?undefined:this.materials.get(finish);if(key)return key;
        const color=FINISH_COLORS[finish],glowing=GLOWING_FINISHES.has(finish);
        const material=new THREE.MeshStandardMaterial({color,roughness:finish==='hull'||finish==='steel'?.6:.86,
            metalness:finish==='brass'||finish==='crane'||finish==='steel'?.45:.05,
            emissive:glowing?color:0,emissiveIntensity:glowing?.65*AUTHORED_LIGHT_GAIN:0});
        if(finish==='concrete'||finish==='asphalt'||finish==='timber'||finish==='deck')material.userData.streetSurface='ground';
        else if(finish==='curb')material.userData.streetSurface='curb';
        if(flicker){
            material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor;\n#endif');};
            material.customProgramCacheKey=()=>'kit-flicker-window-v1';
            this.extra.push(material);
        }else this.materials.set(finish,material);
        return material;
    }
    private sign(lines:string[],x:number,y:number,z:number,w:number,h:number,yaw:number,bg:string,ink:string,glow:boolean){
        if(typeof document==='undefined')return;
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(128,Math.round(1024*h/w/64)*64);
        const ctx=canvas.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.font=`bold ${Math.min(Math.round(canvas.height*.62/lines.length),170)}px Georgia,serif`;
        if(glow){ctx.shadowColor=ink;ctx.shadowBlur=18;}
        lines.forEach((line,i)=>ctx.fillText(line,512,(i+.5)*canvas.height/lines.length,980));
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.push(texture);
        const material=new THREE.MeshStandardMaterial({map:texture,roughness:.95,emissive:glow?0xffffff:0x332b1c,emissiveMap:glow?texture:null,emissiveIntensity:glow?.9*AUTHORED_LIGHT_GAIN:.08});
        this.extra.push(material);
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;
        mesh.matrixAutoUpdate=false;mesh.updateMatrix();
        this.scene.add(mesh);this.signs.push(mesh);
    }
    dispose():void {
        for(const mesh of this.meshes){this.scene.remove(mesh);mesh.dispose();}
        for(const sign of this.signs){this.scene.remove(sign);sign.geometry.dispose();}
        for(const t of this.textures)t.dispose();
        for(const m of [...this.materials.values(),...this.extra])m.dispose();
        this.box.dispose();this.round.dispose();
    }
}
