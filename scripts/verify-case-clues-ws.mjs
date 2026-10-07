// Real GameRoom E2E: two independent clients, late join, reconnect, bounded shared evidence.
// CI/local workerd is transport proof only, never a human gameplay preview.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
const url=new URL(process.env.P4_WS??process.env.SMOKE_WS_URL??'ws://127.0.0.1:8787/ws');
url.searchParams.delete('room');url.searchParams.set('agent','1');
const token=process.env.P4_TOKEN_FILE?JSON.parse(await readFile(process.env.P4_TOKEN_FILE,'utf8')).NETWORK_TEST_TOKEN:undefined;
const clients=[],errors=[],receipt={protocol:PROTOCOL_VERSION,checks:[],frames:0,clueIds:new Set(),maxClues:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(resume){
 const target=new URL(url);if(resume){target.searchParams.set('resume','1');target.searchParams.set('preferred',resume.room);}
 const ws=new WebSocket(target,{headers:{Origin:url.origin.replace(/^ws/,'http'),...(token?{Authorization:`Bearer ${token}`}:{})}});
 const c={ws,welcome:null,states:new Map()};clients.push(c);
 ws.on('error',e=>errors.push(e.message));
 ws.on('message',raw=>{try{
  const m=readSocketMessage(ws,raw);if(!m)return;
  if(m.type==='error')errors.push(m.message);
  if(m.type==='welcome')c.welcome=m;
  const s=m.type==='chaos'?m.state:m.type==='welcome'?m.chaos:undefined;
  if(s){assert.ok(Array.isArray(s.clues));assert.ok(s.clues.length<=128);assert.equal(new Set(s.clues.map(x=>x.id)).size,s.clues.length);
   c.states.set(s.time,s.clues);if(c.states.size>1000)c.states.delete(c.states.keys().next().value);
   receipt.frames++;receipt.maxClues=Math.max(receipt.maxClues,s.clues.length);for(const clue of s.clues)receipt.clueIds.add(clue.id);
  }
 }catch(e){errors.push(e.message);}});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'P4 Agent Check',appearance:{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},...(resume?{resumeToken:resume.resumeToken}:{})}));
 for(let i=0;i<100&&!c.welcome;i++)await sleep(100);
 assert.ok(c.welcome,'welcome');return c;
}
try{
 const a=await open();assert.equal(a.welcome.protocolVersion,PROTOCOL_VERSION);
 const bots=Object.keys(a.welcome.players).filter(id=>id.startsWith('rd-ai-')).length;
 assert.ok(bots>=6&&bots<=9,`production roster: ${bots}`);receipt.bots=bots;
 await sleep(2500);const b=await open();
 for(let i=0;i<120;i++){if([...b.states.keys()].filter(t=>a.states.has(t)).length>25)break;await sleep(250);}
 let common=0;for(const [time,clues] of b.states)if(a.states.has(time)){assert.deepEqual(clues,a.states.get(time));common++;}
 assert.ok(common>20,`shared frames ${common}`);assert.ok(receipt.clueIds.size>0,'authority produced clues');
 receipt.checks.push(`two clients agree on ${common} exact authority frames`,'late join receives bounded shared evidence');
 const priorIds=new Set([...a.states.values()].flat().map(c=>c.id));a.ws.close(1000,'reconnect check');await sleep(250);
 const resumed=await open(a.welcome);assert.equal(resumed.welcome.id,a.welcome.id);await sleep(1500);
 assert.ok([...resumed.states.values()].flat().some(c=>priorIds.has(c.id)),'reconnect keeps history');
 receipt.checks.push('same identity resumes with existing evidence','normal 6–9 server bots join only with clients');
 assert.deepEqual(errors,[]);receipt.clueIds=[...receipt.clueIds];receipt.passed=true;receipt.verifiedAt=new Date().toISOString();
 const text=JSON.stringify(receipt,null,2)+'\n';await writeFile(process.env.P4_RECEIPT??'/home/halla/build/rat-detective/physical-clues-20261007/room-e2e.json',text);console.log(text);
}finally{for(const c of clients)c.ws.close(1000,'P4 verification complete');}
