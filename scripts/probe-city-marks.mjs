import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
// E2E probe of what the chaos leaves (docs/plans/chaos-evidence-2026-10.md) on a hosted Worker: one agent rat
// (`agent=1`, never a human) joins a fresh private room and stands still while the room's own bots play; every chaos
// state is decoded as a client decodes it, and each chalk outline, tip and muck run that arrives is recorded.
// node scripts/probe-city-marks.mjs https://rat-detective-staging.mayberrydt.workers.dev --seconds=120 --output=marks.json
import {writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import WebSocket from 'ws';
import {resolveSmokeWsUrl} from './lib/process.mjs';

const {values,positionals}=parseArgs({allowPositionals:true,options:{seconds:{type:'string',default:'120'},output:{type:'string'},room:{type:'string'}}});
const seconds=Number(values.seconds);
if(!Number.isFinite(seconds)||seconds<10||seconds>600)throw Error('seconds must be 10–600');
const url=resolveSmokeWsUrl(positionals[0]);
url.searchParams.set('room',values.room??`graybox-practice-marks-${crypto.randomUUID()}`);url.searchParams.set('agent','1');
const ws=new WebSocket(url,{headers:{Origin:url.origin.replace(/^ws/,'http')}});
const seen={chalk:new Map(),tips:new Map(),muck:new Map()},deaths=[];
let welcome,chaosStates=0,bots=0,carriers=new Set(),started=Date.now(),errors=0;
ws.on('open',()=>ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Marks Probe',appearance:{hatType:'fedora',hatColor:0x333333,furColor:0x9a8a7a,coatColor:0x334455}})));
ws.on('message',raw=>{
    let message;try{message=readSocketMessage(ws,raw);if(!message)return;}catch{errors++;return;}
    const now=Date.now()-started;
    if(message.type==='welcome'){welcome={protocol:message.protocolVersion,atMs:now,players:Object.keys(message.players).length};bots=Object.keys(message.players).length-1;}
    if(message.type==='error')errors++;
    if(message.type==='playerDied')deaths.push({atMs:now,cause:message.cause??(message.headshot?'headshot':'shot')});
    if(message.type!=='chaos')return;
    chaosStates++;const s=message.state;if(s.case?.owner)carriers.add(s.case.owner);
    for(const key of ['chalk','tips','muck'])for(const m of s[key]??[])if(!seen[key].has(m.id))seen[key].set(m.id,{...m,arrivedMs:now});
});
ws.on('error',()=>errors++);
await new Promise(resolve=>setTimeout(resolve,seconds*1000));ws.close();
const list=key=>[...seen[key].values()];
const report={target:url.origin,room:url.searchParams.get('room'),seconds,welcome,bots,chaosStates,errors,deaths:deaths.length,carriers:carriers.size,
    marks:{chalk:list('chalk').length,tips:list('tips').length,muck:list('muck').length},
    // The checks a viewer of this report needs: chalk lies on a floor, tips point somewhere, muck has two prints at least.
    chalk:list('chalk').map(m=>({id:m.id,p:m.p,h:m.h,c:m.c,arrivedMs:m.arrivedMs})),
    tips:list('tips').map(t=>({id:t.id,from:t.p,to:t.to,metres:Math.round(Math.hypot(t.to.x-t.p.x,t.to.z-t.p.z)),carrier:t.carrier,seenBeforeDeathMs:t.at-t.seen,arrivedMs:t.arrivedMs})),
    muck:list('muck').map(r=>({id:r.id,prints:r.f.length/4,first:r.f.slice(0,3),arrivedMs:r.arrivedMs}))};
if(values.output)await writeFile(values.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({welcome,bots,chaosStates,errors,deaths:report.deaths,carriers:report.carriers,marks:report.marks,
    tips:report.tips.map(t=>({metres:t.metres,seenBeforeDeathMs:t.seenBeforeDeathMs})),muck:report.muck.map(r=>r.prints)}));
process.exit(errors?1:0);
