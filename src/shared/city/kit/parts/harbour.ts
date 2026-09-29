import type { KitBuilder } from '../kit';
import { HARBOUR, QUAY_EDGE_Z, SEA_FLOOR_Y, WATER_SURFACE_Y } from '../northPlan';

/** The harbour basin: a sea floor far below the surface and the stone face of the quay.
 * The water surface itself is drawn by the client and drowns rats (see northPlan). */
export function harbour(k:KitBuilder):void {
    const w=HARBOUR.xmax-HARBOUR.xmin,cx=(HARBOUR.xmin+HARBOUR.xmax)/2,d=HARBOUR.zmax-HARBOUR.zmin,cz=(HARBOUR.zmin+HARBOUR.zmax)/2;
    k.collide(cx,SEA_FLOOR_Y-.5,cz,w,1,d);
    k.water.push({...HARBOUR,y:WATER_SURFACE_Y});
    // The quay's face: dressed stone from the sea floor to the pavement, with a granite coping.
    k.solid('stone',cx,(SEA_FLOOR_Y+0)/2,QUAY_EDGE_Z-.5,w,-SEA_FLOOR_Y,1);
    k.piece('curb',cx,.08,QUAY_EDGE_Z-.2,w,.3,1.1);
}
