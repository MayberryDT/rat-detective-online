import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import { FINISH_COLORS, GLOWING_FINISHES, pieceQuaternion, type Finish, type KitBuilder, type KitPiece } from '../shared/city/kit/kit';
import { kitCity } from '../shared/city/kit/city';
import { applyFixedIllumination, type FixedLightField } from './FixedLighting';
import { restoreGeometry, type CityBakeRecord } from './CityBakeCache';
import { instanceGeometry } from '../utils/instanceGeometry';

type KitBake=Pick<CityBakeRecord,'kit'|'kitColors'|'signs'>;
interface KitPlan {
    merged:{finish:Finish;shadow:boolean;pieces:KitPiece[]}[];
    batches:{finish:Finish;shape:'box'|'round';shadow:boolean;baked:boolean;pieces:KitPiece[]}[];
}

/** A piece gets baked vertices of its own when it is a surface (a side of LARGE and another of
 * half a unit) or a beam of BEAM or longer; smaller pieces take one light each. */
const LARGE=2,BEAM=8;
function perVertex(p:KitPiece):boolean {
    const long=Math.max(p.w,p.h,p.d),short=Math.min(p.w,p.h,p.d),mid=p.w+p.h+p.d-long-short;
    return long>=BEAM||long>=LARGE&&mid>=.5;
}
/** Bake resolution of a lit surface, in units per segment (as the graybox bake). */
const SEGMENT=3;
/** Light (summed channels) below which a piece needs no inner vertices. */
const FAINT=.006;
/** Where a surface is probed before it is cut up: its centre and eight corners (unit space). */
const PROBES=[new THREE.Vector3(),...[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>new THREE.Vector3(x,y,z))))];
/** Painted signs show the baked light that falls on them, a little stronger than bare masonry. */
const SIGN_LIGHT=2.6;

/** How a finish takes the baked light: in its own hue (a green container stays green under a
 * sodium lamp), dark finishes a little less than pale ones. */
function bakeTint(finish:Finish,out:THREE.Color):THREE.Color {
    const c=out.setHex(FINISH_COLORS[finish]),top=Math.max(c.r,c.g,c.b,1e-4);
    const gain=Math.min(1.1,.75+2*(.2126*c.r+.7152*c.g+.0722*c.b));
    return c.setRGB((.45+.55*c.r/top)*gain,(.45+.55*c.g/top)*gain,(.45+.55*c.b/top)*gain);
}

/** Draws the kit city's look with the fixed-illumination bake, one merged mesh per finish and
 * shadow role: surfaces and beams with light per vertex, small boxes with one light each.
 * Small round fittings (bars, posts) are instanced with one light each; glowing panes are
 * instanced and unbaked; signs are flat canvases. No bodies (the colliders come from the
 * graybox boxes). */
export class KitArchitecture {
    private readonly box=new THREE.BoxGeometry(1,1,1);
    private readonly round=new THREE.CylinderGeometry(.5,.5,1,14);
    private readonly meshes:THREE.Mesh[]=[];
    private readonly geometries:THREE.BufferGeometry[]=[];
    /** Per finish, plain meshes then instanced ones: a material drawn both ways makes three reselect its program every frame. */
    private readonly materials=[new Map<Finish,THREE.MeshStandardMaterial>(),new Map<Finish,THREE.MeshStandardMaterial>()];
    private readonly extra:THREE.Material[]=[];
    private readonly signs:THREE.Mesh[]=[];
    private readonly textures:THREE.Texture[]=[];
    private readonly flickers:Array<{mesh:THREE.InstancedMesh;index:number;period:number;offset:number}>=[];
    private readonly tint=new THREE.Color();
    private time=0;
    private planned?:KitPlan;
    /** What a full build baked (merged geometries, per-instance and sign light), for the bake cache. */
    private baked?:{merged:THREE.BufferGeometry[];colors:Float32Array[];signs:Float64Array};
    constructor(private readonly scene:THREE.Scene,private readonly city:KitBuilder=kitCity()){}
    /** Pieces by draw: merged baked groups and instanced batches, in build order. */
    private plan():KitPlan {
        if(this.planned)return this.planned;
        const merged=new Map<string,KitPlan['merged'][number]>(),batches=new Map<string,KitPlan['batches'][number]>();
        for(const p of this.city.pieces){
            const baked=!p.flicker&&!GLOWING_FINISHES.has(p.finish),own=baked&&perVertex(p);
            // Glowing panes and small round fittings (bars, posts, bolts) stay instanced.
            if(!baked||!own&&p.shape==='round'){
                const key=`${p.finish}:${p.shape}:${p.castShadow?1:0}`;
                let batch=batches.get(key);
                if(!batch){batch={finish:p.finish,shape:p.shape,shadow:!!p.castShadow,baked:true,pieces:[]};batches.set(key,batch);}
                batch.pieces.push(p);continue;
            }
            const key=`${p.finish}:${p.castShadow?1:0}`;
            let group=merged.get(key);
            if(!group){group={finish:p.finish,shadow:!!p.castShadow,pieces:[]};merged.set(key,group);}
            group.pieces.push(p);
        }
        for(const batch of batches.values())batch.baked=!batch.pieces.some(p=>p.flicker)&&!GLOWING_FINISHES.has(batch.finish);
        return this.planned={merged:[...merged.values()],batches:[...batches.values()]};
    }
    /** The draws this build makes, as the bake cache checks a record against them. */
    shape():{kitMerged:string[];kitBatches:string[];signs:number} {
        const {merged,batches}=this.plan();
        return {kitMerged:merged.map(g=>`${g.finish}:${g.shadow?1:0}:${g.pieces.length}`),
            kitBatches:batches.map(b=>`${b.finish}:${b.shape}:${b.shadow?1:0}:${b.pieces.length}:${b.baked?1:0}`),signs:this.city.signs.length};
    }
    /** What the full build baked; undefined after a build from the cache. */
    bakeOutput():{merged:readonly THREE.BufferGeometry[];colors:readonly Float32Array[];signs:Float64Array}|undefined {return this.baked;}
    /** Build the look, baking `field` into every piece that does not glow, or taking the light
     * from `cached` (a record already checked against `shape()`). */
    *build(field:FixedLightField,cached?:KitBake):Generator<void> {
        const {merged,batches}=this.plan();
        const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion();
        const bounds=new THREE.Box3(),unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));
        const point=new THREE.Vector3(),normal=new THREE.Vector3(),light=new THREE.Color(),surface=new THREE.Color();
        const place=(p:KitPiece)=>{
            const q=pieceQuaternion(p);
            return matrix.compose(position.set(p.x,p.y,p.z),quaternion.set(q.x,q.y,q.z,q.w),scale.set(p.w,p.h,p.d));
        };
        const baked=cached?undefined:{merged:[] as THREE.BufferGeometry[],colors:[] as Float32Array[],signs:new Float64Array(this.city.signs.length*3)};
        let work=0;
        for(const [g,group] of merged.entries()){
            let geometry:THREE.BufferGeometry;
            if(cached)geometry=restoreGeometry(cached.kit[g]);
            else{
                const parts:THREE.BufferGeometry[]=[];
                for(const p of group.pieces){
                    bounds.copy(unit).applyMatrix4(place(p));bakeTint(p.finish,surface);
                    const sources=field.near(bounds),rooms=field.roomsNear(bounds);
                    let part:THREE.BufferGeometry;
                    if(perVertex(p)){
                        // Surfaces and beams: real vertices every SEGMENT units where a pool falls on
                        // them; a dim or evenly lit piece keeps its corners, which carry the gradient.
                        let lo=Infinity,hi=0;
                        const probe=(at:THREE.Vector3)=>{const c=field.sample(at,null,sources,rooms,light,surface),s=c.r+c.g+c.b;lo=Math.min(lo,s);hi=Math.max(hi,s);};
                        if(sources.length){
                            for(const corner of PROBES)probe(point.copy(corner).applyMatrix4(matrix));
                            for(const source of sources)probe(bounds.clampPoint(source.position,point));
                        }
                        const lit=hi>=FAINT&&hi-lo>=FAINT;
                        const segments=(size:number)=>lit?Math.max(1,Math.ceil(size/SEGMENT)):1;
                        part=p.shape==='round'?new THREE.CylinderGeometry(.5,.5,1,14,segments(p.h))
                            :new THREE.BoxGeometry(1,1,1,segments(p.w),segments(p.h),segments(p.d));
                        part.deleteAttribute('uv');part.applyMatrix4(matrix);
                        const vertices=part.getAttribute('position'),normals=part.getAttribute('normal');
                        const colors=new Float32Array(vertices.count*3);
                        for(let i=0;i<vertices.count;i++)
                            field.sample(point.fromBufferAttribute(vertices,i),normal.fromBufferAttribute(normals,i),sources,rooms,light,surface).toArray(colors,i*3);
                        part.setAttribute('fixedIllumination',new THREE.BufferAttribute(colors,3));
                    }else{
                        // Small boxes (fittings, planks, setts): one light at the centre, merged with the
                        // rest of their finish so a finish costs one draw, not two.
                        part=new THREE.BufferGeometry().setIndex(this.box.index);
                        part.setAttribute('position',this.box.getAttribute('position').clone());
                        part.setAttribute('normal',this.box.getAttribute('normal').clone());
                        part.applyMatrix4(matrix);
                        field.sample(point.set(p.x,p.y,p.z),null,sources,rooms,light,surface);
                        const colors=new Float32Array(24*3);
                        for(let i=0;i<24;i++)light.toArray(colors,i*3);
                        part.setAttribute('fixedIllumination',new THREE.BufferAttribute(colors,3));
                    }
                    parts.push(part);
                    if(++work%48===0)yield;
                }
                geometry=mergeGeometries(parts,false)!;
                for(const part of parts)part.dispose();
                baked!.merged.push(geometry);
            }
            const mesh=new THREE.Mesh(geometry,this.material(group.finish,false,false));
            mesh.castShadow=group.shadow;mesh.raycast=()=>{};
            this.add(mesh,`kit-${group.finish}-baked`);
            yield;
        }
        for(const [b,batch] of batches.entries()){
            const flicker=batch.pieces.some(p=>p.flicker),base=batch.shape==='round'?this.round:this.box;
            const geometry=batch.baked?new THREE.BufferGeometry():instanceGeometry(base);
            if(batch.baked){
                // The unit shape's buffers, plus one steady light per instance.
                geometry.setIndex(base.index);
                geometry.setAttribute('position',base.getAttribute('position'));geometry.setAttribute('normal',base.getAttribute('normal'));
                this.geometries.push(geometry);
            }
            const mesh=new THREE.InstancedMesh(geometry,this.material(batch.finish,flicker,true),batch.pieces.length);
            const colors=batch.baked?cached?.kitColors[b]??new Float32Array(batch.pieces.length*3):new Float32Array(0);
            bakeTint(batch.finish,surface);
            batch.pieces.forEach((p,i)=>{
                mesh.setMatrixAt(i,place(p));
                if(batch.baked&&!cached){
                    bounds.copy(unit).applyMatrix4(matrix);
                    field.sample(point.set(p.x,p.y,p.z),null,field.near(bounds),field.roomsNear(bounds),light,surface).toArray(colors,i*3);
                }
                if(p.flicker){
                    const hash=Math.abs(Math.round(p.x*31+p.y*17+p.z*13));
                    this.flickers.push({mesh,index:i,period:18+hash%25,offset:hash%47});
                }
            });
            baked?.colors.push(colors);
            if(batch.baked)geometry.setAttribute('fixedIllumination',new THREE.InstancedBufferAttribute(colors,3));
            if(flicker)for(let i=0;i<batch.pieces.length;i++)mesh.setColorAt(i,this.tint.setRGB(1,1,1));
            mesh.computeBoundingSphere();mesh.castShadow=batch.shadow;
            this.add(mesh,`kit-${batch.finish}-${batch.shape}`);
            if(++work%8===0)yield;
        }
        for(const [i,s] of this.city.signs.entries()){
            const yaw=s.ry,n=normal.set(Math.sin(yaw),0,Math.cos(yaw));
            if(cached)light.fromArray(cached.signs,i*3);
            else{
                bounds.setFromCenterAndSize(point.set(s.x,s.y,s.z),position.set(s.w,s.h,s.w));
                field.sample(point.set(s.x,s.y,s.z).addScaledVector(n,.05),n,field.near(bounds),field.roomsNear(bounds),light).toArray(baked!.signs,i*3);
            }
            this.sign(s.lines,s.x,s.y,s.z,s.w,s.h,yaw,s.bg,s.fg,!!s.glow,light);
        }
        this.baked=baked;
    }
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
    private add(mesh:THREE.Mesh,name:string):void {
        mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();mesh.name=name;
        this.scene.add(mesh);this.meshes.push(mesh);
    }
    private material(finish:Finish,flicker:boolean,instanced:boolean):THREE.MeshStandardMaterial {
        const materials=this.materials[+instanced]!,shared=flicker?undefined:materials.get(finish);if(shared)return shared;
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
            return material;
        }
        if(!glowing)applyFixedIllumination(material);
        materials.set(finish,material);
        return material;
    }
    private sign(lines:string[],x:number,y:number,z:number,w:number,h:number,yaw:number,bg:string,ink:string,glow:boolean,light:THREE.Color){
        if(typeof document==='undefined')return;
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(128,Math.round(1024*h/w/64)*64);
        const ctx=canvas.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.font=`bold ${Math.min(Math.round(canvas.height*.62/lines.length),170)}px Georgia,serif`;
        if(glow){ctx.shadowColor=ink;ctx.shadowBlur=18;}
        lines.forEach((line,i)=>ctx.fillText(line,512,(i+.5)*canvas.height/lines.length,980));
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.push(texture);
        // A painted sign shows the steady light that falls on it (plus a faint floor); a neon sign glows.
        const emissive=glow?new THREE.Color(0xffffff):new THREE.Color(light.r*SIGN_LIGHT+.012,light.g*SIGN_LIGHT+.01,light.b*SIGN_LIGHT+.008);
        const material=new THREE.MeshStandardMaterial({map:texture,roughness:.95,emissive,emissiveMap:texture,emissiveIntensity:glow?.9*AUTHORED_LIGHT_GAIN:1});
        this.extra.push(material);
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.rotation.y=yaw;
        mesh.matrixAutoUpdate=false;mesh.updateMatrix();
        this.scene.add(mesh);this.signs.push(mesh);
    }
    dispose():void {
        for(const mesh of this.meshes){
            this.scene.remove(mesh);
            if(mesh instanceof THREE.InstancedMesh)mesh.dispose();
            else mesh.geometry.dispose();
        }
        for(const geometry of this.geometries)geometry.dispose();
        for(const sign of this.signs){this.scene.remove(sign);sign.geometry.dispose();}
        for(const t of this.textures)t.dispose();
        for(const m of [...this.materials[0]!.values(),...this.materials[1]!.values(),...this.extra])m.dispose();
        this.box.dispose();this.round.dispose();
    }
}
