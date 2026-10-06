import * as C from 'cannon-es';
import {CITY_BOUNDS} from './grayboxLayout';
import type {Vec3Data} from './networkProtocol';
/** Heavy short lob. These constants belong to the trap only; gun ballistics are untouched. */
export const TRAP_THROW={speed:11,lift:2.4,gravity:-25,radius:.22,dragAfter:.4,drag:12} as const;
export function trapLaunch(direction:Vec3Data):Vec3Data {
    const n=Math.hypot(direction.x,direction.y,direction.z)||1;
    // Pitch still matters, but aiming at a far point never adds range or a grenade-like high arc.
    const pitch=Math.max(-.75,Math.min(.55,direction.y/n));
    return {x:direction.x/n*TRAP_THROW.speed,y:TRAP_THROW.lift+pitch*TRAP_THROW.speed,z:direction.z/n*TRAP_THROW.speed};
}
export function trapAdvance(position:Vec3Data,velocity:Vec3Data,dt:number,age=0):Vec3Data {
    const travel=age>=TRAP_THROW.dragAfter?(1-Math.exp(-TRAP_THROW.drag*dt))/TRAP_THROW.drag:dt;
    return {x:position.x+velocity.x*travel,y:position.y+velocity.y*dt+TRAP_THROW.gravity*dt*dt*.5,z:position.z+velocity.z*travel};
}

/** The broad heavy board sheds horizontal travel after its short launch; high/air throws fall rather than sail. */
export function trapVelocity(velocity:Vec3Data,dt:number,age=0):Vec3Data {
    const drag=age>=TRAP_THROW.dragAfter?Math.exp(-TRAP_THROW.drag*dt):1;
    return {x:velocity.x*drag,y:velocity.y+TRAP_THROW.gravity*dt,z:velocity.z*drag};
}

/** Trap origin is a front-of-body launch, independent of a hidden/stale pistol sleeve.
 * Aim chooses the horizontal front; exact vertical aim uses the rat's world heading.
 * City surfaces shorten that offset, never send it behind the rat or veto occupancy. */
export function trapOrigin(foot:Vec3Data,direction:Vec3Data,world:C.World,heading?:{x:number;y:number;z:number;w:number}):Vec3Data {
    let x=direction.x,z=direction.z,n=Math.hypot(x,z);
    if(n<.001){x=heading?2*(heading.x*heading.z+heading.w*heading.y):0;z=heading?1-2*(heading.x*heading.x+heading.y*heading.y):1;n=Math.hypot(x,z);}
    if(!Number.isFinite(n)||n<.001){x=0;z=1;n=1;}x/=n;z/=n;
    const base={x:foot.x,y:foot.y+1.3,z:foot.z};let reach=.85;
    for(const [v,d] of [[base.x,x],[base.z,z]])if(d>0)reach=Math.min(reach,(CITY_BOUNDS.max-v)/d);else if(d<0)reach=Math.min(reach,(CITY_BOUNDS.min-v)/d);
    // Footprint probes use real city collision, including StaticCityBroadphase boxes.
    for(const side of [-.22,0,.22]){
        const from=new C.Vec3(base.x-z*side,base.y,base.z+x*side),to=new C.Vec3(from.x+x*.85,from.y,from.z+z*.85),hit=new C.RaycastResult();
        world.raycastClosest(from,to,{collisionFilterMask:1,skipBackfaces:true},hit);
        if(hit.hasHit)reach=Math.min(reach,Math.max(0,hit.distance-.22));
    }
    reach=Math.max(0,reach);return {x:base.x+x*reach,y:base.y,z:base.z+z*reach};
}
