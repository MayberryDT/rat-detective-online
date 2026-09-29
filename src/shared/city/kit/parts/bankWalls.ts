import type { Finish, KitBuilder } from '../kit';
import { fromBoxLocal } from '../../../boxFrame';

/**
 * One angled signature wall on each landmark's ground floor: a surface worth learning
 * to bank off, and cover. Each stands on a hall's fight line, yawed 35–43°, clear of
 * the doors, stairs, well rails, supplies, case spawns and Jurisdiction posts (the
 * nav test walks every door to every floor with them in place).
 *
 * Local frame per wall: u runs along the wall, y is height above the floor, n is
 * across it (+n is the face the sign is on).
 */
export interface BankWall { id:string; landmark:string; x:number; z:number; ry:number; length:number; height:number; thickness:number }

export const BANK_WALLS:readonly BankWall[]=[
    // Records' reading hall, under the atrium: a free-standing archive stack between the lobby and the north door.
    {id:'records-archive-stack',landmark:'records',x:-19,z:-60,ry:.65,length:9,height:3.6,thickness:1.3},
    // Icebox, inside the south door: the loading-bay wall, clear of the stair foot and the east cross passage (z −48).
    {id:'icebox-loading-bay',landmark:'icebox',x:126,z:-40.5,ry:-.7,length:10,height:3,thickness:1},
    // Needleworks, between the east door and the factory-floor zone: pattern screens over a cutting table.
    {id:'needleworks-pattern-screens',landmark:'needleworks',x:-86,z:88,ry:.62,length:9,height:3.2,thickness:.5},
    // Pumping Station, across the north-east corner: a slanted rack of mains between the east and north doors.
    {id:'pump-pipe-wall',landmark:'pump',x:142,z:106,ry:-.75,length:9,height:3.2,thickness:1.2},
];

type Frame=(u:number,y:number,n:number)=>{x:number;y:number;z:number};
const frameOf=(w:BankWall):Frame=>(u,y,n)=>fromBoxLocal({x:w.x,y:0,z:w.z,w:0,h:0,d:0,rx:0,ry:w.ry,rz:0},u,y,n);

export function bankWalls(k:KitBuilder):void {
    for(const w of BANK_WALLS){
        k.collide(w.x,w.height/2,w.z,w.length,w.height,w.thickness,{ry:w.ry});
        if(!k.visuals)continue;
        const at=frameOf(w);
        // A piece in the wall's frame; `spin` turns round pieces to lie along the wall.
        const put:Put=(finish,u,y,n,pw,ph,pd,opts={})=>{
            const p=at(u,y,n);
            k.piece(finish,p.x,p.y,p.z,pw,ph,pd,{ry:w.ry,...(opts.round?{round:true as const}:{}),...(opts.spin?{rz:Math.PI/2}:{}),...(opts.face?{rx:Math.PI/2}:{}),...(opts.shadow?{castShadow:true as const}:{})});
        };
        const sign=(lines:string[],u:number,y:number,sw:number,sh:number,bg:string,fg:string)=>{
            const p=at(u,y,w.thickness/2+.04);k.sign({lines,x:p.x,y:p.y,z:p.z,w:sw,h:sh,ry:w.ry,bg,fg});
        };
        if(w.landmark==='records')archiveStack(w,put,sign);
        else if(w.landmark==='icebox')loadingBay(w,put,sign);
        else if(w.landmark==='needleworks')patternScreens(k,w,at,put,sign);
        else pipeWall(w,put,sign);
    }
}

/** `spin` lays a round piece along the wall, `face` turns it to face across it (wheels, dials). */
type Put=(finish:Finish,u:number,y:number,n:number,w:number,h:number,d:number,opts?:{round?:true;spin?:true;face?:true;shadow?:true})=>void;
type Sign=(lines:string[],u:number,y:number,w:number,h:number,bg:string,fg:string)=>void;

/** A double-faced oak stack of file drawers: brass rails, paper labels, a rolling ladder and a stone plinth. */
function archiveStack(w:BankWall,put:Put,sign:Sign):void {
    const {length:L,height:H,thickness:T}=w;
    put('stone',0,.15,0,L+.2,.3,T+.2,{shadow:true});
    put('wood',0,H/2+.1,0,L,H-.2,T,{shadow:true});
    put('trim',0,H-.05,0,L+.3,.18,T+.3);
    for(const end of [-1,1])put('wood',end*(L/2-.1),H/2,0,.3,H,T+.16);
    for(const face of [-1,1]){
        const n=face*(T/2+.03);
        for(let y=.75,row=0;y<H-.4;y+=.62,row++){
            put('brass',0,y-.2,n,L-.5,.035,.05);
            for(let u=-L/2+.55,i=0;u<L/2-.4;u+=.58,i++){
                // A few drawers stand half open: the archive is in use.
                const open=(i*7+row*3)%11===0;
                put((i+row)%4===0?'linen':'paper',u,y,n+(open?face*.18:0),.44,.46,.05+(open?.36:0));
                put('iron',u,y+.12,n+face*(open?.4:.03),.14,.06,.03);
            }
        }
    }
    // The rolling ladder leans on the sign face, hooked to a brass rail.
    put('brass',0,H-.35,T/2+.12,L-.6,.05,.05);
    for(const du of [-.3,.3])put('wood',1.6+du,H/2-.2,T/2+.45,.07,H-.2,.07);
    for(let y=.5;y<H-.5;y+=.45)put('wood',1.6,y,T/2+.45,.6,.05,.07);
    sign(['RECORDS · A–K','PLEASE RETURN FILES'],-1.9,H-.55,2.6,.5,'#2b2420','#d8c39a');
    // A green banker's lamp left burning on top of the stack.
    put('brass',-3,H+.22,0,.3,.04,.3,{round:true});
    put('brass',-3,H+.42,0,.06,.4,.06);
    put('green',-3,H+.66,0,.26,.8,.26,{round:true,spin:true});
}

/** A poured loading-dock wall: steel cap and edge, rubber bumpers, hazard chevrons, a dock plate and a painted bay number. */
function loadingBay(w:BankWall,put:Put,sign:Sign):void {
    const {length:L,height:H,thickness:T}=w;
    put('curb',0,H/2,0,L,H,T,{shadow:true});
    put('steel',0,H+.06,0,L+.1,.12,T+.1);
    for(const face of [-1,1]){
        const n=face*(T/2);
        put('steel',0,1.3,n+face*.03,L,.1,.06);
        for(const u of [-3.4,-1.2,1.2,3.4]){
            put('rubber',u,.95,n+face*.14,.7,.9,.28);
            put('iron',u,.95,n+face*.3,.5,.08,.05);
        }
        // Hazard stripes along the top: white and black dock paint.
        for(let u=-L/2+.25,i=0;u<L/2;u+=.5,i++)put(i%2?'iron':'linen',u,H-.3,n+face*.02,.5,.36,.02);
    }
    for(const end of [-1,1])put('steel',end*(L/2+.02),H/2,0,.08,H,T+.06);
    put('steel',0,.03,T/2+1.1,3.2,.06,1.9);
    sign(['BAY 3','NO RIDERS ON THE CARTS'],0,2.05,2.8,.62,'#1d2a33','#d9e4ea');
    // A caged dock lamp over the bay number, and the painted edge of the bay on the floor.
    put('iron',0,2.72,T/2+.2,.56,.06,.4);
    put('lamp',0,2.56,T/2+.22,.3,.26,.26,{round:true});
    for(const du of [-.16,0,.16])put('iron',du,2.56,T/2+.37,.03,.3,.03);
    put('crane',0,.012,T/2+3.3,L,.02,.18);
}

/** Pattern screens: a timber frame hung with paper patterns and linen toiles, over a cutting table with shears and a bolt of cloth. */
function patternScreens(k:KitBuilder,w:BankWall,at:Frame,put:Put,sign:Sign):void {
    const {length:L,height:H,thickness:T}=w;
    // The cutting table on the sign side is cover too (rats can hop onto it).
    const tableN=T/2+1,table=at(0,.55,tableN);
    k.collide(table.x,table.y,table.z,L-1,1.1,2,{ry:w.ry});
    put('wood',0,1.05,tableN,L-1,.1,2.1,{shadow:true});
    for(const du of [-(L-1)/2+.3,0,(L-1)/2-.3])for(const dn of [-.8,.8])put('iron',du,.5,tableN+dn,.12,1,.12);
    put('linen',-1.5,1.13,tableN,3.2,.05,1.6);
    put('cloth',1.8,1.3,tableN-.3,1.8,.34,.34,{round:true,spin:true});
    put('steel',.4,1.13,tableN+.4,.9,.03,.12);
    put('brass',2.9,1.13,tableN+.5,.5,.03,.5,{round:true});
    // The screen: posts, rails and hung sheets both sides.
    for(let u=-L/2;u<=L/2+.01;u+=L/4)put('wood',u,H/2,0,.2,H,T,{shadow:true});
    for(const y of [.25,H-.1])put('wood',0,y,0,L,.14,T);
    put('cloth',0,H/2,0,L-.1,H-.4,.06,{shadow:true});
    const sheets:readonly Finish[]=['paper','linen','paper','box-red','linen','paper','linen','paper'];
    for(const face of [-1,1])for(let i=0;i<8;i++){
        const u=-L/2+L*(i+.5)/8,drop=1.2+((i*5)%3)*.35;
        put(sheets[(i+(face>0?0:3))%sheets.length]!,u,H-.25-drop/2,face*(T/2+.03),L/8-.18,drop,.02);
        put('brass',u,H-.28,face*(T/2+.05),.06,.06,.03,{round:true});
    }
    sign(['CUTTING ROOM','MIND THE SHEARS'],0,H+.42,2.6,.5,'#2a2128','#c9ad86');
    // Two work lamps hang over the table from booms off the screen's top rail.
    for(const u of [-2.2,2.2]){
        put('iron',u,H-.05,.75,.08,.08,1.5);
        put('iron',u,H-.45,1.45,.03,.8,.03);
        put('iron',u,H-.9,1.45,.62,.16,.62,{round:true});
        put('lamp',u,H-1.02,1.45,.32,.1,.32,{round:true});
    }
    for(const du of [-1.1,1.1])put('iron',du,H+.12,T/2+.04,.03,.3,.03);
}

/** A slanted rack of water mains: four patina pipes on iron stanchions, flanged joints, valve wheels and a lit pressure gauge. */
function pipeWall(w:BankWall,put:Put,sign:Sign):void {
    const {length:L,height:H,thickness:T}=w;
    put('iron',0,.12,0,L+.4,.24,T+.3,{shadow:true});
    for(let u=-L/2+.2;u<=L/2;u+=(L-.4)/3)put('iron',u,H/2,0,.22,H,T+.1,{shadow:true});
    put('steel',0,H/2,0,L,H-.3,.12);
    const mains:readonly {y:number;n:number;r:number;finish:Finish}[]=[
        {y:.7,n:.28,r:.7,finish:'patina'},{y:1.45,n:-.28,r:.62,finish:'machine'},{y:2.15,n:.28,r:.55,finish:'patina'},{y:2.8,n:-.25,r:.45,finish:'rust'},
    ];
    for(const m of mains){
        put(m.finish,0,m.y,m.n,m.r,L+.3,m.r,{round:true,spin:true,shadow:true});
        for(const u of [-L/4,L/4])put('brass',u,m.y,m.n,m.r+.14,.16,m.r+.14,{round:true,spin:true});
    }
    for(const [u,y,n] of [[-2.6,.7,.72],[1.4,2.15,.66],[3.2,1.45,-.7]] as const){
        put('iron',u,y,n,.08,.1,.08);
        put('brass',u,y,n+Math.sign(n)*.1,.5,.04,.5,{round:true,face:true});
    }
    // The gauge sits on the backing plate between the lower mains.
    put('iron',-.6,1.45,.08,.46,.03,.46,{round:true,face:true});
    put('cream',-.6,1.45,.1,.36,.03,.36,{round:true,face:true});
    sign(['MAIN 4 · HIGH PRESSURE','DO NOT CLIMB'],1.2,H+.42,3.2,.5,'#1c2622','#cfe0c8');
    put('green',.3,1.45,.1,.14,.03,.14,{round:true,face:true});
    put('lamp',-3.4,H+.28,0,.28,.28,.28,{round:true});
    for(const du of [-.14,.14])put('iron',-3.4+du,H+.28,0,.03,.36,.36);
    for(const du of [-.2,2.6])put('iron',du,H+.12,T/2+.04,.03,.3,.03);
}
