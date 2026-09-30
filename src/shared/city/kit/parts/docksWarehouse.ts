import type { Vec3Data } from '../../../networkProtocol';
import type { KitBuilder } from '../kit';
import { crate, floodHead, railing, stairRailing } from './docksKit';

/** Pier 9: a brick warehouse between Seventy Avenue and the x 145 street. */
export const PIER9 = {x0:82, x1:136, z0:-146, z1:-114, height:14} as const;
/** The glazed harbour master's office in the south-east corner, under the mezzanine. */
export const HARBOUR_MASTER = {x0:122, x1:135.6, z0:-125, z1:-114.4, height:5.1} as const;
export const MEZZANINE_Y = 5.6;
/** Mezzanine stairs climb about 22° (steeper ramps are not walkable). */
const STAIR_RUN = 13.9;
/** The mezzanine's front edge, where both stairs arrive, and the stairs' centre lines. */
const EDGE = -122, STAIR_X = [100, 118] as const, STAIR_W = 2.8;
const T = .8;
/** Door openings: [from,to] along each wall, all 6 high except the small ones. */
const QUAY_DOOR:[number,number] = [103,115], EAST_DOOR:[number,number] = [-134,-124];
const SOUTH_DOOR:[number,number] = [96,102], WEST_DOOR:[number,number] = [-124,-119];
/** The office's door, in its north glass wall. */
const OFFICE_DOOR:[number,number] = [124,126.6];

/** Walking decks up there (the south floor, its west arm, the catwalk) and the stairs, with the heights a rat
 * on them, or hopping on them, has. The floor below is out of reach: the deck overhead stops its jumps short. */
const UPSTAIRS = [
    {x0:82, x1:136, z0:EDGE, z1:-114, y0:MEZZANINE_Y-1},
    {x0:82, x1:90, z0:-141.2, z1:EDGE, y0:MEZZANINE_Y-1},
    {x0:90, x1:128, z0:-141.2, z1:-138.8, y0:MEZZANINE_Y-1},
    ...STAIR_X.map(x=>({x0:x-STAIR_W/2, x1:x+STAIR_W/2, z0:EDGE-STAIR_RUN, z1:EDGE, y0:.5})),
];
const within = (p:Vec3Data,r:{x0:number;x1:number;z0:number;z1:number}) => p.x>=r.x0&&p.x<=r.x1&&p.z>=r.z0&&p.z<=r.z1;
const upstairs = (p:Vec3Data) => UPSTAIRS.some(r=>within(p,r)&&p.y>=r.y0&&p.y<MEZZANINE_Y+7);
const indoors = (p:Vec3Data) => within(p,PIER9)&&p.y>-1&&p.y<PIER9.height;
const inOffice = (p:Vec3Data) => within(p,HARBOUR_MASTER)&&p.y>-1&&p.y<HARBOUR_MASTER.height;
/** The ways out, 4 past each wall so waypoint tolerance cannot call one reached from inside. */
const DOORS:Vec3Data[] = [
    {x:(QUAY_DOOR[0]+QUAY_DOOR[1])/2, y:0, z:PIER9.z0-4},
    {x:(SOUTH_DOOR[0]+SOUTH_DOOR[1])/2, y:0, z:PIER9.z1+4},
    {x:PIER9.x1+4, y:0, z:(EAST_DOOR[0]+EAST_DOOR[1])/2},
    {x:PIER9.x0-4, y:0, z:(WEST_DOOR[0]+WEST_DOOR[1])/2},
];

/** Pier 9's exit leg, as a landmark's: for a rat inside whose goal is elsewhere, the foot of the better stair
 * from the mezzanine, the office door from the harbour master's office, else the better outer door. With no
 * route yet (a far goal's search can take longer than a moving goal stays put), walking straight at the goal
 * ends in a corner of the hall or the mezzanine; a nearby leg's search finishes at once. Each point is a little
 * past its opening, so waypoint tolerance cannot call it reached early. Undefined outside or for a goal inside
 * the same space. */
export function pier9ExitPoint(from:Vec3Data,to:Vec3Data):Vec3Data|undefined {
    if(upstairs(from)){
        if(upstairs(to))return undefined;
        const cost=(x:number)=>Math.hypot(from.x-x,from.z-EDGE)+Math.hypot(to.x-x,to.z-(EDGE-STAIR_RUN));
        return {x:cost(STAIR_X[0])<=cost(STAIR_X[1])?STAIR_X[0]:STAIR_X[1],y:0,z:EDGE-STAIR_RUN-1.5};
    }
    if(inOffice(from))return inOffice(to)?undefined:{x:(OFFICE_DOOR[0]+OFFICE_DOOR[1])/2,y:0,z:HARBOUR_MASTER.z0-2};
    if(!indoors(from)||indoors(to))return undefined;
    const cost=(p:Vec3Data)=>Math.hypot(from.x-p.x,from.z-p.z)+Math.hypot(to.x-p.x,to.z-p.z);
    return DOORS.reduce((best,p)=>cost(p)<cost(best)?p:best);
}

export function pier9(k:KitBuilder):void {
    const {x0,x1,z0,z1,height:H}=PIER9,door=6;
    // Outer walls with their openings; each opening has a lintel above it.
    const run=(fixed:'x'|'z',at:number,from:number,to:number,gap:[number,number],top:number)=>{
        const seg=(a:number,b:number,y0:number,y1:number)=>fixed==='z'?k.wall('brick',a,at,b,at,y0,y1,T):k.wall('brick',at,a,at,b,y0,y1,T);
        seg(from,gap[0],0,H);seg(gap[1],to,0,H);seg(gap[0],gap[1],top,H);
    };
    run('z',z0,x0-T/2,x1+T/2,QUAY_DOOR,door);
    run('z',z1,x0-T/2,x1+T/2,SOUTH_DOOR,5);
    run('x',x1,z0,z1,EAST_DOOR,door);
    run('x',x0,z0,z1,WEST_DOOR,4.5);
    k.slab('slate',(x0+x1)/2,H+.6,(z0+z1)/2,x1-x0+1.6,z1-z0+1.6,.6);
    k.room({id:'pier9-warehouse',xmin:x0,xmax:x1,zmin:z0,zmax:z1,ymin:0,ymax:H});
    // Half-raised rolling shutters: cover you duck under, not a door that closes.
    shutter(k,'z',z0,QUAY_DOOR,4.6,door);
    shutter(k,'x',x1,EAST_DOOR,4.2,door);
    mezzanine(k);
    office(k);
    floor(k);
    lights(k);
    if(k.visuals)exterior(k);
}

function shutter(k:KitBuilder,fixed:'x'|'z',at:number,[a,b]:[number,number],bottom:number,top:number):void {
    const mid=(a+b)/2,len=b-a,h=top-bottom,off=.1;
    if(fixed==='z')k.solid('steel',mid,(bottom+top)/2,at+off,len,h,.2);else k.solid('steel',at-off,(bottom+top)/2,mid,.2,h,len);
    if(!k.visuals)return;
    for(let y=bottom+.3;y<top;y+=.45)fixed==='z'?k.piece('iron',mid,y,at-.02,len,.06,.12):k.piece('iron',at+.02,y,mid,.12,.06,len);
    fixed==='z'?k.piece('rust',mid,bottom+.1,at-.02,len,.2,.3):k.piece('rust',at+.02,bottom+.1,mid,.3,.2,len);
}

/** The mezzanine along the south wall with a west arm, and a catwalk across the north bay. */
function mezzanine(k:KitBuilder):void {
    const {x0,x1,z1}=PIER9,Y=MEZZANINE_Y,edge=EDGE,T2=T/2;
    k.slab('steel',(x0+x1)/2,Y,(edge+z1-T2)/2,x1-x0-T,z1-T2-edge,.5);
    k.slab('steel',(x0+T2+90)/2,Y,(-141.2+edge)/2,90-x0-T2,edge+141.2,.5);
    // The catwalk: from the west arm, across the bay, over the quay door.
    k.slab('steel',(90+128)/2,Y,-140,38,2.4,.3);
    railing(k,90,-141.2,128,-141.2,Y);railing(k,90,-138.8,128,-138.8,Y);railing(k,128,-141.2,128,-138.8,Y);
    // Stairs up to the mezzanine front, rising south.
    for(const x of STAIR_X){
        const from={x,y:0,z:edge-STAIR_RUN};
        k.stair('steel',from,-Math.PI/2,Y,STAIR_RUN,STAIR_W);
        for(const o of [-1.5,1.5])stairRailing(k,from,-Math.PI/2,Y,STAIR_RUN,o);
    }
    // Railings along the mezzanine edge, open at the stair heads and the catwalk.
    railing(k,90,edge,98.4,edge,Y);railing(k,101.6,edge,116.4,edge,Y);railing(k,119.6,edge,HARBOUR_MASTER.x0,edge,Y);
    // Round the office roof, which stands proud of the mezzanine.
    railing(k,HARBOUR_MASTER.x0,edge,HARBOUR_MASTER.x0,HARBOUR_MASTER.z0,Y);railing(k,HARBOUR_MASTER.x0,HARBOUR_MASTER.z0,x1-T2,HARBOUR_MASTER.z0,Y);
    railing(k,90,-138.8,90,edge,Y);railing(k,x0+T2,-141.2,90,-141.2,Y);
    // Columns under the mezzanine and the catwalk hangers.
    for(let x=88;x<x1;x+=8)k.solid('iron',x,(Y-.5)/2,edge+.3,.4,Y-.5,.4);
    for(const z of [-126,-134])k.solid('iron',89.7,(Y-.5)/2,z,.4,Y-.5,.4);
    if(k.visuals)for(let x=94;x<128;x+=6)for(const z of [-141.1,-138.9])k.piece('iron',x,(Y+PIER9.height)/2,z,.06,PIER9.height-Y,.06);
}

/** The harbour master's office: glass on iron mullions over a wooden dado, a desk and files. */
function office(k:KitBuilder):void {
    const {x0,x1,z0,z1,height:H}=HARBOUR_MASTER,door=OFFICE_DOOR;
    const glass=(ax:number,az:number,bx:number,bz:number)=>{
        k.wall('wood',ax,az,bx,bz,0,1.1,.2);
        k.wall('glass',ax,az,bx,bz,1.1,H-.4,.08);
        k.wall('wood',ax,az,bx,bz,H-.4,H,.2);
        if(!k.visuals)return;
        const length=Math.hypot(bx-ax,bz-az);
        for(let u=0;u<=length+.01;u+=1.5)k.piece('iron',ax+(bx-ax)*u/length,(1.1+H-.4)/2,az+(bz-az)*u/length,.12,H-1.5,.12);
    };
    glass(x0,z0,door[0],z0);glass(door[1],z0,x1,z0);
    k.wall('wood',door[0],z0,door[1],z0,H-.8,H,.2);
    glass(x0,z0,x0,z1-.4);
    // Its roof is part of the mezzanine floor.
    k.slab('steel',(x0+x1)/2,MEZZANINE_Y,(z0-.1-122)/2,x1-x0,-122-z0+.1,.5);
    k.room({id:'harbour-master',xmin:x0,xmax:x1,zmin:z0,zmax:z1,ymin:0,ymax:H});
    k.fixture({x:129,y:H-.6,z:-120,color:0xf0cf96,intensity:40,distance:9,room:'harbour-master',floor:0,ceiling:H});
    k.solid('wood',130,.55,-118.5,3.4,1.1,1.6);
    for(const x of [133.6,134.6])k.solid('steel',x,1,-115.3,.9,2,1);
    k.solid('steel',123,1,-116,1,2,1.8);
    if(!k.visuals)return;
    k.piece('warm',130.8,1.35,-118.8,.3,.5,.3);
    k.piece('paper',129.4,1.12,-118.3,1.2,.03,.8);
    k.sign({lines:['HARBOUR MASTER'],x:125.3,y:H-.4,z:z0-.12,w:3.4,h:.6,ry:Math.PI,bg:'#1a1712',fg:'#e0c68e',glow:true});
    k.sign({lines:['BAY CITY HARBOUR','CHART No. 9'],x:131,y:3.5,z:z1-.45,w:3.6,h:2.4,ry:Math.PI,bg:'#8f8a74',fg:'#2a2a33'});
}

/** Racks, crates, pillars and a forklift on the warehouse floor. */
function floor(k:KitBuilder):void {
    // Pallet racks: two tiers of crates on iron uprights. Solid cover, climbable in two hops.
    for(const [x,z] of [[92.5,-131],[92.5,-136],[126,-131],[126,-136]] as const){
        k.collide(x,2.6,z,11,5.2,1.6);
        if(!k.visuals)continue;
        for(const dx of [-5.4,-1.8,1.8,5.4])for(const dz of [-.7,.7])k.piece('iron',x+dx,2.6,z+dz,.14,5.2,.14);
        for(const y of [.2,2.6,5.1])k.piece('rust',x,y,z,11,.12,1.6);
        for(const [dx,y,s] of [[-3.6,.3,1.9],[.3,.3,1.6],[3.7,.3,2],[-3.4,2.7,1.5],[0,2.7,1.9],[3.4,2.7,1.2]] as const)
            k.piece('wood',x+dx,y+s/2,z,s,s,Math.min(s,1.4));
    }
    for(const x of [92,108,124])k.solid('iron',x,PIER9.height/2,-128.5,.6,PIER9.height,.6);
    for(const [x,z,s,r] of [[110,-141,1.8,.2],[112,-142.6,1.3,0],[108.6,-116.8,1.6,.5],[85.5,-144,1.8,0]] as const)crate(k,x,0,z,s,r);
    crate(k,85.5,1.8,-144,1.2,.3);
    k.solid('box-ochre',104,.85,-124.8,2.6,1.3,1.5);
    if(k.visuals){
        k.piece('iron',105.4,1.8,-124.8,.2,3.2,1.2);k.piece('iron',106.2,.15,-124.8,1.6,.1,1);
        // Roof trusses.
        for(let x=86;x<PIER9.x1;x+=6){
            k.piece('iron',x,PIER9.height-.4,(PIER9.z0+PIER9.z1)/2,.25,.4,PIER9.z1-PIER9.z0);
            k.piece('iron',x,PIER9.height-1.6,(PIER9.z0+PIER9.z1)/2,.18,.18,PIER9.z1-PIER9.z0-2);
        }
    }
}

function lights(k:KitBuilder):void {
    // Pendants hung low under the trusses: pools of light on the floor, dark rafters above.
    for(const [x,z] of [[94,-133],[109,-133],[124,-133],[109,-141]] as const)
        k.fixture({x,y:9,z,color:0xe9c38a,intensity:110,distance:20,room:'pier9-warehouse',floor:0,ceiling:PIER9.height});
    for(const x of [96,114])k.fixture({x,y:MEZZANINE_Y+3.6,z:-118,color:0xd9b27c,intensity:55,distance:12,room:'pier9-warehouse',floor:MEZZANINE_Y,ceiling:PIER9.height});
    // Caged bulbs under the mezzanine: the aisle along the south wall and the stair feet.
    for(const x of [90,104,116])k.fixture({x,y:MEZZANINE_Y-1.1,z:-118.5,color:0xd8b27a,intensity:45,distance:10,angle:1.1,room:'pier9-warehouse',floor:0,ceiling:MEZZANINE_Y-.5});
    // The open doors throw the hall's light out onto the quay and the streets.
    const mid=([a,b]:[number,number])=>(a+b)/2;
    k.spill({x:mid(QUAY_DOOR),y:3.4,z:PIER9.z0-.5,nx:0,nz:-1,kind:'door',color:0xe9c38a,reach:12,width:9});
    k.spill({x:PIER9.x1+.5,y:3.2,z:mid(EAST_DOOR),nx:1,nz:0,kind:'door',color:0xe9c38a,reach:11,width:7});
    k.spill({x:mid(SOUTH_DOOR),y:3,z:PIER9.z1+.5,nx:0,nz:1,kind:'door',color:0xd9b27c,reach:10,width:4.5});
    k.spill({x:PIER9.x0-.5,y:3,z:mid(WEST_DOOR),nx:-1,nz:0,kind:'door',color:0xd9b27c,reach:9,width:4});
    // Floodlights over the quay door and the east door.
    k.fixture({x:109,y:8.2,z:PIER9.z0-1.2,color:0xffd29a,intensity:55,distance:24,angle:1});
    k.fixture({x:PIER9.x1+1.2,y:8.2,z:-129,color:0xffd29a,intensity:45,distance:22,angle:1});
    floodHead(k,109,8.3,PIER9.z0-1.1);floodHead(k,PIER9.x1+1.1,8.3,-129,Math.PI/2);
}

function exterior(k:KitBuilder):void {
    const {x0,x1,z0,z1,height:H}=PIER9,skin={body:'brick' as const,light:'warm' as const,pitch:6,windowW:3.2,windowH:2.2};
    k.facade(x0-T/2,z0-T/2,x1+T/2,z0-T/2,6,H,skin);
    k.facade(x1+T/2,z0-T/2,x1+T/2,z1+T/2,6,H,skin);
    k.facade(x1+T/2,z1+T/2,x0-T/2,z1+T/2,6,H,skin);
    k.facade(x0-T/2,z1+T/2,x0-T/2,z0-T/2,6,H,skin);
    // A stone plinth and a band at the shutter heads.
    for(const [ax,az,bx,bz] of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x0,z1,x1,z1],[x0,z0,x0,z1]] as const){
        const alongX=az===bz,len=alongX?bx-ax+T*2:bz-az+T*2,out=T/2+.08;
        const cx=(ax+bx)/2+(alongX?0:(ax===x0?-out:out)),cz=(az+bz)/2+(alongX?(az===z0?-out:out):0);
        k.piece('stone',cx,.6,cz,alongX?len:.2,1.2,alongX?.2:len);
        k.piece('trim',cx,6.1,cz,alongX?len:.24,.3,alongX?.24:len);
    }
    // The high windows seen from inside: black glass, and every fourth pane moonlit through blinds.
    let pane=0;
    for(const [ax,az,bx,bz,nx,nz] of [[x0,z0,x1,z0,0,1],[x0,z1,x1,z1,0,-1],[x0,z0,x0,z1,1,0],[x1,z0,x1,z1,-1,0]] as const){
        const alongX=az===bz,len=alongX?bx-ax:bz-az,ry=alongX?0:Math.PI/2,off=T/2+.04;
        for(let u=3.5;u<len-2;u+=6,pane++){
            const x=alongX?ax+u:ax+nx*off,z=alongX?az+nz*off:az+u,lit=pane%4===1;
            k.piece('iron',x,10.5,z,3.65,2.65,.08,{ry});
            k.piece(lit?'cyan':'glass',x+nx*.05,10.5,z+nz*.05,3.2,2.2,.05,{ry});
            k.piece('iron',x+nx*.08,10.5,z+nz*.08,.1,2.2,.05,{ry});
            if(lit)for(let y=9.55;y<11.5;y+=.3)k.piece('iron',x+nx*.1,y,z+nz*.1,3.2,.13,.03,{ry});
        }
    }
    // Parapet and the painted name, big on the quay side and over the east door.
    k.piece('brick',(x0+x1)/2,H+1.4,z0-T/2,x1-x0+T,1.4,.5);
    k.sign({lines:['PIER 9'],x:109,y:H+2.4,z:z0-.7,w:14,h:3.4,ry:Math.PI,bg:'#2a1c1c',fg:'#d9ceb0'});
    k.piece('iron',109,H+.7,z0-.6,14.4,.2,.3);
    k.sign({lines:['PIER 9 · BAY CITY STEVEDORING CO.'],x:109,y:7.1,z:z0-.5,w:11,h:1,ry:Math.PI,bg:'#1c1a17',fg:'#cbb88c'});
    k.sign({lines:['PIER 9'],x:x1+.5,y:7.2,z:-129,w:6,h:1.4,ry:Math.PI/2,bg:'#2a1c1c',fg:'#d9ceb0'});
    k.sign({lines:['NO LOITERING','BY ORDER OF THE PORT AUTHORITY'],x:94,y:3.6,z:z0-.5,w:4.6,h:1.6,ry:Math.PI,bg:'#e3dcc4',fg:'#2b1c1a'});
    k.sign({lines:['HARBOUR MASTER · INQUIRE WITHIN'],x:x1+.5,y:3.2,z:-119,w:4.2,h:.7,ry:Math.PI/2,bg:'#1c1a17',fg:'#cbb88c'});
}
