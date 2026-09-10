/** Shared admission ceiling; neither input device changes the server's rate. */
export const SHOOT_RATE = { limit: 12, windowMs: 1_000 };
// Bound rapid taps without queuing a delayed shot. Holding never repeats fire.
export const TOUCH_SHOT_INTERVAL_MS = Math.ceil(SHOOT_RATE.windowMs / SHOOT_RATE.limit) + 1;
