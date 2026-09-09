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
    expect(board.bots).toBe(0); // Empty public rooms sleep until someone joins.
    expect(board.players).toBe(board.bots);expect(board.scores).toHaveLength(board.bots);
    expect(new Set(board.scores.map(p=>p.name)).size).toBe(board.bots);
    expect(board.scores.every(p=>p.kills===0&&p.deaths===0)).toBe(true);
    expect(board.scores.map(p=>p.name)).toEqual(board.scores.map(p=>p.name).sort((a,b)=>a.localeCompare(b)));
    expect(empty.headers.get('access-control-allow-origin')).toBe('*');
    expect(empty.headers.get('cache-control')).toBe('no-store');

    const options = await SELF.fetch('https://rat-detective.test/status', { method: 'OPTIONS' });
    expect(options.status).toBe(204);
  });
});
