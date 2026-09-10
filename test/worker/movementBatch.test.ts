import {SELF} from 'cloudflare:test';
import {expect,it} from 'vitest';
import {parseServerMessage} from '../../src/shared/messageValidation';
const appearance={hatType:'fedora',hatColor:1,furColor:2,coatColor:3};
const wait=async(test:()=>boolean)=>{const end=Date.now()+4000;while(!test()){if(Date.now()>end)throw Error('Movement batch timeout');await new Promise(r=>setTimeout(r,10));}};
it('negotiates movement batches while preserving legacy delivery and movement-before-shot order',async()=>{
 const room=`graybox-batch-${crypto.randomUUID()}`,sockets:WebSocket[]=[];
 const open=async(batch:boolean)=>{
  const response=await SELF.fetch(`https://example.test/ws?room=${room}${batch?'&movement=batch-v1':''}`,{headers:{Upgrade:'websocket'}});
  expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();sockets.push(ws);
  const messages:any[]=[];ws.addEventListener('message',e=>{const m=parseServerMessage(String(e.data));expect(m).not.toBeNull();messages.push(m);});
  ws.send(JSON.stringify({type:'join',protocolVersion:4,name:'Rat',appearance}));await wait(()=>messages.some(m=>m.type==='welcome'));
  return{ws,messages,id:messages.find(m=>m.type==='welcome').id};
 };
 try{
  const batched=await open(true),legacy=await open(false),mover=await open(false);
  for(const x of [20,21])mover.ws.send(JSON.stringify({type:'updateMovement',position:{x,y:2,z:-18},rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}}));
  mover.ws.send(JSON.stringify({type:'shoot',shotId:crypto.randomUUID(),origin:{x:21,y:3.4,z:-18},direction:{x:1,y:0,z:0}}));
  await wait(()=>batched.messages.some(m=>m.type==='playerShot')&&legacy.messages.some(m=>m.type==='playerShot'));
  expect(batched.messages.some(m=>m.type==='playerMoved'&&m.player.id===mover.id)).toBe(false);
  const shot=batched.messages.findIndex(m=>m.type==='playerShot');
  const poses=batched.messages.slice(0,shot).filter(m=>m.type==='playersMoved').flatMap(m=>m.players).filter(p=>p.player.id===mover.id);
  expect(poses.at(-1).player.x).toBe(21);expect(poses.every(p=>Number.isFinite(p.at))).toBe(true);
  expect(legacy.messages.some(m=>m.type==='playersMoved')).toBe(false);
  expect(legacy.messages.filter(m=>m.type==='playerMoved'&&m.player.id===mover.id).map(m=>m.player.x)).toEqual([20,21]);
 }finally{await Promise.all(sockets.map(ws=>new Promise<void>(resolve=>{if(ws.readyState===WebSocket.CLOSED)return resolve();ws.addEventListener('close',()=>resolve(),{once:true});ws.close(1000,'test complete');})));}
});

it('rejects oversized, duplicate and non-finite movement batches',()=>{
 const player={id:'a',x:0,y:0,z:0,qx:0,qy:0,qz:0,qw:1,meshQx:0,meshQy:0,meshQz:0,meshQw:1};
 const sample={at:123,player};
 expect(parseServerMessage(JSON.stringify({type:'playersMoved',players:[sample]}))).toEqual({type:'playersMoved',players:[sample]});
 for(const players of [[],[sample,sample],[{...sample,at:-1}],[{...sample,player:{...player,x:null}}],Array.from({length:101},(_,i)=>({...sample,player:{...player,id:String(i)}}))])expect(parseServerMessage(JSON.stringify({type:'playersMoved',players}))).toBeNull();
});
