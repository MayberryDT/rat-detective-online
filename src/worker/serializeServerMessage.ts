import type { ServerMessage } from '../shared/networkProtocol';

/** Wire precision only: keep simulation and persisted snapshots untouched. */
export function serializeServerMessage(message: ServerMessage): string {
    if (message.type !== 'chaos') return JSON.stringify(message);
    return JSON.stringify(message, (_key, value) =>
        typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);
}
