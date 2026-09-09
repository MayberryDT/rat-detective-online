import {describe,it,expect,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,type ChaosState} from '../../src/shared/chaosState';
import {BALL_SPEED,BALL_LIFETIME} from '../../src/shared/ballTuning';
import {INCIDENTS,incidentInfo,type IncidentId} from '../../src/shared/incidentCatalog';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(incident:IncidentId){
 const now=Date.now(),p=createPlayer('a','A',appearance,{x:0,y:0,z:0}),players=new Map([[p.id,p]]);
 const initial=new ChaosSimulation(players,()=>{});initial.step(0,now);const state=initial.snapshot(false);
 state.dispatch={phase:'active',incident,started:now,until:now+T.activeMs,serial:1};
 const sim=new ChaosSimulation(players,()=>{},state);return {sim,players,now};
}
function shoot(sim:ChaosSimulation,id='shot'){sim.shoot('a',{shotId:id,origin:{x:0,y:200,z:0},direction:{x:0,y:0,z:1}});}
describe('projectile-only replacement incidents',()=>{
 it('fires five owned, normal-speed balls in a horizontal fan with no player launch and bounded capacity',()=>{
  const {sim}=fixture('scattershot');shoot(sim);let s=sim.snapshot(false);
  expect(s.shots).toHaveLength(5);expect(s.pressure!.launches).toEqual([]);
  expect(new Set(s.shots.map(p=>p.v.x)).size).toBe(5);
  for(const ball of s.shots){expect(ball.owner).toBe('a');expect(ball.v.y).toBe(0);expect(Math.hypot(ball.v.x,ball.v.y,ball.v.z)).toBeCloseTo(BALL_SPEED);}
  for(let i=0;i<60;i++)shoot(sim,`shot-${i}`);s=sim.snapshot(false);
  expect(s.shots).toHaveLength(T.maxShots);expect(s.shots.slice(-5).some(b=>b.id==='shot-59')).toBe(true);
 });
 it('reverses a ball exactly once after .8 seconds, including across snapshot restore',()=>{
  const {sim,players,now}=fixture('return-to-sender');shoot(sim);
  sim.step(.79,now+790);let ball=sim.snapshot(false).shots[0];expect(ball.v.z).toBe(BALL_SPEED);expect(ball.returned).toBeUndefined();
  sim.step(.02,now+810);const state=sim.snapshot(false);ball=state.shots[0];
  expect(ball.returned).toBe(true);expect(ball.v.z).toBe(-BALL_SPEED);expect(ball.v.y).toBeGreaterThan(0);expect(ball.owner).toBe('a');expect(ball.age).toBeCloseTo(.81);
  expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
  const restored=new ChaosSimulation(players,()=>{},state);restored.step(.1,now+910);
  expect(restored.snapshot(false).shots[0].v.z).toBe(-BALL_SPEED);
  restored.step(BALL_LIFETIME,now+7000);expect(restored.snapshot(false).shots).toHaveLength(0);
 });
 it('hops existing cheese every three seconds without multiplying shots or replaying pulses after restore',()=>{
  const {sim,players,now}=fixture('cheesequake');shoot(sim);
  sim.step(0,now+2999);expect(sim.snapshot(false).shots[0].v.y).toBe(0);
  sim.step(0,now+3000);let s=sim.snapshot(false);expect(s.shots).toHaveLength(1);expect(s.shots[0].v).toEqual({x:0,y:24,z:BALL_SPEED});
  const restored=new ChaosSimulation(players,()=>{},s);restored.step(0,now+3001);expect(restored.snapshot(false).shots[0].v.y).toBe(24);
  restored.step(0,now+6000);s=restored.snapshot(false);expect(s.shots[0].v.y).toBe(45);expect(s.pressure!.launches).toEqual([]);
  restored.step(0,now+15000);expect(restored.snapshot(false).shots).toHaveLength(1);expect(restored.snapshot(false).shots[0].v.y).toBe(45);
 });
 it.each(['scattershot','return-to-sender','cheesequake'] as const)('%s stops modifying new projectiles when its window ends',incident=>{
  const {sim,now}=fixture(incident);sim.step(0,now+T.activeMs);shoot(sim);sim.step(.81,now+T.activeMs+810);
  const s=sim.snapshot(false);expect(s.shots).toHaveLength(1);expect(s.shots[0].v.z).toBe(BALL_SPEED);expect(s.shots[0].returned).toBeUndefined();expect(s.pressure!.launches).toEqual([]);
 });
 it('migrates old Kickback snapshots to Scattershot and never queues the removed shooter impulse',()=>{
  const {sim,players}=fixture('scattershot');const state=sim.snapshot(false);
  const legacy={...state,dispatch:{...state.dispatch,incident:'kickback'}} as unknown as ChaosState;
  const parsed=parseServerMessage({type:'chaos',state:legacy});expect(parsed).toMatchObject({state:{dispatch:{incident:'scattershot'}}});
  const restored=new ChaosSimulation(players,()=>{},legacy);shoot(restored);
  expect(restored.snapshot(false).shots).toHaveLength(5);expect(restored.snapshot(false).pressure!.launches).toHaveLength(0);
  expect(incidentInfo('kickback').id).toBe('scattershot');expect(INCIDENTS.some(i=>(i.id as string)==='kickback')).toBe(false);
 });
});
