import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {RatController} from '../../src/player/RatController';
import {CITY_BOUNDS} from '../../src/shared/grayboxLayout';
import type {ChaosState} from '../../src/shared/chaosState';

function fixture(enabled=true){
 const world=new C.World({gravity:new C.Vec3(0,-25,0)});
 const rat=new RatController(new THREE.Scene(),world,new THREE.PerspectiveCamera(),'',{},new THREE.Vector3(0,20,0),enabled?CITY_BOUNDS:undefined);
 const launch=()=>rat.applyPressureLaunches({time:1000,pressure:{launches:[{id:'test',at:1000,playerId:'local',velocity:{x:30,y:50,z:30}}]}} as ChaosState,'local');
 return {world,rat,launch};
}
describe('launcher flight boundary containment',()=>{
 it('deflects outward momentum near each edge and clamps physics kicks beyond it without changing vertical motion',()=>{
  const {rat,launch}=fixture();launch();
  for(const axis of ['x','z'] as const)for(const direction of [-1,1]){
   const edge=direction<0?CITY_BOUNDS.min:CITY_BOUNDS.max;
   rat.entity.body.position.set(0,40,0);rat.entity.body.position[axis]=edge-direction*6;
   rat.entity.body.velocity.set(0,17,0);rat.entity.body.velocity[axis]=direction*40;
   rat.syncAfterPhysics(0);
   expect(rat.entity.body.velocity[axis]*direction).toBeLessThan(0);
   expect(rat.entity.body.velocity.y).toBe(17);
   rat.entity.body.position[axis]=edge+direction*80;
   rat.entity.body.velocity[axis]=direction*80;
   rat.syncAfterPhysics(0);
   expect(rat.entity.body.position[axis]).toBe(edge-direction*3);
   expect(rat.entity.mesh.position[axis]).toBe(edge-direction*3);
   expect(rat.entity.body.velocity[axis]*direction).toBeLessThan(0);
  }
  rat.dispose();
 });
 it('remains active through descent after the initial movement hold expires',()=>{
  const {rat,launch}=fixture();launch();
  // Initial two-second hold is long over, but the rat has not landed.
  for(let i=0;i<240;i++)rat.prepareMovement(1/60,{KeyW:true});
  rat.entity.body.position.set(CITY_BOUNDS.max+25,20,CITY_BOUNDS.min-25);
  rat.entity.body.velocity.set(30,-30,-30);rat.syncAfterPhysics(0);
  expect(rat.entity.body.position.x).toBe(CITY_BOUNDS.max-3);
  expect(rat.entity.body.position.z).toBe(CITY_BOUNDS.min+3);
  expect(rat.entity.body.velocity.y).toBe(-30);
  rat.dispose();
 });
 it('does not affect legacy launches, ordinary movement, or a reset after landing/respawning',()=>{
  for(const enabled of [false,true]){
   const {rat,launch}=fixture(enabled);
   for(const stage of ['ordinary','reset']){
    if(stage==='reset'){launch();rat.resetGrounding();}
    rat.entity.body.position.x=CITY_BOUNDS.max+20;rat.entity.body.velocity.x=30;rat.syncAfterPhysics(0);
    expect(rat.entity.body.position.x).toBe(CITY_BOUNDS.max+20);
    expect(rat.entity.body.velocity.x).toBe(30);
   }
   if(!enabled){launch();rat.entity.body.position.x=CITY_BOUNDS.max+20;rat.syncAfterPhysics(0);expect(rat.entity.body.position.x).toBe(CITY_BOUNDS.max+20);}
   rat.dispose();
  }
 });
 it('clears containment when actual ground contact ends the flight',()=>{
  const {rat,world,launch}=fixture();launch();
  const floor=new C.Body({mass:0,shape:new C.Plane()});floor.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(floor);
  rat.entity.body.position.set(0,.2,0);rat.entity.body.velocity.set(0,-1,0);
  for(let i=0;i<12;i++){world.step(1/60);rat.syncAfterPhysics(1/60);}
  rat.entity.body.position.set(CITY_BOUNDS.max+20,20,0);rat.entity.body.velocity.set(30,0,0);rat.syncAfterPhysics(0);
  expect(rat.entity.body.position.x).toBe(CITY_BOUNDS.max+20);
  rat.dispose();
 });
});
