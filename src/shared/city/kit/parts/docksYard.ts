import type { Finish, KitBuilder } from '../kit';
import { containerStack, crate, floodHead, type ContainerOptions } from './docksKit';

/**
 * The container yard (x -35…40, z -146…-110): stacks one to three high in four rows,
 * lanes between them, a few cross stacks closing lanes into a maze, open containers to
 * hide in, and one-high stacks and crates as steps up to the tall ones. Rats jump about
 * five units, so every stack is one container (4) above a neighbour or the ground.
 */
type Stack = [x:number, z:number, alongX:boolean, levels:Finish[], opts?:ContainerOptions];
const R:Finish='box-red',B:Finish='box-blue',G:Finish='box-green',O:Finish='box-ochre',S:Finish='box-grey';
export const YARD_STACKS:readonly Stack[] = [
    // North row, against the quay.
    [-28,-142,true,[R,B,S],{stencil:'PACIFIC & ORIENT'}], [-14,-142,true,[G,O]], [4,-142,true,[S]],
    [18,-142,true,[B,R]], [33,-142,true,[O],{stencil:'FRAGILE',open:true}],
    // Second row: a narrow alley behind the first.
    [-28,-135,true,[G]], [-14,-135,true,[R]], [4,-135,true,[B,S,G]], [18,-135,true,[S]], [33,-135,true,[R,B]],
    // South rows past the main lane.
    [-28,-121,true,[B]], [-14,-121,true,[S,R],{stencil:'BAY CITY FREIGHT'}], [4,-121,true,[O]],
    [18,-121,true,[R,G,B]], [33,-121,true,[S],{open:true}],
    [-28,-114,true,[O,G]], [-14,-114,true,[B]], [4,-114,true,[R]], [18,-114,true,[S]],
    // Cross stacks that close lanes and make the maze.
    [-5,-139.5,false,[O],{length:6}], [25.5,-128,false,[G,G],{length:6}], [-21,-128,false,[S],{length:6}],
    [11,-128,false,[B],{length:6,open:true}],
];

export function containerYard(k:KitBuilder):void {
    for(const [x,z,alongX,levels,opts] of YARD_STACKS)containerStack(k,x,z,alongX,levels,opts);
    // Crates as steps up the stacks, pallets and a forklift in the lanes.
    for(const [x,z,s,r] of [[-36.6,-138.5,1.8,0],[-35.9,-136.5,1.2,.3],[25.2,-134,2,.1],[-6.6,-118,1.6,.4],[-5.5,-116.4,1.1,0],
        [39.8,-125.5,1.8,.2],[39.7,-127.6,1.3,.5],[11.4,-117.7,1.6,0]] as const)crate(k,x,0,z,s,r);
    crate(k,25.3,2,-134,1.4,.4);
    forklift(k,-2,-127.8,Math.PI/2);
    for(const [x,z] of [[30,-129],[31.4,-126.6],[-33,-128]] as const)pallet(k,x,z);
    // Floodlight masts down the main lane: hard pools between the stacks, black lanes behind them.
    for(const [x,z,heads] of [[-9,-126,2],[-27,-125.5,1],[36.5,-129.5,1]] as const){
        k.solid('iron',x,7,z,.5,14,.5);
        if(k.visuals){k.piece('iron',x,.3,z,1.2,.6,1.2);k.piece('iron',x,14.1,z,heads*1.6,.2,.3);}
        for(const dx of heads===2?[-1.2,1.2]:[0]){
            k.fixture({x:x+dx,y:13.6,z,color:0xe8dcc0,intensity:55,distance:30,angle:1});
            floodHead(k,x+dx,13.8,z);
        }
    }
    yardOffice(k,36,-113.5);
}

/** The yard office: a timber booth with the one warm window among the stacks (cover, and a landmark to steer by). */
function yardOffice(k:KitBuilder,x:number,z:number):void {
    k.solid('timber',x,1.6,z,5,3.2,3.4);
    k.slab('slate',x,3.5,z,5.8,4.2,.3);
    k.sign({lines:['YARD OFFICE'],x,y:2.9,z:z-1.76,w:2.8,h:.45,ry:Math.PI,bg:'#1c1a17',fg:'#d9c08a',glow:true});
    if(!k.visuals)return;
    for(const dx of [-1.3,1.3]){
        k.piece('iron',x+dx,1.75,z-1.72,1.75,1.15,.06);
        k.piece(dx<0?'warm':'cream',x+dx,1.75,z-1.76,1.5,.9,.04,{flicker:true});
        k.piece('iron',x+dx,1.75,z-1.79,.07,.9,.04);
    }
    k.piece('iron',x+2.52,1.2,z,.06,2.4,1.2);
    k.piece('lamp',x+2.62,2.7,z,.18,.22,.4);
}

function forklift(k:KitBuilder,x:number,z:number,ry:number):void {
    k.solid('box-ochre',x,.85,z,2.6,1.3,1.5,{ry});
    if(!k.visuals)return;
    const fx=Math.cos(ry),fz=-Math.sin(ry);
    k.piece('iron',x+fx*1.4,1.8,z+fz*1.4,.2,3.2,1.2,{ry});
    k.piece('iron',x+fx*2.2,.15,z+fz*2.2,1.6,.1,1,{ry});
    k.piece('iron',x-fx*.2,2.4,z-fz*.2,1.6,.1,1.4,{ry});
    for(const [a,b] of [[.9,.6],[-.9,.6],[.9,-.6],[-.9,-.6]] as const)
        k.piece('rubber',x+fx*a-fz*b,.4,z+fz*a+fx*b,.8,.3,.8,{round:true,rx:Math.PI/2,ry});
}

function pallet(k:KitBuilder,x:number,z:number):void {
    k.collide(x,.2,z,2,.4,1.6);
    if(!k.visuals)return;
    for(const dz of [-.6,0,.6])k.piece('timber',x,.07,z+dz,2,.14,.25);
    for(const dx of [-.8,-.4,0,.4,.8])k.piece('wood',x+dx,.3,z,.3,.12,1.6);
}
