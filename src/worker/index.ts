import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import { log } from './logging';

export { GameRoom } from './GameRoom';

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === 'rat-detective.animasai.co') {
      url.protocol = 'https:';
      url.hostname = 'ratdetective.online';
      url.port = '';
      return Response.redirect(url.href, 301);
    }

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'rat-detective', runtime: 'cloudflare-workers' });
      }

      if (url.pathname === '/status') {
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET',
              'access-control-max-age': '600',
            },
          });
        }
        if (request.method !== 'GET') {
          return json({ error: 'Method not allowed' }, { status: 405 });
        }
        const room = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
        await room.ensurePersistentBots();
        return json(
          { room: DEFAULT_ROOM_NAME, ...(await room.status()) },
          {
            headers: {
              'access-control-allow-origin': '*',
            },
          },
        );
      }

      if (url.pathname === '/ws') {
        if (request.headers.get('Upgrade') !== 'websocket') {
          return json({ error: 'Expected WebSocket upgrade' }, { status: 400 });
        }

        const roomName = url.searchParams.get('room') || DEFAULT_ROOM_NAME;
        const room = env.GAME_ROOM.getByName(roomName);
        if (roomName === DEFAULT_ROOM_NAME) await room.ensurePersistentBots();
        return room.fetch(request);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      log('error', 'worker request failed', {
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Internal server error' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
