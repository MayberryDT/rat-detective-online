import type {BuildingFootprint} from './worldSpec';

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

/** A loose downtown trend with deliberately retained low shops and edge towers. */
export function neighborhoodHeight(x:number,z:number,original:number,index:number):number {
    if(original<=16)return original;
    let seed=(Math.imul(Math.round(x*31),73856093)^Math.imul(Math.round(z*31),19349663)^Math.imul(index+1,83492791))>>>0;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const varied=seed/4294967296;
    const central=Math.max(0,1-Math.hypot(x+5,z-10)/210);
    return Math.round(24+original*.7+central*central*(38+varied*70)+varied*24);
}
