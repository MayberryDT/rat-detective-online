import { resolveWebSocketUrl } from '../network/NetworkManager';
import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import { isSupportedWorldVersion, type WorldSpec } from '../shared/worldSpec';

/** Prepare the canonical city's real geometry before Enter City. This HTTP
 * request warms the room without opening a socket, reserving a slot or adding
 * a player. A later welcome remains authoritative, including overflow rooms. */
export async function loadTitleWorld(signal?: AbortSignal, socketUrl = resolveWebSocketUrl()): Promise<WorldSpec | undefined> {
    const url = new URL(socketUrl);
    const room=url.searchParams.get('room')||DEFAULT_ROOM_NAME;
    if(room!==DEFAULT_ROOM_NAME&&!/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(room))return;
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/status'; url.search = ''; url.hash = '';
    if(room!==DEFAULT_ROOM_NAME)url.searchParams.set('room',room);
    const request = new AbortController();
    const abort = () => request.abort();
    if (signal?.aborted) return;
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 1500);
    try {
        const response = await fetch(url, { signal: request.signal, cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!data || typeof data !== 'object' || !('room' in data) || data.room !== room || !('world' in data)) return;
        const world = data.world;
        if (!world || typeof world !== 'object' || !('seed' in world) || !('version' in world)) return;
        const { seed, version } = world;
        if (typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff && typeof version === 'number' && isSupportedWorldVersion(version)) {
            return { seed, version };
        }
    } catch { /* Old servers, private relays and offline starts keep the normal join path. */ }
    finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
