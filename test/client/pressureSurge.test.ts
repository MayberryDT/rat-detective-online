import {afterEach,describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {CHAOS_TUNING as T,LAUNCH_MACHINES,PRESSURE_LAUNCH} from '../../src/shared/chaosState';
import {SURGE} from '../../src/shared/launcherVelocity';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
import type {PlayerData} from '../../src/shared/networkProtocol';

vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));
const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
const now=100_000;

function fixture(surge:boolean,rats:PlayerData[]){
 const players=new Map(rats.map(p=>[p.id,p]));
 let sim=new ChaosSimulation(players,()=>{});sim.step(0,now);
 if(surge){const saved=sim.snapshot(false);saved.dispatch={phase:'active',started:now,until:now+T.activeMs,serial:1,incident:'pressure-surge'};sim=new ChaosSimulation(players,()=>{},saved);sim.step(0,now);}
 // The graybox is mocked empty: give the street a surface to find.
 const ground=new C.Body({mass:0,shape:new C.Plane()});ground.quaternion.setFromEuler(-Math.PI/2,0,0);
 sim.world.addBody(ground);sim.targets.set(ground,{kind:'world'});
 return sim;
}
function run(sim:ChaosSimulation,from:number,seconds:number,each?:(t:number)=>void):number {
 let t=from;for(let i=0;i<seconds*30;i++){t+=1000/30;each?.(t);sim.step(1/30,t);}return t;
}

describe('Pressure Surge chaos',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('opens street launchers beside rats that erupt after the steam warning and throw whoever stands on them',()=>{
  const rat=createPlayer('rat','Rat',appearance,{x:0,y:0,z:0});
  const sim=fixture(true,[rat]);
  let vent:{x:number;z:number;at:number}|undefined;
  run(sim,now,3,t=>{
   vent??=sim.snapshot(false).pressure!.vents?.find(v=>Math.hypot(v.x,v.z)<9);
   // Step onto the first launcher that opens beside us and wait there.
   if(vent&&t<vent.at){rat.x=vent.x;rat.z=vent.z;}
  });
  expect(vent).toBeDefined();
  const launches=sim.snapshot(false).pressure!.launches.filter(e=>e.playerId==='rat');
  expect(launches.length).toBeGreaterThan(0);expect(launches[0]!.machineId).toBeUndefined();
  expect(parseServerMessage({type:'chaos',state:sim.snapshot(false)})).not.toBeNull();
 });
 it('never opens launchers, pulls rats or fills machines outside the surge',()=>{
  const near=createPlayer('near','Near',appearance,{x:PRESSURE_LAUNCH.pad.x+9,y:0,z:PRESSURE_LAUNCH.pad.z});
  const sim=fixture(false,[near]);run(sim,now,6);
  const pressure=sim.snapshot(false).pressure!;
  expect(pressure.vents).toBeUndefined();expect(pressure.shoves).toBeUndefined();expect(pressure.levels).toEqual({});
 });
 it('pulls rats near a pad toward it, but not rats far away',()=>{
  const pad=PRESSURE_LAUNCH.pad;
  const near=createPlayer('near','Near',appearance,{x:pad.x+9,y:0,z:pad.z}),far=createPlayer('far','Far',appearance,{x:pad.x+40,y:0,z:pad.z});
  const sim=fixture(true,[near,far]);sim.step(1/30,now+40);
  const shoves=sim.snapshot(false).pressure!.shoves??[];
  const pull=shoves.find(s=>s.playerId==='near');
  expect(pull?.velocity.x).toBeLessThan(0);
  expect(shoves.some(s=>s.playerId==='far'&&s.id.startsWith('pull'))).toBe(false);
 });
 it('ends with every machine blowing as an overpressure and a launcher under every street rat',()=>{
  const rat=createPlayer('rat','Rat',appearance,{x:0,y:0,z:0});
  const sim=fixture(true,[rat]);
  const finale=now+T.activeMs-SURGE.finaleMs;
  run(sim,finale-100,.2);
  const pressure=sim.snapshot(false).pressure!;
  for(const m of LAUNCH_MACHINES)expect(pressure.boosts?.[m.id],m.id).toBe(pressure.blowing?.[m.id]);
  expect(pressure.vents?.some(v=>v.boost&&Math.hypot(v.x-rat.x,v.z-rat.z)<.5)).toBe(true);
  // The test rat never leaves the ground, so a later ordinary vent may throw it again
  // and replace its event: look for the overpressure throw at any step.
  let boosted=false;
  run(sim,finale+100,1,()=>{boosted||=sim.snapshot(false).pressure!.launches.some(e=>e.playerId==='rat'&&e.boost);});
  expect(boosted).toBe(true);
 });
});
