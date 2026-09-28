import {it,expect} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {grayboxBoxes} from '../../src/shared/grayboxLayout';
import * as C from 'cannon-es';
import {DISPATCH_STATIONS,LAUNCH_MACHINES,PRESSURE_TUNING} from '../../src/shared/chaosState';
it('keeps every cabinet and the pressure launch pad outside walls and vehicles',()=>{
 const boxes=grayboxBoxes().filter(b=>b.y+b.h/2>.25 && b.y-b.h/2<3 && !b.rx&&!b.rz);
 for(const [id,d] of [...DISPATCH_STATIONS.map(s=>[s.id,s.box] as const),...LAUNCH_MACHINES.map(m=>[m.id,m.box] as const)]){
  const overlap=boxes.filter(b=>Math.abs(b.x-d.x)<(b.w+d.w)/2 && Math.abs(b.z-d.z)<(b.d+d.d)/2);
  expect(overlap,`${id} cabinet conflicts: ${JSON.stringify(overlap)}`).toEqual([]);
 }
 for(const {id,pad} of LAUNCH_MACHINES){
 const padConflicts=boxes.filter(b=>Math.hypot(Math.max(0,Math.abs(b.x-pad.x)-b.w/2),Math.max(0,Math.abs(b.z-pad.z)-b.d/2))<pad.radius);
 expect(padConflicts,`${id} pad`).toEqual([]);
 }
});

it('puts every machine and its red trigger on its own pad\'s rim, facing open street',()=>{
 expect(LAUNCH_MACHINES).toHaveLength(6);
 const world=new C.World();
 for(const b of grayboxBoxes()){
  const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2)),position:new C.Vec3(b.x,b.y,b.z)});
  body.quaternion.setFromEuler(b.rx,0,b.rz);world.addBody(body);
 }
 for(const m of LAUNCH_MACHINES){
  const distance=Math.hypot(m.box.x-m.pad.x,m.box.z-m.pad.z);
  // Beside its pad (not on it), never nearer another pad.
  expect(distance,m.id).toBeGreaterThan(m.pad.radius+m.box.w/2-.5);expect(distance,m.id).toBeLessThan(m.pad.radius+4);
  expect(LAUNCH_MACHINES.every(other=>other===m||Math.hypot(other.pad.x-m.box.x,other.pad.z-m.box.z)>other.pad.radius+4),m.id).toBe(true);
  expect(DISPATCH_STATIONS.every(s=>Math.hypot(s.box.x-m.box.x,s.box.z-m.box.z)>5),m.id).toBe(true);
  expect(m.target.y-m.target.h/2,`${m.id} red trigger above the machine`).toBeGreaterThanOrEqual(m.box.y+m.box.h/2);
  expect(m.target.w,`${m.id} big trigger`).toBeGreaterThanOrEqual(1.6);
  // A rider on the pad can shoot its own trigger.
  const padView=new C.RaycastResult();
  world.raycastClosest(new C.Vec3(m.pad.x,2.2,m.pad.z),new C.Vec3(m.target.x,m.target.y,m.target.z),{},padView);
  expect(padView.hasHit,`${m.id} trigger visible from its pad`).toBe(false);
  let longViews=0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const hit=new C.RaycastResult(),start=new C.Vec3(m.target.x,m.target.y,m.target.z);
   world.raycastClosest(start,new C.Vec3(start.x+dx*40,start.y,start.z+dz*40),{},hit);
   if(!hit.hasHit)longViews++;
  }
  expect(longViews,`${m.id} visible down the street`).toBeGreaterThanOrEqual(1);
 }
});

it('fills every red trigger from any side in the actual city collision world',()=>{
 const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
 const shooter=createPlayer('shooter','Shooter',appearance,{x:0,y:0,z:0});
 const sim=new ChaosSimulation(new Map([[shooter.id,shooter]]),()=>{});
 let now=1000;sim.step(0,now);
 for(const m of LAUNCH_MACHINES){
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   now+=100;
   sim.shoot('shooter',{shotId:`side-${m.id}-${dx}-${dz}`,
    origin:{x:m.target.x+dx*2.4,y:m.target.y,z:m.target.z+dz*2.4},direction:{x:-dx,y:0,z:-dz}});
   for(let step=0;step<3;step++)sim.step(.01,now+step*10);
  }
  expect(sim.snapshot(false).pressure!.levels[m.id],`${m.id} four hits`).toBeCloseTo(4*PRESSURE_TUNING.hit,5);
 }
});
