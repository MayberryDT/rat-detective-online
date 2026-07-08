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
});
