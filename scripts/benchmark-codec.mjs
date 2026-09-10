// Local CPU comparison only; no sockets, disk writes in the timed region, or capacity claim.
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=resolve(root,'output/network-fixes-2026-09-10');await mkdir(out,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function runtime(baseline){
 const outfile=resolve(out,baseline?'codec-before.mjs':'codec-after.mjs');
 await build({stdin:{contents:"export {ChaosDelivery} from './src/worker/ChaosDelivery.ts'; export {prepareChaos,ChaosDecoder} from './src/shared/chaosWire.ts'; export {createAssignment} from './src/shared/assignments.ts';",resolveDir:root},outfile,bundle:true,platform:'node',format:'esm',plugins:baseline?[{name:'baseline',setup(b){b.onLoad({filter:/\.ts$/},args=>({contents:execFileSync('git',['show',`${revision}:${relative(root,args.path)}`],{encoding:'utf8'}),loader:'ts'}));}}]:[]});
 return import(pathToFileURL(outfile));
}
const before=await runtime(true),after=await runtime(false);
function state(api){return {time:10000,case:{p:{x:1.123456,y:1,z:2},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0},owner:null,previousOwner:null,pickupAfter:0,returningUntil:0},extraCases:[],dispatch:{phase:'ready',started:0,until:0,serial:0},pressure:{serial:0,until:0,launches:[]},possession:{},notice:{serial:0,text:'Audit fixture'},corpses:[],impacts:[],assignment:api.createAssignment('closing-time',1000),shots:Array.from({length:256},(_,i)=>({id:`12345678-1234-1234-1234-${String(i).padStart(12,'0')}`,owner:`12345678-1234-1234-1234-${String(1000+i%24).padStart(12,'0')}`,p:{x:45.123456+i*.137,y:7.456789,z:123.456789},v:{x:38.123456,y:8.345678,z:32.56789},age:1.234567,original:true,wallBounced:i%2===0}))};}
function measure(api,count){
 const s=state(api),receivers=Array.from({length:count},()=>new api.ChaosDelivery(true)),samples=[];let bytes=0;
 for(let frame=0;frame<240;frame++){
  s.time+=1000/30;for(const shot of s.shots){shot.p.x+=.137;shot.p.y-=.04;shot.v.y-=.163;shot.age+=1/30;}
  const start=performance.now(),prepared=api.prepareChaos(s);
  for(const receiver of receivers){const payload=receiver.offer(s,frame*1000/30,prepared);bytes+=receiver.lastFrame?.bytes??Buffer.byteLength(payload);receiver.acknowledge(receiver.lastFrame?.ack??{type:'chaosAck',stream:receiver.encoder.stream,seq:receiver.encoder.seq});}
  if(frame>=60)samples.push(performance.now()-start);
 }
 samples.sort((a,b)=>a-b);return {medianMs:samples[90],p95Ms:samples[171],bytes};
}
const results=[];
for(const count of [1,13,24,50])results.push({connections:count,before:measure(before,count),after:measure(after,count)});
const report={scope:'Node codec microbenchmark; excludes transport, physics, database and render work',node:process.version,baseline:revision,results};
await writeFile(resolve(out,'codec-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
