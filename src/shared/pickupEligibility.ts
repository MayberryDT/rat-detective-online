import {CHAOS_TUNING as T} from './chaosState';
export const PICKUP_REASONS=['eligible','heldByYou','heldByOther','dead','roundOver','returning','weaponized','tooFast','cooldown','outOfReach','blocked'] as const;
export type PickupReason=typeof PICKUP_REASONS[number];
export interface PickupStatus {at:number;reason:PickupReason;distance:number;speed:number;waitMs:number}
export interface PickupConditions {
    owner:string|null;playerId:string;hp:number;playing:boolean;returning:boolean;weaponized:boolean;
    alreadyHolding:boolean;speed:number;distance:number;waitMs:number;
}
/** Shared diagnostic vocabulary, evaluated by authority with its real LOS query. */
export function pickupReason(c:PickupConditions,blocked:()=>boolean):PickupReason {
    if(c.owner)return c.owner===c.playerId?'heldByYou':'heldByOther';
    if(c.hp<=0)return 'dead';
    if(!c.playing)return 'roundOver';
    if(c.returning)return 'returning';
    if(c.weaponized)return 'weaponized';
    if(c.speed>T.casePickupMaxSpeed)return 'tooFast';
    if(c.alreadyHolding)return 'heldByYou';
    if(c.waitMs>0)return 'cooldown';
    if(c.distance>T.pickupRadius)return 'outOfReach';
    return blocked()?'blocked':'eligible';
}
