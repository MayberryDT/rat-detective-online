import {describe,expect,it,vi} from 'vitest';
import * as C from 'cannon-es';
import {sweepSphereBody} from '../../src/shared/sweepSphere';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},grayboxBoxes:()=>[]}));
const point=(x:number,y=0,z=0)=>new C.Vec3(x,y,z);
describe('Big Cheese swept collision volume',()=>{
 it('hits a thin wall with its leading surface before its center reaches the wall',()=>{
  const wall=new C.Body({shape:new C.Box(point(.025,5,5))});
  const hit=sweepSphereBody(point(-5),point(5),2,wall);
  expect(hit.hasHit).toBe(true);expect(hit.distance).toBeCloseTo(2.975);expect(hit.hitPointWorld.x).toBeCloseTo(-.025);
 });
 it('detects an edge graze outside the center ray and uses the rounded surface normal',()=>{
  const box=new C.Body({shape:new C.Box(point(1,1,1))});
  const hit=sweepSphereBody(point(-4,1.8),point(4,1.8),1,box);
  expect(hit.hasHit).toBe(true);expect(hit.distance).toBeCloseTo(2.4);
  expect(hit.hitNormalWorld.x).toBeCloseTo(-.6);expect(hit.hitNormalWorld.y).toBeCloseTo(.8);
 });
 it('does not inflate corners into a square hitbox',()=>{
  const box=new C.Body({shape:new C.Box(point(1,1,1))});
  expect(sweepSphereBody(point(-4,1.8,1.8),point(4,1.8,1.8),1,box).hasHit).toBe(false);
 });
 it('respects rotated bodies and shape offsets',()=>{
  const box=new C.Body({position:point(2,3,4)});box.quaternion.setFromEuler(.2,.6,.1);box.addShape(new C.Box(point(1,.5,2)),point(0,2,0));
  const world=(p:C.Vec3)=>box.quaternion.vmult(p.vadd(point(0,2))).vadd(box.position);
  const hit=sweepSphereBody(world(point(-5)),world(point(5)),1,box);
  expect(hit.hasHit).toBe(true);expect(hit.distance).toBeCloseTo(3);
  expect(hit.hitNormalWorld.distanceTo(box.quaternion.vmult(point(-1)))).toBeLessThan(1e-7);
 });
 it('allows a growing overlapping ball to move away from a surface',()=>{
  const box=new C.Body({shape:new C.Box(point(1,1,1))});
  expect(sweepSphereBody(point(1.3),point(3),.5,box).hasHit).toBe(false);
  expect(sweepSphereBody(point(1.3),point(0),.5,box).distance).toBe(0);
 });
 it.each([[1.5,true],[1.9,false]] as const)('uses the actual rat spheres for a lateral graze at %s', (z,expected)=>{
  const now=Date.now(),a=createPlayer('a','A',DEFAULT_APPEARANCE,{x:-20,y:20,z:0}),b=createPlayer('b','B',DEFAULT_APPEARANCE,{x:4,y:20,z});
  const players=new Map([[a.id,a],[b.id,b]]),initial=new ChaosSimulation(players,()=>{}),saved=initial.snapshot(false),hits:any[]=[];
  saved.dispatch={phase:'active',incident:'big-cheese',started:now,until:now+25000,serial:1};
  saved.shots=[{id:'large',owner:'a',age:0,p:{x:0,y:20.6,z:0},v:{x:175,y:0,z:0},radius:1}];
  const sim=new ChaosSimulation(players,h=>hits.push(h),saved);sim.step(.04,now+40);
  expect(hits.some(h=>h.victim==='b')).toBe(expected);expect(hits.some(h=>h.victim==='a')).toBe(false);
 });
 it('resolves the nearer wall before a rat and retains shooter immunity',()=>{
  const now=Date.now(),a=createPlayer('a','A',DEFAULT_APPEARANCE,{x:0,y:20,z:0}),b=createPlayer('b','B',DEFAULT_APPEARANCE,{x:5,y:20,z:0});
  const players=new Map([[a.id,a],[b.id,b]]),initial=new ChaosSimulation(players,()=>{}),saved=initial.snapshot(false),hits:any[]=[];
  saved.dispatch={phase:'active',incident:'big-cheese',started:now,until:now+25000,serial:1};
  saved.shots=[{id:'large',owner:'a',age:0,p:{x:0,y:20.6,z:0},v:{x:175,y:0,z:0},radius:1}];
  const sim=new ChaosSimulation(players,h=>hits.push(h),saved),wall=new C.Body({position:point(3,21,0),shape:new C.Box(point(.025,4,4))});
  sim.world.addBody(wall);sim.targets.set(wall,{kind:'world'});sim.step(.04,now+40);
  expect(hits).toHaveLength(0);expect(sim.snapshot(false).shots[0].v.x).toBeLessThan(0);
 });
});
