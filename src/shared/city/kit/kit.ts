import type { GrayboxBox } from '../../grayboxLayout';
import { boxQuaternion, fromBoxLocal } from '../../boxFrame';

/**
 * The city kit: parts are plain functions that write into a KitBuilder. One call
 * produces a part's colliders (shared by server, bots and client physics) and,
 * when asked, its look as instanced primitives, lights, signs and job slots.
 * Nothing here imports three.js or cannon, so the Worker builds the same city.
 */

/** Material families. Glowing finishes are emissive (windows, lamps, neon). */
export const FINISH_COLORS = {
    // The original landmark palette.
    stone:0x302c35, steel:0x24323c, brick:0x352630, patina:0x283832, trim:0x55505a, iron:0x141820, brass:0x8b7050,
    glass:0x172128, warm:0xe1b878, cream:0xbab9a3, cyan:0x6697aa, rose:0xc69b87, green:0x87ab98, wood:0x57433b,
    paper:0x9b947d, tile:0x585357, machine:0x415750, cloth:0x252331, linen:0xa59572,
    // Streets, docks and the precinct.
    asphalt:0x1d1c22, concrete:0x2c2b31, curb:0x3b3940, timber:0x3b3029, pile:0x221c19, rope:0x6d5c44, rust:0x4d2d24,
    hull:0x1b2126, hullred:0x4a1d1b, deck:0x3a3a35, crane:0x6b5a24, cranedark:0x3a331c,
    'box-red':0x5a2421, 'box-blue':0x1f3950, 'box-green':0x25402f, 'box-ochre':0x6a5122, 'box-grey':0x3c3f45,
    precinct:0x2d1f24, cell:0x26252b, slate:0x23262d, rubber:0x121214,
    // Glowing.
    lamp:0xffd9a0, neon:0xff4a3d, 'police-glow':0x7fa8ff, 'harbor-glow':0x9fd6c9, beacon:0xfff0c8,
} as const;
export type Finish = keyof typeof FINISH_COLORS;
export const GLOWING_FINISHES: ReadonlySet<Finish> = new Set<Finish>(['warm','cream','cyan','rose','green','lamp','neon','police-glow','harbor-glow','beacon']);

export interface KitPiece { finish:Finish; shape:'box'|'round'; x:number; y:number; z:number; w:number; h:number; d:number; rx:number; ry:number; rz:number;
    /** A lit window pane that may switch off now and then (occupancy). */
    flicker?:true; castShadow?:true }
/** Baked light sources: they light static scenery in the fixed-lighting bake and can be picked by the four actor spots.
 * An outdoor fixture below y 20 also pools on the street-spill atlas, unless `pool` is false (it hangs inside the part's own shell). */
export interface KitFixture { x:number; y:number; z:number; color:number; intensity:number; distance:number; angle?:number; room?:string; floor?:number; ceiling?:number; pool?:false }
/** Light spilling from a lit doorway, window or sign onto the ground outside it (the street-spill
 * atlas, its beam and an actor-spot candidate). `nx,nz` point outward; the part draws the opening. */
export interface KitSpill { x:number; y:number; z:number; nx:number; nz:number; kind:'window'|'door'|'sign'; color:number; reach:number; width?:number }
export interface KitSign { lines:string[]; x:number; y:number; z:number; w:number; h:number; ry:number; bg:string; fg:string; glow?:true }
/** A rectangular room for interior lighting (actor spots stay inside their room). */
export interface KitRoom { id:string; xmin:number; xmax:number; zmin:number; zmax:number; ymin:number; ymax:number }
/** Harbour water: anything alive that sinks below `y` inside the rectangle drowns. */
export interface KitWater { xmin:number; xmax:number; zmin:number; zmax:number; y:number }
export interface KitSlot { x:number; y:number; z:number }

export interface BuildOptions { visuals:boolean }

export class KitBuilder {
    readonly boxes:GrayboxBox[]=[];
    readonly pieces:KitPiece[]=[];
    readonly fixtures:KitFixture[]=[];
    readonly spills:KitSpill[]=[];
    readonly signs:KitSign[]=[];
    readonly rooms:KitRoom[]=[];
    readonly water:KitWater[]=[];
    /** Street lamp sites [x,z] (9-unit poles), added to the city's lamp list. */
    readonly lamps:Array<[number,number]>=[];
    constructor(readonly options:BuildOptions={visuals:true}){}
    get visuals():boolean {return this.options.visuals;}

    /** Collider only (the look comes from pieces or another renderer). */
    collide(x:number,y:number,z:number,w:number,h:number,d:number,opts:{ry?:number;rx?:number;rz?:number;passBalls?:true;slick?:true;color?:number}={}):GrayboxBox {
        const box:GrayboxBox={x,y,z,w,h,d,color:opts.color??0x28222f,rx:opts.rx??0,rz:opts.rz??0,hidden:true,
            ...(opts.ry?{ry:opts.ry}:{}),...(opts.passBalls?{passBalls:true}:{}),...(opts.slick?{slick:true}:{})};
        this.boxes.push(box);return box;
    }
    /** Visual only. */
    piece(finish:Finish,x:number,y:number,z:number,w:number,h:number,d:number,opts:{ry?:number;rx?:number;rz?:number;round?:true;flicker?:true;castShadow?:true}={}):void {
        if(!this.visuals)return;
        this.pieces.push({finish,shape:opts.round?'round':'box',x,y,z,w,h,d,rx:opts.rx??0,ry:opts.ry??0,rz:opts.rz??0,
            ...(opts.flicker?{flicker:true}:{}),...(opts.castShadow?{castShadow:true}:{})});
    }
    /** A solid: collider plus its look. Large solids cast shadows. */
    solid(finish:Finish,x:number,y:number,z:number,w:number,h:number,d:number,opts:{ry?:number;rx?:number;rz?:number;slick?:true}={}):GrayboxBox {
        const box=this.collide(x,y,z,w,h,d,opts);
        this.piece(finish,x,y,z,w,h,d,{...opts,...(Math.max(w,h,d)>=3?{castShadow:true as const}:{})});
        return box;
    }
    /** A straight wall between two points on the ground plan, from y0 to y1, centred on the line. */
    wall(finish:Finish,x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,thickness:number,opts:{visible?:boolean}={}):GrayboxBox {
        const length=Math.hypot(x1-x0,z1-z0),ry=Math.atan2(-(z1-z0),x1-x0);
        const box=this.collide((x0+x1)/2,(y0+y1)/2,(z0+z1)/2,length,y1-y0,thickness,{ry});
        if(opts.visible!==false)this.piece(finish,box.x,box.y,box.z,length,y1-y0,thickness,{ry,castShadow:true});
        return box;
    }
    /**
     * A ring of wall segments (a curved wall). `gaps` are angle ranges [from,to] in radians
     * (0 = +x, increasing toward -z) left open for doors. Segments are chords of the outer face.
     */
    ring(finish:Finish,cx:number,cz:number,radius:number,segments:number,y0:number,y1:number,thickness:number,gaps:Array<[number,number]>=[]):void {
        const step=Math.PI*2/segments;
        for(let i=0;i<segments;i++){
            const a0=i*step,a1=a0+step,mid=a0+step/2;
            if(gaps.some(([g0,g1])=>angleBetween(mid,g0,g1)))continue;
            const r=radius-thickness/2;
            // Chord endpoints, slightly overlapped so the joints stay sealed.
            const e=.04;
            this.wall(finish,cx+Math.cos(a0-e)*r,cz-Math.sin(a0-e)*r,cx+Math.cos(a1+e)*r,cz-Math.sin(a1+e)*r,y0,y1,thickness);
        }
    }
    /** Cell bars between two points: rats stop, cheese passes. */
    bars(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number):void {
        const length=Math.hypot(x1-x0,z1-z0),ry=Math.atan2(-(z1-z0),x1-x0);
        this.collide((x0+x1)/2,(y0+y1)/2,(z0+z1)/2,length,y1-y0,.3,{ry,passBalls:true});
        if(!this.visuals)return;
        const count=Math.max(2,Math.round(length/.55));
        for(let i=0;i<=count;i++){
            const t=i/count;
            this.piece('iron',x0+(x1-x0)*t,(y0+y1)/2,z0+(z1-z0)*t,.09,y1-y0,.09,{round:true});
        }
        for(const y of [y0+.12,y0+(y1-y0)*.55,y1-.12])this.piece('iron',(x0+x1)/2,y,(z0+z1)/2,length,.1,.14,{ry});
    }
    /** A horizontal slab whose top is at `top`. */
    slab(finish:Finish,x:number,top:number,z:number,w:number,d:number,thickness=.6,opts:{ry?:number}={}):GrayboxBox {
        return this.solid(finish,x,top-thickness/2,z,w,thickness,d,opts);
    }
    /**
     * A straight stair from `from` (feet at the bottom step) along heading `ry`
     * (0 = +x, π/2 = -z), rising `rise` over `run`. Hidden ramp collider plus treads.
     */
    stair(finish:Finish,from:{x:number;y:number;z:number},ry:number,rise:number,run:number,width:number):void {
        const slope=Math.atan(rise/run),length=Math.hypot(run,rise),ramp=.6;
        const dirX=Math.cos(ry),dirZ=-Math.sin(ry);
        const lift=(ramp/2)*Math.cos(slope);
        // Local x runs along the heading, so pitch the ramp about local z (rz).
        const ramp3=this.collide(from.x+dirX*run/2,from.y+rise/2-lift,from.z+dirZ*run/2,length,ramp,width,{ry,rz:slope});
        if(!this.visuals)return;
        const steps=Math.max(4,Math.round(run/.7));
        for(let i=0;i<steps;i++){
            const t=(i+.5)/steps,yTop=from.y+t*rise;
            this.piece(finish,from.x+dirX*run*t,yTop+.02-.07,from.z+dirZ*run*t,run/steps+.16,.14,width-.15,{ry});
        }
        // Side stringers read as a built stair, not a floating ramp.
        for(const side of [-1,1]){
            const p=fromBoxLocal({...ramp3,ry:ramp3.ry??0},0,0,side*(width/2+.08));
            this.piece('iron',p.x,p.y+.15,p.z,length,.5,.12,{ry,rz:slope});
        }
    }
    /**
     * A facade on the outside of a wall line from (x0,z0) to (x1,z1): piers, cornices and
     * window rows every storey. `outward` is +1 when the outside is to the left of the
     * direction of travel (for a counter-clockwise footprint). Visual only.
     */
    facade(x0:number,z0:number,x1:number,z1:number,bottom:number,top:number,skin:FacadeSkin,outward:1|-1=1,doors:Array<[number,number]>=[]):void {
        if(!this.visuals)return;
        const length=Math.hypot(x1-x0,z1-z0);if(length<1)return;
        const ux=(x1-x0)/length,uz=(z1-z0)/length,nx=uz*outward,nz=-ux*outward,ry=Math.atan2(-uz,ux);
        const at=(u:number,off:number)=>({x:x0+ux*u+nx*off,z:z0+uz*u+nz*off});
        const door=(u:number)=>doors.some(([a,b])=>u>=a-.3&&u<=b+.3);
        for(let y=bottom+7.8;y<top-.5;y+=8){const p=at(length/2,.12);this.piece('trim',p.x,y,p.z,length+.2,.28,.16,{ry});}
        {const p=at(length/2,.15);this.piece('trim',p.x,top-.25,p.z,length+.3,.5,.2,{ry});}
        for(let u=1;u<length-.5;u+=skin.pitch){
            const lower=bottom<.5&&door(u)?7:bottom,p=at(u,.12);
            this.piece(skin.body,p.x,(top+lower)/2,p.z,.72,top-lower,.18,{ry});
        }
        let row=0;
        for(let y=bottom+4.5;y<top-1.5;y+=8,row++){
            let col=0;
            for(let u=skin.pitch/2+.5;u<length-1.5;u+=skin.pitch,col++){
                if(y<7&&door(u))continue;
                const lit=(row*7+col*3+Math.round(x0+z0))%7<4;
                const frame=at(u,.11),pane=at(u,.18),mull=at(u,.22),sill=at(u,.17);
                this.piece('iron',frame.x,y,frame.z,skin.windowW+.45,skin.windowH+.45,.09,{ry});
                this.piece(lit?((row+col)%5===0?'cream':skin.light):'glass',pane.x,y,pane.z,skin.windowW,skin.windowH,.04,{ry,...(lit&&(col+row)%3===0?{flicker:true as const}:{})});
                this.piece('iron',mull.x,y,mull.z,.12,skin.windowH,.05,{ry});
                if(skin.windowH>2)this.piece('iron',mull.x,y,mull.z,skin.windowW,.12,.05,{ry});
                if(skin.bars)for(const s of [-.3,0,.3])this.piece('iron',mull.x+ux*s*skin.windowW,y,mull.z+uz*s*skin.windowW,.07,skin.windowH,.07,{round:true});
                this.piece('trim',sill.x,y-skin.windowH/2-.18,sill.z,skin.windowW+.65,.22,.16,{ry});
                // A steady lit window at street level spills onto the pavement in front of it.
                if(lit&&y<7&&(col+row)%3!==0){const out=at(u,.3);this.spill({x:out.x,y,z:out.z,nx,nz,kind:'window',color:FINISH_COLORS[(row+col)%5===0?'cream':skin.light],reach:10,width:skin.windowW});}
            }
        }
    }
    fixture(f:KitFixture):void {this.fixtures.push(f);}
    spill(s:KitSpill):void {this.spills.push(s);}
    sign(s:KitSign):void {if(this.visuals)this.signs.push(s);}
    room(r:KitRoom):void {this.rooms.push(r);}
    lamp(x:number,z:number):void {this.lamps.push([x,z]);}
}

export interface FacadeSkin {body:Finish; light:Finish; pitch:number; windowW:number; windowH:number; bars?:true}

/** True when angle `a` lies in [from,to] (radians, wrapping). */
export function angleBetween(a:number,from:number,to:number):boolean {
    const tau=Math.PI*2,n=(v:number)=>((v%tau)+tau)%tau;
    const x=n(a-from),span=n(to-from);
    return x<=span;
}

/** World quaternion of a piece (for renderers). */
export const pieceQuaternion=(p:KitPiece)=>boxQuaternion(p);
