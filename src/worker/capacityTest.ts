import worker from './index';
import { verifyBearerToken } from './auth';
import { MAX_PLAYERS, MAX_SCORE_ENTRIES } from '../shared/networkProtocol';
import { isAssignmentId } from '../shared/assignments';
export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';

/** Separate namespace for hosted baseline measurements; no public room or assets. */
export default {
  async fetch(request: Request, env: Env & { CAPACITY_TEST_TOKEN?: string; CAPACITY_FIXTURE_ID?: string; CAPACITY_EXPIRES_AT?: string }): Promise<Response> {
    if (!await verifyBearerToken(request.headers.get('authorization'), env.CAPACITY_TEST_TOKEN)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const expiresAt = Number(env.CAPACITY_EXPIRES_AT);
    if (!env.CAPACITY_FIXTURE_ID || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return new Response('Benchmark expired or unconfigured', { status: 503 });
    const url = new URL(request.url);
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'rat-detective-capacity-test', maxPlayers: MAX_PLAYERS, maxScoreEntries: MAX_SCORE_ENTRIES, fixtureId: env.CAPACITY_FIXTURE_ID, expiresAt }, { headers: { 'cache-control': 'no-store' } });
    // Authenticated metadata for the exact private matchmaking pool. Like public
    // /status this creates no participant and uses the normal sleeping-room policy.
    if(url.pathname==='/status'){
      const name=url.searchParams.get('room')??'';
      if(!/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(name))return new Response('Not found',{status:404});
      const room=env.GAME_ROOM.getByName(name);await room.enableMatchmaking(name);
      return Response.json({room:name,...await room.status()},{headers:{'cache-control':'no-store'}});
    }
    if (url.pathname !== '/ws' || !/^graybox-(?:practice-probe|benchmark)-[a-z0-9-]{1,80}$/.test(url.searchParams.get('room') ?? '')) {
      return new Response('Not found', { status: 404 });
    }
    const room = url.searchParams.get('room') ?? '';
    const selection=url.searchParams.get('assignment');
    if(selection!==null){
      if(room.startsWith('graybox-benchmark-match-')||selection!=='auto'&&!isAssignmentId(selection))return new Response('Select an assignment in a fixed private room',{status:400});
      if(!await env.GAME_ROOM.getByName(room).configureAssignment(selection==='auto'?null:selection as import('../shared/assignments').AssignmentId))return new Response('Choose a new private room for another assignment',{status:409});
      url.searchParams.delete('assignment');
      request=new Request(url,request);
    }
    if (/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(room)) return env.MATCHMAKER.getByName(room).fetch(request);
    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<Env & { CAPACITY_TEST_TOKEN?: string; CAPACITY_FIXTURE_ID?: string; CAPACITY_EXPIRES_AT?: string }>;
