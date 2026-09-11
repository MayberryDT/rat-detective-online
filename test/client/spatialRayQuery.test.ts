import { describe,expect,it,vi } from 'vitest';
import * as C from 'cannon-es';
import { StaticCityBroadphase } from '../../src/shared/StaticCityBroadphase';
import { SpatialRayQuery } from '../../src/shared/SpatialRayQuery';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { createPlayer } from '../../src/worker/gameState';
import { DISPATCH_TARGET, CHAOS_TUNING } from '../../src/shared/chaosState';
import { grayboxBoxes, GRAYBOX_SPAWNS } from '../../src/shared/grayboxLayout';

function same(world:C.World,index:SpatialRayQuery,from:C.Vec3,to:C.Vec3,mask=15){
 const expected=new C.RaycastResult();world.raycastClosest(from,to,{collisionFilterGroup:16,collisionFilterMask:mask,skipBackfaces:true},expected);
 const actual=index.closest(from,to,mask);
 expect(actual.hasHit).toBe(expected.hasHit);expect(actual.body).toBe(expected.body);expect(actual.shape).toBe(expected.shape);
 expect(actual.distance).toBeCloseTo(expected.distance,10);
 expect(actual.hitPointWorld.almostEquals(expected.hitPointWorld,1e-10)).toBe(true);
 expect(actual.hitNormalWorld.almostEquals(expected.hitNormalWorld,1e-10)).toBe(true);
}
function fixture(){const world=new C.World();world.broadphase=new C.SAPBroadphase(world);return {world,index:new SpatialRayQuery(world)};}

describe('exact spatial ray broadphase',()=>{
 it('removes static city pair work while retaining all contacts for twelve ordinary rats',()=>{
  const world=new C.World();
  for(const b of grayboxBoxes()){
   const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(b.w/2,b.h/2,b.d/2)),position:new C.Vec3(b.x,b.y,b.z)});
   body.quaternion.setFromEuler(b.rx,0,b.rz);world.addBody(body);
  }
  for(const p of GRAYBOX_SPAWNS){
   const body=new C.Body({mass:5,position:new C.Vec3(p.x,0,p.z)});
   body.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));world.addBody(body);
  }
  const naive=new C.NaiveBroadphase(),indexed=new StaticCityBroadphase(world);
  naive.useBoundingBoxes=indexed.useBoundingBoxes=true;
  const collect=(broadphase:C.Broadphase)=>{
   let checks=0;const original=broadphase.needBroadphaseCollision.bind(broadphase);
   broadphase.needBroadphaseCollision=(a,b)=>{checks++;return original(a,b);};
   const a:C.Body[]=[],b:C.Body[]=[];broadphase.collisionPairs(world,a,b);
   const pairs=a.map((body,i)=>[body.id,b[i].id].sort((x,y)=>x-y).join(':')).sort();
   broadphase.needBroadphaseCollision=original;
   return {checks,pairs};
  };
  const before=collect(naive),after=collect(indexed);
  expect(after.pairs).toEqual(before.pairs);
  expect(after.checks).toBeLessThan(before.checks*.05);
  console.info('City broadphase pair checks', {bodies:world.bodies.length,naive:before.checks,indexed:after.checks,contacts:after.pairs.length});
 });
 it('keeps the exact original SAP contact pair sequence across axes, filters and sleeping bodies',()=>{
  const world=new C.World();const original=new C.SAPBroadphase(world),optimized=new StaticCityBroadphase(world);
  original.useBoundingBoxes=optimized.useBoundingBoxes=true;
  for(let i=0;i<90;i++){
   const body=new C.Body({mass:i%11===0?1:0,type:i%13===0?C.Body.KINEMATIC:undefined,
    shape:new C.Box(new C.Vec3(.3+(i%7),.2+(i%4),.5+(i%8))),
    position:new C.Vec3((i*17)%31,(i*7)%19,(i*11)%23),collisionFilterGroup:i%3===0?2:1,collisionFilterMask:i%5===0?2:-1});
   body.quaternion.setFromEuler(i*.03,i*.11,i*.07);if(i%17===0)body.sleep();world.addBody(body);
  }
  for(const axis of [0,1,2] as const){
   original.axisIndex=optimized.axisIndex=axis;original.dirty=optimized.dirty=true;
   const a:C.Body[]=[],b:C.Body[]=[],c:C.Body[]=[],d:C.Body[]=[];
   original.collisionPairs(world,a,b);optimized.collisionPairs(world,c,d);
   expect(c.map((body,i)=>[body.id,d[i].id])).toEqual(a.map((body,i)=>[body.id,b[i].id]));
  }
 });

 it('matches Cannon on rotated walls, inside/backface exits, compound heads, filters and equal-distance targets',()=>{
  const {world,index}=fixture();
  const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.1,3,4)),position:new C.Vec3(4,0,0)});wall.quaternion.setFromEuler(.2,.4,.1);world.addBody(wall);
  const rat=new C.Body({type:C.Body.KINEMATIC,collisionFilterGroup:2,collisionFilterMask:16});rat.addShape(new C.Sphere(.6),new C.Vec3(0,.6,0));rat.addShape(new C.Sphere(.28),new C.Vec3(0,1.9,0));world.addBody(rat);
  const target=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.2,.2,.2)),position:new C.Vec3(1,2,0)});world.addBody(target);
  const duplicate=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.2,.2,.2)),position:target.position.clone()});world.addBody(duplicate);
  index.refresh();
  for(const y of [0,.6,1.9,2,4])for(const mask of [1,2,15]){
   same(world,index,new C.Vec3(-4,y,0),new C.Vec3(8,y,0),mask);
   same(world,index,new C.Vec3(4,y,0),new C.Vec3(-4,y,0),mask);
  }
  same(world,index,new C.Vec3(0,.6,0),new C.Vec3(3,.6,0));
  target.collisionResponse=false;duplicate.shapes[0].collisionResponse=false;
  same(world,index,new C.Vec3(-4,2,0),new C.Vec3(8,2,0));
 });
 it.each([false,true])('filters the owner before closest-hit selection with client projectile groups (SAP=%s)',sap=>{
  const world=new C.World();if(sap)world.broadphase=new C.SAPBroadphase(world);
  const owner=new C.Body({mass:1,shape:new C.Sphere(.6),collisionFilterMask:4});
  const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.05,2,2)),position:new C.Vec3(2,0,0),collisionFilterMask:4});
  world.addBody(owner);world.addBody(wall);const query=new SpatialRayQuery(world),from=new C.Vec3(-2,0,0),to=new C.Vec3(4,0,0);
  const hit=query.closest(from,to,1,body=>body!==owner,4);expect(hit.body).toBe(wall);expect(hit.hitPointWorld.x).toBeCloseTo(1.95);
  expect(query.closest(from,to,1,body=>body!==owner,16).hasHit).toBe(false);
  const remove=vi.spyOn(world,'removeEventListener');query.dispose();expect(remove).toHaveBeenCalledTimes(2);
 });
 it('handles added/removed fixtures, moved statics, body type changes and moving bodies',()=>{
  const {world,index}=fixture();index.refresh();
  const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(1,1,1))});world.addBody(body);
  const from=new C.Vec3(-3,0,0),to=new C.Vec3(3,0,0);same(world,index,from,to);
  body.position.set(10,0,0);body.updateAABB();index.refresh();same(world,index,from,to);
  body.type=C.Body.KINEMATIC;index.refresh();body.position.set(0,0,0);body.updateAABB();same(world,index,from,to);
  world.removeBody(body);same(world,index,from,to);
  world.broadphase=new C.NaiveBroadphase();world.addBody(body);same(world,index,from,to);
 });
 it('matches the complete real-map 120-ball burst trajectory and physical aftermath',()=>{
  const make=(legacy:boolean)=>{
   const p=createPlayer('p','Rat',{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:-16,y:0,z:-28});
   // Case spawn is intentionally randomized independently of the city seed.
   // Compare broadphases from identical physical initial conditions.
   const sim=(()=>{
    const spawnSelection=vi.spyOn(Math,'random').mockReturnValue(0);
    try{return new ChaosSimulation(new Map([[p.id,p]]),()=>{},undefined,{version:2,seed:42});}
    finally{spawnSelection.mockRestore();}
   })();
   if(legacy){sim.world.broadphase=new C.SAPBroadphase(sim.world);sim.world.broadphase.useBoundingBoxes=true;}
   if(legacy)(sim as unknown as {ray:Function}).ray=(from:C.Vec3,to:C.Vec3,mask:number)=>{const result=new C.RaycastResult();sim.world.raycastClosest(from,to,{collisionFilterGroup:16,collisionFilterMask:mask,skipBackfaces:true},result);return result;};
   sim.shoot('p',{shotId:'dispatch',origin:{x:DISPATCH_TARGET.x,y:DISPATCH_TARGET.y,z:DISPATCH_TARGET.z+1},direction:{x:0,y:0,z:-1}});
   const selection=vi.spyOn(Math,'random').mockReturnValue(0);
   sim.step(.01,1000);selection.mockRestore();sim.step(0,1000+CHAOS_TUNING.rollMs);p.hp=0;sim.death(p,{x:1,y:.15,z:.3});return sim;
  };
  const indexed=make(false),legacy=make(true);
  const strip=(sim:ChaosSimulation)=>{
   const state=sim.snapshot();return {shots:state.shots.map(({id:_id,...s})=>s),case:state.case,corpses:state.corpses.map(({id:_id,...c})=>c),impacts:state.impacts,dispatch:state.dispatch,pressure:state.pressure};
  };
  expect(indexed.snapshot(false).shots).toHaveLength(121);
  for(let tick=1;tick<=120;tick++){
   const now=1000+CHAOS_TUNING.rollMs+tick*1000/60;indexed.step(1/60,now);legacy.step(1/60,now);
   expect(strip(indexed)).toEqual(strip(legacy));
  }
 },15000);
});
