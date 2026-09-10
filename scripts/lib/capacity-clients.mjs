import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import {CapacityPlayback} from './capacity-playback.mjs';
import {phaseCorrectedBuffer,adaptiveReserveBuffer,receiptBuffer,receiptAnchoredBuffer,deliveryTimelineBuffer} from '../fixtures/PhaseCorrectedSnapshotBuffer.mjs';
import {DelayedSocket} from './capacity-delay.mjs';

// Epoch-aligned monotonic receiver clock; source age remains cross-clock data.
const receiverNow=()=>Math.floor(performance.timeOrigin+performance.now());

export function validateClientTarget(url, token) {
  const room = url.searchParams.get('room') ?? '';
  const local = url.protocol === 'ws:' && url.hostname === '127.0.0.1' && !token;
  const hosted = url.protocol === 'wss:' && /^rat-detective-capacity-test\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) && /^[a-f0-9]{64}$/.test(token ?? '');
  if ((!local && !hosted) || url.username || url.password || url.pathname !== '/ws' || !/^graybox-benchmark-[a-z0-9-]{1,80}$/.test(room)) throw new Error('Expected owned loopback or authenticated private capacity fixture');
}

class Metric {
  bins = new Uint32Array(10001); count = 0; sum = 0; max = 0;
  add(n) { if (!Number.isFinite(n) || n < 0) return; this.bins[Math.min(10000, Math.round(n))]++; this.count++; this.sum += n; this.max = Math.max(this.max, n); }
  json() { return { bins: Array.from(this.bins), count: this.count, sum: this.sum, max: this.max }; }
}
export function summarize(items) {
  const bins = new Uint32Array(10001); let count = 0, sum = 0, max = 0;
  for (const m of items) { count += m.count; sum += m.sum; max = Math.max(max, m.max); m.bins.forEach((n,i) => bins[i] += n); }
  const percentile = p => { if(!count)return null; const target = Math.ceil(count*p); let at=0; for(let i=0;i<bins.length;i++){at+=bins[i];if(at>=target)return i;}return 0; };
  return { count, mean: count ? sum/count : 0, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max };
}
export function phaseHealthy(m) {
  return m.gaps.count>0&&m.gaps.p95<=100&&m.gaps.p99<=250&&m.gaps.max<1000&&m.maxSilence<1000&&m.loop.count>0&&m.loop.p99<=25&&m.invalid===0&&m.errors===0&&m.disconnects===0&&m.skipped===0;
}
function stats() { return { gaps: new Metric(), serverGaps: new Metric(), worstGaps: [], ages: new Metric(), rtts: new Metric(), echoRtts: new Metric(), decodeMs: new Metric(), pongAges: new Metric(), moveAges: new Metric(), loop: new Metric(), bytes: 0, wireBytesByType: {}, messages: 0, invalid: 0, errors: 0, disconnects: 0, sentMoves: 0, sentShots: 0, shotEvents: 0, deaths: 0, respawns: 0, peakBalls: 0, maxBuffered: 0, maxSilence: 0, skipped: 0, shotSamples: 0, oldShots: 0, wireSamples:0, sampledWireBytes:0, sampledLegacyBytes:0,coalescedSnapshots:0,maxInFlight:0 }; }
async function clients() {
  const { parseServerMessage, CHAOS_WIRE_MODE, ChaosDecoder, SnapshotBuffer, BotSnapshotBuffer, ApprovedSnapshotBuffer } = await import(pathToFileURL(workerData.validator));
  const url = new URL(workerData.url);
  validateClientTarget(url, workerData.token);
  if(workerData.transport!=='legacy'){url.searchParams.set('chaos',workerData.transport==='compact-v1'?'compact-v1':CHAOS_WIRE_MODE??'compact-v1');url.searchParams.set('movement','batch-v1');}
  const Socket=(workerData.latency||workerData.jitter)?class extends DelayedSocket{constructor(url,options){super(url,options,{latency:workerData.latency,jitter:workerData.jitter,seed:workerData.offset+1});}}:WebSocket;
  const all = []; let churnOne; let phase = 'joining', active = stats(), stopping = false;
  const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
  const start = performance.now();
  const playback=SnapshotBuffer?new CapacityPlayback(SnapshotBuffer,BotSnapshotBuffer):null;
  const control=ApprovedSnapshotBuffer?new CapacityPlayback(ApprovedSnapshotBuffer):null;
  const candidate=workerData.playbackCandidates&&SnapshotBuffer?new CapacityPlayback(phaseCorrectedBuffer(SnapshotBuffer)):null;
  const noScaleCandidate=workerData.playbackCandidates&&ApprovedSnapshotBuffer?new CapacityPlayback(phaseCorrectedBuffer(ApprovedSnapshotBuffer)):null;
  const reserveCandidate=workerData.playbackCandidates&&SnapshotBuffer?new CapacityPlayback(phaseCorrectedBuffer(SnapshotBuffer,100)):null;
  const adaptiveCandidate=workerData.playbackCandidates&&SnapshotBuffer?new CapacityPlayback(adaptiveReserveBuffer(SnapshotBuffer)):null;
  const receiptCandidate=workerData.playbackCandidates&&SnapshotBuffer?new CapacityPlayback(receiptBuffer(SnapshotBuffer)):null;
  const anchoredCandidate=workerData.playbackCandidates&&SnapshotBuffer?new CapacityPlayback(receiptAnchoredBuffer(SnapshotBuffer)):null;
  const deliveryCandidate=workerData.playbackCandidates&&SnapshotBuffer?new CapacityPlayback(deliveryTimelineBuffer(SnapshotBuffer)):null;
  const fullReserve=workerData.playbackCandidates&&BotSnapshotBuffer?new CapacityPlayback(class extends BotSnapshotBuffer {get delayMs(){return 350;}}):null;
  const probes=[playback,control,candidate,noScaleCandidate,reserveCandidate,adaptiveCandidate,receiptCandidate,anchoredCandidate,deliveryCandidate,fullReserve].filter(Boolean);
  const presentationTimer=setInterval(()=>{if(all[0]&&!all[0].intentionalClose&&all[0].ws.readyState===WebSocket.OPEN){const now=receiverNow();for(const probe of probes)probe.sample(now,all[0].players);}},1000/60);
  const appearance = { hatType: 'fedora', hatColor: 1, furColor: 2, coatColor: 3 };
  const tick = setInterval(() => {
    if (phase === 'joining') return;
    const now = receiverNow(), t = (performance.now()-start)/1000;
    for (const c of all) {
      if (!c.id || c.ws.readyState !== WebSocket.OPEN) continue;
      active.maxBuffered = Math.max(active.maxBuffered,c.ws.bufferedAmount);
      if(c.ws.bufferedAmount>65536){active.skipped++;continue;}
      if (now-c.pingAt>=1000) { c.pingAt=now; c.ws.send(JSON.stringify({type:'ping',sentAt:now})); if(workerData.token)c.ws.send(JSON.stringify({type:'benchmarkEcho',sentAt:now})); }
      const p = c.players.get(c.id); if (!p || p.hp<=0 || !c.playing) continue;
      const period = phase==='idle' ? 1000 : 50;
      const theta=t*2+c.index;
      const base=workerData.layout==='clustered'?{x:-10+(c.index%5)*1.5,y:2,z:-27+Math.floor(c.index/5)*.7}:c.base;
      const position = phase==='idle' ? {...base} : {x:base.x+Math.sin(theta)*.4,y:base.y,z:base.z+Math.cos(theta)*.4};
      if(now-c.moveAt>=period){c.moveAt=now;c.position=position;active.sentMoves++;c.ws.send(JSON.stringify({type:'updateMovement',position,rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:Math.sin(theta/2),z:0,w:Math.cos(theta/2)}}));}
      const shooting=phase==='combat'||phase==='incident';
      if(shooting&&now-c.shotAt>=(phase==='incident'?500:1200)) {
        c.shotAt=now;let nearest,nearestD=Infinity;
        for(const other of c.players.values())if(other.id!==c.id&&other.hp>0){const d=Math.hypot(other.x-position.x,other.z-position.z);if(d<nearestD){nearest=other;nearestD=d;}}
        const origin={...position,y:position.y+1.45};
        const target=nearest?{x:nearest.x-origin.x,y:nearest.y+.9-origin.y,z:nearest.z-origin.z}:{x:Math.sin(theta),y:0,z:Math.cos(theta)};
        const length=Math.hypot(target.x,target.y,target.z)||1;
        active.sentShots++;c.ws.send(JSON.stringify({type:'shoot',shotId:randomUUID(),origin,direction:{x:target.x/length,y:target.y/length,z:target.z/length}}));
      }
    }
  },5);
  const meter=setInterval(()=>{active.loop.add(loop.percentile(99)/1e6);loop.reset();for(const c of all)if(c.id&&!c.intentionalClose)active.maxSilence=Math.max(active.maxSilence,receiverNow()-c.lastObservedChaos);},1000);
  function controlIncident(){if(workerData.first)all[0]?.ws.send('{"type":"benchmarkIncident","incident":"scattershot"}');}
  let incidentTimer;
  parentPort.on('message', async command => {
    if(command.type==='churn'){
      try{await churnOne?.();parentPort.postMessage({type:'churnReady'});}catch(error){parentPort.postMessage({type:'failed',error:String(error)});}
    } else if(command.type==='phase') {
      phase=command.phase;active=stats();probes.forEach(p=>p.resetMetrics());loop.reset();all.forEach(c=>{c.lastChaos=0;c.lastServerChaos=0;});
      clearInterval(incidentTimer);
      if(phase==='incident'){controlIncident();incidentTimer=setInterval(controlIncident,24000);}
      parentPort.postMessage({type:'phaseReady',phase});
    } else if(command.type==='report') {
      for(const c of all)if(c.id&&!c.intentionalClose)active.maxSilence=Math.max(active.maxSilence,receiverNow()-c.lastObservedChaos);
      const report={};for(const [key,value] of Object.entries(active))report[key]=value instanceof Metric?value.json():value;
      report.playback=playback?.report()??null;report.approvedPlayback=control?.report()??null;
      report.candidatePlayback=candidate?.report()??null;
      report.noScalePlayback=noScaleCandidate?.report()??null;
      report.reservePlayback=reserveCandidate?.report()??null;
      report.adaptivePlayback=adaptiveCandidate?.report()??null;report.receiptPlayback=receiptCandidate?.report()??null;
      report.anchoredPlayback=anchoredCandidate?.report()??null;
      report.deliveryPlayback=deliveryCandidate?.report()??null;
      report.fullReservePlayback=fullReserve?.report()??null;
      report.generatorHost=workerData.generatorHost??'local';
      report.minRosterSize=Math.min(...all.map(c=>c.players.size));
      report.minScoreboardSize=Math.min(...all.map(c=>c.scoreboardEntries??0));
      parentPort.postMessage({type:'report',report});
    } else if(command.type==='stop') {
      stopping=true;clearInterval(tick);clearInterval(meter);clearInterval(presentationTimer);clearInterval(incidentTimer);loop.disable();
      await Promise.all(all.map(c=>new Promise(resolve=>{if(c.ws.readyState===WebSocket.CLOSED)return resolve();const timer=setTimeout(()=>{c.ws.terminate();resolve();},500);c.ws.once('close',()=>{clearTimeout(timer);resolve();});c.ws.close();})));
      parentPort.postMessage({type:'stopped'});parentPort.close();
    }
  });
  try {
    async function joinClient(index) {
      if(index===0)probes.forEach(p=>p.tracks.clear());
      const c={decoder:ChaosDecoder?new ChaosDecoder():null,index:workerData.offset+index,ws:new Socket(url,{headers:{Origin:url.origin.replace(/^ws/, 'http'),...(workerData.token?{Authorization:`Bearer ${workerData.token}`}:{})}}),players:new Map(),base:null,id:null,playing:true,moveAt:0,shotAt:receiverNow()+index*17,pingAt:receiverNow()+index*11,lastChaos:0,lastServerChaos:0,lastObservedChaos:receiverNow()};all[index]=c;
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Join timeout')),15000);
        c.ws.on('open',()=>c.ws.send(JSON.stringify({type:'join',protocolVersion:4,name:`Bench ${c.index}`,appearance})));
        c.ws.on('error',()=>{active.errors++;clearTimeout(timeout);reject(new Error('Client socket error'));});
        c.ws.on('close',(code,reason)=>{if(!stopping&&!c.intentionalClose){active.disconnects++;console.error(JSON.stringify({event:'client-close',client:c.index,code,reason:reason.toString().slice(0,123)}));}});
        c.ws.on('message',raw=>{
          if(c.intentionalClose)return;
          const enteredAt=receiverNow();
          active.bytes+=raw.length;active.messages++;
          const decoded=c.decoder?c.decoder.read(raw.toString()):{message:parseServerMessage(raw.toString())};
          const m=decoded?.message;if(!m){active.invalid++;return;}
          active.wireBytesByType[m.type]=(active.wireBytesByType[m.type]??0)+raw.length;
          const now=receiverNow();
          switch(m.type){
            case 'welcome':if(index===0)probes.forEach(p=>p.reconnect());c.id=m.id;c.base={x:m.player.x,y:m.player.y,z:m.player.z};c.players=new Map(Object.values(m.players).map(p=>[p.id,p]));c.playing=m.round.phase==='playing';clearTimeout(timeout);resolve();break;
            case 'scoreboardUpdate':c.scoreboardEntries=m.scores.length;break;
            case 'currentPlayers':c.players=new Map(Object.values(m.players).map(p=>[p.id,p]));break;
            case 'playerJoined':c.players.set(m.player.id,m.player);break;
            case 'playerLeft':c.players.delete(m.id);if(index===0)probes.forEach(p=>p.remove(m.id));break;
            case 'playersMoved':for(const sample of m.players){if(index===0&&sample.player.id!==c.id)probes.forEach(p=>p.move(sample.player,now,sample.at));if(c.players.has(sample.player.id))Object.assign(c.players.get(sample.player.id),sample.player);active.moveAges.add(now-sample.at);}break;
            case 'playerMoved':case 'playerCorrected':if(index===0)probes.forEach(p=>p.move(m.player,now,m.at));if(c.players.has(m.player.id))Object.assign(c.players.get(m.player.id),m.player);if(m.at)active.moveAges.add(now-m.at);break;
            case 'playerDamaged':if(c.players.has(m.id))c.players.get(m.id).hp=m.hp;break;
            case 'playerDied':active.deaths++;if(c.players.has(m.victimId))c.players.get(m.victimId).hp=0;break;
            case 'playerRespawn':if(index===0)probes.forEach(p=>p.respawn(m.id,m,now));active.respawns++;if(c.players.has(m.id))Object.assign(c.players.get(m.id),m);if(m.id===c.id)c.base={x:m.x,y:m.y,z:m.z};break;
            case 'gameWon':c.playing=false;break;
            case 'gameReset':c.playing=true;break;
            case 'pong':{if(JSON.parse(raw.toString()).capacityEcho){active.echoRtts.add(now-m.sentAt);break;}active.rtts.add(now-m.sentAt);active.pongAges.add(now-m.receivedAt);const d=JSON.parse(raw.toString()).capacityDelivery;if(d){active.coalescedSnapshots+=Math.max(0,d.coalesced-(c.lastCoalesced??d.coalesced));c.lastCoalesced=d.coalesced;active.maxInFlight=Math.max(active.maxInFlight,d.inFlight);}break;}
            case 'playerShot':active.shotEvents++;break;
            case 'error':active.errors++;break;
            case 'chaos':
              if(c.index===0&&now-(c.lastWireSample??0)>=1000){c.lastWireSample=now;active.wireSamples++;active.sampledWireBytes+=raw.length;active.sampledLegacyBytes+=Buffer.byteLength(JSON.stringify(m,(_k,v)=>typeof v==='number'?Math.round(v*1000)/1000:v));}
              c.lastObservedChaos=now;
              if(c.lastChaos){
                const clientGap=now-c.lastChaos,serverGap=m.state.time-c.lastServerChaos;
                active.gaps.add(clientGap);active.serverGaps.add(serverGap);
                if(clientGap>250){active.worstGaps.push({clientIndex:c.index,observedAt:now,clientGap,serverGap,age:now-m.state.time});active.worstGaps.sort((a,b)=>b.clientGap-a.clientGap);active.worstGaps.length=Math.min(20,active.worstGaps.length);}
              }
              c.lastChaos=now;c.lastServerChaos=m.state.time;active.ages.add(now-m.state.time);active.peakBalls=Math.max(active.peakBalls,m.state.shots.length);active.shotSamples+=m.state.shots.length;active.oldShots+=m.state.shots.filter(s=>s.age>1).length;break;
          }
          active.decodeMs.add(receiverNow()-enteredAt);
          if(decoded.ack)c.ws.send(JSON.stringify(decoded.ack));
        });
      });
      return c;
    }
    for(let index=0;index<workerData.count;index++){await joinClient(index);await delay(20);}
    let churnIndex=0;
    churnOne=async()=>{
      const index=churnIndex++%all.length,c=all[index];c.intentionalClose=true;
      await new Promise(resolve=>{const timer=setTimeout(()=>{c.ws.terminate();resolve();},1000);c.ws.once('close',()=>{clearTimeout(timer);resolve();});c.ws.close();});
      if(stopping)return;await delay(100);if(stopping)return;await joinClient(index);
    };
    parentPort.postMessage({type:'ready',count:all.length,startup:{invalid:active.invalid,errors:active.errors,disconnects:active.disconnects,messages:active.messages}});
  }catch(error){parentPort.postMessage({type:'failed',error:String(error)});}
}

if (!isMainThread) await clients();
