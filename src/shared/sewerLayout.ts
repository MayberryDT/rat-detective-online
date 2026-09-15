import type {Vec3Data} from './networkProtocol';
import type { GrayboxBox } from './grayboxLayout';

/** Walk surface of the dry sewer; street underside sits at y = -1. */
const FLOOR = -7;
const CEILING = -1;
const HALL = 8;
const HALF = HALL / 2;
const WALL = 1;
const RISE = 7;
const RUN = 24;
const WALK = CEILING - FLOOR;

const FLOOR_COLOR = 0x1e2422;
const WALL_COLOR = 0x2a322f;
const CEILING_COLOR = 0x1a1e1c;
const RAMP_COLOR = 0x323a36;

/** Wall-hugging workbench and supply rack in Maintenance. Shared solids keep
 * the visible furniture, ball rebounds and bot navigation in agreement. */
export const SEWER_MAINTENANCE_FURNISHINGS: readonly GrayboxBox[] = [
    {x:69.45,y:-5.8,z:-37.2,w:.9,h:2.4,d:5.2,color:0x24323c,rx:0,rz:0},
    {x:66.4,y:-5.3,z:-30.45,w:3.2,h:3.4,d:.9,color:0x24323c,rx:0,rz:0},
];

interface Rect {xmin:number; xmax:number; zmin:number; zmax:number}

/** Hall rectangles. Overlaps at junctions are the open floorplan union. */
export const SEWER_HALLS: Rect[] = [
    {xmin:-112, xmax:112, zmin:-HALF, zmax:HALF},
    {xmin:-HALF, xmax:HALF, zmin:-HALF, zmax:112},
    {xmin:-6, xmax:6, zmin:-6, zmax:6},
    {xmin:-88, xmax:-80, zmin:-HALF, zmax:44},
    {xmin:-88, xmax:-58, zmin:36, zmax:44},
    {xmin:-50, xmax:4, zmin:36, zmax:44},
    {xmin:-58, xmax:-50, zmin:36, zmax:40},
    {xmin:44, xmax:52, zmin:-40, zmax:HALF},
    {xmin:52, xmax:68, zmin:-40, zmax:-32},
    {xmin:60, xmax:70, zmin:-42, zmax:-30},
];

/** Full-width ends that open onto ramps — no closing wall. */
const OPENINGS: Rect[] = [
    {xmin:112, xmax:112, zmin:-HALF, zmax:HALF},
    {xmin:-112, xmax:-112, zmin:-HALF, zmax:HALF},
    {xmin:-HALF, xmax:HALF, zmin:112, zmax:112},
    {xmin:-58, xmax:-50, zmin:40, zmax:40},
];

export const SEWER_ENTRIES = [
    {x:-138, z:0, name:'Gate', axis:'x' as const},
    {x:138, z:0, name:'Icebox', axis:'x' as const},
    {x:0, z:138, name:'Alley', axis:'z' as const},
    {x:-54, z:66, name:'Needleworks', axis:'z' as const},
];

/** Street openings share their shape with the physical and visible pipe shells. */
export const SEWER_MANHOLE = {x:72,z:0,halfWidth:2,shaftBottom:-3,floorY:FLOOR} as const;
export const SEWER_PIPE_PORTAL = {mouthX:-142,endX:-112,z:0,radius:4.5,springY:.65} as const;
export const SEWER_PIPE_ENTRANCES = SEWER_ENTRIES.map(entry=>({
    ...entry, direction:entry.axis==='x'?Math.sign(entry.x):1,
    radius:SEWER_PIPE_PORTAL.radius,springY:SEWER_PIPE_PORTAL.springY,length:30,
}));
export type SewerPipeEntrance = typeof SEWER_PIPE_ENTRANCES[number];

/** Distance runs inward from the street-facing mouth to the existing sewer hall. */
export function sewerPipePoint(entry:SewerPipeEntrance,distance:number,across=0){
    const along=entry[entry.axis]+entry.direction*(4-distance);
    return {x:entry.axis==='x'?along:entry.x+across,
        z:entry.axis==='z'?along:entry.z+across,
        floorY:-Math.max(0,Math.min(RUN,distance-6))*RISE/RUN};
}

/** Identify feet inside an authored ramp, excluding street/roof surfaces above it. */
export function sewerRampAt(p:Vec3Data):SewerPipeEntrance|undefined {
    return SEWER_PIPE_ENTRANCES.find(entry=>{
        const along=(p[entry.axis]-entry[entry.axis])*entry.direction,distance=4-along;
        const across=entry.axis==='x'?p.z-entry.z:p.x-entry.x;
        const floor=sewerPipePoint(entry,distance).floorY;
        return distance>=0&&distance<=30&&Math.abs(across)<4&&p.y>=floor-.65&&p.y<floor+2.5;
    });
}
/** Finish the current ramp before selecting another entrance or a street leg.
 * Distance from the near endpoint grows while crossing; it cannot decide whether
 * to return to that endpoint. Preserve objectives physically on this same ramp. */
export function sewerRampTravelPoint(from:Vec3Data,goal:Vec3Data):Vec3Data|undefined {
    const entry=sewerRampAt(from);
    if(!entry)return undefined;
    if(sewerRampAt(goal)===entry)return goal;
    const point=sewerPipePoint(entry,goal.y < -1?32:-2);
    return {x:point.x,y:point.floorY+.3,z:point.z};
}

/** Includes the approach so poles and street clutter never obstruct the entrance. */
export function sewerEntranceFootprint(x:number,z:number,padding=0):boolean {
    return SEWER_PIPE_ENTRANCES.some(entry=>{
        const along=(entry[entry.axis]+entry.direction*4-(entry.axis==='x'?x:z))*entry.direction;
        const across=entry.axis==='x'?z-entry.z:x-entry.x;
        return along>=-8-padding && along<=entry.length+padding && Math.abs(across)<entry.radius+.75+padding;
    });
}

/** Broad overlapping arch courses keep the skin continuous with a small static-body budget. */
export function sewerPipeBoxes():GrayboxBox[] {
    const boxes:GrayboxBox[]=[];
    const facets=8;
    // One level six-unit mouth and six four-unit descending courses per entrance.
    const spans=[{distance:3,length:6,drop:0},...Array.from({length:6},(_,i)=>({
        distance:8+i*4,length:4,drop:4*RISE/RUN,
    }))];
    for(const entry of SEWER_PIPE_ENTRANCES){
        const horizontal=entry.axis==='x';
        for(const span of spans){
            for(let i=0;i<facets;i++){
                const angle=(i+.5)*Math.PI/facets;
                const p=sewerPipePoint(entry,span.distance,Math.cos(angle)*entry.radius);
                // Project the course's vertical descent onto its radial and tangent axes.
                // Adjacent broad panels overlap rather than exposing a gap in the arch;
                // this keeps identical render/collision geometry without hundreds of slices.
                const facet=2*entry.radius*Math.tan(Math.PI/(facets*2))+span.drop*Math.abs(Math.cos(angle));
                const thickness=.36+span.drop*Math.sin(angle);
                boxes.push({...make(p.x,p.floorY+entry.springY+Math.sin(angle)*entry.radius,p.z,
                    horizontal?span.length+.12:facet,thickness,horizontal?facet:span.length+.12,0x394239,
                    horizontal?Math.PI/2-angle:0,horizontal?0:angle-Math.PI/2),hidden:true});
            }
            for(const side of [-1,1]){
                const p=sewerPipePoint(entry,span.distance,side*entry.radius);
                boxes.push({...make(p.x,p.floorY+.25,p.z,horizontal?span.length+.12:.66,1.1+span.drop,
                    horizontal?.66:span.length+.12,0x394239),hidden:true});
            }
        }
    }
    return boxes;
}

export function sewerGroundOpening(x:number,z:number):boolean {
    const m=SEWER_MANHOLE;
    return sewerRampOpening(x,z) || (Math.abs(x-m.x)<m.halfWidth && Math.abs(z-m.z)<m.halfWidth);
}

function ceilingPieces(r:Rect):Rect[] {
    const m=SEWER_MANHOLE;
    const x0=Math.max(r.xmin,m.x-m.halfWidth), x1=Math.min(r.xmax,m.x+m.halfWidth);
    const z0=Math.max(r.zmin,m.z-m.halfWidth), z1=Math.min(r.zmax,m.z+m.halfWidth);
    if(x0>=x1 || z0>=z1)return [r];
    return [
        {xmin:r.xmin,xmax:x0,zmin:r.zmin,zmax:r.zmax},
        {xmin:x1,xmax:r.xmax,zmin:r.zmin,zmax:r.zmax},
        {xmin:x0,xmax:x1,zmin:r.zmin,zmax:z0},
        {xmin:x0,xmax:x1,zmin:z1,zmax:r.zmax},
    ].filter(p=>p.xmax>p.xmin && p.zmax>p.zmin);
}

export const SEWER_LIGHTS = [
    {x:-100, z:0}, {x:-76, z:0}, {x:-52, z:0}, {x:-28, z:0}, {x:0, z:0},
    {x:28, z:0}, {x:52, z:0}, {x:76, z:0}, {x:100, z:0},
    {x:0, z:24}, {x:0, z:48}, {x:0, z:72}, {x:0, z:96},
    {x:-84, z:20}, {x:-84, z:40}, {x:-60, z:40}, {x:-36, z:40},
    {x:-54, z:40},
    {x:48, z:-18}, {x:48, z:-36}, {x:64, z:-36},
];

function make(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rx=0,rz=0):GrayboxBox {
    return {x,y,z,w,h,d,color,rx,rz};
}

function unique(values:number[]) {
    return [...new Set(values)].sort((a,b)=>a-b);
}

function inside(rects:Rect[], x:number, z:number, eps=1e-4) {
    return rects.some(r=>x>=r.xmin-eps && x<=r.xmax+eps && z>=r.zmin-eps && z<=r.zmax+eps);
}

function onOpening(x:number, z:number, eps=1e-4) {
    return OPENINGS.some(r=>x>=r.xmin-eps && x<=r.xmax+eps && z>=r.zmin-eps && z<=r.zmax+eps);
}

function boundaryWalls():GrayboxBox[] {
    const xs=unique(SEWER_HALLS.flatMap(r=>[r.xmin,r.xmax]));
    const zs=unique(SEWER_HALLS.flatMap(r=>[r.zmin,r.zmax]));
    const walls:GrayboxBox[]=[];
    const y=FLOOR+WALK/2;
    const probe=1e-3;

    for(let i=0;i<xs.length-1;i++){
        const x0=xs[i], x1=xs[i+1], w=x1-x0, mid=(x0+x1)/2;
        if(w<probe) continue;
        for(const z of zs){
            const neg=inside(SEWER_HALLS,mid,z-probe);
            const pos=inside(SEWER_HALLS,mid,z+probe);
            if(neg===pos || onOpening(mid,z)) continue;
            walls.push(make(mid,y,z+(neg?1:-1)*WALL/2,w,WALK,WALL,WALL_COLOR));
        }
    }
    for(let j=0;j<zs.length-1;j++){
        const z0=zs[j], z1=zs[j+1], d=z1-z0, mid=(z0+z1)/2;
        if(d<probe) continue;
        for(const x of xs){
            const neg=inside(SEWER_HALLS,x-probe,mid);
            const pos=inside(SEWER_HALLS,x+probe,mid);
            if(neg===pos || onOpening(x,mid)) continue;
            walls.push(make(x+(neg?1:-1)*WALL/2,y,mid,WALL,WALK,d,WALL_COLOR));
        }
    }
    return walls;
}

function ramps():GrayboxBox[] {
    const slope=Math.atan(RISE/RUN);
    const length=Math.hypot(RUN,RISE);
    const y=FLOOR+RISE/2-(WALL/2)*Math.cos(slope);
    return [
        make(124,y,0,length,WALL,HALL,RAMP_COLOR,0,slope),
        make(-124,y,0,length,WALL,HALL,RAMP_COLOR,0,-slope),
        make(0,y,124,HALL,WALL,length,RAMP_COLOR,-slope,0),
        make(-54,y,52,HALL,WALL,length,RAMP_COLOR,-slope,0),
    ];
}

/** Street-height aprons under ENTRIES, filling the 4-unit cutout past each ramp top. */
function landings():GrayboxBox[] {
    const y=CEILING+WALL/2;
    const along=4;
    const across=10;
    return [
        make(138,y,0,along,WALL,across,FLOOR_COLOR),
        make(-138,y,0,along,WALL,across,FLOOR_COLOR),
        make(0,y,138,across,WALL,along,FLOOR_COLOR),
        make(-54,y,66,across,WALL,along,FLOOR_COLOR),
    ];
}

export function sewerBoxes():GrayboxBox[] {
    const boxes:GrayboxBox[]=[];
    for(const r of SEWER_HALLS){
        const x=(r.xmin+r.xmax)/2, z=(r.zmin+r.zmax)/2, w=r.xmax-r.xmin, d=r.zmax-r.zmin;
        boxes.push(make(x,FLOOR-WALL/2,z,w,WALL,d,FLOOR_COLOR));
        for(const c of ceilingPieces(r))boxes.push(make((c.xmin+c.xmax)/2,CEILING+WALL/2,
            (c.zmin+c.zmax)/2,c.xmax-c.xmin,WALL,c.zmax-c.zmin,CEILING_COLOR));
    }
    boxes.push(...boundaryWalls(),...ramps(),...landings(),...sewerPipeBoxes(),...SEWER_MAINTENANCE_FURNISHINGS);
    const m=SEWER_MANHOLE, half=m.halfWidth, depth=-m.shaftBottom;
    for(const side of [-1,1]){
        boxes.push({...make(m.x+side*(half+.15),-depth/2,m.z,.3,depth,half*2+.6,WALL_COLOR),hidden:true});
        boxes.push({...make(m.x,-depth/2,m.z+side*(half+.15),half*2,depth,.3,WALL_COLOR),hidden:true});
    }
    return boxes;
}

export function sewerRampOpening(x:number, z:number):boolean {
    if(x>=112 && x<=140 && Math.abs(z)<5) return true;
    if(x<=-112 && x>=-140 && Math.abs(z)<5) return true;
    if(z>=112 && z<=140 && Math.abs(x)<5) return true;
    if(z>=40 && z<=68 && Math.abs(x+54)<5) return true;
    return false;
}
