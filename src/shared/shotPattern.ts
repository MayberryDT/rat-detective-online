import * as C from 'cannon-es';
import type {ShotDescriptor,Vec3Data} from './networkProtocol';
import type {IncidentId} from './incidentCatalog';
import {BALL_SPEED} from './ballTuning';
import {BAD_ROUNDS,type BadRound} from './shotBallistics';
import {WEAPON_TUNING as W,type WeaponKind} from './pickups';

function hash(text:string,seed=2166136261):number {
    let n=seed;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return n>>>0;
}
/** A well-mixed uniform value in [0, 1) from `seed`. */
function unit(seed:number):number {
    let n=Math.imul(seed^(seed>>>15),1|seed);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;
}
/** Bad Ammunition: the personality of a trigger's ball, named by its shot ID (the ball's own ID), so the shooter's
 * prediction, the authority and every watching client agree. Allocation-free, so the view can ask every frame. */
export function badRound(shotId:string):BadRound {
    return BAD_ROUNDS[Math.floor(unit((hash(shotId,0x811c9dc5^0x5bd1e995)+0x6d2b79f5)|0)*BAD_ROUNDS.length)]!;
}
const data3=(v:{x:number;y:number;z:number}):Vec3Data=>({x:v.x,y:v.y,z:v.z});
export interface PatternBall {id:string;velocity:Vec3Data;quirk?:BadRound;slug?:true}
/** The weapon a trigger fired with; `heat` is the Tommy Gun's held-shot count (`tommyHeat`). */
export interface ShotWeapon {kind:WeaponKind;heat?:number}
/** The Tommy Gun's held-shot count after a trigger at `now`: one more (to `tommyBloomShots`) within `tommyHeatMs`
 * of the previous trigger at `lastAt`, else a fresh burst. Shooter and authority each count their own triggers. */
export const tommyHeat=(heat:number,lastAt:number|undefined,now:number):number=>
    lastAt!==undefined&&now-lastAt<=W.tommyHeatMs?Math.min(W.tommyBloomShots,heat+1):0;
/** The Tommy Gun's cone half-angle (radians) at a held-shot count. */
export const tommyCone=(heat:number):number=>W.tommyCone+(W.tommyBloom-W.tommyCone)*Math.min(1,Math.max(0,heat)/W.tommyBloomShots);
/** A held special weapon replaces any incident's pattern: the Tommy Gun fires one plain ball within its cone (seeded
 * by the shot ID), the Persuader one slug; the Laser (a beam, `laserPath`) and the Mousetrap (set down, not fired) fire no ball. */
export function resolveShotPattern(shot:ShotDescriptor,incident?:IncidentId,weapon?:ShotWeapon):PatternBall[] {
    const direction=new C.Vec3(shot.direction.x,shot.direction.y,shot.direction.z);direction.normalize();
    const baseId=shot.shotId.length<=60?shot.shotId:`${hash(shot.shotId).toString(16)}.${shot.shotId.slice(-48)}`;
    const result:PatternBall[]=[];
    const add=(v:Vec3Data)=>result.push({id:result.length?`${baseId}:${result.length}`:shot.shotId,velocity:{x:v.x,y:v.y,z:v.z}});
    if(weapon){
        // The Persuader: one big slow slug straight down the aim.
        if(weapon.kind==='persuader'){result.push({id:shot.shotId,velocity:data3(direction.scale(BALL_SPEED*W.persuaderSpeed)),slug:true});return result;}
        if(weapon.kind!=='tommy-gun')return result;
        // Uniform over the cone's disc.
        const seed=hash(shot.shotId,0x9e3779b9),angle=tommyCone(weapon.heat??0)*Math.sqrt(unit(seed)),azimuth=unit((seed+0x6d2b79f5)|0)*Math.PI*2;
        const axis=Math.abs(direction.y)<.95?new C.Vec3(0,1,0):new C.Vec3(1,0,0);
        const side=direction.cross(axis);side.normalize();const up=side.cross(direction);up.normalize();
        add(direction.scale(Math.cos(angle)).vadd(side.scale(Math.sin(angle)*Math.cos(azimuth))).vadd(up.scale(Math.sin(angle)*Math.sin(azimuth))).scale(BALL_SPEED));
        return result;
    }
    if(incident==='scattershot'){
        const velocity=direction.scale(BALL_SPEED);add(velocity);
        for(const angle of [-.22,-.11,.11,.22]){const rotation=new C.Quaternion();rotation.setFromAxisAngle(new C.Vec3(0,1,0),angle);add(rotation.vmult(velocity));}
    }else add(direction.scale(BALL_SPEED));
    return result;
}
