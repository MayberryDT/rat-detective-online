import { SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { COMPANION_SCHEMA_VERSION } from '../../src/shared/companionStatus';
import worker from '../../src/worker/index';

describe('companion status route', () => {
  it('returns an empty versioned city without touching a GameRoom', async () => {
    const companionStatus = vi.fn(async () => ({
      schemaVersion: COMPANION_SCHEMA_VERSION,
      observedAt: 123,
      rooms: [],
      nextCursor: null,
    }));
    const gameRoomLookup = vi.fn(() => { throw new Error('companion GET fanned out to gameplay'); });
    const fakeEnv = {
      MATCHMAKER: { getByName: () => ({ companionStatus }) },
      GAME_ROOM: { getByName: gameRoomLookup },
    } as unknown as Env;
    const response = await worker.fetch(
      new Request('https://ratdetective.online/api/companion/v1/status?limit=4'),
      fakeEnv,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1, observedAt: 123, rooms: [], nextCursor: null,
    });
    expect(companionStatus).toHaveBeenCalledWith(null, 4);
    expect(gameRoomLookup).not.toHaveBeenCalled();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('supports preflight and rejects invalid cursors, limits, and methods', async () => {
    const options = await SELF.fetch('https://rat-detective.test/api/companion/v1/status', {
      method: 'OPTIONS',
    });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-methods')).toBe('GET');
    for (const query of ['?cursor=../../private', '?limit=0', '?limit=33', '?limit=lots']) {
      const response = await SELF.fetch(`https://rat-detective.test/api/companion/v1/status${query}`);
      expect(response.status).toBe(400);
    }
    const post = await SELF.fetch('https://rat-detective.test/api/companion/v1/status', {
      method: 'POST',
    });
    expect(post.status).toBe(405);
  });
});
