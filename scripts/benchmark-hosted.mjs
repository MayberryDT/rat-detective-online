import { RemoteCapacityWorker } from './lib/capacity-remote.mjs';
import { sampleTcpStats } from './lib/capacity-tcp.mjs';
// Bounded full-feed ladder for the dedicated deployment receipt only.
import { Worker } from 'node:worker_threads';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { options } from './benchmark-local.mjs';
import { summarize, phaseHealthy, validateClientTarget } from './lib/capacity-clients.mjs';
import { projectRoot, PRIVATE_WORKER } from './lib/capacity-fixture.mjs';

export function hostedOptions(args) {
  const receipts = args.filter(a=>a.startsWith('--deployment='));
  if (receipts.length!==1) throw new Error('Supply exactly one --deployment=/absolute/deployment.json');
  const serverBots=Number(args.find(a=>a.startsWith('--server-bots='))?.slice('--server-bots='.length)??0);
  if(!Number.isInteger(serverBots)||serverBots<0||serverBots>99)throw Error('server-bots must be 0–99');
  const quality=args.find(a=>a.startsWith('--quality='))?.slice('--quality='.length)??'arrival';
  if(!['arrival','playback','both'].includes(quality))throw Error('quality must be arrival, playback or both');
  const playbackCandidates=args.includes('--playback-candidates');
  const remoteFirst=args.includes('--remote-first');
  const remote=args.find(a=>a.startsWith('--remote-runtime='))?.slice('--remote-runtime='.length);
  if(remote&&!/^\/tmp\/rat-capacity-[a-zA-Z0-9-]+$/.test(remote))throw Error('Invalid remote runtime');
  const opts = options(args.filter(a=>a!=='--playback-candidates'&&!a.startsWith('--deployment=')&&!a.startsWith('--remote-runtime=')&&!a.startsWith('--server-bots=')&&a!=='--remote-first'&&!a.startsWith('--quality=')));
  if(opts.players.some((n,i)=>i>0&&n<=opts.players[i-1]))throw new Error('Hosted levels must increase');
  if(opts.players.some(n=>n-serverBots<1))throw Error('Total rats must exceed server bots');
  if(remoteFirst&&!remote)throw Error('remote-first requires a remote runtime');
  return {...opts,playbackCandidates,quality,serverBots,remoteFirst,remoteRuntime:remote,deployment:resolve(receipts[0].slice('--deployment='.length))};
}
export function checkReceipt(receipt, token, now=Date.now()) {
  const url = new URL(receipt.url);
  if(receipt.worker!==PRIVATE_WORKER || receipt.hosted!==true || !/^[a-f0-9]{64}$/.test(receipt.fixtureId) || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt<=now || url.protocol!=='https:' || url.pathname!=='/' || url.search || url.hash || url.port) throw new Error('Invalid or expired private deployment receipt');
  url.protocol='wss:';url.pathname='/ws';url.searchParams.set('room','graybox-benchmark-check');
  validateClientTarget(url,token);
}
export function playbackHoldRate(p){
  const classes=p.holdClasses;
  // Historical reports without classification retain their conservative raw rate.
  if(!classes)return p.held/p.frames;
  const keys=['newest','oldest','stationaryInterior','movingInterior','unknown'];
  if(keys.some(k=>!Number.isInteger(classes[k])||classes[k]<0)||keys.reduce((n,k)=>n+classes[k],0)!==p.held)return Infinity;
  const stationary=classes.stationaryInterior;
  return (p.held-stationary)/(p.frames-stationary);
}
export function playbackHealthy(m){
  return m.gaps.count>0&&m.gaps.max<1000&&m.maxSilence<1000&&m.serverGaps.p95<=100&&m.serverGaps.p99<=250&&
    m.loop.count>0&&m.loop.p99<=25&&m.invalid===0&&m.errors===0&&m.disconnects===0&&m.skipped===0&&
    m.playback.frames-(m.playback.holdClasses?.stationaryInterior??0)>=600&&playbackHoldRate(m.playback)<=.01&&
    (m.playback.forwardSkips??0)===0&&(m.playback.maxRenderAgeMs??0)<=600;
}
export function qualityHealthy(metrics,quality) {
  if(quality==='both')return phaseHealthy(metrics)&&playbackHealthy(metrics)&&Object.values(metrics.byHost??{}).every(m=>phaseHealthy(m)&&playbackHealthy(m));
  return quality==='playback'?playbackHealthy(metrics):phaseHealthy(metrics);
}
function merge(samples) {
  const m={wireBytesByType:{}};
  for(const s of samples)for(const [type,bytes] of Object.entries(s.wireBytesByType??{}))m.wireBytesByType[type]=(m.wireBytesByType[type]??0)+bytes;
  for(const key of ['gaps','serverGaps','ages','rtts','echoRtts','decodeMs','pongAges','moveAges','loop']) m[key]=summarize(samples.map(s=>s[key]));
  for(const key of ['bytes','messages','invalid','errors','disconnects','sentMoves','sentShots','shotEvents','deaths','respawns','skipped','shotSamples','oldShots','wireSamples','sampledWireBytes','sampledLegacyBytes','coalescedSnapshots'])m[key]=samples.reduce((a,s)=>a+s[key],0);
  for(const key of ['peakBalls','maxBuffered','maxSilence','maxInFlight'])m[key]=Math.max(...samples.map(s=>s[key]));
  m.minRosterSize=Math.min(...samples.map(s=>s.minRosterSize));
  m.minScoreboardSize=Math.min(...samples.map(s=>s.minScoreboardSize));
  m.approvedPlayback={};
  for(const key of ['frames','held','resets','blackoutActorMs'])m.approvedPlayback[key]=samples.reduce((a,s)=>a+(s.approvedPlayback?.[key]??0),0);
  m.playback={};
  for(const key of ['frames','held','resets','rejected','presentationFrames','blackoutActorMs','eligibleActorMs','forwardSkips'])m.playback[key]=samples.reduce((a,s)=>a+(s.playback?.[key]??0),0);
  m.playback.renderAgeExamples=samples.flatMap(s=>s.playback?.renderAgeExamples??[]).sort((a,b)=>b.age-a.age).slice(0,8);
  m.playback.metricVersion=2;
  m.playback.maxRenderAgeMs=Math.max(0,...samples.map(s=>s.playback?.maxRenderAgeMs??0));
  m.playback.maxHoldMs=Math.max(0,...samples.map(s=>s.playback?.maxHoldMs??0));
  for(const name of ['playback','approvedPlayback','candidatePlayback','noScalePlayback','reservePlayback','adaptivePlayback','receiptPlayback','anchoredPlayback','deliveryPlayback','fullReservePlayback']){
    if(['candidatePlayback','noScalePlayback','reservePlayback','adaptivePlayback','receiptPlayback','anchoredPlayback','deliveryPlayback','fullReservePlayback'].includes(name)){m[name]={};for(const key of ['frames','held','resets','rejected','blackoutActorMs'])m[name][key]=samples.reduce((a,s)=>a+(s[name]?.[key]??0),0);}
    for(const field of ['holdClasses','holdDetails']){
      m[name][field]={};
      for(const sample of samples)for(const [key,value] of Object.entries(sample[name]?.[field]??{}))m[name][field][key]=(m[name][field][key]??0)+value;
    }
    m[name].holdExamples=samples.flatMap(s=>s[name]?.holdExamples??[]).sort((a,b)=>b.holdMs-a.holdMs).slice(0,32);
    m[name].poseGaps=samples.flatMap(s=>s[name]?.poseGaps??[]).sort((a,b)=>b.receiptMs-a.receiptMs).slice(0,32);
  }
  m.worstGaps=samples.flatMap(s=>s.worstGaps).sort((a,b)=>b.clientGap-a.clientGap).slice(0,20);
  return m;
}
function mergeHosts(samples){const result={};for(const host of new Set(samples.map(s=>s.generatorHost??'unknown')))result[host]=merge(samples.filter(s=>(s.generatorHost??'unknown')===host));return result;}

async function main() {
  const opts=hostedOptions(process.argv.slice(2));
  const receipt=JSON.parse(await readFile(opts.deployment,'utf8'));
  if((await stat(receipt.tokenFile)).mode&0o077)throw new Error('Token file must be private (0600)');
  const {CAPACITY_TEST_TOKEN:token}=JSON.parse(await readFile(receipt.tokenFile,'utf8'));
  checkReceipt(receipt,token);
  if(opts.serverBots&&opts.serverBots!==(receipt.serverBots??11))throw Error('Requested AI count differs from private fixture');
  // No redirect following: never send private credentials to another origin.
  let health,info,healthAttempts=0;
  // A fresh deployment can briefly route separate connections to different
  // revisions. Retry only the same private authenticated readiness read.
  do{
    healthAttempts++;
    health=await fetch(`${receipt.url}/health`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(health.ok){info=await health.json();if(info.fixtureId===receipt.fixtureId&&info.expiresAt===receipt.expiresAt)break;}
    if(![200,401,503].includes(health.status)||healthAttempts>=15)break;
    await delay(2000);
  }while(true);
  if(!health.ok)throw new Error(`Private fixture health: ${health.status}`);
  if(info.service!==PRIVATE_WORKER || info.fixtureId!==receipt.fixtureId || info.maxPlayers!==100 || info.maxScoreEntries!==100 || info.expiresAt!==receipt.expiresAt)throw new Error('Deployed fixture does not match receipt');
  const out=join(projectRoot,'output',`hosted-capacity-${new Date().toISOString().replace(/[:.]/g,'-')}-${opts.label}`);
  await mkdir(out,{recursive:true});
  const manifest={createdAt:new Date().toISOString(),healthAttempts,options:opts,fixtureId:receipt.fixtureId,version:receipt.version,window:receipt.window,url:receipt.url,expiresAt:receipt.expiresAt,sourceHashes:receipt.sourceHashes};
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  let stopping=false,pool=[];
  const results=[];
  const shutdown=()=>{stopping=true;for(const w of pool)w.postMessage({type:'stop'});};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  console.log(JSON.stringify({event:'started',out,version:receipt.version,players:opts.players}));
  try {
    for(const count of opts.players) {
      if(stopping)break;
      const estimatedMs=(opts.admissionOnly?30:opts.warmup+opts.phases.length*opts.phaseSeconds+30)*1000;
      if(Date.now()+estimatedMs>=receipt.expiresAt){console.log(JSON.stringify({event:'expired',players:count}));break;}
      const clientCount=count-opts.serverBots;
      const room=`graybox-benchmark-${opts.serverBots?'ai-':''}${count}-${randomUUID()}`;
      const url=new URL(receipt.url);url.protocol='wss:';url.pathname='/ws';url.searchParams.set('room',room);
      const result={players:count,serverBots:opts.serverBots,clientCount,room,startedAt:new Date().toISOString(),phases:[],status:'running'};
      // Queue messages arriving before the supervisor starts waiting; reject all waiters on thread failure.
      function endpoint(w) {
        const queue=[],waiters=[];
        let failure;
        const fail=e=>{failure=e;for(const q of waiters.splice(0)){clearTimeout(q.timer);q.reject(e);}};
        w.on('error',fail);
        w.on('exit',code=>{if(code)fail(new Error(`Client thread exited ${code}`));});
        w.on('message',m=>{
          if(m.type==='failed'){fail(new Error(m.error));return;}
          const i=waiters.findIndex(q=>q.type===m.type);
          if(i<0)queue.push(m);else{const q=waiters.splice(i,1)[0];clearTimeout(q.timer);q.resolve(m);}
        });
        return (type,timeout=20000)=>new Promise((resolve,reject)=>{
          if(failure)return reject(failure);
          const i=queue.findIndex(m=>m.type===type);if(i>=0)return resolve(queue.splice(i,1)[0]);
          const q={type,resolve,reject,timer:setTimeout(()=>{const i=waiters.indexOf(q);if(i>=0)waiters.splice(i,1);reject(new Error(`${type} timeout`));},timeout)};waiters.push(q);
        });
      }
      const readers=[];
      const report=async()=>{const pending=readers.map(r=>r('report'));pool.forEach(w=>w.postMessage({type:'report'}));const samples=(await Promise.all(pending)).map(m=>m.report);return {...merge(samples),byHost:mergeHosts(samples)};};
      const phase=async name=>{const pending=readers.map(r=>r('phaseReady'));pool.forEach(w=>w.postMessage({type:'phase',phase:name}));await Promise.all(pending);};
      try {
        let offset=0;
        for(let i=0;i<Math.min(4,clientCount);i++){
          const n=Math.floor(clientCount/Math.min(4,clientCount))+(i<clientCount%Math.min(4,clientCount)?1:0);
          const workerData={playbackCandidates:opts.playbackCandidates,generatorHost:opts.remoteRuntime&&i%2===(opts.remoteFirst?0:1)?'Halla':'Veelox',layout:opts.layout,latency:opts.latency,jitter:opts.jitter,transport:opts.transport,count:n,offset,first:i===0,url:url.href,token,validator:receipt.validator};
          const w=opts.remoteRuntime&&i%2===(opts.remoteFirst?0:1)?new RemoteCapacityWorker(opts.remoteRuntime,workerData):new Worker(new URL('./lib/capacity-clients.mjs',import.meta.url),{workerData});
          offset+=n;readers.push(endpoint(w));pool.push(w);
        }
        const joins=await Promise.all(readers.map(r=>r('ready',60000)));
        result.admitted=joins.reduce((a,m)=>a+m.count,0);
        result.startup={invalid:joins.reduce((a,m)=>a+m.startup.invalid,0),errors:joins.reduce((a,m)=>a+m.startup.errors,0),disconnects:joins.reduce((a,m)=>a+m.startup.disconnects,0)};
        let joinedMetrics;
        const rosterDeadline=Date.now()+10000;
        do {
          joinedMetrics=await report();
          if(joinedMetrics.invalid||joinedMetrics.errors||joinedMetrics.disconnects){result.startup={invalid:joinedMetrics.invalid,errors:joinedMetrics.errors,disconnects:joinedMetrics.disconnects,minRosterSize:joinedMetrics.minRosterSize,minScoreboardSize:joinedMetrics.minScoreboardSize};throw new Error('Startup protocol validation failed');}
          if(joinedMetrics.minRosterSize===count&&joinedMetrics.minScoreboardSize===count)break;
          if(Date.now()>=rosterDeadline)throw new Error('Not every client received the complete roster and scoreboard');
          await delay(200);
        }while(true);
        result.startup={invalid:joinedMetrics.invalid,errors:joinedMetrics.errors,disconnects:joinedMetrics.disconnects,minRosterSize:joinedMetrics.minRosterSize,minScoreboardSize:joinedMetrics.minScoreboardSize};
        console.log(JSON.stringify({event:'joined',players:count,...result.startup}));
        if(opts.admissionOnly)result.status='admission-only';
        else {
          await phase('warmup');await delay(opts.warmup*1000);
          const warmup=await report();
          if(warmup.invalid||warmup.errors||warmup.disconnects||warmup.maxSilence>10000)throw new Error('Warmup failed');
          for(const name of opts.phases){
            if(stopping)break;
            await phase(name);const started=Date.now();let metrics;let churns=0;const tcp=[await sampleTcpStats()];
            console.log(JSON.stringify({event:'phase',players:count,phase:name,seconds:opts.phaseSeconds}));
            while(Date.now()-started<opts.phaseSeconds*1000&&!stopping){
              await delay(Math.min(5000,opts.phaseSeconds*1000-(Date.now()-started)));
              if(name==='churn'&&Date.now()-started<opts.phaseSeconds*1000-2000){const i=churns%pool.length,pending=readers[i]('churnReady');pool[i].postMessage({type:'churn'});await pending;churns++;}
              metrics=await report();tcp.push(await sampleTcpStats());
              const memory=await readFile('/proc/meminfo','utf8');
              if(metrics.maxSilence>10000||metrics.loop.p99>250||metrics.invalid||metrics.errors||metrics.disconnects||Number(memory.match(/MemAvailable:\s+(\d+)/)?.[1]??0)<512*1024||Date.now()>=receipt.expiresAt){stopping=true;result.stopReason='Runtime, protocol, memory, or expiry stop condition';}
            }
            metrics??=await report();
            const durationMs=Date.now()-started;
            const rosterRecovered=metrics.minRosterSize===count&&metrics.minScoreboardSize===count;
            const arrivalPassed=phaseHealthy(metrics),playbackPassed=playbackHealthy(metrics);
            const qualityPassed=qualityHealthy(metrics,opts.quality);
            const passed=!stopping&&qualityPassed&&rosterRecovered&&(name!=='churn'||churns>0);
            result.phases.push({phase:name,durationMs,passed,arrivalPassed,playbackPassed,metrics,tcp,churns,generatorRssMb:process.memoryUsage().rss/1048576});
            console.log(JSON.stringify({event:'phase-result',players:count,phase:name,passed,gapP95:metrics.gaps.p95,gapP99:metrics.gaps.p99,gapMax:metrics.gaps.max,maxSilence:metrics.maxSilence,loopP99:metrics.loop.p99,invalid:metrics.invalid,errors:metrics.errors,peakBalls:metrics.peakBalls,mbps:metrics.bytes*8000/durationMs/1e6}));
            await writeFile(join(out,`${count}.json`),JSON.stringify(result,null,2));
            if(!passed){stopping=true;result.stopReason??='Phase failed quality thresholds; higher workloads deferred';}
          }
          result.status=stopping?'stopped':'passed';
        }
      }catch(error){result.status='failed';result.error=String(error);stopping=true;console.log(JSON.stringify({event:'failure',players:count,error:String(error)}));}
      finally {
        const pending=readers.map(r=>r('stopped',3000).catch(()=>{}));pool.forEach(w=>w.postMessage({type:'stop'}));await Promise.all(pending);await Promise.all(pool.map(w=>w.terminate()));pool=[];
        if(opts.serverBots){
          const cleanup=new URL('/cleanup',receipt.url);cleanup.searchParams.set('room',room);
          const response=await fetch(cleanup,{method:'POST',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('Private AI cleanup failed; stop before starting another room');
        }
      }
      results.push(result);
      await writeFile(join(out,`${count}.json`),JSON.stringify(result,null,2));
      await writeFile(join(out,'results.json'),JSON.stringify({manifest,results},null,2));
    }
  }finally{await Promise.all(pool.map(w=>w.terminate()));process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);}
  await writeFile(join(out,'results.json'),JSON.stringify({manifest,results,completedAt:new Date().toISOString(),unattempted:opts.players.filter(n=>!results.some(r=>r.players===n))},null,2));
  console.log(JSON.stringify({event:'complete',out,levels:results.map(r=>({players:r.players,status:r.status}))}));
  if(results.length!==opts.players.length||results.some(r=>!['passed','admission-only'].includes(r.status)))process.exitCode=1;
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url))await main();
