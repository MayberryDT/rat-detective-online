import {afterEach,expect,it,vi} from 'vitest';
import {PlayerSettings} from '../../src/ui/PlayerSettings';
import {PreferenceStore} from '../../src/settings/PlayerPreferences';
class Element extends EventTarget {
 children:Element[]=[];parent?:Element;textContent='';className='';id='';hidden=false;open=false;disabled=false;dataset:Record<string,string>={};attributes=new Map<string,string>();
 value='';checked=false;type='';style={setProperty:vi.fn()};classes=new Set<string>();
 classList={add:(s:string)=>this.classes.add(s),remove:(s:string)=>this.classes.delete(s),toggle:(s:string,on:boolean)=>on?this.classes.add(s):this.classes.delete(s)};
 constructor(readonly tagName:string){super();}
 appendChild(node:Element){this.children.push(node);node.parent=this;return node;}
 setAttribute(key:string,value:string){this.attributes.set(key,value);}
 focus=vi.fn();showModal(){this.open=true;}close(){this.open=false;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 querySelector(selector:string):Element|undefined{return all(this).find(n=>n.className===selector.slice(1));}
 get valueAsNumber(){return Number(this.value);}
}
function all(root:Element):Element[]{return [root,...root.children.flatMap(all)];}
const owned:PlayerSettings[]=[];
afterEach(()=>{owned.splice(0).forEach(m=>m.dispose());vi.restoreAllMocks();});
function setup(){
 const body=new Element('BODY'),title=new Element('BUTTON');body.appendChild(title);
 const doc=Object.assign(new EventTarget(),{body,documentElement:new Element('HTML'),activeElement:title,pointerLockElement:null as object|null,createElement:(tag:string)=>new Element(tag.toUpperCase()),getElementById:(id:string)=>id==='title-settings-btn'?title:null,exitPointerLock:vi.fn()});
 const store=new PreferenceStore(),menu=new PlayerSettings(store,doc as unknown as Document);owned.push(menu);
 const root=menu.root as unknown as Element;
 const button=(text:string)=>all(root).find(n=>n.tagName==='BUTTON'&&n.textContent===text)!;
 const click=(text:string)=>button(text).dispatchEvent(new Event('click'));
 return {doc,store,menu,root,click,button,title};
}
it('opens settings from title, applies numeric settings and restores focus on closing',()=>{
 const f=setup();f.title.dispatchEvent(new Event('click'));expect(f.menu.isOpen).toBe(true);
 const number=all(f.root).find(n=>n.attributes.get('aria-label')==='Mouse sensitivity value')!;number.value='.25';number.dispatchEvent(new Event('change'));
 expect(f.store.current.mouseSensitivity).toBe(.25);f.click('Back');expect(f.menu.isOpen).toBe(false);expect(f.title.focus).toHaveBeenCalled();
});
it('clears input on Escape/unlock, keeps the match vulnerable and requires the Resume button',()=>{
 const f=setup(),clear=vi.fn(),resume=vi.fn();f.menu.attach({playing:()=>true,touch:()=>false,clear,resume});
 f.doc.dispatchEvent(new Event('pointerlockchange'));expect(f.menu.isOpen).toBe(true);expect(clear).toHaveBeenCalled();
 f.click('Settings');expect(f.root.dataset.page).toBe('settings');f.click('Back');expect(f.root.dataset.page).toBe('pause');expect(resume).not.toHaveBeenCalled();
 f.root.dispatchEvent(new Event('cancel',{cancelable:true}));expect(f.menu.isOpen).toBe(true);expect(resume).not.toHaveBeenCalled();
 f.click('Resume');expect(f.menu.isOpen).toBe(false);expect(resume).toHaveBeenCalledOnce();
});
it('swallows the leftover firing click until a fresh post-unlock gesture',()=>{
 const f=setup();let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
 f.menu.attach({playing:()=>true,touch:()=>false,clear:()=>{},resume:()=>{}});f.doc.dispatchEvent(new Event('pointerlockchange'));
 const stale=new Event('click',{cancelable:true});f.doc.dispatchEvent(stale);expect(stale.defaultPrevented).toBe(true);
 now+=100;f.doc.dispatchEvent(new Event('pointerdown'));const fresh=new Event('click',{cancelable:true});f.doc.dispatchEvent(fresh);expect(fresh.defaultPrevented).toBe(false);
});
it('captures remapping keys without triggering title/gameplay, reports conflicts and cancels cleanly',()=>{
 const f=setup();f.menu.open();f.click('W');
 const key=(code:string)=>{const event=Object.assign(new Event('keydown',{cancelable:true}),{code});f.root.dispatchEvent(event);return event;};
 expect(key('KeyS').defaultPrevented).toBe(true);expect(f.store.current.bindings.forward[0]).toBe('KeyW');
 key('KeyI');expect(f.store.current.bindings.forward[0]).toBe('KeyI');f.click('I');key('Escape');expect(f.button('I')).toBeDefined();
});
it('touch settings keep input blocked until back and explicit resume, and reset reapplies defaults',()=>{
 const f=setup(),clear=vi.fn(),resume=vi.fn();f.menu.attach({playing:()=>true,touch:()=>true,clear,resume});f.menu.open();
 f.store.update({mouseSensitivity:.1,uiScale:1.2});f.click('Reset all');expect(f.store.current.mouseSensitivity).toBe(1);expect(f.doc.documentElement.style.setProperty).toHaveBeenLastCalledWith('--player-ui-scale','1');
 f.click('Back');expect(f.menu.isOpen).toBe(true);expect(resume).not.toHaveBeenCalled();f.click('Resume');expect(resume).toHaveBeenCalledOnce();
});
