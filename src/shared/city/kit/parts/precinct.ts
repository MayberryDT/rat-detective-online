import type { Finish, KitBuilder } from '../kit';
import { PRECINCT_HOUSE, PRECINCT_LOT, PRECINCT_RING, QUAY_EDGE_Z } from '../northPlan';
import { railing, stairRailing } from './docksKit';
import type { Vec3Data } from '../../../networkProtocol';
import type { PickupAnchor } from '../../../pickups';
import type { JurisdictionZone } from '../../../jurisdictionZones';

/**
 * The Panopticon: Precinct 13's brick front house on the -102 street and the round
 * cellblock behind it. Three tiers of cells face a central guard tower across an open
 * yard; iron flights cross the yard between the galleries, and a bridge on the top
 * gallery reaches the tower's lookout. Cell partitions are bars, so a ball riding the
 * curved outer wall glances round the whole ring through the cells.
 */
const {x:CX,z:CZ,radius:RING_R}=PRECINCT_RING;
const DEG=Math.PI/180;
/** Radii of the ring: open yard, gallery (to the cell bars), cells (to the outer wall). */
export const PRECINCT_YARD_RADIUS=10;
/** The galleries run from the yard's edge to the bars: about four clear units, so rats pass
 * and the bots' two-unit walk grid stays unbroken all the way round. */
const GALLERY_R=PRECINCT_YARD_RADIUS;
const BARS_R=15.2, CELL_BACK=19, WALL_T=1;
/** Middle of a cell: cots, and the slots in the drunk tank and the infirmary. */
const CELL_MID=17.1;
export const PRECINCT_TOWER_RADIUS=2.6;
const CABIN_R=3.6;
export const PRECINCT_LOOKOUT_Y=19;
/** The tower lamp: Most Wanted's searchlight beam starts here. */
export const PRECINCT_SEARCHLIGHT={x:CX,y:24.4,z:CZ} as const;
const FLOORS=[0,8,16] as const;
const CEILING=7.4;
/** Cell slots: twenty per tier, slot 0 centred on +x (east), counter-clockwise seen from above. */
const SLOTS=20, SLOT=Math.PI*2/SLOTS;
/** Ground-floor gate passages: the east sally port (to the sewer ramp), the west yard gate and the house gate (south). */
const GATE_SLOTS=[0,10,15];
const GATE_LABELS:Record<number,string>={0:'CELLBLOCK · EAST GATE',10:'CELLBLOCK · YARD GATE',15:'CELLBLOCK · NO VISITORS'};
/** Cells with no front at all: the drunk tank (a case spawn) and the infirmary (Quick Fix). */
const DRUNK_TANK=12, INFIRMARY=5;
const OPEN_FRONT:Record<string,true>={[`0:${DRUNK_TANK}`]:true,[`8:${INFIRMARY}`]:true};

/**
 * The lineup room: closed on every side; the north wall carries the height chart over a
 * low stage (top at `y`, `stageDepth` deep), and the one-way glass is its south wall onto
 * the observation room. `wallZ` is the chart wall's inner face; the room runs `depth` south of it.
 */
export const PRECINCT_LINEUP={x:-88.4,y:.6,wallZ:-127,stageDepth:3.4,halfWidth:7.4,depth:9.6,height:CEILING,
    glass:{xmin:-93,xmax:-83.8,ymin:1.2,ymax:4.8,z:-117.4}} as const;

const polar=(a:number,r:number)=>({x:CX+Math.cos(a)*r,z:CZ-Math.sin(a)*r});
/** True when angle `a` (radians) lies in the degree range [from,to]. */
const inRange=(a:number,[from,to]:readonly [number,number])=>((a/DEG-from)%360+360)%360<=((to-from)%360+360)%360;

/**
 * The yard flights, relative to the ring centre: 0→8 on the west rising north, 8→16 on the
 * east rising south, each 8 over 20 (about 22°), passing either side of the tower's shaft.
 * A flight's foot stands FLIGHT_REACH out on its gallery; it tops out just inside the yard's
 * edge on the far side (arriving under the next gallery's lip would bang a rat's head on it)
 * and a LANDING carries on over that edge. The ring's roof is reached across the house roof.
 */
const FLIGHT_W=3, FLIGHT_RUN=20, FLIGHT_X=4.6, FLIGHT_REACH=12.4, LANDING=2.6;
/** Rail gaps (degrees, rails of 40 chords) where the flights and the tower bridge cross each gallery edge. */
const RAIL_GAPS:Record<number,Array<[number,number]>>={
    8:[[103,131],[49,77]],
    16:[[283,311],[67,95]],
};
/** The lookout bridge leaves gallery 16 on this bearing (degrees), between two cells. */
const BRIDGE_DEG=81, BRIDGE_RUN=8;

export function precinct(k:KitBuilder):void {
    house(k);
    ring(k);
    tower(k);
    yard(k);
    seawall(k);
}

// ---------------------------------------------------------------- shared fittings

/** An iron rail between two plan points: a collider (stops rats and low balls) and a light look. */
function rail(k:KitBuilder,x0:number,z0:number,x1:number,z1:number,y:number,h=1.05):void {
    const length=Math.hypot(x1-x0,z1-z0),ry=Math.atan2(-(z1-z0),x1-x0),x=(x0+x1)/2,z=(z0+z1)/2;
    k.collide(x,y+h/2,z,length,h,.14,{ry});
    if(!k.visuals)return;
    k.piece('iron',x,y+h-.05,z,length+.06,.1,.12,{ry});
    k.piece('iron',x,y+h*.45,z,length,.05,.05,{ry});
    const posts=Math.max(1,Math.round(length/1.6));
    for(let i=0;i<=posts;i++){const t=i/posts;k.piece('iron',x0+(x1-x0)*t,y+h/2,z0+(z1-z0)*t,.07,h,.07,{round:true});}
}
/** A rail round the ring at `radius`, chord by chord, leaving `gaps` (degrees) open. */
function railRing(k:KitBuilder,radius:number,y:number,segments:number,gaps:Array<[number,number]>):void {
    const step=Math.PI*2/segments;
    for(let i=0;i<segments;i++){
        const a0=i*step,a1=a0+step;
        if(gaps.some(g=>inRange(a0+step/2,g)||inRange(a0,g)&&inRange(a1,g)))continue;
        const p=polar(a0,radius),q=polar(a1,radius);
        rail(k,p.x,p.z,q.x,q.z,y);
    }
}
/** A flat annulus of chord slabs (top at `top`) between two radii. */
function annulus(k:KitBuilder,finish:Finish,top:number,inner:number,outer:number,segments:number,thickness=.6,visualOnly=false):void {
    const step=Math.PI*2/segments,width=2*outer*Math.sin(step/2)+.12;
    for(let i=0;i<segments;i++){
        const a=i*step+step/2,p=polar(a,(inner+outer)/2);
        if(visualOnly)k.piece(finish,p.x,top-thickness/2,p.z,outer-inner,thickness,width,{ry:a});
        else k.slab(finish,p.x,top,p.z,outer-inner,width,thickness,{ry:a});
    }
}
/** A straight wall with an optional door (x or z extent along the wall), finish both sides. */
function partition(k:KitBuilder,finish:Finish,x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,t=.4,door?:{from:number;to:number;height:number}):void {
    const alongX=Math.abs(z1-z0)<.001,lo=alongX?Math.min(x0,x1):Math.min(z0,z1),hi=alongX?Math.max(x0,x1):Math.max(z0,z1),c=alongX?z0:x0;
    const put=(a:number,b:number,ya:number,yb:number)=>{
        if(b-a<.05||yb-ya<.05)return;
        if(alongX)k.solid(finish,(a+b)/2,(ya+yb)/2,c,b-a,yb-ya,t);else k.solid(finish,c,(ya+yb)/2,(a+b)/2,t,yb-ya,b-a);
    };
    if(!door){put(lo,hi,y0,y1);return;}
    put(lo,door.from,y0,y1);put(door.to,hi,y0,y1);put(door.from,door.to,y0+door.height,y1);
    if(!k.visuals)return;
    // A dark door frame and a lintel, so openings read in the gloom.
    const mid=(door.from+door.to)/2,w=door.to-door.from;
    for(const s of [door.from,door.to]){if(alongX)k.piece('trim',s,y0+door.height/2,c,.18,door.height,t+.1);else k.piece('trim',c,y0+door.height/2,s,t+.1,door.height,.18);}
    if(alongX)k.piece('trim',mid,y0+door.height+.1,c,w+.4,.24,t+.12);else k.piece('trim',c,y0+door.height+.1,mid,t+.12,.24,w+.4);
}
/** A pendant lamp in a lighting room. */
function lamp(k:KitBuilder,room:string,x:number,floor:number,z:number,color=0xe8c088,intensity=70,ceiling=floor+CEILING):void {
    k.fixture({x,y:Math.min(ceiling-.9,floor+5.9),z,color,intensity,distance:12,angle:.9,room,floor,ceiling});
}

// ---------------------------------------------------------------- the front house

const H=PRECINCT_HOUSE;
/** Inner faces of the house walls. */
const IX0=H.xmin+1, IX1=H.xmax-1, IZ0=H.zmin+1, IZ1=H.zmax-1;
/**
 * The stair column in the north-west: a switchback per storey, each flight rising 4 over 10
 * (about 22°, the steepest a rat or bot walks). Flights run west in the south band and east
 * in the north band; half landings on the west wall, floor landings open east onto each floor.
 */
const BAND1={zmin:IZ0,zmax:-123}, BAND2={zmin:-122.6,zmax:-118.6};
const STAIR_WEST=-126, STAIR_EAST=-116, STAIR_RUN=STAIR_EAST-STAIR_WEST;
/** West rooms (lockup, radio room, armoury) and the east-side glass wall line. */
const WEST_ROOM={xmin:IX0,xmax:-113,zmin:-118.4,zmax:IZ1};
const PARTITION_X=-96;
const DOOR_X={from:-107,to:-103};

function house(k:KitBuilder):void {
    const top=25.2;
    // Outer walls: brick, with the front door and the back door to the cellblock.
    partition(k,'precinct',H.xmin,H.zmax-.5,H.xmax,H.zmax-.5,0,top,1,{...DOOR_X,height:5.5});
    partition(k,'precinct',H.xmin,H.zmin+.5,H.xmax,H.zmin+.5,0,24,1,{...DOOR_X,height:5});
    partition(k,'precinct',H.xmin,H.zmin+.5,H.xmax,H.zmin+.5,24,top,1,{...DOOR_X,height:top-24});
    partition(k,'precinct',H.xmin+.5,H.zmin+1,H.xmin+.5,H.zmax-1,0,top,1);
    partition(k,'precinct',H.xmax-.5,H.zmin+1,H.xmax-.5,H.zmax-1,0,top,1);
    houseFloors(k);
    houseStairs(k);
    houseRooms(k);
    frontage(k);
    houseSkin(k);
    roof(k);
}

function houseFloors(k:KitBuilder):void {
    const slab=(finish:Finish,top:number,x0:number,x1:number,z0:number,z1:number)=>k.slab(finish,(x0+x1)/2,top,(z0+z1)/2,x1-x0,z1-z0);
    // Floors 8, 16 and the roof: whole, but open over the stair column west of its floor landing.
    for(const top of [8,16,24]){
        const finish=top===24?'slate':'wood';
        slab(finish,top,IX0,IX1,BAND2.zmax,IZ1);
        slab(finish,top,STAIR_EAST,IX1,IZ0,BAND2.zmax);
    }
    if(!k.visuals)return;
    // Ground floor finishes over the pavement: tiled lobby, worn boards elsewhere.
    const floor=(finish:Finish,x0:number,x1:number,z0:number,z1:number)=>k.piece(finish,(x0+x1)/2,.03,(z0+z1)/2,x1-x0,.06,z1-z0);
    floor('tile',WEST_ROOM.xmax,PARTITION_X,-118.4,IZ1);
    floor('slate',IX0,PARTITION_X,IZ0,-118.4);
    floor('slate',IX0,WEST_ROOM.xmax,-118.4,IZ1);
    floor('slate',PARTITION_X,IX1,IZ0,IZ1);
    // Chequered lobby: a dark tile every other square.
    for(let x=WEST_ROOM.xmax+1;x<PARTITION_X-.5;x+=2)for(let z=-117.4;z<IZ1-.5;z+=2)if((Math.round(x)+Math.round(z))%4===0)k.piece('cloth',x,.065,z,1,.02,1);
}

function houseStairs(k:KitBuilder):void {
    const north=(BAND1.zmin+BAND1.zmax)/2,south=(BAND2.zmin+BAND2.zmax)/2,w=3.8;
    for(const y of [0,8,16]){
        k.stair('slate',{x:STAIR_EAST,y,z:south},Math.PI,4,STAIR_RUN,w);
        k.stair('slate',{x:STAIR_WEST,y:y+4,z:north},0,4,STAIR_RUN,w);
        // The half landing on the west wall, across both bands.
        k.slab('slate',(IX0+STAIR_WEST)/2,y+4,(BAND1.zmin+BAND2.zmax)/2,STAIR_WEST-IX0,BAND2.zmax-BAND1.zmin,.4);
        lamp(k,'precinct-stairwell',IX0+1.4,y+4,-122.8,0xd9b77e,55,y+11.4);
    }
    // The spine wall between the bands, full height, and a newel cap at each floor.
    partition(k,'cell',STAIR_WEST,-122.8,STAIR_EAST,-122.8,0,27.4);
    if(k.visuals)for(const y of [8,16,24])k.piece('trim',STAIR_EAST,y+1.1,-122.8,.6,.2,.8);
}

function houseRooms(k:KitBuilder):void {
    const door=(c:number)=>({from:c-1.6,to:c+1.6,height:4.6});
    for(const y of FLOORS){
        // West rooms: lockup (0), radio room (8), armoury (16); door east onto the lobby or landing.
        partition(k,'cell',IX0,WEST_ROOM.zmin,WEST_ROOM.xmax,WEST_ROOM.zmin,y,y+CEILING);
        partition(k,'cell',WEST_ROOM.xmax,WEST_ROOM.zmin,WEST_ROOM.xmax,IZ1,y,y+CEILING,.4,door(-114));
    }
    // Ground floor: the lobby's back wall opens wide onto the hall and the corridor to the yard.
    partition(k,'cell',WEST_ROOM.xmax,WEST_ROOM.zmin,PARTITION_X,WEST_ROOM.zmin,0,CEILING,.4,{from:-110,to:-100,height:5.2});
    // Observation and lineup: a partition from the lobby, and the one-way glass between them.
    partition(k,'cell',PARTITION_X,IZ0,PARTITION_X,IZ1,0,CEILING,.4,door(-112));
    const L=PRECINCT_LINEUP,g=L.glass,gz=L.wallZ+L.depth+.2;
    k.collide((PARTITION_X+.2+IX1)/2,CEILING/2,gz,IX1-PARTITION_X-.2,CEILING,.4);
    // The lineup stage: a low riser under the height chart, where the round-end lineup stands.
    k.solid('wood',L.x,L.y/2,L.wallZ+L.stageDepth/2,L.halfWidth*2,L.y,L.stageDepth);
    if(k.visuals){
        const wall=(x0:number,x1:number,y0:number,y1:number)=>k.piece('cell',(x0+x1)/2,(y0+y1)/2,gz,x1-x0,y1-y0,.4,{castShadow:true});
        wall(PARTITION_X+.2,g.xmin,0,CEILING);wall(g.xmax,IX1,0,CEILING);wall(g.xmin,g.xmax,0,g.ymin);wall(g.xmin,g.xmax,g.ymax,CEILING);
        for(const x of [g.xmin,g.xmax])k.piece('iron',x,(g.ymin+g.ymax)/2,gz,.16,g.ymax-g.ymin+.16,.5);
        for(const y of [g.ymin,g.ymax])k.piece('iron',(g.xmin+g.xmax)/2,y,gz,g.xmax-g.xmin+.16,.16,.5);
        k.piece('trim',(g.xmin+g.xmax)/2,g.ymin-.12,gz+.35,g.xmax-g.xmin+.4,.12,.4);
        // Observation benches facing the glass.
        for(const z of [-113.5,-110.8]){k.piece('wood',L.x,.55,z,8,.12,1);for(const x of [L.x-3.6,L.x+3.6])k.piece('iron',x,.27,z,.1,.54,.8);}
        // The height chart: a pale panel ruled every foot (half a unit), heavier every five.
        const chartZ=L.wallZ+.02;
        k.piece('linen',L.x,L.y+2.5,chartZ,L.halfWidth*2-.6,5,.03);
        for(let i=1;i<10;i++)k.piece('iron',L.x,L.y+i*.5,chartZ+.02,L.halfWidth*2-.6,i%5===0?.07:.03,.01);
        k.piece('trim',L.x,L.y+.06,L.wallZ+L.stageDepth,L.halfWidth*2,.12,.12);
    }
    // Benches are low: collide as one slab so balls skim them and rats hop them.
    for(const z of [-113.5,-110.8])k.collide(L.x,.4,z,8,.8,1);
    // Lobby: the front desk (a raised counter facing the door), benches along the walls.
    k.solid('wood',-105,.6,-115.6,10,1.2,1.4);
    if(k.visuals){
        k.piece('trim',-105,1.24,-115.6,10.4,.1,1.6);
        k.piece('brass',-105,1.34,-115,1.2,.06,.4);
        k.piece('green',-108.5,1.55,-115.9,.4,.3,.4);k.piece('brass',-108.5,1.35,-115.9,.1,.3,.1);
        k.piece('paper',-102,1.31,-115.4,1.4,.02,.9);
    }
    for(const x of [-110.3,-99.7])k.solid('wood',x,.4,-109.9,3.6,.8,.9);
    k.sign({lines:['FRONT DESK'],x:-105,y:3.2,z:-116.35,w:3.6,h:.7,ry:0,bg:'#1c1916',fg:'#d9c8a0'});
    k.sign({lines:['ALL VISITORS','REPORT HERE'],x:-105,y:5.2,z:-118.15,w:3.4,h:1.1,ry:0,bg:'#221d1a',fg:'#c7b48c'});
    // Evidence lockup: a wire cage (cheese passes, rats walk round to its open door), shelving.
    const cage={xmin:-127.5,xmax:-117,zmin:-117.2,zmax:-111.5};
    k.bars(cage.xmin,cage.zmin,cage.xmin,cage.zmax,0,4.2);
    k.bars(cage.xmin,cage.zmax,cage.xmax-3,cage.zmax,0,4.2);
    k.bars(cage.xmax,cage.zmin,cage.xmax,cage.zmax,0,4.2);
    for(const x of [-126.5,-123,-119.5])k.solid('steel',x,1.6,-117.6,2.6,3.2,.9);
    if(k.visuals)for(const x of [-126.5,-123,-119.5])for(const y of [.9,1.9,2.9])k.piece('paper',x+(y>2?.3:-.2),y,-117.2,1.3,.5,.4);
    k.sign({lines:['EVIDENCE'],x:-122.2,y:4.9,z:-111.3,w:3.2,h:.7,ry:0,bg:'#2a1a18',fg:'#e0c49a'});
    // Radio room (8): the Dispatch pillar stands in its middle; sets along the walls.
    for(const x of [-127.2,-115]){
        k.solid('machine',x,9.3,-117,2.2,2.6,1.4);
        if(k.visuals){k.piece('green',x,9.6,-116.28,1.4,.5,.04);k.piece('neon',x+.6,10.25,-116.28,.12,.12,.04);}
    }
    k.solid('wood',-121,8.55,-110.6,6,1.1,1.4);
    if(k.visuals){k.piece('machine',-121,9.4,-110.7,2,.6,.8);k.piece('warm',-121,9.45,-111.12,.9,.18,.02);}
    k.sign({lines:['DISPATCH'],x:-121,y:13.9,z:-118.15,w:3.2,h:.7,ry:0,bg:'#10161f',fg:'#8fb3ff',glow:true});
    // Bullpen (8): six desks, filing cabinets on the north wall, a wanted board.
    for(const x of [-102,-94,-86])for(const z of [-121,-114])desk(k,x,8,z);
    for(let x=-106;x<=-84;x+=2.6)k.solid('steel',x,9.2,-126.4,1.9,2.4,1.1);
    k.sign({lines:['WANTED'],x:IX1-.06,y:12,z:-114,w:4.4,h:1,ry:-Math.PI/2,bg:'#cfc2a0',fg:'#3a1e16'});
    if(k.visuals)for(let i=0;i<6;i++)k.piece('paper',IX1-.05,10.4-(i%2)*1.3,-116+(i>>1)*1.9-.9,.02,1.1,1.4);
    // Armoury (16): racks and lockers, the Ironclad on the bench.
    for(const z of [-117.5,-110])k.solid('steel',-121,17.6,z,12,3.2,.8);
    if(k.visuals)for(let x=-126.5;x<=-115.5;x+=.7)for(const z of [-117,-110.5])k.piece('iron',x,18,z+(z<-114?.1:-.1),.1,1.8,.1,{rz:.08});
    k.sign({lines:['ARMOURY'],x:-112.72,y:21,z:-114,w:3,h:.7,ry:Math.PI/2,bg:'#261b16',fg:'#e0b36d'});
    // Detective bureau (16): desks and the captain's glass-fronted office.
    for(const x of [-102,-94])for(const z of [-121,-114])desk(k,x,16,z);
    partition(k,'cell',-89,IZ0,-89,-113,16,16+CEILING,.3,{from:-118,to:-115,height:4.6});
    partition(k,'cell',-89,-113,IX1,-113,16,16+CEILING,.3);
    k.solid('wood',-84.5,16.6,-121,4,1.2,2);
    if(k.visuals)k.piece('green',-84.5,17.55,-121.6,.4,.3,.4);
    k.sign({lines:['CAPTAIN'],x:-89.2,y:20.8,z:-116.5,w:2.2,h:.55,ry:-Math.PI/2,bg:'#2b2620',fg:'#d6c79c'});
    // Rooms and their pendant lamps.
    const rooms:Array<[string,number,number,number,number,number,Array<[number,number]>]>=[
        ['precinct-lockup',0,IX0,WEST_ROOM.xmax,WEST_ROOM.zmin,IZ1,[[-122,-114]]],
        ['precinct-lobby',0,WEST_ROOM.xmax,PARTITION_X,WEST_ROOM.zmin,IZ1,[[-105,-112],[-100,-116]]],
        ['precinct-hall',0,WEST_ROOM.xmax,PARTITION_X,IZ0,WEST_ROOM.zmin,[[-105,-123]]],
        ['precinct-lineup',0,PARTITION_X,IX1,IZ0,gz,[[L.x,-122]]],
        ['precinct-observation',0,PARTITION_X,IX1,gz,IZ1,[[L.x,-112]]],
        ['precinct-radio',8,IX0,WEST_ROOM.xmax,WEST_ROOM.zmin,IZ1,[[-121,-114]]],
        ['precinct-bullpen',8,WEST_ROOM.xmax,IX1,IZ0,IZ1,[[-102,-117.5],[-86,-117.5],[-94,-122]]],
        ['precinct-armoury',16,IX0,WEST_ROOM.xmax,WEST_ROOM.zmin,IZ1,[[-121,-114]]],
        ['precinct-bureau',16,WEST_ROOM.xmax,IX1,IZ0,IZ1,[[-102,-117.5],[-94,-117.5],[-85,-120]]],
    ];
    for(const [id,y,xmin,xmax,zmin,zmax,lamps] of rooms){
        k.room({id,xmin,xmax,zmin,zmax,ymin:y-.5,ymax:y+CEILING});
        for(const [x,z] of lamps)lamp(k,id,x,y,z,id==='precinct-lineup'?0xf2e2c0:0xe6bc7e);
    }
    k.room({id:'precinct-stairwell',xmin:IX0,xmax:WEST_ROOM.xmax,zmin:IZ0,zmax:WEST_ROOM.zmin,ymin:-.5,ymax:24});
}

function desk(k:KitBuilder,x:number,floor:number,z:number):void {
    k.solid('wood',x,floor+.55,z,3.2,1.1,1.7);
    if(!k.visuals)return;
    k.piece('green',x-1,floor+1.35,z-.4,.36,.26,.36);k.piece('brass',x-1,floor+1.18,z-.4,.08,.2,.08);
    k.piece('machine',x+.6,floor+1.26,z-.2,.9,.32,.7);
    k.piece('paper',x-.1,floor+1.11,z+.3,1.1,.02,.7,{ry:.2});
    k.piece('iron',x,floor+.5,z+1.3,.8,.08,.8);k.piece('iron',x,floor+.25,z+1.3,.08,.5,.08);k.piece('iron',x,floor+.95,z+1.65,.8,.8,.08);
}

/** The street front: stoop, portico, police globes and the precinct signs. */
function frontage(k:KitBuilder):void {
    const face=H.zmax,cx=-105;
    // A two-step stoop up to the portico, and a matching threshold down into the lobby.
    k.stair('stone',{x:cx,y:0,z:face+2.6},Math.PI/2,.3,1.4,10);
    k.slab('stone',cx,.3,face+.6,10,1.2,.3);
    k.slab('stone',cx,.3,face-.5,4,1,.3);
    k.stair('stone',{x:cx,y:0,z:face-2.4},-Math.PI/2,.3,1.4,4);
    // Portico: two columns and an entablature carrying the POLICE sign.
    for(const x of [cx-3.8,cx+3.8]){
        k.collide(x,3.65,face+1.4,.8,6.7,.8);
        if(k.visuals){k.piece('stone',x,3.65,face+1.4,.8,6.7,.8,{round:true,castShadow:true});k.piece('trim',x,.55,face+1.4,1.1,.5,1.1);k.piece('trim',x,6.85,face+1.4,1.1,.3,1.1);}
    }
    k.solid('stone',cx,7.4,face+1,9.6,.9,2.2);
    if(k.visuals){k.piece('trim',cx,7.95,face+1.05,10,.2,2.4);k.piece('trim',cx,6.9,face+1,9.8,.12,2.3);}
    k.sign({lines:['POLICE'],x:cx,y:7.4,z:face+2.13,w:5.2,h:.78,ry:0,bg:'#0a1220',fg:'#9cc0ff',glow:true});
    k.sign({lines:['PRECINCT 13'],x:cx,y:9.6,z:face+.28,w:9,h:1.3,ry:0,bg:'#1d1a1f',fg:'#d8cdb0'});
    k.sign({lines:['CITY OF RATS · DEPT. OF POLICE'],x:cx,y:10.55,z:face+.28,w:9,h:.45,ry:0,bg:'#1d1a1f',fg:'#a99e84'});
    // The rooftop sign over the street, on an iron frame: the precinct's mark on the skyline.
    k.sign({lines:['POLICE · PRECINCT 13'],x:cx,y:27.9,z:face-1.2,w:14,h:1.7,ry:0,bg:'#08101c',fg:'#8fb6ff',glow:true});
    if(k.visuals){
        for(let x=cx-6.5;x<=cx+6.6;x+=3.25){k.piece('iron',x,26.4,face-1.35,.12,3.9,.12);k.piece('iron',x,26.2,face-2.2,.1,2.9,.1,{rx:-.3});}
        k.piece('iron',cx,26.95,face-1.3,14.4,.12,.12);k.piece('iron',cx,28.8,face-1.3,14.4,.12,.12);
    }
    // Police globes on stone posts either side of the stoop.
    for(const x of [cx-6.5,cx+6.5]){
        k.solid('stone',x,1.5,face+1.2,.8,3,.8);
        if(k.visuals){
            k.piece('trim',x,3.08,face+1.2,1,.16,1);k.piece('iron',x,3.3,face+1.2,.3,.3,.3,{round:true});
            // A globe from stacked discs: narrow, full, narrow reads round at street distance.
            for(const [dy,d,h] of [[-.38,.55,.2],[-.2,.82,.2],[0,.95,.24],[.2,.82,.2],[.38,.55,.2]] as const)
                k.piece('police-glow',x,3.85+dy,face+1.2,d,h,d,{round:true});
            k.piece('iron',x,4.36,face+1.2,.5,.12,.5,{round:true});
        }
        k.fixture({x,y:3.85,z:face+1.2,color:0x7fa8ff,intensity:48,distance:14});
    }
    // Doors: heavy leaves swung open into the lobby, and a transom lamp.
    if(k.visuals){
        for(const s of [-1,1])k.piece('wood',cx+s*2.3,2.6,face-1.5,.14,5.2,1.9,{ry:s*.35});
        k.piece('warm',cx,5.1,face+.02,3.2,.6,.04);
    }
    k.fixture({x:cx,y:4.6,z:face-1,color:0xe8c088,intensity:30,distance:9});
}

/** Facades: brick piers, stone cornices, barred ground-floor windows, lit upper rows. */
function houseSkin(k:KitBuilder):void {
    if(!k.visuals)return;
    const ground={body:'precinct' as const,light:'warm' as const,pitch:4.2,windowW:1.5,windowH:2.8,bars:true as const};
    const upper={body:'precinct' as const,light:'warm' as const,pitch:4.2,windowW:1.5,windowH:3.2};
    const faces:Array<[number,number,number,number,Array<[number,number]>]>=[
        [H.xmax,H.zmax,H.xmin,H.zmax,[[H.xmax-(DOOR_X.to+4.5),H.xmax-(DOOR_X.from-4.5)]]],
        [H.xmin,H.zmin,H.xmax,H.zmin,[[DOOR_X.from-H.xmin-1,DOOR_X.to-H.xmin+1]]],
        [H.xmin,H.zmax,H.xmin,H.zmin,[]],
        [H.xmax,H.zmin,H.xmax,H.zmax,[]],
    ];
    for(const [x0,z0,x1,z1,doors] of faces){
        k.facade(x0,z0,x1,z1,0,8,ground,1,doors);
        k.facade(x0,z0,x1,z1,8,24,upper,1);
    }
    // Stone quoins at the corners and a heavy parapet cap.
    for(const [x,z] of [[H.xmin,H.zmin],[H.xmax,H.zmin],[H.xmin,H.zmax],[H.xmax,H.zmax]] as const)
        for(let y=.6;y<25;y+=1.2)k.piece('stone',x,y,z,1.4+(Math.round(y/1.2)%2)*.4,.55,1.4+(Math.round(y/1.2+1)%2)*.4);
    k.piece('trim',(H.xmin+H.xmax)/2,25.3,H.zmax-.5,H.xmax-H.xmin+.4,.3,1.3);
    for(const [x0,x1] of [[H.xmin-.2,DOOR_X.from],[DOOR_X.to,H.xmax+.2]] as const)k.piece('trim',(x0+x1)/2,25.3,H.zmin+.5,x1-x0,.3,1.3);
    for(const x of [H.xmin+.5,H.xmax-.5])k.piece('trim',x,25.3,(H.zmin+H.zmax)/2,1.3,.3,H.zmax-H.zmin);
    // A plinth course of dressed stone along the street.
    k.piece('stone',(H.xmin+H.xmax)/2,.45,H.zmax+.12,H.xmax-H.xmin,.9,.3);
}

/** The roof: the stair bulkhead over flight C, a water tank, the radio mast and an iron fence. */
function roof(k:KitBuilder):void {
    const y=24,hut={xmin:-128.6,xmax:-112,zmin:-127.2,zmax:-118.2},hh=3.4;
    partition(k,'precinct',hut.xmin,hut.zmin,hut.xmin,hut.zmax,y,y+hh,.4);
    partition(k,'precinct',hut.xmax,hut.zmin,hut.xmax,hut.zmax,y,y+hh,.4,{from:-126.2,to:-122.6,height:2.8});
    partition(k,'precinct',hut.xmin,hut.zmin,hut.xmax,hut.zmin,y,y+hh,.4);
    partition(k,'precinct',hut.xmin,hut.zmax,hut.xmax,hut.zmax,y,y+hh,.4);
    k.slab('slate',(hut.xmin+hut.xmax)/2,y+hh+.3,(hut.zmin+hut.zmax)/2,hut.xmax-hut.xmin+.6,hut.zmax-hut.zmin+.6,.4);
    k.fixture({x:hut.xmax+.4,y:y+3,z:-124.4,color:0xe8c088,intensity:26,distance:8});
    // Water tank on iron legs.
    k.solid('timber',-90,y+4.2,-122,3.4,3,3.4);
    if(k.visuals){
        k.piece('timber',-90,y+4.2,-122,3.6,3,3.6,{round:true,castShadow:true});k.piece('iron',-90,y+5.9,-122,3.8,.6,3.8,{round:true});
        for(const [dx,dz] of [[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]])k.piece('iron',-90+dx,y+1.35,-122+dz,.14,2.7,.14);
    }
    for(const [dx,dz] of [[-1.3,-1.3],[1.3,-1.3],[-1.3,1.3],[1.3,1.3]])k.collide(-90+dx,y+1.35,-122+dz,.3,2.7,.3);
    // Radio mast for the dispatch room, a red lamp on top.
    k.solid('iron',-121,y+.5,-114,1.2,1,1.2);
    if(k.visuals){
        k.piece('iron',-121,y+6,-114,.18,11,.18);
        for(let h=2;h<11;h+=2.2)k.piece('iron',-121,y+h,-114,1.4-h*.08,.06,.06,{ry:h});
        k.piece('neon',-121,y+11.6,-114,.35,.35,.35,{round:true});
    }
    k.fixture({x:-121,y:y+11.6,z:-114,color:0xff4a3d,intensity:8,distance:6});
    // An iron fence on the parapet (rats stop, cheese passes), open over the footbridge to the ring.
    const sides=[[H.xmin,H.zmax-.5,H.xmax,H.zmax-.5],[H.xmin,H.zmin+.5,DOOR_X.from,H.zmin+.5],[DOOR_X.to,H.zmin+.5,H.xmax,H.zmin+.5],
        [H.xmin+.5,H.zmin,H.xmin+.5,H.zmax],[H.xmax-.5,H.zmin,H.xmax-.5,H.zmax]] as const;
    for(const [x0,z0,x1,z1] of sides){
        const length=Math.hypot(x1-x0,z1-z0),ry=Math.atan2(-(z1-z0),x1-x0);
        k.collide((x0+x1)/2,25.8,(z0+z1)/2,length,1.2,.3,{ry,passBalls:true});
        if(!k.visuals)continue;
        k.piece('iron',(x0+x1)/2,26.35,(z0+z1)/2,length,.07,.07,{ry});
        for(let t=0;t<=length;t+=.9)k.piece('iron',x0+(x1-x0)*t/length,25.95,z0+(z1-z0)*t/length,.05,.9,.05);
    }
}

// ---------------------------------------------------------------- the ring cellblock

function ring(k:KitBuilder):void {
    const gates:Array<[number,number]>=GATE_SLOTS.map(s=>[s*18-9,s*18+9]);
    const rad=(g:[number,number]):[number,number]=>[g[0]*DEG,g[1]*DEG];
    // The curved outer wall: forty chords, the three gates open to y 5.5; the parapet opens
    // over the house gate for the footbridge from the house roof.
    k.ring('precinct',CX,CZ,RING_R,40,0,5.5,WALL_T,gates.map(rad));
    k.ring('precinct',CX,CZ,RING_R,40,5.5,24,WALL_T);
    k.ring('precinct',CX,CZ,RING_R,40,24,25.2,WALL_T,[[263*DEG,277*DEG]]);
    // Floors 8 and 16 (gallery plus cells) and the roof, each one annulus of chord slabs.
    for(const top of [8,16,24])annulus(k,top===24?'slate':'cell',top,GALLERY_R,CELL_BACK+.5,20);
    if(k.visuals){
        annulus(k,'slate',.06,PRECINCT_YARD_RADIUS,CELL_BACK,20,.06,true);
        for(const y of [8.05,16.05,24.05])annulus(k,'trim',y,GALLERY_R-.12,GALLERY_R+.35,40,.12,true);
    }
    for(const y of [8,16,24])railRing(k,GALLERY_R+.12,y,40,RAIL_GAPS[y]??[]);
    roofBridge(k);
    for(const floor of FLOORS)for(let s=0;s<SLOTS;s++)cell(k,floor,s);
    for(const s of GATE_SLOTS)gatePassage(k,s);
    ringSkin(k);
    for(const floor of FLOORS){
        k.room({id:`cellblock-${floor}`,xmin:CX-RING_R,xmax:CX+RING_R,zmin:CZ-RING_R,zmax:CZ+RING_R,ymin:floor-.5,ymax:floor+CEILING});
        // Cage lamps over the gallery, every other slot, just inside the cell fronts.
        for(let s=1;s<SLOTS;s+=2){const p=polar(s*SLOT,BARS_R-1.4);lamp(k,`cellblock-${floor}`,p.x,floor,p.z,0xdcc193,60);}
    }
}

/** An iron footbridge at roof height from the house roof over the gap to the ring's roof. */
function roofBridge(k:KitBuilder):void {
    const x0=DOOR_X.from,x1=DOOR_X.to,z0=H.zmin+1,z1=CZ+CELL_BACK-.5,x=(x0+x1)/2;
    k.slab('iron',x,24,(z0+z1)/2,x1-x0,z0-z1,.4);
    for(const side of [x0,x1])railing(k,side,H.zmin,side,CZ+RING_R,24);
}

/** One cell (or a gate passage's slot). Partitions are bars; fronts are bars with a door. */
function cell(k:KitBuilder,floor:number,slot:number):void {
    const gate=floor===0&&GATE_SLOTS.includes(slot);
    const a=slot*SLOT,b=a+SLOT/2,next=(slot+1)%SLOTS,y1=floor+CEILING;
    // The partition on this cell's counter-clockwise side (shared with the next slot).
    const nextGate=floor===0&&GATE_SLOTS.includes(next);
    const p=polar(b,BARS_R),q=polar(b,CELL_BACK-.05);
    if(gate||nextGate)k.wall('cell',p.x,p.z,q.x,q.z,floor,y1,.5);
    else k.bars(p.x,p.z,q.x,q.z,floor,y1);
    if(gate)return;
    // The front: bars along the chord, a door gap in the middle of open cells.
    // Ground-floor cells all stand open (street spawns land in some); upper tiers alternate.
    const f0=polar(a-SLOT/2,BARS_R),f1=polar(b,BARS_R),full=OPEN_FRONT[`${floor}:${slot}`]===true;
    const open=floor===0||(floor===8?slot%3===0:slot%3===1);
    if(!full){
        if(open){
            const length=Math.hypot(f1.x-f0.x,f1.z-f0.z),side=(length-2.3)/2/length;
            const m0={x:f0.x+(f1.x-f0.x)*side,z:f0.z+(f1.z-f0.z)*side},m1={x:f1.x-(f1.x-f0.x)*side,z:f1.z-(f1.z-f0.z)*side};
            k.bars(f0.x,f0.z,m0.x,m0.z,floor,y1);k.bars(m1.x,m1.z,f1.x,f1.z,floor,y1);
            // The door leaf swung back flat against the fixed bars, on the gallery side.
            if(k.visuals){
                const nx=-Math.cos(a)*.28,nz=Math.sin(a)*.28,ry=Math.atan2(-(f1.z-f0.z),f1.x-f0.x),w=Math.hypot(m0.x-f0.x,m0.z-f0.z)+.9;
                for(let i=0;i<=4;i++){const t=i/4*w/length;k.piece('iron',f0.x+(f1.x-f0.x)*t+nx,floor+2.1,f0.z+(f1.z-f0.z)*t+nz,.08,4.2,.08,{round:true});}
                const mid=w/2/length;
                for(const y of [floor+.2,floor+2.1,floor+4.1])k.piece('iron',f0.x+(f1.x-f0.x)*mid+nx,y,f0.z+(f1.z-f0.z)*mid+nz,w,.09,.12,{ry});
            }
        }else k.bars(f0.x,f0.z,f1.x,f1.z,floor,y1);
    }
    // A header beam over the cell front and a number plate.
    if(k.visuals){
        const h=polar(a,BARS_R-.05);
        k.piece('iron',h.x,y1-.35,h.z,.3,.5,2*BARS_R*Math.sin(SLOT/2),{ry:a});
        const plate=polar(a,BARS_R-.25);
        k.piece(floor===8&&slot===INFIRMARY?'rose':'paper',plate.x,y1-1.05,plate.z,.04,.36,.6,{ry:a});
    }
    if(full)return;
    // A cot against the partition, clear of the wall so wall-riding balls pass.
    const c=polar(b,CELL_MID),t=.72;
    k.collide(c.x+Math.sin(b)*t,floor+.45,c.z+Math.cos(b)*t,2.6,.5,.95,{ry:b});
    if(!k.visuals)return;
    k.piece('iron',c.x+Math.sin(b)*t,floor+.4,c.z+Math.cos(b)*t,2.7,.1,1,{ry:b});
    k.piece('linen',c.x+Math.sin(b)*t,floor+.62,c.z+Math.cos(b)*t,2.5,.2,.85,{ry:b});
    for(const r of [CELL_MID-1.2,CELL_MID+1.2]){const l=polar(b,r);k.piece('iron',l.x+Math.sin(b)*t,floor+.2,l.z+Math.cos(b)*t,.08,.4,.9,{ry:b});}
    // The cell window: barred, moonlight from inside.
    const w=polar(a,CELL_BACK-.08);
    k.piece('iron',w.x,floor+4.6,w.z,.08,2.2,1.2,{ry:a});
    k.piece('cyan',w.x,floor+4.6,w.z,.1,1.9,.9,{ry:a});
    for(const s of [-.3,0,.3]){const o=polar(a,CELL_BACK-.16);k.piece('iron',o.x+Math.sin(a)*s,floor+4.6,o.z+Math.cos(a)*s,.06,2,.06,{round:true});}
}

/** A radial gate passage through the ground-floor cells, with a lamp and a gate sign. */
function gatePassage(k:KitBuilder,slot:number):void {
    const a=slot*SLOT,inner=polar(a,BARS_R);
    // Ceiling over the passage is the floor-8 slab; a lintel beam marks the yard end.
    if(k.visuals){
        k.piece('trim',inner.x,5.6,inner.z,.6,.4,4.6,{ry:a});
        const o=polar(a,RING_R+.1);
        k.piece('trim',o.x,5.8,o.z,.4,.6,6.6,{ry:a});
        // Iron gate leaves swung open against the passage walls.
        for(const s of [-1,1]){
            const e=polar(a+s*(SLOT/2-.03),RING_R-2.2);
            for(let i=0;i<5;i++)k.piece('iron',e.x-Math.cos(a)*i*.5,2.6,e.z+Math.sin(a)*i*.5,.08,5.2,.08,{round:true});
            k.piece('iron',e.x-Math.cos(a),4.9,e.z+Math.sin(a),2.2,.12,.12,{ry:a});
        }
    }
    const m=polar(a,(BARS_R+RING_R)/2);
    lamp(k,'cellblock-0',m.x,0,m.z,0xe2c28c,50);
    const s=polar(a,RING_R+.25),label=GATE_LABELS[slot];
    if(label)k.sign({lines:[label],x:s.x,y:6.3,z:s.z,w:5.4,h:.6,ry:a+Math.PI/2,bg:'#1c1a1f',fg:'#d8cdb0'});
}

/** The outside of the ring: pilasters between cells, cornices, slit windows, the parapet. */
function ringSkin(k:KitBuilder):void {
    if(!k.visuals)return;
    for(let s=0;s<SLOTS;s++){
        const b=s*SLOT+SLOT/2,p=polar(b,RING_R+.18);
        k.piece('stone',p.x,12.6,p.z,.5,25.2,1,{ry:b,castShadow:true});
        for(const floor of FLOORS){
            if(floor===0&&GATE_SLOTS.includes(s))continue;
            const a=s*SLOT,w=polar(a,RING_R+.12),lit=(s*7+floor)%5<2;
            k.piece('iron',w.x,floor+4.6,w.z,.1,2.3,1.25,{ry:a});
            k.piece(lit?'warm':'glass',w.x,floor+4.6,w.z,.14,1.9,.9,{ry:a,...(lit&&s%3===0?{flicker:true as const}:{})});
            for(const o of [-.3,0,.3]){const q=polar(a,RING_R+.22);k.piece('iron',q.x+Math.sin(a)*o,floor+4.6,q.z+Math.cos(a)*o,.06,2,.06,{round:true});}
            const sill=polar(a,RING_R+.15);k.piece('trim',sill.x,floor+3.5,sill.z,.3,.18,1.4,{ry:a});
        }
    }
    const step=Math.PI*2/40,width=2*(RING_R+.2)*Math.sin(step/2)+.1;
    for(let i=0;i<40;i++){
        const a=i*step+step/2,deg=a/DEG,gate=GATE_SLOTS.some(s=>Math.abs((deg-s*18+540)%360-180)<9),bridge=Math.abs(deg-270)<7;
        for(const [y,h,r] of [[8,.3,RING_R+.12],[16,.3,RING_R+.12],[25.3,.4,RING_R],[.4,.8,RING_R+.1]] as const){
            if(y<1&&gate||y>25&&bridge)continue;
            const p=polar(a,r);k.piece(y===25.3?'trim':y<1?'stone':'trim',p.x,y,p.z,y===25.3?1.3:.35,h,width,{ry:a});
        }
    }
    // Caged lamps on the parapet, every other cell: the ring's outline in the dark.
    for(let s=1;s<SLOTS;s+=2){
        const p=polar(s*SLOT,RING_R-.5);
        k.piece('iron',p.x,25.85,p.z,.14,.7,.14);
        k.piece('lamp',p.x,26.35,p.z,.34,.42,.34,{round:true});
        k.piece('iron',p.x,26.6,p.z,.46,.08,.46,{round:true});
    }
}

// ---------------------------------------------------------------- the guard tower

function tower(k:KitBuilder):void {
    const r=PRECINCT_TOWER_RADIUS,floor=PRECINCT_LOOKOUT_Y;
    k.ring('stone',CX,CZ,r,16,0,floor,.8);
    // Lookout floor and roof: sixteen-sided discs of chord slabs, corbelled out from the shaft.
    annulus(k,'stone',floor,0,CABIN_R,16);
    // Waist-high sill all round but the bridge side, then the roof.
    k.ring('precinct',CX,CZ,CABIN_R,16,floor,floor+1,.35,[[(BRIDGE_DEG-36)*DEG,(BRIDGE_DEG+32)*DEG]]);
    annulus(k,'slate',floor+4.2,0,CABIN_R+.3,16,.4);
    // The warden's console facing the cells.
    k.solid('machine',CX+2.5,floor+.55,CZ,.8,1.1,2);
    // The searchlight on the roof.
    k.solid('iron',CX,floor+4.7,CZ,1.4,.6,1.4);
    k.fixture({x:PRECINCT_SEARCHLIGHT.x,y:PRECINCT_SEARCHLIGHT.y,z:PRECINCT_SEARCHLIGHT.z,color:0xfff0c8,intensity:60,distance:28});
    // Bracket lamps round the tower's foot light the yard.
    for(let i=0;i<4;i++){const p=polar(i*Math.PI/2+Math.PI/4,r+.5);lamp(k,'cellblock-0',p.x,0,p.z,0xe0c690,70,5.6);}
    k.fixture({x:CX,y:floor+3.3,z:CZ,color:0xe8c088,intensity:40,distance:9,angle:1.1,room:'cellblock-16',floor,ceiling:floor+3.9});
    // The bridge from the top gallery, between two cells so it hides neither from the
    // lookout: a flight rising 3 over 8 to the lookout's edge, railed both sides.
    const heading=(BRIDGE_DEG+180)*DEG,bridge={...polar(BRIDGE_DEG*DEG,3.4+BRIDGE_RUN),y:16};
    k.stair('slate',bridge,heading,floor-16,BRIDGE_RUN,3.4);
    for(const o of [-1.8,1.8])stairRailing(k,bridge,heading,floor-16,BRIDGE_RUN,o);
    if(!k.visuals)return;
    // Shaft dressing: string courses, arrow slits and a plinth.
    for(const y of [.5,8,16])for(let i=0;i<16;i++){const a=i*Math.PI/8+Math.PI/16,p=polar(a,r+.05);k.piece(y<1?'stone':'trim',p.x,y,p.z,.3,y<1?1:.28,1.15,{ry:a});}
    for(const y of [5,12])for(let i=0;i<4;i++){const a=i*Math.PI/2+(y>6?Math.PI/4:0),p=polar(a,r+.02);k.piece('warm',p.x,y,p.z,.1,1.4,.25,{ry:a});}
    // Corbels under the cabin.
    for(let i=0;i<16;i++){const a=i*Math.PI/8,p=polar(a,r+.5);k.piece('stone',p.x,floor-1,p.z,1.1,1.4,.4,{ry:a,rz:-.5});}
    // Mullions and a lit clerestory: the lookout glows over the yard like a lantern. The
    // lower band stays open to see the cells.
    for(let i=0;i<16;i++){
        const a=i*Math.PI/8,p=polar(a,CABIN_R-.17);
        k.piece('iron',p.x,floor+2.6,p.z,.14,3.2,.14);
        const m=polar(a+Math.PI/16,CABIN_R-.2);
        k.piece(i%5===2?'cream':'warm',m.x,floor+3.6,m.z,.05,.9,1.3,{ry:a+Math.PI/16,...(i%4===1?{flicker:true as const}:{})});
    }
    k.piece('trim',CX,floor+3.05,CZ,CABIN_R*2,.12,CABIN_R*2,{round:true});
    // Cap, and the searchlight: a drum on a yoke, its lens tipped down over the house gate.
    k.piece('slate',CX,floor+4.55,CZ,6.2,.3,6.2,{round:true});
    const aim=270*DEG,tilt=.32,sl=PRECINCT_SEARCHLIGHT,lens=polar(aim,.85);
    for(const s of [-1,1]){const y=polar(aim+s*Math.PI/2,.8);k.piece('iron',y.x,sl.y-.2,y.z,.12,.9,.12);}
    k.piece('iron',sl.x,sl.y,sl.z,1.2,1.7,1.2,{round:true,ry:aim,rz:Math.PI/2-tilt});
    k.piece('beacon',lens.x,sl.y-Math.sin(tilt)*.85,lens.z,1.02,.1,1.02,{round:true,ry:aim,rz:Math.PI/2-tilt});
    k.piece('iron',sl.x,sl.y-.72,sl.z,.9,.2,.9,{round:true});
    k.piece('green',CX+2.08,floor+1.12,CZ,.04,.3,1.2);
}

// ---------------------------------------------------------------- the yard

function yard(k:KitBuilder):void {
    // Iron flights either side of the tower, railed both sides, each with its landing.
    const lift=FLIGHT_RUN-FLIGHT_REACH;
    const flights:Array<{from:{x:number;y:number;z:number};ry:number;dir:1|-1}>=[
        {from:{x:CX-FLIGHT_X,y:0,z:CZ+FLIGHT_REACH},ry:Math.PI/2,dir:-1},
        {from:{x:CX+FLIGHT_X,y:8,z:CZ-FLIGHT_REACH},ry:-Math.PI/2,dir:1},
    ];
    for(const f of flights){
        k.stair('iron',f.from,f.ry,8,FLIGHT_RUN,FLIGHT_W);
        for(const o of [-FLIGHT_W/2-.1,FLIGHT_W/2+.1])stairRailing(k,f.from,f.ry,8,FLIGHT_RUN,o);
        const top=f.from.y+8,z0=CZ+f.dir*lift,z1=CZ+f.dir*(lift+LANDING);
        k.slab('iron',f.from.x,top,(z0+z1)/2,FLIGHT_W,LANDING,.4);
        for(const s of [-1,1])railing(k,f.from.x+s*(FLIGHT_W/2+.1),z0,f.from.x+s*(FLIGHT_W/2+.1),z1,top);
    }
    if(k.visuals){
        // Paving, a painted exercise circle and a drain.
        annulus(k,'concrete',.04,PRECINCT_TOWER_RADIUS,PRECINCT_YARD_RADIUS,20,.04,true);
        const step=Math.PI*2/48;
        for(let i=0;i<48;i+=2){const a=i*step,p=polar(a+step/2,7.2);k.piece('paper',p.x,.085,p.z,.18,.02,2*7.2*Math.sin(step/2),{ry:a+step/2});}
        k.piece('iron',CX-1.6,.09,CZ+7.4,1,.02,1);
    }
}

/** The seawall north of the ring: an iron railing along the quay edge across the lot. */
function seawall(k:KitBuilder):void {
    const z=QUAY_EDGE_Z+.5;
    for(let x=PRECINCT_LOT.xmin;x<PRECINCT_LOT.xmax;x+=9){
        const x1=Math.min(PRECINCT_LOT.xmax,x+9);
        rail(k,x,z,x1,z,0,1.15);
    }
    if(k.visuals)for(let x=PRECINCT_LOT.xmin;x<=PRECINCT_LOT.xmax;x+=9)k.piece('stone',x,.7,z,.5,1.4,.5);
    k.lamp(-81,-137);k.lamp(-81,-163);
}

// ---------------------------------------------------------------- gameplay slots

/** The precinct's gameplay slots, typed like the registries; the integration owner splices them in. */
export const PRECINCT_JOBS={
    caseSpawns:[
        {x:-105,y:1.3,z:-112.2},                 // lobby, in front of the desk
        {x:-122.2,y:1.3,z:-114.4},               // evidence lockup cage
        {x:CX,y:1.3,z:CZ+6},                     // yard, south of the tower
        {...polar(DRUNK_TANK*SLOT,CELL_MID),y:1.3},  // the open drunk tank (south-west)
    ] satisfies readonly Vec3Data[],
    supplies:[
        {id:'alibi-precinct-armoury',kind:'ironclad',x:-121,z:-113.7,y:16.7,near:'Precinct armoury, top floor'},
        {id:'fix-precinct-infirmary',kind:'quick-fix',...polar(INFIRMARY*SLOT,CELL_MID),y:8.7,near:'Panopticon infirmary cell, second tier'},
    ] satisfies readonly PickupAnchor[],
    dispatch:{id:'precinct',x:-121,y:8,z:-113.7,face:0},
    zone:{label:'PRECINCT YARD',category:'outdoor',floor:'STREET',floorY:0,
        areas:[{xmin:CX-7,xmax:CX+7,zmin:CZ-7,zmax:CZ+7},{xmin:CX-9.4,xmax:CX+9.4,zmin:CZ-3,zmax:CZ+3},{xmin:CX-3,xmax:CX+3,zmin:CZ-9.4,zmax:CZ+9.4}],
        exclusions:[{xmin:CX-3.2,xmax:CX+3.2,zmin:CZ-3.2,zmax:CZ+3.2}],
        posts:[{x:CX,y:.3,z:CZ+6.5},{x:CX,y:.3,z:CZ-6.5},{x:CX+3,y:.3,z:CZ+6}],
        approaches:[{x:-82,y:.3,z:CZ},{x:-105,y:.3,z:-122},{x:-105,y:.3,z:-100}]} satisfies JurisdictionZone,
    destination:{label:'PRECINCT FRONT DESK',short:'FRONT DESK',center:{x:-105,y:2,z:-113.7},
        bounds:{xmin:WEST_ROOM.xmax,xmax:PARTITION_X,ymin:-.5,ymax:CEILING,zmin:WEST_ROOM.zmin,zmax:IZ1},
        approach:{x:-105,y:.3,z:-100},arrival:{x:-105,y:.3,z:-112.2}},
} as const;
