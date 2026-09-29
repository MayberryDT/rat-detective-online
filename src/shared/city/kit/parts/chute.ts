import type { Finish, KitBuilder } from '../kit';
import { fromBoxLocal } from '../../../boxFrame';

/**
 * Needleworks' fabric chutes: from the factory's floors 8 and 16 out through the north
 * wall and down the alley to the z 28 street. Every surface a rider or a loose case can
 * touch is slick (frictionless), and the controllers hand a rider to gravity, so nothing
 * stays upstairs: the 16 run meets the pavement at the alley mouth, the 8 run halfway
 * down the alley. The slopes (38°) are too steep for the bots' walk graph, so they never
 * plan into a chute and are never trapped in one; a rat knocked in rides out.
 */

/** The north wall's inner face (the landmark shell is 1.2 thick, outer face z 56). */
const WALL_IN=57.2;
export const CHUTE_PITCH=38*Math.PI/180;
/** Across the bed; side walls; clear height above the bed; lid; bed thickness. */
const INNER=2.6,SIDE=.25,HEAD=3.2,LID=.25,BED=.5;
export const CHUTE_OUTER_WIDTH=INNER+2*SIDE;
/** The wall is cut from under the bed (it drops .94 across the wall) to a rat's head room. */
const MOUTH_BELOW=1,MOUTH_ABOVE=3.8;

export interface Chute { floor:8|16; mouthX:number; mouthBottom:number; mouthHeight:number }
const chute=(floor:8|16,mouthX:number):Chute=>({floor,mouthX,mouthBottom:floor-MOUTH_BELOW,mouthHeight:MOUTH_BELOW+MOUTH_ABOVE});
/** The alley between the tenements at x −113…−105 carries both runs; the 16 run clears the ground-floor door (x −109…−101) by a floor. */
export const NEEDLEWORKS_CHUTES:readonly Chute[]=[chute(16,-106.8),chute(8,-111.4)];
/** Where each run meets the pavement (z), for tests and places. */
export const chuteFoot=(c:Chute)=>({x:c.mouthX,y:0,z:WALL_IN-c.floor/Math.tan(CHUTE_PITCH)});

const STRIPES:readonly Finish[]=['linen','cloth'];

export function needleworksChutes(k:KitBuilder):void {
    for(const c of NEEDLEWORKS_CHUTES)run(k,c);
}

function run(k:KitBuilder,c:Chute):void {
    const slope=c.floor/Math.sin(CHUTE_PITCH);
    // The chute's own frame: origin on the bed at the wall's inner face, local x across,
    // local y off the bed, local z up the slope (so a point `s` down the bed is z = −s).
    const frame={x:c.mouthX,y:c.floor,z:WALL_IN,w:0,h:0,d:0,rx:-CHUTE_PITCH,rz:0};
    const at=(u:number,n:number,s:number)=>fromBoxLocal(frame,u,n,-s);
    const slick=(u:number,n:number,s0:number,s1:number,w:number,h:number)=>{
        const p=at(u,n,(s0+s1)/2);k.collide(p.x,p.y,p.z,w,h,s1-s0,{rx:-CHUTE_PITCH,slick:true});
    };
    const look=(finish:Finish,u:number,n:number,s0:number,s1:number,w:number,h:number,shadow=false)=>{
        const p=at(u,n,(s0+s1)/2);k.piece(finish,p.x,p.y,p.z,w,h,s1-s0,{rx:-CHUTE_PITCH,...(shadow?{castShadow:true as const}:{})});
    };
    // Bed (buried a unit past the pavement), side walls and lid. The lid starts inside the
    // wall's lintel and stops short of the foot, so a rider leaves under open canvas.
    const lidEnd=slope-2.5;
    slick(0,-BED/2,0,slope+1,CHUTE_OUTER_WIDTH,BED);
    for(const side of [-1,1])slick(side*(INNER+SIDE)/2,(HEAD-BED)/2,0,slope+.5,SIDE,HEAD+BED);
    slick(0,HEAD+LID/2,-2,lidEnd,CHUTE_OUTER_WIDTH,LID);
    foot(k,c);
    if(!k.visuals)return;

    // Canvas tube: pale linen inside, dark striped duck outside, iron hoops.
    look('linen',0,.02,0,slope+.4,INNER,.06);
    look('iron',0,-BED/2,0,slope+.4,CHUTE_OUTER_WIDTH,BED,true);
    for(const side of [-1,1]){
        look('cloth',side*(INNER+SIDE)/2,(HEAD-BED)/2,0,slope+.5,SIDE,HEAD+BED,true);
        look('linen',side*(INNER/2-.02),.9,0,slope+.4,.04,.12);
    }
    for(let s=-1.6,i=0;s<lidEnd;s+=1.1,i++)look(STRIPES[i%2]!,0,HEAD+LID/2,s,Math.min(lidEnd,s+1.1),CHUTE_OUTER_WIDTH+.02,LID+.02,i===0);
    for(let s=1.2;s<slope;s+=2.4){
        for(const side of [-1,1])look('iron',side*(CHUTE_OUTER_WIDTH/2+.05),(HEAD-BED)/2+.05,s,s+.16,.1,HEAD+BED+.5);
        if(s<lidEnd)look('iron',0,HEAD+LID+.05,s,s+.16,CHUTE_OUTER_WIDTH+.3,.1);
        look('iron',0,-BED-.05,s,s+.16,CHUTE_OUTER_WIDTH+.3,.1);
    }
    // Wall brackets tie the tube to the tenement beside it, from where the alley begins (z 50).
    const wallSide=c.mouthX>-109?1:-1;
    for(let s=(WALL_IN-50)/Math.cos(CHUTE_PITCH)+.5;s<slope-2;s+=4.8){
        const p=at(wallSide*(CHUTE_OUTER_WIDTH/2+.35),HEAD*.5,s);
        k.piece('iron',p.x,p.y,p.z,.7,.18,.18);
        k.piece('iron',p.x,p.y-.9,p.z,.18,1.8,.18);
    }
    hatch(k,c);
}

/** The hatch inside the factory: an iron frame, a propped steel flap, a canvas skirt, hazard paint and a stencil. */
function hatch(k:KitBuilder,c:Chute):void {
    const y=c.floor,x=c.mouthX,half=CHUTE_OUTER_WIDTH/2,face=WALL_IN+.06;
    for(const side of [-1,1])k.piece('iron',x+side*(half+.12),y+MOUTH_ABOVE/2,face,.24,MOUTH_ABOVE,.12);
    k.piece('iron',x,y+MOUTH_ABOVE+.12,face,CHUTE_OUTER_WIDTH+.48,.24,.12);
    k.piece('steel',x,y+MOUTH_ABOVE+.75,face+.55,CHUTE_OUTER_WIDTH+.2,.08,1.3,{rx:-1.05});
    // The skirt hangs inside the mouth; riders brush through the strips.
    for(let i=0;i<6;i++){
        const u=-INNER/2+INNER*(i+.5)/6;
        k.piece(STRIPES[i%2]!,x+u,y+MOUTH_ABOVE-.45,WALL_IN-.3,INNER/6-.04,.9,.03);
    }
    for(let i=0;i<5;i++)k.piece(i%2?'iron':'brass',x-half+CHUTE_OUTER_WIDTH*(i+.5)/5,y+.015,face+.8,CHUTE_OUTER_WIDTH/5-.02,.03,1.4,{ry:.5});
    // Caged lamps on the frame posts light the mouth; the sign rides above the propped flap.
    for(const side of [-1,1]){
        k.piece('lamp',x+side*(half+.12),y+MOUTH_ABOVE-.35,face+.2,.24,.3,.24,{round:true});
        for(const du of [-.08,.08])k.piece('iron',x+side*(half+.12)+du,y+MOUTH_ABOVE-.35,face+.33,.025,.36,.025);
    }
    k.sign({lines:['GOODS CHUTE',`FLOOR ${c.floor/8+1} · TO STREET`],x,y:y+MOUTH_ABOVE+1.85,z:face+.03,w:3.4,h:.9,ry:0,bg:'#2a2128',fg:'#c9ad86'});
}

/** The street end: a striped canvas hood bracketed off the tenement, a canvas mat and heaped fabric bolts beside the runout. */
function foot(k:KitBuilder,c:Chute):void {
    const x=c.mouthX,z=chuteFoot(c).z,half=CHUTE_OUTER_WIDTH/2;
    // The tenement wall beside the run (the alley is x −113…−105).
    const wall=c.mouthX>-109?1:-1,wallX=wall>0?-105:-113,hx=x-wall*.2,hoodW=CHUTE_OUTER_WIDTH+.4;
    // The hood is a real surface (a launched rat can land on it), above a jumping rat's reach;
    // it sheds rain toward the street.
    k.solid('cloth',hx,7.3,z+.4,hoodW,.14,4.6,{rx:-.18});
    for(let i=0;i<7;i++)k.piece(STRIPES[i%2]!,hx-hoodW/2+hoodW*(i+.5)/7,6.55,z-1.95,hoodW/7-.03,.7,.06);
    for(const dz of [-1.4,2.2]){
        const reach=Math.abs(wallX-hx)+hoodW/2;
        k.piece('iron',wallX-wall*reach/2,7.15+dz*.18,z+.4+dz,reach,.12,.12);
        k.piece('iron',wallX-wall*.55,6.4+dz*.18,z+.4+dz,.12,1.6,.12,{rz:-wall*.6});
    }
    k.piece('linen',x,.02,z-1.6,CHUTE_OUTER_WIDTH+.6,.04,3.4);
    k.fixture({x:hx,y:6.4,z:z-.8,color:0xffc98a,intensity:30,distance:11,angle:1});
    k.piece('lamp',hx,6.95,z-.8,.34,.3,.34,{round:true});
    // Bolts of cloth: low, collidable heaps beside the runout, never in the rider's path.
    const cloths:readonly Finish[]=['hullred','linen','cloth','wood','rust','paper','box-blue'];
    const heap=(bx:number,bz:number)=>{
        k.collide(bx,.45,bz,1.4,.9,2.2);
        for(let i=0;i<7;i++){
            const layer=i<4?0:i<6?1:2,count=layer===0?4:layer===1?2:1,slot=layer===0?i:layer===1?i-4:0;
            k.piece(cloths[(i+Math.round(bz))%cloths.length]!,bx+(layer%2)*.1,.2+layer*.34,bz-.5*(count-1)/2+.5*slot,1.35,.38,.38,{round:true,rz:Math.PI/2});
        }
    };
    // The 16 run ends at the alley mouth: heaps on the pavement either side. The 8 run
    // ends mid-alley: one heap between its runout and the 16 run.
    if(c.floor===16){heap(x+half+.9,z-3.2);heap(x-half-.9,z-3.2);}
    else heap(x+half+.6,z-3);
}
