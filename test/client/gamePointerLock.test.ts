import {expect,it,vi} from 'vitest';
import {bindGamePointerLock} from '../../src/session/GamePointerLock';
function fixture(){
 const doc=Object.assign(new EventTarget(),{pointerLockElement:null as unknown,hidden:false,hasFocus:()=>true,activeElement:{blur:vi.fn()}});
 const target=new EventTarget(),abort=new AbortController(),request=vi.fn(),record=vi.fn();
 const canvas={requestPointerLock:request,isConnected:true};let now=0;
 const lock=bindGamePointerLock({canvas:canvas as unknown as HTMLElement,doc:doc as unknown as Document,target:target as Window,
  playing:()=>true,now:()=>now,signal:abort.signal,record});
 const event=(type:string,detail:object={})=>{const e=new Event(type,{cancelable:true});
  for(const [k,v] of Object.entries({button:0,target:canvas,...detail}))Object.defineProperty(e,k,{value:v});doc.dispatchEvent(e);return e;};
 return {doc,target,abort,request,record,canvas,lock,event,setNow:(n:number)=>{now=n;},
  acquire:()=>{doc.pointerLockElement=canvas;event('pointerlockchange');},lose:()=>{doc.pointerLockElement=null;event('pointerlockchange');},
  click:()=>{event('pointerdown');return event('click');}};
}
it('ignores trailing clicks and same-instant downs after loss, then accepts one fresh canvas click',()=>{
 const f=fixture();f.acquire();f.lose();f.event('click');f.click();expect(f.request).not.toHaveBeenCalled();
 f.setNow(150);f.click();expect(f.request).toHaveBeenCalledTimes(1);
 f.click();f.lock.request();expect(f.request).toHaveBeenCalledTimes(1);f.abort.abort();
});
it('keeps firing mousedown intact while suppressing locked browser/UI clicks and preserving Escape',()=>{
 const f=fixture();f.acquire();
 expect(f.event('mousedown').defaultPrevented).toBe(false);
 for(const type of ['click','auxclick','contextmenu'])expect(f.event(type).defaultPrevented).toBe(true);
 expect(f.event('pointerdown',{button:1}).defaultPrevented).toBe(true);
 expect(f.event('keydown',{code:'Space'}).defaultPrevented).toBe(true);
 expect(f.event('keydown',{code:'Escape'}).defaultPrevented).toBe(false);
 expect(f.event('click',{target:{tagName:'A',hasAttribute:()=>true}}).defaultPrevented).toBe(false);
 f.lose();expect(f.record).toHaveBeenLastCalledWith('pointer-lock',expect.objectContaining({recentEscape:true}));f.abort.abort();
});
it('does not retry on focus, hidden state, non-canvas clicks or after disposal',()=>{
 const f=fixture();f.acquire();f.lose();f.setNow(200);
 f.event('pointerdown');f.target.dispatchEvent(new Event('blur'));f.target.dispatchEvent(new Event('focus'));f.event('click');
 f.event('pointerdown',{target:{}});f.event('click',{target:{}});expect(f.request).not.toHaveBeenCalled();
 f.doc.hidden=true;f.lock.request();expect(f.request).not.toHaveBeenCalled();f.doc.hidden=false;
 f.click();expect(f.request).toHaveBeenCalledTimes(1);f.abort.abort();f.lose();f.click();f.lock.request();expect(f.request).toHaveBeenCalledTimes(1);
});
it('allows a new gesture after rejection without an old rejected request canceling a later lock',async()=>{
 const f=fixture();let reject!:(error:Error)=>void;
 f.request.mockReturnValueOnce(new Promise<void>((_,r)=>{reject=r;}));f.lock.request();
 f.event('pointerlockerror');f.click();expect(f.request).toHaveBeenCalledTimes(2);f.acquire();reject(new Error('late rejection'));await Promise.resolve();
 expect(f.record.mock.calls.filter(([type])=>type==='pointer-lock-request-failed')).toHaveLength(0);f.abort.abort();
});
