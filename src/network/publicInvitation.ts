import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';

const PUBLIC_OVERFLOW_ROOM = /^public-live-v2-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Public invitations can select only the canonical room or an overflow room
 * that the matchmaker itself created. Private room names are never accepted. */
export function isPublicRoomName(value: unknown): value is string {
    return value === DEFAULT_ROOM_NAME || typeof value === 'string' && PUBLIC_OVERFLOW_ROOM.test(value);
}

export interface PublicInvitation {
    requestedRoom?: string;
    invalid: boolean;
}

/** Read an invitation from the page URL. Presence is retained when invalid so
 * the title can explain that normal public matchmaking will be used. */
export function readPublicInvitation(search: string): PublicInvitation {
    const params = new URLSearchParams(search);
    if (!params.has('preferred')) return { invalid: false };
    const preferred = params.get('preferred');
    return isPublicRoomName(preferred)
        ? { requestedRoom: preferred, invalid: false }
        : { invalid: true };
}

export function publicInvitationUrl(room: string): string | undefined {
    if (!isPublicRoomName(room)) return;
    const url = new URL('https://ratdetective.online/');
    url.searchParams.set('preferred', room);
    return url.toString();
}

export function publicRoomLabel(room: string): string {
    if (room === DEFAULT_ROOM_NAME) return 'Public city';
    const id = PUBLIC_OVERFLOW_ROOM.test(room) ? room.slice(DEFAULT_ROOM_NAME.length + 1, DEFAULT_ROOM_NAME.length + 9) : '';
    return id ? `City ${id.toUpperCase()}` : 'Public city';
}

/** Once admission succeeds, a reload is an ordinary Return and may use the
 * newly issued tab-local resume credential. Preserve every unrelated URL part. */
export function consumePublicInvitation(target: Pick<Window, 'location' | 'history'>): void {
    const url = new URL(target.location.href);
    if (!url.searchParams.has('preferred')) return;
    url.searchParams.delete('preferred');
    target.history.replaceState(target.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Resume room preferences must remain inside their original admission pool. */
export function isRoomInPool(room: unknown, pool: string): room is string {
    if (typeof room !== 'string') return false;
    if (pool === DEFAULT_ROOM_NAME) return isPublicRoomName(room);
    return room === pool || room.startsWith(`${pool}-`) && /^[a-z0-9-]{1,160}$/.test(room);
}
