import { readSocketMessage } from './socketMessages';
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOT_HEARTBEAT_MS, GameRoom, STALE_PLAYER_MS } from '../../src/worker/GameRoom';
import { PERSISTENT_BOT_IDS, PERSISTENT_BOT_ROSTER, type PersistentBot } from '../../src/shared/botRoster';
import { GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { MAX_PLAYERS, PROTOCOL_VERSION, RESPAWN_DELAY_MS, WIN_DISPLAY_MS, type PlayerData, type RoundState, type ServerMessage } from '../../src/shared/networkProtocol';
import type { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import type { ServerBotController } from '../../src/worker/ServerBotController';
import { createAssignment } from '../../src/shared/assignments';

type Stub = DurableObjectStub<GameRoom>;
type Internals = {
  players: Map<string, PlayerData>; world: { seed: number; version: number }; round: RoundState;
  chaos: ChaosSimulation; chaosTimer: ReturnType<typeof setInterval> | null;
  serverBots: ServerBotController | null; persistentBots: boolean; nextBotHeartbeat: number;
  clock: () => number; persistPlayer: (player: PlayerData, force: boolean) => void;
  recoverManagedBot: (id:string)=>void;
  finishAssignment: () => void;
  botRoster: PersistentBot[]; broadcast: (message: ServerMessage) => void;
  handleHit: (id: string, message: { type: 'hit'; victimId: string; damage: number }) => Promise<void>;
};
const rooms: Stub[] = [];
const sockets: WebSocket[] = [];
async function bootstrapCount(stub: Stub, random: number) {
  await runInDurableObject(stub, async (instance: GameRoom) => {
    const rng = vi.spyOn(Math, 'random').mockReturnValue(random);
    try { await instance.ensurePersistentBots(); } finally { rng.mockRestore(); }
  });
}
function room() { const stub = env.GAME_ROOM.getByName(`persistent-test-${crypto.randomUUID()}`); rooms.push(stub); return stub; }
afterEach(async () => {
  for (const ws of sockets.splice(0)) if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'done');
  for (const stub of rooms.splice(0)) {
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null; game.serverBots?.dispose(); game.serverBots = null; game.persistentBots = false;
      ctx.storage.sql.exec("DELETE FROM room_state WHERE key = 'persistent-bots-v1'");
      await ctx.storage.deleteAlarm();
    });
  }
});

describe('persistent hosted bots', () => {
  it('blocks extra-case pickup during Evidence Tampering and retains actual kill counts afterward',async()=>{
    const stub=room();await stub.ensurePersistentBots();
    await runInDurableObject(stub,async(instance:GameRoom)=>{
      const game=instance as unknown as Internals;
      if(game.chaosTimer)clearInterval(game.chaosTimer);game.chaosTimer=null;
      const now=Date.now();
      (game.chaos as unknown as {dispatch:object}).dispatch={phase:'active',incident:'evidence-tampering',started:now,until:now+25000,serial:1};
      game.chaos.step(0,now);
      const extra=game.chaos.snapshot(false).extraCases![0];
      const killer=game.players.get(PERSISTENT_BOT_IDS[0])!,victim=game.players.get(PERSISTENT_BOT_IDS[1])!;
      Object.assign(killer,{x:extra.p.x,y:extra.p.y-.8,z:extra.p.z,kills:0});
      game.chaos.step(0,now+1);expect(game.chaos.isCaseHolder(killer.id)).toBe(false);
      expect(game.chaos.snapshot(false).extraCases).toHaveLength(7);
      await game.handleHit(killer.id,{type:'hit',victimId:victim.id,damage:3});expect(killer.kills).toBe(1);
      game.chaos.step(0,now+25000);expect(game.chaos.snapshot(false).extraCases).toEqual([]);
      Object.assign(killer,{x:game.chaos.caseBody.position.x,y:game.chaos.caseBody.position.y-.8,z:game.chaos.caseBody.position.z});
      game.chaos.caseBody.velocity.setZero();
      game.chaos.step(0,now+25001);expect(game.chaos.isCaseHolder(killer.id)).toBe(true);
      victim.hp=3;await game.handleHit(killer.id,{type:'hit',victimId:victim.id,damage:3});expect(killer.kills).toBe(2);
    });
  });
  it('rescues only the stranded bot, keeps scores/health, and returns its case without resetting the match',async()=>{
    const stub=room();await stub.ensurePersistentBots();
    await runInDurableObject(stub,(instance:GameRoom)=>{
      const game=instance as unknown as Internals;
      if(game.chaosTimer)clearInterval(game.chaosTimer);game.chaosTimer=null;
      const bot=game.players.get(PERSISTENT_BOT_IDS[0])!;
      const p=game.chaos.caseBody.position;
      Object.assign(bot,{x:p.x,y:p.y-.8,z:p.z,hp:2,kills:7,deaths:4});
      game.chaos.step(0,Date.now());expect(game.chaos.caseHolderId).toBe(bot.id);
      const others=JSON.stringify([...game.players.values()].filter(p=>p.id!==bot.id));
      Object.assign(bot,{y:80});game.recoverManagedBot(bot.id);
      expect(bot.y).toBeLessThan(5);expect(bot).toMatchObject({hp:2,kills:7,deaths:4});
      expect(game.chaos.caseHolderId).toBeNull();expect(game.chaos.snapshot(false).case.returningUntil).toBeGreaterThan(0);
      expect(JSON.stringify([...game.players.values()].filter(p=>p.id!==bot.id))).toBe(others);
      const human={...bot,id:'human',y:80};game.players.set(human.id,human);
      game.recoverManagedBot(human.id);expect(human.y).toBe(80);
      expect(game.round.phase).toBe('playing');
    });
  });
  it('boots one random roster once and advances with no sockets', async () => {
    const stub = room();
    await Promise.all([stub.ensurePersistentBots(), stub.ensurePersistentBots(), stub.ensurePersistentBots()]);
    const before = await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      expect(ctx.getWebSockets()).toHaveLength(0);
      expect(game.world.version).toBe(GRAYBOX_VERSION);
      expect(game.players.size).toBeGreaterThanOrEqual(8);
      expect(game.players.size).toBeLessThanOrEqual(11);
      expect([...game.players.keys()]).toEqual(game.botRoster.map(bot => bot.id));
      expect(ctx.storage.sql.exec<{ count: number }>('SELECT count(*) AS count FROM players').one().count).toBe(game.botRoster.length);
      expect(await ctx.storage.getAlarm()).toBeLessThanOrEqual(Date.now() + BOT_HEARTBEAT_MS);
      return { roster: game.botRoster, time: game.chaos.snapshot(false).time, positions: [...game.players.values()].map(p => [p.x, p.y, p.z]) };
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      expect(game.chaos.snapshot(false).time).toBeGreaterThan(before.time);
      expect([...game.players.values()].some((p, i) => p.x !== before.positions[i][0] || p.y !== before.positions[i][1] || p.z !== before.positions[i][2])).toBe(true);
      expect(game.botRoster).toEqual(before.roster);
      expect(game.players.size).toBe(before.roster.length);
    });
    await stub.ensurePersistentBots();
    expect((await stub.status()).players).toBe(before.roster.length);
  });

  it('retains managed identities and scores through stale hydration and re-arms the heartbeat', async () => {
    const stub = room(); await stub.ensurePersistentBots();
    const before = await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      // The test helper waits for timer I/O to drain before eviction. Stop only
      // this in-memory loop, leaving the durable enabled flag and alarm intact.
      if (game.chaosTimer) clearInterval(game.chaosTimer); game.chaosTimer = null;
      game.serverBots?.dispose(); game.serverBots = null;
      const rat = game.players.get(PERSISTENT_BOT_IDS[0])!; rat.kills = 7; game.persistPlayer(rat, true);
      const old = Date.now() - STALE_PLAYER_MS - 1000;
      ctx.storage.sql.exec('UPDATE players SET updated_at = ?, last_active_at = ?', old, old);
      return { seed: game.world.seed, roster: game.botRoster };
    });
    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      expect(game.world).toMatchObject({ seed: before.seed, version: GRAYBOX_VERSION });
      expect(game.players.size).toBe(before.roster.length);
      expect(game.botRoster).toEqual(before.roster);
      expect(game.players.get(PERSISTENT_BOT_IDS[0])!.kills).toBe(7);
      expect(game.serverBots).not.toBeNull(); expect(game.chaosTimer).not.toBeNull();
      expect(await ctx.storage.getAlarm()).toBeGreaterThan(Date.now());
    });
    await stub.ensurePersistentBots(); expect((await stub.status()).players).toBe(before.roster.length);
  });

  it('gives bot deaths and wins the ordinary deadlines without replacing them with the heartbeat', async () => {
    const stub = room(); await stub.ensurePersistentBots();
    await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      if (game.chaosTimer) clearInterval(game.chaosTimer); game.chaosTimer = null;
      const originalClock = game.clock; let now = Date.now(); game.clock = () => now;
      const reset = vi.spyOn(game.serverBots!, 'reset');
      try {
        const killer = game.players.get(PERSISTENT_BOT_IDS[0])!, victim = game.players.get(PERSISTENT_BOT_IDS[1])!;
        await game.handleHit(killer.id, { type: 'hit', victimId: victim.id, damage: 3 });
        expect(victim.hp).toBe(0); expect(victim.deaths).toBe(1); expect(killer.kills).toBe(1);
        expect(await ctx.storage.getAlarm()).toBe(now + RESPAWN_DELAY_MS);
        now += RESPAWN_DELAY_MS; await instance.alarm();
        expect(victim.hp).toBe(3); expect(reset).toHaveBeenCalledWith(victim.id, expect.any(Object));
        killer.kills = 19;
        await game.handleHit(killer.id, { type: 'hit', victimId: victim.id, damage: 3 });
        expect(game.round.phase).toBe('playing');
        const assignment=createAssignment('closing-time',now);assignment.liveAt=now;assignment.remainingMs=1;
        game.chaos.setAssignment(assignment);
        game.chaos.caseBody.position.set(killer.x,killer.y+.8,killer.z);game.chaos.caseBody.velocity.setZero();
        game.chaos.step(0,now);expect(game.chaos.caseHolderId).toBe(killer.id);
        game.chaos.step(.001,now+1);game.finishAssignment();await instance.alarm();
        expect(game.round.phase).toBe('won');
        expect(await ctx.storage.getAlarm()).toBe(now + WIN_DISPLAY_MS);
        now += WIN_DISPLAY_MS; await instance.alarm();
        expect(game.round.phase).toBe('playing');
        expect([...game.players.values()].every(p => p.hp === 3 && p.kills === 0 && p.deaths === 0)).toBe(true);
        expect(game.players.get(killer.id)).not.toBe(killer);
        expect(game.players.get(killer.id)!.name).not.toBe(killer.name);
        expect(await ctx.storage.getAlarm()).toBe(now + BOT_HEARTBEAT_MS);
      } finally { reset.mockRestore(); game.clock = originalClock; }
    });
  });

  it.each([0, 0.999999])('reserves eleven slots with random %s and accepts thirteen humans', async random => {
    const stub = room(); await bootstrapCount(stub, random);
    const bots = (await stub.status()).bots;
    const join = JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Human',
      appearance: { hatType: 'fedora', hatColor: 0xdc4a3c, furColor: 0xe8b84d, coatColor: 0xbe4545 } });
    for (let i = 0; i <= MAX_PLAYERS - 11; i++) {
      const response = await stub.fetch('https://rat-detective.test/ws', { headers: { Upgrade: 'websocket' } });
      const ws = response.webSocket!; ws.accept(); sockets.push(ws);
      const first = new Promise<{ type: string; message?: string; players?: Record<string, PlayerData> }>(resolve => {
        ws.addEventListener('message', event => { const message=readSocketMessage(ws,event.data);if(message?.type==='welcome'||message?.type==='error')resolve(message); });
      });
      ws.send(join); const message = await first;
      if (i < MAX_PLAYERS - 11) expect(message.type).toBe('welcome');
      else expect(message).toMatchObject({ type: 'error', message: 'This room is full' });
    }
    expect((await stub.status()).players).toBe(MAX_PLAYERS - 11 + bots);
    await stub.ensurePersistentBots();
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      expect(game.players.size).toBe(MAX_PLAYERS - 11 + bots);
      expect([...game.players.keys()].filter(id => id.startsWith('rd-ai-'))).toHaveLength(bots);
    });
  });

  it('keeps the deployed legacy eleven until its first round reset', async () => {
    const stub = room();
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      ctx.storage.sql.exec("INSERT INTO room_state (key, value) VALUES ('persistent-bots-v1', 'true')");
      const game = instance as unknown as Internals;
      for (const entry of PERSISTENT_BOT_ROSTER) {
        game.persistPlayer({ ...entry.appearance, id: entry.id, name: entry.name, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
          meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1, hp: 3, kills: 7, deaths: 2 }, true);
      }
    });
    await evictDurableObject(stub);
    await stub.ensurePersistentBots();
    await runInDurableObject(stub, (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      expect(game.botRoster).toEqual(PERSISTENT_BOT_ROSTER);
      expect([...game.players.values()].map(p => p.name)).toEqual(PERSISTENT_BOT_ROSTER.map(p => p.name));
      expect([...game.players.values()].every(p => p.kills === 7 && p.deaths === 2)).toBe(true);
      expect(ctx.storage.sql.exec("SELECT value FROM room_state WHERE key = 'persistent-bot-roster-v1'").toArray()).toHaveLength(1);
    });
  });

  it('replaces eleven with eight fresh bots, clears their events, and refreshes client identities', async () => {
    const stub = room(); await bootstrapCount(stub, 0.999999);
    const after = await runInDurableObject(stub, async (instance: GameRoom, ctx) => {
      const game = instance as unknown as Internals;
      if (game.chaosTimer) clearInterval(game.chaosTimer); game.chaosTimer = null;
      const previous = game.botRoster;
      const human = { ...game.players.get(PERSISTENT_BOT_IDS[0])!, id: 'human-preserved', name: 'Human Name', kills: 9, deaths: 4 };
      game.players.set(human.id, human); game.persistPlayer(human, true);
      const appearance = { hatType: human.hatType, hatColor: human.hatColor, coatColor: human.coatColor, furColor: human.furColor };
      const now = Date.now();
      game.round={phase:'won',resetAt:now};
      ctx.storage.sql.exec("INSERT INTO pending_events (id, type, player_id, due_at) VALUES ('reset-test', 'reset', NULL, ?)", now);
      for (const id of PERSISTENT_BOT_IDS) {
        ctx.storage.sql.exec("INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, 'respawn', ?, ?)", `future-${id}`, id, now + 60_000);
      }
      const controller = game.serverBots;
      const dispose = vi.spyOn(controller!, 'dispose');
      const broadcast = vi.spyOn(game, 'broadcast');
      const rng = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        await instance.alarm();
        expect(game.botRoster).toHaveLength(8);
        expect(game.botRoster.every(bot => !previous.some(old => old.name === bot.name))).toBe(true);
        expect(game.serverBots).not.toBe(controller); expect(dispose).toHaveBeenCalledOnce();
        expect(game.players.get(human.id)).toBe(human);
        expect(human).toMatchObject({ name: 'Human Name', ...appearance, hp: 3, kills: 0, deaths: 0 });
        expect(game.players.size).toBe(9);
        expect(ctx.storage.sql.exec('SELECT id FROM pending_events WHERE player_id IS NOT NULL').toArray()).toHaveLength(0);
        for (const id of PERSISTENT_BOT_IDS.slice(8)) {
          expect(game.players.has(id)).toBe(false);
          expect(ctx.storage.sql.exec('SELECT id FROM players WHERE id = ?', id).toArray()).toHaveLength(0);
        }
        const messages = broadcast.mock.calls.map(([message]) => message);
        const leaves = messages.filter(message => message.type === 'playerLeft');
        const joins = messages.filter(message => message.type === 'playerJoined');
        expect(leaves.map(message => message.id)).toEqual(PERSISTENT_BOT_IDS);
        expect(joins.map(message => message.player.name)).toEqual(game.botRoster.map(bot => bot.name));
        expect(messages.indexOf(leaves[10])).toBeLessThan(messages.indexOf(joins[0]));
        expect(messages.find(message => message.type === 'gameReset')).toBeDefined();
        return game.botRoster;
      } finally {
        rng.mockRestore(); broadcast.mockRestore(); dispose.mockRestore();
        if (game.chaosTimer) clearInterval(game.chaosTimer); game.chaosTimer = null;
      }
    });
    await evictDurableObject(stub);
    await stub.ensurePersistentBots();
    await runInDurableObject(stub, (instance: GameRoom) => {
      const game = instance as unknown as Internals;
      expect(game.botRoster).toEqual(after);
      expect([...game.players.keys()].filter(id => id.startsWith('rd-ai-'))).toEqual(after.map(bot => bot.id));
    });
  });

});
