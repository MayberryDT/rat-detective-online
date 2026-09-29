import type { KitBuilder } from '../kit';
import { QUAY_EDGE_Z } from '../northPlan';
import { floodHead, line, railing, stairRailing } from './docksKit';

/** Crane rails on the quay apron; the gantries straddle them. */
export const CRANE_RAILS = [-168,-156] as const;
/** The crane deck and boom walkway: a sniper perch over the docks. */
export const CRANE_DECK_Y = 18.6;
/** Three flights of about 22° (steeper ramps are not walkable). */
const FLIGHT_RISE = CRANE_DECK_Y/3, FLIGHT_RUN = 15.4;
/** The stair tower's two lanes (even z, so the walk grid runs up their middles). */
const LANE_A = -164, LANE_B = -160;
const BOOM_TIP = -192;

/**
 * A gantry crane on the quay at `cx`, with its stair tower on side `s` (+1 east, -1 west):
 * three 30° flights with landings to the deck at y 18.6, and a railed walkway out along the
 * boom over the water. Legs, beams and the machinery house are solid (cover, bank faces).
 */
export function gantryCrane(k:KitBuilder,cx:number,s:1|-1,label:string):void {
    const [north,south]=CRANE_RAILS,Y=CRANE_DECK_Y;
    // Legs on bogies that sit on the rails, cross-braced below the portal.
    for(const lx of [cx-6,cx+6])for(const lz of [north,south]){
        k.solid('crane',lx,Y/2-.3,lz,1.2,Y-.6,1.2);
        k.solid('cranedark',lx,.6,lz,1.4,1.2,3);
        k.piece('iron',lx,.12,lz-1.1,.9,.24,.5,{round:true});k.piece('iron',lx,.12,lz+1.1,.9,.24,.5,{round:true});
    }
    for(const lx of [cx-6,cx+6]){
        // Side frames: a sill high above the rats and one X brace.
        k.solid('crane',lx,Y-1.2,(north+south)/2,1,1.2,12);
        const h=Y-7,len=Math.hypot(12,h-4),a=Math.atan2(h-4,12);
        k.piece('crane',lx,4+(h-4)/2,(north+south)/2,len,.5,.5,{ry:Math.PI/2,rz:a});
        k.piece('crane',lx,4+(h-4)/2,(north+south)/2,len,.5,.5,{ry:-Math.PI/2,rz:a});
    }
    for(const lz of [north,south])k.solid('crane',cx,Y-1.2,lz,13.2,1.2,1);
    // The deck over the portal, reaching the stair tower's top landing.
    const deckX0=s>0?cx-7:cx-10,deckX1=s>0?cx+10:cx+7;
    k.slab('deck',(deckX0+deckX1)/2,Y,(north+south)/2,deckX1-deckX0,16,.5);
    // The boom walkway, out over the water to the tip.
    const boomZ0=north-2;
    k.slab('deck',cx,Y,(boomZ0+BOOM_TIP)/2,2.8,boomZ0-BOOM_TIP,.4);
    for(const side of [-1,1])railing(k,cx+side*1.4,boomZ0,cx+side*1.4,BOOM_TIP,Y);
    railing(k,cx-1.4,BOOM_TIP,cx+1.4,BOOM_TIP,Y);
    // Deck railings, open where the boom walkway and the stair tower join.
    const zN=north-2,zS=south+2,topX=s>0?deckX1:deckX0;
    railing(k,deckX0,zS,deckX1,zS,Y);
    railing(k,deckX0,zN,cx-1.4,zN,Y);railing(k,cx+1.4,zN,deckX1,zN,Y);
    const farX=s>0?deckX0:deckX1;
    railing(k,farX,zN,farX,zS,Y);
    railing(k,topX,zN,topX,LANE_A-1.8,Y);railing(k,topX,LANE_A+1.8,topX,zS,Y);
    // The machinery house, away from the tower: a solid block to fight around up top.
    const hx=cx-s*3.2;
    k.solid('crane',hx,Y+2.1,south-.4,6,4.2,4.4);
    k.piece('cranedark',hx,Y+4.35,south-.4,6.4,.3,4.8);
    if(k.visuals)for(const u of [-1.8,0,1.8])k.piece(u===0?'warm':'glass',hx+u,Y+2.8,south-2.66,1.1,.8,.06);
    // The operator's cab slung under the boom at the quay edge, lit a little.
    k.solid('cranedark',cx+1.9,Y-1.7,north-3.8,2.4,2.6,2.6);
    k.piece('warm',cx+1.9,Y-1.4,north-5.12,1.8,.9,.05);
    stairTower(k,cx,s);
    if(k.visuals)boom(k,cx);
    lightsAndSign(k,cx,label);
}

function stairTower(k:KitBuilder,cx:number,s:1|-1):void {
    const toward=s>0?Math.PI:0,away=s>0?0:Math.PI,R=FLIGHT_RISE;
    const nearX=cx+s*10,farX=cx+s*(10+FLIGHT_RUN),outer=cx+s*(13+FLIGHT_RUN);
    const flights:Array<{from:{x:number;y:number;z:number};ry:number;outside:number}>=[
        {from:{x:farX,y:0,z:LANE_A},ry:toward,outside:-1},
        {from:{x:nearX,y:R,z:LANE_B},ry:away,outside:1},
        {from:{x:farX,y:2*R,z:LANE_A},ry:toward,outside:-1},
    ];
    for(const f of flights){
        k.stair('steel',f.from,f.ry,R,FLIGHT_RUN,3.6);
        // Rail on the tower's outer face (+z for lane B, -z for lane A).
        const off=f.outside*1.9,offset=Math.cos(f.ry)>0?off:-off;
        stairRailing(k,f.from,f.ry,R,FLIGHT_RUN,offset);
    }
    // Landings span both lanes; the upper one rides above the first flight's foot.
    // Each landing is railed on its open side (the flights join on the other).
    for(const [x0,x1,y,edge] of [[cx+s*7,nearX,R,cx+s*7],[farX,outer,2*R,outer]] as const){
        k.slab('steel',(x0+x1)/2,y,(LANE_A+LANE_B)/2,Math.abs(x1-x0),8,.4);
        railing(k,edge,LANE_A-2,edge,LANE_B+2,y);
        railing(k,x0,LANE_A-2,x1,LANE_A-2,y);railing(k,x0,LANE_B+2,x1,LANE_B+2,y);
    }
    // Tower corner posts and a few horizontal ties: the steel frame you climb inside.
    for(const x of [nearX,farX+s*.6,outer])for(const z of [LANE_A-2.2,LANE_B+2.2])k.solid('cranedark',x,CRANE_DECK_Y/2,z,.35,CRANE_DECK_Y,.35);
    if(k.visuals)for(let y=3;y<CRANE_DECK_Y;y+=3.1)for(const z of [LANE_A-2.2,LANE_B+2.2])
        k.piece('cranedark',(nearX+outer)/2,y,z,Math.abs(outer-nearX),.18,.18);
}

function boom(k:KitBuilder,cx:number):void {
    const Y=CRANE_DECK_Y,[north,south]=CRANE_RAILS,top=Y+4.6,back=south+8;
    // Four chords from the backreach over the quay to the tip over the water.
    for(const side of [-1,1]){
        k.piece('crane',cx+side*1.5,top,(back+BOOM_TIP)/2,.45,.45,back-BOOM_TIP);
        k.piece('crane',cx+side*1.5,Y+1.2,(north-2+BOOM_TIP)/2,.3,.3,north-2-BOOM_TIP);
    }
    // Lattice: verticals and diagonals every three units.
    for(let z=north-2;z>BOOM_TIP;z-=3)for(const side of [-1,1]){
        k.piece('crane',cx+side*1.5,(Y+1.2+top)/2,z,.18,top-Y-1.2,.18);
        line(k,{x:cx+side*1.5,y:Y+1.2,z},{x:cx+side*1.5,y:top,z:z-3},'crane',.14);
    }
    for(let z=back;z>BOOM_TIP;z-=3)k.piece('crane',cx,top,z,3,.14,.14);
    // The A-frame apex over the portal and its stays to the tip and the backreach.
    const apex={x:cx,y:Y+11,z:south-1};
    for(const side of [-1,1]){
        line(k,{x:cx+side*6,y:Y+.2,z:south},apex,'crane',.5);
        line(k,{x:cx+side*6,y:Y+.2,z:north},apex,'crane',.4);
        line(k,apex,{x:cx+side*1.5,y:top,z:BOOM_TIP+1},'iron',.1);
        line(k,apex,{x:cx+side*1.5,y:top,z:back},'iron',.1);
    }
    k.piece('cranedark',cx,top+.5,back+1.6,3.4,2.4,3.2,{castShadow:true});
    // The trolley at the tip and the hook hanging over the water.
    k.piece('cranedark',cx,top-.8,BOOM_TIP+3,2.6,1,2.2);
    line(k,{x:cx-.2,y:top-1.3,z:BOOM_TIP+3},{x:cx-.2,y:9.6,z:BOOM_TIP+3},'iron',.05);
    line(k,{x:cx+.2,y:top-1.3,z:BOOM_TIP+3},{x:cx+.2,y:9.6,z:BOOM_TIP+3},'iron',.05);
    k.piece('cranedark',cx,9.2,BOOM_TIP+3,1,.9,.7);
    k.piece('rust',cx,8.4,BOOM_TIP+3,.25,.8,.25);
    k.piece('neon',cx,top+.35,BOOM_TIP+.4,.25,.25,.25);
}

function lightsAndSign(k:KitBuilder,cx:number,label:string):void {
    const Y=CRANE_DECK_Y,[north,south]=CRANE_RAILS;
    // Floodlights under the portal, onto the apron and the water's edge.
    for(const [x,z] of [[cx-4,north-1],[cx+4,north-1],[cx,south+1]] as const){
        k.fixture({x,y:Y-2.4,z,color:0xffd6a0,intensity:55,distance:28,angle:.95});
        floodHead(k,x,Y-2.2,z);
    }
    k.fixture({x:cx,y:Y-1,z:QUAY_EDGE_Z-12,color:0xcfe3ff,intensity:40,distance:26,angle:1});
    floodHead(k,cx,Y-.8,QUAY_EDGE_Z-12);
    k.sign({lines:[label],x:cx,y:Y-1.2,z:north-.52,w:5.2,h:.95,ry:Math.PI,bg:'#6b5a24',fg:'#16140f'});
    k.sign({lines:[label],x:cx,y:Y-1.2,z:south+.52,w:5.2,h:.95,ry:0,bg:'#6b5a24',fg:'#16140f'});
}
