import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {PRESSURE_LAUNCH} from '../../src/shared/chaosState';
import {pump} from './pressureTestKit';
import {createPlayer} from '../../src/worker/gameState';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const now=1000;
const pad=PRESSURE_LAUNCH.pad;

function fixture(){
 const shooter=createPlayer('shooter','Shooter',appearance,{x:-50,y:20,z:0});
 const victim=createPlayer('victim','Victim',appearance,{x:pad.x,y:0,z:pad.z});
 const players=new Map([shooter,victim].map(p=>[p.id,p]));
 const sim=new ChaosSimulation(players,()=>{});sim.step(0,now);
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
});
