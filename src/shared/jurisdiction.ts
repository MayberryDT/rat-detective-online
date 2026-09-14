import { JURISDICTION_ZONES, JURISDICTION_ZONE_IDS, isJurisdictionZoneId, type JurisdictionZoneId } from './jurisdictionZones';
export const JURISDICTION_TUNING={targetMs:60_000,zoneMs:75_000,warningMs:10_000} as const;
export interface JurisdictionState {
    order:JurisdictionZoneId[]; nextOrder:JurisdictionZoneId[]; index:number; serial:number;
    remainingMs:number; heldMs:Record<string,number>; scorerId:string|null;
}
export function shuffleZones(random= Math.random,first?:'outdoor'|'enclosed'):JurisdictionZoneId[] {
    const shuffle=(category:'outdoor'|'enclosed')=>{
        const bag=JURISDICTION_ZONE_IDS.filter(id=>JURISDICTION_ZONES[id].category===category);
        for(let i=bag.length-1;i>0;i--){const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1))));[bag[i],bag[j]]=[bag[j],bag[i]];}
        return bag;
    };
    const a=shuffle(first??(random()<.5?'outdoor':'enclosed')),b=shuffle(JURISDICTION_ZONES[a[0]].category==='outdoor'?'enclosed':'outdoor');
    return a.flatMap((id,i)=>[id,b[i]]);
}
export function createJurisdiction(random=Math.random):JurisdictionState {
    const order=shuffleZones(random);
    return {order,nextOrder:shuffleZones(random,JURISDICTION_ZONES[order[0]].category),index:0,serial:0,remainingMs:JURISDICTION_TUNING.zoneMs,heldMs:{},scorerId:null};
}
export const activeZone=(s:JurisdictionState)=>s.order[s.index];
export const nextZone=(s:JurisdictionState)=>s.order[s.index+1]??s.nextOrder[0];
export function rotateZone(s:JurisdictionState,random=Math.random):void {
    s.serial++;s.index++;
    if(s.index===s.order.length){s.order=s.nextOrder;s.nextOrder=shuffleZones(random,JURISDICTION_ZONES[s.order[0]].category);s.index=0;}
    s.remainingMs=JURISDICTION_TUNING.zoneMs;s.scorerId=null;
}
export function parseJurisdiction(value:unknown):JurisdictionState|null {
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const s=value as Record<string,unknown>;
    const bag=(v:unknown):v is JurisdictionZoneId[]=>Array.isArray(v)&&v.length===6&&new Set(v).size===6&&v.every(isJurisdictionZoneId)&&v.every((id,i)=>!i||JURISDICTION_ZONES[id as JurisdictionZoneId].category!==JURISDICTION_ZONES[v[i-1] as JurisdictionZoneId].category);
    if(!bag(s.order)||!bag(s.nextOrder)||JURISDICTION_ZONES[s.order[0]].category!==JURISDICTION_ZONES[s.nextOrder[0]].category||
        !Number.isSafeInteger(s.index)||Number(s.index)<0||Number(s.index)>5||!Number.isSafeInteger(s.serial)||Number(s.serial)<0||Number(s.serial)%6!==s.index||
        typeof s.remainingMs!=='number'||!Number.isFinite(s.remainingMs)||s.remainingMs<=0||s.remainingMs>JURISDICTION_TUNING.zoneMs||
        !(s.scorerId===null||typeof s.scorerId==='string'&&s.scorerId.length>0&&s.scorerId.length<=64)||!s.heldMs||typeof s.heldMs!=='object'||Array.isArray(s.heldMs))return null;
    const entries=Object.entries(s.heldMs);
    if(entries.length>16||entries.some(([id,ms])=>!id.length||id.length>64||typeof ms!=='number'||!Number.isFinite(ms)||ms<=0||ms>JURISDICTION_TUNING.targetMs))return null;
    return {order:[...s.order],nextOrder:[...s.nextOrder],index:Number(s.index),serial:Number(s.serial),remainingMs:s.remainingMs,heldMs:Object.fromEntries(entries),scorerId:s.scorerId};
}
