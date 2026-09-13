import worker from './index';
import { verifyBearerToken } from './auth';

export { GameRoom } from './GameRoom';
export { Matchmaker } from './Matchmaker';

/** Isolated hosted probe entry point; never used by the game deployments. */
export default {
  async fetch(request: Request, env: Env & { NETWORK_TEST_TOKEN?: string }): Promise<Response> {
    if (!await verifyBearerToken(request.headers.get('authorization'), env.NETWORK_TEST_TOKEN)) {
      return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
    }
    const path = new URL(request.url).pathname;
    if (path !== '/health' && path !== '/ws' && path !== '/status') return new Response('Not found', { status: 404 });
    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<Env & { NETWORK_TEST_TOKEN?: string }>;
