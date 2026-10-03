import type { Vec3Data } from './networkProtocol';
import { DOCKS_JOBS } from './city/kit/parts/docks';
import { PRECINCT_JOBS } from './city/kit/parts/precinct';

/** The seven pickups: four supplies and three special weapons. Kept literal so snapshot validation can share it. */
export const PICKUP_KINDS = ['ironclad', 'hustle', 'quick-fix', 'stakeout', 'tommy-gun', 'laser', 'mousetrap'] as const;
export type PickupKind = typeof PICKUP_KINDS[number];
export const isPickupKind = (value: unknown): value is PickupKind =>
    typeof value === 'string' && (PICKUP_KINDS as readonly string[]).includes(value);
/** Special weapons. A rat holds at most one: a new claim replaces it, death and the round's reset clear it. While
 * held it replaces the incident's shot pattern (the Excessive Force carrier's damage multiplier still applies). */
export const WEAPON_KINDS = ['tommy-gun', 'laser', 'mousetrap'] as const;
export type WeaponKind = typeof WEAPON_KINDS[number];
export const isWeaponKind = (value: unknown): value is WeaponKind =>
    typeof value === 'string' && (WEAPON_KINDS as readonly string[]).includes(value);
/** Every supply site but a Quick Fix one holds a random pickup of these, rolled at the start, at every round and again
 * at every claim, so the restock dial shows what comes next (Tyler, 3 October, protocol 32: "whatever pickup that
 * spawns is always random", the heal excepted). Quick Fix sites stay Quick Fix. */
export const RANDOM_SITE_KINDS: readonly PickupKind[] = PICKUP_KINDS.filter(kind => kind !== 'quick-fix');
export const randomSiteKind = (random: () => number = Math.random): PickupKind =>
    RANDOM_SITE_KINDS[Math.floor(random() * RANDOM_SITE_KINDS.length)]!;

/** Release tuning; subjective pickup feel still benefits from human playtests. */
export const PICKUP_TUNING = {
    /** Close reach for supply props; the larger genuine case has its own forgiving reach. */
    claimRadius: 1.5,
    /** A claimed site returns after this long, keeping the route choice alive all match. */
    respawnMs: 45_000,
    /** Reflection coat: long enough to cross a street under fire, short enough to track (8 s: Tyler, 2 October, protocol 31). */
    ironcladMs: 8_000,
    /** Speed: a burst, not a new base movement state. */
    hustleMs: 10_000,
    /** Clearly noticeable without breaking the established camera and steering. */
    hustleMultiplier: 1.45,
    /** Stakeout: the Hunch city-wide at any health, long enough to pick a target and get there. */
    stakeoutMs: 12_000,
    /** Tommy Gun and Laser are on a timer, never a magazine: shooting is always rewarded. The Mousetrap has none: it is held until set down.
     * The Tommy Gun lasts 12 s (Tyler, 2 October, protocol 31). */
    tommyMs: 12_000,
    laserMs: 15_000,
} as const;
/** The special weapons' rules, the same for every rat, human or bot. */
export const WEAPON_TUNING = {
    /** Tommy Gun: held fire repeats every `tommyIntervalMs`, 20 balls a second (Tyler, 2 October, protocol 31: holding it
     * must beat clicking the plain gun's 12), admitted under `TOMMY_SHOOT_RATE`. Each ball leaves within a cone whose
     * half-angle (radians) grows from `tommyCone` to `tommyBloom` over `tommyBloomShots` held shots; a shot within
     * `tommyHeatMs` of the rat's previous one counts as held. Plain balls, one damage each, headshots kill. */
    tommyIntervalMs: 50, tommyCone: .035, tommyBloom: .11, tommyBloomShots: 10, tommyHeatMs: 350,
    /** Laser: an instant beam fired like the cheese gun (one click a shot, only under `SHOOT_RATE`). It deals
     * `laserDamage` (headshots kill), reflects off walls and Ironclad coats up to `laserBounces` times within
     * `laserRange` units in all, `laserRadius` thick. Others draw it from the snapshot for `laserBeamMs`. */
    laserDamage: 1, laserBounces: 2, laserRange: 180, laserRadius: .12, laserBeamMs: 600,
    /** Mousetrap: set down `trapReach` ahead of the rat on a supported floor with `trapRadius` clear around it (the
     * board's half-length as drawn: the model scales with it). Any other rat whose feet come within `trapRadius` +
     * `trapFoot` (and `trapHeight` above or below) is snapped and held in place for `trapHoldMs` (`PlayerBuffs.trappedUntil`:
     * it can still turn and shoot, not move or jump; no damage, no kill; Ironclad does not help). The trap stays shut
     * while it holds, re-arms `trapRearmMs` after letting go, and never snaps the rat it just let go until that rat has
     * stepped clear. `trapHp` ball hits destroy it (a laser hit counts `laserTrapHits`) and free whoever it holds; a
     * broken trap stays in the snapshot `trapBrokenMs` so clients can play the break. One per rat; it outlives its
     * owner's death, not the round. A rat that gets one cannot set it down (nor fire) for `trapLockMs`
     * (`PlayerBuffs.weaponReadyAt`) while the gun goes away and the trap comes up. */
    trapReach: 2.9, trapRadius: 1.5, trapFoot: .35, trapHeight: 1.2, trapHp: 8, laserTrapHits: 3, trapHoldMs: 3000, trapRearmMs: 900, trapBrokenMs: 700, trapLockMs: 1000,
} as const;
/** The placed Mousetrap's size: the model's board (1.5 wide, 2.5 long) scaled so its half-length is `trapRadius`, and
 * a little taller again. The drawn trap and its shootable block share it, so what you see is what snaps and stops balls. */
export const TRAP_SCALE = WEAPON_TUNING.trapRadius / 1.25, TRAP_TALL = TRAP_SCALE * 1.15;
/** Timed supplies (Quick Fix is instant, weapons have their own slot), and the buff field and duration each one sets. */
export const TIMED_PICKUPS = ['ironclad', 'hustle', 'stakeout'] as const;
export type TimedPickup = typeof TIMED_PICKUPS[number];
export const BUFF_FIELD = { ironclad: 'ironcladUntil', hustle: 'hustleUntil', stakeout: 'stakeoutUntil' } as const satisfies Record<TimedPickup, keyof PlayerBuffs>;
export const BUFF_MS: Record<TimedPickup, number> = { ironclad: PICKUP_TUNING.ironcladMs, hustle: PICKUP_TUNING.hustleMs, stakeout: PICKUP_TUNING.stakeoutMs };
export const BUFF_FIELDS: readonly (keyof PlayerBuffs)[] = TIMED_PICKUPS.map(kind => BUFF_FIELD[kind]);
export const isTimedPickup = (kind: PickupKind): kind is TimedPickup => (TIMED_PICKUPS as readonly string[]).includes(kind);
/** A weapon's timer; the Mousetrap has none. */
export const WEAPON_MS: Readonly<Partial<Record<WeaponKind, number>>> = { 'tommy-gun': PICKUP_TUNING.tommyMs, laser: PICKUP_TUNING.laserMs };

export interface PickupCopy { title: string; effect: string; flavor: string }
export const PICKUP_COPY: Record<PickupKind, PickupCopy> = {
    ironclad: { title: 'IRONCLAD ALIBI', effect: 'Reflects cheese balls', flavor: 'Nothing sticks.' },
    hustle: { title: 'HOT PURSUIT', effect: 'Temporary speed boost', flavor: 'Move it, detective.' },
    'quick-fix': { title: 'QUICK FIX', effect: 'Full health', flavor: 'Fit for duty. Allegedly.' },
    stakeout: { title: 'STAKEOUT', effect: 'See every rat in the city through walls', flavor: 'Eyes on the whole town.' },
    'tommy-gun': { title: 'TOMMY GUN', effect: 'Hold fire to spray cheese', flavor: 'The Chicago typewriter.' },
    laser: { title: 'LASER', effect: 'Instant beam · bounces off walls', flavor: 'Science, detective.' },
    mousetrap: { title: 'MOUSETRAP', effect: 'Fire to set it down · it holds any rat that steps on it', flavor: 'Bait not included.' },
};

/** Authored floor heights keep rewards on their intended routes. Every site has a
 * reason (layout 4, from layout 3's recorded play): Ironclad stands in the fight on
 * each landmark's ground floor, never upstairs, where nobody went for it; Hot Pursuit
 * waits where long runs start; Quick Fix hides just off the fight lines, within about
 * four seconds' run of every place where rats die most. Stakeout (layout 5) stands on a
 * four-way crossroads in each corner of the city: see everyone, pick a target, go. The
 * weapons (layout 6) stand in the fights that layout 5's play found: the Tommy Gun and the
 * Laser in the deadliest open streets (the Laser between walls to bank off), the Mousetrap
 * where rats must come back: beside the case's home and on the way into the south lot. */
export interface PickupAnchor { id: string; kind: PickupKind; x: number; z: number; y?:number; near: string }
export const PICKUP_ANCHORS: readonly PickupAnchor[] = [
    {id:'alibi-records-forecourt',kind:'ironclad',x:8,z:-12,y:.7,near:'Street in front of Records Hall, east of the forecourt'},
    {id:'alibi-icebox-floor',kind:'ironclad',x:116,z:-76,y:.7,near:'Icebox ground floor, the west aisle under the catwalk'},
    {id:'alibi-pump-floor',kind:'ironclad',x:142,z:128,y:.7,near:'Pumping Station ground floor, the east aisle'},
    {id:'alibi-needleworks-floor',kind:'ironclad',x:-82,z:72,y:.7,near:'Needleworks ground floor, inside the east door'},
    {id:'pursuit-gate-mouth',kind:'hustle',x:-148,z:0,y:.7,near:'Gate sewer entrance, before the long tunnel east'},
    {id:'pursuit-icebox-mouth',kind:'hustle',x:148,z:0,y:.7,near:'Icebox sewer entrance, before the long tunnel west'},
    ...DOCKS_JOBS.pickups,
    {id:'pursuit-south-avenue',kind:'hustle',x:-150,z:130,y:.7,near:'West end of the south avenue, a straight sprint east'},
    {id:'fix-crossroads-west',kind:'quick-fix',x:-25.5,z:10,y:.7,near:'Alley between the central blocks, west of the crossroads'},
    {id:'fix-crossroads-east',kind:'quick-fix',x:11.5,z:10,y:.7,near:'Alley between the central blocks, east of the crossroads'},
    {id:'fix-south-central',kind:'quick-fix',x:-17,z:58,y:.7,near:'Alley between the south-central blocks'},
    {id:'fix-icebox-alley',kind:'quick-fix',x:124,z:22,y:.7,near:'Alley between the shops south of the Icebox forecourt'},
    {id:'fix-gate-lane',kind:'quick-fix',x:-100,z:-45,y:.7,near:'Service lane between Records Hall and the Gate'},
    {id:'fix-records-corner',kind:'quick-fix',x:-44,z:-42,y:.7,near:'Records Hall ground floor, the south-west corner'},
    {id:'fix-gate-alley',kind:'quick-fix',x:-148,z:26,y:.7,near:'Alley south of the Gate'},
    {id:'fix-needleworks-corner',kind:'quick-fix',x:-137,z:103,y:.7,near:'Needleworks ground floor, the south-west corner'},
    {id:'fix-south-lot',kind:'quick-fix',x:-53,z:102,y:.7,near:'Against the block across the avenue from Needleworks'},
    {id:'fix-icebox-corner',kind:'quick-fix',x:110,z:-37,y:.7,near:'Icebox ground floor, the south-west corner'},
    {id:'fix-pump-north',kind:'quick-fix',x:108,z:96,y:.7,near:'Against the Pumping Station\'s north wall'},
    ...PRECINCT_JOBS.supplies,
    {id:'stakeout-precinct-corner',kind:'stakeout',x:-54,z:-104,y:.7,near:'Crossroads of the x -60 avenue and the -102 street, between the precinct and the container yard'},
    {id:'stakeout-pier9-corner',kind:'stakeout',x:68,z:-104,y:.7,near:'Crossroads of the x 70 avenue and the -102 street, between the container yard and Pier 9'},
    {id:'stakeout-east-crossing',kind:'stakeout',x:92,z:44,y:.7,near:'Crossroads of the x 90 street and the 40 street, south of the Icebox shops'},
    {id:'stakeout-south-avenue',kind:'stakeout',x:-64,z:140,y:.7,near:'Crossroads of the x -60 avenue and the 145 street, south of the south crossing'},
    {id:'tommy-x70-north',kind:'tommy-gun',x:70,z:-36,y:.7,near:'The x 70 avenue north of the -18 street, the north-east street fight'},
    {id:'tommy-m18-west',kind:'tommy-gun',x:-88,z:-18,y:.7,near:'The -18 street west of the x -60 avenue, the west street fight'},
    {id:'laser-m60-needleworks',kind:'laser',x:-60,z:72,y:.7,near:'The x -60 avenue beside Needleworks, a long straight to bank shots along'},
    {id:'laser-28-west',kind:'laser',x:-88,z:28,y:.7,near:'The 28 street west of the x -60 avenue, walls on both sides for ricochets'},
    {id:'trap-case-home',kind:'mousetrap',x:-16,z:-16,y:.7,near:'The -18 street in front of the Records forecourt, on the way to the case\'s home'},
    {id:'trap-south-lot',kind:'mousetrap',x:3,z:72,y:.7,near:'The south lot, the city\'s second-deadliest place, on the way in'},
];

/** Active effects on one rat. Absent keys mean no effect. `weapon` is the one special weapon held, until
 * `weaponUntil` (absent for the Mousetrap, held until set down). A Mousetrap just taken cannot be set down before
 * `weaponReadyAt` (`WEAPON_TUNING.trapLockMs`). `faulty` is a Code Violation dud running until `faultyUntil`.
 * `trappedUntil`: another rat's Mousetrap holds this one in place until then (`WEAPON_TUNING.trapHoldMs`). */
export interface PlayerBuffs { ironcladUntil?: number; hustleUntil?: number; stakeoutUntil?: number; weapon?: WeaponKind; weaponUntil?: number; weaponReadyAt?: number; faulty?: FaultyKind; faultyUntil?: number; trappedUntil?: number }
export type BuffMap = Record<string, PlayerBuffs>;

/** All sites remain advertised while empty; the authority supplies their restock deadline. */
export interface PickupState { id: string; kind: PickupKind; x: number; y: number; z: number; availableAt?: number }

/** The weapon an effects entry still holds at `now`. */
export const entryWeapon = (entry: PlayerBuffs | undefined, now: number): WeaponKind | undefined =>
    entry?.weapon && (entry.weapon === 'mousetrap' || (entry.weaponUntil ?? 0) > now) ? entry.weapon : undefined;
export const heldWeapon = (buffs: BuffMap | undefined, id: string, now: number): WeaponKind | undefined => entryWeapon(buffs?.[id], now);
export const activeBuffs = (buffs: BuffMap | undefined, id: string, now: number): PlayerBuffs => {
    const entry = buffs?.[id], active: PlayerBuffs = {};
    if (!entry) return active;
    for (const kind of TIMED_PICKUPS) { const until = entry[BUFF_FIELD[kind]]; if (until !== undefined && until > now) active[BUFF_FIELD[kind]] = until; }
    const weapon = entryWeapon(entry, now);
    if (weapon) {
        active.weapon = weapon; if (entry.weaponUntil !== undefined) active.weaponUntil = entry.weaponUntil;
        if (entry.weaponReadyAt !== undefined && entry.weaponReadyAt > now) active.weaponReadyAt = entry.weaponReadyAt;
    }
    const faulty = entryFaulty(entry, now);
    if (faulty) { active.faulty = faulty; active.faultyUntil = entry.faultyUntil; }
    if ((entry.trappedUntil ?? 0) > now) active.trappedUntil = entry.trappedUntil;
    return active;
};
export const hasIronclad = (buffs: BuffMap | undefined, id: string, now: number): boolean =>
    (buffs?.[id]?.ironcladUntil ?? 0) > now;
export const hasHustle = (buffs: BuffMap | undefined, id: string, now: number): boolean =>
    (buffs?.[id]?.hustleUntil ?? 0) > now;
export const hasStakeout = (buffs: BuffMap | undefined, id: string, now: number): boolean =>
    (buffs?.[id]?.stakeoutUntil ?? 0) > now;

/** Whether a held weapon is still being taken up (a Mousetrap's `trapLockMs`): no shot and no set-down yet. */
export const weaponArming = (entry: PlayerBuffs | undefined, now: number): boolean =>
    !!entryWeapon(entry, now) && (entry?.weaponReadyAt ?? -Infinity) > now;

/** Code Violation (Tyler, 1 October: "no one should die from code violation … but let's give negative effects"): a
 * supply claimed while it runs comes out faulty, a short, harmless bad version that never kills and never stalls the
 * game. Quick Fix is never faulty ("health packs are too important"). A rat has at most one dud at a time; a new one
 * replaces it, and death or the round's reset clears it. The same for every rat, human or bot. */
export const FAULTY_KINDS = ['hustle', 'ironclad', 'stakeout', 'tommy-gun', 'laser', 'mousetrap'] as const;
export type FaultyKind = typeof FAULTY_KINDS[number];
export const isFaultyKind = (value: unknown): value is FaultyKind =>
    typeof value === 'string' && (FAULTY_KINDS as readonly string[]).includes(value);
/** How long each dud lasts (Backfire's is its soot: the throw itself is instant). */
export const FAULTY_MS: Record<FaultyKind, number> = { hustle: 6_000, ironclad: 6_000, stakeout: 8_000, 'tommy-gun': 4_000, laser: 3_000, mousetrap: 2_000 };
/** Cold Feet: legs at `coldFeet` of a run. Backfire: the gun blows up in the paws, throwing the rat `backfireShove` u/s
 * backwards and `backfireLift` up, only along a line whose landing is safe. */
export const FAULTY_TUNING = { coldFeet: .55, backfireShove: 20, backfireLift: 10 } as const;
/** Each dud's name and what it does, in plain words (cards, the city-wide notice, bots' perception). */
export const FAULTY_COPY: Record<FaultyKind, { title: string; effect: string }> = {
    hustle: { title: 'COLD FEET', effect: 'slowed down' },
    ironclad: { title: 'RUST BUCKET', effect: 'rusted stiff: no jumping' },
    stakeout: { title: 'STAKED OUT', effect: 'every rat sees them through walls' },
    'tommy-gun': { title: 'BACKFIRE', effect: 'the gun blew up in their paws' },
    laser: { title: 'SHORT CIRCUIT', effect: 'gun shorted out: no firing' },
    mousetrap: { title: 'SNAPPED PAW', effect: 'caught in their own trap: stuck in place' },
};
/** The dud an effects entry still runs at `now`. */
export const entryFaulty = (entry: PlayerBuffs | undefined, now: number): FaultyKind | undefined =>
    entry?.faulty && (entry.faultyUntil ?? 0) > now ? entry.faulty : undefined;
export const faultyOf = (buffs: BuffMap | undefined, id: string, now: number): FaultyKind | undefined => entryFaulty(buffs?.[id], now);
/** Another rat's Mousetrap holds this one in place (`trapHoldMs`). */
export const trapped = (buffs: BuffMap | undefined, id: string, now: number): boolean => (buffs?.[id]?.trappedUntil ?? 0) > now;
/** How fast a rat's legs carry it: a Mousetrap's hold and Snapped Paw pin it, Cold Feet slows it, Hot Pursuit speeds it up. */
export function legScale(buffs: BuffMap | undefined, id: string, now: number): number {
    const faulty = faultyOf(buffs, id, now);
    return faulty === 'mousetrap' || trapped(buffs, id, now) ? 0 : faulty === 'hustle' ? FAULTY_TUNING.coldFeet : hasHustle(buffs, id, now) ? PICKUP_TUNING.hustleMultiplier : 1;
}
/** Rust Bucket, Snapped Paw and a Mousetrap's hold: the rat cannot jump. */
export const jumpBlocked = (buffs: BuffMap | undefined, id: string, now: number): boolean => {
    const faulty = faultyOf(buffs, id, now);
    return faulty === 'ironclad' || faulty === 'mousetrap' || trapped(buffs, id, now);
};
/** Short Circuit: the rat's gun does not fire. */
export const shortedOut = (buffs: BuffMap | undefined, id: string, now: number): boolean => faultyOf(buffs, id, now) === 'laser';
/** Staked Out: every rat sees this one through walls, city-wide. */
export const stakedOut = (buffs: BuffMap | undefined, id: string, now: number): boolean => faultyOf(buffs, id, now) === 'stakeout';
/** A faulty claim: the dud replaces any running dud; the rat's real effects are untouched. */
export const mergeFaulty = (existing: PlayerBuffs | undefined, kind: FaultyKind, now: number): PlayerBuffs =>
    ({ ...existing, faulty: kind, faultyUntil: now + FAULTY_MS[kind] });

/** True when the entry has fallen out of every effect and can be pruned. */
export const buffExpired = (entry: PlayerBuffs | undefined, now: number): boolean =>
    !entry || TIMED_PICKUPS.every(kind => (entry[BUFF_FIELD[kind]] ?? 0) <= now) && !entryWeapon(entry, now) && !entryFaulty(entry, now) && (entry.trappedUntil ?? 0) <= now;

/** Merge a fresh claim into a rat's existing effects. Re-collecting the same
 * benefit refreshes to the full duration; it never stacks or accumulates.
 * A weapon replaces whichever weapon the rat held. Taking up a Mousetrap (not
 * already in paw) locks the trigger for `trapLockMs`. */
export function mergePickup(
    existing: PlayerBuffs | undefined,
    pickup: PickupKind,
    now: number,
): PlayerBuffs {
    const next: PlayerBuffs = { ...existing };
    if (isTimedPickup(pickup)) next[BUFF_FIELD[pickup]] = now + BUFF_MS[pickup];
    else if (isWeaponKind(pickup)) {
        const ms = WEAPON_MS[pickup];
        if (pickup !== 'mousetrap') delete next.weaponReadyAt;
        else if (entryWeapon(existing, now) !== 'mousetrap') next.weaponReadyAt = now + WEAPON_TUNING.trapLockMs;
        next.weapon = pickup;
        if (ms === undefined) delete next.weaponUntil; else next.weaponUntil = now + ms;
    }
    return next;
}
/** When a claimed effect ends (undefined: instant, or held until used). */
export const pickupEffectUntil = (entry: PlayerBuffs | undefined, kind: PickupKind): number | undefined =>
    isTimedPickup(kind) ? entry?.[BUFF_FIELD[kind]] : isWeaponKind(kind) && entry?.weapon === kind ? entry.weaponUntil : undefined;

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
