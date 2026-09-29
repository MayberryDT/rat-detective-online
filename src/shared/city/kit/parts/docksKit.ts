import { FINISH_COLORS, type Finish, type KitBuilder } from '../kit';

/** Shared fittings of the docks parts: railings, containers, crates, bollards. */

export const CONTAINER = {length:12, height:4, width:4.4} as const;

/**
 * A railing from (x0,z0) to (x1,z1) on a deck at height y: posts, a top and a mid rail.
 * The collider stops rats, not cheese, so a railed deck is still a firing line.
 */
export function railing(k:KitBuilder,x0:number,z0:number,x1:number,z1:number,y:number,finish:Finish='iron',solid=true):void {
    const length=Math.hypot(x1-x0,z1-z0),ry=Math.atan2(-(z1-z0),x1-x0);
    if(solid)k.collide((x0+x1)/2,y+.6,(z0+z1)/2,length,1.2,.14,{ry,passBalls:true});
    if(!k.visuals)return;
    for(const h of [1.05,.55])k.piece(finish,(x0+x1)/2,y+h,(z0+z1)/2,length,.07,.07,{ry});
    const posts=Math.max(1,Math.round(length/1.8));
    for(let i=0;i<=posts;i++){const t=i/posts;k.piece(finish,x0+(x1-x0)*t,y+.54,z0+(z1-z0)*t,.08,1.08,.08);}
}

/** A railing along a stair's side (`side` +1 left of the heading, -1 right). */
export function stairRailing(k:KitBuilder,from:{x:number;y:number;z:number},ry:number,rise:number,run:number,offset:number,finish:Finish='iron'):void {
    const dirX=Math.cos(ry),dirZ=-Math.sin(ry),px=Math.sin(ry)*offset,pz=Math.cos(ry)*offset;
    const slope=Math.atan(rise/run),length=Math.hypot(run,rise);
    const cx=from.x+px+dirX*run/2,cz=from.z+pz+dirZ*run/2,cy=from.y+rise/2;
    k.collide(cx,cy+.75,cz,length,1.2,.14,{ry,rz:slope,passBalls:true});
    if(!k.visuals)return;
    k.piece(finish,cx,cy+1.08,cz,length,.07,.07,{ry,rz:slope});
    k.piece(finish,cx,cy+.58,cz,length,.07,.07,{ry,rz:slope});
    const posts=Math.max(2,Math.round(run/1.8));
    for(let i=0;i<=posts;i++){const t=i/posts;k.piece(finish,from.x+px+dirX*run*t,from.y+rise*t+.54,from.z+pz+dirZ*run*t,.08,1.08,.08);}
}

/** A wooden crate (a solid, so a step and cover). */
export function crate(k:KitBuilder,x:number,y:number,z:number,s:number,ry=0):void {
    k.solid('wood',x,y+s/2,z,s,s,s,{ry});
    if(!k.visuals)return;
    const dx=Math.cos(ry),dz=-Math.sin(ry);
    // Battens across the faces read as a slatted crate, not a block.
    for(const side of [-1,1]){
        k.piece('timber',x+dx*side*(s/2+.02),y+s/2,z+dz*side*(s/2+.02),.06,s*.96,s*.18,{ry});
        k.piece('timber',x-dz*side*(s/2+.02),y+s/2,z+dx*side*(s/2+.02),s*.18,s*.96,.06,{ry});
    }
    k.piece('timber',x,y+s+.02,z,s*.96,.05,s*.2,{ry});
}

/** An iron mooring bollard (a collider: cover for a crouching rat, a bump for a running one). */
export function bollard(k:KitBuilder,x:number,z:number,y=0):void {
    k.collide(x,y+.5,z,.7,1,.7);
    if(!k.visuals)return;
    k.piece('iron',x,y+.08,z,.95,.16,.95,{round:true});
    k.piece('iron',x,y+.45,z,.55,.8,.55,{round:true});
    k.piece('iron',x,y+.9,z,.82,.16,.82,{round:true});
}

/** A sagging mooring chain between two points at post height. Rats stop, cheese passes. */
export function chain(k:KitBuilder,x0:number,z0:number,x1:number,z1:number,y=.82,sag=.35):void {
    const length=Math.hypot(x1-x0,z1-z0),ry=Math.atan2(-(z1-z0),x1-x0);
    k.collide((x0+x1)/2,y-.2,(z0+z1)/2,length,.5,.14,{ry,passBalls:true});
    if(!k.visuals)return;
    const links=Math.round(length/.32);
    for(let i=0;i<links;i++){
        const t=(i+.5)/links,h=y-sag*4*t*(1-t);
        // Alternate link planes, like a real chain.
        k.piece('iron',x0+(x1-x0)*t,h,z0+(z1-z0)*t,.34,i%2?.05:.14,i%2?.14:.05,{ry});
    }
}

/** A rope (or cable) drawn as a straight line between two points. Visual only. */
export function line(k:KitBuilder,a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},finish:Finish='rope',thick=.09):void {
    if(!k.visuals)return;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,flat=Math.hypot(dx,dz);
    k.piece(finish,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,Math.hypot(flat,dy),thick,thick,{ry:Math.atan2(-dz,dx),rz:Math.atan2(dy,flat)});
}

/** A floodlight head (the look of a baked outdoor fixture). */
export function floodHead(k:KitBuilder,x:number,y:number,z:number,ry=0):void {
    if(!k.visuals)return;
    k.piece('iron',x,y+.18,z,1.1,.36,.8,{ry});
    k.piece('lamp',x,y-.02,z,.9,.06,.6,{ry});
}

export interface ContainerOptions {
    /** Length along its axis (12 = forty-foot, 6 = twenty-foot). */
    length?:number;
    /** A single container whose door end (+axis) stands open: rats can get inside. */
    open?:true;
    /** Stencil on the long face (one per container, sparingly: each is a texture). */
    stencil?:string;
    /** The base height (a container on a ship's deck). */
    y?:number;
}

/**
 * A stack of shipping containers, one finish per level. One collider per stack
 * (an open container is a shell: two sides, the back and the roof).
 */
export function containerStack(k:KitBuilder,x:number,z:number,alongX:boolean,levels:readonly Finish[],opts:ContainerOptions={}):void {
    const L=opts.length??CONTAINER.length,H=CONTAINER.height,W=CONTAINER.width,base=opts.y??0;
    const sx=alongX?L:W,sz=alongX?W:L;
    const open=opts.open&&levels.length===1;
    // Local frame helpers: u runs along the container, v across it.
    const at=(u:number,v:number)=>alongX?{x:x+u,z:z+v}:{x:x+v,z:z+u};
    const size=(du:number,dv:number)=>alongX?{w:du,d:dv}:{w:dv,d:du};
    if(open){
        for(const v of [-1,1]){const p=at(0,v*(W/2-.1)),s=size(L,.2);k.collide(p.x,base+H/2,p.z,s.w,H,s.d);}
        {const p=at(-L/2+.1,0),s=size(.2,W);k.collide(p.x,base+H/2,p.z,s.w,H,s.d);}
        {const s=size(L,W);k.collide(x,base+H-.1,z,s.w,.2,s.d);}
    }else k.collide(x,base+H*levels.length/2,z,sx,H*levels.length,sz);
    if(!k.visuals)return;
    levels.forEach((finish,level)=>{
        const y0=base+level*H,cy=y0+H/2;
        if(open){
            for(const v of [-1,1]){const p=at(0,v*(W/2-.1)),s=size(L-.1,.2);k.piece(finish,p.x,cy,p.z,s.w,H-.1,s.d,{castShadow:true});}
            {const p=at(-L/2+.1,0),s=size(.2,W-.1);k.piece(finish,p.x,cy,p.z,s.w,H-.1,s.d);}
            {const s=size(L-.1,W-.1);k.piece(finish,x,y0+H-.1,z,s.w,.2,s.d,{castShadow:true});}
            {const s=size(L-.3,W-.4);k.piece('timber',x,y0+.08,z,s.w,.16,s.d);}
            // The doors swung back flat against the sides.
            for(const v of [-1,1]){const p=at(L/2+W/4,v*(W/2+.08)),s=size(W/2,.08);k.piece(finish,p.x,cy,p.z,s.w,H-.3,s.d);}
        }else{const s=size(L-.08,W-.08);k.piece(finish,x,cy,z,s.w,H-.06,s.d,{castShadow:true});}
        // Corrugation on the long faces.
        for(let u=-L/2+.7;u<L/2-.5;u+=.8)for(const v of [-1,1]){
            const p=at(u,v*(W/2+.02)),s=size(.3,.08);k.piece(finish,p.x,cy,p.z,s.w,H-.5,s.d);
        }
        // Corner posts and the top and bottom rails, in darker iron.
        for(const u of [-1,1])for(const v of [-1,1]){const p=at(u*(L/2-.12),v*(W/2-.12));k.piece('iron',p.x,cy,p.z,.3,H,.3);}
        for(const h of [y0+.14,y0+H-.14])for(const v of [-1,1]){const p=at(0,v*(W/2)),s=size(L,.22);k.piece('iron',p.x,h,p.z,s.w,.26,s.d);}
        if(!open){
            // Door end: four locking bars and the seam.
            for(const v of [-1.45,-.55,.55,1.45]){const p=at(L/2+.05,v);k.piece('iron',p.x,cy,p.z,.09,H-.5,.09,{round:true});}
            {const p=at(L/2+.04,0),s=size(.06,.08);k.piece('iron',p.x,cy,p.z,s.w,H-.3,s.d);}
        }
    });
    if(opts.stencil){
        const p=at(-L*.12,W/2+.07),face=alongX?0:Math.PI/2;
        const top=levels[levels.length-1]!,bg=`#${FINISH_COLORS[top].toString(16).padStart(6,'0')}`;
        k.sign({lines:[opts.stencil],x:p.x,y:base+H*levels.length-H*.45,z:p.z,w:Math.min(L*.6,6.5),h:1.1,ry:face,bg,fg:'#b9b29e'});
    }
}
