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
