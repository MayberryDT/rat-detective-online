import {describe,it,expect,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,EXTRA_CASE_IDS,CASE_SIZE,CASE_LOOSE_SCALE,type ChaosState} from '../../src/shared/chaosState';
import {createPlayer} from '../../src/worker/gameState';
import {parseServerMessage} from '../../src/shared/messageValidation';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
function fixture(){
 const now=Date.now();const rats=[-50,0,30,60].map((x,i)=>createPlayer(String(i),String(i),appearance,{x,y:20,z:10}));
 const players=new Map(rats.map(p=>[p.id,p])),hits:ChaosHit[]=[];
 const initial=new ChaosSimulation(players,()=>{});initial.step(0,now);const state=initial.snapshot(false);
 state.dispatch={phase:'active',incident:'evidence-tampering',started:now,until:now+T.activeMs,serial:1};
 const sim=new ChaosSimulation(players,hit=>hits.push(hit),state);
 sim.caseBody.position.set(-80,20.8,10);sim.caseBody.velocity.setZero();sim.caseBody.angularVelocity.setZero();
 EXTRA_CASE_IDS.forEach((id,i)=>{const b=body(sim,id);b.position.set(-40+i*8,20.8,10);b.velocity.setZero();b.angularVelocity.setZero();});
 return {sim,rats,players,now,hits};
}
function body(sim:ChaosSimulation,id:string){return [...sim.targets].find(([,t])=>t.kind==='case'&&t.caseId===id)![0];}
const cases=(sim:ChaosSimulation)=>[...sim.targets].filter(([,t])=>t.kind==='case');
describe('weaponized Evidence Tampering cases',()=>{
 it('adds seven extra missiles and blocks every pickup attempt',()=>{
  const {sim,rats,now}=fixture();expect(cases(sim)).toHaveLength(8);
  sim.step(0,now);expect(sim.snapshot(false).extraCases!.every(c=>c.owner===null)).toBe(true);
  for(const p of rats)expect(sim.isCaseHolder(p.id)).toBe(false);
  expect(2*(body(sim,'evidence-1').shapes[0] as C.Box).halfExtents.x).toBeCloseTo(CASE_SIZE.x*CASE_LOOSE_SCALE);
 });
 it('turns extras into deadly owned missiles that reflect off walls',()=>{
  const {sim,rats,now,hits}=fixture();
  for(const rat of rats)rat.y=40;
  const target=body(sim,'evidence-1');target.position.set(0,20.8,10);target.velocity.setZero();
  sim.shoot('0',{shotId:'disarm',origin:{x:2.2,y:20.8,z:10},direction:{x:-1,y:0,z:0}});
  sim.step(.012,now+12);
  const extra=sim.snapshot(false).extraCases!.find(c=>c.id==='evidence-1')!;
  expect(extra).toMatchObject({owner:null,missileOwner:'0'});
  expect(target.velocity.x).toBeLessThan(-50);expect(sim.isCaseHolder('1')).toBe(false);
  rats[1].x=-3;rats[1].y=20;sim.step(.03,now+42);expect(hits.some(hit=>hit.owner==='0'&&hit.victim==='1'&&hit.damage===3)).toBe(true);
  const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.03,8,8)),position:new C.Vec3(target.position.x-3,21,10)});sim.world.addBody(wall);sim.targets.set(wall,{kind:'world'});
  sim.step(.05,now+92);expect(target.velocity.x).toBeGreaterThan(0);expect(target.position.x).toBeGreaterThan(wall.position.x);
  expect(hits.some(hit=>hit.victim==='0')).toBe(false);
 });
 it('restores armed extras without duplicate bodies and drops them at expiry',()=>{
  const {sim,players,now}=fixture();sim.step(0,now);const saved=sim.snapshot(false);
  expect(parseServerMessage({type:'chaos',state:saved})).not.toBeNull();
  const restored=new ChaosSimulation(players,()=>{},saved);expect(cases(restored)).toHaveLength(8);
  expect(restored.snapshot(false).extraCases!.every(c=>c.owner===null)).toBe(true);
  const extras=EXTRA_CASE_IDS.map(id=>body(restored,id));restored.step(0,now+T.activeMs);
  expect(restored.snapshot(false).extraCases).toEqual([]);expect(cases(restored)).toHaveLength(1);
  expect(extras.some(b=>restored.world.bodies.includes(b)||restored.targets.has(b))).toBe(false);
  const expired={...saved,dispatch:{...saved.dispatch,until:Date.now()-1}};
  const restoredExpired=new ChaosSimulation(players,()=>{},expired);expect(cases(restoredExpired)).toHaveLength(1);
 });
 it('migrates old active snapshots, ejects a restored carrier, and cleans extras on reset',()=>{
  const {sim,players,rats,now}=fixture();const saved=sim.snapshot(false);delete saved.extraCases;
  saved.case.owner='0';saved.case.p={x:rats[0].x,y:20.5,z:10};
  const restored=new ChaosSimulation(players,()=>{},saved);expect(restored.snapshot(false).extraCases).toHaveLength(7);
  expect(restored.caseHolderId).toBeNull();expect(restored.isCaseHolder('0')).toBe(false);
  rats[0].x=-80;restored.step(0,now+T.activeMs);
  expect(restored.snapshot(false).extraCases).toEqual([]);expect(cases(restored)).toHaveLength(1);
  expect(restored.isCaseHolder('0')).toBe(false);
  const active=new ChaosSimulation(players,()=>{},saved);active.reset();expect(cases(active)).toHaveLength(1);expect(active.snapshot(false).extraCases).toEqual([]);
 });
 it('can recover a loose extra missile and still supports the primary watchdog',()=>{
  const {sim,now}=fixture();
  expect(sim.recoverLooseCase('evidence-1')).toBe(true);
  expect(sim.snapshot(false).extraCases!.find(c=>c.id==='evidence-1')!.returningUntil).toBe(now+T.recoverMs);
  expect(sim.recoverCarrierCase('missing')).toBe(false);
  expect(sim.recoverLooseCase()).toBe(true);expect(sim.recoverLooseCase('missing')).toBe(false);
 });
 it('rejects malformed, duplicate, excessive or multiply carried extra-case snapshots',()=>{
  const {sim,now}=fixture();sim.step(0,now);const state=sim.snapshot(false),extra=state.extraCases![0];
  const invalid:unknown[]=[[extra,extra],[{...extra,id:'other'}],[{...extra,p:{x:NaN,y:0,z:0}}],Array(8).fill(extra),[{...extra,owner:'1'},{...extra,id:'evidence-2',owner:'1'}]];
  for(const extraCases of invalid)expect(parseServerMessage({type:'chaos',state:{...state,extraCases}})).toBeNull();
  const duplicateOwner={...state,case:{...state.case,owner:'1'},extraCases:[{...extra,owner:'1'},...state.extraCases!.slice(1)]} as ChaosState;
  expect(parseServerMessage({type:'chaos',state:duplicateOwner})).toBeNull();
 });
});
