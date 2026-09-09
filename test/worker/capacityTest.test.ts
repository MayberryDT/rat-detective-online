import { describe, expect, it } from 'vitest';
import worker from '../../src/worker/capacityTest';

describe('isolated hosted capacity baseline', () => {
  const env = { CAPACITY_TEST_TOKEN: 'fixture-token', CAPACITY_FIXTURE_ID: 'fixture', CAPACITY_EXPIRES_AT: String(Date.now() + 60000) } as Env & { CAPACITY_TEST_TOKEN: string; CAPACITY_FIXTURE_ID: string; CAPACITY_EXPIRES_AT: string };
  const request = (path: string, token = 'fixture-token') => new Request(`https://test.invalid${path}`, { headers: { authorization: `Bearer ${token}` } });
  it('requires a configured matching credential', async () => {
    expect((await worker.fetch(request('/health'), {} as Env)).status).toBe(401);
    expect((await worker.fetch(request('/health', 'wrong'), env)).status).toBe(401);
    expect(await (await worker.fetch(request('/health'), env)).json()).toMatchObject({ maxPlayers: 24, maxScoreEntries: 100 });
  });
  it('expires the fixture and rejects missing identity', async () => {
    expect((await worker.fetch(request('/health'), { ...env, CAPACITY_EXPIRES_AT: '1' })).status).toBe(503);
    expect((await worker.fetch(request('/health'), { ...env, CAPACITY_FIXTURE_ID: undefined })).status).toBe(503);
  });
  it('cannot route public rooms, status requests, or assets', async () => {
    for (const path of ['/', '/status', '/ws', '/ws?room=public-live-v2', '/ws?room=anything']) {
      expect((await worker.fetch(request(path), env)).status).toBe(404);
    }
    expect((await worker.fetch(request('/ws?room=graybox-practice-probe-fixture'), env)).status).toBe(400);
  });
});
