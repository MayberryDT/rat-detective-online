import type { Vec3Data } from './networkProtocol';
import { SEWER_PIPE_ENTRANCES, sewerPipePoint } from './sewerLayout';

export interface ZoneRect { xmin:number; xmax:number; zmin:number; zmax:number }
export interface JurisdictionZone {
    label:string; category:'outdoor'|'enclosed'; floor:'STREET'|'GROUND FLOOR'|'SEWER'; floorY:number;
    areas:readonly ZoneRect[]; exclusions:readonly ZoneRect[]; posts:readonly Vec3Data[]; approaches:readonly Vec3Data[];
}
const rect=(xmin:number,xmax:number,zmin:number,zmax:number):ZoneRect=>({xmin,xmax,zmin,zmax});
const posts=(y:number,points:readonly (readonly [number,number])[])=>points.map(([x,z])=>({x,y,z}));
export const JURISDICTION_ZONES = {
    'records-forecourt':{label:'RECORDS FORECOURT',category:'outdoor',floor:'STREET',floorY:0,
        areas:[rect(-28,-4,-33,-21)],exclusions:[],approaches:posts(.3,[[-38,-18],[6,-18],[-16,-39]]),posts:posts(.3,[[-16,-27],[-22,-27],[-8,-26]])},
    'icebox-yard':{label:'ICEBOX LOADING YARD',category:'outdoor',floor:'STREET',floorY:0,
        areas:[rect(113,135,-26,-12)],exclusions:[],approaches:posts(.3,[[100,-18],[157,-18],[130,-36]]),posts:posts(.3,[[124,-19],[117,-18],[131,-18]])},
    'central-crossroads':{label:'CENTRAL CROSSROADS',category:'outdoor',floor:'STREET',floorY:0,
        areas:[rect(57,83,-24,-12),rect(64,76,-31,-5)],exclusions:[],approaches:posts(.3,[[46,-18],[94,-18],[70,-44],[70,8]]),posts:posts(.3,[[70,-18],[60,-18],[80,-18],[70,-8]])},
    'needleworks-floor':{label:'NEEDLEWORKS FACTORY FLOOR',category:'enclosed',floor:'GROUND FLOOR',floorY:0,
        areas:[rect(-118,-92,71,93)],exclusions:[rect(-123,-113,89.5,94.5)],approaches:posts(.3,[[-105,112],[-105,52],[-63,82]]),posts:posts(.3,[[-105,82],[-114,76],[-97,88]])},
    'pump-floor':{label:'PUMP STATION GROUND FLOOR',category:'enclosed',floor:'GROUND FLOOR',floorY:0,
        areas:[rect(114,138,108,133)],exclusions:[rect(115.2,120.8,109.2,116.8),rect(129.2,134.8,109.2,116.8),rect(129.2,134.8,125.2,132.8),rect(114,121.2,124.3,134)],
        approaches:posts(.3,[[125,141],[125,95],[154,118]]),posts:posts(.3,[[125,120],[125,110],[136,120]])},
    'sewer-junction':{label:'SEWER JUNCTION',category:'enclosed',floor:'SEWER',floorY:-7,
        areas:[rect(-6,6,-6,6),rect(-16,16,-3.5,3.5),rect(-3.5,3.5,0,16)],exclusions:[],approaches:posts(-6.7,[[-22,0],[22,0],[0,22]]),posts:posts(-6.7,[[0,0],[-10,0],[10,0],[0,10]])},
} as const satisfies Record<string,JurisdictionZone>;
export type JurisdictionZoneId=keyof typeof JURISDICTION_ZONES;
export const JURISDICTION_ZONE_IDS=Object.keys(JURISDICTION_ZONES) as JurisdictionZoneId[];
export const isJurisdictionZoneId=(id:unknown):id is JurisdictionZoneId=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(JURISDICTION_ZONES,id);
/** Keep bounded shared searches local to the next tunnel leg. A goal directly
 * below a street rat otherwise attracts fallback steps into the street above it. */
export function jurisdictionTravelPoint(from:Vec3Data,goal:Vec3Data):Vec3Data {
    const below=from.y < -1,targetBelow=goal.y < -1;
    if(below!==targetBelow){
        const entries=SEWER_PIPE_ENTRANCES.map(e=>({mouth:sewerPipePoint(e,0),foot:sewerPipePoint(e,30)}));
        const horizontal=(a:Vec3Data,b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
        entries.sort((a,b)=>(horizontal(from,below?a.foot:a.mouth)+horizontal(goal,below?a.mouth:a.foot))-(horizontal(from,below?b.foot:b.mouth)+horizontal(goal,below?b.mouth:b.foot)));
        const entry=entries[0],near=below?entry.foot:entry.mouth,far=below?entry.mouth:entry.foot;
        // Once descending, finish the ramp before choosing an underground leg.
        const point=horizontal(from,near)>16?near:far;
        return {x:point.x,y:point.floorY+.3,z:point.z};
    }
    if(targetBelow){
        if(from.z < -6)return from.x>52?{x:48,y:-6.7,z:-36}:{x:48,y:-6.7,z:0};
        if(from.z>24&&from.x < -6)return from.x < -78?{x:-84,y:-6.7,z:0}:{x:0,y:-6.7,z:40};
    }
    return goal;
}
const inside=(r:ZoneRect,x:number,z:number)=>x>=r.xmin&&x<r.xmax&&z>=r.zmin&&z<r.zmax;
export function zoneContains(id:JurisdictionZoneId,p:Vec3Data):boolean {
    const zone:JurisdictionZone=JURISDICTION_ZONES[id];
    // Feet, including ordinary jumps; never the upper floor or street over a sewer.
    return [p.x,p.y,p.z].every(Number.isFinite)&&p.y>=zone.floorY-.5&&p.y<zone.floorY+6&&
        zone.areas.some(r=>inside(r,p.x,p.z))&&!zone.exclusions.some(r=>inside(r,p.x,p.z));
}
export function zoneSpawnExcluded(id:JurisdictionZoneId,p:Vec3Data):boolean {
    const zone:JurisdictionZone=JURISDICTION_ZONES[id];
    return Math.abs(p.y-zone.floorY)<6&&zone.areas.some(r=>p.x>=r.xmin-5&&p.x<=r.xmax+5&&p.z>=r.zmin-5&&p.z<=r.zmax+5);
}
/** Exact rectangle decomposition shared by floor fill and seam-free boundary extraction. */
export function zoneTiles(id:JurisdictionZoneId):ZoneRect[] {
    const zone:JurisdictionZone=JURISDICTION_ZONES[id],rs=[...zone.areas,...zone.exclusions];
    const xs=[...new Set(rs.flatMap(r=>[r.xmin,r.xmax]))].sort((a,b)=>a-b);
    const zs=[...new Set(rs.flatMap(r=>[r.zmin,r.zmax]))].sort((a,b)=>a-b),tiles:ZoneRect[]=[];
    for(let x=1;x<xs.length;x++)for(let z=1;z<zs.length;z++){
        const r=rect(xs[x-1],xs[x],zs[z-1],zs[z]);
        if(zoneContains(id,{x:(r.xmin+r.xmax)/2,y:zone.floorY,z:(r.zmin+r.zmax)/2}))tiles.push(r);
    }
    return tiles;
}
