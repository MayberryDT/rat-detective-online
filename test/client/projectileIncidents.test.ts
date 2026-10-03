import {describe,it,expect,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,type ChaosState} from '../../src/shared/chaosState';
import {BALL_SPEED} from '../../src/shared/ballTuning';
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
 it('Scattershot stops modifying new projectiles when its window ends',()=>{
  const {sim,now}=fixture('scattershot');sim.step(0,now+T.activeMs);shoot(sim);sim.step(.81,now+T.activeMs+810);
  const s=sim.snapshot(false);expect(s.shots).toHaveLength(1);expect(s.shots[0].v.z).toBe(BALL_SPEED);expect(s.pressure!.launches).toEqual([]);
 });
 it('migrates old Kickback snapshots to Scattershot and maps Return/Cheesequake onto the new roster',()=>{
  const {sim,players}=fixture('scattershot');const state=sim.snapshot(false);
  const legacy={...state,dispatch:{...state.dispatch,incident:'kickback'}} as unknown as ChaosState;
  const parsed=parseServerMessage({type:'chaos',state:legacy});expect(parsed).toMatchObject({state:{dispatch:{incident:'scattershot'}}});
  const restored=new ChaosSimulation(players,()=>{},legacy);shoot(restored);
  expect(restored.snapshot(false).shots).toHaveLength(5);expect(restored.snapshot(false).pressure!.launches).toHaveLength(0);
  expect(incidentInfo('kickback').id).toBe('scattershot');expect(INCIDENTS.some(i=>(i.id as string)==='kickback')).toBe(false);
  expect(incidentInfo('return-to-sender').id).toBe('crossfire');expect(incidentInfo('delayed-reaction').id).toBe('crossfire');
  expect(incidentInfo('cheesequake').id).toBe('crossfire');
  expect(INCIDENTS.some(i=>['return-to-sender','cheesequake'].includes(i.id))).toBe(false);
 });
});
