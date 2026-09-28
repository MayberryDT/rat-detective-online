import type { Vec3Data } from './networkProtocol';

/** The three approved pickups. Kept literal so snapshot validation can share it. */
export const PICKUP_KINDS = ['ironclad', 'hustle', 'quick-fix'] as const;
export type PickupKind = typeof PICKUP_KINDS[number];
export const isPickupKind = (value: unknown): value is PickupKind =>
    typeof value === 'string' && (PICKUP_KINDS as readonly string[]).includes(value);

/** Release tuning; subjective pickup feel still benefits from human playtests. */
export const PICKUP_TUNING = {
    /** Close reach for supply props; the larger genuine case has its own forgiving reach. */
    claimRadius: 1.5,
    /** A claimed site returns after this long, keeping the route choice alive all match. */
    respawnMs: 45_000,
    /** Reflection coat: long enough to cross a street under fire, short enough to track. */
    ironcladMs: 12_000,
    /** Speed: a burst, not a new base movement state. */
    hustleMs: 10_000,
    /** Clearly noticeable without breaking the established camera and steering. */
    hustleMultiplier: 1.45,
} as const;

export interface PickupCopy { title: string; effect: string; flavor: string }
export const PICKUP_COPY: Record<PickupKind, PickupCopy> = {
    ironclad: { title: 'IRONCLAD ALIBI', effect: 'Reflects cheese balls', flavor: 'Nothing sticks.' },
    hustle: { title: 'HOT PURSUIT', effect: 'Temporary speed boost', flavor: 'Move it, detective.' },
    'quick-fix': { title: 'QUICK FIX', effect: 'Full health', flavor: 'Fit for duty. Allegedly.' },
};

/** Authored floor heights keep rewards on their intended routes. Every site has
 * a reason: Ironclad is one hard trip per landmark, never stacked; Hot Pursuit
 * waits where long runs start; Quick Fix hides in alleys just off the fights. */
export interface PickupAnchor { id: string; kind: PickupKind; x: number; z: number; y?:number; near: string }
export const PICKUP_ANCHORS: readonly PickupAnchor[] = [
    {id:'alibi-records-upper',kind:'ironclad',x:-16,z:-47,y:8.7,near:'Records Hall archive, second floor'},
    {id:'alibi-icebox-upper',kind:'ironclad',x:116,z:-84,y:8.7,near:'Icebox open rear catwalk'},
    {id:'alibi-pump-roof',kind:'ironclad',x:125,z:130,y:36.7,near:'Pumping Station roof, by launcher only'},
    {id:'alibi-gate-roof',kind:'ironclad',x:-137,z:0,y:29.7,near:'Gate bridge roof'},
    {id:'alibi-maintenance',kind:'ironclad',x:64,z:-37,y:-6.3,near:'Sewer maintenance, deep and dark'},
    {id:'pursuit-gate-mouth',kind:'hustle',x:-148,z:0,y:.7,near:'Gate sewer entrance, before the long tunnel east'},
    {id:'pursuit-icebox-mouth',kind:'hustle',x:148,z:0,y:.7,near:'Icebox sewer entrance, before the long tunnel west'},
    {id:'pursuit-north-avenue',kind:'hustle',x:70,z:-150,y:.7,near:'North end of Seventy Avenue, a straight sprint south'},
    {id:'pursuit-south-avenue',kind:'hustle',x:-150,z:130,y:.7,near:'West end of the south avenue, a straight sprint east'},
    {id:'fix-crossroads-west',kind:'quick-fix',x:-25.5,z:10,y:.7,near:'Alley between the central blocks, west of the crossroads'},
    {id:'fix-crossroads-east',kind:'quick-fix',x:11.5,z:10,y:.7,near:'Alley between the central blocks, east of the crossroads'},
    {id:'fix-south-central',kind:'quick-fix',x:-17,z:58,y:.7,near:'Alley between the south-central blocks'},
    {id:'fix-icebox-alley',kind:'quick-fix',x:124,z:22,y:.7,near:'Alley between the shops south of the Icebox forecourt'},
    {id:'fix-gate-lane',kind:'quick-fix',x:-100,z:-45,y:.7,near:'Service lane between Records Hall and the Gate'},
];

/** Active timed effects on one rat. Absent keys mean no effect. */
export interface PlayerBuffs { ironcladUntil?: number; hustleUntil?: number }
export type BuffMap = Record<string, PlayerBuffs>;

/** All sites remain advertised while empty; the authority supplies their restock deadline. */
export interface PickupState { id: string; kind: PickupKind; x: number; y: number; z: number; availableAt?: number }

export const activeBuffs = (buffs: BuffMap | undefined, id: string, now: number): PlayerBuffs => {
    const entry = buffs?.[id];
    if (!entry) return {};
    return {
        ...(entry.ironcladUntil !== undefined && entry.ironcladUntil > now ? { ironcladUntil: entry.ironcladUntil } : {}),
        ...(entry.hustleUntil !== undefined && entry.hustleUntil > now ? { hustleUntil: entry.hustleUntil } : {}),
    };
};
export const hasIronclad = (buffs: BuffMap | undefined, id: string, now: number): boolean =>
    (buffs?.[id]?.ironcladUntil ?? 0) > now;
export const hasHustle = (buffs: BuffMap | undefined, id: string, now: number): boolean =>
    (buffs?.[id]?.hustleUntil ?? 0) > now;

/** True when the entry has fallen out of every effect and can be pruned. */
export const buffExpired = (entry: PlayerBuffs | undefined, now: number): boolean =>
    !entry || ((entry.ironcladUntil ?? 0) <= now && (entry.hustleUntil ?? 0) <= now);

/** Merge a fresh claim into a rat's existing effects. Re-collecting the same
 * benefit refreshes to the full duration; it never stacks or accumulates. */
export function mergePickup(
    existing: PlayerBuffs | undefined,
    pickup: PickupKind,
    now: number,
): PlayerBuffs {
    const next: PlayerBuffs = { ...existing };
    if (pickup === 'ironclad') next.ironcladUntil = now + PICKUP_TUNING.ironcladMs;
    else if (pickup === 'hustle') next.hustleUntil = now + PICKUP_TUNING.hustleMs;
    return next;
}

export interface PickupPoint { id: string; kind: PickupKind; p: Vec3Data }

/** Street packs use clear spawn pavement; authored rewards keep their floor and
 * require physical support and clearance when resolved by the authority. */
export function resolvePickupPoints(clear: readonly Vec3Data[], maxSnap = 14, supported?:(p:Vec3Data)=>boolean): PickupPoint[] {
    const taken = new Set<string>();
    const points: PickupPoint[] = [];
    for (const anchor of PICKUP_ANCHORS) {
        if(anchor.y!==undefined){
            // Search only a small patch of this exact floor, never snap down to a street.
            const offsets=[0,-1,1,-2,2];
            const candidates=offsets.flatMap(dx=>offsets.map(dz=>({x:anchor.x+dx,y:anchor.y!,z:anchor.z+dz})))
                .sort((a,b)=>Math.hypot(a.x-anchor.x,a.z-anchor.z)-Math.hypot(b.x-anchor.x,b.z-anchor.z));
            const p=candidates.find(p=>!taken.has(`${p.x},${p.y},${p.z}`)&&(!supported||supported(p)));
            if(p){taken.add(`${p.x},${p.y},${p.z}`);points.push({id:anchor.id,kind:anchor.kind,p});}
            continue;
        }
        let best: Vec3Data | undefined, bestDistance = maxSnap;
        for (const point of clear) {
            const key = `${point.x},.7,${point.z}`;
            if (taken.has(key)) continue;
            // Street-level only: pickups never spawn inside the sewer network.
            if (point.y < -1) continue;
            const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z);
            if (distance < bestDistance) { best = point; bestDistance = distance; }
        }
        if (!best) continue;
        taken.add(`${best.x},.7,${best.z}`);
        points.push({ id: anchor.id, kind: anchor.kind, p: { x: best.x, y: .7, z: best.z } });
    }
    return points;
}
