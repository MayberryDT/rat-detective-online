import type { ServerMessage } from '../shared/networkProtocol';

/** Wire precision and visual fields only: keep authority provenance and full
 * precision in persisted snapshots without spending per-ball network bytes. */
export function serializeServerMessage(message: ServerMessage): string {
    if (message.type !== 'chaos') return JSON.stringify(message);
    return JSON.stringify(message, (key, value) =>
        key === 'explosive' ? undefined : typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);
}
