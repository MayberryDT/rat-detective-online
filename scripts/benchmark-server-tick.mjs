// Local CPU benchmark mirroring GameRoom's 30 Hz tick: two 60 Hz bot+chaos steps,
// one snapshot, prepared compact frames per recipient, and a 1 Hz checkpoint JSON.
// Deterministic (seeded Math.random, clock and UUIDs), so the trajectory hash
// proves an optimization left bot poses and every ball position unchanged.
// Not a capacity claim; GameRoom's socket, storage and movement paths are absent.
//
// usage: node scripts/benchmark-server-tick.mjs [--scenario=idle|burst] [--bots=9]
//        [--recipients=1] [--ticks=1800] [--ref=<git rev>] [--profile] [--label=name]
//   --ticks    longer runs add 1800-tick windows: the walk graph warms over minutes
//   --ref      build src/ from that commit instead of the working tree
//   --profile  write a V8 CPU profile and an allocation sampling profile of the tick loop
//   --profile-from=<tick>  start profiling after warm-up (default 0)
//   --city     also run the city map recorder (docs/city-map.md) as GameRoom builds it (solids, line of sight)
//              and report its cost, archive volume and a hash of every fact and aggregate it recorded
//   --human    with --city, the recorder counts rd-ai-0 as a connected human (1 Hz frames, human facts)
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {Session} from 'node:inspector/promises';

const {values}=parseArgs({options:{scenario:{type:'string',default:'idle'},bots:{type:'string',default:'9'},
    recipients:{type:'string',default:'1'},ticks:{type:'string',default:'1800'},ref:{type:'string'},profile:{type:'boolean',default:false},'profile-from':{type:'string',default:'0'},city:{type:'boolean',default:false},human:{type:'boolean',default:false},label:{type:'string'}}});
const scenario=values.scenario,bots=Number(values.bots),recipients=Number(values.recipients);
if(!['idle','burst'].includes(scenario))throw Error('scenario must be idle or burst');
const root=process.cwd(),out=resolve(root,'test-results/server-tick');await mkdir(out,{recursive:true});
const ref=values.ref&&execFileSync('git',['rev-parse',values.ref],{encoding:'utf8'}).trim();
const label=values.label??`${ref?ref.slice(0,7):'worktree'}-${scenario}`;
const outfile=resolve(out,`runtime-${ref?ref.slice(0,12):'worktree'}.mjs`);
await build({stdin:{contents:"export {CityRecorder} from './src/worker/city/CityRecorder.ts';export {grayboxBoxes,GRAYBOX_VERSION} from './src/shared/grayboxLayout.ts';export {SpatialRayQuery} from './src/shared/SpatialRayQuery.ts';export {ServerBotController} from './src/worker/ServerBotController.ts';export {ChaosSimulation} from './src/shared/ChaosSimulation.ts';export {createPlayer} from './src/worker/gameState.ts';export {prepareChaos} from './src/shared/chaosWire.ts';export {ChaosDelivery} from './src/worker/ChaosDelivery.ts';",resolveDir:root,loader:'ts'},
    outfile,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'error',define:{'performance.now':'__simClock'},
    plugins:ref?[{name:'ref',setup(b){b.onLoad({filter:/\/src\/.*\.ts$/},args=>({contents:execFileSync('git',['show',`${ref}:${relative(root,args.path)}`],{encoding:'utf8'}),loader:'ts'}));}}]:[]});
// Deterministic randomness, installed before any module captures Math.random.
let seed=341283204;Math.random=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
let simClock=0,uuid=0;globalThis.__simClock=()=>simClock;
globalThis.crypto.randomUUID=()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`;
const {ServerBotController,ChaosSimulation,createPlayer,prepareChaos,ChaosDelivery,CityRecorder,grayboxBoxes,GRAYBOX_VERSION,SpatialRayQuery}=await import(pathToFileURL(outfile)+'?'+Date.now());
const {ObjectCollisionMatrix,Vec3}=await import('cannon-es');

// The live city layout (rooms run GRAYBOX_VERSION; older versions are the retired procedural city).
const spec={seed:341283204,version:GRAYBOX_VERSION};
const ids=Array.from({length:bots},(_,i)=>`rd-ai-${i}`);
const players=new Map(ids.map((id,i)=>[id,createPlayer(id,`Rat ${i}`,{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:-100+i*4,y:2,z:-18})]));
const sim=new ChaosSimulation(players,()=>{},undefined,spec);
// Sparse contact history, as GameRoom set it before ChaosSimulation did (keeps --ref A/B fair).
sim.world.collisionMatrix=new ObjectCollisionMatrix();sim.world.collisionMatrixPrevious=new ObjectCollisionMatrix();
let shot=0;
// --city: the recorder as GameRoom builds it, with a store and an archive that keep what they are given
// (compression and hashing happen after the loop).
const archivedLines=[],stored=[];
const sight=values.city?{query:new SpatialRayQuery(sim.world),refreshedAt:-Infinity}:null;
const city=values.city?new CityRecorder({room:'bench',layout:()=>GRAYBOX_VERSION,isBot:id=>!values.human||id!==ids[0],connected:()=>true,
    store:{addCell:(...a)=>stored.push(['cell',...a]),addPlace:(...a)=>stored.push(['place',...a]),addFlow:(...a)=>stored.push(['flow',...a]),addMind:(...a)=>stored.push(['mind',...a]),addEvent:(...a)=>stored.push(['event',...a]),pruneEvents(){}},
    archive:{push:f=>archivedLines.push(JSON.stringify(f)),due:()=>false,flush(){},settled:async()=>{}},
    // GameRoom.lineOfSight: the chaos world's bodies, the index refreshed at most once a second (`closest` before `blocked` existed).
    sight:(from,to)=>{if(simClock-sight.refreshedAt>=1000){sight.query.refresh();sight.refreshedAt=simClock;}const a=new Vec3(from.x,from.y,from.z),b=new Vec3(to.x,to.y,to.z);
        return !(sight.query.blocked?sight.query.blocked(a,b,1):sight.query.closest(a,b,1).hasHit);},
    solids:grayboxBoxes(spec).filter(b=>!b.rx&&!b.ry&&!b.rz&&!b.passBalls&&b.w>=.5&&b.h>=.5&&b.d>=.5)}):null;
const round={phase:'playing'};
// The recorder's shot and decision hooks run inside the bots' step; their time is moved from bots to city.
let shotMs=0;
const controller=()=>new ServerBotController(spec,ids,{
    move:(id,p)=>Object.assign(players.get(id),p),
    shoot:(id,origin,direction)=>{sim.shoot(id,{shotId:`shot-${shot++}`,origin,direction});if(city){const at=clock();city.shot(players.get(id),direction,simClock);shotMs+=ms(at,clock());}},
    decide:(id,decision,now)=>{if(city){const at=clock();city.decision(players.get(id),decision,now);shotMs+=ms(at,clock());}},
});
let bot=controller();
const delivery=Array.from({length:recipients},()=>new ChaosDelivery(true));
// A mid-run controller replacement mirrors a round that re-rolls bots.
const TICKS=Math.max(1800,Number(values.ticks)),RECREATE=900,BURST_EVERY=90;
const windows=[[0,300],[300,900],[900,1200],[1200,1800]];
for(let a=1800;a<TICKS;a+=1800)windows.push([a,Math.min(TICKS,a+1800)]);
const parts=['bots','chaos','snapshot','wire','checkpoint',...(city?['city']:[])];
const cost=Array.from({length:TICKS},()=>({bots:0,chaos:0,snapshot:0,wire:0,checkpoint:0,city:0}));
const hash=createHash('sha256');let state=sim.snapshot(false),bytes=0,peak=0,bursts=0;
const clock=()=>process.hrtime.bigint();const ms=(a,b)=>Number(b-a)/1e6;
let session;
if(values.profile){
    session=new Session();session.connect();
    await session.post('Profiler.enable');await session.post('Profiler.setSamplingInterval',{interval:200});
    await session.post('HeapProfiler.enable');
}
const profileFrom=Number(values['profile-from']);
for(let tick=0;tick<TICKS;tick++){
    if(session&&tick===profileFrom){
        // Include short-lived objects: per-step garbage is what the audit is about.
        await session.post('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
        await session.post('Profiler.start');
    }
    if(tick===RECREATE){bot.dispose();bot=controller();}
    // Improper Disposal / Planted Evidence eruption beside a rotating bot.
    if(scenario==='burst'&&tick%BURST_EVERY===45){const p=players.get(ids[bursts++%ids.length]);sim.cheeseBurst({x:p.x,y:p.y+1,z:p.z},null);}
    const now=1000+tick*1000/30,c=cost[tick];simClock=now;shotMs=0;
    for(let s=0;s<2;s++){
        const stepAt=now-(1-s)*1000/60;
        let at=clock();bot.step(1/60,stepAt,players,state,true);c.bots+=ms(at,clock());
        at=clock();sim.step(1/60,stepAt,true);c.chaos+=ms(at,clock());
    }
    let at=clock();state=sim.snapshot();c.snapshot=ms(at,clock());
    if(city){c.bots-=shotMs;at=clock();city.balls(sim.drainShotEvents(),now);city.tick(now,players,state,round);c.city=ms(at,clock())+shotMs;}
    at=clock();
    if(delivery.length){const prepared=prepareChaos(state);
        for(const d of delivery){const payload=d.offer(state,now,prepared);if(payload)bytes+=payload.length;d.acknowledge({type:'chaosAck',stream:d.lastFrame.ack.stream,seq:d.lastFrame.seq});}}
    c.wire=ms(at,clock());
    if(tick%30===0){at=clock();JSON.stringify(sim.snapshot(false));c.checkpoint=ms(at,clock());}
    peak=Math.max(peak,state.shots.length);
    for(const id of ids){const p=players.get(id);hash.update(`${id}:${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)};`);}
    for(const s of state.shots)hash.update(`${s.id}:${s.p.x.toFixed(4)},${s.p.y.toFixed(4)},${s.p.z.toFixed(4)};`);
    hash.update(`s${state.shots.length};`);
}
bot.dispose();
let cityReport;
if(city){
    city.flush(simClock);sight.query.dispose();
    // Everything the archive buffered, compressed the way CityArchive does, extrapolated to a day.
    const {gzipSync}=await import('node:zlib');const lines=archivedLines;
    const raw=lines.join('\n');let at=clock();const gz=gzipSync(raw);const gzMs=ms(at,clock());
    const simSeconds=TICKS/30,day=86400/simSeconds;
    const byType={},perBotHour={};for(const l of lines){const t=JSON.parse(l).type;byType[t]=+((byType[t]??0)+l.length*day/1e6).toFixed(1);perBotHour[t]=(perBotHour[t]??0)+1;}
    // Facts per bot-hour by type: the recorder's volume, decisions and goal ends included (bots live all run here).
    for(const t in perBotHour)perBotHour[t]=Math.round(perBotHour[t]/(bots*simSeconds/3600));
    // Equal hashes prove a recorder change kept every fact (in order) and every aggregate total (in any flush order).
    const totals=new Map(),events=[];
    for(const [kind,...a] of stored){if(kind==='event'){events.push(JSON.stringify(a));continue;}const n=a.pop(),key=JSON.stringify([kind,...a]);totals.set(key,(totals.get(key)??0)+n);}
    const digest=text=>createHash('sha256').update(text).digest('hex').slice(0,16);
    cityReport={facts:lines.length,factsHash:digest(raw),aggregates:totals.size,aggregatesHash:digest([...totals].map(([k,n])=>`${k}=${n}`).sort().join('\n')),eventsHash:digest(events.join('\n')),
        rawMBPerDayByType:byType,factsPerBotHourByType:perBotHour,rawMBPerDay:+(raw.length*day/1e6).toFixed(1),gzMBPerDay:+(gz.length*day/1e6).toFixed(1),gzipMsPerDay:+(gzMs*day).toFixed(0)};
}
const files={};
if(session){
    const {profile}=await session.post('Profiler.stop');
    const {profile:heap}=await session.post('HeapProfiler.stopSampling');
    session.disconnect();
    files.cpu=resolve(out,`${label}.cpuprofile`);files.heap=resolve(out,`${label}.heapprofile`);
    await writeFile(files.cpu,JSON.stringify(profile));await writeFile(files.heap,JSON.stringify(heap));
    files.summary=resolve(out,`${label}.summary.json`);
    await writeFile(files.summary,JSON.stringify({cpuSelf:cpuSelf(profile),allocations:heapSelf(heap)},null,2));
}
const sum=(a,b,k)=>cost.slice(a,b).reduce((t,c)=>t+c[k],0);
// The recorder's share of the tick after the first 300 ticks' warm-up (docs/city-map.md: at most 1%).
const citySharePct=city?+(100*sum(300,TICKS,'city')/parts.reduce((t,k)=>t+sum(300,TICKS,k),0)).toFixed(2):undefined;
const result={label,scenario,bots,recipients,ref:ref??'worktree',peakBalls:peak,shots:shot,bursts,avgFrameBytes:recipients?Math.round(bytes/TICKS/recipients):0,
    trajectory:hash.digest('hex').slice(0,16),profiled:!!session,...(cityReport?{city:{citySharePct,...cityReport}}:{}),
    windows:Object.fromEntries(windows.map(([a,b])=>[`${a}-${b}`,Object.fromEntries(parts.map(k=>[k,+(sum(a,b,k)/(b-a)).toFixed(3)])
        .concat([['totalPerTickMs',+(parts.reduce((t,k)=>t+sum(a,b,k),0)/(b-a)).toFixed(3)]]))])),files};
await writeFile(resolve(out,`${label}.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));

/** Self time per function (ms and share), top 40. */
function cpuSelf(profile){
    const byId=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
    const deltas=profile.timeDeltas;let total=0;
    profile.samples.forEach((id,i)=>{const n=byId.get(id),f=n.callFrame,key=`${f.functionName||'(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber+1}`;
        const dt=(deltas[i+1]??0)/1000;self.set(key,(self.get(key)??0)+dt);total+=dt;});
    return {totalMs:+total.toFixed(1),top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([fn,t])=>({fn,ms:+t.toFixed(1),share:+(t/total).toFixed(3)}))};
}
/** Sampled allocation bytes per allocating function, top 30. */
function heapSelf(profile){
    const self=new Map();let total=0;
    const walk=n=>{const f=n.callFrame,key=`${f.functionName||'(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber+1}`;
        const size=n.selfSize;if(size){self.set(key,(self.get(key)??0)+size);total+=size;}for(const c of n.children)walk(c);};
    walk(profile.head);
    return {sampledMB:+(total/1048576).toFixed(1),top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([fn,b])=>({fn,MB:+(b/1048576).toFixed(2),share:+(b/total).toFixed(3)}))};
}
