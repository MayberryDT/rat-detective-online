import * as C from 'cannon-es';
import type {ShotDescriptor,Vec3Data} from './networkProtocol';
import type {IncidentId} from './incidentCatalog';
import {BALL_SPEED} from './ballTuning';

function hash(text:string):number {
    let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return n>>>0;
}
/** A trigger's random UUID gives client and authority the same random volley.
 * Authority still selects the active incident and validates/accepts the shot. */
function shotRandom(id:string):()=>number {
    let seed=hash(id);
    return ()=>{seed+=0x6d2b79f5;let n=Math.imul(seed^(seed>>>15),1|seed);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
}
export type BadRound='jam'|'dud'|'crooked';
/** Bad Ammunition, per trigger: 12% jam (no ball), 20% dud (one harmless ball
 * that dribbles out of the barrel), otherwise 1–3 crooked balls. Its own seeded
 * stream, so every client names the same round (and backfire) for a shot ID. */
export function badRound(shotId:string):{round:BadRound;backfire:boolean} {
    const random=shotRandom(`${shotId}:bad-round`),roll=random();
    return {round:roll<.12?'jam':roll<.32?'dud':'crooked',backfire:random()<.18};
}
/** A dud leaves the muzzle at this fraction of ordinary speed, tipping down. */
export const DUD_SPEED=.12;
export interface PatternBall {id:string;velocity:Vec3Data;dud?:true}
export function resolveShotPattern(shot:ShotDescriptor,incident?:IncidentId,random=shotRandom(shot.shotId)):PatternBall[] {
    const direction=new C.Vec3(shot.direction.x,shot.direction.y,shot.direction.z);direction.normalize();
    const baseId=shot.shotId.length<=60?shot.shotId:`${hash(shot.shotId).toString(16)}.${shot.shotId.slice(-48)}`;
    const result:PatternBall[]=[];
    const add=(v:C.Vec3,dud=false)=>result.push({id:result.length?`${baseId}:${result.length}`:shot.shotId,velocity:{x:v.x,y:v.y,z:v.z},...(dud?{dud:true as const}:{})});
    if(incident==='scattershot'){
        const velocity=direction.scale(BALL_SPEED);add(velocity);
        for(const angle of [-.22,-.11,.11,.22]){const rotation=new C.Quaternion();rotation.setFromAxisAngle(new C.Vec3(0,1,0),angle);add(rotation.vmult(velocity));}
    }else if(incident==='bad-ammunition'){
        const {round}=badRound(shot.shotId);
        if(round==='jam')return result;
        if(round==='dud'){const v=direction.scale(BALL_SPEED*DUD_SPEED);v.y-=BALL_SPEED*.03;add(v,true);return result;}
        const roll=random(),count=roll<.7?1:roll<.9?2:3;
        const axis=Math.abs(direction.y)<.95?new C.Vec3(0,1,0):new C.Vec3(1,0,0);
        const side=direction.cross(axis);side.normalize();const up=side.cross(direction);up.normalize();
        for(let i=0;i<count;i++){
            const angle=.12+random()*.12,quadrant=random()*4;
            const azimuth=Math.floor(quadrant)*Math.PI/2+Math.PI/6+(quadrant%1)*Math.PI/6;
            add(direction.scale(Math.cos(angle)).vadd(side.scale(Math.sin(angle)*Math.cos(azimuth)))
                .vadd(up.scale(Math.sin(angle)*Math.sin(azimuth))).scale(BALL_SPEED));
        }
    }else add(direction.scale(BALL_SPEED));
    return result;
}
