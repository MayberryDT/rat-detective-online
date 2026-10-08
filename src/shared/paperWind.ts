import {CITY_STREETS} from './cityPlan';
import type {Vec3Data} from './networkProtocol';

/** The harbour wind that moves the case papers (P4, Tyler, 7 October: paper that feels alive). One pure function of
 * place and server time, so every client sees the same gust at the same moment and the authority picks a loose
 * sheet's resting spot downwind. It blows off the harbour (north is −z) toward the south-south-east; a street turns it
 * along its own length. Interiors and the sewers are calm: the renderer checks for a ceiling. */
const PREVAILING={x:.33,z:.94};
/** Gust fronts roll downwind this fast (units a second), so a street of papers lifts in turn, not in unison. */
const FRONT_SPEED=7;

/** Unit wind direction on the ground at (x, z). */
export function windAt(x:number,z:number):{x:number;z:number} {
    const street=CITY_STREETS.find(r=>Math.abs(x-r.x)<=r.w/2+1&&Math.abs(z-r.z)<=r.d/2+1&&Math.max(r.w,r.d)>2*Math.min(r.w,r.d));
    if(!street)return PREVAILING;
    return street.w>street.d?{x:PREVAILING.x>=0?1:-1,z:0}:{x:0,z:PREVAILING.z>=0?1:-1};
}

/** Gust strength 0…1 at (x, z) and server time `t` (ms): calm most of the time, a gust every ten to twenty seconds
 * lasting a few. Fronts travel downwind; a slow spatial offset keeps distant streets out of step. */
export function gustAt(x:number,z:number,t:number):number {
    const along=x*PREVAILING.x+z*PREVAILING.z,offset=2.6*Math.sin(x*.011+1.7)+2.2*Math.sin(z*.014);
    const s=t/1000-along/FRONT_SPEED+offset;
    const wave=.62*Math.sin(s*2*Math.PI/17)+.38*Math.sin(s*2*Math.PI/7.3+1.3);
    const g=Math.max(0,(wave-.32)/.68);
    return g*g*(3-2*g);
}

/** A sheet's stable pseudo-random number from its id and a salt, 0 … 2³²−1. */
export function paperHash(id:string,salt=0):number {
    let h=2166136261^salt;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);
    h^=h>>>13;h=Math.imul(h,1274126177);return (h^h>>>16)>>>0;
}

/** The loose-sheet timetable: a sheet with a second resting spot `q` hops between `p` and `q` when a gust catches it.
 * Slot k after its birth may hold one lift, at a hashed moment, if the gust there is strong then. Pure in (id, birth,
 * place, time), so every client agrees where it lies without having watched. */
export const LOOSE={slotMs:26000,flightMs:1700,chance:3,gust:.5,maxSlots:60} as const;
export interface LooseLift {at:number;from:'p'|'q'}
export function looseLifts(id:string,at:number,p:Vec3Data,until:number,out:LooseLift[]=[],fromSlot=1,count=0):{lifts:LooseLift[];nextSlot:number;count:number} {
    let k=fromSlot;
    for(;k<=LOOSE.maxSlots;k++){
        const start=at+k*LOOSE.slotMs;if(start>until)break;
        if(paperHash(id,k)%LOOSE.chance!==0)continue;
        const lift=start+paperHash(id,k+977)%(LOOSE.slotMs-LOOSE.flightMs);
        if(lift>until)break;
        if(gustAt(p.x,p.z,lift)<LOOSE.gust)continue;
        out.push({at:lift,from:count%2?'q':'p'});count++;
    }
    return {lifts:out,nextSlot:k,count};
}
