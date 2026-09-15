import {writeBotExperimentReport} from '../../scripts/lib/bot-experiment-report.mjs';
import {afterAll,expect,it} from 'vitest';
import {ObjectiveBotBrain,type ObjectiveNavigation} from '../../src/shared/ObjectiveBotBrain';
import {BotPurposefulHolding} from '../../src/shared/BotPurposefulHolding';
import {BotManeuver} from '../../src/shared/BotManeuver';
import {BotZoneHolding} from '../../src/shared/BotZoneHolding';
import {BotNavigation} from '../../src/shared/BotNavigation';
import {BotAttention} from '../../src/shared/BotAttention';
import type {BotExperiment} from '../../src/shared/BotExperiments';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment,ASSIGNMENT_IDS} from '../../src/shared/assignments';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {JURISDICTION_ZONE_IDS,JURISDICTION_ZONES,zoneContains} from '../../src/shared/jurisdictionZones';
const nav:ObjectiveNavigation={route:(_f,to)=>[to],localStep:(_f,to)=>to,explorationTargets:()=>[{x:50,y:0,z:50}]};
const player=(id:string,x=0,z=0)=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
const report:Record<string,unknown>={};
afterAll(()=>writeBotExperimentReport('controlled',report));
it('removes distance-tie movement churn while preserving better targets and immediate case priority in all assignments',()=>{
 const rows=[];
 for(const mode of ASSIGNMENT_IDS)for(const experiment of ['baseline','commitment','combined'] as const){
  const self=player('self'),a=player('a',0,30),b=player('b',30.2,0),sim=new ChaosSimulation(new Map([self,a,b].map(p=>[p.id,p])),()=>{});
  const state=sim.snapshot(false),assignment=createAssignment(mode,0,'test',()=>.3);assignment.phase='active';state.assignment=assignment;
  state.time=0;state.case.owner=null;state.case.returningUntil=100000;state.pickups=[];state.dispatch.phase='cooldown';
  const brain=new ObjectiveBotBrain(nav,0,()=>.5,experiment),keys:string[]=[];
  for(let i=0;i<10;i++){a.z=i%2?30.2:30;b.x=i%2?30:30.2;brain.step(i*300,self,[a,b],state,()=>true,false,true);keys.push(brain.goalKey);}
  const switches=keys.slice(1).filter((k,i)=>k!==keys[i]).length;
  expect(switches).toBe(experiment==='baseline'?9:0);
  b.x=12;brain.step(3300,self,[a,b],state,()=>true,false,true);expect(brain.goalKey).toBe('combat:b');
  state.case.returningUntil=0;state.case.p={x:8,y:0,z:0};brain.step(3310,self,[a,b],state,()=>true,false,true);expect(brain.objective).toBe('case');
  rows.push({mode,experiment,switches});
 }
 report.commitment=rows;
});
it('finishes a supported combat maneuver across the old clock reversal and releases a failed route',()=>{
 const m=new BotManeuver(0),self={x:0,y:0,z:0},threat={x:0,y:0,z:12};
 const first=m.step(2500,'combat:a',self,threat,nav)!;
 expect(m.step(2700,'combat:a',self,threat,nav)).toEqual(first);
 expect(m.step(2750,'combat:a',first,threat,nav)).not.toEqual(first);
 expect(m.step(2800,'combat:a',self,threat,{...nav,localStep:()=>undefined})).toBeUndefined();
 m.reset();expect(m.step(2900,'combat:b',self,{x:12,y:0,z:0},nav)).not.toEqual(first);
});
it('uses supported quiet posts, responds to threats, and keeps all six zone boundaries with bounded local work',()=>{
 const realNav=new BotNavigation({seed:341283204,version:2}),rows=[];
 for(const id of JURISDICTION_ZONE_IDS)for(const experiment of ['baseline','maneuvers'] as const)for(const threats of [0,1,9]){
  const hold=experiment==='baseline'?new BotZoneHolding(1):new BotPurposefulHolding(1),zone=JURISDICTION_ZONES[id];
  const self={...zone.posts[0],y:zone.floorY};let travel=0,hops=0,calls=0,lateTravel=0;
  const local:ObjectiveNavigation={...nav,localStep:(from,to)=>{calls++;return realNav.localStep(from,to);}};
  for(let t=0;t<20000;t+=50){
   // Scripted nearest visible attacker changes approach every four seconds.
   // Crowd condition rotates nine distinct positions; it is steering, not damage.
   const angle=Math.floor(t/4000)*(threats===9?.7:.3);
   const threat=threats?{x:zone.posts[0].x+Math.sin(angle)*8,y:zone.floorY,z:zone.posts[0].z+Math.cos(angle)*8}:undefined;
   const intent=hold.step(t,id,'round',self,threat,true,local,()=>false);
   const d=Math.hypot(intent.x,intent.z)*.05;travel+=d;if(t>=15000)lateTravel+=d;if(intent.jump)hops++;
   self.x+=intent.x*.05;self.z+=intent.z*.05;
   expect(zoneContains(id,self),`${id} ${experiment} ${threats}`).toBe(true);
  }
  expect(calls).toBeLessThan(1000);if(experiment==='maneuvers'&&!threats){expect(hops).toBe(0);expect(lateTravel).toBeLessThan(.2);}
  rows.push({id,experiment,threats,travel:+travel.toFixed(2),lateTravel:+lateTravel.toFixed(2),hops,localCalls:calls});
 }
 report.maneuvers=rows;
},20000);
function acquisition(experiment:BotExperiment,behind:boolean){
 const self=player('self'),target=player('enemy',0,behind?-20:20),brain=new ObjectiveBotBrain(nav,0,()=>.5,experiment);
 let first:number|undefined,shots=0,maxTurn=0,previous=0;
 for(let now=0;now<5000;now+=20){
  const intent=brain.step(now,self,[target],undefined,()=>true,false,true);
  const delta=Math.abs(Math.atan2(Math.sin(intent.facing-previous),Math.cos(intent.facing-previous)));maxTurn=Math.max(maxTurn,delta);previous=intent.facing;
  self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
  if(intent.shoot){first??=now;shots++;}
 }
 return{first,shots,maxTurnDegrees:maxTurn*180/Math.PI};
}
it.each(['attention','combined'] as const)('%s charges for an off-screen flank and preserves established front pressure',experiment=>{
 const baselineFront=acquisition('baseline',false),baselineRear=acquisition('baseline',true),front=acquisition(experiment,false),rear=acquisition(experiment,true);
 expect(front.first).toBe(baselineFront.first);expect(front.shots).toBe(baselineFront.shots);
 expect(rear.first!).toBeGreaterThan(front.first!+200);expect(rear.shots).toBeGreaterThanOrEqual(baselineRear.shots-3);expect(rear.maxTurnDegrees).toBeLessThan(6.4);
 const attention=new BotAttention();attention.turn(0,Math.PI,0);attention.turn(20,Math.PI,0);attention.reset();expect(attention.turn(1000,0,0)).toBe(0);
 report[experiment]={baselineFront,baselineRear,front,rear};
});

it.each(ASSIGNMENT_IDS)('combined behavior keeps %s case priorities above combat commitment',mode=>{
 const self=player('self'),target=player('enemy',0,30),sim=new ChaosSimulation(new Map([self,target].map(p=>[p.id,p])),()=>{});
 const state=sim.snapshot(false),a=createAssignment(mode,0,'combined-priority',()=>.3);a.phase='active';state.assignment=a;
 state.time=0;state.case.owner=null;state.case.returningUntil=100000;state.pickups=[];state.dispatch.phase='cooldown';
 const brain=new ObjectiveBotBrain(nav,0,()=>.5,'combined');brain.step(0,self,[target],state,()=>true,false,true);
 expect(brain.goalKey).toBe('combat:enemy');
 state.case.owner=self.id;state.case.returningUntil=0;
 brain.step(20,self,[target],state,()=>true,false,true);
 expect(brain.objective).toBe(mode==='jurisdiction'?'zone-hold':mode==='chain-of-custody'?'delivery':mode==='closing-time'?'evade':'combat');
 state.case.owner=target.id;brain.step(40,self,[target],state,()=>true,false,true);expect(brain.objective).toBe('carrier');
 target.hp=0;state.case.owner=null;state.case.p={x:8,y:0,z:0};brain.step(60,self,[target],state,()=>true,false,true);expect(brain.objective).toBe('case');
});
it('combined carrier repositions while turning, fights, cancels body fire on armor and clears state on death',()=>{
 const a=createAssignment('jurisdiction',0,'combined-encounter',()=>.3);a.phase='active';
 const zone=a.jurisdiction!.order[a.jurisdiction!.index],post=JURISDICTION_ZONES[zone].posts[0];
 const self=player('self'),target=player('enemy');Object.assign(self,post);Object.assign(target,post,{z:post.z-8});
 const sim=new ChaosSimulation(new Map([self,target].map(p=>[p.id,p])),()=>{}),state=sim.snapshot(false);
 state.assignment=a;state.time=0;state.case.owner=self.id;state.pickups=[];state.dispatch.phase='cooldown';
 const brain=new ObjectiveBotBrain(nav,0,()=>.5,'combined');let shots=0,movingWhileTurning=false;
 for(let now=0;now<1600;now+=20){
  state.time=now;const intent=brain.step(now,self,[target],state,()=>true,false,true);
  if(now<200&&Math.hypot(intent.x,intent.z)>.1&&!intent.shoot)movingWhileTurning=true;
  if(intent.shoot)shots++;
  self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
  expect(brain.objective).toBe('zone-hold');expect(zoneContains(zone,{x:self.x+intent.x*.35,y:self.y,z:self.z+intent.z*.35})).toBe(true);
 }
 expect(movingWhileTurning).toBe(true);expect(shots).toBeGreaterThan(0);
 state.buffs={[target.id]:{ironcladUntil:15000}};
 for(let now=1600;now<2000;now+=20){state.time=now;expect(brain.step(now,self,[target],state,()=>true,false,true).shoot).toBeUndefined();}
 self.hp=0;const dead=brain.step(2000,self,[target],state,()=>true,false,true);expect(dead).toMatchObject({x:0,z:0,jump:false});expect(dead.shoot).toBeUndefined();
 brain.reset();self.hp=3;state.buffs={};state.case.owner=null;state.case.p={x:self.x+3,y:self.y,z:self.z};state.case.returningUntil=0;
 const fresh=brain.step(2020,self,[target],state,()=>true,false,true);expect(brain.objective).toBe('case');expect(fresh.shoot).toBeUndefined();
});
