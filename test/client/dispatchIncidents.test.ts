import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,DISPATCH_TARGET,LAUNCH_MACHINES} from '../../src/shared/chaosState';
import {INCIDENTS,incidentInfo,incidentRoster,type IncidentId} from '../../src/shared/incidentCatalog';
import {resolveShotPattern} from '../../src/shared/shotPattern';
import {BALL_SPEED} from '../../src/shared/ballTuning';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const now=Date.now();
afterEach(()=>vi.restoreAllMocks());
function fixture(incident?:IncidentId,legacy=false){
 const shooter=createPlayer('shooter','Shooter',appearance,{x:-50,y:20,z:0});
 const victim=createPlayer('victim','Victim',appearance,{x:0,y:20,z:0});
 const players=new Map([shooter,victim].map(p=>[p.id,p]));
 let sim=new ChaosSimulation(players,()=>{});sim.step(0,now);
 if(incident||legacy){const saved=sim.snapshot(false);saved.dispatch={phase:'active',started:now,until:now+T.activeMs,serial:1,...(incident?{incident}:{})};sim=new ChaosSimulation(players,()=>{},saved);}
 return {sim,shooter,victim,players};
}
const shoot=(sim:ChaosSimulation,id='shot')=>sim.shoot('shooter',{shotId:id,origin:{x:0,y:30,z:0},direction:{x:1,y:0,z:0}});
function fireDispatch(sim:ChaosSimulation,time=now){
 sim.shoot('shooter',{shotId:crypto.randomUUID(),origin:{x:DISPATCH_TARGET.x,y:DISPATCH_TARGET.y,z:DISPATCH_TARGET.z+1},direction:{x:0,y:0,z:-1}});sim.step(.01,time);
}
function caseKick(sim:ChaosSimulation,time=now+10){
 sim.caseBody.position.set(0,21,10);sim.caseBody.velocity.setZero();sim.caseBody.angularVelocity.setZero();
 sim.shoot('shooter',{shotId:crypto.randomUUID(),origin:{x:-2,y:21,z:10},direction:{x:1,y:0,z:0}});sim.step(.01,time);
 return sim.caseBody.velocity.x;
}
function bodyKick(sim:ChaosSimulation,victim:ReturnType<typeof createPlayer>,time=now+10){
 victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
 const body=[...sim.targets].filter(([,t])=>t.kind==='corpse').at(-1)![0];body.velocity.setZero();body.angularVelocity.setZero();
 sim.shoot('shooter',{shotId:crypto.randomUUID(),origin:{x:-2,y:body.position.y,z:0},direction:{x:1,y:0,z:0}});sim.step(.01,time);
 return body;
}
describe('authoritative Dispatch incidents',()=>{
 it('can select every roster result and retires only the incident the mode leaves out',()=>{
  const random=vi.spyOn(Math,'random');
  const roster=incidentRoster('planted');
  roster.forEach((incident,index)=>{
   random.mockReturnValue((index+.1)/roster.length);const {sim}=fixture();fireDispatch(sim);
   expect(sim.snapshot(false).dispatch.incident).toBe(incident.id);
  });
  // Planted Evidence is the shipped default; the missile case is behind the toggle.
  expect(roster.some(i=>i.id==='evidence-tampering')).toBe(false);
  expect(roster.some(i=>i.id==='planted-evidence')).toBe(true);
  const classic=incidentRoster('classic');
  expect(classic.some(i=>i.id==='evidence-tampering')).toBe(true);
  expect(classic.some(i=>i.id==='planted-evidence')).toBe(false);
  const index=classic.findIndex(i=>i.id==='evidence-tampering');
  random.mockReturnValue((index+.1)/classic.length);
  const {sim}=fixture();sim.evidenceMode='classic';fireDispatch(sim);
  expect(sim.snapshot(false).dispatch.incident).toBe('evidence-tampering');
 });
 it('pins one incident for private practice, repeats it, and ignores a pin outside the mode',()=>{
  const random=vi.spyOn(Math,'random').mockReturnValue(0);
  const {sim}=fixture();sim.forcedIncident='planted-evidence';
  fireDispatch(sim);
  expect(sim.snapshot(false).dispatch.incident).toBe('planted-evidence');
  // A pin is meant for review: it survives the no-immediate-repeat rule.
  let at=now+T.rollMs+T.activeMs+T.cooldownMs;
  sim.step(0,at);sim.step(0,at+10);
  expect(sim.snapshot(false).dispatch.phase).toBe('ready');
  fireDispatch(sim,at+20);
  expect(sim.snapshot(false).dispatch.incident).toBe('planted-evidence');
  // A pin the current mode does not run is ignored rather than leaking the incident back.
  const planted=fixture();planted.sim.evidenceMode='classic';planted.sim.forcedIncident='planted-evidence';
  random.mockReturnValue(0);
  fireDispatch(planted.sim,now);
  expect(planted.sim.snapshot(false).dispatch.incident).not.toBe('planted-evidence');
 });
 it('selects once, persists through restore and busy hits, and avoids immediately repeating',()=>{
  vi.spyOn(Math,'random').mockReturnValue(0);const {sim,players}=fixture();fireDispatch(sim);
  const selected=sim.snapshot(false);expect(selected.dispatch.incident).toBe('improper-disposal');
  fireDispatch(sim,now+10);expect(sim.snapshot(false).dispatch).toEqual(selected.dispatch);
  const restored=new ChaosSimulation(players,()=>{},selected);expect(restored.snapshot(false).dispatch).toEqual(selected.dispatch);
  restored.step(0,now+T.rollMs);expect(restored.snapshot(false).dispatch.phase).toBe('active');
  restored.step(0,now+T.rollMs+T.activeMs);expect(restored.snapshot(false).dispatch.phase).toBe('cooldown');
  restored.step(0,now+T.rollMs+T.activeMs+T.cooldownMs);expect(restored.snapshot(false).dispatch.phase).toBe('ready');
  fireDispatch(restored,now+T.rollMs+T.activeMs+T.cooldownMs+10);
  expect(restored.snapshot(false).dispatch.incident).toBe('bad-ammunition');
 });
 it('keeps exact Improper Disposal behavior and interprets missing legacy IDs as that incident',()=>{
  for(const legacy of [false,true]){
   const {sim,victim}=fixture(legacy?undefined:'improper-disposal',legacy);victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
   const state=sim.snapshot(false);expect(state.corpses[0].v.x).toBe(95);expect(state.shots).toHaveLength(120);
  }
  expect(incidentInfo().id).toBe('improper-disposal');
 });
 it.each(INCIDENTS.filter(i=>i.id!=='improper-disposal').map(i=>i.id))('%s does not accidentally enable explosive deaths',incident=>{
  const {sim,victim}=fixture(incident);victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
  expect(sim.snapshot(false).corpses[0].v.x).toBe(T.normalCorpseSpeed);expect(sim.snapshot(false).shots).toHaveLength(0);
 });
 it('fires crooked, uneven volleys instead of a fixed double shot, even at capacity',()=>{
  let n=0;const seq=[0.01,0.9,0.2,0.8,0.55,0.1,0.7,0.3,0.95,0.4,0.15,0.6];
  vi.spyOn(Math,'random').mockImplementation(()=>seq[n++%seq.length]);
  const {sim}=fixture('bad-ammunition');shoot(sim,'quiet');
  expect(sim.snapshot(false).shots.length).toBeGreaterThanOrEqual(1);
  const first=sim.snapshot(false).shots.length;
  shoot(sim,'cluster');
  const shots=sim.snapshot(false).shots;
  expect(shots.length).toBeGreaterThan(first);
  expect(new Set(shots.map(s=>`${s.v.x.toFixed(1)},${s.v.z.toFixed(1)}`)).size).toBeGreaterThan(1);
  for(const s of shots)expect(Math.hypot(s.v.x,s.v.y,s.v.z)).toBeCloseTo(BALL_SPEED,1);
  for(let i=0;i<200;i++)shoot(sim,`fill-${i}`);expect(sim.snapshot(false).shots).toHaveLength(T.maxShots);
  expect(sim.snapshot(false).shots.some(s=>s.id.startsWith('fill-'))).toBe(true);
  sim.step(0,now+T.activeMs);shoot(sim,'expired');expect(sim.snapshot(false).shots.at(-1)!.id).toBe('expired');
 });
 it.each([1,2,3])('keeps a %s-ball seeded volley with no straight shots or delayed extras', count=>{
  const {sim}=fixture('bad-ammunition');
  const descriptor={shotId:'',origin:{x:0,y:30,z:0},direction:{x:1,y:0,z:0}};
  for(let seed=0;seed<1000;seed++){descriptor.shotId=`count-${seed}`;if(resolveShotPattern(descriptor,'bad-ammunition').length===count)break;}
  sim.shoot('shooter',descriptor);
  let shots=sim.snapshot(false).shots;expect(shots).toHaveLength(count);
  for(const shot of shots){
   expect(Math.acos(shot.v.x/BALL_SPEED)).toBeGreaterThanOrEqual(.1199);
   expect(Math.hypot(shot.v.x,shot.v.y,shot.v.z)).toBeCloseTo(BALL_SPEED);
  }
  sim.step(0,now+500);shots=sim.snapshot(false).shots;expect(shots).toHaveLength(count);
 });
 it.each([{x:1,y:0,z:0},{x:0,y:0,z:-1},{x:.3,y:.4,z:.5},{x:0,y:1,z:0},{x:0,y:-1,z:0}])('keeps Bad Ammunition in a narrow diagonal cone around aim %j',aim=>{
  const {sim}=fixture('bad-ammunition'),direction=new C.Vec3(aim.x,aim.y,aim.z);direction.normalize();
  const axis=Math.abs(direction.y)<.95?new C.Vec3(0,1,0):new C.Vec3(1,0,0);
  const side=direction.cross(axis);side.normalize();const up=side.cross(direction);up.normalize();
  const random=vi.spyOn(Math,'random'),quadrants=new Set<string>();
  for(const radial of [0,.5,.999999])for(const azimuth of [0,.125,.249999,.25,.375,.499999,.5,.625,.749999,.75,.875,.999999]){
   random.mockReturnValue(.5).mockReturnValueOnce(0).mockReturnValueOnce(radial).mockReturnValueOnce(azimuth);
   sim.shoot('shooter',{shotId:`diagonal-${radial}-${azimuth}`,origin:{x:0,y:30,z:0},direction:aim});
   const shot=sim.snapshot(false).shots.at(-1)!,velocity=new C.Vec3(shot.v.x,shot.v.y,shot.v.z);
   expect(velocity.length()).toBeCloseTo(BALL_SPEED);
   const angle=Math.acos(velocity.dot(direction)/BALL_SPEED);
   expect(angle).toBeGreaterThanOrEqual(.12-1e-8);expect(angle).toBeLessThanOrEqual(.24+1e-8);
   const horizontal=velocity.dot(side),vertical=velocity.dot(up),ratio=Math.abs(horizontal/vertical);
   expect(ratio).toBeGreaterThanOrEqual(1/Math.sqrt(3)-1e-8);expect(ratio).toBeLessThanOrEqual(Math.sqrt(3)+1e-8);
   quadrants.add(`${Math.sign(horizontal)},${Math.sign(vertical)}`);
  }
  expect(quadrants.size).toBe(4);
  sim.step(0,now+T.activeMs);sim.shoot('shooter',{shotId:'normal-again',origin:{x:0,y:30,z:0},direction:aim});
  const v=sim.snapshot(false).shots.at(-1)!.v;expect(new C.Vec3(v.x,v.y,v.z).dot(direction)).toBeCloseTo(BALL_SPEED);
 });
 it('fires all launchers every three seconds through cooldowns, without replaying restored pulses',()=>{
  const {sim,players}=fixture('pressure-surge');sim.step(0,now+2999);expect(sim.snapshot(false).pressure!.serial).toBe(0);
  sim.step(0,now+3000);let s=sim.snapshot(false);expect(s.pressure!.serial).toBe(6);for(const m of LAUNCH_MACHINES)expect(s.pressure!.cooldowns![m.id]).toBe(now+8000);
  const restored=new ChaosSimulation(players,()=>{},s);restored.step(0,now+3001);expect(restored.snapshot(false).pressure!.serial).toBe(6);
  restored.step(0,now+6000);s=restored.snapshot(false);expect(s.pressure!.serial).toBe(12);for(const m of LAUNCH_MACHINES)expect(s.pressure!.cooldowns![m.id]).toBe(now+11000);
  restored.step(0,now+T.activeMs);const before=restored.snapshot(false).pressure!.serial;restored.step(0,now+T.activeMs+3000);expect(restored.snapshot(false).pressure!.serial).toBe(before);
  const cooling=fixture('pressure-surge');const saved=cooling.sim.snapshot(false);saved.pressure!.cooldowns={[LAUNCH_MACHINES[0].id]:now+9000};
  const blocked=new ChaosSimulation(cooling.players,()=>{},saved);blocked.step(0,now+3000);expect(blocked.snapshot(false).pressure!.serial).toBe(6);
 });
 it('restores the ordinary bouncy case kick after Evidence Tampering missile speed expires',()=>{
  const {sim}=fixture('evidence-tampering');expect(caseKick(sim)).toBeCloseTo(160,2);expect(Math.abs(sim.caseBody.angularVelocity.z)).toBeGreaterThan(5);
  sim.step(0,now+T.activeMs);expect(caseKick(sim,now+T.activeMs+10)).toBeCloseTo(T.caseShotKick,2);
 });
 it('keeps ordinary corpse relaunch force during Crossfire',()=>{
  const {sim,victim}=fixture('crossfire');const body=bodyKick(sim,victim);
  expect(body.velocity.x).toBeCloseTo(T.corpseShotKick,1);
 });
 it('accepts all known and legacy snapshot IDs but rejects unknown or non-string IDs',()=>{
  const {sim}=fixture(),state=sim.snapshot(false);expect(parseServerMessage({type:'chaos',state})).not.toBeNull();
  for(const incident of INCIDENTS){state.dispatch.incident=incident.id;expect(parseServerMessage({type:'chaos',state})).not.toBeNull();}
  for(const incident of ['unknown',null,123])expect(parseServerMessage({type:'chaos',state:{...state,dispatch:{...state.dispatch,incident}}})).toBeNull();
 });
 it.each(INCIDENTS.map(i=>i.id))('%s expires back to ordinary shooting and ordinary deaths',incident=>{
  vi.spyOn(Math,'random').mockReturnValue(0);const {sim,victim}=fixture(incident);
  sim.step(0,now+T.activeMs);expect(sim.snapshot(false).dispatch.phase).toBe('cooldown');
  shoot(sim);expect(sim.snapshot(false).shots).toHaveLength(1);
  victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
  expect(sim.snapshot(false).corpses[0].v.x).toBe(T.normalCorpseSpeed);expect(sim.snapshot(false).shots).toHaveLength(1);
 });
 it('skips a fully elapsed rolling and active window after restore without firing old launch pulses',()=>{
  const {sim,players}=fixture('pressure-surge'),saved=sim.snapshot(false);
  saved.dispatch.phase='rolling';saved.dispatch.until=now+T.rollMs;
  const restored=new ChaosSimulation(players,()=>{},saved);restored.step(0,now+T.rollMs+T.activeMs+T.cooldownMs+1);
  expect(restored.snapshot(false).dispatch.phase).toBe('ready');expect(restored.snapshot(false).pressure!.serial).toBe(0);
 });
});
