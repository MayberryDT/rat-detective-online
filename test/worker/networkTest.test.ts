import { describe, expect, it } from 'vitest';
import worker from '../../src/worker/networkTest';

describe('private network comparison entry point', () => {
  const request = (path: string, token?: string) => new Request(`https://test.invalid${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const env = { NETWORK_TEST_TOKEN: 'test-only-token' } as Env & { NETWORK_TEST_TOKEN: string };
  it('fails closed without configuration and with missing or incorrect credentials', async () => {
    expect((await worker.fetch(request('/health'), {} as Env)).status).toBe(401);
    expect((await worker.fetch(request('/ws'), env)).status).toBe(401);
    expect((await worker.fetch(request('/health', 'wrong'), env)).status).toBe(401);
  });
  it('serves authenticated health but exposes no assets', async () => {
    expect((await worker.fetch(request('/health', 'test-only-token'), env)).status).toBe(200);
    for (const path of ['/', '/index.html']) {
      expect((await worker.fetch(request(path, 'test-only-token'), env)).status).toBe(404);
    }
  });
});
