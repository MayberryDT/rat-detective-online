import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,DISPATCH_STATIONS} from '../../src/shared/chaosState';
import {INCIDENTS,incidentInfo,incidentRoster,type IncidentId} from '../../src/shared/incidentCatalog';
import {BALL_SPEED} from '../../src/shared/ballTuning';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
// Straight into the first pillar's bell from its open side.
const DISPATCH_STATION=DISPATCH_STATIONS[0]!,DISPATCH_SHOT={origin:{x:DISPATCH_STATION.target.x+Math.sin(DISPATCH_STATION.face)*2.5,y:DISPATCH_STATION.target.y,z:DISPATCH_STATION.target.z+Math.cos(DISPATCH_STATION.face)*2.5},direction:{x:-Math.sin(DISPATCH_STATION.face),y:0,z:-Math.cos(DISPATCH_STATION.face)}};
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
 sim.shoot('shooter',{shotId:crypto.randomUUID(),...DISPATCH_SHOT});sim.step(.01,time);
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
 it('can select every roster result and adds Evidence Tampering only in classic mode',()=>{
  const random=vi.spyOn(Math,'random');
  const roster=incidentRoster('standard');
  roster.forEach((incident,index)=>{
   random.mockReturnValue((index+.1)/roster.length);const {sim}=fixture();fireDispatch(sim);
   expect(sim.snapshot(false).dispatch.incident).toBe(incident.id);
  });
  // The missile case is behind the classic toggle.
  expect(roster.some(i=>i.id==='evidence-tampering')).toBe(false);
  const classic=incidentRoster('classic');
  expect(classic.filter(i=>i.id!=='evidence-tampering')).toEqual(roster);expect(classic).toHaveLength(roster.length+1);
  const index=classic.findIndex(i=>i.id==='evidence-tampering');
  random.mockReturnValue((index+.1)/classic.length);
  const {sim}=fixture();sim.evidenceMode='classic';fireDispatch(sim);
  expect(sim.snapshot(false).dispatch.incident).toBe('evidence-tampering');
 });
 it('pins one incident for private practice, repeats it, and ignores a pin outside the mode',()=>{
  const random=vi.spyOn(Math,'random').mockReturnValue(0);
  const {sim}=fixture();sim.forcedIncident='scattershot';
  fireDispatch(sim);
  expect(sim.snapshot(false).dispatch.incident).toBe('scattershot');
  // A pin is meant for review: it survives the no-immediate-repeat rule.
  let at=now+T.rollMs+T.activeMs+T.cooldownMs;
  sim.step(0,at);sim.step(0,at+10);
  expect(sim.snapshot(false).dispatch.phase).toBe('ready');
  fireDispatch(sim,at+20);
  expect(sim.snapshot(false).dispatch.incident).toBe('scattershot');
  // A pin the current mode does not run is ignored rather than leaking the incident back.
  const standard=fixture();standard.sim.forcedIncident='evidence-tampering';
  random.mockReturnValue(0);
  fireDispatch(standard.sim,now);
  expect(standard.sim.snapshot(false).dispatch.incident).not.toBe('evidence-tampering');
 });
 it('keeps rolling when the room runs a single incident (a staging INCIDENTS list)',()=>{
  // The caller's reward is a random supply: a Mousetrap would make the second pull set a trap instead of ringing the bell.
  vi.spyOn(Math,'random').mockReturnValue(0);
  const {sim}=fixture();sim.onlyIncidents=['crossfire'];
  fireDispatch(sim);expect(sim.snapshot(false).dispatch.incident).toBe('crossfire');
  const at=now+T.rollMs+T.activeMs+T.cooldownMs;
  sim.step(0,at);sim.step(0,at+10);expect(sim.snapshot(false).dispatch.phase).toBe('ready');
  fireDispatch(sim,at+20);
  expect(sim.snapshot(false).dispatch).toMatchObject({phase:'rolling',incident:'crossfire'});
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
  expect(restored.snapshot(false).dispatch.incident).toBe('pressure-surge');
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
 it('fires one ball per trigger even at capacity, and plain balls once it ends',()=>{
  const {sim}=fixture('crossfire');
  shoot(sim,'one');expect(sim.snapshot(false).shots).toHaveLength(1);
  for(let i=0;i<300;i++)shoot(sim,`fill-${i}`);
  const shots=sim.snapshot(false).shots;expect(shots).toHaveLength(T.maxShots);expect(shots.at(-1)!.id).toBe('fill-299');
  sim.step(0,now+T.activeMs);shoot(sim,'expired');
  const plain=sim.snapshot(false).shots.at(-1)!;expect(plain.id).toBe('expired');
  expect(plain.v.x).toBeCloseTo(BALL_SPEED);expect(Math.hypot(plain.v.y,plain.v.z)).toBeCloseTo(0);
 });
 it('fills every machine by itself during Pressure Surge, faster as it goes, and stops afterwards',()=>{
  const {sim}=fixture('pressure-surge');
  const run=(from:number,seconds:number)=>{let t=from;for(let i=0;i<seconds*30;i++){t+=1000/30;sim.step(1/30,t);}return t;};
  let t=run(now,4);expect(sim.snapshot(false).pressure!.serial).toBe(0);
  t=run(t,2);expect(sim.snapshot(false).pressure!.serial).toBe(6);
  // Later pulses come quicker than the first five seconds.
  const early=sim.snapshot(false).pressure!.serial;t=run(t,T.activeMs/1000-6);
  expect(sim.snapshot(false).pressure!.serial-early).toBeGreaterThan(6*((T.activeMs/1000-6)/5));
  const after=sim.snapshot(false).pressure!.serial;run(t+100,12);
  expect(sim.snapshot(false).pressure!.serial).toBe(after);
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
