import {describe,it,expect} from 'vitest';
import {WorldPresentationClock,WorldSnapshotBuffer} from '../../src/shared/WorldPresentationClock';
const pose=(at:number)=>({x:at*.012,y:0,z:0,qx:0,qy:0,qz:0,qw:1});
describe('one room presentation time',()=>{
 it('samples human and AI source histories at one time with a 100 ms ideal reserve',()=>{
  const clock=new WorldPresentationClock(),human=new WorldSnapshotBuffer(clock),ai=new WorldSnapshotBuffer(clock);
  let frame=0,humanTick=0,aiTick=0,chaosTick=0;
  const ages:number[]=[],differences:number[]=[];
  for(;frame<=600;frame++){
   const now=frame*1000/60;
   while(chaosTick*1000/30<=now+1e-7){const at=chaosTick++*1000/30;clock.observe(at,at);}
   while(humanTick*50<=now+1e-7){const at=humanTick++*50;human.push(pose(at),at,at);}
   while(aiTick*1000/15<=now+1e-7){const at=aiTick++*1000/15;ai.push(pose(at),at,at);}
   const h=human.sample(now)!,a=ai.sample(now)!;
   if(now>8000){ages.push(now-h.x/.012);differences.push(Math.abs(h.x-a.x)/.012);}
  }
  expect(Math.max(...differences)).toBeLessThan(1e-6);
  expect(Math.max(...ages)).toBeLessThanOrEqual(100.1);expect(Math.min(...ages)).toBeGreaterThan(99.9);
 });
 it('keeps clock and poses monotonic through jitter and a delivery pause',()=>{
  const clock=new WorldPresentationClock(),history=new WorldSnapshotBuffer(clock);
  const packets=Array.from({length:301},(_,i)=>{const source=i*1000/30;return{source,arrival:source+75+(i*17%26)+(source>4000&&source<4300?300:0)};}).sort((a,b)=>a.arrival-b.arrival);
  let cursor=0,last=-Infinity,lastX=-Infinity;
  for(let frame=0;frame<=660;frame++){
   const now=frame*1000/60;
   while(cursor<packets.length&&packets[cursor].arrival<=now){const p=packets[cursor++];clock.observe(p.source,p.arrival);history.push(pose(p.source),p.arrival,p.source);}
   const at=clock.sample(now),p=history.sample(now);
   if(Number.isFinite(at)){expect(at).toBeGreaterThanOrEqual(last);last=at;}
   if(p){expect(p.x).toBeGreaterThanOrEqual(lastX-1e-9);lastX=p.x;}
  }
  expect(clock.delayMs).toBeLessThanOrEqual(350);expect(history.size).toBeLessThanOrEqual(24);
  expect(clock.latestTime-clock.sample(11000)).toBeLessThan(1);
 });
 it('clears old clock epochs and rejects old-life source poses',()=>{
  const clock=new WorldPresentationClock(),history=new WorldSnapshotBuffer(clock);
  clock.observe(1000,0);history.push(pose(1000),0,1000);clock.observe(1050,50);history.push(pose(1050),50,1050);
  history.reset({...pose(1050),x:50},50);
  expect(history.push(pose(1000),100,1000)).toBe(false);expect(history.sample(100)?.x).toBe(50);
  clock.clear();history.clear();clock.observe(10,200);history.push(pose(10),200,10);
  expect(history.sample(200)?.x).toBeCloseTo(.12);expect(clock.generation).toBe(1);
 });
});
