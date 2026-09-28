import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,PRESSURE_LAUNCH} from '../../src/shared/chaosState';
import {pump} from './pressureTestKit';
import {createPlayer} from '../../src/worker/gameState';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const now=1000;
const pad=PRESSURE_LAUNCH.pad;

function fixture(incident?:'planted-evidence'){
 const shooter=createPlayer('shooter','Shooter',appearance,{x:-50,y:20,z:0});
 const victim=createPlayer('victim','Victim',appearance,{x:pad.x,y:0,z:pad.z});
 const players=new Map([shooter,victim].map(p=>[p.id,p]));
 let sim=new ChaosSimulation(players,()=>{});sim.step(0,now);
 if(incident){
  const saved=sim.snapshot(false);saved.dispatch={phase:'active',started:now,until:now+T.activeMs,serial:1,incident};
  sim=new ChaosSimulation(players,()=>{},saved);sim.step(0,now);
 }
 const ground=new C.Body({mass:0,shape:new C.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);
 sim.world.addBody(ground);sim.targets.set(ground,{kind:'world'});
 return {sim,victim};
}
function trigger(sim:ChaosSimulation,at:number):number {return pump(sim,'shooter',PRESSURE_LAUNCH,at);}

describe('everything on the pad flies',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('throws a body lying on the pad high into the air',()=>{
  const {sim,victim}=fixture();
  victim.hp=0;sim.death(victim,{x:1,y:0,z:0},'shooter');
  const body=[...sim.targets].find(([,t])=>t.kind==='corpse')![0];
  body.position.set(pad.x,.5,pad.z);body.velocity.setZero();body.angularVelocity.setZero();
  trigger(sim,now+10);
  expect(sim.snapshot(false).corpses[0].v.y).toBeGreaterThan(30);
 });
 it('throws a counterfeit that then re-plants itself where it lands, still a live hazard',()=>{
  const {sim,victim}=fixture('planted-evidence');
  // Nobody on the pad: a rat touching the counterfeit would detonate it.
  victim.x=0;victim.z=0;
  const fakes=sim.snapshot(false).extraCases!.filter(c=>c.fake);
  expect(fakes.length).toBeGreaterThan(0);
  const id=fakes[0].id,body=[...sim.targets].find(([,t])=>t.kind==='case'&&t.caseId===id)![0];
  body.position.set(pad.x,.5,pad.z);body.updateAABB();
  let peak=0,t=trigger(sim,now+10);
  const find=()=>sim.snapshot(false).extraCases!.find(c=>c.id===id)!;
  for(let i=0;i<60*12;i++){t+=1000/60;sim.step(1/60,t);peak=Math.max(peak,find().p.y);}
  expect(peak).toBeGreaterThan(20);
  const landed=find();
  expect(landed.fake).toBe(true);
  expect(landed.p.y).toBeLessThan(2);
  for(const c of [landed.p.x,landed.p.z]){expect(c).toBeGreaterThan(-196);expect(c).toBeLessThan(166);}
  for(let i=0;i<60;i++){t+=1000/60;sim.step(1/60,t);}
  expect(find().p).toEqual(landed.p);
 });
});
