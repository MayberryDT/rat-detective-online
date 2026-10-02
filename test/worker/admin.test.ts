import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import worker from '../../src/worker/index';
import { DEFAULT_ROOM_NAME, PROTOCOL_VERSION, type PlayerData, type RoundState, type ServerMessage } from '../../src/shared/networkProtocol';
import type { GameRoom } from '../../src/worker/GameRoom';
import { readSocketMessage } from './socketMessages';

const TOKEN = 'admin-test-token-0123456789';
const adminEnv = { ...env, ADMIN_TOKEN: TOKEN } as Env;
const rooms = new Set<string>(), sockets: WebSocket[] = [];
type Game = { chaosTimer: ReturnType<typeof setInterval> | null; serverBots: { dispose(): void } | null; persistentBots: boolean; matchRoom: string | null;
  players: Map<string, PlayerData>; botRoster: unknown[]; round: RoundState; env: { ADMIN_TOKEN?: string } };
const post = (command: string, token?: string, body = '{}') => worker.fetch(new Request(`https://ratdetective.online/api/admin/v1/${command}`,
  { method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }), adminEnv);

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  for (const name of rooms) {
    await runInDurableObject(env.GAME_ROOM.getByName(name), async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Game;
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null; game.serverBots?.dispose(); game.serverBots = null; game.persistentBots = false; game.matchRoom = null;
      game.players.clear(); game.botRoster = [];
      ctx.storage.sql.exec('DELETE FROM players'); ctx.storage.sql.exec('DELETE FROM pending_events');
      ctx.storage.sql.exec("DELETE FROM room_state WHERE key IN ('match-room-v1','match-pool-v1','persistent-bots-v1','persistent-bot-roster-v1','round-bot-count-v1','companion-active-v1')");
      await ctx.storage.deleteAlarm();
    });
  }
  rooms.clear();
});

describe('admin controls', () => {
  it('refuses a missing, wrong or unconfigured key', async () => {
    expect((await post('end-round')).status).toBe(401);
    expect((await post('end-round', 'wrong-token')).status).toBe(401);
    const unset = await worker.fetch(new Request('https://ratdetective.online/api/admin/v1/status', { headers: { authorization: `Bearer ${TOKEN}` } }), env);
    expect(unset.status).toBe(401);
    expect((await post('next-mode', TOKEN, '{"mode":"nope"}')).status).toBe(400);
  });

  it('ends the canonical round with the current leader winning, and records the command', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    const leader = await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Game;
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null;
      const rats = [...game.players.values()];
      expect(rats.length).toBeGreaterThan(1);
      // The leader is dead: an admin end still crowns the rat ahead, not the best one standing.
      rats[1]!.kills = 9_000; rats[1]!.hp = 0;
      return rats[1]!;
    });
    const response = await post('end-round', TOKEN);
    expect(response.status).toBe(200);
    const result = await response.json() as { ok: boolean; message: string; status: { phase: string } };
    expect(result.ok).toBe(true);
    expect(result.message).toContain(leader.name);
    expect(result.status.phase).toBe('won');
    const round = await runInDurableObject(stub, (instance: GameRoom) => (instance as unknown as Game).round);
    expect(round.phase).toBe('won');
    expect(round.winnerId).toBe(leader.id);
    expect((await post('end-round', TOKEN)).status).toBe(409);
    const facts = await stub.cityEvents({ type: 'admin', limit: 10 }) as Array<{ command: string; via: string; ok: boolean; winner?: number; round?: string }>;
    expect(facts.map(f => [f.command, f.via, f.ok])).toEqual([['end-round', 'http', true], ['end-round', 'http', false]]);
    expect(facts[0]!.winner).toEqual(expect.any(Number));
    expect(facts[0]!.round).toEqual(expect.any(String));
  });

  it('rolls a chosen incident with no caller, ends it, and sends the case back to a fresh spot', async () => {
    rooms.add(DEFAULT_ROOM_NAME);
    const stub = env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME);
    await stub.enableMatchmaking(DEFAULT_ROOM_NAME);
    type Snapshot = { dispatch: { phase: string; incident?: string; caller?: string }; case: { owner: string | null; returningUntil: number } };
    const chaos = () => runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Game & { chaos: { snapshot(drain: boolean): Snapshot } };
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null;
      return game.chaos.snapshot(false);
    });
    await chaos();
    expect((await post('incident', TOKEN, '{"incident":"blackout"}')).status).toBe(200);
    const rolled = await chaos();
    expect(rolled.dispatch).toMatchObject({ phase: 'rolling', incident: 'blackout' });
    expect(rolled.dispatch.caller).toBeUndefined();
    expect((await post('end-incident', TOKEN)).status).toBe(200);
    expect((await chaos()).dispatch.phase).toBe('cooldown');
    expect((await post('end-incident', TOKEN)).status).toBe(409);
    expect((await post('reset-case', TOKEN)).status).toBe(200);
    const after = await chaos();
    expect(after.case.owner).toBeNull();
    expect(after.case.returningUntil).toBeGreaterThan(0);
  });

  it('marks a game socket admin only after the right key, which is never echoed', async () => {
    const name = 'graybox-admin-socket';
    rooms.add(name);
    const stub = env.GAME_ROOM.getByName(name);
    await runInDurableObject(stub, (instance: GameRoom) => { (instance as unknown as Game).env.ADMIN_TOKEN = TOKEN; });
    const response = await stub.fetch(new Request('https://game.test/ws', { headers: { Upgrade: 'websocket' } }));
    const ws = response.webSocket!; ws.accept(); sockets.push(ws);
    const messages: ServerMessage[] = [], raw: string[] = [];
    let wake = () => {};
    ws.addEventListener('message', event => { raw.push(String(event.data)); const m = readSocketMessage(ws, event.data); if (m) messages.push(m); wake(); });
    const until = async (check: () => boolean) => {
      while (!check()) await new Promise<void>(resolve => { wake = resolve; });
    };
    const results = () => messages.filter((m): m is Extract<ServerMessage, { type: 'adminResult' }> => m.type === 'adminResult');
    ws.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Tyler', appearance: { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 } }));
    await until(() => messages.some(m => m.type === 'welcome'));
    ws.send(JSON.stringify({ type: 'admin', command: { command: 'status' } }));
    ws.send(JSON.stringify({ type: 'admin', token: 'wrong-token', command: { command: 'status' } }));
    await until(() => results().length === 2);
    expect(results().every(r => !r.ok && !r.status)).toBe(true);
    ws.send(JSON.stringify({ type: 'admin', token: TOKEN, command: { command: 'status' } }));
    ws.send(JSON.stringify({ type: 'admin', command: { command: 'next-mode', mode: 'jurisdiction' } }));
    await until(() => results().length === 4);
    expect(results()[2]!.ok).toBe(true);
    expect(results()[3]).toMatchObject({ ok: true, status: { nextMode: 'jurisdiction' } });
    expect(raw.some(text => text.includes(TOKEN))).toBe(false);
  });
});
