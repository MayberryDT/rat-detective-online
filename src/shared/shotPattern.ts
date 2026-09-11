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
export function resolveShotPattern(shot:ShotDescriptor,incident?:IncidentId,random=shotRandom(shot.shotId)):Array<{id:string;velocity:Vec3Data}> {
    const direction=new C.Vec3(shot.direction.x,shot.direction.y,shot.direction.z);direction.normalize();
    const baseId=shot.shotId.length<=60?shot.shotId:`${hash(shot.shotId).toString(16)}.${shot.shotId.slice(-48)}`;
    const result:Array<{id:string;velocity:Vec3Data}>=[];
    const add=(v:C.Vec3)=>result.push({id:result.length?`${baseId}:${result.length}`:shot.shotId,velocity:{x:v.x,y:v.y,z:v.z}});
    if(incident==='scattershot'){
        const velocity=direction.scale(BALL_SPEED);add(velocity);
        for(const angle of [-.22,-.11,.11,.22]){const rotation=new C.Quaternion();rotation.setFromAxisAngle(new C.Vec3(0,1,0),angle);add(rotation.vmult(velocity));}
    }else if(incident==='bad-ammunition'){
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
