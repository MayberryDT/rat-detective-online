import { CHAOS_TUNING, type CaseState } from './chaosState';
import type { Vec3Data } from './networkProtocol';

/** The hot case's heartbeat (Tyler, 2 October). One clock ties the case, its carrier and the ping together: every
 * ping is a beat. Others see the carrier and case flash red through walls at each ping (`flashMs` full, then fading
 * over `fadeMs`), and nothing between pings unless in sight. The carrier's own look and HUD beat on the same clock. */
export const HEARTBEAT = { flashMs: 400, fadeMs: 900, punchMs: 260 } as const;

/** Milliseconds since the carried case last pinged (Infinity when loose or not yet pinged). */
export function sincePing(c: CaseState, now: number): number {
    return c.owner && c.ping ? Math.max(0, now - c.ping.at) : Infinity;
}
/** The ping flash's strength at `now`: 1 for `flashMs`, then easing to 0 over `fadeMs`. */
export function pingFlash(c: CaseState, now: number): number {
    const t = sincePing(c, now);
    if (t <= HEARTBEAT.flashMs) return 1;
    const k = 1 - (t - HEARTBEAT.flashMs) / HEARTBEAT.fadeMs;
    return k > 0 ? k * k : 0;
}
/** The ping's snap: 1 at the ping, easing to 0 over `punchMs` (the flash lands big, then settles). */
export function pingPunch(c: CaseState, now: number): number {
    const k = 1 - sincePing(c, now) / HEARTBEAT.punchMs;
    return k > 0 ? k * k : 0;
}
/** Fraction of the way to the next ping (0 at a ping, approaching 1 just before the next); 0 when not carried. */
export function beatPhase(c: CaseState, now: number): number {
    const t = sincePing(c, now);
    return t === Infinity ? 0 : (t % CHAOS_TUNING.casePingMs) / CHAOS_TUNING.casePingMs;
}
/** Only one's own case is known from this state alone. Other knowledge must come from direct sight. */
export function caseLastSeen(c: CaseState, viewerId: string | null): Vec3Data | null {
    return c.owner !== null && c.owner === viewerId ? c.p : null;
}
