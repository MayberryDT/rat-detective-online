import {afterEach,describe,it,expect,vi} from 'vitest';
import {DispatchHud} from '../../src/prototype/DispatchHud';
import type {ChaosState} from '../../src/shared/chaosState';
class Element {
 style:Record<string,string>={};dataset:Record<string,string>={};private text='';textWrites=0;private html='';htmlWrites=0;className='';hidden=false;offsetWidth=0;
 get innerHTML(){return this.html;}set innerHTML(value:string){this.html=value;this.htmlWrites++;}
 get textContent(){return this.text;}set textContent(value:string){this.text=value;this.textWrites++;}
 children:Element[]=[];selectors=new Map<string,Element>();removed=false;
 classList={add:vi.fn(),remove:vi.fn(),toggle:vi.fn()};
 appendChild(e:Element){this.children.push(e);return e;}replaceChildren(){this.children=[];}remove(){this.removed=true;}
 querySelector(s:string){if(!this.selectors.has(s))this.selectors.set(s,new Element());return this.selectors.get(s)!;}
}
const originalDocument=globalThis.document;
afterEach(()=>vi.stubGlobal('document',originalDocument));
function fixture(){
 const body=new Element();vi.stubGlobal('document',{body,createElement:()=>new Element()});
 const sound=vi.fn(),feedback=vi.fn(),hud=new DispatchHud(sound,feedback),root=body.children[0];
 const state={dispatch:{phase:'ready',started:0,until:0,serial:0},case:{owner:null},possession:{}} as unknown as ChaosState;
 return {hud,root,state,sound,feedback};
}
describe('Dispatch broadcast lifecycle',()=>{
 it('does not rewrite stable HUD text during animation frames, including Evidence Tampering',()=>{
  const {hud,root,state}=fixture();
  state.dispatch={phase:'active',started:1000,until:26000,serial:1,incident:'evidence-tampering'};
  state.extraCases=[1,2,3,4,5,6,7].map(i=>({...state.case,id:`evidence-${i}`}));
  hud.update(state,5000);
  const writes=()=>[...root.selectors.values()].reduce((n,e)=>n+e.textWrites,0);
  const before=writes();
  const art=root.querySelector('.dispatch-artwork'),artWrites=art.htmlWrites;
  for(let i=0;i<600;i++)hud.update(state,5000);
  expect(writes()).toBe(before);
  expect(art.htmlWrites).toBe(artWrites);
  hud.update(state,6000);expect(writes()).toBe(before+1);
  expect(root.querySelector('.dispatch-timer').textContent).toBe('20s');hud.dispose();
 });
 it('shows the active incident drawing and explanation, then restores the dispatch sign',()=>{
  const {hud,root,state}=fixture();
  state.dispatch={phase:'active',started:1000,until:26000,serial:1,incident:'popcorn-panic'};
  hud.update(state,5000);
  expect(root.querySelector('.dispatch-artwork').dataset.incident).toBe('popcorn-panic');
  expect(root.querySelector('.dispatch-artwork').innerHTML).toContain('<svg');
  expect(root.querySelector('.dispatch-alert-label').textContent).toBe('CITYWIDE EMERGENCY');
  expect(root.querySelector('.dispatch-brief').textContent).toContain('smaller balls');
  state.dispatch={phase:'cooldown',started:26000,until:42000,serial:1};hud.update(state,27000);
  expect(root.querySelector('.dispatch-artwork').dataset.incident).toBe('dispatch');
  expect(root.querySelector('.dispatch-brief').textContent).not.toContain('smaller balls');hud.dispose();
 });
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
 it('distinguishes your pickup/loss from others and emits one cue per ownership transition',()=>{
  const {hud,state,root,feedback}=fixture();hud.update(state,0);expect(feedback).not.toHaveBeenCalled();
  state.case.owner='me';hud.update(state,100,'Me',true);hud.update(state,110,'Me',true);
  expect(feedback.mock.calls).toEqual([['case-pickup']]);
  state.case.owner='other';hud.update(state,200,'Other',false);hud.update(state,210,'Other',false);
  expect(feedback.mock.calls).toEqual([['case-pickup'],['case-lost']]);
  expect(root.querySelector('.case-broadcast strong').textContent).toBe('YOU LOST THE CASE');
  expect(root.querySelector('.case-broadcast span').textContent).toContain('DOUBLE KILL CREDIT LOST');
  state.case.owner=null;hud.update(state,300);state.case.owner='third';hud.update(state,400,'Third');
  expect(feedback.mock.calls.slice(-2)).toEqual([['case-drop'],['case-taken']]);hud.dispose();
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
