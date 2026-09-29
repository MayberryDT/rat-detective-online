import * as C from 'cannon-es';
import { SLICK_MATERIAL } from './StaticCityBroadphase';

/** Every rat body (players, bots, local bots) stands on a foot sphere of this radius, centred this high. */
const FOOT_Y=.6,FOOT_R=.6;

/** True while `body` touched a slick city surface in the last step: the chute owns the ride. */
export function touchingSlick(world:C.World,body:C.Body):boolean {
    for(const c of world.contacts)if((c.bi===body&&c.bj.material===SLICK_MATERIAL)||(c.bj===body&&c.bi.material===SLICK_MATERIAL))return true;
    return false;
}

const from=new C.Vec3(),to=new C.Vec3(),hit=new C.RaycastResult();
const cityRay:C.RayOptions={collisionFilterMask:1,skipBackfaces:true};

/**
 * A launcher fall reaches 75 u/s. One step of that (2.5 units at the bots' 1/30 s)
 * carries the foot sphere past the middle of a thin roof, and Cannon then resolves
 * the overlap through the underside. Before the step, look down the column the body
 * will occupy; if a floor lies within this step's fall, slow the fall so the step
 * ends on it. Call just before `world.step(dt)`.
 */
export function guardFastFall(world:C.World,body:C.Body,dt:number):void {
    const v=body.velocity,fall=-(v.y+world.gravity.y*dt)*dt;
    if(fall<FOOT_R*.5)return;
    const x=body.position.x+v.x*dt,y=body.position.y+FOOT_Y,z=body.position.z+v.z*dt;
    from.set(x,y,z);to.set(x,y-fall-FOOT_R-.05,z);
    if(!world.raycastClosest(from,to,cityRay,hit)||hit.hitNormalWorld.y<.5)return;
    // Semi-implicit Euler: this step moves by (v + g·dt)·dt, so arrive exactly on the floor.
    const gap=Math.max(0,y-FOOT_R-hit.hitPointWorld.y);
    v.y=Math.max(v.y,-gap/dt-world.gravity.y*dt);
}
