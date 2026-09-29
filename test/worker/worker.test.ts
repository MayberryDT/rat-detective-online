import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_NAME } from '../../src/shared/networkProtocol';

describe('worker', () => {
  it('returns health', async () => {
    const response = await SELF.fetch('https://rat-detective.test/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'rat-detective',
      runtime: 'cloudflare-workers',
    });
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
  });

  it('rejects cross-site sockets, public custom rooms and exhausted admission budgets',async()=>{
    const cross=await SELF.fetch('https://ratdetective.online/ws',{headers:{Upgrade:'websocket',Origin:'https://evil.example'}});
    expect(cross.status).toBe(403);
    const custom=await SELF.fetch('https://ratdetective.online/ws?room=graybox-attack',{headers:{Upgrade:'websocket',Origin:'https://ratdetective.online'}});
    expect(custom.status).toBe(404);

    const worker=(await import('../../src/worker/index')).default;
    const privateEnv={NETWORK_TEST_TOKEN:'private-token',GAME_ROOM:{getByName:()=>({fetch:async()=>new Response('private')})}} as unknown as Env;
    const unauthenticated=await worker.fetch(new Request('https://private.example/ws?room=graybox-private',{headers:{Upgrade:'websocket'}}),privateEnv);
    expect(unauthenticated.status).toBe(404);
    const authenticated=await worker.fetch(new Request('https://private.example/ws?room=graybox-private',{headers:{Upgrade:'websocket',Authorization:'Bearer private-token'}}),privateEnv);
    expect(authenticated.status).toBe(200);expect(await authenticated.text()).toBe('private');

    const limited=await worker.fetch(new Request('https://ratdetective.online/ws',{headers:{Upgrade:'websocket',Origin:'https://ratdetective.online','cf-connecting-ip':'203.0.113.5'}}),
      {ADMISSION_RATE_LIMITER:{limit:async()=>({success:false})}} as unknown as Env);
    expect(limited.status).toBe(429);expect(limited.headers.get('retry-after')).toBe('60');
  });

  it('caches fingerprinted assets forever, but never the page or its fallback', async () => {
    const worker=(await import('../../src/worker/index')).default;
    const revalidate='public, max-age=0, must-revalidate';
    const env=(type:string)=>({ASSETS:{fetch:async()=>new Response('x',{headers:{'content-type':type,'cache-control':revalidate}})}}) as unknown as Env;
    const chunk=await worker.fetch(new Request('https://ratdetective.online/assets/createGame-Ab12.js'),env('text/javascript'));
    expect(chunk.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(chunk.headers.get('x-content-type-options')).toBe('nosniff');
    const page=await worker.fetch(new Request('https://ratdetective.online/'),env('text/html'));
    expect(page.headers.get('cache-control')).toBe(revalidate);
    const title=await worker.fetch(new Request('https://ratdetective.online/title/office.webp'),env('image/webp'));
    expect(title.headers.get('cache-control')).toBe(revalidate);
    const missing=await worker.fetch(new Request('https://ratdetective.online/assets/createGame-Old1.js'),env('text/html'));
    expect(missing.headers.get('cache-control')).toBe(revalidate);
  });

  it('rejects non-websocket /ws requests', async () => {
    const response = await SELF.fetch('https://rat-detective.test/ws');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Expected WebSocket upgrade',
    });
  });

  it('returns the public-room board', async () => {
    const empty = await SELF.fetch('https://rat-detective.test/status');
    expect(empty.status).toBe(200);
    const board = await empty.json<{room:string;players:number;bots:number;phase:string;startedAt:number;scores:Array<{name:string;kills:number;deaths:number}>}>();
    expect(board).toMatchObject({room:DEFAULT_ROOM_NAME,phase:'playing',startedAt:expect.any(Number)});
    expect(board.bots).toBeGreaterThanOrEqual(6);
    expect(board.bots).toBeLessThanOrEqual(9);
    expect(board.players).toBe(board.bots);expect(board.scores).toHaveLength(board.bots);
    expect(new Set(board.scores.map(p=>p.name)).size).toBe(board.bots);
    expect(board.scores.every(p=>p.kills===0&&p.deaths===0)).toBe(true);
    expect(board.scores.map(p=>p.name)).toEqual(board.scores.map(p=>p.name).sort((a,b)=>a.localeCompare(b)));
    expect(empty.headers.get('access-control-allow-origin')).toBe('*');
    expect(empty.headers.get('cache-control')).toBe('no-store');

    const world=(board as typeof board & {world:{seed:number;version:number}}).world;
    expect(world).toEqual({seed:expect.any(Number),version:2});
    const prepared=await (await SELF.fetch('https://rat-detective.test/status')).json();
    expect(prepared).toMatchObject({world,players:board.bots,bots:board.bots});

    const options = await SELF.fetch('https://rat-detective.test/status', { method: 'OPTIONS' });
    expect(options.status).toBe(204);
  });
});
