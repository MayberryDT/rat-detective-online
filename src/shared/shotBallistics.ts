import {BALL_GRAVITY,BALL_LIFETIME,BALL_RADIUS,BALL_RESTITUTION,BALL_SPEED} from './ballTuning';
import {CROSSFIRE,INCIDENT_TUNING as I,type ChaosShot} from './chaosState';
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
export const launchSpeed=(incident?:IncidentId)=>incident==='big-cheese'?I.cheeseShotSpeed:BALL_SPEED;
/** The gravity a fresh shot flies under (Big Cheese balls leave the muzzle heavy). */
export const launchGravity=(incident?:IncidentId)=>incident==='big-cheese'?shotGravity(I.cheeseStartRadius):BALL_GRAVITY;
/** Seconds a ball lives, including Big Cheese and Crossfire extensions. */
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
/** Crossfire, one real world bounce, after `bounceShot`: a step hotter, up to `CROSSFIRE.maxHeat`; each step leaves the
 * wall `speedUp`× as fast as it arrived (undoing the bounce's restitution) and lives a little longer, up to the cap. At
 * full heat it leaves every wall as fast as it arrived, a white-hot streak however long the ricochet. */
export function crossfireBounce(shot:ChaosShot):void {
    const heat=shot.heat??0,full=heat>=CROSSFIRE.maxHeat,gain=(full?1:CROSSFIRE.speedUp)/BALL_RESTITUTION;
    shot.v.x*=gain;shot.v.y*=gain;shot.v.z*=gain;
    if(full)return;
    shot.heat=heat+1;
    shot.life=Math.max(shotLife(shot),Math.min(CROSSFIRE.maxLife,shotLife(shot)+CROSSFIRE.life));
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

/** Bad Ammunition (Tyler, 1 October: "funny paths that still land where you aim"): every trigger fires one ball with a
 * personality, named by its shot ID (`badRound`). The path personalities fly the aim line with no drop, each wandering
 * around it its own way, until their first contact; then they are ordinary balls. A superball flies like an ordinary
 * ball but keeps all its speed at every bounce, for longer.
 * corkscrew: `speed` u/s along the aim, spiralling `turns` times a second at `radius` (eased in over `ramp` s).
 * snake: `speed` along the aim, swaying `width` side to side `waves` times a second.
 * floater: drifts at `speed` with a `bob` up and down `bobs` times a second, and lives `life` s.
 * hiccup: full `speed` until `stopAt` s, hangs in the air (shaking `jiggle` u/s) until `goAt`, then lurches on at `lurch`. */
export const BAD_ROUNDS=['corkscrew','snake','superball','floater','hiccup'] as const;
export type BadRound=typeof BAD_ROUNDS[number];
export const BAD_AMMO={
    corkscrew:{speed:95,radius:.5,turns:5,ramp:.08},
    snake:{speed:80,width:.6,waves:3.2},
    superball:{life:3,restitution:1},
    floater:{speed:34,bob:.35,bobs:1.6,life:2.6},
    hiccup:{speed:BALL_SPEED,stopAt:.06,goAt:.34,lurch:230,jiggle:6},
} as const;
/** A fresh Bad Ammunition ball's launch velocity along the unit aim `a`. */
export function quirkLaunch(quirk:BadRound,a:Vec3Data):Vec3Data {
    const shot:ChaosShot={id:'',owner:null,p:{x:0,y:0,z:0},v:{x:a.x*BALL_SPEED,y:a.y*BALL_SPEED,z:a.z*BALL_SPEED},age:0,quirk,aim:a};
    steerQuirk(shot);return shot.v;
}
/** The personality fields a fresh ball carries: `quirk`, its unit `aim` and a longer `life` where it has one. */
export function quirkBirth(quirk:BadRound,aim:Vec3Data):Pick<ChaosShot,'quirk'|'aim'|'life'> {
    const life=quirk==='superball'?BAD_AMMO.superball.life:quirk==='floater'?BAD_AMMO.floater.life:undefined,length=Math.hypot(aim.x,aim.y,aim.z)||1;
    return {quirk,aim:{x:aim.x/length,y:aim.y/length,z:aim.z/length},...(life===undefined?{}:{life})};
}
/** Before a step's move: set a path personality's velocity for its age. False while it flies without gravity. */
export function steerQuirk(shot:ChaosShot):boolean {
    const q=shot.quirk,a=shot.aim;
    if(!q||!a||q==='superball')return true;
    const t=shot.age,v=shot.v;
    // A frame around the aim: `s` sideways (level unless aiming nearly straight up or down), `u` its up.
    let sx=-a.z,sy=0,sz=a.x;
    if(Math.abs(a.y)>=.95){sx=0;sy=a.z;sz=-a.y;}
    const sl=Math.hypot(sx,sy,sz)||1;sx/=sl;sy/=sl;sz/=sl;
    const ux=sy*a.z-sz*a.y,uy=sz*a.x-sx*a.z,uz=sx*a.y-sy*a.x;
    let forward=0,side=0,up=0;
    if(q==='corkscrew'){
        const c=BAD_AMMO.corkscrew,w=Math.PI*2*c.turns,r=c.radius*Math.min(1,t/c.ramp),dr=t<c.ramp?c.radius/c.ramp:0;
        const cos=Math.cos(w*t),sin=Math.sin(w*t);
        forward=c.speed;side=dr*cos-r*w*sin;up=dr*sin+r*w*cos;
    }else if(q==='snake'){
        const c=BAD_AMMO.snake,w=Math.PI*2*c.waves;
        forward=c.speed;side=c.width*w*Math.cos(w*t);
    }else if(q==='floater'){
        const c=BAD_AMMO.floater,w=Math.PI*2*c.bobs;
        forward=c.speed;up=c.bob*w*Math.cos(w*t);
    }else{
        const c=BAD_AMMO.hiccup,paused=t>=c.stopAt&&t<c.goAt;
        forward=t<c.stopAt?c.speed:paused?0:c.lurch;
        if(paused){side=c.jiggle*Math.sin(t*90);up=c.jiggle*.6*Math.cos(t*70);}
    }
    v.x=a.x*forward+sx*side+ux*up;v.y=a.y*forward+sy*side+uy*up;v.z=a.z*forward+sz*side+uz*up;
    return false;
}
/** After a ball bounced: a superball keeps all its speed (up to an ordinary muzzle's); a path personality ends. */
export function quirkBounce(shot:ChaosShot):void {
    if(!shot.quirk)return;
    if(shot.quirk!=='superball'){delete shot.quirk;delete shot.aim;return;}
    const v=shot.v,speed=Math.hypot(v.x,v.y,v.z),scale=Math.min(BAD_AMMO.superball.restitution/BALL_RESTITUTION,BALL_SPEED/(speed||1));
    v.x*=scale;v.y*=scale;v.z*=scale;
}
