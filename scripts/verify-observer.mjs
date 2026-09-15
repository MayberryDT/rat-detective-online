// Read-only role proof on a disposable hosted fixture; no browser input.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
const receipt=JSON.parse(await readFile(process.argv[2],'utf8'));
const origin=new URL(process.argv[3]??'http://127.0.0.1:5198');
assert(['localhost','127.0.0.1'].includes(origin.hostname));
const {CAPACITY_TEST_TOKEN:token}=JSON.parse(await readFile(receipt.tokenFile,'utf8'));
const headers={Authorization:`Bearer ${token}`};
const request=async(path,room,method='GET')=>{
 const u=new URL(path,receipt.url);if(room)u.searchParams.set('room',room);
 const r=await fetch(u,{method,headers,signal:AbortSignal.timeout(15000)});assert(r.ok,`${path}: ${r.status}`);return r.json();
};
assert.equal((await request('/health')).fixtureId,receipt.fixtureId);
let assets=0;
async function checkAssets(dir=''){
 for(const entry of await readdir(join(receipt.stage,'dist',dir),{withFileTypes:true})){
  const name=join(dir,entry.name);if(entry.isDirectory()){await checkAssets(name);continue;}
  const response=await fetch(new URL(name,origin));assert(response.ok);assert(Buffer.from(await response.arrayBuffer()).equals(await readFile(join(receipt.stage,'dist',name))),name);assets++;
 }
}
await checkAssets();
const room=`graybox-benchmark-ai-bot-combined-observe-${Date.now().toString(36)}`;
const sockets=[];
async function connect(){
 const url=new URL('/ws',origin);url.protocol='ws:';url.searchParams.set('room',room);url.searchParams.set('observe','1');url.searchParams.set('chaos','compact-v2');url.searchParams.set('movement','tuple-v1');
 const ws=new WebSocket(url,{origin:origin.origin});sockets.push(ws);
 let welcome,frames=0,moves=0;const moved=new Set();
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Observer feed timed out')),20000);
  const finish=(error)=>{clearTimeout(timer);error?reject(error):resolve();};
  ws.on('error',finish);
  ws.on('open',()=>ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Observation check',appearance:{hatType:'fedora',hatColor:1,furColor:2,coatColor:3}})));
  ws.on('message',raw=>{try{
   const m=readSocketMessage(ws,raw);if(!m)return;
   if(m.type==='error')throw Error(m.message);
   if(m.type==='welcome'){
    welcome=m;assert.equal(m.observing,true);assert.equal(m.resumeToken,undefined);assert.equal(m.players[m.id],undefined);
    assert.equal(Object.keys(m.players).length,10);assert(Object.keys(m.players).every(id=>id.startsWith('rd-ai-')));
    // The authority must discard all attempts to participate, even from a modified client.
    ws.send(JSON.stringify({type:'shoot',shotId:'observer-forbidden',origin:{x:m.player.x,y:m.player.y,z:m.player.z},direction:{x:1,y:0,z:0}}));
    ws.send(JSON.stringify({type:'hit',victimId:Object.keys(m.players)[0],damage:3}));
   }
   if(m.type==='chaos'){assert(['closing-time','chain-of-custody','excessive-force','jurisdiction'].includes(m.state.assignment?.id));if(receipt.assignment??receipt.firstAssignment)assert.equal(m.state.assignment?.id,receipt.assignment??receipt.firstAssignment);assert(!m.state.shots.some(s=>s.owner===welcome?.id));assert.notEqual(m.state.case.owner,welcome?.id);frames++;}
   if(m.type==='playerMoved'){moves++;moved.add(m.player.id);}
   if(m.type==='playersMoved'){moves++;for(const p of m.players){assert.equal(typeof p.player.id,'string');moved.add(p.player.id);}}
   if(welcome&&frames>=30&&moves>=3)finish();
  }catch(error){finish(error);}});
 });
 return{ws,id:welcome.id,frames,moves,movedBots:moved.size};
}
async function close(ws){await new Promise(resolve=>{if(ws.readyState===WebSocket.CLOSED)return resolve();ws.once('close',resolve);ws.close(1000,'Observer proof complete');setTimeout(()=>{ws.terminate();resolve();},2000).unref();});}
const probes=[];
try{
 const before=await request('/lobby-status',room);assert.equal(before.players,10);assert.equal(before.bots,10);
 const first=await connect();probes.push({phase:'first',...first,ws:undefined});
 const second=await connect();probes.push({phase:'second observer',...second,ws:undefined});assert.notEqual(first.id,second.id);
 await close(first.ws);
 const retry=await connect();probes.push({phase:'reconnect',...retry,ws:undefined});assert.notEqual(first.id,retry.id);
 const during=await request('/lobby-status',room);assert.equal(during.players,10);assert.equal(during.bots,10);assert.equal(during.scores.length,10);
 for(const ws of sockets)await close(ws);
 const after=await request('/lobby-status',room);assert.equal(after.players,10);assert.equal(after.bots,10);
 const result={checkedAt:new Date().toISOString(),fixtureId:receipt.fixtureId,version:receipt.version,assignment:receipt.assignment??receipt.firstAssignment??'auto',assets,probes,before:{players:before.players,bots:before.bots},during:{players:during.players,bots:during.bots},after:{players:after.players,bots:after.bots}};
 await writeFile('output/observation-2026-09-14/hosted-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{for(const ws of sockets)await close(ws);await request('/cleanup',room,'POST');}
