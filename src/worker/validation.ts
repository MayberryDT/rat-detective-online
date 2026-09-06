import type { Vec3Data } from '../shared/networkProtocol';

export { parseClientMessage } from '../shared/messageValidation';

export const MOVEMENT_RATE = { limit: 30, windowMs: 1_000 };
export const SHOOT_RATE = { limit: 12, windowMs: 1_000 };
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

const SHOT_ORIGIN_MAX_DISTANCE = 12;
const SHOT_DIRECTION_MIN = 0.05;
const SHOT_DIRECTION_MAX = 8;

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  clear(keyPrefix: string): void {
    for (const key of this.buckets.keys()) {
      if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
        this.buckets.delete(key);
      }
    }
  }
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
