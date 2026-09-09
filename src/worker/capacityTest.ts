import worker from './index';
import { MAX_PLAYERS, MAX_SCORE_ENTRIES } from '../shared/networkProtocol';
export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';

/** Separate namespace for hosted baseline measurements; no public room or assets. */
export default {
  async fetch(request: Request, env: Env & { CAPACITY_TEST_TOKEN?: string; CAPACITY_FIXTURE_ID?: string; CAPACITY_EXPIRES_AT?: string }): Promise<Response> {
    // The app tsconfig uses DOM crypto types; Workers adds this runtime method.
    const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean };
    const encoder = new TextEncoder();
    const actual = encoder.encode(request.headers.get('authorization') ?? '');
    const expected = encoder.encode(`Bearer ${env.CAPACITY_TEST_TOKEN ?? ''}`);
    if (!env.CAPACITY_TEST_TOKEN || actual.length !== expected.length || !subtle.timingSafeEqual(actual, expected)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const expiresAt = Number(env.CAPACITY_EXPIRES_AT);
    if (!env.CAPACITY_FIXTURE_ID || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return new Response('Benchmark expired or unconfigured', { status: 503 });
    const url = new URL(request.url);
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'rat-detective-capacity-test', maxPlayers: MAX_PLAYERS, maxScoreEntries: MAX_SCORE_ENTRIES, fixtureId: env.CAPACITY_FIXTURE_ID, expiresAt }, { headers: { 'cache-control': 'no-store' } });
    if (url.pathname !== '/ws' || !/^graybox-(?:practice-probe|benchmark)-[a-z0-9-]{1,80}$/.test(url.searchParams.get('room') ?? '')) {
      return new Response('Not found', { status: 404 });
    }
    const room = url.searchParams.get('room') ?? '';
    if (/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(room)) return env.MATCHMAKER.getByName(room).fetch(request);
    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<Env & { CAPACITY_TEST_TOKEN?: string; CAPACITY_FIXTURE_ID?: string; CAPACITY_EXPIRES_AT?: string }>;
