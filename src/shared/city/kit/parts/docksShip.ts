import type { Finish, KitBuilder } from '../kit';
import { QUAY_EDGE_Z } from '../northPlan';
import { bollard, containerStack, crate, floodHead, line, railing, stairRailing } from './docksKit';

/**
 * The Marlowe: a noir freighter moored in the berth (x 82…140, z -192…-175), boarded by a
 * gangway from the quay. Main deck y 4 with deck cargo; an enterable deckhouse aft under a
 * bridge deck (y 9), and the wheelhouse above it with a railed roof (y 13.3). Steel hull and
 * house walls: long flat bank faces.
 */
export const SHIP = {stern:83.5, bow:139, south:-176.75, north:-190.25, deck:4, bridge:9, roof:13.3} as const;
export const SHIP_Z = (SHIP.south+SHIP.north)/2;
/** The gangway lands on the main deck at this x. */
export const GANGWAY_X = 106;
const KEEL = -6, BULWARK = 1.1, BOW_X = 130;
const HOUSE = {x0:86, x1:100, z0:-188, z1:-179} as const;
const BRIDGE_DECK = {x0:83, x1:105, z0:-190.25, z1:-176.75} as const;
const WHEELHOUSE = {x0:96, x1:102, z0:-187, z1:-180} as const;
/** Stairs climb at most about 22°: steeper ramps are not walkable (a rat's feet slip; bots will not path them). */
const LOWER_RUN = 12.4, UPPER_FOOT = 85.5;

export function freighter(k:KitBuilder):void {
    hull(k);
    deckhouse(k);
    cargo(k);
    gangway(k);
    if(k.visuals)dressing(k);
}

/** A hull wall from keel to bulwark, with the red waterline band and plate seams on its outer face. */
function side(k:KitBuilder,x0:number,z0:number,x1:number,z1:number,top:number,outward:1|-1,gaps:Array<[number,number]>=[]):void {
    k.wall('hull',x0,z0,x1,z1,KEEL,SHIP.deck,.5);
    // Bulwarks above the deck, open at gangway gaps (fractions along the wall).
    let t=0;
    for(const [a,b] of [...gaps,[1,1] as [number,number]]){
        if(a>t)k.wall('hull',x0+(x1-x0)*t,z0+(z1-z0)*t,x0+(x1-x0)*a,z0+(z1-z0)*a,SHIP.deck,top,.5);
        t=b;
    }
    if(!k.visuals)return;
    const length=Math.hypot(x1-x0,z1-z0),ux=(x1-x0)/length,uz=(z1-z0)/length,nx=uz*outward,nz=-ux*outward,ry=Math.atan2(-uz,ux);
    const at=(u:number,off:number)=>({x:x0+ux*u+nx*off,z:z0+uz*u+nz*off});
    const mid=at(length/2,.28);
    k.piece('hullred',mid.x,-2.15,mid.z,length+.1,1.9,.08,{ry});
    k.piece('trim',mid.x,3.55,mid.z,length+.1,.14,.08,{ry});
    const cap=at(length/2,0);k.piece('iron',cap.x,top+.05,cap.z,length+.1,.12,.62,{ry});
    for(let u=3;u<length-1;u+=4){const p=at(u,.27);k.piece('iron',p.x,.9,p.z,.07,5.6,.05,{ry});}
}

function hull(k:KitBuilder):void {
    const {stern,bow,south,north,deck}=SHIP,top=deck+BULWARK;
    const gap0=(GANGWAY_X-1.5-86)/(BOW_X-86),gap1=(GANGWAY_X+1.5-86)/(BOW_X-86);
    side(k,86,south,BOW_X,south,top,-1,[[gap0,gap1]]);
    side(k,BOW_X,north,86,north,top,-1);
    // A square transom with chamfered quarters, and a raked bow a little higher than the waist.
    side(k,stern,-188,stern,-179,top,-1);
    side(k,86,south,stern,-179,top,1);
    side(k,stern,-188,86,north,top,1);
    side(k,BOW_X,south,bow,SHIP_Z,top+.6,-1);
    side(k,bow,SHIP_Z,BOW_X,north,top+.6,-1);
    // The main deck, stepped into the bow, with yawed strips sealing the angled quarters.
    k.slab('deck',(86+BOW_X)/2,deck,SHIP_Z,BOW_X-86,south-north-.5);
    k.slab('deck',(stern+86)/2+.1,deck,SHIP_Z,86-stern-.2,9);
    for(const [x0,x1] of [[BOW_X,132.5],[132.5,135],[135,137.5]] as const){
        const hw=6.75*(bow-x1)/(bow-BOW_X);
        k.slab('deck',(x0+x1)/2,deck,SHIP_Z,x1-x0,hw*2);
    }
    strip(k,BOW_X,south,bow,SHIP_Z,.8);strip(k,BOW_X,north,bow,SHIP_Z,.8);
    strip(k,86,south,stern,-179,1);strip(k,86,north,stern,-188,1);
}

/** A deck strip along a raked hull wall, on its inboard side. */
function strip(k:KitBuilder,x0:number,z0:number,x1:number,z1:number,portion:number):void {
    const bx=x0+(x1-x0)*portion,bz=z0+(z1-z0)*portion,length=Math.hypot(bx-x0,bz-z0);
    const ux=(bx-x0)/length,uz=(bz-z0)/length,mx=(x0+bx)/2,mz=(z0+bz)/2;
    // Inboard: the normal that points at the middle of the ship.
    const flip=(-uz)*(110-mx)+ux*(SHIP_Z-mz)>0?1:-1;
    k.slab('deck',mx-uz*flip*1.25,SHIP.deck,mz+ux*flip*1.25,length,2.2,.6,{ry:Math.atan2(-uz,ux)});
}

function deckhouse(k:KitBuilder):void {
    const {deck,bridge,roof}=SHIP,H=HOUSE,B=BRIDGE_DECK,W=WHEELHOUSE,paint:Finish='trim';
    const under=bridge-.6;
    // The deckhouse: doors fore, port and starboard; portholes on the long walls.
    k.wall(paint,H.x0,H.z0,H.x0,H.z1,deck,under,.35);
    k.wall(paint,H.x1,H.z0,H.x1,SHIP_Z-1.1,deck,under,.35);k.wall(paint,H.x1,SHIP_Z+1.1,H.x1,H.z1,deck,under,.35);
    k.wall(paint,H.x1,SHIP_Z-1.1,H.x1,SHIP_Z+1.1,deck+2.6,under,.35);
    for(const z of [H.z0,H.z1]){
        k.wall(paint,H.x0,z,92,z,deck,under,.35);k.wall(paint,94.4,z,H.x1,z,deck,under,.35);
        k.wall(paint,92,z,94.4,z,deck+2.6,under,.35);
    }
    k.room({id:'marlowe-cabin',xmin:H.x0,xmax:H.x1,zmin:H.z0,zmax:H.z1,ymin:deck,ymax:under});
    k.fixture({x:93,y:under-.5,z:SHIP_Z,color:0xe7c48e,intensity:45,distance:10,room:'marlowe-cabin',floor:deck,ceiling:under});
    crate(k,89,deck,SHIP_Z-1.5,1.4);k.solid('wood',96.5,deck+.5,SHIP_Z,3,1,1.6);
    // The bridge deck over the house, wider than it (the wings), railed round.
    k.slab('deck',(B.x0+B.x1)/2,bridge,(B.z0+B.z1)/2,B.x1-B.x0,B.z1-B.z0,.6);
    railing(k,B.x0,B.z0,B.x1,B.z0,bridge);railing(k,B.x0,B.z1,B.x1,B.z1,bridge);railing(k,B.x0,B.z0,B.x0,B.z1,bridge);
    railing(k,B.x1,B.z0,B.x1,SHIP_Z-1.6,bridge);railing(k,B.x1,SHIP_Z+1.6,B.x1,B.z1,bridge);
    // Deck to bridge deck, and bridge deck to the wheelhouse roof.
    const lower={x:B.x1+LOWER_RUN,y:deck,z:SHIP_Z},upper={x:UPPER_FOOT,y:bridge,z:SHIP_Z},upperRun=W.x0-UPPER_FOOT;
    k.stair('steel',lower,Math.PI,bridge-deck,LOWER_RUN,3);
    for(const o of [-1.6,1.6])stairRailing(k,lower,Math.PI,bridge-deck,LOWER_RUN,o);
    k.stair('steel',upper,0,roof-bridge,upperRun,3);
    for(const o of [-1.6,1.6])stairRailing(k,upper,0,roof-bridge,upperRun,o);
    // The wheelhouse: a waist of steel, an open band of windows, a header and the roof.
    const band0=bridge+1.7,band1=bridge+3.2,head=roof-.5;
    const walls:Array<[number,number,number,number]>=[[W.x0,W.z0,W.x1,W.z0],[W.x0,W.z1,W.x1,W.z1],[W.x0,W.z0,W.x0,W.z1]];
    for(const [x0,z0,x1,z1] of walls){k.wall(paint,x0,z0,x1,z1,bridge,band0,.3);k.wall(paint,x0,z0,x1,z1,band1,head,.3);}
    // The front (east) has the door to the wings.
    k.wall(paint,W.x1,W.z0,W.x1,SHIP_Z-1.1,bridge,band0,.3);k.wall(paint,W.x1,SHIP_Z+1.1,W.x1,W.z1,bridge,band0,.3);
    k.wall(paint,W.x1,W.z0,W.x1,W.z1,band1,head,.3);
    for(const z of [W.z0,W.z1])k.solid(paint,W.x1,(band0+band1)/2,z,.3,band1-band0,.3);
    // The roof overhangs the front and sides; the stair lands on its aft edge.
    k.slab('hull',(W.x0+W.x1+.9)/2,roof,SHIP_Z,W.x1-W.x0+.9,W.z1-W.z0+1.2,.6);
    railing(k,W.x0,W.z0-.5,W.x1+.75,W.z0-.5,roof);railing(k,W.x0,W.z1+.5,W.x1+.75,W.z1+.5,roof);
    railing(k,W.x1+.75,W.z0-.5,W.x1+.75,W.z1+.5,roof);
    railing(k,W.x0,W.z0-.5,W.x0,SHIP_Z-1.6,roof);railing(k,W.x0,SHIP_Z+1.6,W.x0,W.z1+.5,roof);
    k.room({id:'marlowe-bridge',xmin:W.x0,xmax:W.x1,zmin:W.z0,zmax:W.z1,ymin:bridge,ymax:head});
    k.fixture({x:98,y:head-.4,z:SHIP_Z,color:0xd9c79c,intensity:30,distance:8,room:'marlowe-bridge',floor:bridge,ceiling:head});
    // The binnacle and the chart table (cover inside the wheelhouse).
    k.solid('machine',101.3,bridge+.6,-185.9,.8,1.2,1.6);
    k.solid('wood',98.6,bridge+.55,W.z0+1,2.4,1.1,1.2);
    // The funnel, black with a red band, on the aft end of the bridge deck.
    k.collide(89,bridge+5,-179.6,3,10,3);
    if(!k.visuals)return;
    k.piece('hull',89,bridge+5,-179.6,3.4,10,3.4,{round:true,castShadow:true});
    k.piece('hullred',89,bridge+8.2,-179.6,3.5,1.4,3.5,{round:true});
    k.piece('iron',89,bridge+10.1,-179.6,3.7,.25,3.7,{round:true});
    k.piece('rubber',89,bridge+10.2,-179.6,2.9,.1,2.9,{round:true});
    // Window mullions, the lit instruments and the wheel.
    for(const [x0,z0,x1,z1] of [...walls,[W.x1,W.z0,W.x1,W.z1] as [number,number,number,number]]){
        const length=Math.hypot(x1-x0,z1-z0);
        for(let u=1.3;u<length;u+=1.3)k.piece('iron',x0+(x1-x0)*u/length,(band0+band1)/2,z0+(z1-z0)*u/length,.1,band1-band0,.1);
    }
    k.piece('green',101.3,bridge+1.25,-185.9,.5,.12,1.2);
    k.piece('wood',100.4,bridge+1.8,-185.9,.1,1.1,1.1,{round:true,rz:Math.PI/2});
    k.piece('paper',98.6,bridge+1.12,W.z0+1,1.8,.03,.9);
    // Portholes along the deckhouse, a few lit.
    for(const [z,sign] of [[H.z0,-1],[H.z1,1]] as const)for(let x=H.x0+2,i=0;x<H.x1-1;x+=2.6,i++){
        if(x>91.6&&x<94.8)continue;
        porthole(k,x,deck+2.6,z+sign*.2,0,(i+(sign>0?1:0))%3===0);
    }
    // Running lights on the wings and a lamp over the house door.
    k.piece('neon',B.x1-.3,bridge+1.4,B.z0+.2,.35,.35,.35);
    k.piece('harbor-glow',B.x1-.3,bridge+1.4,B.z1-.2,.35,.35,.35);
    k.piece('lamp',H.x1+.3,under-.5,SHIP_Z,.3,.25,.5);
    // A signal mast on the wheelhouse roof.
    k.piece('steel',98,roof+2.8,SHIP_Z,.18,5.6,.18,{round:true});
    k.piece('steel',98,roof+4.6,SHIP_Z,.14,.14,3.6);
    k.piece('lamp',98,roof+5.7,SHIP_Z,.3,.3,.3);
    // A lifeboat hung outboard of the port wing.
    k.piece('trim',90,bridge+.9,B.z0-1.3,6,1.1,1.9,{castShadow:true});
    k.piece('rust',90,bridge+1.5,B.z0-1.3,5.4,.2,1.6);
    for(const x of [87.5,92.5]){line(k,{x,y:bridge+3.4,z:B.z0+.2},{x,y:bridge+3.4,z:B.z0-1.3},'iron',.16);line(k,{x,y:bridge+3.4,z:B.z0-1.3},{x,y:bridge+1.5,z:B.z0-1.3},'rope',.05);}
}

function porthole(k:KitBuilder,x:number,y:number,z:number,ry:number,lit:boolean):void {
    k.piece('brass',x,y,z,.78,.08,.78,{round:true,rx:Math.PI/2,ry});
    k.piece(lit?'warm':'glass',x,y,z,.56,.12,.56,{round:true,rx:Math.PI/2,ry});
}

function cargo(k:KitBuilder):void {
    const {deck}=SHIP;
    containerStack(k,126,-186,true,['box-red','box-blue'],{y:deck,length:10,stencil:'MARLOWE LINES'});
    containerStack(k,124,-179.4,true,['box-green'],{y:deck,length:6,open:true});
    crate(k,114,deck,-179.2,1.6);crate(k,114.2,deck,-179.2,1.1,.3);
    crate(k,129.6,deck,-181.4,1.5,.2);
    // The mast forward with its cargo derrick, and the anchor winch.
    k.collide(131.5,deck+9,SHIP_Z,.7,18,.7);
    k.solid('machine',134.2,deck+.7,SHIP_Z,1.8,1.4,2.6);
    for(const [x,z] of [[132,-178.9],[132,-188.1]] as const)
        for(const dz of [-.45,.45]){k.collide(x,deck+.45,z+dz,.5,.9,.5);k.piece('iron',x,deck+.45,z+dz,.5,.9,.5,{round:true});}
    k.fixture({x:131,y:deck+12.5,z:SHIP_Z,color:0xffd9a0,intensity:45,distance:22,angle:1});
}

function gangway(k:KitBuilder):void {
    const from={x:GANGWAY_X,y:0,z:QUAY_EDGE_Z+5.6},run=from.z-(SHIP.south-.25);
    k.stair('steel',from,Math.PI/2,SHIP.deck,run,2.6);
    for(const o of [-1.35,1.35])stairRailing(k,from,Math.PI/2,SHIP.deck,run,o,'steel');
    // Quay bollards the lines are made fast to.
    for(const x of [84,100,124,140])bollard(k,x,QUAY_EDGE_Z+1.2);
}

function dressing(k:KitBuilder):void {
    const {deck,south,north,stern,bow}=SHIP;
    // The mast, yard, lights and stays; the derrick boom over the hold.
    k.piece('steel',131.5,deck+9,SHIP_Z,.7,18,.7,{round:true,castShadow:true});
    k.piece('steel',131.5,deck+14.5,SHIP_Z,.3,.3,7);
    k.piece('lamp',131.5,deck+18.3,SHIP_Z,.45,.45,.45);
    for(const z of [SHIP_Z-3.3,SHIP_Z+3.3])k.piece('lamp',131.5,deck+14.2,z,.25,.3,.25);
    line(k,{x:131.5,y:deck+18,z:SHIP_Z},{x:bow-.3,y:deck+1.7,z:SHIP_Z},'iron',.05);
    line(k,{x:131.5,y:deck+18,z:SHIP_Z},{x:128,y:deck+1.1,z:south-.5},'iron',.05);
    line(k,{x:131.5,y:deck+18,z:SHIP_Z},{x:128,y:deck+1.1,z:north+.5},'iron',.05);
    line(k,{x:131.2,y:deck+2,z:SHIP_Z},{x:120,y:deck+12.5,z:SHIP_Z},'steel',.3);
    line(k,{x:120,y:deck+12.5,z:SHIP_Z},{x:131.5,y:deck+16,z:SHIP_Z},'iron',.05);
    line(k,{x:120,y:deck+12.5,z:SHIP_Z},{x:120,y:deck+9.2,z:SHIP_Z},'iron',.05);
    k.piece('cranedark',120,deck+9,SHIP_Z,.5,.4,.5);
    floodHead(k,131,deck+12.7,SHIP_Z,Math.PI/2);
    // Portholes along the hull, sparsely lit.
    let i=0;
    for(let x=90;x<128;x+=3.4,i++){
        porthole(k,x,1.6,south+.28,0,i%4===1);
        porthole(k,x,1.6,north-.28,0,i%5===3);
    }
    // Anchors in the hawse pipes and the chain down into the water.
    for(const [z,s] of [[south,1],[north,-1]] as const){
        const hx=134.5,hz=z+(SHIP_Z-z)*(hx-BOW_X)/(bow-BOW_X)+s*.35;
        k.piece('iron',hx,3,hz,.9,.9,.3,{round:true,rx:Math.PI/2,ry:s*.64});
        k.piece('iron',hx,1.4,hz+s*.1,.3,2.4,.2,{ry:s*.64});
        k.piece('iron',hx,.3,hz+s*.1,1.4,.3,.3,{ry:s*.64});
    }
    // Names: the stern and both bows.
    k.sign({lines:['THE MARLOWE','BAY CITY'],x:stern-.3,y:2.1,z:SHIP_Z,w:7,h:2.2,ry:-Math.PI/2,bg:'#1b2126',fg:'#d6ccb1'});
    k.sign({lines:['MARLOWE'],x:124,y:2.6,z:south+.3,w:6,h:1.2,ry:0,bg:'#1b2126',fg:'#d6ccb1'});
    k.sign({lines:['MARLOWE'],x:124,y:2.6,z:north-.3,w:6,h:1.2,ry:Math.PI,bg:'#1b2126',fg:'#d6ccb1'});
    // Mooring lines to the quay bollards.
    for(const [a,b] of [[{x:84.6,z:-178.4},{x:84}],[{x:132,z:-178.9},{x:140}],[{x:98,z:-177.2},{x:100}],[{x:126,z:-177.2},{x:124}]] as const)
        line(k,{x:a.x,y:deck+.9,z:a.z},{x:b.x,y:.9,z:QUAY_EDGE_Z+1.2});
}
