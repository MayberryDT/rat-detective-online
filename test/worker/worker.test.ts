import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker', () => {
  it('returns health', async () => {
    const response = await SELF.fetch('https://rat-detective.test/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'rat-detective',
      runtime: 'cloudflare-workers',
    });
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
    await expect(empty.json()).resolves.toEqual({
      room: 'public',
      players: 0,
      phase: 'playing',
      startedAt: expect.any(Number),
      scores: [],
    });
    expect(empty.headers.get('access-control-allow-origin')).toBe('*');
    expect(empty.headers.get('cache-control')).toBe('no-store');

    const options = await SELF.fetch('https://rat-detective.test/status', { method: 'OPTIONS' });
    expect(options.status).toBe(204);
  });
});
