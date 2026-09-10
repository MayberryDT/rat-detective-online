import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
// One read-only game observer, then a completely disconnected interval.
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const {values,positionals}=parseArgs({allowPositionals:true,options:{'token-file':{type:'string'},output:{type:'string'},seconds:{type:'string',default:'30'}}});
const origin=new URL(positionals[0]);
const token=values['token-file']?JSON.parse(await readFile(values['token-file'],'utf8')).NETWORK_TEST_TOKEN:undefined;
const headers={Origin:origin.origin,...token?{Authorization:`Bearer ${token}`}:{}};
const seconds=Number(values.seconds);assert(seconds>=5&&seconds<=90);
const validCount=n=>assert(Number.isInteger(n)&&n>=8&&n<=11,'expected 8–11 bots');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function status(){const r=await fetch(new URL('/status',origin),{headers});assert.equal(r.status,200);return r.json();}
async function observe(duration){
  const url=new URL('/ws',origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(url,{headers});let welcome,state,closed=false,error;const gaps=[],counts={},positions=new Map();let last=0;
  const ready=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('welcome timeout')),20000);
    ws.on('open',()=>ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Launch Observer',appearance:{hatType:'fedora',hatColor:0xdc4a3c,furColor:0xe8b84d,coatColor:0xbe4545}})));
    ws.on('message',raw=>{const m=readSocketMessage(ws,raw);if(!m)return;counts[m.type]=(counts[m.type]??0)+1;
      if(m.type==='welcome'){welcome=m;clearTimeout(timeout);resolve();}
      if(m.type==='chaos'){if(last)gaps.push(Date.now()-last);last=Date.now();state=m.state;}
      if(m.type==='playerMoved')positions.set(m.player.id,m.player);
      if(m.type==='error')error=m.message;
    });
    ws.on('error',e=>{error=e.message;clearTimeout(timeout);reject(e);});
    ws.on('close',()=>{closed=true;});
  });
  await ready;
  assert.equal(welcome.world.version,2);validCount(Object.keys(welcome.players).filter(id=>id.startsWith('rd-ai-')).length);
  const timer=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping',sentAt:Date.now()}));},1000);
  await pause(duration);clearInterval(timer);
  assert(!closed,'server disconnected observer');assert(!error,error);assert(state,'no simulation snapshots');
  ws.close();await pause(300);
  return {world:welcome.world,players:welcome.players,stateTime:state.time,shots:state.shots.length,counts,gaps:{count:gaps.length,max:Math.max(0,...gaps),mean:gaps.reduce((a,b)=>a+b,0)/(gaps.length||1)}};
}
const initial=await status();validCount(initial.bots);
const before=await observe(seconds*1000);
const empty=await status();validCount(empty.bots);assert.equal(empty.players,empty.bots,'unexpected human in empty interval');
console.log(JSON.stringify({phase:'disconnected',seconds,before:{counts:before.counts,gaps:before.gaps,shots:before.shots},empty}));
await pause(seconds*1000);
const after=await observe(5000);const final=await status();validCount(final.bots);assert.equal(final.players,final.bots);
const ids=Object.keys(before.players).filter(id=>id.startsWith('rd-ai-')).sort();
const moved=ids.filter(id=>after.players[id]&&Math.hypot(before.players[id].x-after.players[id].x,before.players[id].z-after.players[id].z)>1).length;
assert(moved>0,'bots did not change position across disconnected interval');
const result={verifiedAt:new Date().toISOString(),origin:origin.origin,seconds,initial,before:{world:before.world,stateTime:before.stateTime,counts:before.counts,gaps:before.gaps},after:{stateTime:after.stateTime,counts:after.counts,gaps:after.gaps},moved,final};
if(values.output)await writeFile(values.output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
