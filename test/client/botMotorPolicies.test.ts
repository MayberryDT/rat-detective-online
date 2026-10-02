import {expect,it} from 'vitest';
import {RatBot} from '../../src/shared/bots/ratBot';
import {BotMotor,type MotorNavigation} from '../../src/shared/bots/motor';
import {FLASHLIGHT_REACH} from '../../src/shared/rat/ratBody';
import {BotZoneHold} from '../../src/shared/bots/motor/zoneHold';
import {seededRandom} from '../../src/shared/bots/random';
import {BotNavigation} from '../../src/shared/BotNavigation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {createAssignment,ASSIGNMENT_IDS} from '../../src/shared/assignments';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {JURISDICTION_ZONE_IDS,JURISDICTION_ZONES,zoneContains} from '../../src/shared/jurisdictionZones';
import {worldIntent} from './botControls';
const nav:MotorNavigation={route:(_f,to)=>[to],localStep:(_f,to)=>to,explorationTargets:()=>[{x:50,y:0,z:50}]};
const player=(id:string,x=0,z=0)=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
it.each(ASSIGNMENT_IDS)('keeps a fight through distance ties while preserving better targets and immediate case priority in %s',mode=>{
 const self=player('self'),a=player('a',0,30),b=player('b',30.2,0),sim=new ChaosSimulation(new Map([self,a,b].map(p=>[p.id,p])),()=>{});
 const state=sim.snapshot(false),assignment=createAssignment(mode,0,'test',()=>.3);assignment.phase='active';state.assignment=assignment;
 state.time=0;state.case.owner=null;state.case.returningUntil=100000;state.pickups=[];state.dispatch.phase='cooldown';
 const brain=new RatBot(nav,0,()=>.5),keys:string[]=[];
 for(let i=0;i<10;i++){a.z=i%2?30.2:30;b.x=i%2?30:30.2;brain.step(i*300,self,[a,b],state,()=>true,false,true);keys.push(brain.goalKey);}
 expect(keys.slice(1).filter((k,i)=>k!==keys[i])).toEqual([]);
 b.x=12;brain.step(3300,self,[a,b],state,()=>true,false,true);expect(brain.goalKey).toBe('combat:b');
 state.case.returningUntil=0;state.case.p={x:8,y:0,z:0};brain.step(3310,self,[a,b],state,()=>true,false,true);expect(brain.objective).toBe('case');
});
it('settles quietly on a supported post inside all six zones with bounded local work',()=>{
 const realNav=new BotNavigation({seed:341283204,version:2});
 for(const id of JURISDICTION_ZONE_IDS)for(const seed of [0,1,5]){
  const hold=new BotZoneHold(seed,seededRandom(seed)),zone=JURISDICTION_ZONES[id],move={x:0,z:0};
  const self={...zone.posts[0],y:zone.floorY};self.x+=.8;let calls=0,lateTravel=0;
  const local:MotorNavigation={...nav,localStep:(from,to)=>{calls++;return realNav.localStep(from,to);}};
  for(let t=0;t<20000;t+=50){
   hold.hold(t,id,'round',self,local,move);
   if(t>=15000)lateTravel+=Math.hypot(move.x,move.z)*.05;
   self.x+=move.x*.05;self.z+=move.z*.05;
   expect(zoneContains(id,self),`${id} ${seed}`).toBe(true);
  }
  expect(calls).toBeLessThan(1000);expect(lateTravel).toBeLessThan(.2);
 }
},20000);
function acquisition(behind:boolean){
 const self=player('self'),target=player('enemy',0,behind?-20:20),brain=new RatBot(nav,0,()=>.5);
 let first:number|undefined,maxTurn=0,previous=0;
 for(let now=0;now<5000;now+=20){
  const intent=worldIntent(brain.step(now,self,[target],undefined,()=>true,false,true),self);
  const delta=Math.abs(Math.atan2(Math.sin(intent.facing-previous),Math.cos(intent.facing-previous)));maxTurn=Math.max(maxTurn,delta);previous=intent.facing;
  self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
  if(intent.shoot)first??=now;
 }
 return{first,maxTurnDegrees:maxTurn*180/Math.PI};
}
it('notices an off-screen flank later than a rival in front',()=>{
 const front=acquisition(false),rear=acquisition(true);
 expect(front.first).toBeDefined();
 expect(rear.first!).toBeGreaterThan(front.first!+200);
});

it.each(ASSIGNMENT_IDS)('keeps %s case priorities above combat commitment',mode=>{
 const self=player('self'),target=player('enemy',0,30),sim=new ChaosSimulation(new Map([self,target].map(p=>[p.id,p])),()=>{});
 const state=sim.snapshot(false),a=createAssignment(mode,0,'combined-priority',()=>.3);a.phase='active';state.assignment=a;
 state.time=0;state.case.owner=null;state.case.returningUntil=100000;state.pickups=[];state.dispatch.phase='cooldown';
 const brain=new RatBot(nav,0,()=>.5);brain.step(0,self,[target],state,()=>true,false,true);
 expect(brain.goalKey).toBe('combat:enemy');
 state.case.owner=self.id;state.case.returningUntil=0;
 brain.step(20,self,[target],state,()=>true,false,true);
 expect(brain.objective).toBe(mode==='jurisdiction'?'zone-hold':mode==='chain-of-custody'?'delivery':'combat');
 state.case.owner=target.id;brain.step(40,self,[target],state,()=>true,false,true);expect(brain.objective).toBe('carrier');
 target.hp=0;state.case.owner=null;state.case.p={x:8,y:0,z:0};brain.step(60,self,[target],state,()=>true,false,true);expect(brain.objective).toBe('case');
});
it('a carrier repositions while turning, fights, cancels body fire on armor and clears state on death',()=>{
 const a=createAssignment('jurisdiction',0,'combined-encounter',()=>.3);a.phase='active';
 const zone=a.jurisdiction!.order[a.jurisdiction!.index],post=JURISDICTION_ZONES[zone].posts[0];
 const self=player('self'),target=player('enemy');Object.assign(self,post);Object.assign(target,post,{z:post.z-8});
 const sim=new ChaosSimulation(new Map([self,target].map(p=>[p.id,p])),()=>{}),state=sim.snapshot(false);
 state.assignment=a;state.time=0;state.case.owner=self.id;state.pickups=[];state.dispatch.phase='cooldown';
 const brain=new RatBot(nav,0,()=>.5);let shots=0,movingWhileTurning=false;
 for(let now=0;now<1600;now+=20){
  state.time=now;const intent=worldIntent(brain.step(now,self,[target],state,()=>true,false,true),self);
  if(now<200&&Math.hypot(intent.x,intent.z)>.1&&!intent.shoot)movingWhileTurning=true;
  if(intent.shoot)shots++;
  self.meshQy=Math.sin(intent.facing/2);self.meshQw=Math.cos(intent.facing/2);
  expect(brain.objective).toBe('zone-hold');expect(zoneContains(zone,{x:self.x+intent.x*.35,y:self.y,z:self.z+intent.z*.35})).toBe(true);
 }
 expect(movingWhileTurning).toBe(true);expect(shots).toBeGreaterThan(0);
 state.buffs={[target.id]:{ironcladUntil:15000}};
 for(let now=1600;now<2000;now+=20){state.time=now;expect(brain.step(now,self,[target],state,()=>true,false,true).fire).toBeUndefined();}
 self.hp=0;const dead=worldIntent(brain.step(2000,self,[target],state,()=>true,false,true),self);expect(dead).toMatchObject({x:0,z:0,jump:false});expect(dead.shoot).toBeUndefined();
 brain.reset();self.hp=3;state.buffs={};state.case.owner=null;state.case.p={x:self.x+3,y:self.y,z:self.z};state.case.returningUntil=0;
 const fresh=brain.step(2020,self,[target],state,()=>true,false,true);expect(brain.objective).toBe('case');expect(fresh.fire).toBeUndefined();
});
it('sees rats only within flashlight reach in a Blackout, and as far as ever otherwise',()=>{
 const self=player('self'),near=player('near',0,FLASHLIGHT_REACH-5),far=player('far',FLASHLIGHT_REACH+15,0);
 const state=new ChaosSimulation(new Map([self,near,far].map(p=>[p.id,p])),()=>{}).snapshot(false),motor=new BotMotor(nav,0,()=>.5);
 const seen=()=>{motor.perceive(0,self,[near,far],state,()=>true,()=>true,true);return motor.visibleRats.map(p=>p.id);};
 state.dispatch={phase:'active',started:0,until:25000,serial:1,incident:'blackout'};
 expect(seen()).toEqual(['near']);
 state.dispatch={phase:'cooldown',started:25000,until:40000,serial:1,incident:'blackout'};
 expect(seen()).toEqual(['near','far']);
});
