import { JURISDICTION_ZONES, zoneContains, type JurisdictionZoneId } from '../../jurisdictionZones';
import type { Vec3Data } from '../../networkProtocol';

/** Check the whole short segment, including a body/braking margin. A point in
 * each arm of the sewer T does not imply the line between them is in the zone. */
export function zoneStepSafe(id:JurisdictionZoneId,from:Vec3Data,to:Vec3Data,margin=.85):boolean {
    const length=Math.hypot(to.x-from.x,to.z-from.z);
    const steps=Math.max(1,Math.ceil(length/.4));
    if(steps>40)return false;
    const floorY=JURISDICTION_ZONES[id].floorY;
    const inset=(p:Vec3Data,m:number)=>[[m,0],[-m,0],[0,m],[0,-m]].every(([x,z])=>zoneContains(id,{x:p.x+x,y:floorY,z:p.z+z}));
    const startsInset=inset(from,margin);
    for(let i=0;i<=steps;i++){
        const point={x:from.x+(to.x-from.x)*i/steps,y:floorY,z:from.z+(to.z-from.z)*i/steps};
        // A newly arriving carrier may be on the boundary. Let its safe margin
        // grow inward rather than rejecting every route from that starting pose.
        if(!zoneContains(id,point)||!inset(point,startsInset?margin:margin*i/steps))return false;
    }
    return true;
}
