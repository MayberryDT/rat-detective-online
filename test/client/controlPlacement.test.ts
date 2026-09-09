import {it,expect} from 'vitest';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {grayboxBoxes} from '../../src/shared/grayboxLayout';
import * as C from 'cannon-es';
import {DISPATCH_STATIONS,LAUNCH_MACHINES} from '../../src/shared/chaosState';
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

it('keeps each launcher paired with its closest remote trigger, spread across open streets',()=>{
 expect(LAUNCH_MACHINES).toHaveLength(6);
 expect(new Set(LAUNCH_MACHINES.map(m=>`${m.target.x},${m.target.z}`)).size).toBe(6);
 const pump=LAUNCH_MACHINES.find(m=>m.id==='pressure')!;
 expect(pump.target).toMatchObject({x:90,z:145});
 const world=new C.World();
 for(const b of grayboxBoxes()){
  const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2)),position:new C.Vec3(b.x,b.y,b.z)});
  body.quaternion.setFromEuler(b.rx,0,b.rz);world.addBody(body);
 }
 for(const m of LAUNCH_MACHINES){
  const distance=Math.hypot(m.target.x-m.pad.x,m.target.z-m.pad.z);
  expect(distance,m.id).toBeGreaterThanOrEqual(30);expect(distance,m.id).toBeLessThanOrEqual(65);
  for(const other of LAUNCH_MACHINES.filter(other=>other.id!==m.id)){
   // Both ends of the relationship are locally unambiguous, with room to spare.
   expect(Math.hypot(other.target.x-m.pad.x,other.target.z-m.pad.z)-distance,`${m.id} nearest trigger margin`).toBeGreaterThan(20);
   expect(Math.hypot(other.pad.x-m.target.x,other.pad.z-m.target.z)-distance,`${m.id} nearest launcher margin`).toBeGreaterThan(20);
   expect(Math.hypot(other.target.x-m.target.x,other.target.z-m.target.z),`${m.id}/${other.id} trigger separation`).toBeGreaterThan(60);
  }
  expect(DISPATCH_STATIONS.every(s=>Math.hypot(s.box.x-m.box.x,s.box.z-m.box.z)>10),m.id).toBe(true);
  expect(LAUNCH_MACHINES.every(other=>Math.hypot(other.pad.x-m.box.x,other.pad.z-m.box.z)>other.pad.radius+4),m.id).toBe(true);
  expect(m.target.y-m.target.h/2,`${m.id} red crown above housing`).toBeGreaterThanOrEqual(m.box.y+m.box.h/2);
  const padView=new C.RaycastResult();
  world.raycastClosest(new C.Vec3(m.pad.x,2.2,m.pad.z),new C.Vec3(m.target.x,m.target.y,m.target.z),{},padView);
  expect(padView.hasHit,`${m.id} trigger visible from its pad`).toBe(false);
  let longViews=0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const hit=new C.RaycastResult();
   const start=new C.Vec3(m.target.x,m.target.y,m.target.z);
   world.raycastClosest(start,new C.Vec3(start.x+dx*6,start.y,start.z+dz*6),{},hit);
   expect(hit.hasHit,`${m.id} blocked public approach ${dx},${dz}`).toBe(false);
   world.raycastClosest(start,new C.Vec3(start.x+dx*40,start.y,start.z+dz*40),{},hit);
   if(!hit.hasHit)longViews++;
  }
  expect(longViews,`${m.id} publicly visible street approaches`).toBeGreaterThanOrEqual(2);
 }
});

it('activates every red crown from all four sides in the actual city collision world',()=>{
 const appearance={hatType:'fedora' as const,hatColor:1,coatColor:2,furColor:3};
 const players=LAUNCH_MACHINES.map(m=>createPlayer(m.id,m.id,appearance,{...m.pad}));
 const sim=new ChaosSimulation(new Map(players.map(p=>[p.id,p])),()=>{});
 let now=1000;sim.step(0,now);
 for(const m of LAUNCH_MACHINES){
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   now+=6000;
   sim.shoot(m.id,{shotId:`remote-${m.id}-${dx}-${dz}`,
    origin:{x:m.target.x+dx*4,y:m.target.y,z:m.target.z+dz*4},direction:{x:-dx,y:0,z:-dz}});
   for(let step=0;step<3;step++)sim.step(.01,now+step*10);
   expect(sim.snapshot(false).pressure!.launches.find(e=>e.playerId===m.id&&e.at>=now),`${m.id} red crown ${dx},${dz}`).toBeDefined();
  }
 }
});
