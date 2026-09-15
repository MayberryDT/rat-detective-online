import {afterEach,expect,it,vi} from 'vitest';
import {TouchControls,touchControlsAvailable} from '../../src/ui/TouchControls';

class Node extends EventTarget {
 children:Node[]=[];parent?:Node;hidden=false;style:Record<string,string>={};textContent='';value='';type='';min='';max='';step='';
 private classes=new Set<string>();attributes=new Map<string,string>();captured=new Set<number>();
 get className(){return [...this.classes].join(' ');}set className(value:string){this.classes=new Set(value.split(' '));}
 classList={add:(s:string)=>this.classes.add(s),remove:(s:string)=>this.classes.delete(s),contains:(s:string)=>this.classes.has(s),toggle:(s:string,on:boolean)=>on?this.classes.add(s):this.classes.delete(s)};
 appendChild(node:Node){this.children.push(node);node.parent=this;return node;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 setAttribute(name:string,value:string){this.attributes.set(name,value);}
 getBoundingClientRect(){return {left:0,top:180};}
 setPointerCapture(id:number){this.captured.add(id);}hasPointerCapture(id:number){return this.captured.has(id);}releasePointerCapture(id:number){this.captured.delete(id);}
}
function fixture(){
 vi.spyOn(performance,'now').mockReturnValue(0);
 const doc=Object.assign(new EventTarget(),{body:new Node(),documentElement:new Node(),hidden:false,pointerLockElement:null,createElement:()=>new Node(),exitPointerLock:vi.fn()});
 const target=Object.assign(new EventTarget(),{location:{search:'?controls=touch'},innerWidth:844,innerHeight:390,matchMedia:()=>({matches:true}),localStorage:{getItem:()=>null,setItem:vi.fn()}});
 const shoot=vi.fn(),look=vi.fn(),scores=vi.fn(),clearKeys=vi.fn(),canvas=new Node();
 const menu={open:false};const openSettings=vi.fn(()=>{menu.open=true;});
 const controls=new TouchControls({canvas:canvas as unknown as HTMLElement,doc:doc as unknown as Document,target:target as unknown as Window,shoot,look,scores,clearKeys,openSettings,blocked:()=>menu.open});
 controls.setPlaying(true);controls.update(0,true);
 const find=(name:string,node:Node=doc.body):Node=>{if(node.classList.contains(name))return node;for(const child of node.children){const found=find(name,child);if(found)return found;}return undefined!;};
 const event=(type:string,id:number,x=100,y=280)=>Object.assign(new Event(type,{cancelable:true}),{pointerType:'touch',pointerId:id,clientX:x,clientY:y});
 const down=(name:string,id:number,x=100,y=280)=>{const e=event('pointerdown',id,x,y);doc.dispatchEvent(e);find(name).dispatchEvent(e);return e;};
 return {doc,target,shoot,look,scores,clearKeys,menu,openSettings,controls,find,down,event};
}
const owned:TouchControls[]=[];afterEach(()=>{owned.splice(0).forEach(c=>c.dispose());vi.restoreAllMocks();});
function setup(){const f=fixture();owned.push(f.controls);return f;}

it('fires once on touch-down and never repeats while held or dragged',()=>{
 const f=setup();f.down('touch-fire',1,700,300);
 for(let now=16;now<10_000;now+=16){f.controls.update(now,true);f.doc.dispatchEvent(f.event('pointermove',1,720,310));}
 expect(f.shoot).toHaveBeenCalledOnce();
 f.doc.dispatchEvent(f.event('pointerup',1));vi.mocked(performance.now).mockReturnValue(10_000);
 f.down('touch-fire',2,700,300);expect(f.shoot).toHaveBeenCalledTimes(2);
 f.controls.update(20_000,true);expect(f.shoot).toHaveBeenCalledTimes(2);
});

it('captures independent touches and supports dragging beyond the visible control',()=>{
 const f=setup();const start=f.down('touch-move-zone',1);expect(start.defaultPrevented).toBe(true);expect(f.find('touch-move-zone').captured.has(1)).toBe(true);
 f.doc.dispatchEvent(f.event('pointermove',1,1000,-400));expect(Math.hypot(f.controls.input.movement.x,f.controls.input.movement.y)).toBeCloseTo(1);
 f.down('touch-fire',2,700,300);f.doc.dispatchEvent(f.event('pointermove',2,720,310));expect(f.look).toHaveBeenCalled();expect(f.shoot).toHaveBeenCalledOnce();
 f.doc.dispatchEvent(f.event('pointerup',2));f.controls.update(1000,true);expect(f.shoot).toHaveBeenCalledOnce();expect(f.controls.input.fingers.has(1)).toBe(true);
});
it.each(['pointercancel','blur','visibilitychange','resize'])('clears captured input on %s without restarting held fire',type=>{
 const f=setup();f.down('touch-move-zone',1);f.doc.dispatchEvent(f.event('pointermove',1,140,280));f.down('touch-fire',2,700,300);f.down('touch-jump',3,700,210);
 if(type==='visibilitychange')f.doc.hidden=true;
 (type==='blur'||type==='resize'?f.target:f.doc).dispatchEvent(new Event(type));
 f.controls.update(10000,true);expect(f.controls.input.movement).toEqual({x:0,y:0,jump:false});expect(f.controls.input.fingers.size).toBe(0);expect(f.shoot).toHaveBeenCalledOnce();expect(f.find('touch-fire').captured.size).toBe(0);
});
it('scoreboard and settings cancel input, toggle closed, and cannot fire behind their panels',()=>{
 const f=setup();f.down('touch-fire',1);f.find('touch-scores').dispatchEvent(new Event('click'));expect(f.scores).toHaveBeenLastCalledWith(true);
 f.down('touch-fire',2);f.controls.update(1000,true);expect(f.shoot).toHaveBeenCalledOnce();
 f.find('touch-scores').dispatchEvent(new Event('click'));expect(f.scores).toHaveBeenLastCalledWith(false);
 f.find('touch-settings-button').dispatchEvent(new Event('click'));expect(f.openSettings).toHaveBeenCalledOnce();expect(f.menu.open).toBe(true);
 f.down('touch-fire',3);f.controls.update(2000,true);expect(f.shoot).toHaveBeenCalledOnce();
 f.menu.open=false;f.controls.clear();expect(f.controls.input.fingers.size).toBe(0);
});
it('death, respawn and reconnect require fresh fingers',()=>{
 const f=setup();f.down('touch-fire',1);f.controls.update(1000,false);f.controls.update(2000,true);expect(f.shoot).toHaveBeenCalledOnce();
 f.doc.dispatchEvent(f.event('pointermove',1));expect(f.look).not.toHaveBeenCalled();
 f.down('touch-fire',2);f.controls.setPlaying(false);f.controls.setPlaying(true);f.controls.update(3000,true);expect(f.shoot).toHaveBeenCalledTimes(1); // rapid retap was still rate-gated
});
it('portrait clears controls, shows rotation guidance and blocks actions until landscape',()=>{
 const f=setup();f.down('touch-fire',1);f.target.innerWidth=390;f.target.innerHeight=844;f.target.dispatchEvent(new Event('resize'));
 expect(f.find('touch-rotate').hidden).toBe(false);f.down('touch-fire',2);f.controls.update(1000,true);expect(f.shoot).toHaveBeenCalledOnce();
 f.target.innerWidth=844;f.target.innerHeight=390;f.target.dispatchEvent(new Event('resize'));expect(f.find('touch-rotate').hidden).toBe(true);
});
it('disposes its nodes, classes, captured pointers and event listeners',()=>{
 const f=setup();f.down('touch-fire',1);f.controls.dispose();expect(f.doc.body.children).toHaveLength(0);expect(f.doc.body.classList.contains('touch-mode')).toBe(false);
 f.doc.dispatchEvent(f.event('pointermove',1,700,90));expect(f.look).not.toHaveBeenCalled();
});
it('touch detection uses input capability or an explicit preview override, not viewport width',()=>{
 const target={location:{search:'?controls=touch'},matchMedia:()=>({matches:false})} as unknown as Window;expect(touchControlsAvailable(target)).toBe(true);
 target.location.search='?controls=mouse';expect(touchControlsAvailable(target)).toBe(false);
 target.location.search='';target.matchMedia=(()=>({matches:true})) as unknown as Window['matchMedia'];expect(touchControlsAvailable(target)).toBe(true);
});
