import { JURISDICTION_ZONES, JURISDICTION_ZONE_IDS, isJurisdictionZoneId, type JurisdictionZone, type JurisdictionZoneId } from './jurisdictionZones';
/** `zoneMs`: the points a zone holds (1 a second of the case held in it); they drain only while the case is held there,
 * then the zone moves (Tyler, 1 October). Three zones' worth win (`targetMs`); the last `warningMs` tick down. Only the active zone is ever shown. */
export const JURISDICTION_TUNING={targetMs:60_000,zoneMs:20_000,warningMs:5_000} as const;
export interface JurisdictionState {
    order:JurisdictionZoneId[]; nextOrder:JurisdictionZoneId[]; index:number; serial:number;
    remainingMs:number; heldMs:Record<string,number>; scorerId:string|null;
}
type ZoneCategory=JurisdictionZone['category'];
const BY_CATEGORY:Record<ZoneCategory,readonly JurisdictionZoneId[]>={
    outdoor:JURISDICTION_ZONE_IDS.filter(id=>JURISDICTION_ZONES[id].category==='outdoor'),
    enclosed:JURISDICTION_ZONE_IDS.filter(id=>JURISDICTION_ZONES[id].category==='enclosed'),
};
const ZONE_COUNT=JURISDICTION_ZONE_IDS.length;
/** A bag's categories when it opens with `first`: the smaller category spread evenly through the
 * larger and never twice running (equal categories strictly alternate). Every bag opens with the
 * larger category; null when `first` is the smaller. */
function bagPattern(first:ZoneCategory):ZoneCategory[]|null {
    const second=first==='outdoor'?'enclosed':'outdoor',spread=BY_CATEGORY[second].length;
    if(spread>BY_CATEGORY[first].length)return null;
    const pattern=Array<ZoneCategory>(ZONE_COUNT).fill(first);
    for(let i=0;i<spread;i++)pattern[Math.floor((i+.5)*ZONE_COUNT/spread)]=second;
    return pattern;
}
export function shuffleZones(random= Math.random,first?:ZoneCategory):JurisdictionZoneId[] {
    const shuffle=(category:ZoneCategory)=>{
        const bag=[...BY_CATEGORY[category]];
        for(let i=bag.length-1;i>0;i--){const j=Math.max(0,Math.min(i,Math.floor(random()*(i+1))));[bag[i],bag[j]]=[bag[j],bag[i]];}
        return bag;
    };
    const {outdoor,enclosed}=BY_CATEGORY;
    const opening=outdoor.length>enclosed.length?'outdoor':enclosed.length>outdoor.length?'enclosed':first??(random()<.5?'outdoor':'enclosed');
    const bags={outdoor:shuffle('outdoor'),enclosed:shuffle('enclosed')};
    return bagPattern(opening)!.map(c=>bags[c].shift()!);
}
export function createJurisdiction(random=Math.random):JurisdictionState {
    const order=shuffleZones(random);
    return {order,nextOrder:shuffleZones(random,JURISDICTION_ZONES[order[0]].category),index:0,serial:0,remainingMs:JURISDICTION_TUNING.zoneMs,heldMs:{},scorerId:null};
}
export const activeZone=(s:JurisdictionState)=>s.order[s.index];
export function rotateZone(s:JurisdictionState,random=Math.random):void {
    s.serial++;s.index++;
    if(s.index===s.order.length){s.order=s.nextOrder;s.nextOrder=shuffleZones(random,JURISDICTION_ZONES[s.order[0]].category);s.index=0;}
    s.remainingMs=JURISDICTION_TUNING.zoneMs;s.scorerId=null;
}
export function parseJurisdiction(value:unknown):JurisdictionState|null {
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const s=value as Record<string,unknown>;
    const bag=(v:unknown):v is JurisdictionZoneId[]=>{
        if(!Array.isArray(v)||v.length!==ZONE_COUNT||new Set(v).size!==ZONE_COUNT||!v.every(isJurisdictionZoneId))return false;
        const pattern=bagPattern(JURISDICTION_ZONES[v[0]].category);
        return !!pattern&&v.every((id,i)=>JURISDICTION_ZONES[id].category===pattern[i]);
    };
    if(!bag(s.order)||!bag(s.nextOrder)||JURISDICTION_ZONES[s.order[0]].category!==JURISDICTION_ZONES[s.nextOrder[0]].category||
        !Number.isSafeInteger(s.index)||Number(s.index)<0||Number(s.index)>=ZONE_COUNT||!Number.isSafeInteger(s.serial)||Number(s.serial)<0||Number(s.serial)%ZONE_COUNT!==s.index||
        typeof s.remainingMs!=='number'||!Number.isFinite(s.remainingMs)||s.remainingMs<=0||s.remainingMs>JURISDICTION_TUNING.zoneMs||
        !(s.scorerId===null||typeof s.scorerId==='string'&&s.scorerId.length>0&&s.scorerId.length<=64)||!s.heldMs||typeof s.heldMs!=='object'||Array.isArray(s.heldMs))return null;
    const entries=Object.entries(s.heldMs);
    if(entries.length>16||entries.some(([id,ms])=>!id.length||id.length>64||typeof ms!=='number'||!Number.isFinite(ms)||ms<=0||ms>JURISDICTION_TUNING.targetMs))return null;
    return {order:[...s.order],nextOrder:[...s.nextOrder],index:Number(s.index),serial:Number(s.serial),remainingMs:s.remainingMs,heldMs:Object.fromEntries(entries),scorerId:s.scorerId};
}
