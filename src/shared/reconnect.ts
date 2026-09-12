/** A short transport outage reserves the existing rat, never a replacement. */
export const RECONNECT_GRACE_MS = 30_000;
export const SESSION_REPLACED_CLOSE_CODE = 4001;
export function isResumeToken(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
}
