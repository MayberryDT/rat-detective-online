import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from 'cannon-es';
import { ChaosSimulation, type ChaosHit } from '../../src/shared/ChaosSimulation';
import { CHAOS_TUNING as T, DISPATCH_BOX, DISPATCH_TARGET } from '../../src/shared/chaosState';
import { BALL_SPEED, BALL_GRAVITY, BALL_RESTITUTION, BALL_LIFETIME } from '../../src/shared/ballTuning';
import { ChaosEncoder, ChaosDecoder } from '../../src/shared/chaosWire';
import { createPlayer, applyHit } from '../../src/worker/gameState';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(){
 const shooter=createPlayer('shooter','Shooter',appearance,{x:-50,y:20,z:0});
 const victim=createPlayer('victim','Victim',appearance,{x:0,y:20,z:0});
 const other=createPlayer('other','Other',appearance,{x:30,y:20,z:0});
 const players=new Map([shooter,victim,other].map(p=>[p.id,p]));const hits:ChaosHit[]=[];
 const sim=new ChaosSimulation(players,hit=>hits.push(hit));sim.step(0,1000);
 return {sim,players,shooter,victim,other,hits};
}
function activate(sim:ChaosSimulation){
 sim.shoot('shooter',{shotId:'dispatch',origin:{x:DISPATCH_TARGET.x,y:DISPATCH_TARGET.y,z:DISPATCH_TARGET.z+1},direction:{x:0,y:0,z:-1}});
 sim.step(.01,1010);sim.step(0,1010+T.rollMs);
}
function corpseBody(sim:ChaosSimulation){return [...sim.targets].find(([,t])=>t.kind==='corpse')![0];}

describe('shared physical death chaos',()=>{
 it('watchdog returns loose evidence but refuses to remove it from a human carrier',()=>{
  const {sim,shooter}=fixture();
  Object.assign(shooter,{x:sim.caseBody.position.x,y:sim.caseBody.position.y-.8,z:sim.caseBody.position.z});
  sim.step(0,1100);expect(sim.caseHolderId).toBe(shooter.id);
  expect(sim.recoverLooseCase()).toBe(false);expect(sim.caseHolderId).toBe(shooter.id);
  sim.release(shooter.id);shooter.x=-150;shooter.z=-150;
  expect(sim.recoverLooseCase()).toBe(true);expect(sim.recoverLooseCase()).toBe(false);
  sim.step(0,1100+T.recoverMs+1);expect(sim.snapshot(false).case.returningUntil).toBe(0);
  expect(sim.caseBody.position.y).toBeLessThan(2);
 });
 beforeEach(()=>{vi.spyOn(Math,'random').mockReturnValue(0);});
 afterEach(()=>vi.restoreAllMocks());
 it('expires authoritative balls after 2.5 seconds, including saved older shots',()=>{
  const {sim,players}=fixture();
  const origin={x:0,y:100,z:0};
  sim.shoot('shooter',{shotId:'lifetime',origin,direction:{x:1,y:0,z:0}});
  expect(sim.snapshot(false).shots[0].p).toEqual(origin);
  sim.step(2.49,3490);expect(sim.snapshot(false).shots).toHaveLength(1);
  const saved=sim.snapshot(false);saved.shots.push({...saved.shots[0],id:'old-five-second-ball',age:3});
  vi.spyOn(Date,'now').mockReturnValue(saved.time);
  const restored=new ChaosSimulation(players,()=>{},saved);
  expect(restored.snapshot(false).shots.map(shot=>shot.id)).toEqual(['lifetime']);
  restored.step(.02,3510);expect(restored.snapshot(false).shots).toHaveLength(0);
  sim.step(.02,3510);expect(sim.snapshot(false).shots).toHaveLength(0);
 });
 it('keeps firing immediately when an incident chain fills the projectile pool',()=>{
  const {sim,victim,shooter}=fixture();activate(sim);victim.hp=0;
  for(let i=0;i<3;i++)sim.death(victim,{x:1,y:0,z:0},shooter.id);
  const before=sim.snapshot(false);expect(before.shots).toHaveLength(T.maxShots);
  const oldestBurst=before.shots.find(s=>s.id!=='dispatch')!;
  sim.shoot(shooter.id,{shotId:'fresh-shot',origin:{x:0,y:10,z:0},direction:{x:1,y:0,z:0}});
  const after=sim.snapshot(false);
  expect(after.shots).toHaveLength(T.maxShots);
  expect(after.shots.some(s=>s.id==='dispatch')).toBe(true);
  expect(after.shots.some(s=>s.id===oldestBurst.id)).toBe(false);
  expect(after.shots.find(s=>s.id==='fresh-shot')).toMatchObject({age:0,p:{x:0,y:10,z:0},v:{x:BALL_SPEED,y:0,z:0}});
  sim.step(.01,1020+T.rollMs);
  expect(sim.snapshot(false).shots.find(s=>s.id==='fresh-shot')!.p.x).toBeCloseTo(BALL_SPEED*.01);
 });
 it('recycles the oldest ordinary shot at capacity but never evicts for an invalid shooter',()=>{
  const {sim,shooter,victim}=fixture();
  const shot=(id:string)=>({shotId:id,origin:{x:0,y:10,z:0},direction:{x:1,y:0,z:0}});
  for(let i=0;i<T.maxShots;i++)sim.shoot(shooter.id,shot(`shot-${i}`));
  victim.hp=0;sim.shoot(victim.id,shot('dead'));sim.shoot('missing',shot('missing'));
  expect(sim.snapshot(false).shots[0].id).toBe('shot-0');
  sim.shoot(shooter.id,shot('newest'));
  const state=sim.snapshot(false);expect(state.shots).toHaveLength(T.maxShots);
  expect(state.shots[0].id).toBe('shot-1');expect(state.shots.at(-1)!.id).toBe('newest');
 });
 it('resolves a visual hit against bounded pose history and reports the causal outcome',()=>{
  const {sim,shooter,victim,hits}=fixture();
  victim.x=0;victim.z=0;sim.step(0,1050);
  victim.z=3;sim.step(0,1100);
  sim.shoot(shooter.id,{shotId:'rewound',origin:{x:-10,y:21.3,z:0},direction:{x:1,y:0,z:0},viewAt:950});
  sim.step(.06,1160);
  expect(hits).toContainEqual(expect.objectContaining({victim:victim.id,shotId:'rewound',compensated:true}));
  expect(sim.drainShotEvents()).toContainEqual(expect.objectContaining({shotId:'rewound',ballId:'rewound',outcome:'rat-body',victimId:victim.id,compensated:true}));
 });
 it('creates ordinary missile corpses and bounds the incident cheese burst without changing ball tuning',()=>{
  const {sim,victim}=fixture();victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
  let state=sim.snapshot(false);expect(state.corpses).toHaveLength(1);
  expect(state.corpses[0].v.x).toBe(T.normalCorpseSpeed);
  expect(state.shots).toHaveLength(0);
  activate(sim);sim.death(victim,{x:1,y:0,z:0},'shooter');state=sim.snapshot(false);
  expect(state.shots.filter(s=>s.id!=='dispatch')).toHaveLength(T.deathBurstBalls);
  for(const shot of state.shots.filter(s=>s.id!=='dispatch'))expect(Math.hypot(shot.v.x,shot.v.y,shot.v.z)).toBeCloseTo(BALL_SPEED);
  for(let i=0;i<40;i++)sim.death(victim,{x:1,y:0,z:0},'shooter');
  state=sim.snapshot(false);expect(state.corpses).toHaveLength(T.maxCorpses);expect(state.shots).toHaveLength(T.maxShots);
  expect([BALL_SPEED,BALL_GRAVITY,BALL_RESTITUTION,BALL_LIFETIME]).toEqual([175,-25,.9,2.5]);
  sim.step(0,1010+T.rollMs+T.corpseMs+1);expect(sim.snapshot().corpses).toHaveLength(0);
 });
 it('only activates Dispatch from the small front target and boosts active launches to 95',()=>{
  const {sim,shooter,victim}=fixture();
  const shoot=(x:number,y:number,id:string)=>{
   sim.shoot(shooter.id,{shotId:id,origin:{x,y,z:DISPATCH_BOX.z+2},direction:{x:0,y:0,z:-1}});
   sim.step(.01,1020);
  };
  shoot(DISPATCH_BOX.x+.65,DISPATCH_TARGET.y,'cabinet');expect(sim.snapshot(false).dispatch.phase).toBe('ready');
  shoot(DISPATCH_TARGET.x,DISPATCH_TARGET.y,'button');expect(sim.snapshot(false).dispatch.phase).toBe('rolling');
  sim.step(0,1020+T.rollMs);victim.hp=0;sim.death(victim,{x:1,y:0,z:0},shooter.id);
  expect(sim.snapshot().corpses[0].v.x).toBe(95);
 });
 it('shoots a body back into motion and reflects the ball',()=>{
  const {sim,shooter,victim}=fixture();victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'other');
  const body=corpseBody(sim);body.velocity.setZero();body.angularVelocity.setZero();
  sim.shoot(shooter.id,{shotId:'body-shot',origin:{x:-2,y:body.position.y,z:0},direction:{x:1,y:0,z:0}});
  sim.step(.01,1010);const state=sim.snapshot();
  expect(body.velocity.x).toBeGreaterThan(18);expect(body.velocity.y).toBeGreaterThan(2);
  expect(state.shots.find(s=>s.id==='body-shot')!.v.x).toBeLessThan(0);
  expect(state.corpses[0].owner).toBe(shooter.id);
 });
 it('sweeps fast bodies across rats, respects shooter immunity, and limits repeat impact damage',()=>{
  const {sim,victim,other,shooter,hits}=fixture();victim.hp=0;other.x=1;
  sim.death(victim,{x:1,y:0,z:0},shooter.id);const body=corpseBody(sim);
  body.velocity.set(95,0,0);sim.step(1/60,1017);
  expect(hits.filter(h=>h.victim===other.id)).toHaveLength(1);
  expect(hits[0].damage).toBe(2);
  body.position.set(.5,20.95,0);body.velocity.set(95,0,0);sim.step(1/60,1034);
  expect(hits.filter(h=>h.victim===other.id)).toHaveLength(1);
  expect(hits.some(h=>h.victim===shooter.id||h.victim===victim.id)).toBe(false);
 });
 it('keeps environmental corpse collisions uncredited after snapshot restore',()=>{
  vi.spyOn(Date,'now').mockReturnValue(1000);
  const {sim,victim,other,players}=fixture();victim.hp=0;other.x=1;
  sim.death(victim,{x:1,y:0,z:0},null);corpseBody(sim).velocity.set(95,0,0);
  const saved=sim.snapshot(false),hits:ChaosHit[]=[];
  const restored=new ChaosSimulation(players,h=>hits.push(h),saved);
  restored.step(1/60,1017);
  expect(hits).toContainEqual(expect.objectContaining({victim:other.id,owner:null}));
 });
 it('bounces a fast corpse off a thin wall instead of tunneling',()=>{
  const {sim,victim}=fixture();victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
  const body=corpseBody(sim);body.velocity.set(95,0,0);
  const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.03,5,5)),position:new C.Vec3(1,21,0)});
  sim.world.addBody(wall);sim.targets.set(wall,{kind:'world'});sim.step(1/60,1017);
  expect(body.position.x).toBeLessThan(1);expect(body.velocity.x).toBeLessThan(0);
 });
 it('kicks and tumbles shot evidence while preserving ordinary death drops and impact cues',()=>{
  const {sim,shooter}=fixture();sim.caseBody.position.set(0,21,10);
  sim.shoot(shooter.id,{shotId:'case-shot',origin:{x:-2,y:21,z:10},direction:{x:1,y:0,z:0}});
  sim.step(.01,1010);expect(sim.caseBody.velocity.x).toBeCloseTo(T.caseShotKick,2);
  expect(sim.caseBody.velocity.y).toBeGreaterThanOrEqual(T.caseShotLift);
  expect(sim.caseBody.angularVelocity.length()).toBeGreaterThan(10);
  expect(sim.snapshot(false).impacts.some(hit=>hit.cue==='case-hit')).toBe(true);
  const frame=new ChaosEncoder().encode(sim.snapshot(false)).payload;
  const decoded=new ChaosDecoder().read(frame)?.message;
  expect(decoded?.type).toBe('chaos');
  if(decoded?.type==='chaos')expect(decoded.state.impacts.some(hit=>hit.cue==='case-hit')).toBe(true);
  const carry=createPlayer('carry','Carry',appearance,{x:0,y:20,z:10});
  const carrySim=new ChaosSimulation(new Map([[carry.id,carry]]),()=>{});
  carrySim.caseBody.position.set(0,20.8,10);carrySim.step(0,1000);
  expect(carrySim.snapshot().case.owner).toBe('carry');carrySim.release('carry',{x:1,y:0,z:0});
  expect(carrySim.caseBody.velocity.x).toBeCloseTo(14.3);expect(carrySim.caseBody.velocity.y).toBeCloseTo(5.2);
 });
 it('allows authoritative posthumous damage without allowing self damage or trusting legacy dead-player hit messages',()=>{
  const {players,shooter,other}=fixture();shooter.hp=0;
  expect(applyHit(players,shooter.id,other.id,1).applied).toBe(false);
  expect(applyHit(players,shooter.id,other.id,1,true).applied).toBe(true);
  expect(applyHit(players,shooter.id,shooter.id,1,true).applied).toBe(false);
 });
});
