/** Shared admission ceiling; neither input device changes the server's rate. */
export const SHOOT_RATE = { limit: 12, windowMs: 1_000 };
// Pace held touch fire rather than producing catch-up bursts after a slow frame.
export const TOUCH_SHOT_INTERVAL_MS = Math.ceil(SHOOT_RATE.windowMs / SHOOT_RATE.limit) + 1;
