import type {SpillSource} from '../presentation/StreetReadability';
import {footprintOutline} from '../shared/skyline';
import type {BuildingFootprint} from '../shared/worldSpec';

export interface WindowPane {u0:number;v0:number;u1:number;v1:number;color:number}
interface WindowRoom {rect:{value:{x:number;y:number;z:number;w:number}};light:{value:number}}
export interface FacadeMass {x:number;y:number;z:number;w:number;h:number;d:number}
/** One wall of a footprint outline, from `a` to `b`, facing (nx,nz), textured from u0 to u1 (a cut face runs past 1). */
export interface FacadeWall {a:{x:number;z:number};b:{x:number;z:number};nx:number;nz:number;length:number;u0:number;u1:number}

/** Trim/canopies/door panels can cover part of a textured window. Emit only
 * through its remaining visible rectangles, keeping their occupancy links. */
export function uncoveredWindowApertures(sources:readonly SpillSource[],details:readonly FacadeMass[]):SpillSource[] {
    const cells=new Map<string,FacadeMass[]>();
    return sources.flatMap(s=>{
        const cx=Math.floor(s.x/32),cz=Math.floor(s.z/32),key=`${cx},${cz}`;
        let nearby=cells.get(key);
        if(!nearby){nearby=details.filter(b=>b.x+b.w/2>=cx*32-4&&b.x-b.w/2<=(cx+1)*32+4
            &&b.z+b.d/2>=cz*32-4&&b.z-b.d/2<=(cz+1)*32+4);cells.set(key,nearby);}
        let rectangles=[{left:-(s.width??1)/2,right:(s.width??1)/2,bottom:-(s.height??1)/2,top:(s.height??1)/2}];
        for(const b of nearby){
            // Bounds seen along the aperture's normal (exact for the four axis faces, wider on a cut face).
            const depth=(b.x-s.x)*s.nx+(b.z-s.z)*s.nz,halfDepth=(Math.abs(s.nx)*b.w+Math.abs(s.nz)*b.d)/2;
            if(depth+halfDepth<-.01||depth-halfDepth>.6)continue;
            const across=(b.x-s.x)*s.nz-(b.z-s.z)*s.nx,half=(Math.abs(s.nz)*b.w+Math.abs(s.nx)*b.d)/2;
            const left=across-half-.01,right=across+half+.01,bottom=b.y-b.h/2-s.y-.01,top=b.y+b.h/2-s.y+.01;
            rectangles=rectangles.flatMap(r=>{
                const l=Math.max(left,r.left),rr=Math.min(right,r.right),lo=Math.max(bottom,r.bottom),hi=Math.min(top,r.top);
                if(l>=rr||lo>=hi)return [r];
                return [{...r,top:lo},{...r,bottom:hi},{left:r.left,right:l,bottom:lo,top:hi},{left:rr,right:r.right,bottom:lo,top:hi}]
                    .filter(p=>p.right-p.left>.08&&p.top-p.bottom>.08);
            });
            if(!rectangles.length)break;
        }
        return rectangles.map(r=>({...s,x:s.x+s.nz*(r.left+r.right)/2,z:s.z-s.nx*(r.left+r.right)/2,
            y:s.y+(r.bottom+r.top)/2,width:r.right-r.left,height:r.top-r.bottom,
            powerShare:(s.powerShare??1)*(r.right-r.left)*(r.top-r.bottom)/((s.width??1)*(s.height??1))}));
    });
}

/** Use the same UVs as the building BoxGeometry, including setbacks and the
 * vertically flipped canvas. Split at occupancy boundaries so an unlit room
 * cannot inherit a neighbouring room's beam. */
export function windowApertures(panes:readonly WindowPane[],rooms:readonly WindowRoom[],mass:FacadeMass,buildingHeight:number):SpillSource[] {
    const sources:SpillSource[]=[];
    for(const pane of panes)for(const room of rooms){
        const r=room.rect.value,u0=Math.max(pane.u0,r.x),u1=Math.min(pane.u1,r.z);
        const v0=Math.max(pane.v0,r.y,(mass.y-mass.h/2)/buildingHeight);
        const v1=Math.min(pane.v1,r.w,(mass.y+mass.h/2)/buildingHeight);
        if(u1<=u0||v1<=v0)continue;
        const u=(u0+u1)/2,y=(v0+v1)/2*buildingHeight;
        for(const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]]){
            sources.push({x:nx?mass.x+nx*(mass.w/2+.025):mass.x+nz*(u-.5)*mass.w,
                z:nz?mass.z+nz*(mass.d/2+.025):mass.z-nx*(u-.5)*mass.d,
                y,nx,nz,kind:'window',color:pane.color,reach:Math.min(12,Math.max(5,y/.85)),
                width:(u1-u0)*(nx?mass.d:mass.w),height:(v1-v0)*buildingHeight,
                powerShare:(u1-u0)*(v1-v0)/((pane.u1-pane.u0)*(pane.v1-pane.v0)),
                occupancy:room.light,
            });
        }
    }
    return sources;
}

/** The walls of a footprint's outline with the UVs a BoxGeometry would give them: each side keeps
 * the u it had on the uncut face, and a cut face runs from one side's u on past 1 into the next. */
export function facadeWalls(b:BuildingFootprint):FacadeWall[] {
    const x0=b.cx-b.bw/2,x1=b.cx+b.bw/2,z0=b.cz-b.bd/2,z1=b.cz+b.bd/2,points=footprintOutline(b);
    const u=(p:{x:number;z:number},nx:number,nz:number)=>nz<0?(x1-p.x)/b.bw:nx<0?(p.z-z0)/b.bd:nz>0?(p.x-x0)/b.bw:(z1-p.z)/b.bd;
    // The side a cut's end point lies on (never a corner).
    const side=(p:{x:number;z:number})=>Math.abs(p.z-z0)<1e-6?[0,-1]:Math.abs(p.z-z1)<1e-6?[0,1]:Math.abs(p.x-x0)<1e-6?[-1,0]:[1,0];
    return points.map((a,i)=>{
        const q=points[(i+1)%points.length],dx=q.x-a.x,dz=q.z-a.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
        if(!dx||!dz)return {a,b:q,nx,nz,length,u0:u(a,nx,nz),u1:u(q,nx,nz)};
        const [ax,az]=side(a),[bx,bz]=side(q);
        return {a,b:q,nx,nz,length,u0:u(a,ax,az),u1:u(q,bx,bz)+1};
    });
}

/** `windowApertures` for an outline: every lit pane on the wall its u lands on, cut faces included. */
export function wallApertures(panes:readonly WindowPane[],rooms:readonly WindowRoom[],walls:readonly FacadeWall[],buildingHeight:number):SpillSource[] {
    const sources:SpillSource[]=[];
    for(const pane of panes)for(const room of rooms){
        const r=room.rect.value,u0=Math.max(pane.u0,r.x),u1=Math.min(pane.u1,r.z),v0=Math.max(pane.v0,r.y),v1=Math.min(pane.v1,r.w);
        if(u1<=u0||v1<=v0)continue;
        const y=(v0+v1)/2*buildingHeight;
        for(const w of walls)for(const wrap of [0,1]){
            const lo=Math.max(u0+wrap,w.u0),hi=Math.min(u1+wrap,w.u1);
            if(hi<=lo)continue;
            const t=((lo+hi)/2-w.u0)/(w.u1-w.u0);
            sources.push({x:w.a.x+(w.b.x-w.a.x)*t+w.nx*.025,z:w.a.z+(w.b.z-w.a.z)*t+w.nz*.025,
                y,nx:w.nx,nz:w.nz,kind:'window',color:pane.color,reach:Math.min(12,Math.max(5,y/.85)),
                width:(hi-lo)/(w.u1-w.u0)*w.length,height:(v1-v0)*buildingHeight,
                powerShare:(hi-lo)*(v1-v0)/((pane.u1-pane.u0)*(pane.v1-pane.v0)),
                occupancy:room.light,
            });
        }
    }
    return sources;
}
