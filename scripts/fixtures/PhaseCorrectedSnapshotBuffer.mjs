// Measurement-only candidate. No game imports; frozen source/control stay intact.
export const phaseCorrectedBuffer=(Base,maxMappedTransit=250)=>class extends Base {
 push(pose,received,source){
  const accepted=super.push(pose,received,source);
  if(accepted&&this.serverOffset!==undefined){
   const excess=received-this.poses.at(-1).time-maxMappedTransit;
   if(excess>0){this.serverOffset+=excess;for(const pose of this.poses)pose.time+=excess;if(Number.isFinite(this.renderedAt))this.renderedAt+=excess;}
  }
  return accepted;
 }
};
export const rollingOffsetBuffer=Base=>class extends Base {
 envelope=[];
 clear(){super.clear();this.envelope=[];}
 push(pose,received,source){
  // Respect stale validation before observing the estimator.
  if(!Number.isFinite(source)||!Number.isFinite(received)||!Object.values(pose).every(Number.isFinite)||
    (this.lastReceivedAt!==undefined&&received<this.lastReceivedAt)||
    (this.lastServerAt!==undefined&&source<this.lastServerAt)||
    (this.resetServerBarrier!==undefined&&source<=this.resetServerBarrier))return super.push(pose,received,source);
  this.envelope=this.envelope.filter(p=>received-p.received<=1500);
  this.envelope.push({received,source});if(this.envelope.length>128)this.envelope.shift();
  const offset=Math.min(...this.envelope.map(p=>p.received-p.source));
  if(this.serverOffset!==undefined){const change=offset-this.serverOffset;for(const p of this.poses)p.time+=change;if(Number.isFinite(this.renderedAt))this.renderedAt+=change;}
  this.serverOffset=offset;
  return super.push(pose,received,source);
 }
};
export const adaptiveReserveBuffer=Base=>class extends phaseCorrectedBuffer(Base,100){
 recentGap=0;
 get delayMs(){return Math.min(350,Math.max(super.delayMs,100+this.recentGap*1.25));}
 push(p,r,s){const previous=this.lastReceivedAt,accepted=super.push(p,r,s);if(accepted&&previous!==undefined)this.recentGap=Math.max(this.recentGap*.995,Math.min(200,r-previous));return accepted;}
 clear(){super.clear();this.recentGap=0;}
};
export const receiptBuffer=Base=>class extends Base{push(p,r){return super.push(p,r);}};
// Isolate presentation target from absolute clock phase, retaining source spacing.
export const receiptAnchoredBuffer=Base=>class extends Base{
 sampling=false;phase=0;
 get delayMs(){return super.delayMs-(this.sampling?this.phase:0);}
 sample(now){
  this.phase=this.poses.length&&Number.isFinite(this.lastReceivedAt)?this.poses.at(-1).time-this.lastReceivedAt:0;
  this.sampling=true;try{return super.sample(now);}finally{this.sampling=false;}
 }
};
// Receiver-clock control preserving distinct source spacing inside one delivery.
export const deliveryTimelineBuffer=(Base,minDelay=200)=>class extends Base{
 sourceSeen=undefined;sourceBarrier=undefined;
 get delayMs(){return Math.max(minDelay,super.delayMs);}
 clear(){super.clear();this.sourceSeen=undefined;this.sourceBarrier=undefined;}
 reset(p,r){super.reset(p,r);this.sourceBarrier=this.sourceSeen;}
 push(p,r,s){
  if(Number.isFinite(s)&&((this.sourceSeen!==undefined&&s<this.sourceSeen)||(this.sourceBarrier!==undefined&&s<=this.sourceBarrier)))return false;
  if(Number.isFinite(r)&&Object.values(p).every(Number.isFinite)&&r===this.lastReceivedAt&&Number.isFinite(s)&&Number.isFinite(this.sourceSeen)&&s>this.sourceSeen){
   const shift=Math.min(250,s-this.sourceSeen);for(const pose of this.poses)pose.time-=shift;if(Number.isFinite(this.renderedAt))this.renderedAt-=shift;
  }
  const accepted=super.push(p,r);if(accepted&&Number.isFinite(s))this.sourceSeen=s;return accepted;
 }
};
