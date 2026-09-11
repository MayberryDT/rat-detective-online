import type { Vec3Data } from './networkProtocol';

/** The three approved pickups. Kept literal so snapshot validation can share it. */
export const PICKUP_KINDS = ['ironclad', 'hustle', 'quick-fix'] as const;
export type PickupKind = typeof PICKUP_KINDS[number];
export const isPickupKind = (value: unknown): value is PickupKind =>
    typeof value === 'string' && (PICKUP_KINDS as readonly string[]).includes(value);

/** Release tuning; subjective pickup feel still benefits from human playtests. */
export const PICKUP_TUNING = {
    /** Match the established case pickup reach so a reachable item reads the same. */
    claimRadius: 1.5,
    /** A claimed site returns after this long, keeping the route choice alive all match. */
    respawnMs: 20_000,
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

/** Authored placement intent. Each anchor is snapped at room start to the nearest
 * verified-clear street point, so a seeded city can never bury a pickup in a wall. */
export interface PickupAnchor { id: string; kind: PickupKind; x: number; z: number; near: string }
export const PICKUP_ANCHORS: readonly PickupAnchor[] = [
    { id: 'alibi-civic', kind: 'ironclad', x: -16, z: -18, near: 'Records avenue' },
    { id: 'alibi-icebox', kind: 'ironclad', x: 130, z: -18, near: 'Icebox forecourt' },
    { id: 'pursuit-needleworks', kind: 'hustle', x: -105, z: 130, near: 'Needleworks approach' },
    { id: 'pursuit-pump', kind: 'hustle', x: 118, z: 95, near: 'Pump Station lane' },
    { id: 'fix-sluice', kind: 'quick-fix', x: -175, z: 0, near: 'West sluice avenue' },
    { id: 'fix-midtown', kind: 'quick-fix', x: 70, z: 60, near: 'Midtown south lane' },
];

/** Active timed effects on one rat. Absent keys mean no effect. */
export interface PlayerBuffs { ironcladUntil?: number; hustleUntil?: number }
export type BuffMap = Record<string, PlayerBuffs>;

/** A pickup ready to be claimed right now; claimed sites are absent from the snapshot. */
export interface PickupState { id: string; kind: PickupKind; x: number; y: number; z: number }

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

/** Snap each anchor to a nearby street-level point that the world already knows is
 * clear of buildings, launcher pads and ramp wells. Anchors without a close clear
 * point are dropped and reported rather than forced into geometry. */
export function resolvePickupPoints(clear: readonly Vec3Data[], maxSnap = 14): PickupPoint[] {
    const taken = new Set<string>();
    const points: PickupPoint[] = [];
    for (const anchor of PICKUP_ANCHORS) {
        let best: Vec3Data | undefined, bestDistance = maxSnap;
        for (const point of clear) {
            const key = `${point.x},${point.z}`;
            if (taken.has(key)) continue;
            // Street-level only: pickups never spawn inside the sewer network.
            if (point.y < -1) continue;
            const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z);
            if (distance < bestDistance) { best = point; bestDistance = distance; }
        }
        if (!best) continue;
        taken.add(`${best.x},${best.z}`);
        points.push({ id: anchor.id, kind: anchor.kind, p: { x: best.x, y: .7, z: best.z } });
    }
    return points;
}
