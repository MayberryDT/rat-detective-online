import { readSocketMessage } from './socketMessages';
import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOT_REFILL_MS, type GameRoom } from '../../src/worker/GameRoom';
import { DEFAULT_ROOM_NAME, MAX_PLAYERS, PROTOCOL_VERSION, type ServerMessage } from '../../src/shared/networkProtocol';

const sockets: WebSocket[] = [];
const rooms = new Set<string>();
const appearance = {hatType:'fedora',hatColor:1,furColor:2,coatColor:3};
const pool = () => `graybox-benchmark-match-${crypto.randomUUID().slice(0,8)}`;
async function until(test:()=>boolean) {
  const end=Date.now()+8000;
  while(!test()){if(Date.now()>end)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,10));}
}
async function open(group:string, preferred?:string, join=true) {
  rooms.add(group);
  const request=()=>new Request(`https://game.test/ws?room=${group}${preferred?`&preferred=${preferred}`:''}`,{headers:{Upgrade:'websocket'}});
  let response=await env.MATCHMAKER.getByName(group).fetch(request());
  // Placement is independent of runner speed. A concurrent burst may exhaust
  // the intentional five-second admission deadline; clients retry that 503.
  // Keep retries bounded and fail immediately for any other response.
  for(let retry=0;response.status===503&&retry<2;retry++){
    expect(await response.text()).toMatch(/^Admission (?:timed out|busy; retry shortly)$/);
    await new Promise(resolve=>setTimeout(resolve,250));
    response=await env.MATCHMAKER.getByName(group).fetch(request());
  }
  expect(response.status).toBe(101);
  const ws=response.webSocket!;ws.accept();sockets.push(ws);
  const messages:ServerMessage[]=[];
  ws.addEventListener('message',event=>{const message=readSocketMessage(ws,event.data);if(message)messages.push(message);});
  if(!join)return {ws,messages,welcome:undefined};
  ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Human Rat',appearance}));
  await until(()=>messages.some(m=>m.type==='welcome'));
  const welcome=messages.find(m=>m.type==='welcome') as Extract<ServerMessage,{type:'welcome'}>;
  rooms.add(welcome.matchRoom!);
  return {ws,messages,welcome};
}
async function close(ws:WebSocket){ws.close(1000,'test done');await until(()=>ws.readyState===WebSocket.CLOSED);}
afterEach(async()=>{
  for(const name of rooms){
    await runInDurableObject(env.GAME_ROOM.getByName(name),(instance:GameRoom,ctx)=>{
      const game=instance as any;
      if(game.chaosTimer)clearInterval(game.chaosTimer);
      game.chaosTimer=null;game.serverBots?.dispose();game.serverBots=null;game.persistentBots=false;game.matchRoom=null;game.refillAt=0;
      ctx.storage.sql.exec("DELETE FROM room_state WHERE key IN ('match-room-v1','persistent-bots-v1')");
      return ctx.storage.deleteAlarm();
    });
  }
  for(const ws of sockets.splice(0))if(ws.readyState===WebSocket.OPEN)await close(ws);
  rooms.clear();
});

describe('automatic public room population',()=>{
  it('prepares bounded title sockets without reserving slots, creating overflow or waking bots',async()=>{
    const group=DEFAULT_ROOM_NAME,matcher=env.MATCHMAKER.getByName(group),stub=env.GAME_ROOM.getByName(group);
    rooms.add(group);
    const titles:WebSocket[]=[];
    for(let i=0;i<16;i++){
      const response=await matcher.fetch(new Request('https://game.test/ws?prepare=1',{headers:{Upgrade:'websocket'}}));
      expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();sockets.push(ws);titles.push(ws);
    }
    expect(await stub.occupiedSlots()).toBe(0);expect(await stub.status()).toMatchObject({players:0,bots:0});
    await runInDurableObject(stub,(instance:GameRoom)=>expect((instance as any).chaosTimer).toBeNull());
    const extra=await matcher.fetch(new Request('https://game.test/ws?prepare=1',{headers:{Upgrade:'websocket'}}));
    expect(extra.status).toBe(503);
    await runInDurableObject(matcher,(_instance,ctx)=>expect(ctx.storage.sql.exec('SELECT name FROM rooms').toArray()).toHaveLength(0));
    const messages:ServerMessage[]=[];
    titles[0].addEventListener('message',e=>{const m=readSocketMessage(titles[0],e.data);if(m)messages.push(m);});
    titles[0].send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Captain Crawley',appearance}));
    await until(()=>messages.some(m=>m.type==='welcome'));
    expect(await stub.occupiedSlots()).toBe(1);expect(await stub.status()).toMatchObject({players:8,bots:7});
    await runInDurableObject(stub,async(instance:GameRoom)=>{
      const game=instance as any,now=Date.now();game.clock=()=>now+31_000;await instance.alarm();
    });
    await until(()=>titles.slice(1).every(ws=>ws.readyState===WebSocket.CLOSED));
    expect(titles[0].readyState).toBe(WebSocket.OPEN);
  });

  it('does not let an unreserved title connection steal a promised admission slot',async()=>{
    const group=DEFAULT_ROOM_NAME,matcher=env.MATCHMAKER.getByName(group),stub=env.GAME_ROOM.getByName(group);rooms.add(group);
    const prepared=await matcher.fetch(new Request('https://game.test/ws?prepare=1',{headers:{Upgrade:'websocket'}}));
    const title=prepared.webSocket!;title.accept();sockets.push(title);
    await Promise.all(Array.from({length:MAX_PLAYERS},()=>open(group,undefined,false)));
    const messages:ServerMessage[]=[];title.addEventListener('message',e=>{const m=readSocketMessage(title,e.data);if(m)messages.push(m);});
    title.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Late Title',appearance}));
    await until(()=>messages.some(m=>m.type==='error'));
    expect(await stub.occupiedSlots()).toBe(MAX_PLAYERS);expect(await stub.status()).toMatchObject({players:0,bots:0});
  });
  it('bounds queued admission and uses the availability index',async()=>{
    const group=pool(),matcher=env.MATCHMAKER.getByName(group);
    await runInDurableObject(matcher,async(instance,ctx)=>{
      const directory=instance as any;directory.queued=64;
      try {
        const response=await directory.fetch(new Request(`https://game.test/ws?room=${group}`,{headers:{Upgrade:'websocket'}}));
        expect(response.status).toBe(503);
        const plan=ctx.storage.sql.exec("EXPLAIN QUERY PLAN SELECT name FROM rooms WHERE checked = 0 ORDER BY slots DESC, name LIMIT 16").toArray();
        expect(JSON.stringify(plan)).toContain('rooms_available');
      } finally {directory.queued=0;}
    });
    await open(group);
    await runInDurableObject(env.GAME_ROOM.getByName(group),async(instance:GameRoom,ctx)=>{
      const before=ctx.getWebSockets().length;
      const response=await instance.fetch(new Request('https://game.test/ws',{headers:{Upgrade:'websocket','x-rat-admission-deadline':String(Date.now()-1)}}));
      expect(response.status).toBe(503);expect(ctx.getWebSockets()).toHaveLength(before);
    });
  });
  it('performs no room writes or bot resets for unchanged setup',async()=>{
    const group=pool();await open(group);
    await runInDurableObject(env.GAME_ROOM.getByName(group),async(instance:GameRoom,ctx)=>{
      const game=instance as any,controller=game.serverBots;
      const writes=vi.spyOn(ctx.storage.sql,'exec');
      try {
        await instance.enableMatchmaking(group,group);
        expect(writes.mock.calls.filter(call=>String(call[0]).includes('INSERT INTO room_state'))).toHaveLength(0);
        expect(game.serverBots).toBe(controller);
      } finally { writes.mockRestore(); }
    });
  });
  it('fills to eight, replaces AI without resetting remaining bots, refills after grace and sleeps empty',async()=>{
    const group=pool();const first=await open(group);
    expect(Object.keys(first.welcome!.players)).toHaveLength(8);
    const stub=env.GAME_ROOM.getByName(group);
    await runInDurableObject(stub,(instance:GameRoom)=>{
      const game=instance as any;
      if(game.chaosTimer)clearInterval(game.chaosTimer);game.chaosTimer=null;
      game.players.get('rd-ai-00').kills=6;
      game.testController=game.serverBots;
    });
    const second=await open(group);
    expect(Object.keys(second.welcome!.players)).toHaveLength(8);
    expect(second.welcome!.players['rd-ai-00'].kills).toBe(6);
    expect(Object.keys(second.welcome!.players).filter(id=>id.startsWith('rd-ai-'))).toHaveLength(6);
    await runInDurableObject(stub,(instance:GameRoom)=>{
      const game=instance as any;expect(game.serverBots).toBe(game.testController);
      // The eviction helper requires timer I/O to drain; retain durable state.
      if(game.chaosTimer)clearInterval(game.chaosTimer);game.chaosTimer=null;
    });
    await evictDurableObject(stub);
    expect((await stub.status()).bots).toBe(6);
    await close(second.ws);
    await until(()=>first.messages.some(m=>m.type==='playerLeft'&&m.id===second.welcome!.id));
    expect((await stub.status()).bots).toBe(6);
    await runInDurableObject(stub,async(instance:GameRoom)=>{
      const game=instance as any; const now=Date.now();game.clock=()=>now+BOT_REFILL_MS+1;await instance.alarm();
    });
    expect((await stub.status()).bots).toBe(7);
    await close(first.ws);
    await runInDurableObject(stub,async(instance:GameRoom)=>{
      const game=instance as any;
      expect(game.botRoster).toHaveLength(0);expect(game.chaosTimer).toBeNull();expect(game.serverBots).toBeNull();
    });
    expect((await stub.status()).players).toBe(0);
  });

  it('places 44 concurrent humans into 16, 16 and 12, keeping preferred-room reconnects and reusing freed slots',async()=>{
    const group=pool();
    const joined=await Promise.all(Array.from({length:44},()=>open(group)));
    const counts=new Map<string,number>();
    for(const c of joined)counts.set(c.welcome!.matchRoom!,(counts.get(c.welcome!.matchRoom!)??0)+1);
    expect([...counts.values()].sort((a,b)=>b-a)).toEqual([16,16,12]);
    for(const name of counts.keys()){const status=await env.GAME_ROOM.getByName(name).status();expect(status.bots).toBe(0);expect(status.players).toBeLessThanOrEqual(MAX_PLAYERS);}
    const last=joined.at(-1)!;const preferred=last.welcome!.matchRoom!;
    await close(last.ws);
    const resumed=await open(group,preferred);
    expect(resumed.welcome!.matchRoom).toBe(preferred);
    await evictDurableObject(env.MATCHMAKER.getByName(group));
    const next=await open(group);
    expect(next.welcome!.matchRoom).toBe(preferred);
  },30000);

  it('reserves pending joins, expires them, and rejects an expired join',async()=>{
    const group=pool();
    const pending=await Promise.all(Array.from({length:MAX_PLAYERS},()=>open(group,undefined,false)));
    const extra=await open(group);
    expect(extra.welcome!.matchRoom).not.toBe(group);
    const stub=env.GAME_ROOM.getByName(group);
    await runInDurableObject(stub,async(instance:GameRoom)=>{
      const game=instance as any;const now=Date.now();game.clock=()=>now+11000;
      await instance.alarm();expect(await instance.occupiedSlots()).toBe(0);
    });
    await until(()=>pending.every(c=>c.ws.readyState===WebSocket.CLOSED));
    const reused=await open(group,group);
    expect(reused.welcome!.matchRoom).toBe(group);
  },30000);
});
