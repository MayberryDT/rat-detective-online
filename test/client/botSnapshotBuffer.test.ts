import {it,expect} from 'vitest';
import {BotSnapshotBuffer} from '../../src/shared/SnapshotBuffer';
const pose=(x:number)=>({x,y:0,z:0,qx:0,qy:0,qz:0,qw:1});
it('keeps AI delivery smooth despite an irregular fixed-step source clock',()=>{
 const buffer=new BotSnapshotBuffer();let source=0,previous=0,held=0,count=0,maxStep=0;
 for(let now=0;now<30000;now+=10){
  if(now%50===0){source+=50*(Math.floor(now/5000)%2?.75:1.25);buffer.push(pose(now*.0065),now,source);}
  const x=buffer.sample(now)!.x;if(now>1000){const step=x-previous;expect(step).toBeGreaterThanOrEqual(0);if(step<1e-7)held++;count++;maxStep=Math.max(maxStep,step);}previous=x;
 }
 expect(held/count).toBeLessThan(.01);expect(maxStep).toBeLessThan(.08);expect(buffer.delayMs).toBeGreaterThanOrEqual(200);expect(buffer.delayMs).toBeLessThanOrEqual(350);
});
it('preserves distinct source steps inside a simultaneous AI delivery',()=>{
 const buffer=new BotSnapshotBuffer();buffer.push(pose(0),0,1000);buffer.push(pose(10),100,1100);buffer.push(pose(20),100,1200);
 expect(buffer.size).toBe(3);expect(buffer.sample(50+buffer.delayMs)!.x).toBeCloseTo(15);
});
it('rejects stale AI poses across respawn without corrupting the receipt history',()=>{
 const buffer=new BotSnapshotBuffer();buffer.push(pose(0),0,1000);buffer.push(pose(1),50,1050);
 buffer.reset(pose(-10),100);
 expect(buffer.push(pose(99),101,1050)).toBe(false);expect(buffer.push(pose(99),99,1100)).toBe(false);
 expect(buffer.push(pose(Number.NaN),100,1100)).toBe(false);expect(buffer.sample(101)!.x).toBe(-10);
 expect(buffer.push(pose(-9),150,1100)).toBe(true);expect(buffer.sample(1000)!.x).toBe(-9);
 buffer.clear();expect(buffer.push(pose(0),0,10)).toBe(true);
});
it('preserves source spacing for bursts spread across receipt milliseconds',()=>{
 const buffer=new BotSnapshotBuffer();buffer.push(pose(0),0,1000);buffer.push(pose(10),100,1100);
 const before=buffer.sample(150)!.x;
 buffer.push(pose(20),101,1200);
 expect(buffer.sample(150)!.x).toBeCloseTo(before);
 const fresh=new BotSnapshotBuffer();fresh.push(pose(0),0,1000);fresh.push(pose(10),100,1100);fresh.push(pose(20),101,1200);
 expect(fresh.size).toBe(3);expect(fresh.sample(51+fresh.delayMs)!.x).toBeCloseTo(15);
});
it('holds the final known AI pose during a blackout and bounds retained history',()=>{
 const buffer=new BotSnapshotBuffer();for(let i=0;i<100;i++)buffer.push(pose(i/10),i*50,i*50);
 expect(buffer.size).toBeLessThanOrEqual(24);expect(buffer.sample(10000)!.x).toBe(9.9);
});
it('bounds delay and step size across repeated batches and ordinary receipt jitter',()=>{
 for(const profile of ['batch','jitter','stall']){
  const buffer=new BotSnapshotBuffer();const pending:Array<{source:number;receipt:number}>=[];
  for(let source=0;source<30000;source+=50){
   const receipt=profile==='batch'?Math.floor(source/150)*150+100+(source%150)/50:
    profile==='jitter'?source+(source%100===0?60:0):source+(source%500<200?200-source%500+(source%500)/10:0);
   pending.push({source,receipt});
  }
  pending.sort((a,b)=>a.receipt-b.receipt||a.source-b.source);
  let previous=0,maxStep=0,maxAge=0;
  for(let now=0;now<30000;now+=5){
   while(pending[0]?.receipt<=now){const next=pending.shift()!;buffer.push(pose(next.source*.0065),next.receipt,next.source);}
   const rendered=buffer.sample(now);if(!rendered)continue;
   if(now>1000){maxStep=Math.max(maxStep,rendered.x-previous);maxAge=Math.max(maxAge,now-rendered.x/.0065);expect(rendered.x).toBeGreaterThanOrEqual(previous);}
   previous=rendered.x;
  }
  expect(maxStep,profile).toBeLessThan(.1);expect(maxAge,profile).toBeLessThan(600);
 }
});
it('does not accumulate clock debt through identical stationary heartbeats',()=>{
 class Observed extends BotSnapshotBuffer{get age(){return this.poses.at(-1)!.time-this.renderedAt;}}
 const buffer=new Observed();let maxAge=0;
 for(let now=0;now<10000;now+=10){if(now%500===0)buffer.push(pose(3),now,now);expect(buffer.sample(now)!.x).toBe(3);if(now>1000)maxAge=Math.max(maxAge,buffer.age);}
 expect(maxAge).toBeLessThanOrEqual(350);
});
it('recovers the normal presentation reserve after a subsecond delivery outage without a pose jump',()=>{
 class Observed extends BotSnapshotBuffer{get age(){return this.poses.at(-1)!.time-this.renderedAt;}}
 const buffer=new Observed();let before=0;
 for(let now=0;now<2000;now+=10){if(now%50===0)buffer.push(pose(now*.0065),now,now);before=buffer.sample(now)!.x;}
 for(let now=2000;now<=2600;now+=10)before=buffer.sample(now)!.x;
 buffer.push(pose(17),2601,2350);
 expect(buffer.sample(2600)!.x).toBeCloseTo(before);
 expect(buffer.age).toBeLessThanOrEqual(350);
 let last=before;
 for(let now=2610;now<3100;now+=10){if(now%50===0)buffer.push(pose(now*.0065),now,now);const x=buffer.sample(now)!.x;expect(x).toBeGreaterThanOrEqual(last);expect(x-last).toBeLessThan(.3);last=x;}
});
