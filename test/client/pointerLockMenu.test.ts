import {describe,expect,it,vi} from 'vitest';
import {bindPointerLockMenu} from '../../src/session/PointerLockMenu';

class Nodeish {
 parent:Nodeish|null=null; children:Nodeish[]=[];
 listeners=new Map<string,Set<(event:FakeEvent)=>void>>();
 contains(node:Nodeish){let cur:Nodeish|null=node;while(cur){if(cur===this)return true;cur=cur.parent;}return false;}
 addEventListener(type:string,handler:(event:FakeEvent)=>void,opts?:{signal?:AbortSignal}){
  if(!this.listeners.has(type))this.listeners.set(type,new Set());
  this.listeners.get(type)!.add(handler);
  opts?.signal?.addEventListener('abort',()=>this.listeners.get(type)!.delete(handler));
 }
 append(child:Nodeish){child.parent=this;this.children.push(child);}
}
class FakeEvent {
 type:string; target:Nodeish; defaultPrevented=false; cancelBubble=false;
 constructor(type:string,target:Nodeish){this.type=type;this.target=target;}
 preventDefault(){this.defaultPrevented=true;}
 stopImmediatePropagation(){this.cancelBubble=true;}
 stopPropagation(){this.cancelBubble=true;}
}
class FakeDoc extends Nodeish {
 body=new Nodeish();
 pointerLockElement:Nodeish|null=null;
 activeElement:{blur():void}|null=null;
 dispatch(type:string,target:Nodeish){
  const event=new FakeEvent(type,target);
  for(const handler of [...this.listeners.get(type)??[]]){handler(event as unknown as FakeEvent);if(event.cancelBubble)return event;}
  for(const handler of [...target.listeners.get(type)??[]]){handler(event);if(event.cancelBubble)return event;}
  return event;
 }
 lock(canvas:Nodeish){this.pointerLockElement=canvas;this.dispatch('pointerlockchange',this);}
 unlock(){this.pointerLockElement=null;this.dispatch('pointerlockchange',this);}
}

describe('pointer-lock pause menu',()=>{
 function fixture(){
  const doc=new FakeDoc();
  const canvas=new Nodeish(),panel=new Nodeish(),play=new Nodeish(),veil=new Nodeish();
  panel.append(play);
  let locked=false,now=0;
  Object.defineProperty(doc.body,'classList',{value:{toggle:vi.fn()}});
  const menu=bindPointerLockMenu({
   canvas:canvas as unknown as HTMLElement,
   panel:Object.assign(panel,{hidden:false}) as unknown as HTMLElement,
   play:play as unknown as HTMLElement,
   veil:Object.assign(veil,{hidden:false}) as unknown as HTMLElement,
   lock:()=>{locked=true;doc.lock(canvas);},
   doc:doc as unknown as Document,
   now:()=>now,
   leftoverMs:50,
  });
  return {doc,canvas,panel,play,veil,menu,get locked(){return locked;},setNow:(value:number)=>{now=value;}};
 }
 it('does not treat the first Play click as leftover before any lock',()=>{
  const f=fixture();
  f.doc.dispatch('click',f.play);
  expect(f.locked).toBe(true);
  expect((f.panel as unknown as {hidden:boolean}).hidden).toBe(true);
 });
 it('swallows the leftover click after Esc and does not auto-relock',()=>{
  const f=fixture();
  f.doc.lock(f.canvas);
  f.doc.unlock();
  const leftover=f.doc.dispatch('click',f.play);
  expect(leftover.defaultPrevented).toBe(true);
  expect(f.locked).toBe(false);
  expect((f.panel as unknown as {hidden:boolean}).hidden).toBe(false);
 });
 it('lets a later Play click resume after a leftover click is discarded',()=>{
  const f=fixture();
  f.doc.lock(f.canvas);
  f.doc.unlock();
  f.doc.dispatch('click',f.play);
  f.setNow(80);
  f.doc.dispatch('pointerdown',f.play);
  f.doc.dispatch('click',f.play);
  expect(f.locked).toBe(true);
 });
 it('does not resume from a veil click after unlock',()=>{
  const f=fixture();
  f.doc.lock(f.canvas);
  f.doc.unlock();
  f.setNow(80);
  f.doc.dispatch('pointerdown',f.veil);
  f.doc.dispatch('click',f.veil);
  expect(f.locked).toBe(false);
 });
 it('disposes listeners',()=>{
  const f=fixture();
  f.menu.dispose();
  f.doc.dispatch('click',f.play);
  expect(f.locked).toBe(false);
 });
});
