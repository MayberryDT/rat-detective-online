import {describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,INCIDENT_TUNING as I,type ChaosState} from '../../src/shared/chaosState';
import {BALL_SPEED,BALL_LIFETIME,BALL_RADIUS} from '../../src/shared/ballTuning';
import {INCIDENTS,incidentInfo,type IncidentId} from '../../src/shared/incidentCatalog';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {ChaosDecoder,ChaosEncoder} from '../../src/shared/chaosWire';
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
/** Two tall facing walls 10 units apart across the shot's path. */
function corridor(sim:ChaosSimulation){
 for(const z of [-5,5]){
  const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(8,100,.05)),position:new C.Vec3(0,200,z)});
  sim.world.addBody(body);sim.targets.set(body,{kind:'world'});
 }
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
 it('launches Big Cheese slow at start size, then grows a step per real wall bounce to the largest',()=>{
  const {sim,now}=fixture('big-cheese');corridor(sim);
  shoot(sim);expect(sim.snapshot(false).shots[0].v.z).toBe(I.cheeseShotSpeed);
  const sizes:number[]=[];
  for(let i=1;i<=720;i++){
   sim.step(1/240,now+i*1000/240);const shot=sim.snapshot(false).shots[0];if(!shot)break;
   if(shot.age<I.cheeseGrowIn)continue;
   const size=shot.radius??BALL_RADIUS;if(size!==sizes.at(-1))sizes.push(size);
   if(size===2.4)break;
  }
  expect(sizes).toEqual(I.cheeseRadii.slice(I.cheeseRadii.indexOf(I.cheeseStartRadius)));
  sim.step(0,now+T.activeMs);expect(sim.snapshot(false).shots[0].radius??BALL_RADIUS).toBeCloseTo(BALL_RADIUS);
 });
 it('keeps a bouncing Big Cheese ball alive past the ordinary lifetime, within the cap, and on the wire',()=>{
  const {sim,now}=fixture('big-cheese');corridor(sim);shoot(sim);
  let last=0,life=BALL_LIFETIME;
  for(let i=1;i<=480;i++){
   sim.step(1/60,now+i*1000/60);const shot=sim.snapshot(false).shots[0];if(!shot)break;
   last=shot.age;life=shot.life??BALL_LIFETIME;
   if(i===120){
    const decoded=new ChaosDecoder().read(new ChaosEncoder().encode(sim.snapshot(false)).payload)?.message;
    expect(decoded?.type==='chaos'&&decoded.state.shots[0].life).toBe(shot.life);
   }
  }
  expect(life).toBeGreaterThan(BALL_LIFETIME);expect(life).toBeLessThanOrEqual(I.cheeseMaxLife);
  expect(last).toBeGreaterThan(BALL_LIFETIME);expect(last).toBeCloseTo(life,1);
 });
 it('rolls a heavy ball along the floor without counting every contact as a bounce',()=>{
  const {sim,players,now}=fixture('big-cheese');
  const state=sim.snapshot(false);
  state.shots=[{id:'rolling',owner:'a',age:.2,p:{x:0,y:100+1.24+.01,z:0},v:{x:20,y:0,z:0},radius:1.24}];
  const rolling=new ChaosSimulation(players,()=>{},state);
  const floor=new C.Body({mass:0,shape:new C.Box(new C.Vec3(100,.5,100)),position:new C.Vec3(0,99.5,0)});
  rolling.world.addBody(floor);rolling.targets.set(floor,{kind:'world'});
  for(let i=1;i<=60;i++){rolling.step(1/60,now+i*1000/60);expect(rolling.snapshot().impacts.filter(hit=>hit.p.y>90)).toEqual([]);}
  const ball=rolling.snapshot(false).shots[0];
  expect(ball.radius).toBe(1.24);expect(ball.life).toBeUndefined();
  expect(ball.p.y).toBeCloseTo(100+1.24,1);expect(ball.p.x).toBeGreaterThan(15);
 });
 it.each(['scattershot','big-cheese'] as const)('%s stops modifying new projectiles when its window ends',incident=>{
  const {sim,now}=fixture(incident);sim.step(0,now+T.activeMs);shoot(sim);sim.step(.81,now+T.activeMs+810);
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
  expect(incidentInfo('cheesequake').id).toBe('big-cheese');
  expect(INCIDENTS.some(i=>['return-to-sender','cheesequake'].includes(i.id))).toBe(false);
 });
});
