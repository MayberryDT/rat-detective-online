import type {SpillSource} from '../prototype/StreetReadability';

export interface WindowPane {u0:number;v0:number;u1:number;v1:number;color:number}
interface WindowRoom {rect:{value:{x:number;y:number;z:number;w:number}};light:{value:number}}
export interface FacadeMass {x:number;y:number;z:number;w:number;h:number;d:number}

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
            const depth=(b.x-s.x)*s.nx+(b.z-s.z)*s.nz,halfDepth=(s.nx?b.w:b.d)/2;
            if(depth+halfDepth<-.01||depth-halfDepth>.6)continue;
            const across=(b.x-s.x)*s.nz-(b.z-s.z)*s.nx,half=(s.nx?b.d:b.w)/2;
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
