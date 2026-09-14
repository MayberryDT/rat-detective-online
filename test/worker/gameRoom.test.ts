import {createMovementAllowance} from '../../src/worker/validation';
import { readSocketMessage } from './socketMessages';
import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { createAssignment } from '../../src/shared/assignments';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONNECTIONS, MAX_PLAYERS, PROTOCOL_VERSION, DEFAULT_ROOM_NAME, type PlayerData, type ServerMessage } from '../../src/shared/networkProtocol';
import { GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { worldSpawnPoints } from '../../src/shared/playerSpawns';
import { parseServerMessage } from '../../src/shared/messageValidation';
import { WORLD_LAYOUT_VERSION } from '../../src/shared/worldSpec';
import { CHECKPOINT_MS, GameRoom, STALE_PLAYER_MS } from '../../src/worker/GameRoom';
import type { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import type { ClientMessage, RoundState } from '../../src/shared/networkProtocol';

const appearance = {
  hatType: 'fedora' as const,
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

function collect(ws: WebSocket) {
  const messages: ServerMessage[] = [];
  ws.addEventListener('message', (event) => {
    const message=readSocketMessage(ws,event.data);if(message)messages.push(message);
  });
  return {
    messages,
    async waitFor<T extends ServerMessage['type']>(
      type: T,
      match: ((message: Extract<ServerMessage, { type: T }>) => boolean) | number = () => true,
      timeoutMs = 3_000,
    ): Promise<Extract<ServerMessage, { type: T }>> {
      const predicate = typeof match === 'number' ? () => true : match;
      const budget = typeof match === 'number' ? match : timeoutMs;
      const started = Date.now();
      while (Date.now() - started < budget) {
        const index = messages.findIndex(
          (message) => message.type === type && predicate(message as Extract<ServerMessage, { type: T }>),
        );
        if (index !== -1) {
          return messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`timed out waiting for ${type}: ${messages.map((message) => message.type).join(', ') || 'none'}`);
    },
  };
}

const openSockets = new Set<WebSocket>();
afterEach(async () => {
  await Promise.all([...openSockets].map(ws => new Promise<void>((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('WebSocket test cleanup timed out')), 2_000);
    ws.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'test cleanup');
  })));
  openSockets.clear();
});

async function openClient(room: string, sharedFeed = false, query = '') {
  const local=room!==DEFAULT_ROOM_NAME,origin=local?'http://localhost':'https://rat-detective.test';
  const response = await SELF.fetch(`${origin}/ws?room=${room}${sharedFeed ? '&receive=welcome-only' : ''}${query}`, {
    headers: { Upgrade: 'websocket', ...(local?{Origin:origin}:{}) },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  expect(ws).toBeTruthy();
  ws!.accept();
  openSockets.add(ws!);
  return { ws: ws!, inbox: collect(ws!) };
}

function joinPayload(name: string, protocolVersion = PROTOCOL_VERSION) {
  return JSON.stringify({ type: 'join', protocolVersion, name, appearance });
}

describe('GameRoom websockets', () => {
  it('combines a pending shooter pose with its shot for the negotiated tuple audience',async()=>{
    const room=`graybox-combined-${crypto.randomUUID()}`,observer=await openClient(room,false,'&chaos=compact-v2&movement=tuple-v1'),shooter=await openClient(room);
    observer.ws.send(joinPayload('Observer'));const ow=await observer.inbox.waitFor('welcome');
    shooter.ws.send(joinPayload('Shooter'));const sw=await shooter.inbox.waitFor('welcome');
    let movedX=0;
    await runInDurableObject(env.GAME_ROOM.getByName(room),(instance:GameRoom,ctx)=>{
      const socket=ctx.getWebSockets().find(ws=>(ws.deserializeAttachment() as {playerId:string}).playerId===ow.id)!;
      const send=vi.spyOn(socket,'send');
      try {
        const game=instance as any;
        const player=game.players.get(sw.id);movedX=player.x+.25;
        game.handleMovement(sw.id,{type:'updateMovement',position:{x:movedX,y:player.y,z:player.z},rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}});
        game.handleShoot(sw.id,{type:'shoot',shotId:'combined',origin:{x:movedX,y:player.y+1.4,z:player.z},direction:{x:1,y:0,z:0}});
        const messages=send.mock.calls.map(call=>JSON.parse(String(call[0])).message);
        expect(messages).toHaveLength(1);expect(messages[0]).toMatchObject({type:'playerShot',shooterId:sw.id});
        expect(messages[0].move[0]).toBe(sw.id);expect(messages[0].move[2]).toBe(movedX);
      } finally {send.mockRestore();}
    });
    expect((await observer.inbox.waitFor('playerShot')).movement?.player.x).toBe(movedX);
  });
  it('isolates a throwing socket and persists a death before delivering it to healthy peers',async()=>{
    const room=`failure-${crypto.randomUUID()}`,bad=await openClient(room),a=await openClient(room),b=await openClient(room);
    bad.ws.send(joinPayload('Broken'));const badWelcome=await bad.inbox.waitFor('welcome');
    a.ws.send(joinPayload('Shooter'));const aw=await a.inbox.waitFor('welcome');
    b.ws.send(joinPayload('Victim'));const bw=await b.inbox.waitFor('welcome');
    await runInDurableObject(env.GAME_ROOM.getByName(room),async(instance:GameRoom,ctx)=>{
      const socket=ctx.getWebSockets().find(ws=>(ws.deserializeAttachment() as {playerId:string}).playerId===badWelcome.id)!;
      const fail=vi.spyOn(socket,'send').mockImplementation(()=>{throw Error('Injected send failure');});
      try {
        await (instance as any).handleHit(aw.id,{type:'hit',victimId:bw.id,damage:3});
        expect(ctx.storage.sql.exec<{count:number}>("SELECT COUNT(*) AS count FROM pending_events WHERE player_id = ? AND type = 'respawn'",bw.id).one().count).toBe(1);
      } finally { fail.mockRestore(); }
    });
    expect((await a.inbox.waitFor('playerDamaged')).id).toBe(bw.id);
    expect((await a.inbox.waitFor('playerDied')).victimId).toBe(bw.id);
    await a.inbox.waitFor('scoreboardUpdate');
  });

  it('bounds malformed ingress and clears unjoined connection buckets on close',async()=>{
    const room=`ingress-${crypto.randomUUID()}`,client=await openClient(room),stub=env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub,async(instance:GameRoom,ctx)=>{
      const socket=ctx.getWebSockets()[0];
      for(let i=0;i<100;i++)await instance.webSocketMessage(socket,'!');
      await instance.webSocketClose(socket);
      expect((instance as any).rateLimiter.size).toBe(0);
    });
    expect(client.inbox.messages.filter(m=>m.type==='error').length).toBeLessThanOrEqual(1);
  });

  it('persists Tampering death and respawn with no player kill or false kill feed attribution',async()=>{
    const room=`graybox-case-death-${crypto.randomUUID()}`;
    const observer=await openClient(room),victim=await openClient(room);
    observer.ws.send(joinPayload('Observer'));const ow=await observer.inbox.waitFor('welcome');
    victim.ws.send(joinPayload('Captain Crawley'));const vw=await victim.inbox.waitFor('welcome');
    await runInDurableObject(env.GAME_ROOM.getByName(room),async(instance:GameRoom,ctx)=>{
      const game=instance as any;
      await game.handleHit(null,{type:'hit',victimId:vw.id,damage:3},{x:145,y:0,z:0});
      expect(game.players.get(ow.id).kills).toBe(0);
      expect(game.players.get(vw.id)).toMatchObject({hp:0,deaths:1,kills:0});
      expect(game.chaos.snapshot(false).corpses.find((c:any)=>c.victimId===vw.id).owner).toBeNull();
      expect(ctx.storage.sql.exec<{count:number}>("SELECT COUNT(*) AS count FROM pending_events WHERE player_id = ? AND type = 'respawn'",vw.id).one().count).toBe(1);
    });
    expect(await observer.inbox.waitFor('playerDamaged')).toMatchObject({id:vw.id,attackerId:null,cause:'evidence-tampering'});
    expect(await observer.inbox.waitFor('playerDied')).toMatchObject({victimName:'Captain Crawley',killerId:null,killerName:null,cause:'evidence-tampering'});
    const scores=await observer.inbox.waitFor('scoreboardUpdate',m=>m.scores.some(s=>s.id===vw.id&&s.deaths===1));
    expect(scores.scores.every(s=>s.kills===0)).toBe(true);
  });

  it('bounds repeated incompatible joins, including join rate-limit replies',async()=>{
    const room=`join-ingress-${crypto.randomUUID()}`,client=await openClient(room);
    await runInDurableObject(env.GAME_ROOM.getByName(room),async(instance:GameRoom,ctx)=>{
      const socket=ctx.getWebSockets()[0],send=vi.spyOn(socket,'send');
      const payload=JSON.stringify({...JSON.parse(joinPayload('Old client')),protocolVersion:PROTOCOL_VERSION-1});
      for(let i=0;i<100;i++)await instance.webSocketMessage(socket,payload);
      expect(send).toHaveBeenCalledTimes(1);
      expect((instance as any).failedSockets.has(socket)).toBe(true);
      send.mockRestore();
      await instance.webSocketClose(socket);
      expect((instance as any).rateLimiter.size).toBe(0);
    });
    client.ws.close(1000,'done');
  });

  it('accepts bounded diagnostics on the joined local socket at most once per four seconds', async () => {
    const stub = env.GAME_ROOM.getByName(`diagnostics-${crypto.randomUUID()}`);
    const response = await stub.fetch('http://localhost/ws', {
      headers: { Upgrade: 'websocket', Origin: 'http://localhost' },
    });
    const ws = response.webSocket!;
    ws.accept(); openSockets.add(ws);
    const inbox = collect(ws);
    ws.send(joinPayload('Local tester'));
    await inbox.waitFor('welcome');
    await runInDurableObject(stub, async (instance, ctx) => {
      const room = instance as GameRoom;
      const internals = room as unknown as { clock: () => number };
      let now = Date.now(); internals.clock = () => now;
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const server = ctx.getWebSockets()[0];
        const report = JSON.stringify({ type: 'diagnostics', report: { longestFrameMs: 42 } });
        await room.webSocketMessage(server, report);
        await room.webSocketMessage(server, report);
        expect(spy.mock.calls.filter(call => String(call[0]).includes('client diagnostics'))).toHaveLength(1);
        now += 4000;
        await room.webSocketMessage(server, report);
        expect(spy.mock.calls.filter(call => String(call[0]).includes('client diagnostics'))).toHaveLength(2);
      } finally { spy.mockRestore(); }
    });
  });

  it('keeps shared-feed bot sockets authoritative without sending eleven redundant world feeds', async () => {
    const room = `shared-feed-${crypto.randomUUID()}`;
    const human = await openClient(room);
    human.ws.send(joinPayload('Human'));
    await human.inbox.waitFor('welcome');
    const bot = await openClient(room, true);
    bot.ws.send(joinPayload('Bot'));
    const welcome = await bot.inbox.waitFor('welcome');
    await human.inbox.waitFor('playerJoined');
    const movedX=welcome.player.x+.25;
    bot.ws.send(JSON.stringify({ type: 'updateMovement', position: { x:movedX, y:welcome.player.y, z:welcome.player.z },
      rotation: { x: 0, y: 0, z: 0, w: 1 }, meshRotation: { x: 0, y: 0, z: 0, w: 1 } }));
    const moved = await human.inbox.waitFor('playerMoved');
    expect(moved.at).toBeGreaterThan(0);
    expect(moved.player.id).toBe(welcome.id);
    expect(moved.player.x).toBe(movedX);
    bot.ws.send(JSON.stringify({ type: 'shoot', shotId: 'shared-feed-shot', origin: { x:movedX, y:welcome.player.y+1.4, z:welcome.player.z }, direction: { x: 0, y: 0, z: 1 } }));
    expect((await human.inbox.waitFor('playerShot')).shooterId).toBe(welcome.id);
    bot.ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
    await bot.inbox.waitFor('pong');
    expect(bot.inbox.messages).toEqual([]);
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, async (_instance: GameRoom, state) => {
      const attachments = state.getWebSockets().map(ws => ws.deserializeAttachment() as {playerId: string; receiveMode?: string});
      expect(attachments.find(a => a.playerId === welcome.id)?.receiveMode).toBe('welcome-only');
    });
    await evictDurableObject(stub);
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    await late.inbox.waitFor('welcome');
    await human.inbox.waitFor('playerJoined');
    bot.ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
    await bot.inbox.waitFor('pong');
    expect((await bot.inbox.waitFor('welcome')).id).toBe(welcome.id);
    expect(bot.inbox.messages).toEqual([]);
  });

  it('shares the graybox layout and safe spawn positions between room participants', async () => {
    const room = 'graybox-' + crypto.randomUUID();
    const first = await openClient(room);
    first.ws.send(joinPayload('Alpha'));
    const welcome = await first.inbox.waitFor('welcome');
    expect(welcome.world.version).toBe(GRAYBOX_VERSION);
    expect(worldSpawnPoints(welcome.world)).toContainEqual({x:welcome.player.x,y:welcome.player.y,z:welcome.player.z});
    const second = await openClient(room);
    second.ws.send(joinPayload('Beta'));
    const other = await second.inbox.waitFor('welcome');
    expect(other.world).toEqual(welcome.world);
    expect(worldSpawnPoints(other.world)).toContainEqual({x:other.player.x,y:other.player.y,z:other.player.z});
    expect(Math.hypot(other.player.x-welcome.player.x,other.player.z-welcome.player.z)).toBeGreaterThan(60);
  });

  it('allocates twelve separated server joins, respawns, and full-round reset positions',async()=>{
    const room=`graybox-spawn-${crypto.randomUUID()}`;
    const ids:string[]=[];
    let watcher:Awaited<ReturnType<typeof openClient>>|undefined;
    for (let i=0;i<12;i++) {
      const client=await openClient(room);
      watcher??=client;
      client.ws.send(joinPayload(`Rat ${i}`));
      const welcome=await client.inbox.waitFor('welcome');
      ids.push(welcome.id);
    }
    const stub=env.GAME_ROOM.getByName(room);
    type Internals={round:RoundState;players:Map<string,PlayerData>;chaosTimer:ReturnType<typeof setInterval>|null};
    const assertSpread=(players:PlayerData[])=>{
      expect(players).toHaveLength(12);
      for (let i=0;i<players.length;i++) for (let j=0;j<i;j++) {
        expect(Math.hypot(players[i].x-players[j].x,players[i].z-players[j].z)).toBeGreaterThan(60);
      }
    };
    await runInDurableObject(stub,async(instance:GameRoom,state)=>{
      const game=instance as unknown as Internals;
      if(game.chaosTimer)clearInterval(game.chaosTimer);
      game.chaosTimer=null;
      assertSpread([...game.players.values()]);
      const dead=game.players.get(ids[0])!;
      dead.hp=0;
      state.storage.sql.exec('INSERT INTO pending_events (id,type,player_id,due_at) VALUES (?,?,?,?)','spawn-test','respawn',dead.id,0);
      await state.storage.setAlarm(Date.now()+60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await watcher!.inbox.waitFor('playerRespawn',m=>m.id===ids[0]);
    await runInDurableObject(stub,async(instance:GameRoom,state)=>{
      const game=instance as unknown as Internals;
      assertSpread([...game.players.values()]);
      for(const player of game.players.values()){player.hp=0;player.x=0;player.z=0;}
      game.round={phase:'won',resetAt:0};
      state.storage.sql.exec('INSERT INTO pending_events (id,type,player_id,due_at) VALUES (?,?,?,?)','reset-test','reset',null,0);
      await state.storage.setAlarm(Date.now()+60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await watcher!.inbox.waitFor('gameReset');
    await runInDurableObject(stub,(instance:GameRoom)=>{
      assertSpread([...(instance as unknown as Internals).players.values()]);
    });
  });

  it('sends an atomic welcome snapshot with protocol, world, round, and currentPlayers', async () => {
    const room = `snap-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Alpha'));
    const welcome = await first.inbox.waitFor('welcome');
    expect(first.inbox.messages.some(m=>m.type==='currentPlayers')).toBe(false);

    expect(welcome.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(welcome.world.version).toBe(WORLD_LAYOUT_VERSION);
    expect(welcome.round.phase).toBe('playing');
    expect(welcome.players[welcome.id]?.name).toBe('Alpha');
    expect(welcome.player.hp).toBe(3);
    expect(typeof welcome.serverTime).toBe('number');

    const second = await openClient(room);
    second.ws.send(joinPayload('Beta'));
    const secondWelcome = await second.inbox.waitFor('welcome');
    expect(secondWelcome.players[welcome.id]?.name).toBe('Alpha');
    expect((await first.inbox.waitFor('playerJoined')).player.id).toBe(secondWelcome.id);
  });

  it('rejects an unsupported join protocol version with a visible error', async () => {
    const client = await openClient(`ver-${crypto.randomUUID()}`);
    client.ws.send(joinPayload('Old Rat', 0));
    const error = await client.inbox.waitFor('error');
    expect(error.message).toMatch(/protocol version/i);
  });

  it('delivers an accepted graybox shot in a client-valid authoritative snapshot and rejects shots after victory', async () => {
    const room = `graybox-shots-${crypto.randomUUID()}`;
    const client = await openClient(room);
    client.ws.send(joinPayload('Shooter'));
    const welcome = await client.inbox.waitFor('welcome');
    const observer=await openClient(room);observer.ws.send(joinPayload('Observer'));
    await observer.inbox.waitFor('welcome');
    const shot = { type: 'shoot' as const, shotId: 'visible-shot',
      origin: { x: welcome.player.x, y: welcome.player.y + 1.5, z: welcome.player.z },
      direction: { x: 0, y: 1, z: 0 } };
    client.ws.send(JSON.stringify(shot));
    const born=await client.inbox.waitFor('playerShot',message=>message.shotId===shot.shotId);
    expect(born.origin).toEqual(shot.origin);
    expect(born.launch).toEqual({at:expect.any(Number),balls:[{id:shot.shotId,velocity:{x:0,y:175,z:0}}]});
    expect(parseServerMessage(born)).toEqual(born);
    expect(await client.inbox.waitFor('shotResult',message=>message.shotId===shot.shotId&&message.outcome==='first-step')).toMatchObject({ballId:shot.shotId,epoch:expect.any(String),tick:expect.any(Number)});
    const observed=await observer.inbox.waitFor('playerShot',message=>message.shotId===shot.shotId);
    expect(observed).toMatchObject({shooterId:welcome.id,origin:shot.origin,direction:shot.direction});
    expect(observed.launch).toBeUndefined();
    const snapshot = await client.inbox.waitFor('chaos', message => message.state.shots.some(ball => ball.id === shot.shotId));
    expect(parseServerMessage(JSON.stringify(snapshot))).not.toBeNull();
    expect(snapshot.state.shots.find(ball => ball.id === shot.shotId)?.owner).toBe(welcome.id);
    await runInDurableObject(env.GAME_ROOM.getByName(room), (instance: GameRoom) => {
      const game = instance as unknown as { round: RoundState; handleShoot: (id:string, descriptor:Extract<ClientMessage,{type:'shoot'}>) => void; chaos: ChaosSimulation };
      game.round = { phase:'won', startedAt:Date.now(), winnerId:welcome.id, winnerName:'Shooter', kills:20, resetAt:Date.now()+6000 };
      game.handleShoot(welcome.id, {...shot,shotId:'after-victory'});
      expect(game.chaos.snapshot(false).shots.some(ball=>ball.id==='after-victory')).toBe(false);
    });
  });

  it('resolves a crossed power-up immediately through a sequenced pickup intent',async()=>{
    const room=`graybox-pickup-intent-${crypto.randomUUID()}`,client=await openClient(room);
    client.ws.send(joinPayload('Collector'));const welcome=await client.inbox.waitFor('welcome');
    let target:{id:string;x:number;y:number;z:number;availableAt?:number}|undefined;
    await runInDurableObject(env.GAME_ROOM.getByName(room),(instance:GameRoom)=>{
      const game=instance as any;game.startChaos();target=game.chaos.snapshot(false).pickups.find((p:any)=>p.kind==='quick-fix');
      const player=game.players.get(welcome.id);player.hp=1;player.x=target!.x-2;player.y=target!.y-.8;player.z=target!.z;
      game.movementAllowances.set(welcome.id,createMovementAllowance(game.now()-1000));
    });
    const movement={seq:(welcome.movementSeq??0)+1,position:{x:target!.x+2,y:target!.y-.8,z:target!.z},
      rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}};
    client.ws.send(JSON.stringify({type:'pickupIntent',interactionId:'crossing',target:'pickup',targetId:target!.id,generation:target!.availableAt??0,movement}));
    expect(await client.inbox.waitFor('pickupResult',message=>message.interactionId==='crossing')).toMatchObject({accepted:true,pickup:'quick-fix',playerId:welcome.id});
    expect(await client.inbox.waitFor('playerHealed',message=>message.id===welcome.id)).toMatchObject({hp:3,cause:'pickup'});
  });

  it('relays shot descriptors and restores a dead player through the alarm', async () => {
    const room = `combat-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Shooter'));
    const shooter = await first.inbox.waitFor('welcome');

    const second = await openClient(room);
    second.ws.send(joinPayload('Victim'));
    const victim = await second.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');

    first.ws.send(
      JSON.stringify({
        type: 'shoot',
        shotId: 'shot-1',
        origin: { x: shooter.player.x, y: shooter.player.y + 1.45, z: shooter.player.z },
        direction: { x: 0, y: 0, z: 1 },
      }),
    );
    const shot = await second.inbox.waitFor('playerShot');
    expect(shot).toMatchObject({ shooterId: shooter.id, shotId: 'shot-1', direction: { x: 0, y: 0, z: 1 } });
    expect('target' in shot).toBe(false);

    const stub = env.GAME_ROOM.getByName(room);
    const killedAt = Date.now();
    await runInDurableObject(stub, instance => {
      (instance as unknown as {clock: () => number}).clock = () => killedAt;
    });
    first.ws.send(JSON.stringify({ type: 'hit', victimId: victim.id, damage: 3 }));
    const died = await second.inbox.waitFor('playerDied');
    expect(died.victimId).toBe(victim.id);
    expect(died.respawnAt).toBe(killedAt + 3_000);

    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec('UPDATE pending_events SET due_at = 0');
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const respawn = await second.inbox.waitFor('playerRespawn');
    expect(respawn).toMatchObject({ id: victim.id, hp: 3 });
    expect(Number.isFinite(respawn.x)).toBe(true);
  });

  it('drains overdue respawns from live ticks without waiting for an alarm, once only', async () => {
    const room = `live-respawn-${crypto.randomUUID()}`;
    const first = await openClient(room);first.ws.send(joinPayload('Shooter'));
    await first.inbox.waitFor('welcome');
    const second = await openClient(room);second.ws.send(joinPayload('Victim'));
    const victim = await second.inbox.waitFor('welcome');
    first.ws.send(JSON.stringify({type:'hit',victimId:victim.id,damage:3}));
    await second.inbox.waitFor('playerDied');
    const stub=env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance, state) => {
      const live=instance as unknown as {players:Map<string,PlayerData>;processLiveDeadlines:(now:number)=>void};
      live.players.get(victim.id)!.respawnAt=0;
      state.storage.sql.exec('UPDATE pending_events SET due_at = 0');
      live.processLiveDeadlines(Date.now());
      live.processLiveDeadlines(Date.now());
      expect(live.players.get(victim.id)!.hp).toBe(3);
      expect(state.storage.sql.exec('SELECT * FROM pending_events').toArray()).toHaveLength(0);
    });
    expect(await second.inbox.waitFor('playerRespawn')).toMatchObject({id:victim.id,hp:3});
    expect(second.inbox.messages.filter(m=>m.type==='playerRespawn')).toHaveLength(0);
  });

  it('pins every dead player to resetAt and cancels pending respawns on a winning hit', async () => {
    const room = `win-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Champ'));
    const champ = await first.inbox.waitFor('welcome');
    const earlyClient = await openClient(room);
    earlyClient.ws.send(joinPayload('Early'));
    const early = await earlyClient.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');
    const lostClient = await openClient(room);
    lostClient.ws.send(joinPayload('Lost'));
    const lost = await lostClient.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');

    first.ws.send(JSON.stringify({ type: 'hit', victimId: early.id, damage: 3 }));
    const earlyDeath = await earlyClient.inbox.waitFor('playerDied');
    expect(earlyDeath.respawnAt).toBeGreaterThan(Date.now());

    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const players = (instance as unknown as { players: Map<string, { kills: number }> }).players;
      const shooter = players.get(champ.id);
      if (shooter) shooter.kills = 19;
    });

    first.ws.send(JSON.stringify({ type: 'hit', victimId: lost.id, damage: 3 }));
    const died = await lostClient.inbox.waitFor('playerDied', (message) => message.victimId === lost.id);
    const won = await lostClient.inbox.waitFor('gameWon');
    expect(died.respawnAt).toBe(won.resetAt);
    expect(earlyDeath.respawnAt).not.toBe(won.resetAt);

    await runInDurableObject(stub, (_instance, state) => {
      const pending = state.storage.sql
        .exec<{ type: string; count: number }>('SELECT type, COUNT(*) as count FROM pending_events GROUP BY type')
        .toArray();
      expect(pending).toEqual([{ type: 'reset', count: 1 }]);
      const stored = state.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE id = ?', early.id).one();
      expect(JSON.parse(stored.data).respawnAt).toBe(won.resetAt);
      state.storage.sql.exec('UPDATE pending_events SET due_at = 0');
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const reset = await lostClient.inbox.waitFor('gameReset');
    expect(reset.round.phase).toBe('playing');
  });

  it('keeps playing at twenty actual kills, then closes the assignment, freezes combat and resets', async () => {
    const room = `graybox-case-win-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Carrier'));
    const carrier = await first.inbox.waitFor('welcome');
    const second = await openClient(room);
    second.ws.send(joinPayload('Victim'));
    const victim = await second.inbox.waitFor('welcome');
    const third = await openClient(room);
    third.ws.send(joinPayload('Observer'));
    const observer = await third.inbox.waitFor('welcome');
    const stub = env.GAME_ROOM.getByName(room);
    const now = Date.now();
    type Internals = {
      players: Map<string, PlayerData>;
      chaos: ChaosSimulation;
      chaosTimer: ReturnType<typeof setInterval> | null;
      round: RoundState;
      now: () => number;
      finishAssignment: () => void;
      handleHit: (id: string, hit: Extract<ClientMessage, {type:'hit'}>, incoming?: {x:number;y:number;z:number}) => Promise<void>;
    };
    await runInDurableObject(stub, async (instance: GameRoom, state) => {
      const game = instance as unknown as Internals;
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null;
      game.now = () => now;
      const champion = game.players.get(carrier.id)!;
      // Acquire through the real simulation; no client-supplied bonus field.
      game.chaos.caseBody.position.set(champion.x, champion.y + .8, champion.z);
      game.chaos.step(0, now);
      expect(game.chaos.caseHolderId).toBe(carrier.id);
      champion.kills = 19;
      await game.handleHit(carrier.id, {type:'hit',victimId:victim.id,damage:3}, {x:1,y:0,z:0});
      expect(champion.kills).toBe(20);
      expect(game.round.phase).toBe('playing');
      const assignment=createAssignment('closing-time',now);assignment.liveAt=now;assignment.remainingMs=1;
      game.chaos.setAssignment(assignment);game.chaos.step(.001,now+1);game.finishAssignment();
      expect(game.players.get(victim.id)!.deaths).toBe(1);
      expect(game.round).toMatchObject({phase:'won',winnerId:carrier.id,kills:20,resetAt:now+6000});
      await game.handleHit(carrier.id, {type:'hit',victimId:observer.id,damage:3}, {x:1,y:0,z:0});
      await game.handleHit(observer.id, {type:'hit',victimId:carrier.id,damage:3}, {x:1,y:0,z:0});
      expect(game.players.get(observer.id)!.hp).toBe(3);
      expect(champion.hp).toBe(3);
      expect(champion.kills).toBe(20);
      expect(state.storage.sql.exec<{type:string;due_at:number}>('SELECT type, due_at FROM pending_events').toArray())
        .toEqual([{type:'reset',due_at:now+6000}]);
    });
    const won = await first.inbox.waitFor('gameWon');
    expect(won).toMatchObject({winnerId:carrier.id,kills:20,resetAt:now+6000,assignment:{id:'closing-time',phase:'closed'}});
    const board = await first.inbox.waitFor('scoreboardUpdate', message => message.scores.some(p => p.id === carrier.id && p.kills === 20));
    expect(board.scores.find(p => p.id === victim.id)!.deaths).toBe(1);
    await runInDurableObject(stub, async (instance:GameRoom) => {
      (instance as unknown as Internals).now=()=>now+6000;
      await instance.alarm();
    });
    await first.inbox.waitFor('gameReset');
    await runInDurableObject(stub, (instance: GameRoom, state) => {
      const game = instance as unknown as Internals;
      expect(game.round.phase).toBe('playing');
      expect(game.chaos.caseHolderId).toBeNull();
      for (const player of game.players.values()) {
        expect(player).toMatchObject({hp:3,kills:0,deaths:0});
        expect(player.respawnAt).toBeUndefined();
      }
      expect(state.storage.sql.exec('SELECT * FROM pending_events').toArray()).toEqual([]);
    });
    expect(first.inbox.messages.filter(message => message.type === 'gameWon')).toHaveLength(0);
  });

  it('recovers a 2.5s movement checkpoint without a forced persist', async () => {
    const room = `check-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Walker'));
    const welcome = await first.inbox.waitFor('welcome');
    const target={x:welcome.player.x+.25,y:welcome.player.y,z:welcome.player.z};
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const roomInstance = instance as unknown as {
        lastCheckpointAt: Map<string, number>;
        handleMovement: (playerId: string, message: unknown) => void;
      };
      roomInstance.lastCheckpointAt.set(welcome.id, Date.now() - CHECKPOINT_MS - 10);
      roomInstance.handleMovement(welcome.id, {
        type: 'updateMovement',
        position: target,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        meshRotation: { x: 0, y: 0, z: 0, w: 1 },
      });
    });

    await runInDurableObject(stub, (_instance, state) => {
      const stored = JSON.parse(
        state.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE id = ?', welcome.id).one().data,
      ) as PlayerData;
      expect(stored.x).toBe(target.x);
      expect(stored.z).toBe(target.z);
    });

    await evictDurableObject(stub, { webSockets: 'hibernate' });
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    const lateWelcome = await late.inbox.waitFor('welcome');
    expect(lateWelcome.world.seed).toBe(welcome.world.seed);
    expect(lateWelcome.players[welcome.id]?.x).toBe(target.x);
    expect(lateWelcome.players[welcome.id]?.z).toBe(target.z);
  });

  it('keeps an attached player whose last_active_at is older than two minutes', async () => {
    const room = `stale-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Sleeper'));
    const welcome = await first.inbox.waitFor('welcome');
    const target={x:welcome.player.x+.25,y:welcome.player.y,z:welcome.player.z};
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const roomInstance = instance as unknown as {
        lastCheckpointAt: Map<string, number>;
        handleMovement: (playerId: string, message: unknown) => void;
      };
      roomInstance.lastCheckpointAt.set(welcome.id, Date.now() - CHECKPOINT_MS - 10);
      roomInstance.handleMovement(welcome.id, {
        type: 'updateMovement',
        position: target,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        meshRotation: { x: 0, y: 0, z: 0, w: 1 },
      });
    });

    await runInDurableObject(stub, (_instance, state) => {
      const aged = Date.now() - STALE_PLAYER_MS - 5_000;
      state.storage.sql.exec('UPDATE players SET last_active_at = ?, updated_at = ? WHERE id = ?', aged, aged, welcome.id);
    });

    await evictDurableObject(stub, { webSockets: 'hibernate' });
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    const lateWelcome = await late.inbox.waitFor('welcome');
    expect(lateWelcome.players[welcome.id]?.name).toBe('Sleeper');
    expect(lateWelcome.players[welcome.id]?.x).toBe(target.x);
  });

  it('rejects impossible motion and tells every client including the mover', async () => {
    const room = `edge-${crypto.randomUUID()}`;
    const first = await openClient(room);
    first.ws.send(joinPayload('Runner'));
    const welcome = await first.inbox.waitFor('welcome');
    const second = await openClient(room);
    second.ws.send(joinPayload('Witness'));
    await second.inbox.waitFor('welcome');
    await first.inbox.waitFor('playerJoined');

    first.ws.send(
      JSON.stringify({
        type: 'updateMovement',
        position: { x: 2500, y: 2, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        meshRotation: { x: 0, y: 0, z: 0, w: 1 },
      }),
    );
    const selfCorrection = await first.inbox.waitFor('playerCorrected');
    const peerCorrection = await second.inbox.waitFor('playerCorrected');
    expect(selfCorrection.player).toMatchObject({ id: welcome.id, x: welcome.player.x, z: welcome.player.z });
    expect(peerCorrection.player.x).toBe(welcome.player.x);
  });

  it('rejects server-time speed hacks without applying a second collision controller',async()=>{
    const room=`graybox-movement-security-${crypto.randomUUID()}`,client=await openClient(room);
    client.ws.send(joinPayload('Bounded Rat'));const welcome=await client.inbox.waitFor('welcome');
    await runInDurableObject(env.GAME_ROOM.getByName(room),(instance:GameRoom)=>{
      const game=instance as any,player=game.players.get(welcome.id),start=Date.now();
      Object.assign(player,{x:0,y:0,z:0});game.lastActiveAt.set(welcome.id,start);game.movementAllowances.set(welcome.id,createMovementAllowance(start));
      game.handleMovement(welcome.id,{type:'updateMovement',seq:1,position:{x:40,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}},start+40);
      expect(player).toMatchObject({x:0,y:0,z:0});
      Object.assign(player,{x:87,y:0,z:145});game.movementAllowances.set(welcome.id,createMovementAllowance(start));
      game.handleMovement(welcome.id,{type:'updateMovement',seq:2,position:{x:93,y:0,z:145},rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}},start+1000);
      expect(player).toMatchObject({x:93,y:0,z:145});
    });
  });

  it('accepts ordinary and boosted low-frame-rate poses delivered together after jitter',async()=>{
    const room=`graybox-movement-jitter-${crypto.randomUUID()}`,client=await openClient(room);
    client.ws.send(joinPayload('Jitter Rat'));const welcome=await client.inbox.waitFor('welcome');
    await runInDurableObject(env.GAME_ROOM.getByName(room),(instance:GameRoom)=>{
      const game=instance as any,player=game.players.get(welcome.id),start=Date.now();
      for(const speed of [18,18*1.45]){
        Object.assign(player,{x:0,y:0,z:0});game.lastMovementSequence.delete(welcome.id);
        game.movementAllowances.set(welcome.id,createMovementAllowance(start));game.lastActiveAt.set(welcome.id,start);
        // Two 125 ms client frames arrive in one edge event after 300 ms delay.
        for(let seq=1;seq<=2;seq++){
          const x=speed*.125*seq;
          game.handleMovement(welcome.id,{type:'updateMovement',seq,position:{x,y:0,z:0},
            rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}},start+300);
          expect(player.x).toBeCloseTo(x);
        }
      }
    });
  });

  it('rejects a 33rd websocket before accept and a 25th joined player after join', async () => {
    const room = `full-${crypto.randomUUID()}`;
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom) => {
      const roomInstance = instance as unknown as {
        players: Map<string, PlayerData>;
        lastActiveAt: Map<string, number>;
      };
      for (let i = 0; i < MAX_PLAYERS; i++) {
        const id = `seed-${i}`;
        roomInstance.players.set(id, {
          id,
          name: `Seed ${i}`,
          x: 0,
          y: 2,
          z: 0,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          meshQx: 0,
          meshQy: 0,
          meshQz: 0,
          meshQw: 1,
          hp: 3,
          kills: 0,
          deaths: 0,
          hatType: 'fedora',
          hatColor: 1,
          furColor: 1,
          coatColor: 1,
        });
        roomInstance.lastActiveAt.set(id, Date.now());
      }
    });
    const overflow = await openClient(room);
    overflow.ws.send(joinPayload('Too Many'));
    expect((await overflow.inbox.waitFor('error')).message).toMatch(/full/i);

    const sockets: WebSocket[] = [];
    const crowded = `conn-${crypto.randomUUID()}`;
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const client = await openClient(crowded);
      sockets.push(client.ws);
    }
    const blocked = await SELF.fetch(`http://localhost/ws?room=${crowded}`, {
      headers: { Upgrade: 'websocket', Origin:'http://localhost' },
    });
    expect(blocked.status).toBe(503);
    for (const socket of sockets) socket.close(1000, 'done');
  });

  it('adds last_active_at onto a legacy players table', async () => {
    const room = `legacy-${crypto.randomUUID()}`;
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, (instance: GameRoom, state) => {
      state.storage.sql.exec('DROP TABLE IF EXISTS players');
      state.storage.sql.exec('DROP TABLE IF EXISTS _sql_schema_migrations');
      state.storage.sql.exec(`
        CREATE TABLE players (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      state.storage.sql.exec(
        'INSERT INTO players (id, data, updated_at) VALUES (?, ?, ?)',
        'legacy-rat',
        JSON.stringify({
          id: 'legacy-rat',
          name: 'Legacy',
          x: 4,
          y: 2,
          z: 5,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          meshQx: 0,
          meshQy: 0,
          meshQz: 0,
          meshQw: 1,
          hp: 3,
          kills: 0,
          deaths: 0,
          hatType: 'fedora',
          hatColor: 1,
          furColor: 1,
          coatColor: 1,
        }),
        Date.now(),
      );
      (instance as unknown as { migrate: () => void }).migrate();
      const columns = state.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(players)')
        .toArray()
        .map((row) => row.name);
      expect(columns).toContain('last_active_at');
    });
  });

  it('checkpoints actual 25 Hz WebSocket movement and preserves it through a heartbeat', async () => {
    const room = `traffic-${crypto.randomUUID()}`;
    const client = await openClient(room);
    const observers = await Promise.all([openClient(room), openClient(room), openClient(room)]);
    client.ws.send(joinPayload('Mover'));
    observers.forEach((watcher, i) => watcher.ws.send(joinPayload(`Observer ${i}`)));
    const welcome = await client.inbox.waitFor('welcome');
    await Promise.all(observers.map(watcher => watcher.inbox.waitFor('welcome')));
    const stub = env.GAME_ROOM.getByName(room);
    await runInDurableObject(stub, async (instance: GameRoom, state) => {
      const internal = instance as any;
      const originalClock = internal.clock;
      const origin = Date.now();
      let now = origin;
      internal.clock = () => now;
      internal.lastCheckpointAt.set(welcome.id, origin);
      Object.assign(internal.players.get(welcome.id),{x:0,y:2,z:15});
      internal.movementAllowances.set(welcome.id,createMovementAllowance(origin));
      const socket = state.getWebSockets().find(ws =>
        (ws.deserializeAttachment() as { playerId?: string }).playerId === welcome.id)!;
      const before = internal.broadcasts;
      const stringify = vi.spyOn(JSON, 'stringify');
      let changedCheckpoints = 0;
      let previousStamp = state.storage.sql.exec<{ updated_at: number }>('SELECT updated_at FROM players WHERE id = ?', welcome.id).one().updated_at;
      try {
        for (let tick = 1; tick <= 150; tick++) {
          now = origin + tick * 40;
          await instance.webSocketMessage(socket, JSON.stringify({ type: 'updateMovement',
            position: { x: tick / 10, y: 2, z: 15 },
            rotation: { x: 0, y: 0, z: 0, w: 1 }, meshRotation: { x: 0, y: 0, z: 0, w: 1 } }));
          const row = state.storage.sql.exec<{ updated_at: number; data: string }>('SELECT updated_at, data FROM players WHERE id = ?', welcome.id).one();
          if (row.updated_at !== previousStamp) {
            changedCheckpoints++;
            expect((JSON.parse(row.data) as PlayerData).x).toBe(tick / 10);
            previousStamp = row.updated_at;
          }
        }
        expect(changedCheckpoints).toBe(2); // 2.52s and 5.04s; no forced lifecycle writes in this window.
        expect(internal.broadcasts - before).toBe(150);
        expect(stringify.mock.calls.filter(([value]) => value?.type === 'playerMoved')).toHaveLength(150);
        const row = state.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE id = ?', welcome.id).one();
        expect((JSON.parse(row.data) as PlayerData).x).toBe(12.6);
        now = origin + 8_000;
        await instance.webSocketMessage(socket, JSON.stringify({ type: 'ping', sentAt: now }));
        const heartbeatRow = state.storage.sql.exec<{ data: string; last_active_at: number }>('SELECT data, last_active_at FROM players WHERE id = ?', welcome.id).one();
        expect((JSON.parse(heartbeatRow.data) as PlayerData).x).toBe(15);
        expect(heartbeatRow.last_active_at).toBe(now);
      } finally { stringify.mockRestore(); internal.clock = originalClock; }
    });
    await evictDurableObject(stub);
    const late = await openClient(room);
    late.ws.send(joinPayload('Late'));
    const snapshot = await late.inbox.waitFor('welcome');
    expect(snapshot.players[welcome.id].x).toBe(15);
    for (const watcher of observers) {
      await watcher.inbox.waitFor('playerMoved', message => message.player.x === 15);
      expect(watcher.inbox.messages.filter(message => message.type === 'playerMoved')).toHaveLength(149);
      watcher.ws.close(1000, 'done');
    }
    client.ws.close(1000, 'done'); late.ws.close(1000, 'done');
  });

  it('suppresses redundant stationary poses while preserving the stop sample, timestamps, and checkpoints', async () => {
    const room = `stationary-${crypto.randomUUID()}`;
    const client = await openClient(room);
    client.ws.send(joinPayload('Still Rat'));
    const welcome = await client.inbox.waitFor('welcome');
    await runInDurableObject(env.GAME_ROOM.getByName(room), async (instance: GameRoom, state) => {
      const internal = instance as any;
      const originalClock = internal.clock, start = Date.now();
      let now = start;
      internal.clock = () => now; internal.lastCheckpointAt.set(welcome.id, start);
      Object.assign(internal.players.get(welcome.id),{x:15,y:2,z:15});internal.movementAllowances.set(welcome.id,createMovementAllowance(start));
      const socket = state.getWebSockets().find(ws =>
        (ws.deserializeAttachment() as { playerId?: string }).playerId === welcome.id)!;
      const move = (x: number) => JSON.stringify({ type: 'updateMovement', position: { x, y: 2, z: 15 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }, meshRotation: { x: 0, y: 0, z: 0, w: 1 } });
      const before = internal.broadcasts;
      try {
        for (let i = 1; i <= 150; i++) {
          now = start + i * 40;
          await instance.webSocketMessage(socket, move(15));
          if (i <= 2) expect(internal.broadcasts - before).toBe(i);
        }
        // At least 90% fewer broadcasts/serializations for idle clients, with
        // regular fresh samples and unchanged durable pose/liveness checkpoints.
        expect(internal.broadcasts - before).toBeGreaterThanOrEqual(12);
        expect(internal.broadcasts - before).toBeLessThanOrEqual(15);
        const stored = state.storage.sql.exec<{ data: string; updated_at: number }>('SELECT data, updated_at FROM players WHERE id = ?', welcome.id).one();
        expect(JSON.parse(stored.data).x).toBe(15); expect(stored.updated_at).toBeGreaterThanOrEqual(start + 5000);
        const idleBroadcasts = internal.broadcasts;
        now += 40; await instance.webSocketMessage(socket, move(16));
        expect(internal.broadcasts).toBe(idleBroadcasts + 1);
        now += 40; await instance.webSocketMessage(socket, move(9000));
        now += 40; await instance.webSocketMessage(socket, move(9000));
        expect(internal.broadcasts).toBe(idleBroadcasts + 3); // Every correction is delivered.
      } finally { internal.clock = originalClock; }
    });
    client.ws.close(1000, 'done');
  });

  it('lists attached public-room names and scores on GET /status', async () => {
    const first = await openClient(DEFAULT_ROOM_NAME);
    first.ws.send(joinPayload('One'));
    await first.inbox.waitFor('welcome');

    const one = await SELF.fetch('https://rat-detective.test/status');
    const oneBoard = (await one.json()) as {
      room: string;
      players: number;
      bots: number;
      phase: string;
      startedAt: number;
      scores: Array<{ name: string; kills: number; deaths: number }>;
    };
    expect(oneBoard.bots).toBe(7);
    expect(oneBoard).toMatchObject({
      room: DEFAULT_ROOM_NAME,
      players: oneBoard.bots+1,
      bots: oneBoard.bots,
      phase: 'playing',
      startedAt: expect.any(Number),
      scores: expect.arrayContaining([{ name: 'One', kills: 0, deaths: 0 }]),
    });

    const second = await openClient(DEFAULT_ROOM_NAME);
    second.ws.send(joinPayload('Two'));
    await second.inbox.waitFor('welcome');

    const two = await SELF.fetch('https://rat-detective.test/status');
    await expect(two.json()).resolves.toMatchObject({
      room: DEFAULT_ROOM_NAME,
      players: 8,
      bots: 6,
      phase: 'playing',
      startedAt: oneBoard.startedAt,
      scores: expect.arrayContaining([
        { name: 'One', kills: 0, deaths: 0 },
        { name: 'Two', kills: 0, deaths: 0 },
      ]),
    });

    first.ws.close(1000, 'done');
    second.ws.close(1000, 'done');
    await runInDurableObject(env.GAME_ROOM.getByName(DEFAULT_ROOM_NAME), async (instance: GameRoom, ctx) => {
      const game = instance as unknown as { chaosTimer: ReturnType<typeof setInterval> | null; persistentBots: boolean; serverBots: { dispose(): void } | null };
      if (game.chaosTimer) clearInterval(game.chaosTimer);
      game.chaosTimer = null; game.persistentBots = false; game.serverBots?.dispose();
      ctx.storage.sql.exec("DELETE FROM room_state WHERE key = 'persistent-bots-v1'");
      await ctx.storage.deleteAlarm();
    });
  });
});

describe('capacity persistence work', () => {
  it('persists final lethal state once and does not rewrite an unchanged nonlethal shooter', async () => {
    const room=`write-count-${crypto.randomUUID()}`;
    const a=await openClient(room),b=await openClient(room);
    a.ws.send(joinPayload('Shooter'));b.ws.send(joinPayload('Victim'));
    const aw=await a.inbox.waitFor('welcome'),bw=await b.inbox.waitFor('welcome');
    await runInDurableObject(env.GAME_ROOM.getByName(room),async(instance:GameRoom,ctx)=>{
      const internal=instance as unknown as {handleHit:(id:string,m:{type:'hit';victimId:string;damage:number})=>Promise<void>};
      const writes=vi.spyOn(ctx.storage.sql,'exec');
      try {
        await internal.handleHit(aw.id,{type:'hit',victimId:bw.id,damage:1});
        const playerWrites=()=>writes.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO players'));
        expect(playerWrites()).toHaveLength(1);
        expect(playerWrites()[0][1]).toBe(bw.id);
        writes.mockClear();
        await internal.handleHit(aw.id,{type:'hit',victimId:bw.id,damage:99});
        expect(playerWrites()).toHaveLength(2);
        const victim=JSON.parse(String(playerWrites().find(call=>call[1]===bw.id)![2]));
        expect(victim.hp).toBe(0);expect(victim.respawnAt).toBeGreaterThan(0);
        const saved=ctx.storage.sql.exec<{data:string}>('SELECT data FROM players WHERE id = ?',bw.id).one();
        expect(JSON.parse(saved.data)).toEqual(victim);
        expect(ctx.storage.sql.exec<{n:number}>("SELECT COUNT(*) AS n FROM pending_events WHERE type = 'respawn' AND player_id = ?",bw.id).one().n).toBe(1);
      } finally {writes.mockRestore();}
    });
  });
  it('retains an unchanged alarm and updates it for an earlier deadline',async()=>{
    const stub=env.GAME_ROOM.getByName(`alarm-count-${crypto.randomUUID()}`);
    await runInDurableObject(stub,async(instance:GameRoom,ctx)=>{
      const internal=instance as unknown as {scheduleNextAlarm:()=>Promise<void>};
      const due=Date.now()+60000;
      ctx.storage.sql.exec("INSERT INTO pending_events (id,type,player_id,due_at) VALUES ('a','respawn',NULL,?)",due);
      await internal.scheduleNextAlarm();
      const set=vi.spyOn(ctx.storage,'setAlarm');
      try {
        await internal.scheduleNextAlarm();expect(set).not.toHaveBeenCalled();
        ctx.storage.sql.exec("INSERT INTO pending_events (id,type,player_id,due_at) VALUES ('b','respawn',NULL,?)",due-1000);
        await internal.scheduleNextAlarm();expect(await ctx.storage.getAlarm()).toBe(due-1000);
        expect(set).toHaveBeenCalledTimes(1);
      } finally {set.mockRestore();await ctx.storage.deleteAlarm();}
    });
  });
});
it('negotiates delta motion while retaining the previous compact mode',async()=>{
 for(const mode of ['compact-v1','compact-v2']){
  const room=`wire-mode-${crypto.randomUUID()}`;
  const response=await SELF.fetch(`http://localhost/ws?room=${room}&chaos=${mode}`,{headers:{Upgrade:'websocket',Origin:'http://localhost'}});
  const ws=response.webSocket!;ws.accept();openSockets.add(ws);
  await runInDurableObject(env.GAME_ROOM.getByName(room),(_instance,ctx)=>{
   const attachment=ctx.getWebSockets()[0].deserializeAttachment() as {compactChaos?:boolean;compactChaosDelta?:boolean};
   expect(attachment.compactChaos).toBe(true);expect(!!attachment.compactChaosDelta).toBe(mode==='compact-v2');
  });
 }
});
