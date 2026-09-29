import type { Finish, KitBuilder } from '../kit';

/**
 * Gate Lane: the narrow cut from the Gate's north end to the −102 street, between the
 * tall west tenements (face x −143) and the low east row (face x −131). Wet setts with a
 * gutter, a brick arch at the north mouth, fire escapes, washing and wires overhead, a
 * chain-link fence across the east side alley, and two dumpsters for cover. The lane's
 * lamps come with the street. Nothing here closes the lane: the arch leaves 8 units,
 * the dumpsters stand against the walls and the fence leaves a squeeze gap.
 */
const WEST=-143,EAST=-131,MID=(WEST+EAST)/2;
/** The lane runs z −89…−35; the east–west side alley crosses it at z −69…−61. */
const NORTH=-89,SOUTH=-35,GAP0=-69,GAP1=-61;

export function gateLane(k:KitBuilder):void {
    arch(k);
    dumpster(k,EAST,-80,-1);
    dumpster(k,WEST,-54.5,1);
    fence(k);
    fireEscape(k,WEST,-82,-76,[8,16,24,32],1);
    fireEscape(k,WEST,-59,-53.5,[8,16,24],1);
    fireEscape(k,EAST,-87,-82,[8],-1);
    if(!k.visuals)return;
    setts(k);
    overhead(k);
    k.sign({lines:['PAWN','LOANS · NO QUESTIONS'],x:WEST+1.05,y:11.5,z:-47,w:3.4,h:1.1,ry:Math.PI/2,bg:'#1a0f14',fg:'#ff5a4a',glow:true});
    k.piece('iron',WEST+.9,11.5,-47,.12,1.4,3.7);
    for(const dz of [-1.3,1.3])k.piece('iron',WEST+.45,12.3,-47+dz,.9,.08,.08);
    k.fixture({x:WEST+2,y:11,z:-47,color:0xff5a4a,intensity:14,distance:9});
    k.sign({lines:["MURPHY'S LAUNDRY",'SAME DAY · NO QUESTIONS'],x:EAST-.04,y:12.2,z:-50,w:7,h:1.6,ry:-Math.PI/2,bg:'#3a2d25',fg:'#d8c7a0'});
}

/** Wet setts in a herringbone-ish running bond, a sunken iron gutter and a few puddles. */
function setts(k:KitBuilder):void {
    const finishes:readonly Finish[]=['slate','stone','slate','cell','asphalt','stone'];
    for(let z=NORTH+.35,row=0;z<SOUTH;z+=.74,row++){
        if(z>GAP0+.4&&z<GAP1-.4)continue;
        for(let x=WEST+.55+(row%2)*.55,i=0;x<EAST-.3;x+=1.1,i++){
            if(Math.abs(x-MID)<.5)continue;
            const f=finishes[(i*3+row*5+(i*row)%7)%finishes.length]!;
            k.piece(f,x,.025+((i+row)%3)*.008,z,1.02,.05,.66);
        }
    }
    k.piece('iron',MID,.015,(NORTH+GAP0)/2,.5,.03,GAP0-NORTH);
    k.piece('iron',MID,.015,(GAP1+SOUTH)/2,.5,.03,SOUTH-GAP1);
    for(let z=NORTH+4;z<SOUTH;z+=9){
        if(z>GAP0-1&&z<GAP1+1)continue;
        k.piece('steel',MID,.04,z,.7,.03,.9);
        for(const dz of [-.3,0,.3])k.piece('iron',MID,.055,z+dz,.6,.02,.08);
    }
    // Puddles: dark glass where the setts have sunk.
    for(const [x,z,w,d] of [[-139.5,-84,2.6,1.8],[-134.8,-73,1.8,2.9],[-140.2,-56,2.2,1.4],[-135.5,-44,3,1.9],[-138.6,-38.5,1.6,1.2]] as const)
        k.piece('glass',x,.062,z,w,.01,d,{round:true});
}

/** A brick arch over the lane's north mouth: piers, stepped haunches, a crown with the street name and a lantern. */
function arch(k:KitBuilder):void {
    const z=NORTH+.8,D=1.6,pier=2,spring=6,crown=8.2,top=10.4;
    for(const side of [-1,1]){
        const x=side<0?WEST+pier/2:EAST-pier/2;
        k.solid('brick',x,spring/2,z,pier,spring,D);
        k.piece('stone',x,.4,z,pier+.2,.8,D+.2);
        k.piece('stone',x,spring+.12,z,pier+.25,.24,D+.25);
        // Two stepped haunch blocks each side read as the curve of the arch.
        k.solid('brick',x-side*1.2,spring+.6,z,pier+.4,1.2,D);
        k.solid('brick',x-side*2.1,spring+1.6,z,1.6,1,D);
    }
    k.solid('brick',MID,(crown+top)/2,z,EAST-WEST,top-crown,D);
    for(let x=WEST+.4;x<EAST;x+=.8)k.piece('stone',x,crown-.12,z,.7,.24,D+.06);
    k.piece('stone',MID,crown+.3,z,1,.9,D+.1);
    k.piece('stone',MID,top+.12,z,EAST-WEST+.4,.24,D+.3);
    for(const face of [-1,1])k.sign({lines:['GATE LANE'],x:MID,y:crown+1.15,z:z+face*(D/2+.03),w:5,h:.8,ry:face>0?0:Math.PI,bg:'#1d1a14',fg:'#e3c98f'});
    // The lantern hangs in the arch itself, lighting both faces of the mouth.
    k.piece('iron',MID,crown-.3,z,.06,.6,.06);
    k.piece('iron',MID,crown-.75,z,.44,.12,.44);
    k.piece('lamp',MID,crown-1,z,.3,.4,.3,{round:true});
    k.fixture({x:MID,y:crown-1.3,z,color:0xffc98a,intensity:26,distance:12,angle:1.1});
}

/** A municipal dumpster against a wall (`out` points into the lane): lid ajar, wheels, bags beside it. */
function dumpster(k:KitBuilder,wallX:number,z:number,out:1|-1):void {
    const x=wallX+out*1.05,L=3.6,H=1.7,D=2;
    k.collide(x,H/2,z,D,H,L);
    if(!k.visuals)return;
    k.piece('box-green',x,H/2+.1,z,D,H-.2,L,{castShadow:true});
    k.piece('iron',x,H/2+.1,z,D+.08,.12,L+.08);
    k.piece('iron',x+out*.05,H+.08,z,D+.1,.08,L+.1,{rz:out*.12});
    for(const dz of [-L/2+.3,L/2-.3])for(const dx of [-.6,.6])k.piece('rubber',x+dx,.13,z+dz,.26,.12,.26,{round:true,rz:Math.PI/2});
    k.sign({lines:['CITY SANITATION'],x:x+out*(D/2+.02),y:1.05,z,w:2.4,h:.45,ry:out*Math.PI/2,bg:'#17261c',fg:'#c9c4a4'});
    for(const [dx,dz,s] of [[.3,L/2+.55,.9],[-.35,L/2+.5,.75],[.1,L/2+1.2,.7]] as const)k.piece('rubber',x+out*dx,s*.35,z+dz,s,s*.7,s*.9,{round:true});
}

/** Chain-link across the east side alley at x −124, from the lane's corner to a peeled-back gap by the south wall. */
function fence(k:KitBuilder):void {
    const x=-124,z0=GAP0,z1=GAP1-2.6,H=3.2;
    k.collide(x,H/2,(z0+z1)/2,.2,H,z1-z0);
    if(!k.visuals)return;
    for(let z=z0;z<=z1+.01;z+=(z1-z0)/3)k.piece('iron',x,H/2+.1,z,.1,H+.2,.1,{round:true});
    for(const y of [.1,H])k.piece('iron',x,y,(z0+z1)/2,.07,.07,z1-z0,{round:true,rx:Math.PI/2});
    // The mesh: two sets of diagonal wires.
    const span=z1-z0,step=.42,angle=Math.PI/4;
    for(let s=-H;s<span;s+=step)for(const dir of [-1,1]){
        const a=Math.max(0,s),b=Math.min(span,s+H);if(b-a<.1)continue;
        const zc=z0+(a+b)/2,yc=dir>0?(a-s+b-s)/2:H-(a-s+b-s)/2;
        k.piece('steel',x,yc,zc,.02,.03,(b-a)*Math.SQRT2,{rx:-dir*angle});
    }
    // The torn corner curls back toward the lane; a KEEP OUT plate hangs crooked.
    k.piece('steel',x+.35,1.1,z1+.35,.5,2,.03,{ry:.9});
    k.sign({lines:['KEEP OUT','CITY PROPERTY'],x:x+.08,y:1.8,z:(z0+z1)/2,w:1.6,h:.7,ry:Math.PI/2,bg:'#d9d2bd',fg:'#6a1712'});
}

/**
 * An iron fire escape on a wall (`out` points into the lane): slatted landings on brackets
 * with rails, stairs between them and a drop ladder hung above a jumping rat's reach.
 * Landings are real surfaces (a launched rat can land on them).
 */
function fireEscape(k:KitBuilder,wallX:number,z0:number,z1:number,levels:readonly number[],out:1|-1):void {
    const depth=1.6,x=wallX+out*depth/2,L=z1-z0,zc=(z0+z1)/2,railX=wallX+out*(depth-.05);
    for(const y of levels){
        k.collide(x,y-.08,zc,depth,.16,L);
        k.collide(railX,y+.5,zc,.1,1,L);
    }
    if(!k.visuals)return;
    for(const [i,y] of levels.entries()){
        for(let s=0;s<L;s+=.3)k.piece('iron',x,y-.05,z0+s+.15,depth,.06,.14);
        k.piece('iron',railX,y+1,zc,.08,.08,L,{round:true,rx:Math.PI/2});
        for(let z=z0;z<=z1+.01;z+=L/4)k.piece('iron',railX,y+.5,z,.06,1,.06);
        for(const z of [z0+.3,z1-.3])k.piece('iron',wallX+out*.6,y-.6,z,.1,1.2,.1,{rz:out*.7});
        // A stair from this landing up to the next, alternating direction.
        const next=levels[i+1];if(next===undefined)break;
        const run=L-1.2,rise=next-y,pitch=Math.atan2(rise,run),dir=i%2?-1:1;
        const sx=x+out*.2,from=dir>0?z0+.4:z1-.4;
        k.piece('iron',sx,y+rise/2,from+dir*run/2,.7,.08,Math.hypot(run,rise),{rx:-dir*pitch});
        for(let t=.08;t<1;t+=.1)k.piece('iron',sx,y+rise*t,from+dir*run*t,.7,.04,.24);
    }
    const ladderZ=z1-.6,low=levels[0]!-5.2;
    for(const dx of [-.22,.22])k.piece('iron',x+out*.2+dx,(low+levels[0]!)/2,ladderZ,.05,levels[0]!-low,.05);
    for(let y=low+.3;y<levels[0]!;y+=.45)k.piece('iron',x+out*.2,y,ladderZ,.44,.04,.04);
    // A potted fern and a milk crate on the lowest landing: somebody lives here.
    k.piece('rust',x-out*.2,levels[0]!+.25,z0+.6,.5,.5,.5,{round:true});
    k.piece('green',x-out*.2,levels[0]!+.7,z0+.6,.6,.4,.6,{round:true});
    k.piece('wood',x,levels[0]!+.2,z0+1.6,.5,.4,.5);
}

/** Wires and washing lines strung wall to wall, sagging, with laundry pegged out. */
function overhead(k:KitBuilder):void {
    const span=EAST-WEST;
    const line=(z:number,y:number,sag:number,wash:boolean)=>{
        const tilt=Math.atan2(sag,span/2),half=Math.hypot(span/2,sag);
        for(const side of [-1,1])k.piece('iron',MID+side*span/4,y-sag/2,z,half,.04,.04,{rz:side*tilt});
        if(!wash)return;
        // Shirts, smalls and a sheet or two: mostly dark cloth, a few pale pieces catching the lamps.
        const cloths:readonly Finish[]=['cloth','hullred','linen','box-blue','cloth','rust','paper','slate','box-green','cloth','linen'];
        for(let i=0;i<11;i++){
            const u=-span/2+1.1+i*(span-2.2)/10,drop=sag*(1-Math.abs(u)/(span/2)),kind=(i*7+Math.round(-z))%5;
            const w=kind===0?1.1:kind===1?.3:.55,h=kind===0?1:kind===1?.4:.62;
            const f=cloths[(i+Math.round(-z))%cloths.length]!,cy=y-drop-h/2-.02;
            k.piece(f,MID+u,cy,z,w,h,.03,{rz:(i%3-1)*.06});
            // A shirt has sleeves.
            if(kind>=2)for(const side of [-1,1])k.piece(f,MID+u+side*(w/2+.1),cy+h/2-.16,z,.22,.3,.03,{rz:side*.5});
        }
    };
    line(-86,12.5,.5,false);
    line(-77,10.2,.9,true);
    line(-72.5,13.4,.6,true);
    line(-57,11.8,.8,true);
    line(-44,14.6,.4,false);
    line(-39,10.6,1,true);
    // A power cable dips diagonally across, with a porcelain insulator at each wall.
    const z0=-71,z1=-87,len=Math.hypot(span,z1-z0);
    k.piece('iron',MID,15.4,(z0+z1)/2,.05,.05,len,{ry:Math.atan2(span,z1-z0)});
    for(const [x,z] of [[WEST+.15,z0],[EAST-.15,z1]] as const)k.piece('tile',x,15.45,z,.14,.2,.14,{round:true});
}
