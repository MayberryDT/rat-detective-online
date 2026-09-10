import {phaseHealthy} from './capacity-clients.mjs';
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
export function qualityHealthy(metrics,quality,playbackRequired=true) {
  // An idle human-only phase has no moving tracks to qualify for playback.
  if(!playbackRequired)return phaseHealthy(metrics)&&Object.values(metrics.byHost??{}).every(phaseHealthy);
  if(quality==='both')return phaseHealthy(metrics)&&playbackHealthy(metrics)&&Object.values(metrics.byHost??{}).every(m=>phaseHealthy(m)&&playbackHealthy(m));
  return quality==='playback'?playbackHealthy(metrics):phaseHealthy(metrics);
}
