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
    // North branches: under the -60 avenue to the precinct, and on from Maintenance under the 70 avenue to the docks.
    {xmin:-64, xmax:-56, zmin:-118, zmax:-HALF},
    {xmin:-76, xmax:-56, zmin:-118, zmax:-110},
    {xmin:66, xmax:74, zmin:-118, zmax:-42},
    {xmin:48, xmax:74, zmin:-118, zmax:-110},
];

/** Place names for SEWER_HALLS, index for index (docs/city-map.md). Overlaps resolve to the later hall. */
export const SEWER_HALL_NAMES = ['trunk-ew','trunk-south','junction','west-loop','west-loop','west-loop','west-loop','east-spur','east-spur','maintenance',
    'precinct-branch','precinct-branch','docks-branch','docks-branch'] as const;

/** A walk-in pipe ramp. `direction` points from the hall out to the street mouth along `axis`;
 * `sign` is the enamel plate over the mouth. */
export interface SewerEntry {x:number; z:number; name:string; axis:'x'|'z'; direction:1|-1; sign?:string}
export const SEWER_ENTRIES: readonly SewerEntry[] = [
    {x:-138, z:0, name:'Gate', axis:'x', direction:-1},
    {x:138, z:0, name:'Icebox', axis:'x', direction:1},
    {x:0, z:138, name:'Alley', axis:'z', direction:1},
    {x:-54, z:66, name:'Needleworks', axis:'z', direction:1},
    // Inside PRECINCT_SEWER_EXIT and DOCKS_SEWER_EXIT (northPlan); both mouths open north.
    {x:-72, z:-144, name:'Precinct', axis:'z', direction:-1, sign:'PRECINCT SALLY PORT'},
    {x:52, z:-144, name:'Docks', axis:'z', direction:-1, sign:'DOCKSIDE OUTFALL'},
];

/** Where each ramp foot meets its hall, measured along the entry axis. */
const rampFoot=(e:SewerEntry)=>e[e.axis]-e.direction*(RUN+2);

/** Full-width ends that open onto ramps — no closing wall. */
const OPENINGS: Rect[] = SEWER_ENTRIES.map(e=>e.axis==='x'
    ?{xmin:rampFoot(e), xmax:rampFoot(e), zmin:e.z-HALF, zmax:e.z+HALF}
    :{xmin:e.x-HALF, xmax:e.x+HALF, zmin:rampFoot(e), zmax:rampFoot(e)});

/** Street openings share their shape with the physical and visible pipe shells. */
export const SEWER_MANHOLE = {x:72,z:0,halfWidth:2,shaftBottom:-3,floorY:FLOOR} as const;
export const SEWER_PIPE_PORTAL = {mouthX:-142,endX:-112,z:0,radius:4.5,springY:.65} as const;
export const SEWER_PIPE_ENTRANCES = SEWER_ENTRIES.map(entry=>({
    ...entry,radius:SEWER_PIPE_PORTAL.radius,springY:SEWER_PIPE_PORTAL.springY,length:30,
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
    {x:-60, z:-26}, {x:-60, z:-50}, {x:-60, z:-74}, {x:-60, z:-98}, {x:-68, z:-114},
    {x:70, z:-60}, {x:70, z:-84}, {x:70, z:-108}, {x:56, z:-114},
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
    // Ramp feet split the hall edges they open, so the rest of that edge keeps its wall.
    const xs=unique([...SEWER_HALLS,...OPENINGS].flatMap(r=>[r.xmin,r.xmax]));
    const zs=unique([...SEWER_HALLS,...OPENINGS].flatMap(r=>[r.zmin,r.zmax]));
    const walls:GrayboxBox[]=[];
    const y=FLOOR+WALK/2;
    const probe=1e-3;
    // Collinear walls facing the same way merge into one run: fewer static bodies, same surface.
    // `side` is +1/-1 for a wall on the far/near side of the line, 0 for open.
    const runs=(cuts:number[],lines:number[],side:(line:number,mid:number)=>number,push:(line:number,side:number,a:number,b:number)=>void)=>{
        for(const line of lines){
            let start=cuts[0],current=0;
            for(let i=0;i<cuts.length-1;i++){
                const s=side(line,(cuts[i]+cuts[i+1])/2);
                if(s===current)continue;
                if(current)push(line,current,start,cuts[i]);
                start=cuts[i];current=s;
            }
            if(current)push(line,current,start,cuts[cuts.length-1]);
        }
    };
    const facing=(neg:boolean,pos:boolean,open:boolean)=>neg===pos||open?0:neg?1:-1;
    runs(xs,zs,(z,mid)=>facing(inside(SEWER_HALLS,mid,z-probe),inside(SEWER_HALLS,mid,z+probe),onOpening(mid,z)),
        (z,side,x0,x1)=>walls.push(make((x0+x1)/2,y,z+side*WALL/2,x1-x0,WALK,WALL,WALL_COLOR)));
    runs(zs,xs,(x,mid)=>facing(inside(SEWER_HALLS,x-probe,mid),inside(SEWER_HALLS,x+probe,mid),onOpening(x,mid)),
        (x,side,z0,z1)=>walls.push(make(x+side*WALL/2,y,(z0+z1)/2,WALL,WALK,z1-z0,WALL_COLOR)));
    return walls;
}

/** One tilted slab per entry, from the hall floor up to the street landing. */
function ramps():GrayboxBox[] {
    const slope=Math.atan(RISE/RUN);
    const length=Math.hypot(RUN,RISE);
    const y=FLOOR+RISE/2-(WALL/2)*Math.cos(slope);
    return SEWER_ENTRIES.map(e=>{
        const along=e[e.axis]-e.direction*(RUN/2+2);
        return e.axis==='x'?make(along,y,e.z,length,WALL,HALL,RAMP_COLOR,0,e.direction*slope)
            :make(e.x,y,along,HALL,WALL,length,RAMP_COLOR,-e.direction*slope,0);
    });
}

/** Street-height aprons under ENTRIES, filling the 4-unit cutout past each ramp top. */
function landings():GrayboxBox[] {
    const y=CEILING+WALL/2;
    return SEWER_ENTRIES.map(e=>e.axis==='x'?make(e.x,y,e.z,4,WALL,10,FLOOR_COLOR):make(e.x,y,e.z,10,WALL,4,FLOOR_COLOR));
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

/** The street hole over each ramp and landing, from the hall foot to two units past the entry point. */
export function sewerRampOpening(x:number, z:number):boolean {
    return SEWER_ENTRIES.some(e=>{
        const distance=4-((e.axis==='x'?x:z)-e[e.axis])*e.direction;
        return distance>=2 && distance<=RUN+6 && Math.abs(e.axis==='x'?z-e.z:x-e.x)<5;
    });
}
