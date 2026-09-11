import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import { log } from './logging';
import { isAssignmentId } from '../shared/assignments';
import { isEvidenceMode, isIncidentId } from '../shared/incidentCatalog';
import { allowsLocalDiagnostics } from './clientDiagnostics';

export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';

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
        await room.enableMatchmaking(DEFAULT_ROOM_NAME);
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
        const selection=url.searchParams.get('assignment');
        if (roomName === DEFAULT_ROOM_NAME) {
          if(selection!==null)return json({error:'Assignment selection requires a private room'},{status:400});
          return env.MATCHMAKER.getByName(roomName).fetch(request);
        }
        const room = env.GAME_ROOM.getByName(roomName);
        if(selection!==null){
          if(!roomName.startsWith('graybox-practice-')||!allowsLocalDiagnostics(request)||
              selection!=='auto'&&!isAssignmentId(selection))return json({error:'Assignment selection requires a local private practice room'},{status:400});
          if(!await room.configureAssignment(selection==='auto'?null:selection as import('../shared/assignments').AssignmentId))return json({error:'Choose a new private room to select another assignment'},{status:409});
        }
        const incidents=url.searchParams.get('incidents');
        if(incidents!==null){
          if(!roomName.startsWith('graybox-practice-')||!allowsLocalDiagnostics(request)||!isEvidenceMode(incidents))
            return json({error:'Incident mode requires a local private practice room'},{status:400});
          if(!await room.configureIncidents(incidents))return json({error:'Choose a new private room to change incident mode'},{status:409});
        }
        const incident=url.searchParams.get('incident');
        if(incident!==null){
          if(!roomName.startsWith('graybox-practice-')||!allowsLocalDiagnostics(request)||
              incident!=='auto'&&!isIncidentId(incident))return json({error:'Incident pin requires a local private practice room'},{status:400});
          if(!await room.configureIncident(incident==='auto'?null:incident))return json({error:'Choose a new private room to pin another incident'},{status:409});
        }
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
