import type { GrayboxBox } from './grayboxLayout';
import type { Vec3Data } from './networkProtocol';

/** Playable civic interiors. Parent owns graybox/neighborhood visuals and imports these. */
export interface LandmarkInterior {
    id: string;
    name: string;
    cx: number;
    cz: number;
    w: number;
    d: number;
    levels: number[];
}

export interface LandmarkStairLight {
    x: number;
    y: number;
    z: number;
    color: number;
}

const WALL = 1.2;
const FLOOR_H = 0.6;
const RAMP_H = 0.6;
const RISE = 8;
const RUN = 22;
const STAIR_W = 6;
const DOOR_H = 7;
const ROOF = 24;
const STEP_COUNT = 32;
const TREAD_H = 0.14;
const PLAYABLE = [0, 8, 16] as const;
const STAIR_LIGHT = 0xe8b070;

type WallFace = 'north' | 'south' | 'east' | 'west';
type StairWall = 'west' | 'east';

interface Opening {
    wall: WallFace;
    center: number;
    width: number;
    height: number;
}

interface LandmarkSpec {
    id: string;
    name: string;
    xmin: number;
    xmax: number;
    zmin: number;
    zmax: number;
    wall: number;
    floor: number;
    ramp: number;
    tread: number;
    upper: number;
    openings: Opening[];

}

export const LANDMARK_INTERIORS: LandmarkInterior[] = [
    {id:'records', name:'Records Hall', cx:-16, cz:-59, w:64, d:44, levels:[...PLAYABLE]},
    {id:'icebox', name:'Icebox', cx:130, cz:-61, w:48, d:60, levels:[0, 8]},
    {id:'needleworks', name:'Needleworks', cx:-105, cz:82, w:76, d:52, levels:[...PLAYABLE]},
    {id:'pump', name:'Pumping Station', cx:125, cz:118, w:50, d:38, levels:[0, 8]},
];

const SPECS: LandmarkSpec[] = [
    {
        id:'records', name:'Records Hall',
        xmin:-48, xmax:16, zmin:-81, zmax:-37,
        wall:0x1c1824, floor:0x24202c, ramp:0x343038, tread:0x4a434e, upper:0x29232f,
        openings:[
            {wall:'south', center:-16, width:10, height:DOOR_H},
            {wall:'north', center:-16, width:8, height:DOOR_H},
            {wall:'west', center:-59, width:8, height:DOOR_H},
        ],
    },
    {
        id:'icebox', name:'Icebox',
        xmin:106, xmax:154, zmin:-91, zmax:-31,
        wall:0x171e29, floor:0x202a36, ramp:0x2a3844, tread:0x3d4e58, upper:0x202a36,
        openings:[
            {wall:'south', center:130, width:12, height:DOOR_H},
            {wall:'east', center:-48, width:10, height:DOOR_H},
            {wall:'north', center:130, width:8, height:DOOR_H},
        ],
    },
    {
        id:'needleworks', name:'Needleworks',
        xmin:-143, xmax:-67, zmin:56, zmax:108,
        wall:0x211a25, floor:0x2a202c, ramp:0x3a2d39, tread:0x4e3d4c, upper:0x2a202c,
        openings:[
            {wall:'south', center:-105, width:12, height:DOOR_H},
            {wall:'east', center:82, width:10, height:DOOR_H},
            {wall:'north', center:-105, width:8, height:DOOR_H},
        ],
    },
    {
        id:'pump', name:'Pumping Station',
        xmin:100, xmax:150, zmin:99, zmax:137,
        wall:0x1c1b24, floor:0x282430, ramp:0x302c37, tread:0x3f3845, upper:0x23202c,
        openings:[
            {wall:'south', center:125, width:10, height:DOOR_H},
            {wall:'north', center:125, width:8, height:DOOR_H},
            {wall:'east', center:118, width:8, height:DOOR_H},
        ],
    },
];

/** A short exit leg derived from the same openings that cut the collision walls.
 * Keep upper-floor traversal on the existing stairs; roofs and in-building goals
 * retain their normal route. Extend outside the facade so waypoint tolerance
 * cannot declare the exit reached while the body is still inside. */
export function landmarkExitPoint(from:Vec3Data,to:Vec3Data):Vec3Data {
    const index=SPECS.findIndex((h,i)=>from.y>=-.5&&from.y<Math.max(...LANDMARK_INTERIORS[i].levels)+4&&
        from.x>h.xmin-1&&from.x<h.xmax+1&&from.z>h.zmin-1&&from.z<h.zmax+1);
    if(index<0)return to;
    const h=SPECS[index];
    if(to.x>=h.xmin-1&&to.x<=h.xmax+1&&to.z>=h.zmin-1&&to.z<=h.zmax+1)return to;
    const exits=h.openings.map(o=>o.wall==='north'?{x:o.center,y:0,z:h.zmin-4}:
        o.wall==='south'?{x:o.center,y:0,z:h.zmax+4}:
        o.wall==='west'?{x:h.xmin-4,y:0,z:o.center}:{x:h.xmax+4,y:0,z:o.center});
    const cost=(p:Vec3Data)=>Math.hypot(from.x-p.x,from.z-p.z)+Math.hypot(to.x-p.x,to.z-p.z);
    return exits.reduce((best,p)=>cost(p)<cost(best)?p:best);
}

interface Rect {xmin:number; xmax:number; zmin:number; zmax:number}

function make(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rx=0,rz=0,extra:Partial<GrayboxBox>={}):GrayboxBox {
    return {x,y,z,w,h,d,color,rx,rz,...extra};
}

function subtractRect(r:Rect, hole:Rect):Rect[] {
    const ix0=Math.max(r.xmin,hole.xmin), ix1=Math.min(r.xmax,hole.xmax);
    const iz0=Math.max(r.zmin,hole.zmin), iz1=Math.min(r.zmax,hole.zmax);
    if(ix0>=ix1 || iz0>=iz1) return [r];
    const out:Rect[]=[];
    if(r.xmin<ix0) out.push({xmin:r.xmin,xmax:ix0,zmin:r.zmin,zmax:r.zmax});
    if(ix1<r.xmax) out.push({xmin:ix1,xmax:r.xmax,zmin:r.zmin,zmax:r.zmax});
    if(r.zmin<iz0) out.push({xmin:ix0,xmax:ix1,zmin:r.zmin,zmax:iz0});
    if(iz1<r.zmax) out.push({xmin:ix0,xmax:ix1,zmin:iz1,zmax:r.zmax});
    return out.filter(q=>q.xmax-q.xmin>0.08 && q.zmax-q.zmin>0.08);
}

function punch(rects:Rect[], hole:Rect):Rect[] {
    return rects.flatMap(r=>subtractRect(r,hole));
}

function toLocal(b:GrayboxBox,x:number,y:number,z:number) {
    const dx=x-b.x, dy=y-b.y, dz=z-b.z;
    const cx=Math.cos(b.rx), sx=Math.sin(b.rx);
    const cz=Math.cos(b.rz), sz=Math.sin(b.rz);
    const px=cz*dx+sz*dy, py=-sz*dx+cz*dy, pz=dz;
    return {x:px, y:cx*py+sx*pz, z:-sx*py+cx*pz};
}

function fromLocal(b:GrayboxBox,lx:number,ly:number,lz:number) {
    const cx=Math.cos(b.rx), sx=Math.sin(b.rx);
    const cz=Math.cos(b.rz), sz=Math.sin(b.rz);
    const y1=cx*ly-sx*lz, z1=sx*ly+cx*lz;
    return {x:b.x+cz*lx-sz*y1, y:b.y+sz*lx+cz*y1, z:b.z+z1};
}

function addWall(boxes:GrayboxBox[], face:WallFace, spec:LandmarkSpec, opening?:Opening) {
    const {xmin,xmax,zmin,zmax,wall}=spec;
    const y0=0, y1=ROOF, mid=(y0+y1)/2, h=y1-y0;
    const alongX=face==='north'||face==='south';
    const u=alongX ? (face==='south'?zmax-WALL/2:zmin+WALL/2) : (face==='east'?xmax-WALL/2:xmin+WALL/2);
    const v0=alongX?xmin:zmin, v1=alongX?xmax:zmax;
    const push=(vc:number,vw:number,yc:number,yh:number)=>{
        boxes.push(alongX ? make(vc,yc,u,vw,yh,WALL,wall) : make(u,yc,vc,WALL,yh,vw,wall));
    };
    if(!opening){push((v0+v1)/2,v1-v0,mid,h);return;}
    const o0=opening.center-opening.width/2, o1=opening.center+opening.width/2;
    if(o0>v0) push((v0+o0)/2,o0-v0,mid,h);
    if(o1<v1) push((o1+v1)/2,v1-o1,mid,h);
    if(opening.height<h){
        const ly0=y0+opening.height;
        push(opening.center,opening.width,(ly0+y1)/2,y1-ly0);
    }
}

function innerRect(spec:LandmarkSpec):Rect {
    return {xmin:spec.xmin+WALL, xmax:spec.xmax-WALL, zmin:spec.zmin+WALL, zmax:spec.zmax-WALL};
}

function stairBand(spec:LandmarkSpec, wall:StairWall, inset:number) {
    const innerX0=spec.xmin+WALL, innerX1=spec.xmax-WALL;
    const x=wall==='west' ? innerX0+inset+STAIR_W/2 : innerX1-inset-STAIR_W/2;
    return {x, xmin:x-STAIR_W/2, xmax:x+STAIR_W/2};
}

function stairRun(spec:LandmarkSpec, dir:1|-1) {
    const innerZ0=spec.zmin+WALL, innerZ1=spec.zmax-WALL;
    if(dir===1){
        const z0=innerZ0+0.7;
        return {z0, z1:z0+RUN, dir};
    }
    const z1=innerZ1-0.7;
    return {z0:z1-RUN, z1, dir};
}

function addStair(boxes:GrayboxBox[], treads:GrayboxBox[], spec:LandmarkSpec, from:number, wall:StairWall, inset:number, dir:1|-1, run=stairRun(spec,dir)) {
    const band=stairBand(spec,wall,inset);
    const slope=Math.atan(RISE/RUN);
    const length=Math.hypot(RUN,RISE);
    const lift=(RAMP_H/2)*Math.cos(slope);
    const rx=dir===1 ? -slope : slope;
    boxes.push(make(
        band.x, from+RISE/2-lift, (run.z0+run.z1)/2,
        STAIR_W, RAMP_H, length, spec.ramp, rx, 0, {hidden:true},
    ));
    const stepRun=RUN/STEP_COUNT;
    for(let i=0;i<STEP_COUNT;i++){
        const t=(i+0.5)/STEP_COUNT;
        const z=dir===1 ? run.z0+t*RUN : run.z1-t*RUN;
        const yTop=from+t*RISE;
        treads.push(make(band.x, yTop+0.02-TREAD_H/2, z, STAIR_W-0.15, TREAD_H, stepRun+0.16, spec.tread));
    }
    return {xmin:band.xmin-0.35, xmax:band.xmax+0.35, zmin:run.z0-0.25, zmax:run.z1+0.25};
}

function hallCenter(spec:LandmarkSpec) {
    return {cx:(spec.xmin+spec.xmax)/2, cz:(spec.zmin+spec.zmax)/2};
}

function addFloorRects(boxes:GrayboxBox[], spec:LandmarkSpec, level:number, rects:Rect[]) {
    for(const r of rects){
        boxes.push(make((r.xmin+r.xmax)/2, level-FLOOR_H/2, (r.zmin+r.zmax)/2, r.xmax-r.xmin, FLOOR_H, r.zmax-r.zmin, spec.floor));
    }
}

function addEnclosure(boxes:GrayboxBox[], spec:LandmarkSpec) {
    const openingAt=(wall:WallFace)=>spec.openings.find(o=>o.wall===wall);
    addWall(boxes,'south',spec,openingAt('south'));
    addWall(boxes,'north',spec,openingAt('north'));
    addWall(boxes,'east',spec,openingAt('east'));
    addWall(boxes,'west',spec,openingAt('west'));
    const {cx,cz}=hallCenter(spec);
    boxes.push(make(cx, ROOF+FLOOR_H/2, cz, spec.xmax-spec.xmin-0.2, FLOOR_H, spec.zmax-spec.zmin-0.2, spec.floor));
    // The upper mass starts above the ceiling slab, avoiding two coplanar
    // undersides fighting for the same depth pixels inside every hall.
    boxes.push(make(cx, 30+FLOOR_H/2, cz, spec.xmax-spec.xmin, 12-FLOOR_H, spec.zmax-spec.zmin, spec.upper, 0, 0, {building:true}));
}

/** One collision proxy per detailed piece, with y at the centre. */
export interface LandmarkFurnishing {
    kind:'archive'|'desk'|'cold-rack'|'workbench'|'pump'|'console';
    x:number; y:number; z:number; w:number; h:number; d:number;
}
export const LANDMARK_FURNISHINGS:LandmarkFurnishing[] = [
    {kind:'desk', x:-30,y:0.8,z:-43,w:8,h:1.6,d:3},
    {kind:'desk', x:-2,y:0.8,z:-43,w:8,h:1.6,d:3},
    ...[0,8,16].flatMap(y=>[
        {kind:'archive' as const,x:-44,y:y+2,z:-70,w:2,h:4,d:7},
        {kind:'archive' as const,x:12,y:y+2,z:-70,w:2,h:4,d:7},
        {kind:'archive' as const,x:-25,y:y+2,z:-77,w:8,h:4,d:2},
        {kind:'archive' as const,x:-7,y:y+2,z:-77,w:8,h:4,d:2},
    ]),
    {kind:'cold-rack',x:149,y:2.3,z:-75,w:4,h:4.6,d:8},
    {kind:'cold-rack',x:149,y:2.3,z:-58,w:4,h:4.6,d:8},
    {kind:'cold-rack',x:116,y:10,z:-75,w:3,h:4,d:8},
    {kind:'desk',x:136,y:8.8,z:-86,w:7,h:1.6,d:3},
    ...[0,8,16].flatMap(y=>[
        {kind:'workbench' as const,x:-117,y:y+0.8,z:62,w:8,h:1.6,d:3},
        {kind:'workbench' as const,x:-92,y:y+0.8,z:102,w:10,h:1.6,d:3},
    ]),
    {kind:'workbench',x:-118,y:0.8,z:92,w:9,h:1.6,d:4},
    {kind:'workbench',x:-91,y:8.8,z:87,w:9,h:1.6,d:4},
    {kind:'workbench',x:-119,y:16.8,z:88,w:9,h:1.6,d:4},
    {kind:'pump',x:118,y:2.3,z:113,w:5,h:4.6,d:7},
    {kind:'pump',x:132,y:2.3,z:113,w:5,h:4.6,d:7},
    {kind:'pump',x:132,y:2.3,z:129,w:5,h:4.6,d:7},
    {kind:'console',x:116,y:1,z:133,w:6,h:2,d:2},
    {kind:'console',x:144,y:9,z:126,w:3,h:2,d:6},
];

/** Thin room dividers retain full-height door-sized gaps, without tiny physics detail. */
function divider(boxes:GrayboxBox[],spec:LandmarkSpec,level:number,x:number,z:number,w:number,d:number) {
    boxes.push(make(x,level+3.3,z,w,6.6,d,spec.wall));
}
function rail(boxes:GrayboxBox[],spec:LandmarkSpec,level:number,x:number,z:number,w:number,d:number) {
    boxes.push(make(x,level+0.55,z,w,1.1,d,spec.ramp));
}
function wellRails(boxes:GrayboxBox[],spec:LandmarkSpec,level:number,r:Rect) {
    rail(boxes,spec,level,r.xmin-0.18,(r.zmin+r.zmax)/2,0.36,r.zmax-r.zmin);
    rail(boxes,spec,level,r.xmax+0.18,(r.zmin+r.zmax)/2,0.36,r.zmax-r.zmin);
    rail(boxes,spec,level,(r.xmin+r.xmax)/2,r.zmin-0.18,r.xmax-r.xmin,0.36);
    rail(boxes,spec,level,(r.xmin+r.xmax)/2,r.zmax+0.18,r.xmax-r.xmin,0.36);
}

function addRecords(boxes:GrayboxBox[],treads:GrayboxBox[],spec:LandmarkSpec) {
    addEnclosure(boxes,spec);
    const rearRun={z0:-74.5,z1:-52.5,dir:-1 as const};
    const well0=addStair(boxes,treads,spec,0,'west',6.8,-1,rearRun);
    const well1=addStair(boxes,treads,spec,8,'east',5.8,-1,rearRun);
    const readingWell={xmin:-28,xmax:-4,zmin:-68,zmax:-50};
    const inner=innerRect(spec);
    addFloorRects(boxes,spec,0,[inner]);
    for(const level of [8,16]) {
        const rects=punch(punch([inner],readingWell),level===8?well0:well1);
        addFloorRects(boxes,spec,level,rects);
        wellRails(boxes,spec,level,readingWell);
    }
    // The ten-metre front lobby opens into a reading hall; side rooms have
    // broad doorways and the rear crosshall links both stair landings.
    for(const level of [0,8,16]) {
        divider(boxes,spec,level,-44.4,-48,4.8,0.7);
        divider(boxes,spec,level,-30.9,-48,4.2,0.7);
        divider(boxes,spec,level,-0.6,-48,5.2,0.7);
        divider(boxes,spec,level,12.4,-48,4.8,0.7);
        divider(boxes,spec,level,-28.5,-66.5,0.7,9);
        divider(boxes,spec,level,-3.5,-66.5,0.7,9);
        divider(boxes,spec,level,-28.5,-52,0.7,4);
        divider(boxes,spec,level,-3.5,-52,0.7,4);
    }
}

function addIcebox(boxes:GrayboxBox[],treads:GrayboxBox[],spec:LandmarkSpec) {
    addEnclosure(boxes,spec);
    const well=addStair(boxes,treads,spec,0,'west',0.35,-1,{z0:-65,z1:-43,dir:-1});
    const inner=innerRect(spec);
    addFloorRects(boxes,spec,0,[inner]);
    const west={xmin:inner.xmin,xmax:121.2,zmin:inner.zmin,zmax:inner.zmax};
    const rear={xmin:121.2,xmax:inner.xmax,zmin:inner.zmin,zmax:-81.8};
    addFloorRects(boxes,spec,8,punch([west,rear],well));
    rail(boxes,spec,8,121.02,-57,0.36,49.6);
    rail(boxes,spec,8,137,-81.98,31.6,0.36);
    // Two distinct cold rooms open westward into the central loading aisle.
    // The east street door at z=-48 remains a clear cross passage.
    for(const z of [-84,-67,-50]) divider(boxes,spec,0,144.7,z,16.2,0.7);
    for(const z of [-82,-69,-65,-52]) divider(boxes,spec,0,136.6,z,0.7,4);
}

function addNeedleworks(boxes:GrayboxBox[],treads:GrayboxBox[],spec:LandmarkSpec) {
    addEnclosure(boxes,spec);
    const well0=addStair(boxes,treads,spec,0,'east',2.4,1,{z0:59,z1:81,dir:1});
    const well1=addStair(boxes,treads,spec,8,'west',6.8,-1,{z0:64,z1:86,dir:-1});
    const inner=innerRect(spec);
    const shaft1={xmin:-126,xmax:-108,zmin:73,zmax:92};
    const shaft2={xmin:-104,xmax:-84,zmin:71,zmax:92};
    addFloorRects(boxes,spec,0,[inner]);
    addFloorRects(boxes,spec,8,punch(punch([inner],shaft1),well0));
    addFloorRects(boxes,spec,16,punch(punch([inner],shaft2),well1));
    wellRails(boxes,spec,8,shaft1);
    wellRails(boxes,spec,16,shaft2);
    for(const level of [0,8,16]) {
        // North sample room and south cutting room flank a broad main aisle.
        divider(boxes,spec,level,-123,68,7,0.7);
        divider(boxes,spec,level,-112,68,4,0.7);
        divider(boxes,spec,level,-126.5,62.6,0.7,10.8);
        divider(boxes,spec,level,-110,62.6,0.7,10.8);
        divider(boxes,spec,level,-98,97,3,0.7);
        divider(boxes,spec,level,-84,97,13,0.7);
        divider(boxes,spec,level,-99.5,102,0.7,9.6);
        divider(boxes,spec,level,-77.5,102,0.7,9.6);
    }
}

function addPump(boxes:GrayboxBox[],treads:GrayboxBox[],spec:LandmarkSpec) {
    addEnclosure(boxes,spec);
    const well=addStair(boxes,treads,spec,0,'west',0.35,1,{z0:109,z1:131,dir:1});
    const inner=innerRect(spec);
    addFloorRects(boxes,spec,0,[inner]);
    const west={xmin:inner.xmin,xmax:111.8,zmin:inner.zmin,zmax:inner.zmax};
    const east={xmin:138.2,xmax:inner.xmax,zmin:inner.zmin,zmax:inner.zmax};
    const rear={xmin:111.8,xmax:138.2,zmin:inner.zmin,zmax:106.8};
    addFloorRects(boxes,spec,8,punch([west,east,rear],well));
    rail(boxes,spec,8,111.62,121.3,0.36,29);
    rail(boxes,spec,8,138.38,121.3,0.36,29);
    rail(boxes,spec,8,125,106.62,26.4,0.36);
    // Glazed control-booth structure, away from the main entrance and stair.
    divider(boxes,spec,0,120.6,129.5,0.7,9);
    divider(boxes,spec,0,112.2,125,1,0.7);
    divider(boxes,spec,0,119.6,125,2,0.7);
}

function lightsOnRamp(ramp:GrayboxBox):LandmarkStairLight[] {
    const along=ramp.rx ? ramp.d : ramp.w;
    return [0,0.5,1].map(t=>{
        const p=fromLocal(ramp,0,ramp.h/2,(t-0.5)*along);
        return {x:p.x, y:p.y+0.28, z:p.z, color:STAIR_LIGHT};
    });
}

interface Built {boxes:GrayboxBox[]; treads:GrayboxBox[]; lights:LandmarkStairLight[]}
let cache:Built|null=null;

function build():Built {
    const boxes:GrayboxBox[]=[];
    const treads:GrayboxBox[]=[];
    for(const spec of SPECS){
        if(spec.id==='records') addRecords(boxes,treads,spec);
        else if(spec.id==='icebox') addIcebox(boxes,treads,spec);
        else if(spec.id==='needleworks') addNeedleworks(boxes,treads,spec);
        else addPump(boxes,treads,spec);
    }
    for(const f of LANDMARK_FURNISHINGS) boxes.push(make(f.x,f.y,f.z,f.w,f.h,f.d,0x34333b,0,0,{hidden:true}));
    const lights=boxes.filter(b=>b.hidden && (b.rx || b.rz)).flatMap(lightsOnRamp);
    return {boxes,treads,lights};
}

function assembled():Built {
    return cache ?? (cache=build());
}

export function landmarkBoxes():GrayboxBox[] {
    return assembled().boxes.slice();
}

export function landmarkStairDetails():GrayboxBox[] {
    return assembled().treads.slice();
}

export const LANDMARK_STAIR_LIGHTS: LandmarkStairLight[] = assembled().lights;

function onFloor(b:GrayboxBox,x:number,y:number,z:number) {
    if(b.rx || b.rz || (!b.hidden && b.h>=4)) return false;
    const top=b.y+b.h/2;
    if(top>20) return false;
    return Math.abs(x-b.x)<=b.w/2+0.45 && Math.abs(z-b.z)<=b.d/2+0.45 && y>=top-0.5 && y<=top+2;
}

function onRamp(b:GrayboxBox,x:number,y:number,z:number) {
    if(!b.hidden || (!b.rx && !b.rz)) return false;
    const local=toLocal(b,x,y,z);
    return Math.abs(local.x)<=b.w/2+0.45 && Math.abs(local.z)<=b.d/2+0.45 && local.y>=b.h/2-0.5 && local.y<=b.h/2+2;
}

/** True when a loose case is resting on a playable landmark floor, landing, crate, or stair ramp. */
export function isReachableLandmarkPosition(x:number,y:number,z:number):boolean {
    if(y>=23 || y<-1) return false;
    for(const b of assembled().boxes){
        if(onFloor(b,x,y,z) || onRamp(b,x,y,z)) return true;
    }
    return false;
}
