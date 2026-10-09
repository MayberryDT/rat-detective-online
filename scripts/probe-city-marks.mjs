import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
// E2E probe of what the chaos leaves (docs/plans/chaos-evidence-2026-10.md) on a hosted Worker: one agent rat
// (`agent=1`, never a human) joins a room and stands still while the room's own bots play; every chaos state is
// decoded as a client decodes it, and each chalk outline, muck run, wax run, flock and police radio call is recorded.
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
const seen={chalk:new Map(),muck:new Map(),wax:new Map(),flocks:new Map(),scanner:new Map()},deaths=[];
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
    for(const key of ['chalk','muck','wax','flocks','scanner'])for(const m of s[key]??[])if(!seen[key].has(m.id))seen[key].set(m.id,{...m,arrivedMs:now});
});
ws.on('error',()=>errors++);
await new Promise(resolve=>setTimeout(resolve,seconds*1000));ws.close();
const list=key=>[...seen[key].values()];
const report={target:url.origin,room:url.searchParams.get('room'),seconds,welcome,bots,chaosStates,errors,deaths:deaths.length,carriers:carriers.size,
    marks:{chalk:list('chalk').length,muck:list('muck').length,wax:list('wax').length,flocks:list('flocks').length,scanner:list('scanner').length},
    chalk:list('chalk').map(m=>({id:m.id,p:m.p,h:m.h,c:m.c,arrivedMs:m.arrivedMs})),
    muck:list('muck').map(r=>({id:r.id,prints:r.f.length/4,first:r.f.slice(0,3),arrivedMs:r.arrivedMs})),
    wax:list('wax').map(r=>({id:r.id,drops:r.f.length/4,carrier:r.c,first:r.f.slice(0,3),arrivedMs:r.arrivedMs})),
    flocks:list('flocks').map(f=>({id:f.id,p:f.p,carrier:f.c,arrivedMs:f.arrivedMs})),
    scanner:list('scanner').map(l=>({kind:l.kind,text:l.text,lead:!!l.p,delayMs:l.seen!==undefined?l.at-l.seen:undefined,arrivedMs:l.arrivedMs}))};
if(values.output)await writeFile(values.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({welcome,bots,chaosStates,errors,deaths:report.deaths,carriers:report.carriers,marks:report.marks,
    scanner:report.scanner.slice(0,12).map(l=>l.text)}));
process.exit(errors?1:0);
