import {DISPATCH_STATIONS,LAUNCH_MACHINES} from './chaosState';
import type {GrayboxBox} from './grayboxLayout';
export type DebrisKind='dumpster'|'bin'|'crate';
/** Curbside stock uses the existing building walls; keep all routes and entrances open. */
export function streetDebris(existing:readonly GrayboxBox[],opening:(x:number,z:number)=>boolean):GrayboxBox[]{
    const result:GrayboxBox[]=[];
    const buildings=existing.filter(b=>b.building&&b.y-b.h/2<.1&&b.w>10&&b.d>10);
    const overlaps=(a:GrayboxBox,b:GrayboxBox)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+.15&&Math.abs(a.z-b.z)<(a.d+b.d)/2+.15&&a.y+a.h/2>b.y-b.h/2+.05&&a.y-a.h/2<b.y+b.h/2-.05;
    buildings.forEach((building,i)=>{
        for(const side of [-1,1]){
            const kind:DebrisKind=i%4===0?'dumpster':i%3===0?'crate':'bin';
            const w=kind==='dumpster'?2.8:1.15,h=kind==='dumpster'?1.65:1.25,d=kind==='dumpster'?1.5:1.15;
            const box:GrayboxBox={x:building.x+side*(building.w*.29),z:building.z+side*(building.d/2+1.25),y:h/2,w,h,d,color:0x303d33,rx:0,rz:0,hidden:true,debris:kind};
            if(LAUNCH_MACHINES.some(m=>Math.hypot(box.x-m.pad.x,box.z-m.pad.z)<m.pad.radius+2||Math.hypot(box.x-m.box.x,box.z-m.box.z)<3)||DISPATCH_STATIONS.some(s=>Math.hypot(box.x-s.box.x,box.z-s.box.z)<3)||opening(box.x,box.z)||existing.some(b=>overlaps(box,b))||result.some(b=>overlaps(box,b)))continue;
            result.push(box);
        }
    });
    return result;
}
