import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ChaosView } from '../../src/prototype/ChaosView';
import { CASE_HOME, CHAOS_TUNING, type ChaosState } from '../../src/shared/chaosState';

vi.mock('../../src/prototype/DispatchHud',()=>({DispatchHud:class{update(){} setScores(){} dispose(){}}}));

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 1000);
beforeAll(() => {
 vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
 vi.stubGlobal('document', {
  createElement: () => ({ width: 0, height: 0, style: {}, remove() {}, appendChild() {}, setAttribute() {},
    getContext: () => ({ fillRect() {}, fillText() {} }) }),
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
