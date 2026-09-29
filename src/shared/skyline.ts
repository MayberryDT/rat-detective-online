import type {BuildingFootprint,FootprintChamfer} from './worldSpec';

/** The six downtown towers retain their original street footprints. */
export const CENTRAL_BUILDINGS:BuildingFootprint[] = [
    {cx:-40,cz:9,bw:20,bd:16,bh:122},
    {cx:-9,cz:10,bw:24,bd:18,bh:170},
    {cx:30,cz:6,bw:20,bd:20,bh:146},
    {cx:49,cz:-46,bw:22,bd:32,bh:132},
    {cx:-35,cz:57,bw:22,bd:22,bh:108},
    {cx:6,cz:59,bw:32,bd:20,bh:154},
];
export interface SkylineMass {x:number;y:number;z:number;w:number;h:number;d:number}
/** A collider mass; `ry` yaws it (boxFrame). */
export interface BuildingCollider extends SkylineMass {ry?:number}
/** Each side of a junction corner cut: a 45° face across `CORNER_CUT` units of both walls. */
export const CORNER_CUT=6;
export function isCentralBuilding(b:BuildingFootprint):boolean {
    return CENTRAL_BUILDINGS.some(c=>c.cx===b.cx&&c.cz===b.cz&&c.bw===b.bw&&c.bd===b.bd);
}
/** Shared render/collision setbacks: no full-size invisible box above a crown. */
export function skylineMasses(b:BuildingFootprint):SkylineMass[] {
    if(!isCentralBuilding(b))return [{x:b.cx,y:b.bh/2,z:b.cz,w:b.bw,h:b.bh,d:b.bd}];
    const fractions=[.72,.18,.1], widths=[1,.76,.48];
    let base=0;
    return fractions.map((fraction,i)=>{
        const h=b.bh*fraction;
        const mass={x:b.cx,y:base+h/2,z:b.cz,w:b.bw*widths[i],h,d:b.bd*widths[i]};
        base+=h;return mass;
    });
}

const cut=(b:BuildingFootprint,sx:number,sz:number)=>!!b.chamfers?.some(k=>k.sx===sx&&k.sz===sz);
const corner=(b:BuildingFootprint,k:FootprintChamfer)=>({x:b.cx+k.sx*b.bw/2,z:b.cz+k.sz*b.bd/2});

/** The pieces of a footprint that stay axis-aligned: for a chamfered one, a band plus the strips
 * beside its cuts (an L per cut). The first piece is the band. Without cuts it is the skyline. */
export function footprintBlocks(b:BuildingFootprint):SkylineMass[] {
    if(!b.chamfers?.length)return skylineMasses(b);
    const c=CORNER_CUT,x0=b.cx-b.bw/2,x1=b.cx+b.bw/2,z0=b.cz-b.bd/2,z1=b.cz+b.bd/2;
    const zLo=z0+(cut(b,-1,-1)||cut(b,1,-1)?c:0),zHi=z1-(cut(b,-1,1)||cut(b,1,1)?c:0);
    const block=(xa:number,xb:number,za:number,zb:number):SkylineMass=>({x:(xa+xb)/2,y:b.bh/2,z:(za+zb)/2,w:xb-xa,h:b.bh,d:zb-za});
    const blocks=[block(x0,x1,zLo,zHi)];
    for(const sz of [-1,1]){
        if(!cut(b,-1,sz)&&!cut(b,1,sz))continue;
        blocks.push(block(x0+(cut(b,-1,sz)?c:0),x1-(cut(b,1,sz)?c:0),sz<0?z0:zHi,sz<0?zLo:z1));
    }
    return blocks;
}

/** The yawed box behind one cut: its outer face lies exactly on the 45° line, and it fills the
 * triangle the axis pieces leave. Local x runs along the face, local z along its normal. */
export function chamferBox(b:BuildingFootprint,k:FootprintChamfer):BuildingCollider {
    const c=CORNER_CUT,{x,z}=corner(b,k);
    return {x:x-k.sx*c*.75,y:b.bh/2,z:z-k.sz*c*.75,w:c*Math.SQRT2,h:b.bh,d:c*Math.SQRT1_2,ry:Math.atan2(k.sz,k.sx)};
}

/** The collider set of a building, identical on the server (graybox `original` boxes) and client. */
export function buildingColliders(b:BuildingFootprint):BuildingCollider[] {
    return [...footprintBlocks(b),...(b.chamfers??[]).map(k=>chamferBox(b,k))];
}

/** The cut face of one corner: its end points on the two walls (`a` on the wall along x), its middle and outward normal. */
export interface ChamferFace {a:{x:number;z:number};b:{x:number;z:number};x:number;z:number;nx:number;nz:number;length:number}
export function chamferFace(b:BuildingFootprint,k:FootprintChamfer):ChamferFace {
    const c=CORNER_CUT,{x,z}=corner(b,k);
    return {a:{x:x-k.sx*c,z},b:{x,z:z-k.sz*c},x:x-k.sx*c/2,z:z-k.sz*c/2,nx:k.sx*Math.SQRT1_2,nz:k.sz*Math.SQRT1_2,length:c*Math.SQRT2};
}

/** How far (x,z) lies beyond a cut line toward its corner, in units of the diagonal sum; >0 is cut away. */
export function beyondCut(b:BuildingFootprint,k:FootprintChamfer,x:number,z:number):number {
    const {x:cx,z:cz}=corner(b,k);
    return k.sx*(x-cx)+k.sz*(z-cz)+CORNER_CUT;
}

/** The footprint outline, anticlockwise seen from above (x east, z south), starting at the north-east
 * corner: the order BoxGeometry textures its walls in (-z face westward, -x south, +z east, +x north).
 * An edge from p to q faces (-(q.z-p.z), q.x-p.x). */
export function footprintOutline(b:BuildingFootprint):Array<{x:number;z:number}> {
    const c=CORNER_CUT,points:Array<{x:number;z:number}>=[];
    for(const [sx,sz] of [[1,-1],[-1,-1],[-1,1],[1,1]] as const){
        const x=b.cx+sx*b.bw/2,z=b.cz+sz*b.bd/2;
        if(!cut(b,sx,sz)){points.push({x,z});continue;}
        const alongX={x:x-sx*c,z},alongZ={x,z:z-sz*c};
        // The walk reaches the NW and SE corners along an x wall, the NE and SW ones along a z wall.
        points.push(...(sx===sz?[alongX,alongZ]:[alongZ,alongX]));
    }
    return points;
}

/** A loose downtown trend with deliberately retained low shops and edge towers. */
export function neighborhoodHeight(x:number,z:number,original:number,index:number):number {
    if(original<=16)return original;
    let seed=(Math.imul(Math.round(x*31),73856093)^Math.imul(Math.round(z*31),19349663)^Math.imul(index+1,83492791))>>>0;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const varied=seed/4294967296;
    const central=Math.max(0,1-Math.hypot(x+5,z-10)/210);
    return Math.round(24+original*.7+central*central*(38+varied*70)+varied*24);
}
