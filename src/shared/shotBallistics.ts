import {BALL_GRAVITY,BALL_LIFETIME,BALL_RADIUS,BALL_RESTITUTION,BALL_SPEED} from './ballTuning';
import {INCIDENT_TUNING as I,type ChaosShot} from './chaosState';
import type {IncidentId} from './incidentCatalog';
import type {Vec3Data} from './networkProtocol';

/** Shared by the authority, the client's shot prediction and the bots' aim. Only Big Cheese balls are ever
 * bigger than ordinary, so every ordinary ball keeps the established tuning exactly. */
const MAX_RADIUS=I.cheeseRadii[I.cheeseRadii.length-1];
/** 0 for an ordinary ball, 1 for the largest Big Cheese. */
const heft=(radius:number)=>Math.max(0,Math.min(1,(radius-BALL_RADIUS)/(MAX_RADIUS-BALL_RADIUS)));

/** A ball's own gravity: bigger cheese falls harder. */
export const shotGravity=(radius:number)=>BALL_GRAVITY*(1+(I.cheeseGravity-1)*heft(radius));
/** How fast a shot leaves the muzzle under the active incident. */
export const launchSpeed=(incident?:IncidentId)=>incident==='big-cheese'?I.cheeseShotSpeed:incident==='rat-race'?BALL_SPEED*I.ratRaceShotSpeed:BALL_SPEED;
/** The gravity a fresh shot flies under (Big Cheese balls leave the muzzle heavy). */
export const launchGravity=(incident?:IncidentId)=>incident==='big-cheese'?shotGravity(I.cheeseStartRadius):BALL_GRAVITY;
/** Seconds a ball lives, including Big Cheese extensions. */
export const shotLife=(shot:ChaosShot)=>shot.life??BALL_LIFETIME;

/** The next Big Cheese size up from `current`, or the largest. */
function nextCheeseRadius(current:number):number {
    for(const radius of I.cheeseRadii)if(radius>current+.001)return radius;
    return MAX_RADIUS;
}
/** Big Cheese: a ball leaves the muzzle ordinary and swells to its start size over `cheeseGrowIn`, so one fired
 * beside a wall never begins inside it. True when the radius changed. */
export function growIn(shot:ChaosShot):boolean {
    const radius=shot.radius??BALL_RADIUS;
    if(radius>=I.cheeseStartRadius)return false;
    const next=Math.min(I.cheeseStartRadius,BALL_RADIUS+(I.cheeseStartRadius-BALL_RADIUS)*shot.age/I.cheeseGrowIn);
    if(next<=radius)return false;
    shot.radius=next;return true;
}
/** Big Cheese damage: `cheeseDamage` at its start size and one more for every size step grown since, up to lethal.
 * An ordinary ball deals 1. */
export function cheeseDamage(radius:number,maxHp:number):number {
    if(!heft(radius))return 1;
    let steps=0;for(const r of I.cheeseRadii)if(r>I.cheeseStartRadius+.001&&r<=radius+.001)steps++;
    return Math.min(maxHp,I.cheeseDamage+steps);
}
/** Big Cheese, one real world bounce: a step bigger and a little longer-lived, up to the cap. */
export function cheeseBounce(shot:ChaosShot):void {
    shot.radius=nextCheeseRadius(shot.radius??BALL_RADIUS);
    shot.life=Math.min(I.cheeseMaxLife,shotLife(shot)+I.cheeseBounceLife);
}
/** Bounce velocity `v` in place off a surface with unit normal `n`; returns the contact's normal speed. An
 * ordinary ball keeps .9 of everything. A heavy one keeps less of its normal speed (a thud and a small hop) and
 * most of its tangential speed; a heavy contact no faster than `cheeseBounceMin` is rolling: it only loses the
 * normal speed. */
export function bounceShot(v:Vec3Data,n:Vec3Data,radius:number):number {
    const dot=v.x*n.x+v.y*n.y+v.z*n.z,speed=Math.abs(dot),h=heft(radius);
    if(!h){v.x=(v.x-2*dot*n.x)*BALL_RESTITUTION;v.y=(v.y-2*dot*n.y)*BALL_RESTITUTION;v.z=(v.z-2*dot*n.z)*BALL_RESTITUTION;return speed;}
    if(speed<=I.cheeseBounceMin){v.x-=dot*n.x;v.y-=dot*n.y;v.z-=dot*n.z;return speed;}
    const normal=BALL_RESTITUTION+(I.cheeseRestitution-BALL_RESTITUTION)*h,tangent=BALL_RESTITUTION+(I.cheeseTangent-BALL_RESTITUTION)*h;
    v.x=(v.x-dot*n.x)*tangent-dot*n.x*normal;v.y=(v.y-dot*n.y)*tangent-dot*n.y*normal;v.z=(v.z-dot*n.z)*tangent-dot*n.z*normal;
    return speed;
}
/** Whether a contact of this normal speed is a real bounce (always, for an ordinary ball) rather than rolling. */
export const bounces=(speed:number,radius:number)=>!heft(radius)||speed>I.cheeseBounceMin;
