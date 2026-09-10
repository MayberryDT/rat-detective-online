import {describe,it,expect} from 'vitest';
import {BotCombat,combatRandom} from '../../src/shared/BotCombat';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
const self={x:0,y:0,z:0};
const target=()=>createPlayer('target','Target',DEFAULT_APPEARANCE,{x:0,y:0,z:30});
describe('human-like combat rhythm and perception',()=>{
 it('spreads initial reactions across bots instead of synchronizing the first volley',()=>{
  const buckets=Array.from({length:7},(_,seed)=>Math.floor((200+combatRandom(seed)()*250)/17));
  expect(new Set(buckets).size).toBeGreaterThanOrEqual(5);
 });
 it('reacts before shooting, fires bursts with pauses, and remains below the server rate limit',()=>{
  const combat=new BotCombat(combatRandom(4)),rat=target(),shots:number[]=[];
  for(let now=0;now<60000;now+=1000/60)if(combat.step(now,self,rat,true).shoot)shots.push(now);
  expect(shots[0]).toBeGreaterThanOrEqual(200);expect(shots[0]).toBeLessThan(470);
  expect(shots.length).toBeGreaterThan(120);expect(shots.length).toBeLessThan(190);
  const groups:number[]=[];let group=1;
  for(let i=1;i<shots.length;i++){if(shots[i]-shots[i-1]>450){groups.push(group);group=1;}else group++;}
  expect(groups).toContain(1);expect(groups.some(size=>size>=3)).toBe(true);
  expect(new Set(groups).size).toBeGreaterThanOrEqual(3);
  for(let i=1;i<shots.length;i++)expect(shots[i]-shots[i-1]).toBeGreaterThanOrEqual(199.99);
  for(const t of shots)expect(shots.filter(s=>s>=t&&s<t+1000).length).toBeLessThanOrEqual(5);
 });
 it('uses angular error that grows with range and holds it across shots',()=>{
  const near=new BotCombat(()=>.5),far=new BotCombat(()=>.5),a=target(),b=target();a.z=10;b.z=50;
  const first=near.step(0,self,a,true).aim!,distant=far.step(0,self,b,true).aim!;
  expect(Math.abs(distant.x)/Math.abs(first.x)).toBeCloseTo(5);
  expect(near.step(100,self,a,true).aim).toEqual(first);
  expect(Math.abs(first.x)).toBeGreaterThan(.69);
 });
 it('lags a sudden strafe rather than reading the exact current position',()=>{
  const combat=new BotCombat(()=>.5),rat=target();combat.step(0,self,rat,true);
  for(let now=20;now<=400;now+=20)combat.step(now,self,rat,true);
  rat.x=12;
  const before=combat.step(420,self,rat,true).aim!;
  expect(before.x).toBeLessThan(1);
  const after=combat.step(440,self,rat,true).aim!;expect(after.x).toBeLessThan(10);
 });
 it('finishes only a short existing burst at the last seen point without following hidden movement',()=>{
  const a=new BotCombat(()=>0),b=new BotCombat(()=>0),rat=target(),hidden=target();
  a.step(0,self,rat,true);b.step(0,self,hidden,true);
  expect(a.step(200,self,rat,true).shoot).toBeDefined();b.step(200,self,hidden,true);
  hidden.x=100;
  expect(a.step(300,self,rat,false).shoot).toEqual(b.step(300,self,hidden,false).shoot);
  expect(a.step(400,self,rat,false).shoot).toBeUndefined();
  expect(a.step(500,self,rat,true).shoot).toBeUndefined();
 });
 it('reacquires new targets, clears on death/reset and never catches up with a volley after a stall',()=>{
  const combat=new BotCombat(()=>.5),rat=target();combat.step(0,self,rat,true);
  expect(combat.step(400,self,rat,true).shoot).toBeDefined();
  rat.id='new';expect(combat.step(420,self,rat,true).shoot).toBeUndefined();
  expect(combat.step(10000,self,rat,true).shoot).toBeDefined();
  expect(combat.step(10000,self,rat,true).shoot).toBeUndefined();
  rat.hp=0;expect(combat.step(10020,self,rat,true).shoot).toBeUndefined();
  rat.hp=3;expect(combat.step(10040,self,rat,true).shoot).toBeUndefined();
  combat.reset();expect(combat.step(11000,self,rat,true).shoot).toBeUndefined();
 });
 it('lets Dispatch inhibit combat firing without spending a combat shot',()=>{
  const combat=new BotCombat(()=>.5),rat=target();combat.step(0,self,rat,true,false);
  expect(combat.step(400,self,rat,true,false).shoot).toBeUndefined();
  expect(combat.step(400,self,rat,true,true).shoot).toBeDefined();
 });
});

it('produces more shots and fewer geometric body hits than the old perfect-tracking model',()=>{
 const combat=new BotCombat(combatRandom(17)),rat=target(),oldRandom=combatRandom(81);
 let shots=0,hits=0,oldShots=0,oldHits=0,oldAt=0;
 // A laterally dodging target at 30 units. This measures aim, not ballistic damage.
 const intersects=(p:{x:number;y:number;z:number})=>{
  const scale=rat.z/p.z;
  return Math.hypot(p.x*scale-rat.x,(p.y-.9)*scale)<.6;
 };
 for(let now=0;now<60000;now+=1000/60){
  rat.x=Math.sin(now/700)*5;
  const shot=combat.step(now,self,rat,true).shoot;
  if(shot){shots++;if(intersects(shot))hits++;}
  if(now>=oldAt){oldAt=now+350+oldRandom()*400;oldShots++;
   if(intersects({x:rat.x+(oldRandom()-.5)*2.5,y:.9+(oldRandom()-.5)*.6,z:rat.z+(oldRandom()-.5)*2.5}))oldHits++;
  }
 }
 expect(shots).toBeGreaterThan(oldShots*1.1);
 expect(hits/shots).toBeLessThan(oldHits/oldShots*.5);
 console.log(JSON.stringify({combatAimProbe:{seconds:60,newShots:shots,oldShots,newBodyIntersections:hits,oldBodyIntersections:oldHits}}));
});
