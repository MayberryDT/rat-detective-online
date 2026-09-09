// Read-only presentation probe for one receiving socket per generator.
// Holds are counted only while recent source positions indicate movement;
// Newest-source eligibility is retained for historical comparison. Delayed
// stationary intervals can produce false positives; diagnostics classify them.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
// Read-only adapter for the frozen TypeScript buffers used by this Node probe.
// Unknown layouts are reported explicitly, never assumed healthy.
function classify(buffer){
  const poses=buffer.poses,time=buffer.renderedAt;
  if(!Array.isArray(poses)||!poses.length||!Number.isFinite(time))return "unknown";
  if(time>=poses.at(-1).time)return "newest";
  if(time<=poses[0].time)return "oldest";
  let right=1;while(right<poses.length-1&&poses[right].time<time)right++;
  return distance(poses[right-1],poses[right])<1e-7?"stationaryInterior":"movingInterior";
}
export class CapacityPlayback {
  constructor(BufferClass,BotBufferClass){this.BufferClass=BufferClass;this.BotBufferClass=BotBufferClass;this.tracks=new Map();this.resetMetrics();}
  resetMetrics(){this.frames=0;this.held=0;this.maxRenderAgeMs=0;this.forwardSkips=0;this.renderAgeExamples=[];this.resets=0;this.rejected=0;this.presentationFrames=0;this.blackoutActorMs=0;this.eligibleActorMs=0;this.maxHoldMs=0;this.lastSample=undefined;this.holdClasses={newest:0,oldest:0,stationaryInterior:0,movingInterior:0,unknown:0};this.holdDetails={};this.poseGaps=[];this.holdExamples=[];for(const t of this.tracks.values())t.holdMs=0;}
  remove(id){this.tracks.delete(id);}
  reconnect(){this.resets+=this.tracks.size;this.tracks.clear();this.lastSample=undefined;}
  respawn(id,position,now){
    const t=this.tracks.get(id);if(!t)return;
    t.buffer.reset({x:position.x,y:position.y,z:position.z,qx:0,qy:0,qz:0,qw:1},now);
    t.last={...t.last,...position,meshQx:0,meshQy:0,meshQz:0,meshQw:1};
    t.born=now;t.moving=false;t.previous=null;t.sourceAt=undefined;this.resets++;
  }
  move(p,now,at){
    let t=this.tracks.get(p.id);
    if(!t){t={buffer:new (this.BotBufferClass&&p.id.startsWith('rd-ai-')?this.BotBufferClass:this.BufferClass)(),born:now,last:p,moving:false};this.tracks.set(p.id,t);}
    const generation=t.buffer.generation;
    if(!t.buffer.push({x:p.x,y:p.y,z:p.z,qx:p.meshQx,qy:p.meshQy,qz:p.meshQz,qw:p.meshQw},now,at)){this.rejected++;return false;}
    t.moving=Math.hypot(p.x-t.last.x,p.y-t.last.y,p.z-t.last.z)>.001;
    if(t.buffer.generation===generation&&Number.isFinite(t.received)&&Number.isFinite(at)&&Number.isFinite(t.sourceAt)){
      const gap={id:p.id,receiptMs:now-t.received,sourceMs:at-t.sourceAt,moved:t.moving};
      // Keep the largest 32 gaps per measurement window, with paired clocks.
      this.poseGaps.push(gap);this.poseGaps.sort((a,b)=>b.receiptMs-a.receiptMs);this.poseGaps.length=Math.min(32,this.poseGaps.length);
    }
    t.last=p;t.received=now;t.sourceAt=at;
    if(t.buffer.generation!==generation){t.born=now;this.resets++;t.previous=null;}
  }
  sample(now,players){
    const elapsed=this.lastSample===undefined?0:Math.max(0,now-this.lastSample);
    this.lastSample=now;this.presentationFrames++;
    for(const [id,t] of this.tracks){
      if(players.get(id)?.hp>0&&Number.isFinite(t.received))this.blackoutActorMs+=Math.max(0,now-Math.max(now-elapsed,t.received+500));
      const before=t.buffer.renderedAt,first=t.buffer.poses?.[0]?.time;
      const p=t.buffer.sample(now);
      if(p&&players.get(id)?.hp>0&&now-t.born>1000){
        const age=Math.max(0,(t.buffer.poses?.at(-1)?.time??t.buffer.renderedAt)-t.buffer.renderedAt);
        if(age>this.maxRenderAgeMs){this.renderAgeExamples.push({id,now,age,moving:t.moving,receiptAge:now-t.received,delay:t.buffer.delayMs,born:t.born,renderedAt:t.buffer.renderedAt,poses:t.buffer.poses?.map(p=>({...p}))});if(this.renderAgeExamples.length>8)this.renderAgeExamples.shift();}
        this.maxRenderAgeMs=Math.max(this.maxRenderAgeMs,age);
        if(Number.isFinite(before)&&elapsed<1000&&first>before+elapsed*1.1+1)this.forwardSkips++;
      }
      if(p&&t.previous&&players.get(id)?.hp>0&&t.moving&&now-t.born>1000&&now-t.received<500){
        this.frames++;this.eligibleActorMs+=elapsed;
        if(Math.hypot(p.x-t.previous.x,p.y-t.previous.y,p.z-t.previous.z)<1e-7){this.held++;
          const kind=classify(t.buffer),age=now-t.received,delay=t.buffer.delayMs;
          this.holdClasses[kind]++;
          if(kind==='newest'&&(!t.lastExampleAt||now-t.lastExampleAt>=1000)){
            t.lastExampleAt=now;
            this.holdExamples.push({id,now,age,delay,size:t.buffer.size,renderedAt:t.buffer.renderedAt,poses:t.buffer.poses?.map(p=>({...p})),scale:t.buffer.clockScale,sourceAt:t.sourceAt,holdMs:t.holdMs??0});
            this.holdExamples.sort((a,b)=>b.holdMs-a.holdMs);this.holdExamples.length=Math.min(32,this.holdExamples.length);
          }
          const key=`${kind}/${age<delay?'beforeDelay':'afterDelay'}/${age<250?'under250':'250to500'}/${t.buffer.size<=2?'small':'buffered'}`;
          this.holdDetails[key]=(this.holdDetails[key]??0)+1;
          t.holdMs=(t.holdMs??0)+elapsed;this.maxHoldMs=Math.max(this.maxHoldMs,t.holdMs);}
        else t.holdMs=0;
      }
      if(!(p&&t.previous&&players.get(id)?.hp>0&&t.moving&&now-t.born>1000&&now-t.received<500))t.holdMs=0;
      t.previous=p;
    }
  }
  report(){return {renderAgeExamples:this.renderAgeExamples,metricVersion:2,maxRenderAgeMs:this.maxRenderAgeMs,forwardSkips:this.forwardSkips,frames:this.frames,held:this.held,resets:this.resets,tracks:this.tracks.size,rejected:this.rejected,presentationFrames:this.presentationFrames,blackoutActorMs:this.blackoutActorMs,eligibleActorMs:this.eligibleActorMs,maxHoldMs:this.maxHoldMs,holdClasses:{...this.holdClasses},holdDetails:{...this.holdDetails},holdExamples:this.holdExamples.map(e=>({...e})),poseGaps:this.poseGaps.map(g=>({...g}))};}
}
