import {describe,it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {createAssignment,parseAssignment,restoreAssignment,ASSIGNMENT_IDS} from '../../src/shared/assignments';
import {AssignmentRules} from '../../src/shared/AssignmentRules';
import {activeZone,nextZone,rotateZone} from '../../src/shared/jurisdiction';
import {JURISDICTION_ZONES,JURISDICTION_ZONE_IDS,zoneContains,zoneSpawnExcluded,zoneTiles,type JurisdictionZoneId} from '../../src/shared/jurisdictionZones';
import {createPlayer,spawnForWorld,resetRoundForWorld} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ServerBotController} from '../../src/worker/ServerBotController';
import {BotNavigation} from '../../src/shared/BotNavigation';
import {ChaosEncoder,ChaosDecoder} from '../../src/shared/chaosWire';
import {JurisdictionZones} from '../../src/prototype/JurisdictionZones';
import {assignmentGuidance} from '../../src/prototype/assignmentGuidance';
const NOW=1_000_000;
afterEach(()=>vi.restoreAllMocks());
function fixture(){
 const a=createPlayer('a','A',DEFAULT_APPEARANCE,{x:0,y:0,z:0}),b=createPlayer('b','B',DEFAULT_APPEARANCE,{x:0,y:0,z:0});
 const players=new Map([[a.id,a],[b.id,b]]),state=createAssignment('jurisdiction',NOW,'round',()=>.3);
 state.liveAt=NOW;state.phase='active';const j=state.jurisdiction!;
 Object.assign(a,JURISDICTION_ZONES[activeZone(j)].posts[0]);Object.assign(b,a,{id:'b',name:'B'});
 return {a,b,players,state,j,rules:new AssignmentRules(state,players,()=>.3)};
}
describe('Jurisdiction authority',()=>{
 it('banks only living genuine held time and enemy presence never contests',()=>{
  const {a,b,state,j,rules}=fixture();rules.advance(NOW,NOW+1234.5,'a');expect(j.heldMs.a).toBe(1234.5);
  rules.advance(NOW+1234.5,NOW+2000,null);expect(j.heldMs.a).toBe(1234.5);expect(j.scorerId).toBeNull();
  rules.advance(NOW+2000,NOW+3000,'b');expect(j.heldMs.b).toBe(1000);
  b.hp=0;rules.advance(NOW+3000,NOW+4000,'b');expect(j.heldMs.b).toBe(1000);
  a.y=8;rules.advance(NOW+4000,NOW+5000,'a');expect(j.heldMs.a).toBe(1234.5);
  expect(rules.kill('a','a',NOW+5000)).toBe(false);expect(state.result).toBeUndefined();
 });
 it('pauses both clocks only during briefing and classic suspension',()=>{
  const {state,j,rules}=fixture();state.liveAt=NOW+2400;rules.setPhase(NOW,false);rules.advance(NOW,NOW+2000,'a');
  expect(j.remainingMs).toBe(75000);rules.setPhase(NOW+2400,false);rules.advance(NOW+2400,NOW+3400,'a');
  rules.setPhase(NOW+3400,true);const saved=structuredClone(j);rules.advance(NOW+3400,NOW+30000,'a');expect(j).toEqual(saved);
  rules.setPhase(NOW+30000,false);rules.advance(NOW+30000,NOW+31000,'a');expect(j.heldMs.a).toBe(2000);
 });
 it('splits a rotation interval, and a target at the boundary wins before relocating',()=>{
  const {a,state,j,rules}=fixture();const old=activeZone(j);j.remainingMs=250;
  rules.advance(NOW,NOW+1000,'a');expect(j.heldMs.a).toBe(250);expect(j.remainingMs).toBe(74250);expect(activeZone(j)).not.toBe(old);
  Object.assign(a,JURISDICTION_ZONES[activeZone(j)].posts[0]);j.heldMs.a=59900;j.remainingMs=100;
  rules.advance(NOW+1000,NOW+2000,'a');expect(state.result).toMatchObject({winnerId:'a',at:NOW+1100,method:'zone-held'});
  expect(j.serial).toBe(1);expect(j.heldMs.a).toBe(60000);expect(j.scorerId).toBeNull();expect(parseAssignment(state)).toEqual(state);
  rules.advance(NOW+2000,NOW+9000,'b');expect(state.result?.winnerId).toBe('a');
 });
 it('retains announced bags through restoration and alternates all six without repeats',()=>{
  const {j,state}=fixture();const sequence:JurisdictionZoneId[]=[];
  for(let i=0;i<24;i++){
   sequence.push(activeZone(j));const announced=nextZone(j);j.remainingMs=9000;
   const restored=restoreAssignment(state,NOW+999999)!;expect(restored).toEqual(state);
   rotateZone(j,()=>.7);expect(activeZone(j)).toBe(announced);
  }
  for(let i=0;i<24;i+=6)expect(new Set(sequence.slice(i,i+6))).toEqual(new Set(JURISDICTION_ZONE_IDS));
  for(let i=1;i<24;i++)expect(JURISDICTION_ZONES[sequence[i]].category).not.toBe(JURISDICTION_ZONES[sequence[i-1]].category);
 });
 it('keeps continuous progress out of the transition revision and prunes only expired identities',()=>{
  const {state,j,rules}=fixture();rules.advance(NOW,NOW+10,'a');const revision=state.revision;
  for(let i=1;i<60;i++)rules.advance(NOW+i*10,NOW+(i+1)*10,'a');
  expect(state.revision).toBe(revision);expect(j.heldMs.a).toBe(600);
  rules.disconnect('b');expect(j.heldMs.a).toBe(600);rules.disconnect('a');expect(j.heldMs).toEqual({});
 });
 it('rejects malformed mode state and preserves other stored modes',()=>{
  const {state,j}=fixture();
  for(const patch of [{remainingMs:NaN},{remainingMs:75001},{remainingMs:0},{serial:1},{index:9},{scorerId:''},{order:Array(6).fill(activeZone(j))},{heldMs:{a:60001}},{heldMs:{a:60000}},{heldMs:{a:-1}},{heldMs:Object.fromEntries(Array.from({length:17},(_,i)=>[String(i),1]))}]){
   expect(parseAssignment({...state,jurisdiction:{...j,...patch}}),JSON.stringify(patch)).toBeNull();
  }
  for(const id of ASSIGNMENT_IDS.filter(id=>id!=='jurisdiction')){
   const old=createAssignment(id,NOW);expect(restoreAssignment(old,NOW+5000)).toEqual(old);expect(parseAssignment({...old,jurisdiction:j})).toBeNull();
  }
  const safe=structuredClone(state);safe.jurisdiction!.heldMs=Object.fromEntries([['__proto__',1000]]);expect(parseAssignment(safe)?.jurisdiction?.heldMs['__proto__']).toBe(1000);
 });
 it('transmits fractional progress through compact deltas without a revision change',()=>{
  const {players,state,rules}=fixture(),sim=new ChaosSimulation(players,()=>{});sim.setAssignment(state);
  const encoder=new ChaosEncoder('jurisdiction',true),decoder=new ChaosDecoder();
  let snapshot=sim.snapshot(false);expect(decoder.read(encoder.encode(snapshot).payload)?.message.type).toBe('chaos');
  rules.advance(NOW,NOW+33.3,'a');sim.setAssignment(state);snapshot=sim.snapshot(false);snapshot.tick=(snapshot.tick??0)+1;
  const message=decoder.read(encoder.encode(snapshot).payload)?.message;
  expect(message?.type==='chaos'&&message.state.assignment?.jurisdiction?.heldMs.a).toBeCloseTo(33.3);
 });
});
describe('Jurisdiction geometry and presentation',()=>{
 it.each(JURISDICTION_ZONE_IDS)('%s uses feet, jump bands and shared rectangular fill',id=>{
  const z=JURISDICTION_ZONES[id],p=z.posts[0];expect(zoneContains(id,p)).toBe(true);
  expect(zoneContains(id,{...p,y:z.floorY+5.3})).toBe(true);expect(zoneContains(id,{...p,y:z.floorY+8})).toBe(false);
  expect(zoneContains(id,{...p,y:z.floorY-.51})).toBe(false);expect(zoneContains(id,{...p,x:NaN})).toBe(false);
  for(const r of zoneTiles(id))expect(zoneContains(id,{x:(r.xmin+r.xmax)/2,y:z.floorY,z:(r.zmin+r.zmax)/2})).toBe(true);
 });
 it('excludes the street above the T, the missing north arm, pump solids and control booth',()=>{
  expect(zoneContains('sewer-junction',{x:0,y:0,z:0})).toBe(false);
  expect(zoneContains('sewer-junction',{x:0,y:-7,z:-10})).toBe(false);
  expect(zoneContains('sewer-junction',{x:8,y:-7,z:8})).toBe(false);
  expect(zoneContains('pump-floor',{x:118,y:0,z:113})).toBe(false);
  expect(zoneContains('pump-floor',{x:116,y:0,z:130})).toBe(false);
 });
 it.each([341283204,1])('has clear supported posts and outside spawns in seed %s',seed=>{
  const spec={seed,version:2},nav=new BotNavigation(spec);
  for(const id of JURISDICTION_ZONE_IDS){
   const a=createAssignment('jurisdiction',NOW);a.jurisdiction!.index=a.jurisdiction!.order.indexOf(id);a.jurisdiction!.serial=a.jurisdiction!.index;
   for(const p of JURISDICTION_ZONES[id].posts){
    const step=nav.localStep(p,{x:p.x+.3,y:p.y,z:p.z});expect.soft(step,`${id} ${JSON.stringify(p)}`).toBeDefined();
    if(step)expect(step.y).toBeCloseTo(JURISDICTION_ZONES[id].floorY,0);
   }
   for(const rng of [()=>0,()=>.5,()=>.999])expect(zoneSpawnExcluded(id,spawnForWorld(spec,rng,[],undefined,a))).toBe(false);
   const p=createPlayer('spawn','Spawn',DEFAULT_APPEARANCE,{x:0,y:0,z:0});resetRoundForWorld([p],spec,()=>.2,a);expect(zoneSpawnExcluded(id,p)).toBe(false);
  }
 },20000);
 it('renders only active and preview footprints and disposes resources',()=>{
  const {state,j}=fixture(),scene=new THREE.Scene(),view=new JurisdictionZones(scene);view.update(state);
  expect(view.root.children.filter(c=>c.visible)).toHaveLength(1);j.remainingMs=9000;view.update(state);expect(view.root.children.filter(c=>c.visible)).toHaveLength(2);
  const disposals=vi.fn();view.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)o.geometry.addEventListener('dispose',disposals);});
  view.clear();expect(view.root.visible).toBe(false);view.dispose();expect(scene.children).toHaveLength(0);expect(disposals).toHaveBeenCalledTimes(4);
 });
 it('guides negative grounded street feet correctly and labels the sewer layer',()=>{
  const {state,j}=fixture();j.index=j.order.indexOf('sewer-junction');j.serial=j.index;
  const cue=assignmentGuidance(state,{x:130,y:-.1,z:-20})!;expect(cue.via).toBe('GO UNDERGROUND ↓');
  expect(assignmentGuidance(state,{x:0,y:-6.7,z:20})?.via).toBe('SEWER');
 });
});
describe('Jurisdiction real physics',()=>{
 it('does not bank pre-pickup time, does not move the case on relocation, and preserves progress on sleep',()=>{
  vi.spyOn(Date,'now').mockReturnValue(NOW);
  const {a,b,players,state}=fixture();Object.assign(b,{x:90,z:90});
  const sim=new ChaosSimulation(players,()=>{},undefined,{seed:341283204,version:2});sim.setAssignment(state);
  const p=JURISDICTION_ZONES[activeZone(state.jurisdiction!)].posts[0];Object.assign(a,p);sim.caseBody.position.set(p.x,p.y+.8,p.z);sim.caseBody.velocity.setZero();
  sim.step(0,NOW);expect(sim.caseHolderId).toBe('a');sim.step(1/60,NOW+1000/60);expect(sim.assignmentState!.jurisdiction!.heldMs.a).toBeCloseTo(1000/60);
  const j=sim.assignmentState!.jurisdiction!;j.remainingMs=1;sim.step(.002,NOW+1000/60+2);expect(sim.caseHolderId).toBe('a');expect(j.serial).toBe(1);
  sim.release('a');const score=j.heldMs.a;sim.step(.1,NOW+1000);expect(j.heldMs.a).toBe(score);
  const saved=sim.snapshot(false);vi.mocked(Date.now).mockReturnValue(NOW+60000);
  const restored=new ChaosSimulation(players,()=>{},saved,{seed:341283204,version:2});restored.step(0,NOW+60000);
  expect(restored.assignmentState!.jurisdiction!.heldMs).toEqual(j.heldMs);expect(restored.assignmentState!.jurisdiction!.remainingMs).toBe(j.remainingMs);
 });
 it.each([...JURISDICTION_ZONE_IDS.map(id=>({id,central:false})),{id:'sewer-junction' as const,central:true}])('a hosted bot reaches and scores in $id (central=$central) using real controls',({id,central})=>{
  vi.spyOn(Math,'random').mockReturnValue(.3);vi.spyOn(Date,'now').mockReturnValue(NOW);
  const spec={seed:341283204,version:2};
  const starts={'records-forecourt':[-45,-18],'icebox-yard':[100,-18],'central-crossroads':[70,12],'needleworks-floor':[-105,116],'pump-floor':[125,145],'sewer-junction':[148,0]} as const;
  const [x,z]=central?[84,-53]:starts[id],bot=createPlayer('bot','Bot',DEFAULT_APPEARANCE,{x,y:.3,z}),players=new Map([[bot.id,bot]]);
  const sim=new ChaosSimulation(players,()=>{},undefined,spec),a=createAssignment('jurisdiction',NOW,'bots',()=>.3),j=a.jurisdiction!;
  a.liveAt=NOW;a.phase='active';j.index=j.order.indexOf(id);j.serial=j.index;sim.setAssignment(a);
  sim.caseBody.position.set(x,1.1,z);sim.caseBody.velocity.setZero();sim.step(0,NOW);expect(sim.caseHolderId).toBe('bot');
  if(central)for(let i=1;i<7;i++)players.set(`peer-${i}`,createPlayer(`peer-${i}`,`Peer ${i}`,DEFAULT_APPEARANCE,{x:x+i*3,y:.3,z:z+i*2}));
  const recover=vi.fn(),controller=new ServerBotController(spec,central?['peer-1','bot',...Array.from({length:5},(_,i)=>`peer-${i+2}`)]:['bot'],{move:(id,p)=>Object.assign(players.get(id)!,p),shoot:()=>{},recover});
  try{
   for(let frame=1;frame<=2400&&(sim.assignmentState!.jurisdiction!.heldMs.bot??0)<2500;frame++){
    const at=NOW+frame*1000/60;controller.step(1/60,at,players,sim.snapshot(false),true);sim.step(1/60,at);
   }
   expect({score:sim.assignmentState!.jurisdiction!.heldMs.bot??0,position:{x:bot.x,y:bot.y,z:bot.z}},id).toMatchObject({score:expect.any(Number)});
   expect(sim.assignmentState!.jurisdiction!.heldMs.bot??0,`${id} at ${bot.x},${bot.y},${bot.z}`).toBeGreaterThanOrEqual(2500);expect(recover).not.toHaveBeenCalled();
  }finally{controller.dispose();}
 },30000);
});

describe('Jurisdiction incident boundaries',()=>{
 it('freezes at classic activation and resumes the same zone after expiry without cleanup credit',()=>{
  vi.spyOn(Date,'now').mockReturnValue(NOW);
  const {a,b,players,state}=fixture();Object.assign(b,{x:90,z:90});
  const initial=new ChaosSimulation(players,()=>{},undefined,{seed:341283204,version:2});initial.setAssignment(state);
  initial.caseBody.position.set(a.x,a.y+.8,a.z);initial.caseBody.velocity.setZero();initial.step(0,NOW);
  const saved=initial.snapshot(false);saved.dispatch={phase:'rolling',incident:'evidence-tampering',serial:1,started:NOW,until:NOW+10};
  const sim=new ChaosSimulation(players,()=>{},saved,{seed:341283204,version:2});sim.step(.02,NOW+20);
  const j=sim.assignmentState!.jurisdiction!;expect(j.heldMs.a).toBeCloseTo(10);expect(j.remainingMs).toBeCloseTo(74990);expect(sim.assignmentState!.phase).toBe('suspended');
  expect(sim.caseHolderId).toBeNull();sim.step(.1,NOW+120);expect(j.heldMs.a).toBeCloseTo(10);
  Object.assign(a,{x:90,z:-90});sim.step(0,NOW+30000);expect(sim.assignmentState!.phase).toBe('active');expect(j.remainingMs).toBeCloseTo(74990);expect(j.scorerId).toBeNull();
 });
 it('stops a real enemy disarm without clearing banked zone points',()=>{
  vi.spyOn(Date,'now').mockReturnValue(NOW);
  const {a,b,players,state}=fixture();Object.assign(b,{x:90,z:90});
  const sim=new ChaosSimulation(players,()=>{},undefined,{seed:341283204,version:2});sim.setAssignment(state);
  sim.caseBody.position.set(a.x,a.y+.8,a.z);sim.caseBody.velocity.setZero();sim.step(0,NOW);
  sim.step(.1,NOW+100);const c=sim.caseBody.position;
  sim.shoot(b.id,{shotId:'zone-disarm',origin:{x:c.x,y:c.y,z:c.z+1.5},direction:{x:0,y:0,z:-1}});
  sim.step(1/60,NOW+100+1000/60);expect(sim.caseHolderId).toBeNull();const earned=sim.assignmentState!.jurisdiction!.heldMs.a;
  Object.assign(a,{x:90,z:-90});sim.step(.1,NOW+300);expect(sim.assignmentState!.jurisdiction!.heldMs.a).toBe(earned);expect(sim.assignmentState!.jurisdiction!.scorerId).toBeNull();
 });
});
