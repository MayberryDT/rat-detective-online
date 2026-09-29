import type { BuildingFootprint } from './worldSpec';
import {neighborhoodHeight} from './skyline';
import {DOCKS_LOT,HARBOUR,PRECINCT_LOT,QUAY,overlaps} from './city/kit/northPlan';

/** The layout-2 street network. Tenements are still cut from it, so every
 * surviving building keeps its footprint, height and place in the order. */
const LEGACY_STREETS = [
    {x:-15,z:-18,w:362,d:14}, {x:70,z:-15,w:14,d:362},
    {x:-60,z:-10,w:12,d:310}, {x:-15,z:-102,w:362,d:12},
    {x:-63,z:28,w:266,d:12}, {x:118,z:40,w:96,d:14},
    {x:-15,z:145,w:362,d:10}, {x:-175,z:-15,w:12,d:362},
    {x:-150,z:-146,w:10,d:88}, {x:145,z:-146,w:10,d:88},
    {x:90,z:22,w:12,d:246}, {x:-63,z:130,w:266,d:12},
    {x:118,z:95,w:96,d:10}, {x:-16,z:-87,w:86,d:8},
    {x:160,z:-55,w:8,d:90}, {x:-100,z:-57,w:10,d:68},
];

/** Street rectangles are an authored network: broad avenues, offset junctions and service lanes.
 * Layout 3: avenues that ran north now end at the quay; the quay apron is a street; a new
 * lane runs north from the Gate to the precinct. */
export const CITY_STREETS = [
    {x:-15,z:-18,w:362,d:14}, {x:70,z:-3,w:14,d:338},
    {x:-60,z:-13.5,w:12,d:317}, {x:-15,z:-102,w:362,d:12},
    {x:-63,z:28,w:266,d:12}, {x:118,z:40,w:96,d:14},
    {x:-15,z:145,w:362,d:10}, {x:-175,z:-3,w:12,d:338},
    {x:-150,z:-137,w:10,d:70}, {x:145,z:-137,w:10,d:70},
    {x:90,z:22,w:12,d:246}, {x:-63,z:130,w:266,d:12},
    {x:118,z:95,w:96,d:10}, {x:-16,z:-87,w:86,d:8},
    {x:160,z:-55,w:8,d:90}, {x:-100,z:-57,w:10,d:68},
    // Quay Road: the concrete apron along the harbour, from the precinct row to the east breakwater.
    {x:(QUAY.xmin+QUAY.xmax)/2,z:(QUAY.zmin+QUAY.zmax)/2,w:QUAY.xmax-QUAY.xmin,d:QUAY.zmax-QUAY.zmin},
    // Gate Lane: north from the Gate's bridge to the precinct.
    {x:-137,z:-68.5,w:10,d:67},
];

export function landmarkReservation(x:number,z:number,w=0,d=0) {
    const overlaps=(cx:number,cz:number,rw:number,rd:number)=>Math.abs(x-cx)<(rw+w)/2 && Math.abs(z-cz)<(rd+d)/2;
    return overlaps(-16,-59,78,58) || overlaps(130,-61,62,76)
        || overlaps(-137,0,44,70) || overlaps(125,118,64,50) || overlaps(-105,88,92,76)
        || overlaps(-54,52,14,32) || overlaps(0,124,16,36)
        || overlaps(124,0,36,16) || overlaps(-124,0,36,16);
}

// Attached tenement/shop frontages, with an offset lane between the two southern rows.
const INFILL:BuildingFootprint[] = [
    // Short shop/workshop blocks define lanes beside the taller rows and civic buildings.
    {cx:40,cz:72,bw:18,bd:10,bh:10},
    {cx:-38,cz:119,bw:20,bd:8,bh:12},{cx:35,cz:119,bw:26,bd:8,bh:9},
    {cx:110,cz:22,bw:20,bd:16,bh:11},{cx:140,cz:22,bw:24,bd:16,bh:14},
    {cx:36,cz:-74,bw:20,bd:10,bh:12},
    {cx:-40,cz:92,bw:20,bd:30,bh:42},{cx:-20,cz:92,bw:20,bd:30,bh:35},
    {cx:10,cz:94,bw:20,bd:22,bh:31},{cx:30,cz:94,bw:20,bd:22,bh:46},{cx:46,cz:94,bw:12,bd:22,bh:38},
    {cx:110,cz:64,bw:20,bd:26,bh:16},{cx:130,cz:64,bw:20,bd:26,bh:44},{cx:148,cz:64,bw:16,bd:26,bh:12},
];

interface Lot { x0:number; x1:number; z0:number; z1:number }
const lot = (x:number,z:number,w:number,d:number,padding=0):Lot => ({
    x0:x-w/2-padding,x1:x+w/2+padding,z0:z-d/2-padding,z1:z+d/2+padding,
});

// These are shared-world reservations, not decorative gaps. Keep the spawn list
// independent of grayboxLayout to avoid a cityPlan -> grayboxLayout import cycle.
export const CITY_SPAWN_CLEARANCES = [
    [-10,-27],[22,-28],[82,-24],[-55,25],[-166,35],[130,-24],
    [15,135],[-75,-87],[77,75],[-16,-48],[-105,120],[46,53],
] as const;

const LANDMARK_LOTS = [
    lot(-16,-59,78,58),lot(130,-61,62,76),lot(-137,0,44,70),
    lot(125,118,64,50),lot(-105,88,92,76),
    // Enclosed ramp wells plus clear sidewalks and their deliberate upper approaches.
    lot(-54,52,18,36),lot(0,124,20,40),lot(124,0,40,20),lot(-124,0,40,20),
    lot(-54,74,12,12),lot(0,150,12,12),lot(150,0,12,12),lot(-150,0,12,12),
    // The two deliberately open forecourts.
    lot(-15.5,-29.5,31,13),lot(130,-19.5,32,21),
    // Existing central blocks retain their models and six-unit service lanes.
    lot(-40,9,20,16,6),lot(-9,10,24,18,6),lot(30,6,20,20,6),
    lot(49,-46,22,32,6),lot(-35,57,22,22,6),lot(6,59,32,20,6),
];

function subtract(area:Lot,cut:Lot):Lot[] {
    const x0=Math.max(area.x0,cut.x0),x1=Math.min(area.x1,cut.x1);
    const z0=Math.max(area.z0,cut.z0),z1=Math.min(area.z1,cut.z1);
    if(x0>=x1 || z0>=z1)return [area];
    return [
        {x0:area.x0,x1:x0,z0:area.z0,z1:area.z1},
        {x0:x1,x1:area.x1,z0:area.z0,z1:area.z1},
        {x0,x1,z0:area.z0,z1:z0},{x0,x1,z0:z1,z1:area.z1},
    ].filter(r=>r.x1>r.x0 && r.z1>r.z0);
}

// Rejoin rectangular fragments after carving roads. Otherwise an unrelated
// doorway can introduce a seam through a whole neighborhood block.
function mergeLots(lots:Lot[]):Lot[] {
    let joined=true;
    while(joined){
        joined=false;
        outer:for(let a=0;a<lots.length;a++)for(let b=a+1;b<lots.length;b++){
            const p=lots[a],q=lots[b];
            if((p.x0===q.x0 && p.x1===q.x1 && (p.z1===q.z0 || q.z1===p.z0))
                ||(p.z0===q.z0 && p.z1===q.z1 && (p.x1===q.x0 || q.x1===p.x0))){
                lots[a]={x0:Math.min(p.x0,q.x0),x1:Math.max(p.x1,q.x1),z0:Math.min(p.z0,q.z0),z1:Math.max(p.z1,q.z1)};
                lots.splice(b,1);joined=true;break outer;
            }
        }
    }
    return lots;
}

function frontageSpans(min:number,max:number,maximum:number):Array<[number,number]> {
    const count=Math.ceil((max-min+8)/(maximum+8));
    const size=(max-min-(count-1)*8)/count;
    return Array.from({length:count},(_,i)=>[min+i*(size+8),min+i*(size+8)+size]);
}

/** Fill the actual street blocks with attached frontages, rather than placing
 * isolated towers at grid centers. Eight-unit service alleys divide long blocks;
 * the same returned footprints drive the detailed city renderer and collision.
 */
export function cityStreetBuildings(original:BuildingFootprint[]):BuildingFootprint[] {
    const cuts=[
        ...LEGACY_STREETS.map(r=>lot(r.x,r.z,r.w,r.d,1)),
        ...LANDMARK_LOTS,
        ...CITY_SPAWN_CLEARANCES.map(([x,z])=>lot(x,z,4,4)),
        ...INFILL.map(b=>lot(b.cx,b.cz,b.bw,b.bd,6)),
    ];
    let available:Lot[]=[{x0:-189,x1:159,z0:-189,z1:159}];
    for(const cut of cuts)available=available.flatMap(area=>subtract(area,cut));
    available=mergeLots(available);
    const buildings:BuildingFootprint[]=[...INFILL];
    const heights=[9,12,16,24,32,42,24,16,55,32];
    let frontage=0;
    for(const area of available){
        // Skinny remnants become service passages, never implausible sliver buildings.
        if(area.x1-area.x0<9 || area.z1-area.z0<9)continue;
        for(const [x0,x1] of frontageSpans(area.x0,area.x1,54)){
            for(const [z0,z1] of frontageSpans(area.z0,area.z1,44)){
                const segments=Math.max(1,Math.round((x1-x0)/24));
                const width=(x1-x0)/segments;
                for(let segment=0;segment<segments;segment++){
                    const seedHeight=original.length?Math.floor(original[frontage%original.length].bh):frontage;
                    buildings.push({cx:x0+(segment+.5)*width,cz:(z0+z1)/2,bw:width,bd:z1-z0,
                        bh:heights[(frontage+seedHeight)%heights.length]});
                    frontage++;
                }
            }
        }
    }
    // Layout 3 removes, never reshuffles: buildings in the new districts or on new streets go,
    // and every other building keeps its layout-2 height.
    // New lanes trim the buildings they cross, keeping the part on each side when it is still a building.
    const lanes=CITY_STREETS.filter(r=>!LEGACY_STREETS.some(l=>Math.abs(r.x-l.x)<=(l.w-r.w)/2&&Math.abs(r.z-l.z)<=(l.d-r.d)/2))
        .map(r=>({xmin:r.x-r.w/2-1,xmax:r.x+r.w/2+1,zmin:r.z-r.d/2-1,zmax:r.z+r.d/2+1}));
    const districts=[HARBOUR,DOCKS_LOT,PRECINCT_LOT];
    return buildings.map((b,i)=>({...b,bh:neighborhoodHeight(b.cx,b.cz,b.bh,i)}))
        .filter(b=>!districts.some(r=>overlaps(r,b.cx,b.cz,b.bw,b.bd)))
        .flatMap(b=>lanes.reduce<BuildingFootprint[]>((kept,lane)=>kept.flatMap(p=>trim(p,lane)),[b]));
}

/** What remains of a footprint beside a lane; slivers under 9 units go. */
function trim(b:BuildingFootprint,lane:{xmin:number;xmax:number;zmin:number;zmax:number}):BuildingFootprint[] {
    const x0=b.cx-b.bw/2,x1=b.cx+b.bw/2,z0=b.cz-b.bd/2,z1=b.cz+b.bd/2;
    if(x1<=lane.xmin||x0>=lane.xmax||z1<=lane.zmin||z0>=lane.zmax)return [b];
    const alongZ=lane.zmax-lane.zmin>lane.xmax-lane.xmin;
    const parts=alongZ
        ?[[x0,Math.min(x1,lane.xmin)],[Math.max(x0,lane.xmax),x1]].map(([a,c])=>({...b,cx:(a!+c!)/2,bw:c!-a!}))
        :[[z0,Math.min(z1,lane.zmin)],[Math.max(z0,lane.zmax),z1]].map(([a,c])=>({...b,cz:(a!+c!)/2,bd:c!-a!}));
    return parts.filter(p=>p.bw>=9&&p.bd>=9);
}
