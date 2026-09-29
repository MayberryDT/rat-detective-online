import type { KitBuilder } from '../kit';
import type { Vec3Data } from '../../../networkProtocol';
import type { PickupAnchor } from '../../../pickups';
import type { JurisdictionZone } from '../../../jurisdictionZones';
import { HARBOUR, QUAY, QUAY_EDGE_Z, SEA_FLOOR_Y } from '../northPlan';
import { bollard, chain, crate, line, railing } from './docksKit';
import { gantryCrane, CRANE_RAILS } from './docksCrane';
import { freighter, GANGWAY_X, SHIP, SHIP_Z } from './docksShip';
import { containerYard } from './docksYard';
import { HARBOUR_MASTER, pier9 } from './docksWarehouse';

/**
 * The docks (plan W4): the quay apron with bollards, chains and crane rails, three timber
 * piers into the harbour, the freighter Marlowe at her berth, two climbable gantry cranes,
 * the container yard, the Pier 9 warehouse and a lighthouse on the east breakwater.
 * Falling in the water is possible (and fatal) but never a single careless step:
 * a granite coping, bollards and chains line the edge.
 */
export const PIERS = [-18, 18, 70] as const;
export const PIER_HALF = 4;
export const PIER_END = -193;
export const BREAKWATER = {x0:152, x1:162, z0:-195} as const;
export const LIGHTHOUSE = {x:157, z:-190} as const;
/** Gantry cranes: centre x and the side of the stair tower. */
export const CRANES = [{x:-4, side:1, label:'PORT AUTHORITY No. 1'}, {x:104, side:1, label:'PORT AUTHORITY No. 2'}] as const;
/** Hard edges the water slaps against (piers, breakwater, the Marlowe's hull, the sea wall): the client paints foam along them. */
export const DOCKS_WATERLINE:ReadonlyArray<{x0:number;z0:number;x1:number;z1:number}> = (()=>{
    const E=QUAY_EDGE_Z-1,hull:Array<[number,number]>=[[86,SHIP.south],[130,SHIP.south],[SHIP.bow,SHIP_Z],[130,SHIP.north],[86,SHIP.north],[SHIP.stern,-188],[SHIP.stern,-179]];
    return [
        ...PIERS.flatMap(x=>[{x0:x-PIER_HALF,z0:E,x1:x-PIER_HALF,z1:PIER_END},{x0:x-PIER_HALF,z0:PIER_END,x1:x+PIER_HALF,z1:PIER_END},{x0:x+PIER_HALF,z0:PIER_END,x1:x+PIER_HALF,z1:E}]),
        {x0:BREAKWATER.x0-1.5,z0:E,x1:BREAKWATER.x0-1.5,z1:BREAKWATER.z0},{x0:BREAKWATER.x0,z0:BREAKWATER.z0-.4,x1:BREAKWATER.x1,z1:BREAKWATER.z0-.4},{x0:BREAKWATER.x1+1.5,z0:BREAKWATER.z0,x1:BREAKWATER.x1+1.5,z1:E},
        ...hull.map(([x,z],i)=>{const [bx,bz]=hull[(i+1)%hull.length]!;return {x0:x,z0:z,x1:bx,z1:bz};}),
        {x0:HARBOUR.xmin,z0:HARBOUR.zmin+1.4,x1:HARBOUR.xmax,z1:HARBOUR.zmin+1.4},
        {x0:HARBOUR.xmin+1.4,z0:HARBOUR.zmin,x1:HARBOUR.xmin+1.4,z1:E},{x0:HARBOUR.xmax-1.4,z0:HARBOUR.zmin,x1:HARBOUR.xmax-1.4,z1:E},
    ];
})();

export function docks(k:KitBuilder):void {
    quay(k);
    for(const x of PIERS)pier(k,x);
    breakwater(k);
    freighter(k);
    for(const c of CRANES)gantryCrane(k,c.x,c.side,c.label);
    containerYard(k);
    pier9(k);
    seaWall(k);
}

/**
 * The outer harbour wall: the city's edge where it meets the water (the perimeter collider
 * behind it) dressed as dark masonry from the sea floor, with buttresses, a coping and red
 * harbour-limit lights. Its face is a collider too, so shots bank off what the eye sees.
 */
function seaWall(k:KitBuilder):void {
    const top=8.4,h=top-SEA_FLOOR_Y,cy=(top+SEA_FLOOR_Y)/2,E=QUAY_EDGE_Z,side=(E+HARBOUR.zmin)/2,len=E-HARBOUR.zmin;
    const runs:Array<{x:number;z:number;w:number;d:number;along:'x'|'z';inward:number}>=[
        {x:(HARBOUR.xmin+HARBOUR.xmax)/2,z:HARBOUR.zmin+.9,w:HARBOUR.xmax-HARBOUR.xmin,d:.8,along:'x',inward:1},
        {x:HARBOUR.xmin+.9,z:side,w:.8,d:len,along:'z',inward:1},
        {x:HARBOUR.xmax-.9,z:side,w:.8,d:len,along:'z',inward:-1},
    ];
    for(const r of runs){
        k.solid('stone',r.x,cy,r.z,r.w,h,r.d);
        if(!k.visuals)continue;
        const length=r.along==='x'?r.w:r.d,face=.4*r.inward;
        const at=(u:number,off:number)=>r.along==='x'?{x:r.x-length/2+u,z:r.z+off}:{x:r.x+off,z:r.z-length/2+u};
        const span=(off:number,y:number,thick:number,height:number,finish:'trim'|'pile'|'iron')=>{
            const p=at(length/2,off);k.piece(finish,p.x,y,p.z,r.along==='x'?length:thick,height,r.along==='x'?thick:length);
        };
        span(face+.05,-1.7,.12,1.2,'pile');
        span(face+.15,top+.18,.5,.36,'trim');
        for(let u=6;u<length-3;u+=12){
            const p=at(u,face+.3);
            k.piece('stone',p.x,(top-2.6)/2,p.z,r.along==='x'?1.4:.6,top+2.6,r.along==='x'?.6:1.4,{castShadow:true});
            if(Math.round(u/12)%3===0){const q=at(u,face+.2);k.piece('neon',q.x,top+.62,q.z,.35,.35,.35,{round:true});}
        }
    }
}

/** Openings in the quay edge: pier heads, the gangway and the breakwater. */
const EDGE_OPENINGS:Array<[number,number]> = [
    ...PIERS.map(x=>[x-PIER_HALF,x+PIER_HALF] as [number,number]),
    [GANGWAY_X-1.6,GANGWAY_X+1.6],[BREAKWATER.x0,BREAKWATER.x1],
];

function quay(k:KitBuilder):void {
    const E=QUAY_EDGE_Z,x0=QUAY.xmin,x1=QUAY.xmax;
    // The granite coping: a low lip at the edge, open at the pier heads and the gangway.
    const cuts=[...EDGE_OPENINGS].sort((a,b)=>a[0]-b[0]);
    let from=x0;
    for(const [a,b] of [...cuts,[x1,x1] as [number,number]]){
        if(a-from>.5){k.collide((from+a)/2,.16,E+.45,a-from,.32,.9);k.piece('curb',(from+a)/2,.16,E+.45,a-from,.32,.9);}
        from=b;
    }
    // Bollards every nine units; chains hang between some, so the edge is a choice.
    const posts:number[]=[];
    for(let x=x0+3;x<x1-2;x+=9){
        if(EDGE_OPENINGS.some(([a,b])=>x>a-1.2&&x<b+1.2)||[84,100,124,140].some(b=>Math.abs(b-x)<3))continue;
        bollard(k,x,E+1.4);posts.push(x);
    }
    for(let i=0;i+1<posts.length;i++){
        const a=posts[i]!,b=posts[i+1]!;
        if(b-a<9.5&&i%3!==1)chain(k,a,E+1.4,b,E+1.4);
    }
    // Cleats between the bollards, drain grates and rope coils: the apron's small print.
    if(k.visuals){
        for(let x=x0+7.5;x<x1-2;x+=18){
            if(EDGE_OPENINGS.some(([a,b])=>x>a-1&&x<b+1))continue;
            k.piece('iron',x,.12,E+.9,1.1,.14,.22);k.piece('iron',x,.06,E+.9,.35,.12,.35);
        }
        // Crane rails the length of the quay, set in a darker bed.
        for(const z of CRANE_RAILS){
            k.piece('asphalt',(x0+x1)/2,.012,z,x1-x0,.02,1.4);
            for(const dz of [-.35,.35])k.piece('steel',(x0+x1)/2,.04,z+dz,x1-x0,.06,.12);
        }
        for(let x=x0+12;x<x1;x+=23)for(const z of [-163,-152])k.piece('iron',x+(z>-160?9:0),.015,z,1.4,.03,.9);
        for(const [x,z] of [[-32,-166],[36,-165.5],[86,-164],[146,-160]] as const){
            k.piece('rope',x,.14,z,1.3,.28,1.3,{round:true});k.piece('iron',x,.3,z,.5,.04,.5,{round:true});
        }
    }
    // Oil drums and crates on the apron: low cover along the long sightline.
    for(const [x,z] of [[-36,-156],[-35,-157.4],[42,-153],[60.5,-164],[61.6,-165.5],[134,-153],[150,-155]] as const){
        k.collide(x,.65,z,.9,1.3,.9);
        k.piece(x>100?'rust':'box-blue',x,.65,z,.9,1.3,.9,{round:true});
        k.piece('iron',x,.9,z,.94,.06,.94,{round:true});
    }
    for(const [x,z,s,r] of [[-24,-153,1.8,.2],[-22.6,-152.6,1.2,.5],[28,-165,1.6,.1],[85,-155,1.8,.3],[146,-165,1.6,.2],[147.5,-163.8,1.1,0]] as const)crate(k,x,0,z,s,r);
    // Harbour lamps on the quay wall's kerb row, off the apron like every kerb lamp (they
    // suppress the regular kerb lamps nearby).
    for(const x of [-30,30,78.5,118])k.lamp(x,E-.6);
    k.sign({lines:['NO LOITERING','BY ORDER OF THE PORT AUTHORITY'],x:-37,y:2.4,z:-151.2,w:3.6,h:1.3,ry:0,bg:'#e3dcc4',fg:'#2b1c1a'});
    if(k.visuals){k.piece('iron',-37,1.2,-151.35,.12,2.4,.12);}
}

/** A timber pier on piles from the quay edge to PIER_END, deck at street level. */
function pier(k:KitBuilder,px:number):void {
    const E=QUAY_EDGE_Z,len=E-PIER_END,cz=(E+PIER_END)/2,W=PIER_HALF*2;
    k.collide(px,-.25,cz,W,.5,len);
    // Mooring posts along both sides and a rail across the end.
    for(let z=E-3.5;z>PIER_END+1;z-=7)for(const s of [-1,1])k.solid('pile',px+s*(PIER_HALF-.35),.55,z,.6,1.1,.6);
    railing(k,px-PIER_HALF+.4,PIER_END+.4,px+PIER_HALF-.4,PIER_END+.4,0,'timber');
    k.lamp(px+PIER_HALF-1,PIER_END+2);
    crate(k,px-2.2,0,PIER_END+4,1.5,.3);
    if(!k.visuals)return;
    // Planks with a hairline gap, stringers and wales, and the piles down to the sea floor.
    for(let z=E-.45;z>PIER_END;z-=.9)k.piece('timber',px,-.11,z,W,.2,.8);
    for(const dx of [-2.6,0,2.6])k.piece('pile',px+dx,-.45,cz,.4,.45,len);
    for(const s of [-1,1]){
        k.piece('pile',px+s*(PIER_HALF+.1),-.3,cz,.22,.5,len);
        k.piece('timber',px+s*(PIER_HALF+.12),-1.4,cz,.25,.3,len);
    }
    for(let z=E-1.5;z>=PIER_END;z-=3.5)for(const dx of [-3.7,0,3.7])
        k.piece('pile',px+dx,(SEA_FLOOR_Y-.2)/2,z,.55,-SEA_FLOOR_Y-.2,.55,{round:true});
    for(let z=E-3.5;z>PIER_END+1;z-=7)for(const s of [-1,1])k.piece('rope',px+s*(PIER_HALF-.35),.8,z,.72,.14,.72,{round:true});
    // Rope coils, a life ring on the end rail and a line to the water.
    k.piece('rope',px+1.5,.13,PIER_END+6,1.2,.26,1.2,{round:true});
    k.piece('hullred',px,.95,PIER_END+.3,1.1,.16,1.1,{round:true,rx:Math.PI/2});
    k.piece('trim',px,.95,PIER_END+.28,.7,.18,.7,{round:true,rx:Math.PI/2});
    line(k,{x:px-PIER_HALF+.35,y:.9,z:E-10.5},{x:px-PIER_HALF-2.5,y:-2.3,z:E-13});
}

/** The east breakwater: a stone jetty out to the lighthouse. */
function breakwater(k:KitBuilder):void {
    const {x0,x1,z0}=BREAKWATER,E=QUAY_EDGE_Z,cx=(x0+x1)/2,len=E-z0;
    k.collide(cx,-.5,(E+z0)/2,x1-x0,1,len);
    k.piece('stone',cx,(SEA_FLOOR_Y-1)/2,(E+z0)/2,x1-x0,-SEA_FLOOR_Y+1,len,{castShadow:true});
    // Low parapets on both sides, broken by a gap for fishing.
    for(const x of [x0+.4,x1-.4]){k.solid('stone',x,.35,(E+z0)/2+1,.8,.7,len-2);}
    const {x,z}=LIGHTHOUSE;
    k.collide(x,8,z,4.6,16,4.6);
    k.lamp(cx,E-6);
    k.fixture({x,y:17.4,z,color:0xfff0c8,intensity:60,distance:40});
    if(!k.visuals)return;
    for(let i=0;i<14;i++){
        const t=i/13,side=i%2?1:-1;
        k.piece('stone',side>0?x1+.9:x0-.9,-1.6+(i%3)*.3,E-1-t*(len-2),1.8,1.4,1.6,{ry:i*.7,rz:(i%4-1.5)*.2});
    }
    k.piece('trim',x,5,z,5,10,5,{round:true,castShadow:true});
    k.piece('hullred',x,8,z,4.9,2,4.9,{round:true});
    k.piece('trim',x,13,z,4.2,6,4.2,{round:true,castShadow:true});
    k.piece('hullred',x,15.3,z,4.3,1.2,4.3,{round:true});
    k.piece('iron',x,16.1,z,5.8,.25,5.8,{round:true});
    k.piece('glass',x,17.3,z,3,2.2,3,{round:true});
    k.piece('beacon',x,17.3,z,1.2,1.4,1.2,{round:true});
    for(let a=0;a<6;a++)k.piece('iron',x+Math.cos(a)*1.45,17.3,z+Math.sin(a)*1.45,.1,2.2,.1);
    k.piece('iron',x,18.7,z,3.6,.5,3.6,{round:true});
    k.piece('iron',x,19.2,z,2.2,.5,2.2,{round:true});
    k.piece('iron',x,19.8,z,.5,.8,.5,{round:true});
    k.piece('iron',x,1.2,z+2.3,1.3,2.4,.2);
    k.piece('warm',x,11,z+2.1,.5,.8,.1);
    k.sign({lines:['EAST BREAKWATER','NO FISHING'],x:cx,y:1.7,z:E-.3,w:3.2,h:1.1,ry:0,bg:'#e3dcc4',fg:'#2b1c1a'});
    k.piece('iron',cx,.85,E-.4,.1,1.7,.1);
}

/** The docks' gameplay slots, for the registries (the integration owner splices them in). */
export const DOCKS_JOBS = {
    caseSpawns:[
        {x:40,y:1.3,z:-160},
        {x:-9,y:1.3,z:-130.5},
        {x:109,y:1.3,z:-139},
        {x:119,y:SHIP.deck+1.3,z:-182.8},
        {x:18,y:1.3,z:-189},
    ] as readonly Vec3Data[],
    /** The yard's Quick Fix, and the quay's Hot Pursuit: it replaces `pursuit-north-avenue` (70,-150), which now stands at a pier head. */
    pickups:[
        {id:'fix-container-yard',kind:'quick-fix',x:-14,z:-117.5,y:.7,near:'Container yard, the lane between the south stacks'},
        {id:'pursuit-quay-west',kind:'hustle',x:-34,z:-161,y:.7,near:'West end of Quay Road, a straight sprint east along the water'},
    ] as readonly PickupAnchor[],
    /** A street-corner iron post where Seventy Avenue meets the quay (DISPATCH_STATIONS entry shape). */
    dispatch:{id:'quay',x:80.5,z:-151.5,face:-2.4},
    zone:{'the-quay':{label:'THE QUAY',category:'outdoor',floor:'STREET',floorY:0,
        areas:[{xmin:25,xmax:46,zmin:-170,zmax:-151}],exclusions:[],
        approaches:[{x:-4,y:.3,z:-162},{x:70,y:.3,z:-158},{x:33,y:.3,z:-128}],
        posts:[{x:33,y:.3,z:-160},{x:28,y:.3,z:-156},{x:39,y:.3,z:-164}]}} satisfies Record<string,JurisdictionZone>,
    destination:{harbourMaster:{label:'HARBOUR MASTER',short:'HARBOUR MASTER',
        center:{x:(HARBOUR_MASTER.x0+HARBOUR_MASTER.x1)/2,y:3,z:(HARBOUR_MASTER.z0+HARBOUR_MASTER.z1)/2},
        bounds:{xmin:HARBOUR_MASTER.x0,xmax:HARBOUR_MASTER.x1,ymin:-.5,ymax:HARBOUR_MASTER.height,zmin:HARBOUR_MASTER.z0,zmax:HARBOUR_MASTER.z1},
        approach:{x:125.3,y:.3,z:-128},arrival:{x:125.3,y:.3,z:-122.5}}},
} as const;
