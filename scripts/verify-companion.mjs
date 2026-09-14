#!/usr/bin/env node
// Bounded hosted admission/status verification. No movement, firing or browser input.
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { readSocketMessage, PROTOCOL_VERSION } from './lib/network-codec.mjs';

const { positionals, values } = parseArgs({allowPositionals:true,options:{output:{type:'string'},'read-only':{type:'boolean',default:false}}});
const origin = new URL(positionals[0] || 'https://ratdetective.online');
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Use an HTTPS origin');
if (!values['read-only'] && !/^rat-detective-staging\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname)) throw new Error('Admission checks are restricted to the staging Worker; use --read-only for production');
const sockets = [];
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const report = {origin:origin.origin,checkedAt:new Date().toISOString(),protocol:PROTOCOL_VERSION,readOnly:values['read-only']};
async function status(query='') {
  const response=await fetch(new URL('/api/companion/v1/status'+query,origin),{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/application\/json/);
  const data=await response.json();
  assert.equal(data.schemaVersion,1); assert.ok(Array.isArray(data.rooms));
  for(const room of data.rooms) {
    assert.ok(room.room==='public-live-v2'||/^public-live-v2-[0-9a-f-]{36}$/.test(room.room));
    assert.ok(room.players<=16 && room.humans<=room.players);
    assert.equal(room.scores.length,room.players);
    assert.ok(room.expiresAt>room.observedAt);
    assert.ok(['closing-time','chain-of-custody','excessive-force','jurisdiction'].includes(room.assignment.id));
  }
  assert.ok(!/resumeToken|resumeCredential|authorization/i.test(JSON.stringify(data)));
  return data;
}
function join(preferred) {
  return new Promise((resolve,reject)=>{
    const url=new URL('/ws',origin);url.protocol='wss:';
    if(preferred)url.searchParams.set('preferred',preferred);
    const ws=new WebSocket(url,{origin:origin.origin});sockets.push(ws);
    const timeout=setTimeout(()=>{ws.terminate();reject(new Error('Welcome timeout'));},15000);
    ws.once('error',error=>{clearTimeout(timeout);reject(error);});
    ws.on('open',()=>ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Dispatch Check',appearance:{hatType:'fedora',hatColor:1,furColor:2,coatColor:3}})));
    ws.on('message',raw=>{
      const message=readSocketMessage(ws,raw);if(!message)return;
      if(message.type==='error'){clearTimeout(timeout);reject(new Error(message.message));}
      if(message.type==='welcome') {clearTimeout(timeout);resolve({ws,room:message.matchRoom,total:Object.keys(message.players).length});}
    });
  });
}
async function closeAll() {
  await Promise.all(sockets.map(ws=>new Promise(resolve=>{
    if(ws.readyState===WebSocket.CLOSED)return resolve();
    ws.once('close',resolve);ws.close(1000,'companion verification complete');
    setTimeout(()=>{ws.terminate();resolve();},1500).unref();
  })));
}
try {
  const before=await status();report.initialListedRooms=before.rooms.length;
  if(!values['read-only']) {
    assert.equal(before.rooms.length,0,'Staging already has activity; do not overlap a human playtest');
    const first=await join();assert.equal(first.total,8);
    const rest=[];
    for(let i=0;i<16;i++)rest.push(await join());
    const expected=[...new Set([first,...rest].map(client=>client.room))];
    assert.equal(expected.length,2);
    let current;
    for(let i=0;i<15;i++){current=await status();if(expected.every(room=>current.rooms.some(row=>row.room===room))&&current.rooms.reduce((n,r)=>n+r.humans,0)===17)break;await delay(1000);}
    assert.ok(expected.every(room=>current.rooms.some(row=>row.room===room)),'Both occupied rooms must appear');
    assert.equal(current.rooms.reduce((n,r)=>n+r.humans,0),17);
    const page=await status('?limit=1');assert.equal(page.rooms.length,1);assert.ok(page.nextCursor);
    const second=await status('?limit=1&cursor='+encodeURIComponent(page.nextCursor));
    assert.equal(second.rooms.length,1);assert.notEqual(second.rooms[0].room,page.rooms[0].room);
    const overflow=expected.find(room=>room!=='public-live-v2');
    const invited=await join(overflow);assert.equal(invited.room,overflow);
    report.admission={initialTotal:first.total,humans:18,rooms:2,maxRoomSize:16,preferredJoin:true,pagination:true};
    await closeAll();
    let after;
    for(let i=0;i<55;i++){after=await status();if(after.rooms.length===0)break;await delay(1000);}
    assert.equal(after.rooms.length,0,'All rooms should disappear after disconnect reservation expiry');
    report.departureCleanup=true;
  }
  report.ok=true;
} finally {await closeAll();}
if(values.output)await writeFile(values.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
