import type { Vec3Data } from '../shared/networkProtocol';

export { parseClientMessage } from '../shared/messageValidation';

export const MOVEMENT_RATE = { limit: 30, windowMs: 1_000 };
export { SHOOT_RATE } from '../shared/shotTiming';
export const HIT_RATE = { limit: 12, windowMs: 1_000 };
export const PING_RATE = { limit: 4, windowMs: 1_000 };
export const JOIN_RATE = { limit: 3, windowMs: 10_000 };

/**
 * Far envelope only. Local physics is unbounded; a rat walking at speed 18
 * reaches 400 units in ~22s, so this must not reject ordinary city motion.
 * Crossing the envelope is clamped and echoed as playerCorrected.
 */
export const PLAY_BOUNDS = {
  xz: 2_000,
  yMin: -8,
  yMax: 250,
} as const;

/** Generous authority envelope around the shipped 18 u/s movement, 1.45x Hot
 * Pursuit and 90 u/s vertical launch. Server time, not client timestamps, owns
 * the allowance; a long-suspended tab cannot spend an unlimited backlog. */
export const MOVEMENT_ENVELOPE = {
  maxElapsedMs: 2_000,
  horizontalSpeed: 35,
  verticalSpeed: 110,
  // Starting tolerance, not a fresh grant on every packet. Unused server-time
  // allowance is retained so batched poses share the time they actually earned.
  horizontalSlack: 2,
  verticalSlack: 6,
} as const;

const SHOT_ORIGIN_MAX_DISTANCE = 12;
const SHOT_DIRECTION_MIN = 0.05;
const SHOT_DIRECTION_MAX = 8;

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly namespaces = new Map<string, Set<string>>();

  allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      const namespace = key.split(':', 1)[0];
      let keys = this.namespaces.get(namespace);
      if (!keys) this.namespaces.set(namespace, keys = new Set());
      keys.add(key);
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  clear(keyPrefix: string): void {
    for (const key of this.namespaces.get(keyPrefix) ?? []) this.buckets.delete(key);
    this.namespaces.delete(keyPrefix);
  }
  get size(): number { return this.buckets.size; }
}

export function isPlausiblePosition(position: Vec3Data): boolean {
  return (
    Math.abs(position.x) <= PLAY_BOUNDS.xz &&
    Math.abs(position.z) <= PLAY_BOUNDS.xz &&
    position.y >= PLAY_BOUNDS.yMin &&
    position.y <= PLAY_BOUNDS.yMax
  );
}

export function clampPosition(position: Vec3Data): { position: Vec3Data; corrected: boolean } {
  const x = Math.max(-PLAY_BOUNDS.xz, Math.min(PLAY_BOUNDS.xz, position.x));
  const y = Math.max(PLAY_BOUNDS.yMin, Math.min(PLAY_BOUNDS.yMax, position.y));
  const z = Math.max(-PLAY_BOUNDS.xz, Math.min(PLAY_BOUNDS.xz, position.z));
  return {
    position: { x, y, z },
    corrected: x !== position.x || y !== position.y || z !== position.z,
  };
}

export interface MovementAllowance { at:number; horizontal:number; vertical:number }

export function createMovementAllowance(at:number):MovementAllowance {
  return {at,horizontal:MOVEMENT_ENVELOPE.horizontalSlack,vertical:MOVEMENT_ENVELOPE.verticalSlack};
}

/** A bounded server-time budget, shared by movement, firing and pickup poses.
 * Arrival gaps do not describe simulation steps: a delayed group must be able
 * to spend its accumulated time across every pose, not just its first packet. */
export function consumeMovementAllowance(budget:MovementAllowance,from:Vec3Data,to:Vec3Data,at:number):boolean {
  const seconds=Math.max(0,at-budget.at)/1000;
  const capacity= MOVEMENT_ENVELOPE.maxElapsedMs/1000;
  budget.at=Math.max(budget.at,at);
  budget.horizontal=Math.min(MOVEMENT_ENVELOPE.horizontalSlack+MOVEMENT_ENVELOPE.horizontalSpeed*capacity,
    budget.horizontal+MOVEMENT_ENVELOPE.horizontalSpeed*seconds);
  budget.vertical=Math.min(MOVEMENT_ENVELOPE.verticalSlack+MOVEMENT_ENVELOPE.verticalSpeed*capacity,
    budget.vertical+MOVEMENT_ENVELOPE.verticalSpeed*seconds);
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  const vertical = Math.abs(to.y - from.y);
  if(horizontal>budget.horizontal||vertical>budget.vertical||!Number.isFinite(horizontal+vertical))return false;
  budget.horizontal-=horizontal;budget.vertical-=vertical;
  return true;
}

export function isPlausibleShot(origin: Vec3Data, direction: Vec3Data, player: Vec3Data): boolean {
  if (!isPlausiblePosition(origin)) return false;
  const dx = origin.x - player.x;
  const dy = origin.y - player.y;
  const dz = origin.z - player.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance > SHOT_ORIGIN_MAX_DISTANCE) return false;
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  return magnitude >= SHOT_DIRECTION_MIN && magnitude <= SHOT_DIRECTION_MAX;
}
