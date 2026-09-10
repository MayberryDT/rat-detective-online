import * as THREE from 'three';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {LandmarkSilhouette} from '../../src/prototype/LandmarkSilhouette';
import {AssignmentDestinations} from '../../src/prototype/AssignmentDestinations';
import {createAssignment} from '../../src/shared/assignments';
afterEach(()=>vi.unstubAllGlobals());
function renderer(){
 let target:any={name:'original'},color=new THREE.Color(0x190c22),alpha=.6;
 const viewport=new THREE.Vector4(4,5,600,450),scissor=new THREE.Vector4(8,9,300,250);let scissorTest=true;
 const r:any={autoClear:true,xr:{enabled:true},info:{autoReset:true},
 getDrawingBufferSize:(v:THREE.Vector2)=>v.set(3840,2160),
 getRenderTarget:()=>target,setRenderTarget:vi.fn(t=>{target=t;}),
 getClearColor:(c:THREE.Color)=>c.copy(color),getClearAlpha:()=>alpha,setClearColor:(c:any,a:number)=>{color=new THREE.Color(c);alpha=a;},
 getViewport:(v:THREE.Vector4)=>v.copy(viewport),setViewport:(v:THREE.Vector4)=>viewport.copy(v),
 getScissor:(v:THREE.Vector4)=>v.copy(scissor),setScissor:(v:THREE.Vector4)=>scissor.copy(v),
 getScissorTest:()=>scissorTest,setScissorTest:(v:boolean)=>{scissorTest=v;},clear:vi.fn(),render:vi.fn()};
 return r;
}
describe('landmark exterior silhouette pass',()=>{
 it.each([false,true])('preserves the game render target, color, viewport, XR and diagnostics; failure=%s',fail=>{
  const r=renderer(),effect=new LandmarkSilhouette(),camera=new THREE.PerspectiveCamera();
  const original=r.getRenderTarget();if(fail)r.render.mockImplementation(()=>{throw new Error('render failed');});
  if(fail)expect(()=>effect.render(r,camera,.85)).toThrow('render failed');else effect.render(r,camera,.85);
  expect(r.getRenderTarget()).toBe(original);expect(r.getClearAlpha()).toBe(.6);expect(r.getClearColor(new THREE.Color()).getHex()).toBe(0x190c22);
  expect(r.getViewport(new THREE.Vector4()).toArray()).toEqual([4,5,600,450]);expect(r.getScissor(new THREE.Vector4()).toArray()).toEqual([8,9,300,250]);expect(r.getScissorTest()).toBe(true);
  expect(r.autoClear).toBe(true);expect(r.xr.enabled).toBe(true);expect(r.info.autoReset).toBe(true);
  const target=r.setRenderTarget.mock.calls[0][0];expect(target.width).toBeLessThanOrEqual(960);expect(target.height).toBeLessThanOrEqual(720);
  if(!fail)expect(r.render).toHaveBeenCalledTimes(2);effect.dispose();
 });
 it('does no offscreen work in the other modes, and selects just the current landmark through resets',()=>{
  vi.stubGlobal('document',{body:{appendChild:()=>{}},createElement:()=>({appendChild:()=>{},remove:()=>{},style:{},dataset:{}})});
  const city=new THREE.Scene(),outlines=new AssignmentDestinations(city),r=renderer(),camera=new THREE.PerspectiveCamera();
  outlines.update(createAssignment('excessive-force',0));outlines.render(r,camera);expect(r.render).not.toHaveBeenCalled();
  const a=createAssignment('chain-of-custody',0);a.phase='active';outlines.update(a);
  expect(outlines.root.children.filter(g=>g.visible).map(g=>g.name)).toEqual([a.destinations[0]]);
  a.deliverySerial=1;outlines.update(a);expect(outlines.root.children.filter(g=>g.visible).map(g=>g.name)).toEqual([a.destinations[1]]);
  // Mask meshes live offscreen; never draw boxes or face fills in the city scene.
  expect(city.children).toHaveLength(0);
  a.phase='closed';outlines.update(a);outlines.render(r,camera);expect(r.render).not.toHaveBeenCalled();outlines.dispose();
 });
});
