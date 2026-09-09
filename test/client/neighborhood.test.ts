import {expect,it} from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {Neighborhood,ENTRIES} from '../../src/prototype/Neighborhood';
import {RatController} from '../../src/player/RatController';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {GRAYBOX_SPAWNS} from '../../src/shared/grayboxLayout';
import {RatEntity} from '../../src/entities/RatEntity';
import {StaticCityBroadphase} from '../../src/shared/StaticCityBroadphase';

// Use the normal game's world bookkeeping for the complete expanded city.
// Contacts, gravity, rat shapes, movement and assertions stay unchanged.
function cityPhysicsWorld() {
 const world=new CANNON.World({gravity:new CANNON.Vec3(0,-25,0)});
 world.broadphase=new StaticCityBroadphase(world);
 world.broadphase.useBoundingBoxes=true;
 world.collisionMatrix=new CANNON.ObjectCollisionMatrix() as unknown as CANNON.ArrayCollisionMatrix;
 world.collisionMatrixPrevious=new CANNON.ObjectCollisionMatrix() as unknown as CANNON.ArrayCollisionMatrix;
 return world;
}

it('allows the existing rat body to descend and climb each sewer ramp',()=>{
 const scene=new THREE.Scene();const world=cityPhysicsWorld();
 world.defaultContactMaterial.friction=0;world.defaultContactMaterial.restitution=0.05;
 const stage=new Neighborhood(scene,world);
 for(const entry of ENTRIES){
  const rat=new RatEntity(scene,world,new THREE.Vector3(entry.x,0.05,entry.z),'',{});
  const axis=entry.axis;
  const sign=Math.sign(entry[axis]);
  for(let i=0;i<300;i++){rat.body.velocity[axis]=-sign*6;world.step(1/60);rat.update(1/60);}
  expect(Math.abs(rat.body.position[axis])).toBeLessThan(Math.abs(entry[axis])-26);
  expect(rat.body.position.y).toBeLessThan(-6.7);
  for(let i=0;i<330;i++){rat.body.velocity[axis]=sign*6;world.step(1/60);rat.update(1/60);}
  expect(Math.abs(rat.body.position[axis])).toBeGreaterThan(Math.abs(entry[axis])-2);
  expect(rat.body.position.y).toBeGreaterThan(-0.15);
  rat.dispose();
 }
 stage.dispose();expect(world.bodies).toHaveLength(0);
},15000);

it('connects the three sewer branches through the junction',()=>{
 const scene=new THREE.Scene();const world=cityPhysicsWorld();
 world.defaultContactMaterial.friction=0;
 const stage=new Neighborhood(scene,world);
 const rat=new RatEntity(scene,world,new THREE.Vector3(-18,-7,0),'',{});
 for(const [x,z] of [[18,0],[0,0],[0,18],[0,0],[-18,0]]) {
  for(let i=0;i<600;i++){
   const dx=x-rat.body.position.x,dz=z-rat.body.position.z,d=Math.hypot(dx,dz);
   if(d<0.15)break;
   rat.body.velocity.x=dx/d*Math.min(8,d*10);rat.body.velocity.z=dz/d*Math.min(8,d*10);
   world.step(1/60);
  }
  expect(Math.hypot(x-rat.body.position.x,z-rat.body.position.z)).toBeLessThan(0.2);
  expect(rat.body.position.y).toBeGreaterThan(-7.1);
 }
 rat.dispose();stage.dispose();
});

it('raycasts against transformed static walls before the first physics step',()=>{
 const scene=new THREE.Scene(),world=new CANNON.World();
 const stage=new Neighborhood(scene,world);
 for(const [from,to] of [
  [new CANNON.Vec3(-16,-4,0),new CANNON.Vec3(-16,-4,-8)],
  [new CANNON.Vec3(0,-4,0),new CANNON.Vec3(0,2,0)],
  [new CANNON.Vec3(102,3,-60),new CANNON.Vec3(108,3,-60)]
 ])expect(world.raycastClosest(from,to,{},new CANNON.RaycastResult())).toBe(true);
 stage.dispose();
});

it('rebounds a cheese ball from a sewer wall with the existing restitution',()=>{
 const scene=new THREE.Scene(),world=new CANNON.World();
 const stage=new Neighborhood(scene,world);
 const owner=new RatEntity(scene,world,new THREE.Vector3(-10,0,-27),'',{});
 const gun=new CheeseGun(scene,world,{} as THREE.AudioListener);
 const before=new Set(scene.children);
 gun.replayShot(owner,{shotId:'sewer',origin:{x:-16,y:-4,z:-1},direction:{x:0,y:0,z:-1}});
 const ball=scene.children.find(o=>!before.has(o))!;
 gun.update(.02);
 expect(ball.position.z).toBeCloseTo(-3.95);
 gun.update(.01);
 expect(ball.position.z).toBeCloseTo(-2.375);
 gun.dispose();owner.dispose();stage.dispose();
});

it('keeps every shared spawn above ground and clear of solid scenery',()=>{
 const scene=new THREE.Scene(),world=cityPhysicsWorld();
 const stage=new Neighborhood(scene,world);
 for(const spawn of GRAYBOX_SPAWNS){
  const rat=new RatEntity(scene,world,new THREE.Vector3(spawn.x,spawn.y,spawn.z),'',{});
  for(let i=0;i<90;i++)world.step(1/60);
  expect(Math.hypot(rat.body.position.x-spawn.x,rat.body.position.z-spawn.z),JSON.stringify(spawn)).toBeLessThan(.1);
  expect(rat.body.position.y).toBeGreaterThan(-.1);
  expect(rat.body.position.y).toBeLessThan(.2);
  rat.dispose();
 }
 stage.dispose();
});

it('pulls the shared camera in front of a wall without moving the rat',()=>{
 const scene=new THREE.Scene(),world=new CANNON.World(),camera=new THREE.PerspectiveCamera();
 const wall=new THREE.Mesh(new THREE.BoxGeometry(20,20,1),new THREE.MeshBasicMaterial());
 wall.position.set(0,5,-3);wall.userData.aimTarget=true;scene.add(wall);
 const player=new RatController(scene,world,camera,'',{},new THREE.Vector3());
 const before=player.entity.body.position.clone();
 player.updateView();
 expect(camera.position.z).toBeGreaterThan(-2.5);
 expect(camera.position.z).toBeLessThan(0);
 expect(player.entity.body.position).toEqual(before);
 player.dispose();wall.geometry.dispose();(wall.material as THREE.Material).dispose();
});

it.each([0,3,1.2])('keeps the center aim ray clear of the rat (wall distance: %s)',wallBehind=>{
 const scene=new THREE.Scene(),world=new CANNON.World(),camera=new THREE.PerspectiveCamera(60,16/9,.1,600);
 if(wallBehind){
  const wall=new THREE.Mesh(new THREE.BoxGeometry(20,20,1),new THREE.MeshBasicMaterial());
  wall.position.set(0,5,-wallBehind);wall.userData.aimTarget=true;scene.add(wall);
 }
 const player=new RatController(scene,world,camera,'',{},new THREE.Vector3());
 player.updateView();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(),camera);
 expect(ray.intersectObject(player.entity.mesh,true)).toHaveLength(0);
 player.dispose();
});
