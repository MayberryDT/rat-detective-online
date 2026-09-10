// Owns a throwaway loopback Worker. Deliberately has no target-URL option.
import { Worker } from 'node:worker_threads';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { prepareFixture } from './lib/capacity-fixture.mjs';
import {playbackHealthy} from './lib/capacity-quality.mjs';
import { getFreePort, spawnProcess, stopProcess, waitForHttpOk } from './lib/process.mjs';
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function options(args) {
  const { values } = parseArgs({ args, options: {
    players: { type: 'string', default: '2,8,12,24,32,50,75,100' },
    phases: { type: 'string', default: 'idle,movement,combat,incident' },
    warmup: { type: 'string', default: '30' },
    'phase-seconds': { type: 'string', default: '45' },
    label: { type: 'string', default: 'ladder' },
    transport: { type: 'string', default: 'compact-v2' },
    storage: { type: 'string', default: 'disk' },
    layout: { type: 'string', default: 'dispersed' },
    latency: { type: 'string', default: '0' },
    jitter: { type: 'string', default: '0' },
    'admission-only': { type: 'boolean', default: false },
  }});
  if(!['disk','tmpfs'].includes(values.storage))throw Error('Storage must be disk or tmpfs');
  if(!['legacy','compact-v1','compact-v2'].includes(values.transport))throw new Error('Unknown transport');
  const latency=Number(values.latency),jitter=Number(values.jitter);
  if(!['dispersed','clustered'].includes(values.layout)||![latency,jitter].every(n=>Number.isInteger(n)&&n>=0&&n<=250))throw Error('Invalid layout or delay (0–250ms)');
  const players = values.players.split(',').map(Number);
  if (!players.length || players.length > 8 || players.some(n => !Number.isInteger(n) || n < 2 || n > 100) || new Set(players).size !== players.length) throw new Error('Use 1–8 distinct player counts between 2 and 100');
  const phases = values.phases.split(',');
  if(!phases.length || phases.length>5 || new Set(phases).size!==phases.length || phases.some(p=>!['idle','movement','combat','incident','churn'].includes(p)))throw new Error('Use distinct idle, movement, combat, incident phases');
  const warmup = Number(values.warmup), phaseSeconds = Number(values['phase-seconds']);
  if (!Number.isInteger(warmup) || warmup < 5 || warmup > 60 || !Number.isInteger(phaseSeconds) || phaseSeconds < 5 || phaseSeconds > 450) throw new Error('warmup: 5–60 seconds; phase-seconds: 5–450');
  if (!/^[a-z0-9-]{1,40}$/.test(values.label)) throw new Error('Invalid label');
  return { storage:values.storage, layout:values.layout,latency,jitter,transport:values.transport, players, phases, warmup, phaseSeconds, label: values.label, admissionOnly: values['admission-only'] };
}
export { summarize, phaseHealthy } from './lib/capacity-clients.mjs';
import { summarize, phaseHealthy } from './lib/capacity-clients.mjs';

async function main() {
  const opts=options(process.argv.slice(2));
  const out=join(root,'output',`local-capacity-${new Date().toISOString().replace(/[:.]/g,'-')}-${opts.label}`);await mkdir(out,{recursive:true});
  const maxPlayers=Math.max(16,...opts.players);
  const fixture=await prepareFixture(out,{maxPlayers});
  const {stage,validator}=fixture;
  const manifest={fixtureId:fixture.fixtureId,createdAt:new Date().toISOString(),options:opts,sourceHead:(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),dirty:true,overrides:[`copied MAX_PLAYERS=${maxPlayers}, MAX_CONNECTIONS=${maxPlayers+8}; fixed city seed 341283204`,'loopback-only copied Worker','copied all-incident controls: 25 second windows, one incident per interval'],sourceHashes:{}};
  for(const n of ['src/worker/GameRoom.ts','src/shared/networkProtocol.ts','src/shared/ChaosSimulation.ts','src/session/RemotePlayers.ts','src/utils/RatAnimator.ts'])manifest.sourceHashes[n]=createHash('sha256').update(await readFile(join(root,n))).digest('hex');
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({event:'prepared',out}));
  const storageRoot=opts.storage==='tmpfs'?await mkdtemp('/dev/shm/rat-detective-load-'):null;
  let current, pool=[],stopping=false;
  const shutdown=async()=>{stopping=true;await Promise.all(pool.map(w=>w.terminate()));await stopProcess(current);};
  process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
  const results=[];
  try {
    for(const count of opts.players) {
      if(stopping)break;
      const port=await getFreePort(),inspector=await getFreePort();
      const roomName=`graybox-benchmark-${count}-${randomUUID()}`;
      const logs=createWriteStream(join(out,`${count}-server.log`));let tail='';const diagnostics=[];
      current=spawnProcess(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',join(stage,'wrangler.jsonc'),'--local','--ip','127.0.0.1','--port',String(port),'--inspector-port',String(inspector),'--persist-to',join(storageRoot??stage,`state-${count}`),'--show-interactive-dev-session','false'],{cwd:stage,stdio:['ignore','pipe','pipe'],env:{WRANGLER_SEND_METRICS:'false'}});
      for(const stream of [current.stdout,current.stderr])stream.on('data',chunk=>{logs.write(chunk);tail+=chunk;let i;while((i=tail.indexOf('\n'))>=0){const line=tail.slice(0,i);tail=tail.slice(i+1);const a=line.indexOf('{');if(a>=0)try{const m=JSON.parse(line.slice(a));if(m.message==='room diagnostics')diagnostics.push(m);}catch{}}});
      const result={players:count,room:roomName,startedAt:new Date().toISOString(),phases:[],status:'running'};
      console.log(JSON.stringify({event:'starting',players:count,url:`http://127.0.0.1:${port}/?room=${roomName}&diagnostics`}));
      const mail=new Map();
      function receive(w,type,timeout=20000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${type} timeout`)),timeout);mail.set(w,{type,resolve:m=>{clearTimeout(timer);resolve(m);},reject});});}
      try {
        await waitForHttpOk(`http://127.0.0.1:${port}/health`,{timeoutMs:60000});
        for(let i=0;i<Math.min(4,count);i++){
          const n=Math.floor(count/Math.min(4,count))+(i<count%Math.min(4,count)?1:0), offset=pool.reduce((a,w)=>a+w.clientCount,0);
          const w=new Worker(new URL('./lib/capacity-clients.mjs', import.meta.url),{workerData:{layout:opts.layout,latency:opts.latency,jitter:opts.jitter,transport:opts.transport,count:n,offset,first:i===0,url:`ws://127.0.0.1:${port}/ws?room=${roomName}`,validator}});w.clientCount=n;
          w.on('message',m=>{const waiter=mail.get(w);if(m.type==='failed'){waiter?.reject(new Error(m.error));return;}if(waiter?.type===m.type){mail.delete(w);waiter.resolve(m);}});
          w.on('error',error=>mail.get(w)?.reject(error));pool.push(w);
        }
        const joined=await Promise.all(pool.map(w=>receive(w,'ready',60000)));
        result.startup={invalid:joined.reduce((n,m)=>n+m.startup.invalid,0),errors:joined.reduce((n,m)=>n+m.startup.errors,0),messages:joined.reduce((n,m)=>n+m.startup.messages,0)};
        if(opts.admissionOnly){
          result.status='admission-only';result.admitted=count;
          console.log(JSON.stringify({event:'admission-result',players:count,admitted:count,startup:result.startup}));
        } else {
        const warmupReady=pool.map(w=>receive(w,'phaseReady'));pool.forEach(w=>w.postMessage({type:'phase',phase:'warmup'}));await Promise.all(warmupReady);
        console.log(JSON.stringify({event:'joined',players:count,fullFeedClients:count,warmupSeconds:opts.warmup}));
        await delay(opts.warmup*1000);
        for(const phase of opts.phases){
          if(stopping)break;
          const firstDiagnostic=diagnostics.length,host=[];
          const ack=pool.map(w=>receive(w,'phaseReady'));pool.forEach(w=>w.postMessage({type:'phase',phase}));await Promise.all(ack);
          const started=Date.now();console.log(JSON.stringify({event:'phase',players:count,phase,seconds:opts.phaseSeconds}));
          while(Date.now()-started<opts.phaseSeconds*1000&&!stopping){
            if(phase==='churn'){const churn=pool.map(w=>receive(w,'churnReady'));pool.forEach(w=>w.postMessage({type:'churn'}));await Promise.all(churn);}
            await delay(Math.min(5000,opts.phaseSeconds*1000-(Date.now()-started)));
            const memory=await readFile('/proc/meminfo','utf8');const availableMb=Number(memory.match(/MemAvailable:\s+(\d+)/)?.[1]||0)/1024;
            const {stdout}=await exec('ps',['-eo','pid=,ppid=,rss=,cputimes=,comm=']);const rows=stdout.trim().split('\n').map(line=>line.trim().split(/\s+/));
            const owned=new Set([current.pid]);let change=true;while(change){change=false;for(const r of rows)if(owned.has(Number(r[1]))&&!owned.has(Number(r[0]))){owned.add(Number(r[0]));change=true;}}
            const children=rows.filter(r=>owned.has(Number(r[0])));const rssMb=children.reduce((a,r)=>a+Number(r[2]),0)/1024;
            host.push({at:Date.now(),availableMb,serverRssMb:rssMb,serverCpuSeconds:children.reduce((a,r)=>a+Number(r[3]),0),generatorRssMb:process.memoryUsage().rss/1048576});
            if(availableMb<512||rssMb>2048){result.stopReason='Local memory safety threshold';stopping=true;}
          }
          const reports=pool.map(w=>receive(w,'report'));pool.forEach(w=>w.postMessage({type:'report'}));const samples=(await Promise.all(reports)).map(m=>m.report);
          const metrics={};for(const key of ['gaps','serverGaps','ages','rtts','moveAges','loop'])metrics[key]=summarize(samples.map(s=>s[key]));
          for(const key of ['bytes','messages','invalid','errors','disconnects','sentMoves','sentShots','shotEvents','deaths','respawns','skipped','shotSamples','oldShots','wireSamples','sampledWireBytes','sampledLegacyBytes','tamperingSnapshots','missingCaseSnapshots'])metrics[key]=samples.reduce((a,s)=>a+s[key],0);
          for(const key of ['peakBalls','maxBuffered','maxSilence'])metrics[key]=Math.max(...samples.map(s=>s[key]));
          metrics.incidentsSeen=[...new Set(samples.flatMap(s=>Object.keys(s.incidentsSeen)))];
          metrics.worstGaps=samples.flatMap(s=>s.worstGaps).sort((a,b)=>b.clientGap-a.clientGap).slice(0,20);
          const durationMs=Date.now()-started;const server=diagnostics.slice(firstDiagnostic);
          const arrivalPassed=phaseHealthy(metrics);
          const playbackPassed=phase==='idle'?null:samples.every(sample=>playbackHealthy({...Object.fromEntries(['gaps','serverGaps','loop'].map(key=>[key,summarize([sample[key]])])),...Object.fromEntries(['maxSilence','invalid','errors','disconnects','skipped','playback'].map(key=>[key,sample[key]]))}));
          const rosterPassed=samples.every(s=>s.minRosterSize===count&&s.minScoreboardSize===count);
          const passed=arrivalPassed&&playbackPassed!==false&&rosterPassed&&metrics.missingCaseSnapshots===0;
          const phaseResult={phase,durationMs,passed,arrivalPassed,playbackPassed,rosterPassed,playback:samples.map(s=>s.playback),metrics,host,server};result.phases.push(phaseResult);
          console.log(JSON.stringify({event:'phase-result',players:count,phase,passed,playbackPassed,rosterPassed,gapP95:metrics.gaps.p95,gapP99:metrics.gaps.p99,gapMax:metrics.gaps.max,maxSilence:metrics.maxSilence,generatorLoopP99:metrics.loop.p99,invalid:metrics.invalid,errors:metrics.errors,peakBalls:metrics.peakBalls,mbps:metrics.bytes*8000/durationMs/1e6}));
          await writeFile(join(out,`${count}.json`),JSON.stringify(result,null,2));
          if(metrics.loop.p99>250||metrics.gaps.max>10000||metrics.maxSilence>10000){result.stopReason='Severe generator delay or server silence; higher workloads deferred';stopping=true;}
        }
        result.status=stopping?'stopped':result.phases.every(p=>p.passed)&&result.startup.invalid===0&&result.startup.errors===0?'passed':'degraded';
        }
      }catch(error){result.status='failed';result.error=String(error);console.log(JSON.stringify({event:'failure',players:count,error:String(error)}));}
      finally{
        const stop=pool.map(w=>receive(w,'stopped',3000).catch(()=>{}));pool.forEach(w=>w.postMessage({type:'stop'}));await Promise.all(stop);await Promise.all(pool.map(w=>w.terminate()));pool=[];
        await stopProcess(current);logs.end();current=null;
      }
      results.push(result);await writeFile(join(out,`${count}.json`),JSON.stringify(result,null,2));await writeFile(join(out,'results.json'),JSON.stringify({manifest,results},null,2));
    }
  }finally{await shutdown();if(storageRoot)await rm(storageRoot,{recursive:true,force:true});}
  console.log(JSON.stringify({event:'complete',out,levels:results.map(r=>({players:r.players,status:r.status}))}));
  if(results.length!==opts.players.length||results.some(r=>!['passed','admission-only'].includes(r.status)))process.exitCode=1;
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url))await main();
