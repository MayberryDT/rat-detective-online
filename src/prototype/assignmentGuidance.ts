import { activeDestination, ASSIGNMENT_DESTINATIONS, type AssignmentState } from '../shared/assignments';
import { SEWER_PIPE_ENTRANCES, sewerPipePoint } from '../shared/sewerLayout';
import type { Vec3Data } from '../shared/networkProtocol';

/** All players see the same landmark. Between layers, point to an existing
 * walkable pipe mouth/foot, then to the whole destination once on its level. */
export function assignmentGuidance(state:AssignmentState|undefined, viewer:Vec3Data) {
    if(!state||state.phase==='closed')return;
    const id=activeDestination(state);if(!id)return;
    const d=ASSIGNMENT_DESTINATIONS[id],underground=viewer.y<0,targetUnderground=id==='maintenance';
    const action=state.phase==='suspended'?'PROGRESS PAUSED':state.stamps===state.destinations.length-1?'BRING CASE TO FINISH':'BRING CASE INSIDE';
    let point:Vec3Data={...d.center,y:targetUnderground?-4:6},via='';
    if(underground!==targetUnderground){
        const distance=underground?30:0;
        const entry=SEWER_PIPE_ENTRANCES.reduce((best,e)=>{
            const p=sewerPipePoint(e,distance),b=sewerPipePoint(best,distance);
            return Math.hypot(viewer.x-p.x,viewer.z-p.z)<Math.hypot(viewer.x-b.x,viewer.z-b.z)?e:best;
        });
        const near=sewerPipePoint(entry,distance);
        const p=sewerPipePoint(entry,Math.hypot(viewer.x-near.x,viewer.z-near.z)>10?distance:30-distance);
        point={x:p.x,y:p.floorY+2,z:p.z};via=underground?'EXIT SEWER ↑':'GO UNDERGROUND ↓';
    }
    if(state.phase==='suspended')via='PROGRESS PAUSED';
    return {id,point,action,label:d.label,via};
}
