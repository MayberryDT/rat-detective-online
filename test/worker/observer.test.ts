import {env,runInDurableObject,SELF} from 'cloudflare:test';
import {afterEach,expect,it} from 'vitest';
import {GameRoom} from '../../src/worker/GameRoom';
import {createPlayer} from '../../src/worker/gameState';
import {MAX_PLAYERS,PROTOCOL_VERSION,type ServerMessage} from '../../src/shared/networkProtocol';
import {readSocketMessage} from './socketMessages';
import {observationAllowed} from '../../src/shared/observation';
const appearance={hatType:'fedora' as const,hatColor:1,furColor:2,coatColor:3};
const sockets:WebSocket[]=[];
afterEach(async()=>{await Promise.all(sockets.splice(0).map(ws=>new Promise<void>(resolve=>{
 if(ws.readyState===WebSocket.CLOSED)return resolve();ws.addEventListener('close',()=>resolve(),{once:true});ws.close(1000,'done');
})));});
async function setup(){
 const name=`graybox-benchmark-ai-observer-${crypto.randomUUID()}`,stub=env.GAME_ROOM.getByName(name);
 await runInDurableObject(stub,(instance:GameRoom)=>{
  const game=instance as any;
  game.env={...game.env,CAPACITY_FIXTURE_ID:'observer-test',CAPACITY_EXPIRES_AT:String(Date.now()+60000)};
  // An already-full authority roster: joining a camera must not mutate any row.
  for(let i=0;i<MAX_PLAYERS;i++){const p=createPlayer(`rat-${i}`,`Rat ${i}`,appearance,{x:i*5,y:2,z:0});game.players.set(p.id,p);}
 });
 return{stub,name};
}
async function connect(stub:ReturnType<typeof env.GAME_ROOM.getByName>,name:string){
 const response=await stub.fetch(`https://test.invalid/ws?room=${name}&observe=1&chaos=compact-v2&movement=tuple-v1`,{headers:{Upgrade:'websocket'}});
 expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();sockets.push(ws);
 const messages:ServerMessage[]=[];
 ws.addEventListener('message',e=>{const m=readSocketMessage(ws,e.data);if(m)messages.push(m);});
 const wait=async(type:ServerMessage['type'])=>{
  for(let i=0;i<400;i++){const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,5));}
  throw Error(`No ${type}: ${messages.map(m=>m.type)}`);
 };
 ws.send(JSON.stringify({type:'join',name:'Observer',appearance,protocolVersion:PROTOCOL_VERSION}));
 return{ws,wait,welcome:await wait('welcome') as Extract<ServerMessage,{type:'welcome'}>};
}
it('rejects public, ordinary private and expired observation requests',async()=>{
 const active={CAPACITY_FIXTURE_ID:'fixture',CAPACITY_EXPIRES_AT:'2000'};
 expect(observationAllowed(new URL('https://x/ws?room=graybox-benchmark-ai-observer'),active,1000)).toBe(true);
 for(const room of ['public-live-v2','graybox-benchmark-match-observer','graybox-practice-observer'])expect(observationAllowed(new URL(`https://x/ws?room=${room}`),active,1000)).toBe(false);
 expect(observationAllowed(new URL('https://x/ws?room=graybox-benchmark-ai-observer'),active,2000)).toBe(false);
 const response=await SELF.fetch('http://localhost/ws?room=graybox-observer-denied&observe=1',{headers:{Upgrade:'websocket',Origin:'http://localhost'}});
 expect(response.status).toBe(403);
});
it('joins a full room outside its roster and rejects every gameplay action',async()=>{
 const{stub,name}=await setup(),{ws,welcome,wait}=await connect(stub,name);
 expect(welcome.observing).toBe(true);expect(welcome.resumeToken).toBeUndefined();expect(welcome.players[welcome.id]).toBeUndefined();expect(Object.keys(welcome.players)).toHaveLength(MAX_PLAYERS);
 await runInDurableObject(stub,async(instance:GameRoom,ctx)=>{
  const game=instance as any,socket=ctx.getWebSockets()[0],before=JSON.stringify([...game.players]);
  const pose={seq:1,position:{x:50,y:2,z:50},rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}};
  for(const message of [
   {type:'updateMovement',...pose},
   {type:'shoot',shotId:'observer-shot',origin:pose.position,direction:{x:1,y:0,z:0}},
   {type:'hit',victimId:'rat-0',damage:3},
   {type:'pickupIntent',interactionId:'observer-pickup',target:'case',targetId:'case',generation:0,movement:pose},
  ])await instance.webSocketMessage(socket,JSON.stringify(message));
  expect(JSON.stringify([...game.players])).toBe(before);expect(game.sessions.size).toBe(0);expect(game.movementAllowances.size).toBe(0);expect(game.chaos).toBeNull();
  expect(game.humanSlots()).toBe(MAX_PLAYERS);
  expect(ctx.storage.sql.exec('SELECT COUNT(*) as n FROM players').one().n).toBe(0);
  game.broadcastScoreboard();
 });
 expect((await wait('scoreboardUpdate') as Extract<ServerMessage,{type:'scoreboardUpdate'}>).scores).toHaveLength(MAX_PLAYERS);
 ws.send(JSON.stringify({type:'ping',sentAt:123}));expect(await wait('pong')).toMatchObject({sentAt:123});
 await runInDurableObject(stub,(instance:GameRoom,ctx)=>{
  const game=instance as any,socket=ctx.getWebSockets()[0];
  // Reconstruct state used after a hibernated socket resumes delivery.
  game.socketAttachments.delete(socket);expect(game.getAttachment(socket).observerPlayer.id).toBe(welcome.id);
  game.connectionDelivery.delete(socket);game.deliveryFor(socket);
 });
 expect((await wait('welcome') as Extract<ServerMessage,{type:'welcome'}>).observing).toBe(true);
 await runInDurableObject(stub,(instance:GameRoom,ctx)=>{
  const game=instance as any;game.removePlayer(ctx.getWebSockets()[0]);
  expect(game.players.size).toBe(MAX_PLAYERS);expect(game.sessions.size).toBe(0);expect(game.refillAt).toBe(0);
 });
});
it('bounds observer connections without reserving rat slots',async()=>{
 const{stub,name}=await setup();for(let i=0;i<4;i++)await connect(stub,name);
 const response=await stub.fetch(`https://x/ws?room=${name}&observe=1`,{headers:{Upgrade:'websocket'}});expect(response.status).toBe(503);
 await runInDurableObject(stub,(instance:GameRoom)=>expect((instance as any).players.size).toBe(MAX_PLAYERS));
});
