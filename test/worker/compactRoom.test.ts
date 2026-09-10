import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { DeliveryDecoder } from '../../src/shared/deliveryWire';
import { MAX_CHAOS_IN_FLIGHT } from '../../src/worker/ChaosDelivery';
const appearance={hatType:'fedora',hatColor:1,furColor:2,coatColor:3};
const wait=async(test:()=>boolean)=>{const end=Date.now()+4000;while(!test()){if(Date.now()>end)throw new Error('Compact room timeout');await new Promise(r=>setTimeout(r,10));}};
it('negotiates mixed clients and bounds snapshots while still delivering control messages',async()=>{
 const room=`graybox-compact-${crypto.randomUUID()}`,sockets:WebSocket[]=[];
 const open=async(compact:boolean)=>{
  const response=await SELF.fetch(`https://example.test/ws?room=${room}${compact?'&chaos=compact-v1':''}`,{headers:{Upgrade:'websocket'}});
  expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();sockets.push(ws);
  const types:string[]=[],frames:Array<{stream:string;seq:number}>=[];const decoder=new DeliveryDecoder();
  ws.addEventListener('message',e=>{
    const packet=JSON.parse(String(e.data));types.push(packet.message?.type??packet.type);
    const decoded=decoder.read(String(e.data));expect(decoded).not.toBeNull();
    if(decoded?.message?.type==='chaos'&&decoded.ack)frames.push(decoded.ack);
    if(!compact&&decoded?.ack)ws.send(JSON.stringify(decoded.ack));
  });
  ws.send(JSON.stringify({type:'join',protocolVersion:7,name:compact?'Compact':'Legacy',appearance}));
  await wait(()=>types.includes('welcome'));
  return {ws,types,frames};
 };
 try{
  const compact=await open(true),legacy=await open(false);
  await wait(()=>compact.frames.length===MAX_CHAOS_IN_FLIGHT&&legacy.types.filter(t=>t==='chaos').length>MAX_CHAOS_IN_FLIGHT);
  await new Promise(r=>setTimeout(r,120));expect(compact.frames).toHaveLength(MAX_CHAOS_IN_FLIGHT);
  compact.ws.send(JSON.stringify({type:'ping',sentAt:Date.now()}));await wait(()=>compact.types.includes('pong'));
  expect(compact.frames).toHaveLength(MAX_CHAOS_IN_FLIGHT);
  compact.ws.send(JSON.stringify({type:'deliveryAck',...compact.frames[MAX_CHAOS_IN_FLIGHT-1]}));
  await wait(()=>compact.frames.length>MAX_CHAOS_IN_FLIGHT);
  expect(legacy.types).not.toContain('chaosFrame');
 }finally{
  await Promise.all(sockets.map(ws=>new Promise<void>(resolve=>{if(ws.readyState===WebSocket.CLOSED)return resolve();ws.addEventListener('close',()=>resolve(),{once:true});ws.close(1000,'test complete');})));
 }
});
