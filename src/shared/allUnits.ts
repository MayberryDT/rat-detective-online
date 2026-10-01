import { activeZone } from './jurisdiction';
import { JURISDICTION_ZONES } from './jurisdictionZones';
import type { AssignmentState } from './assignments';
import type { Vec3Data } from './networkProtocol';

/** All Units: where the action is, so where the fallen respawn as backup: the active Jurisdiction zone, or else
 * `casePoint` (the real case, or the rat carrying it). The authority places respawns by it; clients point the
 * YOU'RE BACKUP arrow at it. */
export function allUnitsPoint(assignment:AssignmentState|undefined,casePoint:Vec3Data):Vec3Data {
    const j=assignment?.jurisdiction;
    return j?{...JURISDICTION_ZONES[activeZone(j)].posts[0]!}:{x:casePoint.x,y:casePoint.y,z:casePoint.z};
}
