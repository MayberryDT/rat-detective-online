import {expect,it} from 'vitest';
import {ConnectionDelivery,MAX_DELIVERY_BYTES,MAX_DELIVERY_FRAMES,MAX_PENDING_BYTES} from '../../src/worker/ConnectionDelivery';
import {DeliveryDecoder,wireBytes,type DeliveryAck} from '../../src/shared/deliveryWire';
import {ChaosDelivery,MAX_CHAOS_IN_FLIGHT} from '../../src/worker/ChaosDelivery';
import {serializeMovement} from '../../src/shared/movementWire';
import {serializeServerMessage} from '../../src/worker/serializeServerMessage';
import {parseServerMessage} from '../../src/shared/messageValidation';
import type {ChaosState} from '../../src/shared/chaosState';
const pong=(n:number)=>JSON.stringify({type:'pong',sentAt:n,receivedAt:n});
const pose={x:1.123456789,y:2,z:-3,qx:0,qy:0,qz:0,qw:1,meshQx:0,meshQy:0,meshQz:0,meshQw:1};
const movement=(id:string,x:number)=>serializeMovement({type:'playersMoved',players:[{at:17,player:{id,...pose,x}}]});
function state():ChaosState {
 const physical={p:{x:123.456789,y:12.456789,z:-123.456789},q:{x:.123,y:.234,z:.345,w:.901},v:{x:123.456,y:123.456,z:123.456},spin:{x:12.345,y:23.456,z:34.567}};
 const id=(n:number)=>`12345678-1234-1234-1234-${String(n).padStart(12,'0')}`;
 return {time:1000,extraCases:[],case:{...physical,owner:null,previousOwner:null,pickupAfter:0,returningUntil:0},dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},notice:{serial:0,text:'Test'},
 shots:Array.from({length:256},(_,i)=>({id:id(i),owner:id(1000+i%24),p:{...physical.p},v:{...physical.v},age:1.234567,original:true,wallBounced:i%2===0})),
 corpses:Array.from({length:16},(_,i)=>({...structuredClone(physical),id:id(3000+i),victimId:id(4000+i),owner:id(5000+i),appearance:{hatType:'fedora',hatColor:1,coatColor:2,furColor:3},born:0,expires:20000})),
 impacts:Array.from({length:64},()=>({p:{...physical.p},n:{x:.57735,y:.57735,z:.57735},surface:true,scale:1,foley:'bounce',energy:40}))};
}
it('bounds every traffic type, isolates a healthy receiver and preserves movement/event barriers',()=>{
 const sent:string[]=[],slow=new ConnectionDelivery(p=>sent.push(p));
 for(let i=0;i<MAX_DELIVERY_FRAMES;i++)slow.offer(pong(i),0);
 for(let i=0;i<1000;i++)slow.offer(movement(i%2?'a':'b',i),1,'movementBatch');
 expect(sent).toHaveLength(MAX_DELIVERY_FRAMES);expect(slow.stats.queued).toBe(1);
 slow.offer(JSON.stringify({type:'playerShot',shooterId:'a',shotId:'s',origin:{x:1,y:2,z:3},direction:{x:1,y:0,z:0}}),2);
 slow.offer(movement('a',2000),3,'movementBatch');
 expect(slow.stats.queued).toBe(3);expect(slow.stats.inFlightBytes).toBeLessThanOrEqual(MAX_DELIVERY_BYTES);
 const good:string[]=[],healthy=new ConnectionDelivery(p=>good.push(p));healthy.offer(pong(9),3);expect(good).toHaveLength(1);
 slow.acknowledge({type:'deliveryAck',stream:'wrong',seq:MAX_DELIVERY_FRAMES},4);expect(slow.stats.queued).toBe(3);
 slow.acknowledge({type:'deliveryAck',stream:slow.stream,seq:MAX_DELIVERY_FRAMES},4);
 const decoder=new DeliveryDecoder();const messages=sent.map(p=>decoder.read(p)?.message);
 expect(messages.slice(-3).map(m=>m?.type)).toEqual(['playersMoved','playerShot','playersMoved']);
 expect(messages[messages.length-3]).toMatchObject({players:[{player:{id:'b',x:998}},{player:{id:'a',x:999}}]});
 expect(messages[messages.length-1]).toMatchObject({players:[{at:17,player:{...pose,id:'a',x:2000}}]});
});
it('rejects reliable backlog overflow and stalled acknowledgements with bounded memory',()=>{
 const delivery=new ConnectionDelivery(()=>{});
 for(let i=0;i<MAX_DELIVERY_FRAMES;i++)delivery.offer(pong(i),0);
 expect(()=>{for(let i=0;i<1000;i++)delivery.offer(JSON.stringify({type:'pong',sentAt:i,receivedAt:i,padding:'x'.repeat(2048)}),1);}).toThrow(/backlog/);
 expect(delivery.stats.queuedBytes).toBeLessThan(MAX_PENDING_BYTES+3000);
 expect(()=>delivery.check(5001)).toThrow(/timed out/);
});
it('allows queued ACKs to drain after a server pause, then restores the normal timeout',()=>{
 const frames:string[]=[],delivery=new ConnectionDelivery(p=>frames.push(p));delivery.offer(pong(0),0);
 delivery.resumed(6000);expect(()=>delivery.check(6100)).not.toThrow();
 delivery.acknowledge({type:'deliveryAck',stream:delivery.stream,seq:1},6100);expect(delivery.stats.inFlight).toBe(0);
 delivery.offer(pong(1),6200);expect(()=>delivery.check(11201)).toThrow(/timed out/);
});
it.each([false,true])('atomically delivers all 256 shots, 16 corpses and 64 impacts (compact=%s)',compact=>{
 const snapshot=state(),legacy=serializeServerMessage({type:'chaos',state:snapshot});
 expect(parseServerMessage({type:'chaos',state:snapshot})).not.toBeNull();
 expect(wireBytes(legacy)).toBeGreaterThan(65536);
 const chaos=new ChaosDelivery(true,!compact),wire=chaos.offer(snapshot,0)!;
 const frames:string[]=[],delivery=new ConnectionDelivery(p=>frames.push(p));delivery.offer(wire,0,undefined,chaos.lastFrame!.ack,chaos.lastFrame!.bytes);
 const decoder=new DeliveryDecoder();let message;
 for(const frame of frames){expect(wireBytes(frame)).toBeLessThanOrEqual(65536);const decoded=decoder.read(frame);expect(decoded).not.toBeNull();if(decoded?.message)message=decoded.message;}
 expect(message).toEqual(JSON.parse(legacy));
 if(!compact)expect(frames.length).toBeGreaterThan(1);
});
it('preserves neutral corpse and projectile ownership through compact and legacy delivery',()=>{
 for(const legacy of [false,true]){
  const snapshot=state();snapshot.corpses[0].owner=null;snapshot.shots[0].owner=null;
  const decoder=new DeliveryDecoder(),messages:unknown[]=[];
  const connection=new ConnectionDelivery(p=>{const m=decoder.read(p)?.message;if(m)messages.push(m);});
  const chaos=new ChaosDelivery(true,legacy);
  const payload=chaos.offer(snapshot,0)!;connection.offer(payload,0,undefined,chaos.lastFrame!.ack);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({state:{corpses:[{owner:null},...snapshot.corpses.slice(1).map(()=>({}))],shots:[{owner:null},...snapshot.shots.slice(1).map(()=>({}))]}});
 }
});
it('sustains 30 Hz at 200ms ACK latency using the actual eight-frame release window',()=>{
 const snapshot=state();snapshot.shots=[];snapshot.corpses=[];snapshot.impacts=[];
 const chaos=new ChaosDelivery(true),pending:Array<{at:number;ack:DeliveryAck}>=[],decoder=new DeliveryDecoder();
 let now=0,sent=0;
 const connection=new ConnectionDelivery(p=>{const decoded=decoder.read(p)!;pending.push({at:now+233,ack:decoded.ack as DeliveryAck});if(now>=1000&&decoded.message?.type==='chaos')sent++;});
 for(let tick=0;tick<330;tick++){
  now=tick*1000/30;
  while(pending.length&&pending[0].at<=now){const ack=connection.acknowledge(pending.shift()!.ack,now);if(ack)chaos.acknowledge(ack);}
  const payload=chaos.offer(snapshot,now,undefined,connection.ready);if(payload)connection.offer(payload,now,undefined,chaos.lastFrame!.ack,chaos.lastFrame!.bytes);
  expect(chaos.inFlight).toBeLessThanOrEqual(MAX_CHAOS_IN_FLIGHT);
 }
 expect(sent).toBe(300);
});
it('rejects duplicate, out-of-order and corrupted delivery without committing a motion baseline',()=>{
 const frames:string[]=[],delivery=new ConnectionDelivery(p=>frames.push(p)),decoder=new DeliveryDecoder();
 delivery.offer(movement('a',1),0);delivery.offer(movement('a',2),0);
 expect(decoder.read(frames[1])).toBeNull();expect(decoder.read(frames[0])).not.toBeNull();
 expect(decoder.read(frames[0])).toBeNull();
 const corrupt=JSON.parse(frames[1]);corrupt.message.players[0][2]=null;
 expect(decoder.read(JSON.stringify(corrupt))).toBeNull();expect(decoder.read(frames[1])).not.toBeNull();
});
