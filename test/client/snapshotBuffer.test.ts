import { describe, expect, it } from 'vitest';
import { SnapshotBuffer, type SnapshotPose } from '../../src/shared/SnapshotBuffer';
const pose=(x:number):SnapshotPose=>({x,y:0,z:0,qx:0,qy:0,qz:0,qw:1});

describe('received-timestamp remote interpolation',()=>{
    it('interpolates a steady trajectory through jittered 10 Hz arrivals rather than easing to each target',()=>{
        const b=new SnapshotBuffer();
        for(const time of [0,100,195,310,400])b.push(pose(time/10),time);
        const sample=b.sample(425)!;
        expect(sample.x).toBeCloseTo((425-b.delayMs)/10);
        expect(b.delayMs).toBeGreaterThanOrEqual(100);
        expect(sample.x).toBeLessThan(40);
        // A missing update holds the last real pose; no guessed movement through walls.
        expect(b.sample(900)?.x).toBe(40);
    });
    it('adapts to 20 Hz updates and never rewinds when arrival jitter raises the delay',()=>{
        const b=new SnapshotBuffer();
        for(let time=0;time<=1000;time+=50)b.push(pose(time/100),time);
        expect(b.delayMs).toBeGreaterThanOrEqual(100);
        expect(b.delayMs).toBeLessThan(120);
        const before=b.sample(1100)!.x;
        b.push(pose(11.8),1180);
        expect(b.sample(1110)!.x).toBeGreaterThanOrEqual(before);
    });
    it('uses the shortest quaternion arc across the yaw wrap',()=>{
        const b=new SnapshotBuffer(),angle=170*Math.PI/180;
        b.push({...pose(0),qy:Math.sin(angle/2),qw:Math.cos(angle/2)},0);
        b.push({...pose(10),qy:Math.sin(-angle/2),qw:Math.cos(-angle/2)},100);
        const sample=b.sample(50+b.delayMs)!;
        expect(Math.abs(sample.qy)).toBeCloseTo(1);
        expect(sample.qw).toBeCloseTo(0);
        expect(sample.x).toBeCloseTo(5);
    });
    it('rejects stale timestamps, coalesces equal timestamps, and snaps across teleports and long gaps',()=>{
        const b=new SnapshotBuffer();b.push(pose(0),100);b.push(pose(1),200);
        expect(b.push(pose(99),150)).toBe(false);
        b.push(pose(2),200);expect(b.size).toBe(2);
        b.push(pose(120),300);expect(b.size).toBe(1);expect(b.sample(300)?.x).toBe(120);
        b.push(pose(122),1400);expect(b.size).toBe(1);expect(b.sample(1400)?.x).toBe(122);
        b.reset(pose(-40),1500);expect(b.sample(1500)?.x).toBe(-40);
    });
    it('bounds storage and releases the full history on cleanup',()=>{
        const b=new SnapshotBuffer();for(let i=0;i<300;i++)b.push(pose(i),i*50);
        expect(b.size).toBeLessThanOrEqual(24);
        b.clear();expect(b.size).toBe(0);expect(b.sample(20000)).toBeUndefined();
    });
});

describe('server timeline mapped onto the local render clock',()=>{
    it('preserves distinct movement samples and their original spacing inside a delayed batch',()=>{
        const b=new SnapshotBuffer();
        const epoch=1_800_000_000_000;
        b.push(pose(0),0,epoch);
        b.push(pose(10),100,epoch+100);
        // Two updates arrive together, but were produced 100 ms apart.
        b.push(pose(20),350,epoch+200);
        b.push(pose(30),350,epoch+300);
        expect(b.size).toBe(4);
        const renderAt=b.delayMs+150;
        expect(b.sample(renderAt)?.x).toBeCloseTo(15);
        expect(b.presentedSourceTime).toBeCloseTo(epoch+150);
    });
    it('improves initial clock mapping as a delayed first batch drains without discarding its spacing',()=>{
        const b=new SnapshotBuffer();
        b.push(pose(0),300,5000);
        b.push(pose(10),300,5100);
        b.push(pose(20),300,5200);
        expect(b.size).toBe(3);
        expect(b.sample(100+b.delayMs+50)?.x).toBeCloseTo(5);
    });
    it('rejects old server samples even when they arrive later, including across a respawn',()=>{
        const b=new SnapshotBuffer();
        b.push(pose(0),0,5000);b.push(pose(10),100,5100);
        expect(b.push(pose(-20),200,5050)).toBe(false);
        b.reset(pose(-100),250);
        expect(b.push(pose(10),260,5100)).toBe(false);
        expect(b.push(pose(5),270,5075)).toBe(false);
        expect(b.sample(270)?.x).toBe(-100);
        expect(b.push(pose(-98),300,5300)).toBe(true);
        expect(b.sample(600)?.x).toBe(-98);
    });
    it('keeps monotonic rendering when network jitter temporarily increases the playback delay',()=>{
        const b=new SnapshotBuffer();
        for(let time=0;time<=400;time+=50)b.push(pose(time/100),time,5000+time);
        const before=b.sample(490)!.x;
        b.push(pose(4.5),650,5450);
        expect(b.sample(500)!.x).toBeGreaterThanOrEqual(before);
        expect(b.delayMs).toBeLessThanOrEqual(350);
    });
    it('falls back cleanly to legacy arrivals and clears the clock for a fresh connection',()=>{
        const b=new SnapshotBuffer();b.push(pose(0),0,5000);b.push(pose(10),100,5100);
        b.push(pose(12),200);
        expect(b.sample(200)?.x).toBe(12);
        b.push(pose(14),300);
        expect(b.sample(350)!.x).toBeGreaterThan(12);
        b.clear();expect(b.push(pose(0),0,100)).toBe(true);expect(b.size).toBe(1);
    });
});

describe('playback under changing transit delay',()=>{
    it('keeps a continuous walk moving through sustained extra transit delay without catch-up bursts',()=>{
        const b=new SnapshotBuffer();
        const incoming=Array.from({length:240},(_,i)=>{
            const source=i*50;
            return {source,arrival:source+40+(source>=2000?120:0)+(i%3)*12};
        });
        let index=0,previous:number|undefined,held=0,count=0,maxStep=0;
        for(let now=0;now<11500;now+=1000/60){
            while(index<incoming.length&&incoming[index].arrival<=now){
                const s=incoming[index++];b.push(pose(s.source*.0065),s.arrival,100000+s.source);
            }
            const sample=b.sample(now);if(!sample)continue;
            if(previous!==undefined&&now>1000){
                const step=sample.x-previous;
                expect(step).toBeGreaterThanOrEqual(-.000001);
                if(step<.00001)held++;
                maxStep=Math.max(maxStep,step);count++;
            }
            previous=sample.x;
        }
        expect(held/count).toBeLessThan(.03);
        expect(maxStep).toBeLessThan(.2);
        expect(b.delayMs).toBeGreaterThan(200);
        expect(b.delayMs).toBeLessThanOrEqual(350);
    });
    it('resumes from the last rendered pose after running out of updates, without advancing into unknown space',()=>{
        const b=new SnapshotBuffer();
        b.push(pose(0),0,1000);b.push(pose(1),100,1100);
        for(let now=0;now<=700;now+=10)b.sample(now);
        expect(b.sample(710)?.x).toBe(1);
        b.push(pose(2),720,1200);b.push(pose(3),720,1300);
        const resumed=b.sample(730)!.x;
        expect(resumed).toBeGreaterThan(1);
        expect(resumed).toBeLessThan(1.3);
        expect(b.sample(10000)?.x).toBe(3);
    });
});

it('preserves the displayed position when a lower-latency packet refines the clock mapping',()=>{
    const b=new SnapshotBuffer();
    b.push(pose(0),100,1000);b.push(pose(1),200,1100);
    b.sample(200);
    const before=b.sample(260)!.x;
    b.push(pose(2.5),260,1250);
    expect(b.sample(260)!.x).toBeCloseTo(before);
    expect(b.sample(276)!.x).toBeGreaterThan(before);
});

it('adapts sustained slow source clocks without holding moving poses or jumping',()=>{
 for(const scale of [1,1.25,1.5]){
  const buffer=new SnapshotBuffer();let previous;let frames=0,held=0,maxStep=0;
  for(let now=0;now<30000;now+=1000/60){
   const tick=Math.floor(now/50);
   if(tick!==Math.floor((now-1000/60)/50)){
    const source=tick*50/scale;
    buffer.push({x:source*.0065,y:0,z:0,qx:0,qy:0,qz:0,qw:1},now,100000+source);
   }
   const pose=buffer.sample(now);
   if(pose&&previous&&now>15000){frames++;const step=pose.x-previous.x;if(Math.abs(step)<1e-8)held++;maxStep=Math.max(maxStep,step);expect(step).toBeGreaterThanOrEqual(-1e-7);}
   previous=pose;
  }
  expect(held/frames).toBeLessThan(.01);expect(maxStep).toBeLessThan(.14);
 }
});

it('keeps clock-rate fitting bounded under ordered packet bunching',()=>{
 for(const scale of [1,1.25,1.5]){
  const buffer=new SnapshotBuffer();let due=0;
  const events=Array.from({length:800},(_,i)=>{due=Math.max(due,i*50*scale+(i%19<3?150:0));return{due,source:i*50};});
  let index=0,previous;let frames=0,held=0,maxStep=0;
  for(let now=0;now<35000;now+=1000/60){
   while(index<events.length&&events[index].due<=now){const e=events[index++];buffer.push({x:e.source*.0065,y:0,z:0,qx:0,qy:0,qz:0,qw:1},e.due,1_700_000_000_000+e.source);}
   const pose=buffer.sample(now);
   if(pose&&previous&&now>15000){frames++;const step=pose.x-previous.x;if(Math.abs(step)<1e-8)held++;maxStep=Math.max(maxStep,step);expect(step).toBeGreaterThanOrEqual(-1e-6);}
   previous=pose;
  }
  expect(held/frames).toBeLessThan(.01);expect(maxStep).toBeLessThan(.15);
 }
});
