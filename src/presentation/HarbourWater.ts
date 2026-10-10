import * as THREE from 'three';
import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import type { KitBuilder, KitWater } from '../shared/city/kit/kit';
import { QUAY_EDGE_Z } from '../shared/city/kit/northPlan';
import { DOCKS_WATERLINE, LIGHTHOUSE } from '../shared/city/kit/parts/docks';

/** A light that leaves a broken reflection on the water (a lamp, a porthole, the beacon). */
export interface WaterGlint { x:number; z:number; color:number; strength?:number }
/** A line of foam where the water slaps a hard edge (the quay face, a hull, a pier). */
export interface WaterFoam { x0:number; z0:number; x1:number; z1:number }

const NORMAL_SIZE = 128, TILE = 7, EMISSIVE_PX_PER_UNIT = 6;

/**
 * The harbour's surface: one dark plane per water rectangle, one standard material (one
 * shader program) with a tiling ripple normal map that drifts, so the four actor spots and
 * the moon leave moving highlights. Lamp glints and the foam line are painted once into an
 * emissive map: steady reflections that cost no lights.
 */
export class HarbourWater {
    private readonly meshes:THREE.Mesh[]=[];
    private readonly materials:THREE.MeshStandardMaterial[]=[];
    private readonly textures:THREE.Texture[]=[];
    private readonly geometry=new THREE.PlaneGeometry(1,1);
    private time=0;
    constructor(private readonly scene:THREE.Scene,water:readonly KitWater[],glints:readonly WaterGlint[],foam:readonly WaterFoam[]){
        if(!water.length)return;
        const normal=rippleNormals();this.textures.push(normal);
        for(const w of water){
            const width=w.xmax-w.xmin,depth=w.zmax-w.zmin;
            const map=normal.clone();map.repeat.set(width/TILE,depth/TILE);map.needsUpdate=true;this.textures.push(map);
            const emissive=typeof document==='undefined'?null:paintReflections(w,glints,foam);
            if(emissive)this.textures.push(emissive);
            const material=new THREE.MeshStandardMaterial({color:0x070b10,roughness:.3,metalness:.35,normalMap:map,normalScale:new THREE.Vector2(.55,.55),
                emissive:emissive?0xffffff:0,emissiveMap:emissive,emissiveIntensity:.85*AUTHORED_LIGHT_GAIN});
            material.name='harbour-water';
            this.materials.push(material);
            const mesh=new THREE.Mesh(this.geometry,material);
            mesh.name='harbour-water';mesh.rotation.x=-Math.PI/2;mesh.scale.set(width,depth,1);
            mesh.position.set((w.xmin+w.xmax)/2,w.y,(w.zmin+w.zmax)/2);
            mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
            // Water is not a wall: never an aim or camera target.
            mesh.raycast=()=>{};
            scene.add(mesh);this.meshes.push(mesh);
        }
    }
    get objects():readonly THREE.Object3D[] {return this.meshes;}
    /** Drift the ripples slowly across the tide (no allocation). */
    update(dt:number):void {
        this.time+=Math.min(dt,.1);
        const t=this.time;
        for(const m of this.materials){
            const map=m.normalMap!;
            map.offset.set(t*.011+Math.sin(t*.13)*.02,t*.017);
            m.emissiveIntensity=(.8+.08*Math.sin(t*1.7)+.05*Math.sin(t*3.1))*AUTHORED_LIGHT_GAIN;
        }
    }
    dispose():void {
        for(const mesh of this.meshes)this.scene.remove(mesh);
        this.meshes.length=0;
        for(const m of this.materials)m.dispose();
        for(const t of this.textures)t.dispose();
        this.geometry.dispose();
    }
}

/** The kit city's harbour: lamps and floodlights near the water glint in it; the quay face and the docks' hard edges foam. */
export function cityHarbourWater(scene:THREE.Scene,city:KitBuilder):HarbourWater {
    const near=QUAY_EDGE_Z+14;
    const glints:WaterGlint[]=[
        ...city.lamps.filter(([,z])=>z<near).map(([x,z])=>({x,z,color:0xffcf96})),
        ...city.fixtures.filter(f=>!f.room&&f.z<near).map(f=>({x:f.x,z:f.z,color:f.color,strength:.7})),
        {x:LIGHTHOUSE.x,z:LIGHTHOUSE.z,color:0xfff0c8,strength:1.4},
    ];
    const foam:WaterFoam[]=[...city.water.map(w=>({x0:w.xmin,z0:QUAY_EDGE_Z-1.05,x1:w.xmax,z1:QUAY_EDGE_Z-1.05})),...DOCKS_WATERLINE];
    return new HarbourWater(scene,city.water,glints,foam);
}

/** A tileable ripple normal map: a sum of integer-frequency waves on the torus. */
function rippleNormals():THREE.DataTexture {
    const N=NORMAL_SIZE,data=new Uint8Array(N*N*4);
    const waves=[[1,2,.9,.3],[3,-1,.6,1.1],[-2,5,.35,2.2],[6,3,.22,.7],[-7,-4,.16,4.1],[9,-8,.1,2.9],[13,5,.07,5.3]] as const;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
        let dx=0,dy=0;
        for(const [kx,ky,a,p] of waves){
            const phase=2*Math.PI*(kx*x+ky*y)/N+p,c=Math.cos(phase)*a*2*Math.PI/N;
            dx+=c*kx;dy+=c*ky;
        }
        const s=6,nx=-dx*s,ny=-dy*s,l=Math.hypot(nx,ny,1),i=(y*N+x)*4;
        data[i]=Math.round((nx/l*.5+.5)*255);data[i+1]=Math.round((ny/l*.5+.5)*255);data[i+2]=Math.round((1/l*.5+.5)*255);data[i+3]=255;
    }
    const texture=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.needsUpdate=true;
    return texture;
}

/** Deterministic hash noise for the painted reflections (no Math.random in art). */
const hash=(n:number)=>{const s=Math.sin(n*12.9898)*43758.5453;return s-Math.floor(s);};

/** Lamp reflections (broken vertical streaks) and foam lines, painted into one emissive map. */
function paintReflections(w:KitWater,glints:readonly WaterGlint[],foam:readonly WaterFoam[]):THREE.CanvasTexture {
    const width=w.xmax-w.xmin,depth=w.zmax-w.zmin;
    const canvas=document.createElement('canvas');
    canvas.width=Math.min(4096,Math.ceil(width*EMISSIVE_PX_PER_UNIT));canvas.height=Math.min(1024,Math.ceil(depth*EMISSIVE_PX_PER_UNIT));
    const ctx=canvas.getContext('2d')!,sx=canvas.width/width,sz=canvas.height/depth;
    // A faint cold base so the surface reads against the black quay face from above.
    ctx.fillStyle='#070a0f';ctx.fillRect(0,0,canvas.width,canvas.height);
    // Plane UV v runs from zmax (v=0 at the bottom of the canvas after the flip) to zmin.
    const px=(x:number)=>(x-w.xmin)*sx,pz=(z:number)=>(z-w.zmin)*sz;
    ctx.globalCompositeOperation='lighter';
    glints.forEach((g,gi)=>{
        if(g.x<w.xmin-2||g.x>w.xmax+2||g.z<w.zmin-8||g.z>w.zmax+8)return;
        const c=new THREE.Color(g.color),strength=g.strength??1;
        // A reflection runs out across the water, away from the quay, in broken dashes.
        const x=px(g.x),start=Math.min(g.z,w.zmax-1.2);
        for(let i=0;i<22;i++){
            const along=i*.45+hash(gi*31+i)*.3,z=start-along;
            if(z<w.zmin||z>w.zmax)continue;
            const fade=(1-i/22)*strength,half=(.35+hash(gi*7+i)*.55)*sx*(1+i*.05);
            ctx.fillStyle=`rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${(.2+.3*hash(gi*13+i))*fade})`;
            ctx.fillRect(x-half+(hash(gi*5+i)-.5)*sx*.6,pz(z)-.09*sz,half*2,.18*sz);
        }
    });
    // Foam: a pale ragged line along each hard edge.
    for(const f of foam){
        const length=Math.hypot(f.x1-f.x0,f.z1-f.z0),steps=Math.ceil(length*4);
        for(let i=0;i<steps;i++){
            const t=i/steps,x=f.x0+(f.x1-f.x0)*t,z=f.z0+(f.z1-f.z0)*t,n=hash(i*1.7+f.x0*3.1+f.z0);
            if(n<.25)continue;
            ctx.fillStyle=`rgba(150,165,170,${.05+.09*n})`;
            ctx.fillRect(px(x)-.2*sx,pz(z)-(.1+.25*n)*sz,.4*sx,(.2+.5*n)*sz);
        }
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;
    return texture;
}
