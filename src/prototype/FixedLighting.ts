import * as THREE from 'three';
import { AUTHORED_LIGHT_GAIN } from '../session/lightingTuning';
import type { LightingMode } from '../session/lightingMode';
import { lightRoomAt, type LightRoom } from './StreetLightPool';

/** A steady baked source (never a live light). A `fixture` lights only its own room and
 * floor band, inside a downward cone; any other source lights everything in reach, except
 * that in `pools` mode an `outdoor` source, or one 4.5 or more above the street, skips every room. */
export interface BakedLight {
    position:THREE.Vector3; color:THREE.Color; intensity:number; distance:number;
    fixture?:{room:string; floor:number; angle:number};
    outdoor?:true;
}
/** A landmark hall: a faint room-only bounce keeps the unlit side of its stairs readable. */
export interface BounceHall {cx:number; cz:number; w:number; d:number}

/** Per-channel ceiling of the bake (emissive radiance). */
export const FIXED_LIGHT_CLAMP=.12*AUTHORED_LIGHT_GAIN;
/** Facing term for a small fitting sampled at its centre (no single normal). */
const OMNI_FACING=.6;
const CELL=16;
const cellKey=(ix:number,iz:number)=>(ix+4096)*8192+iz+4096;

/**
 * Fixed illumination: the one steady bake shared by the graybox city and the kit. Lights
 * are bucketed on a 16-unit grid so a surface only visits the sources that reach it.
 */
export class FixedLightField {
    private readonly cells=new Map<number,BakedLight[]>();
    private readonly seen=new Set<BakedLight>();
    private readonly toward=new THREE.Vector3();
    constructor(readonly lights:readonly BakedLight[],readonly rooms:readonly LightRoom[],readonly mode:LightingMode,private readonly halls:readonly BounceHall[]=[]){
        for(const light of lights){
            const {x,z}=light.position,r=light.distance;
            for(let ix=Math.floor((x-r)/CELL);ix<=Math.floor((x+r)/CELL);ix++)for(let iz=Math.floor((z-r)/CELL);iz<=Math.floor((z+r)/CELL);iz++){
                const key=cellKey(ix,iz);let cell=this.cells.get(key);
                if(!cell){cell=[];this.cells.set(key,cell);}
                cell.push(light);
            }
        }
    }
    /** Sources whose range reaches the box. */
    near(box:THREE.Box3):BakedLight[] {
        const out:BakedLight[]=[],seen=this.seen;seen.clear();
        for(let ix=Math.floor(box.min.x/CELL);ix<=Math.floor(box.max.x/CELL);ix++)for(let iz=Math.floor(box.min.z/CELL);iz<=Math.floor(box.max.z/CELL);iz++){
            for(const light of this.cells.get(cellKey(ix,iz))??[]){
                if(seen.has(light))continue;seen.add(light);
                if(box.distanceToPoint(light.position)<light.distance)out.push(light);
            }
        }
        return out;
    }
    /** Rooms the box touches: the only rooms its surface points can be in. */
    roomsNear(box:THREE.Box3):LightRoom[] {
        if(this.mode!=='pools')return [];
        return this.rooms.filter(r=>box.max.x>=r.xmin&&box.min.x<=r.xmax&&box.max.z>=r.zmin&&box.min.z<=r.zmax&&box.max.y>=r.ymin&&box.min.y<r.ymax);
    }
    /**
     * The steady light at surface point `p` with world normal `n` (`null`: a small fitting
     * lit from every side), from `lights` (see `near`) and `rooms` (see `roomsNear`). `tint`
     * colours the direct light the way the surface takes it (the hall bounce stays neutral).
     */
    sample(p:THREE.Vector3,n:THREE.Vector3|null,lights:readonly BakedLight[],rooms:readonly LightRoom[],out:THREE.Color,tint?:THREE.Color):THREE.Color {
        out.setRGB(0,0,0);
        if(p.y<-.05&&this.mode==='classic')return out;
        let red=0,green=0,blue=0,bounceRed=0,bounceGreen=0,bounceBlue=0;
        if(p.y>=-.05&&p.y<24&&this.halls.some(h=>Math.abs(p.x-h.cx)<h.w/2-.3&&Math.abs(p.z-h.cz)<h.d/2-.3)){
            const fill=this.mode==='classic'?1:.65;bounceRed=.014*fill;bounceGreen=.016*fill;bounceBlue=.020*fill;
        }
        const room=this.mode==='pools'?lightRoomAt(p,rooms):undefined,toward=this.toward;
        for(const source of lights){
            const fixture=source.fixture;
            if(fixture){
                if(room?.id!==fixture.room||p.y<fixture.floor-.05||p.y>fixture.floor+7.5)continue;
            }else if(this.mode==='pools'&&room&&(source.outdoor||source.position.y>=4.5))continue;
            toward.copy(source.position).sub(p);
            const distance=toward.length();
            if(distance>=source.distance||distance<.001)continue;
            toward.multiplyScalar(1/distance);
            const facing=n?Math.max(0,n.dot(toward)):OMNI_FACING;
            const cone=fixture?THREE.MathUtils.smoothstep(toward.y,Math.cos(fixture.angle),.96):1;
            const amount=AUTHORED_LIGHT_GAIN*Math.min(.075,source.intensity*(fixture?.16:.08)/(12+distance*distance))*(1-distance/source.distance)*facing*cone;
            red+=source.color.r*amount;green+=source.color.g*amount;blue+=source.color.b*amount;
        }
        const tr=tint?.r??1,tg=tint?.g??1,tb=tint?.b??1;
        return out.setRGB(Math.min(bounceRed+red*tr,FIXED_LIGHT_CLAMP),Math.min(bounceGreen+green*tg,FIXED_LIGHT_CLAMP),Math.min(bounceBlue+blue*tb,FIXED_LIGHT_CLAMP));
    }
}

/** Add the baked `fixedIllumination` attribute (per vertex or per instance) to emissive.
 * One cache key for every material that carries it, so the graybox and the kit share programs. */
export function applyFixedIllumination(material:THREE.MeshStandardMaterial):void {
    material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 fixedIllumination;\nvarying vec3 vFixedIllumination;')
            .replace('#include <begin_vertex>','#include <begin_vertex>\nvFixedIllumination = fixedIllumination;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFixedIllumination;')
            .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vFixedIllumination;');
    };
    material.customProgramCacheKey=()=>'neighborhood-fixed-illumination-v1';
    material.needsUpdate=true;
}
