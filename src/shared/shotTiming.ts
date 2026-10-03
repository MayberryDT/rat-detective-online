import {WEAPON_TUNING, type WeaponKind} from './pickups';

/** Shared admission ceiling; neither input device changes the server's rate. */
export const SHOOT_RATE = { limit: 12, windowMs: 1_000 };
/** A held Tommy Gun's ceiling instead (Tyler, 2 October, protocol 31: holding it must beat clicking): its 20 balls a
 * second (`WEAPON_TUNING.tommyIntervalMs`) and two more for frame and network jitter in the fixed window. Every
 * other gun stays under `SHOOT_RATE`. The same for every rat, human or bot. */
export const TOMMY_SHOOT_RATE = { limit: Math.ceil(SHOOT_RATE.windowMs / WEAPON_TUNING.tommyIntervalMs) + 2, windowMs: SHOOT_RATE.windowMs };
export const shootRate = (weapon?: WeaponKind): { limit: number; windowMs: number } => weapon === 'tommy-gun' ? TOMMY_SHOOT_RATE : SHOOT_RATE;
// Bound rapid taps without queuing a delayed shot. Holding repeats fire only with the Tommy Gun.
export const TOUCH_SHOT_INTERVAL_MS = Math.ceil(SHOOT_RATE.windowMs / SHOOT_RATE.limit) + 1;
