import {describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,INCIDENT_TUNING as I,type ChaosState} from '../../src/shared/chaosState';
import {BALL_SPEED,BALL_LIFETIME,BALL_RADIUS} from '../../src/shared/ballTuning';
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
function wall(sim:ChaosSimulation,z:number){
 const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(8,8,.05)),position:new C.Vec3(0,200,z)});
 sim.world.addBody(body);sim.targets.set(body,{kind:'world'});
}
describe('projectile-only replacement incidents',()=>{
 it('fires five owned, normal-speed balls in a horizontal fan with no player launch and bounded capacity',()=>{
  const {sim}=fixture('scattershot');shoot(sim);let s=sim.snapshot(false);
  expect(s.shots).toHaveLength(5);expect(s.pressure!.launches).toEqual([]);
  expect(new Set(s.shots.map(p=>p.v.x)).size).toBe(5);
  for(const ball of s.shots){expect(ball.owner).toBe('a');expect(ball.v.y).toBe(0);expect(Math.hypot(ball.v.x,ball.v.y,ball.v.z)).toBeCloseTo(BALL_SPEED);}
  for(let i=0;i<60;i++)shoot(sim,`shot-${i}`);s=sim.snapshot(false);
  expect(s.shots).toHaveLength(T.maxShots);expect(s.shots.slice(-5).some(b=>b.id==='shot-59')).toBe(true);
 });
 it('sticks a ball once on its first wall, then releases along the reflected path',()=>{
  vi.spyOn(Math,'random').mockReturnValue(0);
  const {sim,players,now}=fixture('delayed-reaction');wall(sim,2);shoot(sim);
  sim.step(.02,now+20);let ball=sim.snapshot(false).shots[0];
  expect(ball.delayed).toBe(true);expect(ball.stuckUntil).toBeGreaterThan(now);
  expect(ball.v.z).toBeLessThan(0);const held=ball.p.z;
  sim.step(.2,now+220);expect(sim.snapshot(false).shots[0].p.z).toBeCloseTo(held,3);
  sim.step(.55,now+770);ball=sim.snapshot(false).shots[0];
  expect(ball.stuckUntil).toBeUndefined();expect(ball.v.z).toBeLessThan(0);expect(ball.p.z).toBeLessThan(held);
  wall(sim,ball.p.z-1);sim.step(.02,now+790);ball=sim.snapshot(false).shots[0];
  expect(ball.v.z).toBeGreaterThan(0);expect(ball.stuckUntil).toBeUndefined();
  expect(parseServerMessage({type:'chaos',state:sim.snapshot(false)})).not.toBeNull();
  const restored=new ChaosSimulation(players,()=>{},sim.snapshot(false));
  expect(restored.snapshot(false).shots[0].delayed).toBe(true);
 });
 it('requires nine actual wall bounces before maximum Big Cheese size',()=>{
  const {sim,now}=fixture('big-cheese');
  for(const z of [-5,5]){
   const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(8,100,.05)),position:new C.Vec3(0,200,z)});
   sim.world.addBody(body);sim.targets.set(body,{kind:'world'});
  }
  shoot(sim);const sizes=[BALL_RADIUS];
  for(let i=1;i<=600;i++){
   sim.step(1/240,now+i*1000/240);const shot=sim.snapshot(false).shots[0];if(!shot)break;
   const size=shot.radius??BALL_RADIUS;if(size!==sizes.at(-1))sizes.push(size);
   if(size===2.4)break;
  }
  expect(sizes).toEqual([...I.cheeseRadii]);expect(sizes).toHaveLength(10);
 });
 it('grows collision and render size together before the ball expires',()=>{
  const {sim,now}=fixture('big-cheese');wall(sim,2);shoot(sim);
  expect(sim.snapshot(false).shots[0].radius).toBeUndefined();
  sim.step(.02,now+20);expect(sim.snapshot(false).shots[0].radius).toBe(I.cheeseRadii[1]);
  wall(sim,-2);sim.step(.04,now+60);expect(sim.snapshot(false).shots[0].radius).toBe(I.cheeseRadii[2]);
  wall(sim,2);sim.step(.04,now+100);expect(sim.snapshot(false).shots[0].radius).toBe(I.cheeseRadii[3]);
  expect(sim.snapshot(false).shots[0].age).toBeLessThan(BALL_LIFETIME-1);
  sim.step(0,now+T.activeMs);expect(sim.snapshot(false).shots[0].radius??BALL_RADIUS).toBeCloseTo(BALL_RADIUS);
 });
 it.each(['scattershot','delayed-reaction','big-cheese'] as const)('%s stops modifying new projectiles when its window ends',incident=>{
  const {sim,now}=fixture(incident);sim.step(0,now+T.activeMs);shoot(sim);sim.step(.81,now+T.activeMs+810);
  const s=sim.snapshot(false);expect(s.shots).toHaveLength(1);expect(s.shots[0].v.z).toBe(BALL_SPEED);expect(s.shots[0].delayed).toBeUndefined();expect(s.pressure!.launches).toEqual([]);
 });
 it('migrates old Kickback snapshots to Scattershot and maps Return/Cheesequake onto the new roster',()=>{
  const {sim,players}=fixture('scattershot');const state=sim.snapshot(false);
  const legacy={...state,dispatch:{...state.dispatch,incident:'kickback'}} as unknown as ChaosState;
  const parsed=parseServerMessage({type:'chaos',state:legacy});expect(parsed).toMatchObject({state:{dispatch:{incident:'scattershot'}}});
  const restored=new ChaosSimulation(players,()=>{},legacy);shoot(restored);
  expect(restored.snapshot(false).shots).toHaveLength(5);expect(restored.snapshot(false).pressure!.launches).toHaveLength(0);
  expect(incidentInfo('kickback').id).toBe('scattershot');expect(INCIDENTS.some(i=>(i.id as string)==='kickback')).toBe(false);
  expect(incidentInfo('return-to-sender').id).toBe('delayed-reaction');
  expect(incidentInfo('cheesequake').id).toBe('big-cheese');
  expect(INCIDENTS.some(i=>['return-to-sender','cheesequake'].includes(i.id))).toBe(false);
 });
});
