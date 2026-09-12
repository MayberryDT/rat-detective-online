import { expect, it } from 'vitest';
import { ChaosEncoder, ChaosDecoder, prepareChaos } from '../../src/shared/chaosWire';
import { ChaosDelivery, MAX_CHAOS_IN_FLIGHT, CHAOS_ACK_TIMEOUT_MS } from '../../src/worker/ChaosDelivery';
import { serializeServerMessage } from '../../src/worker/serializeServerMessage';
import { parseClientMessage } from '../../src/shared/messageValidation';
import type { ChaosState } from '../../src/shared/chaosState';
function state(count=2):ChaosState {
 return {time:1000,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:1.123456,y:1,z:2},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},extraCases:[],dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},notice:{serial:0,text:'test 🧀'},corpses:[],impacts:[],shots:Array.from({length:count},(_,i)=>({id:`projectile-${String(i).padStart(26,'0')}`,owner:'owner-12345678-1234-1234-123456789012',p:{x:45.123456+i,y:7.456789,z:123.456789},v:{x:123.4567,y:8.34567,z:32.56789},age:1.234567,...(i%2?{wallBounced:true}:{}),...(i%3?{delayed:false}:{}),...(i%5?{original:true}:{})}))};
}
it('round trips keyframes, changing poses, stable metadata, deletion and recreation',()=>{
 const e=new ChaosEncoder(),d=new ChaosDecoder(),s=state();
 const original=JSON.stringify(s);
 for(let i=0;i<4;i++){
  if(i===1){s.time+=33;s.shots[0].p.x+=2;s.dispatch.serial++;}
  if(i===2)s.shots.shift();
  if(i===3){s.shots.push({...state().shots[0],owner:'new-owner'});s.notice.text='new';}
  const frame=e.encode(s),decoded=d.read(frame.payload);
  expect(decoded?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));
  expect(decoded?.ack?.seq).toBe(i+1);
  if(i===1)expect(JSON.parse(frame.payload).definitions).toHaveLength(0);
 }
 expect(original).toContain('45.123456');
});
it('keeps a 256-ball steady-state frame under 45% of the old wire size',()=>{
 const s=state(256),e=new ChaosEncoder(),d=new ChaosDecoder();
 d.read(e.encode(s).payload);
 const before=JSON.stringify(s),wire=e.encode(s).payload;
 expect(new TextEncoder().encode(wire).length).toBeLessThan(new TextEncoder().encode(serializeServerMessage({type:'chaos',state:s})).length*.45);
 expect(d.read(wire)?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));
 expect(JSON.stringify(s)).toBe(before);
});
it('rejects missing baselines and invalid frames without poisoning a valid baseline',()=>{
 const s=state(),e=new ChaosEncoder(),d=new ChaosDecoder();
 const first=e.encode(s).payload,second=e.encode(s).payload;
 expect(new ChaosDecoder().read(second)).toBeNull();
 expect(d.read(first)).not.toBeNull();
 const bad=JSON.parse(second);bad.motion[0][1]='bad';
 expect(d.read(JSON.stringify(bad))).toBeNull();
 expect(d.read(second)).not.toBeNull();
 expect(d.read(second)).toBeNull();
 expect(d.read(new ChaosEncoder().encode(s).payload)).not.toBeNull();
});
it('resets optional fields and refreshes complete keyframes',()=>{
 const s=state(),e=new ChaosEncoder(),d=new ChaosDecoder();
 s.pressure={serial:1,until:50,launches:[]};d.read(e.encode(s).payload);delete s.pressure;
 const next=d.read(e.encode(s).payload);expect(next?.message.type==='chaos'&&next.message.state.pressure).toBeUndefined();
 let wire='';for(let i=3;i<=300;i++)wire=e.encode(s).payload;
 expect(JSON.parse(wire).base).toBe(0);
 expect(new ChaosDecoder().read(wire)?.message.type).toBe('chaos');
});
it.each([false,true])('carries pickup claims and buff expiry through compact snapshots (delta=%s)',delta=>{
 const s=state(),e=new ChaosEncoder('pickups',delta),d=new ChaosDecoder();
 s.pickups=[{id:'alibi-records-upper',kind:'ironclad',x:-16,y:.7,z:-18}];s.buffs={};
 const decode=()=>{const wire=e.encode(s).payload;const decoded=d.read(wire);expect(decoded?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));return JSON.parse(wire);};
 decode();
 s.time+=40;s.pickups[0].availableAt=s.time+45000;s.buffs={rat:{ironcladUntil:13040,hustleUntil:11040}};
 expect(decode().rest.buffs).toEqual(s.buffs);
 expect(decode().rest).not.toHaveProperty('buffs');
 s.time=14000;s.buffs={};expect(decode().rest.buffs).toEqual({});
 delete s.pickups;delete s.buffs;const cleared=decode();
 expect(cleared.rest.pickups).toBeNull();expect(cleared.rest.buffs).toBeNull();
 const fresh=new ChaosEncoder('fresh',delta).encode(s);
 expect(new ChaosDecoder().read(fresh.payload)?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));
});
it('does not expose mutable decoder baselines to the game',()=>{
 const s=state(),e=new ChaosEncoder(),d=new ChaosDecoder();
 const first=d.read(e.encode(s).payload)!;
 if(first.message.type==='chaos')first.message.state.notice.text='mutated by consumer';
 const second=d.read(e.encode(s).payload)!;
 expect(second.message.type==='chaos'&&second.message.state.notice.text).toBe(s.notice.text);
});
it('bounds in-flight snapshots, coalesces poses, retains impacts and rejects invalid acknowledgements',()=>{
 const s=state(),delivery=new ChaosDelivery(),decoder=new ChaosDecoder();
 const acks=[];
 for(let i=0;i<MAX_CHAOS_IN_FLIGHT;i++)acks.push(decoder.read(delivery.offer(s,i*33)!)!.ack!);
 expect(delivery.inFlight).toBe(MAX_CHAOS_IN_FLIGHT);
 const impact={p:{x:2,y:3,z:4},n:{x:0,y:1,z:0},surface:true};
 s.impacts=[impact];s.shots=[];expect(delivery.offer(s,150)).toBeNull();
 s.impacts=[];s.case.p.x=50;expect(delivery.offer(s,183)).toBeNull();
 delivery.acknowledge({...acks[MAX_CHAOS_IN_FLIGHT-1],seq:999});delivery.acknowledge({...acks[MAX_CHAOS_IN_FLIGHT-1],stream:'wrong'});
 expect(delivery.inFlight).toBe(MAX_CHAOS_IN_FLIGHT);
 delivery.acknowledge(acks[MAX_CHAOS_IN_FLIGHT-1]);
 const recovered=decoder.read(delivery.offer(s,200)!)!;
 expect(recovered.message.type==='chaos'&&recovered.message.state).toMatchObject({shots:[],impacts:[impact],case:{p:{x:50}}});
 expect(delivery.coalesced).toBe(2);
});
it('preserves a launcher event that disappears from current state while blocked',()=>{
 const s=state(),delivery=new ChaosDelivery(),decoder=new ChaosDecoder();let ack;
 for(let i=0;i<MAX_CHAOS_IN_FLIGHT;i++)ack=decoder.read(delivery.offer(s,i)!)!.ack!;
 const launch={id:'launch-1',playerId:'rat',at:10,velocity:{x:1,y:2,z:3}};
 s.pressure={serial:1,until:50,launches:[launch]};expect(delivery.offer(s,10)).toBeNull();
 s.pressure.launches=[];delivery.acknowledge(ack!);
 const recovered=decoder.read(delivery.offer(s,20)!)!;
 expect(recovered.message.type==='chaos'&&recovered.message.state.pressure?.launches).toEqual([launch]);
});
it('bounds cosmetic impact backlog while retaining timeout and launch overflow protection',()=>{
 const s=state(),delivery=new ChaosDelivery();delivery.offer(s,0);
 expect(()=>delivery.offer(s,CHAOS_ACK_TIMEOUT_MS+1)).toThrow(/timed out/);
 const congested=new ChaosDelivery(),decoder=new ChaosDecoder();let ack;for(let i=0;i<MAX_CHAOS_IN_FLIGHT;i++)ack=decoder.read(congested.offer(s,i)!)!.ack;
 s.impacts=Array.from({length:64},()=>({p:{x:0,y:0,z:0},n:{x:0,y:1,z:0},surface:true}));
 for(let i=0;i<4;i++)expect(congested.offer(s,10+i)).toBeNull();
 s.impacts=s.impacts.map(v=>({...v,p:{x:99,y:0,z:0}}));
 for(let i=0;i<8;i++)expect(congested.offer(s,15+i)).toBeNull();
 congested.acknowledge(ack!);s.impacts=[];
 const recovered=decoder.read(congested.offer(s,30)!)!;
 expect(recovered.message.type==='chaos'&&recovered.message.state.impacts).toHaveLength(64);
 expect(recovered.message.type==='chaos'&&recovered.message.state.impacts.every(i=>i.p.x===99)).toBe(true);
 s.pressure={serial:1,until:100,launches:Array.from({length:49},(_,i)=>({id:`launch-${i}`,playerId:'rat',at:30,velocity:{x:1,y:2,z:3}}))};
 expect(()=>congested.offer(s,31)).toThrow(/budget/);
 expect(parseClientMessage({type:'chaosAck',stream:'s',seq:1})).toEqual({type:'chaosAck',stream:'s',seq:1});
 expect(parseClientMessage({type:'chaosAck',stream:'s',seq:-1})).toBeNull();
});

it('shares prepared values across sockets while retaining their independent cue queues and baselines',()=>{
 const s=state(256),prepared=prepareChaos(s),a=new ChaosEncoder('a'),b=new ChaosEncoder('b'),da=new ChaosDecoder(),db=new ChaosDecoder();
 const copy=JSON.stringify(s);
 for(let i=0;i<3;i++){
  const sa={...s,impacts:i===1?[{p:{x:1,y:2,z:3},n:{x:0,y:1,z:0},surface:true}]:[]};
  expect(da.read(a.encode(sa,prepared).payload)?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:sa})));
  expect(db.read(b.encode(s,prepared).payload)?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));
 }
 expect(JSON.stringify(s)).toBe(copy);
});
it('losslessly reconstructs negotiated motion deltas across keyframes and membership changes',()=>{
 const s=state(256),legacy=new ChaosEncoder('legacy'),delta=new ChaosEncoder('delta',true),decoder=new ChaosDecoder();let legacyBytes=0,deltaBytes=0;
 for(let frame=0;frame<305;frame++){
  s.time+=1000/30;
  for(const shot of s.shots){shot.age+=1/30;shot.p.x+=.137;shot.p.y-=.04;shot.v.y-=.163;}
  if(frame===50)s.shots.splice(0,3);
  if(frame===75)s.shots.push({...state(1).shots[0],id:'recreated',owner:'new-owner'});
  if(frame===100)s.shots[0].owner='transferred';
  const original=JSON.stringify(s),a=legacy.encode(s).payload,b=delta.encode(s).payload;
  expect(decoder.read(b)?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));
  expect(JSON.stringify(s)).toBe(original);
  const encoded=JSON.parse(b);if(encoded.base===0)expect(encoded.motion.every((row:number[])=>row[0]>0)).toBe(true);
  if(frame>0){legacyBytes+=a.length;deltaBytes+=b.length;}
 }
 expect(deltaBytes).toBeLessThan(legacyBytes*.8);
});
it('rejects delta corruption without advancing the valid motion baseline',()=>{
 const s=state(),e=new ChaosEncoder('delta',true),d=new ChaosDecoder();const first=e.encode(s).payload;
 expect(d.read(first)).not.toBeNull();s.shots[0].p.x+=.1;s.shots[1].age+=.033;const valid=e.encode(s).payload;
 expect(JSON.parse(valid).motion.some((row:number[])=>row[0]<0)).toBe(true);
 for(const edit of [(f:any)=>delete f.motionEncoding,(f:any)=>f.motion[0][0]=-999,(f:any)=>f.motion[0][1]=Number.MAX_SAFE_INTEGER,(f:any)=>f.motion.push(f.motion[0])]){
  const bad=JSON.parse(valid);edit(bad);expect(d.read(JSON.stringify(bad))).toBeNull();
 }
 expect(new ChaosDecoder().read(valid)).toBeNull();
 expect(d.read(valid)?.message).toEqual(JSON.parse(serializeServerMessage({type:'chaos',state:s})));
 const badFull=JSON.parse(first);badFull.motion[0][0]*=-1;expect(new ChaosDecoder().read(JSON.stringify(badFull))).toBeNull();
});
