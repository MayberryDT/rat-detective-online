import type {Vec3Data} from '../../networkProtocol';
import {BALL_GRAVITY,BALL_RADIUS,BALL_RESTITUTION,BALL_SPEED} from '../../ballTuning';

/** The first solid surface on a segment, with its outward normal. */
export interface RayHit {point:Vec3Data;normal:Vec3Data}
/** A world ray: the first hit from `from` to `to`, or undefined when the segment is clear. */
export type RayCast=(from:Vec3Data,to:Vec3Data)=>RayHit|undefined;

/** Bank shots at a rat seen at most `memoryMs` ago within `range`: one attempt of at most `rays` rays every
 * `attemptMs`; a solution is fired within `holdMs` or dropped. Walls are found by probes out to `probe`. */
export const BANK={memoryMs:2500,range:35,attemptMs:600,holdMs:400,rays:12,probe:22} as const;
/** Probe bearings either side of the target's: 29°, 57° and 83°. */
const PROBES=[.5,-.5,1,-1,1.45,-1.45];

/** A one-bounce shot from `eye` to `target` off a nearby wall: the point to aim at, or undefined. Probes find
 * walls; the target's mirror image across each wall gives the bounce point; the shortest path whose first leg
 * meets that wall beside that point, and whose second leg reaches the target unobstructed and clear of `avoid`
 * (points a returning ball must not pass near, like silver coats), wins. At most `BANK.rays` rays. */
export function bankShot(eye:Vec3Data,target:Vec3Data,ray:RayCast,avoid:readonly Vec3Data[]=[]):Vec3Data|undefined {
    const bearing=Math.atan2(target.x-eye.x,target.z-eye.z);
    const walls:RayHit[]=[];
    for(const turn of PROBES){
        const hit=ray(eye,{x:eye.x+Math.sin(bearing+turn)*BANK.probe,y:eye.y,z:eye.z+Math.cos(bearing+turn)*BANK.probe});
        const flat=hit&&Math.hypot(hit.normal.x,hit.normal.z);
        // Walls only: floors and ceilings would bounce the ball out of the rat's height.
        if(!hit||!flat||Math.abs(hit.normal.y)>.3)continue;
        const normal={x:hit.normal.x/flat,y:0,z:hit.normal.z/flat};
        if(walls.some(w=>w.normal.x*normal.x+w.normal.z*normal.z>.99&&Math.abs((hit.point.x-w.point.x)*normal.x+(hit.point.z-w.point.z)*normal.z)<.2))continue;
        walls.push({point:hit.point,normal});
    }
    const candidates=walls.flatMap(({point,normal})=>{
        // The ball's centre turns a radius short of the wall.
        const front=(p:Vec3Data)=>(p.x-point.x)*normal.x+(p.z-point.z)*normal.z-BALL_RADIUS;
        const near=front(eye),far=front(target);
        if(near<.3||far<.3)return [];
        // The straight line to the target's mirror image crosses the bounce plane at the bounce point.
        const f=near/(near+far),mirror={x:target.x-2*far*normal.x,y:target.y,z:target.z-2*far*normal.z};
        const bounce={x:eye.x+(mirror.x-eye.x)*f,y:eye.y+(mirror.y-eye.y)*f,z:eye.z+(mirror.z-eye.z)*f};
        const out=Math.hypot(bounce.x-eye.x,bounce.y-eye.y,bounce.z-eye.z),back=Math.hypot(target.x-bounce.x,target.y-bounce.y,target.z-bounce.z);
        return [{normal,wall:point,bounce,out,back}];
    }).sort((a,b)=>a.out+a.back-b.out-b.back);
    let used=PROBES.length;
    for(const {normal,wall,bounce,out,back} of candidates){
        if(used+2>BANK.rays)break;
        used+=2;
        // The first thing the shot meets must be this wall, beside the bounce point.
        const past={x:bounce.x+(bounce.x-eye.x)/out*2,y:bounce.y+(bounce.y-eye.y)/out*2,z:bounce.z+(bounce.z-eye.z)/out*2};
        const first=ray(eye,past);
        if(!first||first.normal.x*normal.x+first.normal.z*normal.z<.9||Math.abs((first.point.x-wall.x)*normal.x+(first.point.z-wall.z)*normal.z)>.05||
            Math.hypot(first.point.x-bounce.x,first.point.y-bounce.y,first.point.z-bounce.z)>1)continue;
        if(ray({x:bounce.x+normal.x*.3,y:bounce.y,z:bounce.z+normal.z*.3},target))continue;
        if(avoid.some(p=>segmentDistance(bounce,target,p)<1.2))continue;
        // Lift the aim so the drop over both legs (the second slowed by the bounce) lands on the target.
        const t=out/BALL_SPEED+back/(BALL_SPEED*BALL_RESTITUTION);
        return {x:bounce.x,y:bounce.y-BALL_GRAVITY*t*t/2*out/(out+back),z:bounce.z};
    }
}

function segmentDistance(a:Vec3Data,b:Vec3Data,p:Vec3Data):number {
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
    const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/length)):0;
    return Math.hypot(a.x+dx*t-p.x,a.y+dy*t-p.y,a.z+dz*t-p.z);
}
