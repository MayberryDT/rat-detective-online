// Passive protocol checks in disposable rooms; no browser/gameplay input.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import WebSocket from 'ws';
import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
const receipt=JSON.parse(await readFile(process.argv[2],'utf8'));
const origin=new URL(process.argv[3]??'http://127.0.0.1:5198');
if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Use the private local relay');
const {CAPACITY_TEST_TOKEN:token}=JSON.parse(await readFile(receipt.tokenFile,'utf8'));
const auth={Authorization:`Bearer ${token}`};
const get=async(path,room)=>{const url=new URL(path,receipt.url);if(room)url.searchParams.set('room',room);const r=await fetch(url,{headers:auth,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();};
const health=await get('/health');if(health.fixtureId!==receipt.fixtureId||health.maxPlayers!==10||!receipt.botExperiments)throw Error('Wrong experiment fixture');
const html=await (await fetch(origin)).text();const files=['index.html',...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"?]+)"/g)].map(m=>m[1]))];
for(const file of files){const remote=Buffer.from(await (await fetch(new URL(file,origin))).arrayBuffer()),local=await readFile(join(receipt.stage,'dist',file));if(!remote.equals(local))throw Error(`Frozen asset mismatch: ${file}`);}
const probes=[];const suffix=Date.now().toString(36);
for(const variant of ['baseline','maneuvers','commitment','attention','combined'])for(const full of [false,true]){
 const room=`graybox-benchmark-${full?'ai':'match'}-bot-${variant}-probe-${suffix}`;
 const before=await get(full?'/lobby-status':'/status',room);
 if(before.players!==(full?10:0)||before.bots!==(full?10:0))throw Error('Wrong initial population');
 const url=new URL('/ws',origin);url.protocol='ws:';url.searchParams.set('room',room);
 const ws=new WebSocket(url,{origin:origin.origin});let timer;
 try{
  const result=await new Promise((resolve,reject)=>{
   let welcome,chaos=0,movements=0;
   timer=setTimeout(()=>reject(Error('Timed out waiting for hosted simulation')),20000);
   ws.on('error',reject);
   ws.on('open',()=>ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Experiment Check',appearance:{hatType:'fedora',hatColor:1,furColor:2,coatColor:3}})));
   ws.on('message',raw=>{
    try{
     const m=readSocketMessage(ws,raw);if(!m)return;
     if(m.type==='error')throw Error(m.message);
     if(m.type==='welcome')welcome=m;
     if(m.type==='chaos'){if(m.state.assignment?.id!=='jurisdiction')throw Error('Assignment pin missing');chaos++;}
     if(m.type==='playersMoved'||m.type==='playerMoved')movements++;
     if(welcome&&chaos>=3){
      const players=Object.values(welcome.players),bots=players.filter(p=>p.id.startsWith('rd-ai-')).length;
      if(players.length!==(full?10:8)||bots!==(full?9:7))throw Error(`Wrong joined roster ${players.length}/${bots}`);
      resolve({variant,population:players.length,bots,chaosFrames:chaos,movementFrames:movements});
     }
    }catch(error){reject(error);}
   });
  });
  probes.push(result);console.log(JSON.stringify(result));
 }finally{
  clearTimeout(timer);await new Promise(resolve=>{if(ws.readyState===3)return resolve();ws.once('close',resolve);ws.close(1000,'verification complete');setTimeout(()=>{ws.terminate();resolve();},2000).unref();});
  if(full){const u=new URL('/cleanup',receipt.url);u.searchParams.set('room',room);const r=await fetch(u,{method:'POST',headers:auth,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Cleanup failed ${r.status}`);}
 }
}
const result={checkedAt:new Date().toISOString(),fixtureId:receipt.fixtureId,version:receipt.version,maxPlayers:health.maxPlayers,protocol:PROTOCOL_VERSION,assetHashes:await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await readFile(join(receipt.stage,'dist',file))).digest('hex')}))),probes};
await writeFile('output/bot-experiments-2026-09-14/hosted-check.json',JSON.stringify(result,null,2));
