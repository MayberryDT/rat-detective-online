import { activeZone } from '../shared/jurisdiction';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import { activeDestination, ASSIGNMENT_DESTINATIONS, type AssignmentState } from '../shared/assignments';
import { SEWER_PIPE_ENTRANCES, sewerPipePoint } from '../shared/sewerLayout';
import type { Vec3Data } from '../shared/networkProtocol';

/** All players see the same landmark. Between layers, point to an existing
 * walkable pipe mouth/foot, then to the whole destination once on its level. */
export function assignmentGuidance(state:AssignmentState|undefined, viewer:Vec3Data) {
    if(!state||state.phase==='closed')return;
    // The viewer is the rat's feet. Ground contacts can settle slightly below
    // street y=0; both modes use the sewer ceiling (y=-1) as the layer boundary.
    const underground=viewer.y < -1;
    if(state.jurisdiction){
        const id=activeZone(state.jurisdiction),zone=JURISDICTION_ZONES[id];
        const targetUnderground=zone.floor==='SEWER';
        let point:Vec3Data={...zone.posts[0],y:zone.floorY+2},via:string=zone.floor;
        if(underground!==targetUnderground){
            const distance=underground?30:0;
            const entries=SEWER_PIPE_ENTRANCES.map(e=>({e,p:sewerPipePoint(e,distance),exit:sewerPipePoint(e,30-distance)}));
            entries.sort((a,b)=>(Math.hypot(viewer.x-a.p.x,viewer.z-a.p.z)+Math.hypot(point.x-a.exit.x,point.z-a.exit.z))-(Math.hypot(viewer.x-b.p.x,viewer.z-b.p.z)+Math.hypot(point.x-b.exit.x,point.z-b.exit.z)));
            const best=entries[0],p=Math.hypot(viewer.x-best.p.x,viewer.z-best.p.z)>10?best.p:best.exit;
            point={x:p.x,y:p.floorY+2,z:p.z};via=underground?'EXIT SEWER ↑':'GO UNDERGROUND ↓';
        }else if(underground&&targetUnderground){
            // Follow the authored tunnel bends toward the central T, including Maintenance.
            if(viewer.z < -6)point=viewer.x>52?{x:48,y:-5,z:-36}:{x:48,y:-5,z:0};
            else if(viewer.z>24&&viewer.x < -10)point=viewer.x < -78?{x:-84,y:-5,z:0}:{x:0,y:-5,z:40};
        }
        if(state.phase==='suspended')via='PROGRESS PAUSED';
        return {id,point,action:'HOLD THE CASE IN THE ZONE',label:zone.label,via};
    }
    const id=activeDestination(state);if(!id)return;
    const d=ASSIGNMENT_DESTINATIONS[id],targetUnderground=id==='maintenance';
    const action=state.phase==='suspended'?'PROGRESS PAUSED':'DELIVER PAPERWORK INSIDE';
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
