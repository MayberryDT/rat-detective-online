import { observationAllowed } from '../shared/observation';
import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import { log } from './logging';
import { isAssignmentId } from '../shared/assignments';
import { isEvidenceMode, isIncidentId } from '../shared/incidentCatalog';
import { allowsLocalDiagnostics } from './clientDiagnostics';
import { verifyBearerToken } from './auth';
import { companionPageSize, isCompanionCursor } from '../shared/companionStatus';

export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';

type AdmissionEnv = Env & {
  ADMISSION_RATE_LIMITER?: RateLimit;
  NETWORK_TEST_TOKEN?: string;
  CAPACITY_TEST_TOKEN?: string;
};

const ROOM_NAME = /^[a-z0-9-]{1,160}$/;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function secureResponse(response: Response, url: URL): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  const socketOrigin=`${url.protocol==='https:'?'wss:':'ws:'}//${url.host}`;
  headers.set('content-security-policy', `${CONTENT_SECURITY_POLICY}; connect-src 'self' ${socketOrigin}`);
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  if (url.protocol === 'https:') headers.set('strict-transport-security', 'max-age=31536000');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Browsers always send Origin for WebSocket handshakes. Keep absent Origin for
 * authenticated relays/non-browser clients; reject every cross-site browser. */
function webSocketOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.origin === new URL(request.url).origin;
  } catch { return false; }
}

async function privateRoomAuthorized(request: Request, env: AdmissionEnv): Promise<boolean> {
  if(allowsLocalDiagnostics(request))return true;
  const authorization=request.headers.get('authorization');
  return await verifyBearerToken(authorization,env.NETWORK_TEST_TOKEN) ||
    await verifyBearerToken(authorization,env.CAPACITY_TEST_TOKEN);
}

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
    const respond = (response: Response) => secureResponse(response, url);

    if (url.hostname === 'rat-detective.animasai.co') {
      url.protocol = 'https:';
      url.hostname = 'ratdetective.online';
      url.port = '';
      return respond(Response.redirect(url.href, 301));
    }

    try {
      if (url.pathname === '/health') {
        return respond(json({ ok: true, service: 'rat-detective', runtime: 'cloudflare-workers' }));
      }

      if (url.pathname === '/status') {
        if (request.method === 'OPTIONS') {
          return respond(new Response(null, {
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET',
              'access-control-max-age': '600',
            },
          }));
        }
        if (request.method !== 'GET') {
          return respond(json({ error: 'Method not allowed' }, { status: 405 }));
        }
        const room = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
        await room.enableMatchmaking(DEFAULT_ROOM_NAME);
        return respond(json(
          { room: DEFAULT_ROOM_NAME, ...(await room.status()) },
          {
            headers: {
              'access-control-allow-origin': '*',
            },
          },
        ));
      }

      if (url.pathname === '/api/companion/v1/status') {
        if (request.method === 'OPTIONS') {
          return respond(new Response(null, {
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET',
              'access-control-max-age': '600',
            },
          }));
        }
        if (request.method !== 'GET') {
          return respond(json({ error: 'Method not allowed' }, { status: 405 }));
        }
        const cursor = url.searchParams.get('cursor');
        const limit = companionPageSize(url.searchParams.get('limit'));
        if (!isCompanionCursor(cursor) || limit === null) {
          return respond(json({ error: 'Invalid companion page' }, {
            status: 400,
            headers: { 'access-control-allow-origin': '*' },
          }));
        }
        const status = await env.MATCHMAKER.getByName(DEFAULT_ROOM_NAME).companionStatus(cursor, limit);
        return respond(json(status, {
          headers: { 'access-control-allow-origin': '*' },
        }));
      }

      if (url.pathname === '/ws') {
        if (request.headers.get('Upgrade') !== 'websocket') {
          return respond(json({ error: 'Expected WebSocket upgrade' }, { status: 400 }));
        }
        if (!webSocketOriginAllowed(request)) return respond(json({ error: 'Forbidden WebSocket origin' }, { status: 403 }));

        const admissionEnv=env as AdmissionEnv,sourceIp=request.headers.get('cf-connecting-ip');
        if(sourceIp&&admissionEnv.ADMISSION_RATE_LIMITER){
          const {success}=await admissionEnv.ADMISSION_RATE_LIMITER.limit({key:`ws:${sourceIp}`});
          if(!success)return respond(json({error:'Too many connection attempts'},{status:429,headers:{'retry-after':'60'}}));
        }

        const roomName = url.searchParams.get('room') || DEFAULT_ROOM_NAME;
        if(!ROOM_NAME.test(roomName))return respond(json({error:'Unknown room'},{status:404}));
        if(roomName!==DEFAULT_ROOM_NAME&&!await privateRoomAuthorized(request,admissionEnv))
          return respond(json({error:'Unknown room'},{status:404}));
        if(url.searchParams.get('observe')==='1'&&!observationAllowed(url,env as Env & {CAPACITY_FIXTURE_ID?:string;CAPACITY_EXPIRES_AT?:string}))return respond(json({error:'Observation requires an active private bot fixture'},{status:403}));
        const selection=url.searchParams.get('assignment');
        if (roomName === DEFAULT_ROOM_NAME) {
          if(selection!==null)return respond(json({error:'Assignment selection requires a private room'},{status:400}));
          return respond(await env.MATCHMAKER.getByName(roomName).fetch(request));
        }
        const room = env.GAME_ROOM.getByName(roomName);
        if(selection!==null){
          if(!roomName.startsWith('graybox-practice-')||!allowsLocalDiagnostics(request)||
              selection!=='auto'&&!isAssignmentId(selection))return respond(json({error:'Assignment selection requires a local private practice room'},{status:400}));
          if(!await room.configureAssignment(selection==='auto'?null:selection as import('../shared/assignments').AssignmentId))return respond(json({error:'Choose a new private room to select another assignment'},{status:409}));
        }
        const incidents=url.searchParams.get('incidents');
        if(incidents!==null){
          if(!roomName.startsWith('graybox-practice-')||!allowsLocalDiagnostics(request)||!isEvidenceMode(incidents))
            return respond(json({error:'Incident mode requires a local private practice room'},{status:400}));
          if(!await room.configureIncidents(incidents))return respond(json({error:'Choose a new private room to change incident mode'},{status:409}));
        }
        const incident=url.searchParams.get('incident');
        if(incident!==null){
          if(!roomName.startsWith('graybox-practice-')||!allowsLocalDiagnostics(request)||
              incident!=='auto'&&!isIncidentId(incident))return respond(json({error:'Incident pin requires a local private practice room'},{status:400}));
          if(!await room.configureIncident(incident==='auto'?null:incident))return respond(json({error:'Choose a new private room to pin another incident'},{status:409}));
        }
        return respond(await room.fetch(request));
      }

      return respond(await env.ASSETS.fetch(request));
    } catch (error) {
      log('error', 'worker request failed', {
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      return respond(json({ error: 'Internal server error' }, { status: 500 }));
    }
  },
} satisfies ExportedHandler<Env>;
