import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {RatController} from '../../src/player/RatController';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {createPlayer} from '../../src/worker/gameState';
import { ChaosView } from '../../src/prototype/ChaosView';
import { CASE_HOME, CHAOS_TUNING, type ChaosState } from '../../src/shared/chaosState';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} setScores(){} dispose(){}}}));
vi.mock('../../src/shared/grayboxLayout',()=>({CITY_BOUNDS:{min:-196,max:166},SEWER_FLOOR:-7,grayboxBoxes:()=>[]}));

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 1000);
beforeAll(() => {
 vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
 vi.stubGlobal('document', {
  createElement: () => ({ width: 0, height: 0, style: {}, remove() {}, appendChild() {}, setAttribute() {},
    getContext: () => ({ fillRect() {}, fillText() {}, clearRect() {}, strokeText() {} }) }),
  body: { appendChild() {} },
 });
});
afterAll(() => { vi.stubGlobal('document', originalDocument); vi.stubGlobal('window', originalWindow); });

function snapshot(): ChaosState {
  return { time: 1000, case: { p: { ...CASE_HOME }, q: { x: 0, y: 0, z: 0, w: 1 },
    v: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 }, owner: null,
    previousOwner: null, pickupAfter: 0, returningUntil: 0 },
    dispatch: { phase: 'ready', started: 0, until: 0, serial: 0 }, possession: {},
    corpses: [], impacts: [], notice: { serial: 0, text: '' }, shots: [] };
}
const shot = { shotId: 'local-shot', origin: { x: 0, y: 2, z: 0 }, direction: { x: 1, y: 0, z: 0 } };

describe('authoritative ball presentation', () => {
  it.each([undefined,'bad-ammunition','scattershot'] as const)('draws the actual server balls from the shoulder-camera muzzle with one instance per ID: %s',incident=>{
    const clock=vi.spyOn(performance,'now').mockReturnValue(0),scene=new THREE.Scene(),world=new C.World();
    const player=new RatController(scene,world,camera,'Shooter',{},new THREE.Vector3(0,100,0));player.updateView();
    const gun=new CheeseGun(scene,world,{} as THREE.AudioListener);gun.authoritative=true;gun.setPlayer(camera,player.entity);
    const rat=createPlayer('shooter','Shooter',{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},{x:0,y:100,z:0});
    const players=new Map([[rat.id,rat]]),at=Date.now();let sim=new ChaosSimulation(players,()=>{});sim.step(0,at);
    const initial=sim.snapshot(false);
    if(incident){initial.dispatch={phase:'active',incident,started:at,until:at+25000,serial:1};sim=new ChaosSimulation(players,()=>{},initial);}
    const view=new ChaosView(scene,id=>id===rat.id?player.entity:undefined,undefined,true);view.setScores([],rat.id);view.apply(initial);
    try{
      const descriptor=gun.shoot(player.entity,new THREE.Vector3(0,100,100))!;
      const muzzle=player.entity.getMuzzlePosition();expect(descriptor.origin).toEqual(muzzle);
      const fired=sim.shoot(rat.id,descriptor);
      const birth={type:'playerShot' as const,shooterId:rat.id,...descriptor,launch:{at:sim.time,balls:fired.map(ball=>({id:ball.id,velocity:{...ball.v}}))}};
      clock.mockReturnValue(40);view.launch(birth);
      sim.step(.05,at+60);const travelled=sim.snapshot(false);
      expect(travelled.shots.every(ball=>new THREE.Vector3(ball.p.x,ball.p.y,ball.p.z).distanceTo(muzzle)>8)).toBe(true);
      clock.mockReturnValue(70);view.apply(travelled);
      clock.mockReturnValue(80);view.update(1/60,camera);
      const balls=scene.getObjectByName('records-chaos')!.children[0] as THREE.InstancedMesh,matrix=new THREE.Matrix4(),point=new THREE.Vector3();
      expect(balls.count).toBe(fired.length);
      for(let i=0;i<balls.count;i++){balls.getMatrixAt(i,matrix);expect(point.setFromMatrixPosition(matrix).distanceTo(muzzle)).toBeLessThan(1e-5);}
      // Repeated delivery cannot create a second draw entry or replay the birth.
      view.launch(birth);clock.mockReturnValue(96);view.update(1/60,camera);expect(balls.count).toBe(fired.length);
      for(let i=0;i<balls.count;i++){balls.getMatrixAt(i,matrix);expect(point.setFromMatrixPosition(matrix).distanceTo(muzzle)).toBeGreaterThan(1);}
      view.apply({...travelled,time:at+100,shots:[]});view.update(1/60,camera);expect(balls.count).toBe(0);
    }finally{view.dispose();gun.dispose();player.dispose();clock.mockRestore();}
  });
  it('keeps the full ball pool visible through every Dispatch phase', () => {
    const scene=new THREE.Scene();
    const view=new ChaosView(scene,()=>undefined,undefined,false);
    const state=snapshot();
    state.shots=Array.from({length:CHAOS_TUNING.maxShots},(_,i)=>({id:`ball-${i}`,owner:'local',
      p:{x:i,y:2,z:0},v:{x:175,y:0,z:0},age:0}));
    const root=scene.getObjectByName('records-chaos')!;
    const balls=root.children[0] as THREE.InstancedMesh;
    for(const phase of ['ready','rolling','active','cooldown'] as const){
      state.dispatch.phase=phase;view.apply(state);view.update(1/60,camera);
      expect(root.visible&&balls.visible).toBe(true);
      expect(balls.count).toBe(CHAOS_TUNING.maxShots);
      for(const name of ['danger-cheese-rims','danger-cheese-trails'])expect((root.getObjectByName(name) as THREE.InstancedMesh).count).toBe(CHAOS_TUNING.maxShots);
      const matrix=new THREE.Matrix4();balls.getMatrixAt(balls.count-1,matrix);
      expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(CHAOS_TUNING.maxShots-1);
    }
    view.dispose();
  });
  it('turns Crossfire bank shots red and clears the lethal color and glow on expiry',()=>{
    const scene=new THREE.Scene(),view=new ChaosView(scene,()=>undefined,undefined,false),state=snapshot();
    state.shots=[false,true].map((wallBounced,i)=>({id:`color-${i}`,owner:'local',p:{x:i,y:2,z:0},v:{x:20,y:0,z:0},age:0,wallBounced}));
    state.dispatch={phase:'active',incident:'crossfire',started:1000,until:26000,serial:1};
    const root=scene.getObjectByName('records-chaos')!,yellow=root.children[0] as THREE.InstancedMesh;
    const red=scene.getObjectByName('crossfire-balls') as THREE.InstancedMesh;
    const glow=scene.getObjectByName('crossfire-glow') as THREE.InstancedMesh;
    view.apply(state);view.update(1/60,camera);expect(yellow.count).toBe(1);expect(red.count).toBe(1);expect(glow.count).toBe(1);
    expect((glow.material as THREE.Material).depthTest).toBe(true);
    const yellowMaterial=yellow.material as THREE.MeshStandardMaterial,redMaterial=red.material as THREE.MeshStandardMaterial;
    expect(yellowMaterial.color.r).toBeGreaterThan(yellowMaterial.color.b*4);expect(yellowMaterial.color.g).toBeGreaterThan(yellowMaterial.color.b*4);
    expect(redMaterial.color.r).toBeGreaterThan(redMaterial.color.g*5);expect(redMaterial.vertexColors).toBe(true);
    const matrix=new THREE.Matrix4();red.getMatrixAt(0,matrix);expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(1);
    state.dispatch.phase='cooldown';view.apply(state);view.update(1/60,camera);expect(yellow.count).toBe(2);expect(red.count).toBe(0);
    view.dispose();
  });
  it('renders the current ball position immediately without rewinding to the muzzle', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const scene = new THREE.Scene();
    const view = new ChaosView(scene, () => undefined, undefined, false);
    const state = snapshot();
    state.shots.push({ id: shot.shotId, owner: 'local', p: { x: 8.75, y: 1.958, z: 0 },
      v: { x: 175, y: -1.25, z: 0 }, age: .05 });
    view.apply(state);
    clock.mockReturnValue(1050); // CPU work between stepping and drawing is not more simulation time.
    view.update(1 / 60, camera);
    const ball = scene.getObjectByName('records-chaos')!.children[0] as THREE.InstancedMesh;
    const matrix=new THREE.Matrix4();const position=new THREE.Vector3();
    const current=()=>{ball.getMatrixAt(0,matrix);return position.setFromMatrixPosition(matrix);};
    expect(current().distanceTo(new THREE.Vector3(8.75,1.958,0))).toBeLessThan(1e-5);
    view.update(1 / 60, camera);
    expect(current().distanceTo(new THREE.Vector3(8.75,1.958,0))).toBeLessThan(1e-5);
    expect(state.shots[0].age).toBe(.05);
    expect(state.shots[0].v).toEqual({ x: 175, y: -1.25, z: 0 });
    view.dispose(); clock.mockRestore();
  });

  it('does not invent or retain a ball when the shot has already hit before drawing', () => {
    const scene = new THREE.Scene();
    const view = new ChaosView(scene, () => undefined, undefined, false);
    const state = snapshot();
    state.shots.push({ id: shot.shotId, owner: 'local', p: { x: 8, y: 2, z: 0 },
      v: { x: 175, y: 0, z: 0 }, age: .04 });
    view.apply(state);
    view.update(1 / 60, camera);
    const root = scene.getObjectByName('records-chaos')!;
    expect((root.children[0] as THREE.InstancedMesh).count).toBe(1);
    expect((root.getObjectByName('danger-cheese-rims') as THREE.InstancedMesh).count).toBe(1);
    view.apply(snapshot());
    view.update(1 / 60, camera);
    expect(root.children.filter(m=>m instanceof THREE.InstancedMesh).every(m=>m.count===0)).toBe(true);
    view.dispose();
  });
});

it('changes danger cues with the viewer, including owned Crossfire ricochets and Popcorn children',()=>{
 const scene=new THREE.Scene(),view=new ChaosView(scene,()=>undefined,undefined,false),state=snapshot();
 state.shots=['alice','bob'].map((owner,i)=>({id:`child-${i}`,owner,p:{x:i,y:2,z:0},v:{x:175,y:0,z:0},age:0,wallBounced:true}));
 const root=scene.getObjectByName('records-chaos')!;
 const rim=root.getObjectByName('danger-cheese-rims') as THREE.InstancedMesh;
 const lethal=root.getObjectByName('crossfire-glow') as THREE.InstancedMesh;
 const trails=root.getObjectByName('danger-cheese-trails') as THREE.InstancedMesh;
 const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
 for(const incident of ['crossfire','popcorn-panic'] as const){
  state.dispatch={phase:'active',incident,started:1000,until:26000,serial:1};
  for(const [viewer,enemyX] of [['alice',1],['bob',0]] as const){
   view.setScores([],viewer);view.apply(state);view.update(1/60,camera);
   expect(rim.count+lethal.count).toBe(1);expect(trails.count).toBe(1);
   const red=root.getObjectByName('crossfire-balls') as THREE.InstancedMesh;
   expect(red.count).toBe(incident==='crossfire'?2:0);
   if(incident==='crossfire'){
    const tint=new THREE.Color();red.getColorAt(viewer==='alice'?0:1,tint);expect(tint.toArray()).toEqual([1,1,1]);
    red.getColorAt(viewer==='alice'?1:0,tint);expect(tint.r).toBeGreaterThan(2);
   }
   const visible=incident==='crossfire'?lethal:rim;visible.getMatrixAt(0,matrix);
   expect(point.setFromMatrixPosition(matrix).x).toBe(enemyX);
  }
 }
 state.shots=state.shots.filter(s=>s.owner==='bob');view.apply(state);view.update(1/60,camera);
 expect(rim.count+lethal.count+trails.count).toBe(0);
 state.dispatch.incident='crossfire';view.apply(state);view.update(1/60,camera);
 expect((root.getObjectByName('crossfire-balls') as THREE.InstancedMesh).count).toBe(1);
 expect(rim.count+lethal.count+trails.count).toBe(0); // Own lethal shot is red, without enemy glow.
 view.dispose();
});
it('keeps pore contrast within the original spherical cheese silhouette',async()=>{
 const {createCheeseBallGeometry}=await import('../../src/weapons/CheeseProjectileModel');
 const geometry=createCheeseBallGeometry(),p=geometry.getAttribute('position'),c=geometry.getAttribute('color');
 let darkest=1;const v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){const radius=v.fromBufferAttribute(p,i).length();expect(radius).toBeLessThanOrEqual(.150001);expect(radius).toBeGreaterThanOrEqual(.142);darkest=Math.min(darkest,c.getX(i));}
 expect(darkest).toBeLessThan(.7);geometry.dispose();
});
