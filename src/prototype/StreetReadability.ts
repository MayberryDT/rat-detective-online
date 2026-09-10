import * as THREE from 'three';
import type {BuildingFootprint} from '../shared/worldSpec';
import type {GrayboxBox} from '../shared/grayboxLayout';
import {isCentralBuilding} from '../shared/skyline';

export interface SpillSource {
    x:number; z:number; y:number; nx:number; nz:number;
    kind:'window'|'door'|'sign'; color:number; reach:number;
}
export interface SpillBlocker {x:number;z:number;w:number;d:number}
const SIZE=512, MIN=-200, SPAN=376, MAX_LIGHT=.125;

/** A presentation-only switch: the accepted streetlamp/ambient settings remain. */
export function streetReadabilityEnabled(search=typeof location==='undefined'?'':location.search):boolean {
    return new URLSearchParams(search).get('readability')!=='off';
}

export function streetSpillSources(layout:readonly BuildingFootprint[]):SpillSource[] {
    const sources:SpillSource[]=[];
    layout.forEach((b,i)=>{
        const central=isCentralBuilding(b);
        for(const side of [-1,1]){
            // Steady transoms and workshop windows have their own visible panes;
            // upstairs apartment occupancy never leaves an invisible light source.
            sources.push({x:b.cx,z:b.cz+side*(b.bd/2+(central?1.1:.65)),y:central?4.45:2.82,nx:0,nz:side,
                kind:'door',color:0xe0bd82,reach:10});
            sources.push({x:b.cx+side*(b.bw/2+.18),z:b.cz,y:3.6,nx:side,nz:0,
                kind:i%3===0?'sign':'window',color:i%3===0?0x9ebbc4:i%2?0xc5ab87:0x91aaa6,reach:12});
        }
    });
    // Small sign washers at existing street-facing landmark signs/entrances.
    sources.push(
        {x:5,z:-36.45,y:3.9,nx:0,nz:1,kind:'sign',color:0xc0ab81,reach:11},
        {x:130,z:-30.55,y:4.8,nx:0,nz:1,kind:'door',color:0x91b9c5,reach:12},
        {x:-105,z:108.75,y:5.3,nx:0,nz:1,kind:'sign',color:0xc2979d,reach:12},
        {x:125,z:137.5,y:4.8,nx:0,nz:1,kind:'door',color:0xa3bda0,reach:12},
    );
    return sources;
}

/** Segment/AABB clipping in the street plane. Used only during the one-time bake. */
function blocked(ax:number,az:number,bx:number,bz:number,boxes:readonly SpillBlocker[]):boolean {
    for(const b of boxes){
        let lo=0,hi=1;
        for(const [a,delta,min,max] of [[ax,bx-ax,b.x-b.w/2,b.x+b.w/2],[az,bz-az,b.z-b.d/2,b.z+b.d/2]]){
            if(Math.abs(delta)<1e-8){if(a<min||a>max){hi=-1;break;}continue;}
            const t1=(min-a)/delta,t2=(max-a)/delta;
            lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
        }
        if(lo<=hi&&hi>.001&&lo<.999)return true;
    }
    return false;
}

export function sampleStreetSpill(s:SpillSource,x:number,z:number,blockers:readonly SpillBlocker[]):number {
    const dx=x-s.x,dz=z-s.z,depth=dx*s.nx+dz*s.nz;
    if(depth<0||depth>=s.reach)return 0;
    const across=Math.abs(dx*s.nz-dz*s.nx),width=(s.kind==='door'?1.1:1.5)+depth*.3;
    if(across>=width||blocked(s.x,s.z,x,z,blockers))return 0;
    const edge=1-across/width;
    return .05*edge*edge*(1-depth/s.reach)**2;
}

/** Fixed, occluded street spill in one 1 MiB atlas. No live lights, shadow maps,
 * world bodies, frame updates or per-player work. Existing material batching stays. */
export class StreetReadability {
    readonly sources:readonly SpillSource[];
    private readonly texture:THREE.DataTexture;
    private readonly geometry=new THREE.BoxGeometry(1,1,1);
    private readonly fixtureMaterials=[new THREE.MeshStandardMaterial({color:0x29252d,roughness:.85}),new THREE.MeshBasicMaterial({color:0xffffff})];
    private readonly fixtures:THREE.InstancedMesh[]=[];
    private readonly applied=new Set<THREE.MeshStandardMaterial>();
    constructor(scene:THREE.Scene,layout:readonly BuildingFootprint[],boxes:readonly GrayboxBox[]){
        this.sources=streetSpillSources(layout);
        const blockers:SpillBlocker[]=[...layout.map(b=>({x:b.cx,z:b.cz,w:b.bw,d:b.bd})),
            ...boxes.filter(b=>!b.original&&!b.debris&&!b.rx&&!b.rz&&b.y-b.h/2<2&&b.y+b.h/2>2)
                .map(b=>({x:b.x,z:b.z,w:b.w,d:b.d}))];
        const field=new Float32Array(SIZE*SIZE*3),color=new THREE.Color();
        for(const s of this.sources){
            color.setHex(s.color);
            const nearby=blockers.filter(b=>Math.abs(b.x-s.x)<s.reach+b.w/2&&Math.abs(b.z-s.z)<s.reach+b.d/2);
            const startX=Math.max(0,Math.floor((s.x-s.reach-MIN)/SPAN*SIZE));
            const endX=Math.min(SIZE-1,Math.ceil((s.x+s.reach-MIN)/SPAN*SIZE));
            const startZ=Math.max(0,Math.floor((s.z-s.reach-MIN)/SPAN*SIZE));
            const endZ=Math.min(SIZE-1,Math.ceil((s.z+s.reach-MIN)/SPAN*SIZE));
            for(let iz=startZ;iz<=endZ;iz++)for(let ix=startX;ix<=endX;ix++){
                const amount=sampleStreetSpill(s,MIN+(ix+.5)/SIZE*SPAN,MIN+(iz+.5)/SIZE*SPAN,nearby);
                const i=(iz*SIZE+ix)*3;
                field[i]+=amount*color.r;field[i+1]+=amount*color.g;field[i+2]+=amount*color.b;
            }
        }
        const data=new Uint8Array(SIZE*SIZE*4);
        for(let i=0;i<SIZE*SIZE;i++)for(let c=0;c<3;c++)data[i*4+c]=Math.round(Math.min(.055,field[i*3+c])/MAX_LIGHT*255);
        this.texture=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat);
        this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
        this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
        this.addFixtures(scene);
    }
    private addFixtures(scene:THREE.Scene):void {
        const dummy=new THREE.Object3D(),color=new THREE.Color();
        // One frame batch and one pane batch. Mullions make windows read as windows.
        for(const [index,material] of this.fixtureMaterials.entries()){
            const mesh=new THREE.InstancedMesh(this.geometry,material,this.sources.length*(index===0?3:1));
            let count=0;
            for(const s of this.sources){
                const w=s.kind==='door'?1.7:s.kind==='sign'?2.1:1.35,h=s.kind==='window'?.85:.24;
                const part=(width:number,height:number,depth:number,offset:number)=>{
                    dummy.position.set(s.x+s.nx*offset,s.y,s.z+s.nz*offset);
                    dummy.rotation.set(0,Math.atan2(s.nx,s.nz),0);dummy.scale.set(width,height,depth);dummy.updateMatrix();
                    mesh.setMatrixAt(count,dummy.matrix);if(index===1)mesh.setColorAt(count,color.setHex(s.color));count++;
                };
                if(index===0){part(w+.18,h+.18,.12,-.04);part(.045,h,.055,.07);part(w,.035,.055,.07);}
                else part(w,h,.04,.025);
            }
            mesh.name=index===0?'street-spill-fixture-frames':'street-spill-fixture-panes';
            mesh.computeBoundingSphere();mesh.raycast=()=>{};scene.add(mesh);this.fixtures.push(mesh);
        }
    }
    apply(material:THREE.MeshStandardMaterial):void {
        if(this.applied.has(material))return;
        this.applied.add(material);
        const compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
        const role=material.userData.streetSurface;
        const lift=role==='curb'||role==='stairs'?1.2:role==='ground'?1:role==='obstacle'?.7:0;
        material.onBeforeCompile=(shader,renderer)=>{
            compile.call(material,shader,renderer);
            shader.uniforms.streetSpill={value:this.texture};
            shader.uniforms.streetSurfaceLift={value:lift};
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStreetPosition;')
                .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
                vec4 streetPosition=vec4(transformed,1.0);
                #ifdef USE_INSTANCING
                    streetPosition=instanceMatrix*streetPosition;
                #endif
                vStreetPosition=(modelMatrix*streetPosition).xyz;`);
            shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
                varying vec3 vStreetPosition;
                uniform sampler2D streetSpill;
                uniform float streetSurfaceLift;`)
                .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
                float streetHeight=smoothstep(-0.15,0.05,vStreetPosition.y)*(1.0-smoothstep(1.5,5.5,vStreetPosition.y));
                if(streetHeight>0.0){
                    vec2 streetUv=(vStreetPosition.xz-vec2(${MIN}.0))/${SPAN}.0;
                    vec3 spill=texture2D(streetSpill,streetUv).rgb*${MAX_LIGHT};
                    totalEmissiveRadiance+=spill*streetHeight;
                    // A restrained material-only floor, tinted by its own surface.
                    totalEmissiveRadiance+=streetSurfaceLift*streetHeight*vec3(.0036,.0044,.0064);
                    diffuseColor.rgb+=streetSurfaceLift*streetHeight*vec3(.014,.017,.022);
                }`);
        };
        material.customProgramCacheKey=()=>cacheKey+'-street-spill-v1-'+lift;
        material.needsUpdate=true;
    }
    dispose():void {
        for(const mesh of this.fixtures){mesh.removeFromParent();mesh.dispose();}
        for(const material of this.fixtureMaterials)material.dispose();
        this.geometry.dispose();this.texture.dispose();this.applied.clear();
    }
}
