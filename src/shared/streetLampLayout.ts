import {CITY_STREETS, landmarkReservation} from './cityPlan';
import {CENTRAL_BUILDINGS} from './skyline';
import {SEWER_ENTRIES, SEWER_MANHOLE, sewerGroundOpening} from './sewerLayout';
import type {BuildingFootprint} from './worldSpec';

export type StreetLampPosition = [number, number];
const CURB_OFFSET = .6;

/** A pole must be outside every carriageway, including intersecting streets. */
export function isStreetLampSite(x:number,z:number,buildings:BuildingFootprint[]):boolean {
    if(x < -191 || x > 161 || z < -191 || z > 161)return false;
    if(CITY_STREETS.some(r=>Math.abs(x-r.x)<r.w/2+.3 && Math.abs(z-r.z)<r.d/2+.3))return false;
    if(!CITY_STREETS.some(r=>Math.abs(x-r.x)<=r.w/2+1 && Math.abs(z-r.z)<=r.d/2+1))return false;
    if(landmarkReservation(x,z))return false;
    if([...buildings,...CENTRAL_BUILDINGS].some(b=>Math.abs(x-b.cx)<b.bw/2+.35 && Math.abs(z-b.cz)<b.bd/2+.35))return false;
    if(sewerGroundOpening(x,z) || Math.hypot(x-SEWER_MANHOLE.x,z-SEWER_MANHOLE.z)<7)return false;
    // Keep both the full descending pipe and its street-level approach empty.
    if(SEWER_ENTRIES.some(entry=>{
        const along=entry.axis==='x'?x:z, across=entry.axis==='x'?z:x;
        const direction=entry.axis==='x'?Math.sign(entry.x):1;
        const distance=(along-entry[entry.axis])*direction;
        return distance>-28 && distance<16 && Math.abs(across-(entry.axis==='x'?entry.z:entry.x))<9;
    }))return false;
    return true;
}

/** Move authored light pools to a nearby real curb, or omit a blocked site. */
export function relocateStreetLamps(sites:StreetLampPosition[],buildings:BuildingFootprint[]):StreetLampPosition[] {
    const placed:StreetLampPosition[]=[];
    for(const [x,z] of sites){
        const candidates:StreetLampPosition[]=[];
        for(const road of CITY_STREETS){
            if(road.w>road.d){
                const along=Math.max(road.x-road.w/2+2,Math.min(road.x+road.w/2-2,x));
                for(const side of [-1,1])candidates.push([along,road.z+side*(road.d/2+CURB_OFFSET)]);
            }else{
                const along=Math.max(road.z-road.d/2+2,Math.min(road.z+road.d/2-2,z));
                for(const side of [-1,1])candidates.push([road.x+side*(road.w/2+CURB_OFFSET),along]);
            }
        }
        candidates.sort((a,b)=>Math.hypot(a[0]-x,a[1]-z)-Math.hypot(b[0]-x,b[1]-z));
        const site=candidates.find(([cx,cz])=>Math.hypot(cx-x,cz-z)<14 && isStreetLampSite(cx,cz,buildings)
            && placed.every(([px,pz])=>Math.hypot(px-cx,pz-cz)>8));
        if(site)placed.push(site);
    }
    return placed;
}

/** Supplemental decorative lamps use exactly the same curb and entrance rules. */
export function generatedStreetLamps(buildings:BuildingFootprint[],fixed:StreetLampPosition[]):StreetLampPosition[] {
    const placed:StreetLampPosition[]=[];
    for(const road of CITY_STREETS){
        const horizontal=road.w>road.d, span=horizontal?road.w:road.d;
        for(let t=-span/2+12;t<span/2-8;t+=30){
            // Alternate sidewalks; try the opposite one when a frontage is blocked.
            const preferred=(Math.round((t+span/2)/30)%2)?-1:1;
            for(const side of [preferred,-preferred]){
                const x=road.x+(horizontal?t:side*(road.w/2+CURB_OFFSET));
                const z=road.z+(horizontal?side*(road.d/2+CURB_OFFSET):t);
                if(!isStreetLampSite(x,z,buildings) || [...fixed,...placed].some(([px,pz])=>Math.hypot(px-x,pz-z)<10))continue;
                placed.push([x,z]);break;
            }
        }
    }
    return placed;
}
