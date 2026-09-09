import {afterEach,describe,it,expect,vi} from 'vitest';
import {DispatchHud} from '../../src/prototype/DispatchHud';
import type {ChaosState} from '../../src/shared/chaosState';
class Element {
 style:Record<string,string>={};dataset:Record<string,string>={};textContent='';innerHTML='';className='';hidden=false;offsetWidth=0;
 children:Element[]=[];selectors=new Map<string,Element>();removed=false;
 classList={add:vi.fn(),remove:vi.fn(),toggle:vi.fn()};
 appendChild(e:Element){this.children.push(e);return e;}replaceChildren(){this.children=[];}remove(){this.removed=true;}
 querySelector(s:string){if(!this.selectors.has(s))this.selectors.set(s,new Element());return this.selectors.get(s)!;}
}
const originalDocument=globalThis.document;
afterEach(()=>vi.stubGlobal('document',originalDocument));
function fixture(){
 const body=new Element();vi.stubGlobal('document',{body,createElement:()=>new Element()});
 const sound=vi.fn(),hud=new DispatchHud(sound),root=body.children[0];
 const state={dispatch:{phase:'ready',started:0,until:0,serial:0},case:{owner:null},possession:{}} as unknown as ChaosState;
 return {hud,root,state,sound};
}
describe('Dispatch broadcast lifecycle',()=>{
 it('explains that Evidence Tampering weaponizes every case and restores ordinary copy afterward',()=>{
  const {hud,root,state}=fixture();
  state.dispatch={phase:'active',started:1000,until:26000,serial:1,incident:'evidence-tampering'};
  state.extraCases=[1,2,3,4,5,6,7].map(i=>({...state.case,id:`evidence-${i}`}));
  hud.update(state,1000);expect(root.querySelector('.case-ledger strong').textContent).toBe('8 CASES ARE MISSILES');
  expect(root.querySelector('.case-ledger small').textContent).toContain('PICKUP PROHIBITED');
  state.dispatch={phase:'ready',started:0,until:0,serial:1};state.extraCases=[];state.case.owner=null;hud.update(state,2000);
  expect(root.querySelector('.case-ledger strong').textContent).toBe('LOOSE CASE');
  expect(root.querySelector('.case-ledger small').textContent).not.toContain('DOUBLE');hud.dispose();
 });
 it('announces ownership changes once, retaining a quiet readable status afterward',()=>{
  const {hud,root,state}=fixture();hud.update(state,1000);
  const banner=root.querySelector('.case-broadcast');expect(banner.hidden).toBe(false);
  hud.update(state,4000);expect(banner.hidden).toBe(true);
  state.case.owner='new';hud.update(state,4100,'Constable Trap');
  expect(root.querySelector('.case-broadcast strong').textContent).toBe('Constable Trap is on the case');
  expect(banner.hidden).toBe(false);hud.update(state,7100,'Constable Trap');expect(banner.hidden).toBe(true);
  expect(root.querySelector('.case-ledger strong').textContent).toContain('Constable Trap');
  expect(root.querySelector('.case-ledger small').textContent).toContain('KILLS COUNT DOUBLE');
  state.case.owner=null;hud.update(state,7200);expect(root.querySelector('.case-broadcast strong').textContent).toBe('LOOSE CASE');
  hud.dispose();expect(root.removed).toBe(true);
 });
 it('tells the local carrier that their own kills count double',()=>{
  const {hud,root,state}=fixture();hud.update(state,1000);
  state.case.owner='local';hud.update(state,1100,'Constable Trap',true);
  expect(root.querySelector('.case-broadcast strong').textContent).toBe('YOU’RE ON THE CASE');
  expect(root.querySelector('.case-broadcast span').textContent).toBe('YOUR KILLS COUNT DOUBLE');
  hud.update(state,5000,'Constable Trap',true);
  expect(root.querySelector('.case-ledger small').textContent).toContain('YOUR KILLS COUNT DOUBLE');hud.dispose();
 });
 it('settles on the authoritative result and does not replay the reveal sound on snapshots',()=>{
  const {hud,root,state,sound}=fixture();hud.update(state,1000);
  state.dispatch={phase:'rolling',started:1000,until:3400,serial:1,incident:'pressure-surge'};
  hud.update(state,2000);expect(root.querySelector('.dispatch-roulette').hidden).toBe(false);
  state.dispatch={...state.dispatch,phase:'active',started:3400,until:28400};hud.update(state,3500);
  expect(root.querySelector('.dispatch-status').textContent).toBe('Pressure Surge');
  const count=sound.mock.calls.length;hud.update(state,3600);expect(sound).toHaveBeenCalledTimes(count);
  hud.update(state,6400);expect(root.querySelector('.dispatch-roulette').hidden).toBe(true);
  expect(root.querySelector('.dispatch-status').textContent).toBe('Pressure Surge');
  hud.update(state,15900);expect(root.querySelector('.dispatch-time-track div').style.transform).toBe('scaleX(0.5)');
  expect(root.querySelector('.dispatch-timer').textContent).toBe('13s');hud.dispose();
 });
});
