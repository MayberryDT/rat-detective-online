import {describe,it,expect} from 'vitest';
import {ObjectiveBotBrain,type ObjectiveNavigation} from '../../src/shared/ObjectiveBotBrain';
import {exposedCarrierCase,shotHitsIronclad} from '../../src/shared/BotTargeting';
import {BotCombat} from '../../src/shared/BotCombat';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {ASSIGNMENT_IDS,createAssignment} from '../../src/shared/assignments';
import type {ChaosState} from '../../src/shared/chaosState';
const player=(id:string,x=0,z=0)=>createPlayer(id,id,DEFAULT_APPEARANCE,{x,y:0,z});
function fixture(){
 const self=player('me'),silver=player('silver',0,8),enemy=player('enemy',12,0);
 const s:ChaosState={time:1000,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:40,y:0,z:0},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'cooldown',started:0,until:99999,serial:0},possession:{},corpses:[],shots:[],impacts:[],notice:{serial:0,text:''},buffs:{silver:{ironcladUntil:20000}}};
 const navigation:ObjectiveNavigation={route:(_from,to)=>[{...to}],explorationTargets:()=>[{x:40,y:0,z:40}],localStep:(_from,to)=>to};
 const brain=new ObjectiveBotBrain(navigation,0,()=>.5);
 return {self,silver,enemy,s,brain};
}
describe('Ironclad-aware bots',()=>{
 it.each(ASSIGNMENT_IDS)('keeps pursuing the objective without shooting an armored bystander in %s',id=>{
  const {self,silver,s,brain}=fixture();s.assignment=createAssignment(id,0);s.assignment.phase='active';
  for(let t=1000;t<6000;t+=20){s.time=t;expect(brain.step(t,self,[silver],s,()=>true,false,true).shoot).toBeUndefined();expect(brain.objective).toBe('case');}
 });
 it('shoots a vulnerable opponent while ignoring the nearer silver coat',()=>{
  const {self,silver,enemy,s,brain}=fixture();let shots=0;
  for(let t=1000;t<4000;t+=20){s.time=t;const shot=brain.step(t,self,[silver,enemy],s,()=>true,false,true).shoot;if(shot){shots++;expect(shot.x).toBeGreaterThan(10);expect(Math.abs(shot.z)).toBeLessThan(2);}}
  expect(shots).toBeGreaterThan(2);
 });
 it('cancels an existing burst immediately on armor activation, then reacquires after expiry',()=>{
  const {self,silver,s,brain}=fixture();s.buffs={};let shots=0;
  for(let t=1000;t<=1500;t+=20){s.time=t;if(brain.step(t,self,[silver],s,()=>true,false,true).shoot)shots++;}
  expect(shots).toBeGreaterThan(0);s.buffs={silver:{ironcladUntil:3000}};
  for(let t=1520;t<3000;t+=20){s.time=t;expect(brain.step(t,self,[silver],s,()=>true,false,true).shoot).toBeUndefined();}
  shots=0;for(let t=3000;t<4500;t+=20){s.time=t;if(brain.step(t,self,[silver],s,()=>true,false,true).shoot)shots++;}
  expect(shots).toBeGreaterThan(0);
 });
 it('follows a protected carrier but backs away at close range',()=>{
  const {self,silver,s,brain}=fixture();s.case.owner=silver.id;s.case.p={x:0,y:.52,z:8.74};
  const intent=brain.step(1000,self,[silver],s,()=>true,false,true);
  expect(brain.objective).toBe('carrier');expect(intent.z).toBeLessThan(0);expect(intent.shoot).toBeUndefined();
 });
 it('only considers a nearby, visible case on the exposed side of its carrier',()=>{
  const {self,silver,s}=fixture();s.case.owner=silver.id;s.case.p={x:0,y:.52,z:7.26};
  expect(exposedCarrierCase(self,silver,s,()=>true)).toEqual(s.case.p);
  expect(exposedCarrierCase(self,silver,s,()=>false)).toBeUndefined();
  expect(exposedCarrierCase({...self,z:30},silver,s,()=>true)).toBeUndefined();
  s.case.p.z=8.74;expect(exposedCarrierCase(self,silver,s,()=>true)).toBeUndefined();
 });
 it('aims at the exposed case instead of the body, with ordinary reaction and aim error',()=>{
  const {self,silver,s}=fixture(),combat=new BotCombat(()=>.5);s.case.p={x:0,y:.52,z:7.26};
  expect(combat.step(1000,self,silver,true,true,s.case.p).shoot).toBeUndefined();
  const shot=combat.step(1400,self,silver,true,true,s.case.p).shoot!;
  expect(shot).toBeDefined();expect(shot.y).toBeCloseTo(.52);expect(Math.abs(shot.x)).toBeGreaterThan(.1);
  expect(combat.step(1420,self,silver,true).shoot).toBeUndefined();
 });
 it('vetoes a direct body hit or a shield blocking another enemy, but permits a case hit first',()=>{
  const {self,silver,s}=fixture();
  expect(shotHitsIronclad(self,0,{x:0,y:.9,z:8},[silver],s)).toBe(true);
  expect(shotHitsIronclad(self,0,{x:0,y:.9,z:16},[silver],s)).toBe(true);
  s.case.owner=silver.id;s.case.p={x:0,y:.52,z:7.26};
  expect(shotHitsIronclad(self,0,s.case.p,[silver],s)).toBe(false);
  s.case.p.z=8.74;expect(shotHitsIronclad(self,0,s.case.p,[silver],s)).toBe(true);
  s.time=20000;expect(shotHitsIronclad(self,0,{x:0,y:.9,z:8},[silver],s)).toBe(false);
 });
});
