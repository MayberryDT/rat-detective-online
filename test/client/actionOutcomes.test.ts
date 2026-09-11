import {describe,it,expect} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ChaosPresentation} from '../../src/shared/ChaosPresentation';
import {WorldPresentationClock} from '../../src/shared/WorldPresentationClock';
import {PresentationEvents} from '../../src/shared/PresentationEvents';
import {ActionJournal,type ShotOutcome} from '../../src/shared/shotOutcome';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {pickupReason,type PickupConditions} from '../../src/shared/pickupEligibility';
import {MAX_MESSAGE_BYTES} from '../../src/shared/networkProtocol';

function simulation(){
 const owner=createPlayer('owner','Owner',DEFAULT_APPEARANCE,{x:0,y:100,z:5});
 const victim=createPlayer('victim','Victim',DEFAULT_APPEARANCE,{x:1.25,y:100,z:0});
 const sim=new ChaosSimulation(new Map([[owner.id,owner],[victim.id,victim]]),()=>{});
 const outcomes:ShotOutcome[]=[];sim.onShotOutcome(event=>outcomes.push(event));sim.step(0,1000);
 return {sim,outcomes};
}
const fire={shotId:'fired',origin:{x:0,y:100.6,z:0},direction:{x:1,y:0,z:0}};
describe('authoritative action outcomes',()=>{
 it('reports a real contact even when birth and death both fall between snapshots',()=>{
  const {sim,outcomes}=simulation();expect(sim.snapshot(false).shots).toHaveLength(0);
  sim.shoot('owner',fire);sim.step(1/60,1017);
  expect(sim.snapshot(false).shots).toHaveLength(0);
  expect(outcomes).toHaveLength(1);expect(outcomes[0]).toMatchObject({shotId:'fired',at:1017,reason:'contact',victimId:'victim',part:'body'});
  expect(parseServerMessage({type:'shotOutcomes',outcomes})).toEqual({type:'shotOutcomes',outcomes});
 });
 it('reports expiry, capacity and reset with unique IDs and preserved shot caps',()=>{
  const {sim,outcomes}=simulation();
  for(let i=0;i<257;i++)sim.shoot('owner',{...fire,shotId:`shot-${i}`,origin:{x:0,y:110,z:0}});
  expect(outcomes).toHaveLength(1);expect(outcomes[0].reason).toBe('capacity');
  expect(sim.snapshot(false).shots).toHaveLength(256);
  sim.step(3,4000);expect(outcomes.filter(e=>e.reason==='expired')).toHaveLength(256);
  sim.shoot('owner',{...fire,shotId:'reset'});sim.reset();expect(outcomes.at(-1)?.reason).toBe('reset');
  expect(new Set(outcomes.map(e=>e.id)).size).toBe(outcomes.length);
 });
 it('suppresses a known terminal birth and cannot resurrect it through duplicate launch or stale state',()=>{
  const {sim}=simulation(),clock=new WorldPresentationClock(),view=new ChaosPresentation(75,clock);
  view.apply(sim.snapshot(false),0);
  const born={type:'playerShot' as const,shooterId:'owner',...fire,launch:{at:1010,balls:[{id:fire.shotId,velocity:{x:175,y:0,z:0}}]}};
  view.launch(born,10);view.outcome({id:'epoch:1',shotId:fire.shotId,at:1017,reason:'contact',p:{x:1,y:100.6,z:0},victimId:'victim',part:'body'});
  view.launch(born,20);const state=sim.snapshot(false);state.time=1030;state.shots=[{id:'fired',owner:'owner',p:fire.origin,v:{x:175,y:0,z:0},age:0}];view.apply(state,30);
  expect(view.renderShots(state.shots,30)).toEqual([]);
 });
 it('retains a mature terminal ball only until the shared source time reaches contact',()=>{
  const {sim}=simulation(),clock=new WorldPresentationClock(),view=new ChaosPresentation(75,clock);
  for(let at=1000;at<=2000;at+=25){const s=sim.snapshot(false);s.time=at;s.shots=[{id:'old',owner:'owner',p:{x:(at-1000)*.1,y:110,z:0},v:{x:100,y:0,z:0},age:1}];view.apply(s,at-1000);view.shot('old',at-1000,{p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1}});}
  view.outcome({id:'epoch:2',shotId:'old',at:2000,reason:'expired',p:{x:100,y:110,z:0}});
  expect(view.renderShots([],1000).map(s=>s.id)).toEqual(['old']);
  for(let at=2025;at<=2150;at+=25){const s=sim.snapshot(false);s.time=at;view.apply(s,at-1000);}
  expect(view.renderShots([],1150)).toEqual([]);
 });
 it('bounds, deduplicates and clears journals and source-time lifecycle queues',()=>{
  const journal=new ActionJournal(),queue=new PresentationEvents<string>(2),seen:string[]=[];
  for(let i=0;i<2000;i++)journal.record('terminal',i,{at:i},String(i));
  expect(journal.snapshot()).toHaveLength(256);expect(journal.record('duplicate',2000,{},'1999')).toBe(false);
  queue.push(20,'respawn');queue.push(10,'death');expect(()=>queue.push(30,'overflow')).toThrow();
 queue.drain(10,v=>seen.push(v));expect(seen).toEqual(['death']);queue.clear();queue.drain(100,v=>seen.push(v));expect(seen).toEqual(['death']);journal.clear();expect(journal.snapshot()).toEqual([]);
 });
it('keeps the published diagnostics journal small enough to stay a valid client message',()=>{
 // The practice harness publishes a diagnostics report every five seconds. A
 // full journal once pushed that report past MAX_MESSAGE_BYTES, so the server
 // answered 'Invalid message' on a loop instead of accepting the report.
 const journal=new ActionJournal();
 for(let i=0;i<600;i++)journal.record('accepted',1000+i,{shotId:`shot-${i}`,at:1000,balls:[`ball-${i}`,'second','third']});
 const summary=journal.summary();
 expect(summary.total).toBe(256);
 expect(summary.recent).toHaveLength(8);
 const payload=JSON.stringify({type:'diagnostics',report:{at:Date.now(),world:{seed:341283204,version:2},input:{},hidden:false,samples:600,
  frameMedianMs:16.7,frameP95Ms:20,longestFrameMs:80,stallsOver100Ms:0,phaseMaxMs:{simulationMs:3,botsMs:2,presentationMs:4,renderMs:11},
  calls:1134,triangles:99000,geometries:815,textures:170,
  details:{network:{receivedCount:9000,receivedBytes:4000000,sentCount:50},shotsAttempted:120,shotsSent:120,chaos:{},snapshotAgeMs:40,projectiles:{},actions:summary,presentation:{}}}});
 expect(payload.length).toBeLessThan(MAX_MESSAGE_BYTES);
});
 it('rejects malformed, oversized and ambiguous results while retaining lifecycle timestamps',()=>{
  expect(parseServerMessage({type:'shotOutcomes',outcomes:Array(33).fill({})})).toBeNull();
  expect(parseServerMessage({type:'shotRejected',shotId:'x',at:NaN,reason:'dead'})).toBeNull();
  expect(parseServerMessage({type:'shotRejected',shotId:'x',at:12,reason:'invented'})).toBeNull();
  expect(parseServerMessage({type:'shotRejected',shotId:'x',at:12,reason:'dead'})).toMatchObject({at:12,reason:'dead'});
  expect(parseServerMessage({type:'playerDamaged',id:'v',hp:2,attackerId:'a',at:12.5})).toMatchObject({at:12.5});
 });
});
describe('pickup eligibility boundaries',()=>{
 const base:PickupConditions={owner:null,playerId:'a',hp:3,playing:true,returning:false,weaponized:false,alreadyHolding:false,speed:18,distance:1.6,waitMs:0};
 it('preserves speed, reach and former-carrier boundaries',()=>{
  expect(pickupReason(base,()=>false)).toBe('eligible');
  expect(pickupReason({...base,speed:18.00001},()=>false)).toBe('tooFast');
  expect(pickupReason({...base,distance:1.60001},()=>false)).toBe('outOfReach');
  expect(pickupReason({...base,waitMs:1},()=>false)).toBe('cooldown');
  expect(pickupReason(base,()=>true)).toBe('blocked');
 });
 it.each([['hp',0,'dead'],['playing',false,'roundOver'],['returning',true,'returning'],['weaponized',true,'weaponized'],['owner','b','heldByOther'],['owner','a','heldByYou']] as const)('explains %s without querying through a gate',(key,value,reason)=>{
  expect(pickupReason({...base,[key]:value},()=>{throw Error('Unnecessary LOS query');})).toBe(reason);
 });
});
