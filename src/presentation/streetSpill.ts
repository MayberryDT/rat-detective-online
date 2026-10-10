import * as THREE from 'three';

/** Shared spill sampling for atlas and facade beams; no scene construction. */
export interface SpillSource {
    x:number; z:number; y:number; nx:number; nz:number;
    kind:'window'|'door'|'sign'; color:number; reach:number;
    width?:number;height?:number;powerShare?:number;occupancy?:{value:number};
}
export interface SpillBlocker {x:number;z:number;w:number;d:number}
/** Segment/AABB clipping in the street plane. Used only during the one-time bake. */
export function blocked(ax:number,az:number,bx:number,bz:number,boxes:readonly SpillBlocker[]):boolean {
    // Runs millions of times in the bake: no per-box allocation.
    const dx=bx-ax,dz=bz-az;
    for(const b of boxes){
        let lo=0,hi=1;
        const minX=b.x-b.w/2,maxX=b.x+b.w/2,minZ=b.z-b.d/2,maxZ=b.z+b.d/2;
        if(Math.abs(dx)<1e-8){if(ax<minX||ax>maxX)continue;}
        else{const t1=(minX-ax)/dx,t2=(maxX-ax)/dx;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
        if(Math.abs(dz)<1e-8){if(az<minZ||az>maxZ)continue;}
        else{const t1=(minZ-az)/dz,t2=(maxZ-az)/dz;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
        if(lo<=hi&&hi>.001&&lo<.999)return true;
    }
    return false;
}

export function sampleStreetSpill(s:SpillSource,x:number,z:number,blockers:readonly SpillBlocker[]):number {
    const dx=x-s.x,dz=z-s.z,depth=dx*s.nx+dz*s.nz;
    if(depth<0||depth>=s.reach)return 0;
    const across=Math.abs(dx*s.nz-dz*s.nx),width=(s.width??(s.kind==='door'?1.7:1.35))/2+depth*.22;
    if(across>=width||blocked(s.x,s.z,x,z,blockers))return 0;
    const edge=1-across/width;
    // The pool is where the downward beam meets the ground, not a stripe
    // projected from the building's footprint onto every vertical surface.
    const landing=s.y/.85,along=Math.max(0,1-Math.abs(depth-landing)/(2+(s.height??.85)/.85));
    return .14*edge*edge*along*along*(1-depth/(s.reach+4));
}

export function windowBrightness(source:SpillSource):number {
    return source.occupancy?THREE.MathUtils.smoothstep(source.occupancy.value,.04,1):1;
}
