import {test} from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {WebSocketServer} from 'ws';
import {DelayedSocket} from '../../scripts/lib/capacity-delay.mjs';
import {hostedOptions} from '../../scripts/benchmark-hosted.mjs';
test('network profiles and total-rat counts are bounded',()=>{
 const o=hostedOptions(['--deployment=/tmp/r','--players=50','--server-bots=11','--layout=clustered','--latency=50','--jitter=25','--phases=movement,churn']);
 assert.equal(o.players[0],50);assert.equal(o.serverBots,11);assert.equal(o.latency,50);
 assert.equal(hostedOptions(['--deployment=/tmp/r','--players=50','--server-bots=49']).serverBots,49);
 for(const arg of ['--latency=-1','--latency=1000','--jitter=NaN','--server-bots=100','--remote-runtime=/tmp/bad;command'])assert.throws(()=>hostedOptions(['--deployment=/tmp/r',arg]));
});
test('delayed sockets preserve message order and release queued work on close',async()=>{
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});await once(server,'listening');
 server.on('connection',ws=>ws.on('message',data=>ws.send(data)));
 const socket=new DelayedSocket(`ws://127.0.0.1:${server.address().port}`,{}, {latency:10,jitter:20,seed:1});
 try{await once(socket,'open');const received=[];const done=new Promise(resolve=>socket.on('message',raw=>{received.push(raw.toString());if(received.length===3)resolve();}));const at=Date.now();socket.send('a');socket.send('b');socket.send('c');await done;assert.deepEqual(received,['a','b','c']);assert.ok(Date.now()-at>=20);socket.send('pending');socket.close();assert.equal(socket.pending.size,0);assert.equal(socket.outBytes,0);}
 finally{socket.terminate();for(const client of server.clients)client.terminate();await new Promise(resolve=>server.close(resolve));}
});
test('playback probe counts moving holds but excludes stationary and departed rats',async()=>{
 const {build}=await import('esbuild');
 const {CapacityPlayback}=await import('../../scripts/lib/capacity-playback.mjs');
 const bundle=await build({entryPoints:['src/shared/SnapshotBuffer.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {SnapshotBuffer}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const probe=new CapacityPlayback(SnapshotBuffer),players=new Map([['rat',{hp:3}]]);
 const pose=x=>({id:'rat',x,y:0,z:0,meshQx:0,meshQy:0,meshQz:0,meshQw:1});
 for(let now=0;now<2000;now+=10){if(now%50===0)probe.move(pose(now/100),now,now);probe.sample(now,players);}
 assert.ok(probe.report().frames>50);assert.equal(probe.report().held,0);
 for(let now=2000;now<2400;now+=10)probe.sample(now,players);
 assert.ok(probe.report().held>0);
 probe.resetMetrics();probe.move(pose(19.5),2400,2400);
 for(let now=2410;now<2700;now+=10)probe.sample(now,players);
 assert.equal(probe.report().frames,0);const history=probe.tracks.get('rat').buffer;probe.respawn('rat',{x:10,y:0,z:0},2700);assert.equal(probe.tracks.get('rat').buffer,history);assert.equal(probe.tracks.get('rat').moving,false);probe.remove('rat');assert.equal(probe.report().tracks,0);
});
test('playback quality never hides hard stalls, errors or insufficient movement evidence',async()=>{
 const {playbackHealthy}=await import('../../scripts/benchmark-hosted.mjs');
 const m={gaps:{count:1000,p95:130,max:400},serverGaps:{p95:33,p99:67},maxSilence:300,loop:{count:10,p99:12},invalid:0,errors:0,disconnects:0,skipped:0,playback:{frames:10000,held:40}};
 assert.equal(playbackHealthy(m),true);
 for(const patch of [{errors:1},{disconnects:1},{skipped:1},{maxSilence:1000},{gaps:{count:1000,max:1000}},{playback:{frames:500,held:0}},{playback:{frames:10000,held:101}}])assert.equal(playbackHealthy({...m,...patch}),false);
});
test('rejected stale poses do not refresh eligibility and blackouts remain measured',async()=>{
 const {build}=await import('esbuild');const {CapacityPlayback}=await import('../../scripts/lib/capacity-playback.mjs');
 const bundle=await build({entryPoints:['src/shared/SnapshotBuffer.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {SnapshotBuffer}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const probe=new CapacityPlayback(SnapshotBuffer),players=new Map([['rat',{hp:3}]]);
 const pose=x=>({id:'rat',x,y:0,z:0,meshQx:0,meshQy:0,meshQz:0,meshQw:1});
 probe.move(pose(0),0,100);probe.move(pose(1),50,150);
 assert.equal(probe.move(pose(99),100,99),false);
 assert.equal(probe.tracks.get('rat').received,50);assert.equal(probe.tracks.get('rat').last.x,1);
 probe.sample(500,players);probe.sample(1000,players);probe.sample(1500,players);
 assert.equal(probe.report().blackoutActorMs,950);assert.equal(probe.report().rejected,1);
 assert.equal(probe.report().presentationFrames,3);assert.equal(probe.report().frames,0);
 probe.resetMetrics();probe.sample(1600,players);assert.equal(probe.report().blackoutActorMs,0);
});
test('combined acceptance is explicitly selectable without removing either existing profile',()=>{
 for(const quality of ['arrival','playback','both'])assert.equal(hostedOptions(['--deployment=/tmp/r',`--quality=${quality}`]).quality,quality);
});
test('combined quality does not average away a failing host',async()=>{
 const {qualityHealthy}=await import('../../scripts/benchmark-hosted.mjs');
 const healthy={gaps:{count:1000,p95:70,p99:140,max:400},serverGaps:{p95:33,p99:67},maxSilence:300,loop:{count:10,p99:12},invalid:0,errors:0,disconnects:0,skipped:0,playback:{frames:10000,held:40}};
 assert.equal(qualityHealthy({...healthy,byHost:{a:healthy}},'both'),true);
 assert.equal(qualityHealthy({...healthy,byHost:{a:healthy,b:{...healthy,gaps:{...healthy.gaps,p95:101}}}},'both'),false);
 assert.equal(qualityHealthy({...healthy,playback:{frames:10000,held:200}},'both'),false);
 const idle={...healthy,playback:{frames:0,held:0}};
 assert.equal(qualityHealthy(idle,'both'),false);
 assert.equal(qualityHealthy(idle,'both',false),true);
 assert.equal(qualityHealthy({...idle,errors:1},'both',false),false);
 assert.equal(qualityHealthy({...idle,byHost:{a:{...idle,gaps:{...idle.gaps,p95:101}}}},'both',false),false);
});
test('perfect stop/go delivery separates delayed stationary poses from actual underrun',async()=>{
 const {build}=await import('esbuild');const {CapacityPlayback}=await import('../../scripts/lib/capacity-playback.mjs');
 for(const file of ['src/shared/SnapshotBuffer.ts','scripts/fixtures/ApprovedSnapshotBuffer.ts']){
  const bundle=await build({entryPoints:[file],bundle:true,write:false,format:'esm',platform:'node'});
  const {SnapshotBuffer}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const probe=new CapacityPlayback(SnapshotBuffer),players=new Map([['rat',{hp:3}]]);
  let x=0;const pose=()=>({id:'rat',x,y:0,z:0,meshQx:0,meshQy:0,meshQz:0,meshQw:1});
  for(let now=0;now<20000;now+=10){if(now%50===0){if(Math.floor(now/1000)%2)x+=.325;probe.move(pose(),now,now);}probe.sample(now,players);}
  const report=probe.report();assert.ok(report.held>0);
  assert.ok(report.holdClasses.stationaryInterior/report.held>.9);
  assert.equal(Object.values(report.holdClasses).reduce((a,b)=>a+b,0),report.held);
  assert.equal(report.holdClasses.newest,0);assert.equal(report.blackoutActorMs,0);
  assert.ok(report.poseGaps.every(g=>g.receiptMs===50&&g.sourceMs===50));
  // Continuous movement followed by withheld packets must still expose underrun.
  probe.resetMetrics();
  for(let now=20000;now<22000;now+=10){if(now%50===0){x+=.325;probe.move(pose(),now,now);}probe.sample(now,players);}
  for(let now=22000;now<22400;now+=10)probe.sample(now,players);
  assert.ok(probe.report().holdClasses.newest>0);
  probe.resetMetrics();assert.equal(probe.report().poseGaps.length,0);assert.equal(probe.report().holdClasses.newest,0);
 }
});
test('impairment delivery remains ordered when timer callbacks fire backwards',()=>{
 const timers=[],received=[];
 const original=globalThis.setTimeout;
 const socket={dead:false,bytes:0,outBytes:0,pending:new Map(),queues:{in:[],out:[]},due:{in:0,out:0},latency:10,jitter:0,draw:()=>0};
 try{
  globalThis.setTimeout=callback=>{timers.push(callback);return timers.length;};
  for(const value of ['a','b','c'])DelayedSocket.prototype.schedule.call(socket,'out',1,()=>received.push(value));
  timers[2]();assert.deepEqual(received,[]);assert.equal(socket.outBytes,3);
  timers[1]();assert.deepEqual(received,[]);
  timers[0]();assert.deepEqual(received,['a','b','c']);assert.equal(socket.outBytes,0);assert.equal(socket.bytes,0);assert.equal(socket.pending.size,0);
 }finally{globalThis.setTimeout=original;}
});
test('stationary classification excludes only entailed stops and retains continuity failures',async()=>{
 const {playbackHoldRate,playbackHealthy}=await import('../../scripts/benchmark-hosted.mjs');
 const p={frames:10000,held:540,holdClasses:{newest:20,oldest:10,stationaryInterior:500,movingInterior:10,unknown:0}};
 assert.equal(playbackHoldRate(p),40/9500);
 assert.equal(playbackHoldRate({...p,holdClasses:{...p.holdClasses,newest:0}}),Infinity);
 const m={gaps:{count:1000,max:400},serverGaps:{p95:33,p99:67},maxSilence:300,loop:{count:10,p99:12},invalid:0,errors:0,disconnects:0,skipped:0,playback:p};
 assert.equal(playbackHealthy(m),true);
 for(const patch of [{forwardSkips:1},{maxRenderAgeMs:601},{frames:1000,held:600,holdClasses:{newest:0,oldest:0,stationaryInterior:600,movingInterior:0,unknown:0}}])assert.equal(playbackHealthy({...m,playback:{...p,...patch}}),false);
});
test('a frozen renderer remains a failure even with timely moving source poses',async()=>{
 const {build}=await import('esbuild');const {CapacityPlayback}=await import('../../scripts/lib/capacity-playback.mjs');const {playbackHoldRate}=await import('../../scripts/benchmark-hosted.mjs');
 const bundle=await build({entryPoints:['src/shared/SnapshotBuffer.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {BotSnapshotBuffer}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 class Frozen extends BotSnapshotBuffer{sample(now){const p=super.sample(now);if(now<1500)this.frozen=p;return this.frozen??p;}}
 const probe=new CapacityPlayback(Frozen),players=new Map([['rat',{hp:3}]]);
 for(let now=0;now<3000;now+=10){if(now%50===0)probe.move({id:'rat',x:now*.0065,y:0,z:0,meshQx:0,meshQy:0,meshQz:0,meshQw:1},now,now);probe.sample(now,players);}
 assert.ok(probe.report().holdClasses.movingInterior>100);assert.ok(playbackHoldRate(probe.report())>.5);
});
test('observer reconnect discards old presentation history without erasing measured failures',async()=>{
 const {build}=await import('esbuild');const {CapacityPlayback}=await import('../../scripts/lib/capacity-playback.mjs');
 const bundle=await build({entryPoints:['src/shared/SnapshotBuffer.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {BotSnapshotBuffer}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const probe=new CapacityPlayback(BotSnapshotBuffer),players=new Map([['rat',{hp:3}]]);
 const pose=x=>({id:'rat',x,y:0,z:0,meshQx:0,meshQy:0,meshQz:0,meshQw:1});
 for(let now=0;now<2000;now+=10){if(now%50===0)probe.move(pose(now*.0065),now,now);probe.sample(now,players);}
 for(let now=2000;now<2400;now+=10)probe.sample(now,players);
 const held=probe.report().held;assert.ok(held>0);probe.reconnect();assert.equal(probe.report().tracks,0);assert.equal(probe.report().held,held);
 probe.move(pose(-10),10000,10000);probe.sample(10000,players);assert.equal(probe.tracks.get('rat').previous.x,-10);assert.equal(probe.report().held,held);
});
