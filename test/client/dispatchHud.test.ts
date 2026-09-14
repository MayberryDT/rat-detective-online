import {afterEach,describe,it,expect,vi} from 'vitest';
import {MUNICIPAL_QUIPS,INCIDENT_QUIPS} from '../../src/ui/municipalQuips';
import {DispatchHud} from '../../src/prototype/DispatchHud';
import type {ChaosState} from '../../src/shared/chaosState';
import { createAssignment, CHAIN_ROUTE } from '../../src/shared/assignments';
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
 it.each(['closing-time','chain-of-custody','excessive-force','jurisdiction'] as const)('keeps the %s score card present throughout briefing and every roulette phase',id=>{
  const {hud,root,state}=fixture();state.assignment=createAssignment(id,0);
  for(const now of [1000,5000]){
   for(const [phase,started,offset] of [['ready',now,0],['rolling',now,0],['active',now,1000],['active',now,2850],['cooldown',now,0]] as const){
    state.dispatch={phase,started,until:now+25000,serial:1,incident:'popcorn-panic'};
    hud.update(state,now+offset);
    expect(root.querySelector('.assignment-ledger').hidden).toBe(false);
    expect(root.querySelector('.assignment-ledger').dataset.mode).toBe(id);
    expect(root.querySelector('.assignment-title').textContent.length).toBeGreaterThan(0);
   }
  }
  hud.dispose();
 });
 it('shows shared progress, next destination and filing credit without double-kill instructions',()=>{
  const {hud,root,state}=fixture();state.assignment=createAssignment('closing-time',0);state.assignment.phase='active';state.assignment.remainingMs=9000;
  hud.update(state,4000);expect(root.querySelector('.assignment-progress').textContent).toBe('0:09');
  expect(root.querySelector('.assignment-detail').textContent).toContain('PAUSED · CASE LOOSE');
  state.case.owner='me';hud.update(state,4100,'Me',true);
  expect(root.querySelector('.case-broadcast span').textContent).not.toContain('DOUBLE');
  state.assignment=createAssignment('chain-of-custody',0);state.assignment.destinations=[...CHAIN_ROUTE];state.assignment.phase='active';state.assignment.deliverySerial=1;
  hud.update(state,4200);expect(root.querySelector('.assignment-counter').textContent).toBe('TOP FIVE · FIRST TO 3');
  expect(root.querySelector('.assignment-target').textContent).toBe('DELIVER TO: SEWER MAINTENANCE');
  state.assignment=createAssignment('excessive-force',0);state.assignment.phase='active';state.assignment.caseKills.me=6;hud.setScores([{id:'me',name:'Me',kills:12,deaths:2}],'me');
  hud.update(state,4300,undefined,false);expect(root.querySelector('.assignment-detail').textContent).toBe('GET THE CASE TO SCORE');expect(root.querySelector('.assignment-progress').textContent).toBe('YOU: 6 / 10');expect(root.querySelector('.assignment-stats').textContent).toContain('TOTAL KILLS 12');
  state.assignment.phase='suspended';hud.update(state,4400);
  expect(root.querySelector('.assignment-detail').textContent).toContain('PROGRESS PAUSED');hud.dispose();
 });
 it('ranks the top five by case kills, includes zeroes, and keeps your rank when outside the five',()=>{
  const {hud,root,state}=fixture();state.assignment=createAssignment('excessive-force',0);state.assignment.phase='active';
  const scores=Array.from({length:7},(_,i)=>({id:`p${i}`,name:`Rat ${i}`,kills:100-i,deaths:i}));hud.setScores(scores,'p6');
  state.assignment.caseKills={p1:3,p2:5,p3:1,p4:2};hud.update(state,5000);
  const rows=root.querySelector('.assignment-rankings').children;
  expect(rows).toHaveLength(5);expect(rows.map(r=>r.children.map(p=>p.textContent))).toEqual([
   ['1','Rat 2','5/10'],['2','Rat 1','3/10'],['3','Rat 4','2/10'],['4','Rat 3','1/10'],['5','Rat 0','0/10'],
  ]);
  expect(root.querySelector('.assignment-leader').textContent).toBe('YOU’RE #7 · 0/10');
  hud.update(state,5010);expect(root.querySelector('.assignment-rankings').children[0]).toBe(rows[0]);
  state.assignment.caseKills.p6=6;hud.update(state,5020);
  expect(root.querySelector('.assignment-rankings').children[0].dataset.local).toBe('true');
  expect(root.querySelector('.assignment-leader').hidden).toBe(true);
  state.assignment=createAssignment('closing-time',0);hud.update(state,6000);expect(root.querySelector('.assignment-rankings').hidden).toBe(true);hud.dispose();
 });
 it('confirms new case kills once, suppresses past awards on late join, and resets cleanly',()=>{
  const {hud,root,state,feedback}=fixture();hud.setScores([{id:'me',name:'Me',kills:18,deaths:4}],'me');
  state.assignment=createAssignment('excessive-force',0);state.assignment.phase='active';state.assignment.caseKills.me=5;
  state.case.owner='me';hud.update(state,5000,'Me',true);expect(feedback).not.toHaveBeenCalledWith('case-point');
  state.assignment.caseKills.me=6;hud.update(state,5010,'Me',true);hud.update(state,5020,'Me',true);
  expect(feedback.mock.calls.filter(([cue])=>cue==='case-point')).toHaveLength(1);
  expect(root.querySelector('.assignment-confirmation').textContent).toContain('CASE KILL +1');
  expect(root.querySelector('.assignment-detail').textContent).toBe('KILLS COUNT');
  state.assignment=createAssignment('excessive-force',6000);hud.update(state,6000,'Me',true);
  expect(root.querySelector('.assignment-progress').textContent).toContain('0 / 10');
  expect(root.querySelector('.assignment-confirmation').hidden).toBe(true);hud.dispose();
 });
 it('escalates the live final countdown and silences both loose and incident pauses',()=>{
  const {hud,root,state,feedback}=fixture();state.assignment=createAssignment('closing-time',0);state.assignment.phase='active';state.case.owner='me';
  state.assignment.remainingMs=19_000;hud.update(state,5000,'Me',true);
  state.assignment.remainingMs=18_000;hud.update(state,6000,'Me',true);expect(feedback).toHaveBeenCalledWith('countdown');
  state.assignment.remainingMs=4500;hud.update(state,7000,'Me',true);expect(feedback).toHaveBeenCalledWith('countdown-final');
  feedback.mockClear();state.case.owner=null;hud.update(state,7100);state.assignment.phase='suspended';hud.update(state,7200);
  expect(feedback.mock.calls.flat()).not.toContain('countdown-final');expect(root.querySelector('.assignment-ledger').dataset.urgent).toBe('false');
  expect(root.querySelector('.assignment-progress').textContent).toBe('0:05');hud.dispose();
 });
 it('confirms a personal delivery immediately and names the next landmark',()=>{
  const {hud,root,state,feedback}=fixture();state.assignment=createAssignment('chain-of-custody',0);state.assignment.destinations=[...CHAIN_ROUTE];state.assignment.phase='active';
  hud.setScores([{id:'me',name:'Me',kills:0,deaths:0}],'me');hud.update(state,5000);state.assignment.deliverySerial=1;state.assignment.deliveries.me=1;state.assignment.lastDelivery={playerId:'me',playerName:'Me',at:5010};hud.update(state,5010);
  expect(root.querySelector('.assignment-confirmation').textContent).toContain('PAPERWORK DELIVERED! +1 · 1/3');
  expect(root.querySelector('.assignment-target').textContent).toBe('DELIVER TO: SEWER MAINTENANCE');expect(feedback).toHaveBeenCalledWith('verified');hud.dispose();
 });
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
  expect(root.querySelector('.dispatch-brief').textContent).toBe(INCIDENT_QUIPS['popcorn-panic']);
  state.dispatch={phase:'cooldown',started:26000,until:42000,serial:1};hud.update(state,27000);
  expect(root.querySelector('.dispatch-artwork').dataset.incident).toBe('dispatch');
  expect(root.querySelector('.dispatch-brief').textContent).not.toBe(INCIDENT_QUIPS['popcorn-panic']);hud.dispose();
 });
 it('explains that Evidence Tampering weaponizes every case and restores ordinary copy afterward',()=>{
  const {hud,root,state}=fixture();
  state.dispatch={phase:'active',started:1000,until:26000,serial:1,incident:'evidence-tampering'};
  state.extraCases=[1,2,3,4,5,6,7].map(i=>({...state.case,id:`evidence-${i}`}));
  hud.update(state,1000);expect(root.querySelector('.case-ledger strong').textContent).toBe('8 CASES ARE MISSILES');
  expect(root.querySelector('.case-ledger small').textContent).toBe('PICKUP SUSPENDED');
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
  expect(root.querySelector('.case-ledger small').hidden).toBe(true);
  state.case.owner=null;hud.update(state,7200);expect(root.querySelector('.case-broadcast strong').textContent).toBe('LOOSE CASE');
  hud.dispose();expect(root.removed).toBe(true);
 });
 it('announces the local carrier without obsolete multiplier instructions',()=>{
  const {hud,root,state}=fixture();hud.update(state,1000);
  state.case.owner='local';hud.update(state,1100,'Constable Trap',true);
  expect(root.querySelector('.case-broadcast strong').textContent).toBe('YOU’RE ON THE CASE');
  expect(MUNICIPAL_QUIPS.casePickup).toContain(root.querySelector('.case-broadcast span').textContent);
  hud.update(state,5000,'Constable Trap',true);
  expect(root.querySelector('.case-ledger small').hidden).toBe(true);hud.dispose();
 });
 it('distinguishes your pickup/loss from others and emits one cue per ownership transition',()=>{
  const {hud,state,root,feedback}=fixture();hud.update(state,0);expect(feedback).not.toHaveBeenCalled();
  state.case.owner='me';hud.update(state,100,'Me',true);hud.update(state,110,'Me',true);
  expect(feedback.mock.calls).toEqual([['case-pickup']]);
  state.case.owner='other';hud.update(state,200,'Other',false);hud.update(state,210,'Other',false);
  expect(feedback.mock.calls).toEqual([['case-pickup'],['case-lost']]);
  expect(root.querySelector('.case-broadcast strong').textContent).toBe('YOU LOST THE CASE');
  expect(MUNICIPAL_QUIPS.caseLost).toContain(root.querySelector('.case-broadcast span').textContent);
  state.case.owner=null;hud.update(state,300);state.case.owner='third';hud.update(state,400,'Third');
  expect(feedback.mock.calls.slice(-2)).toEqual([['case-drop',state.case.p],['case-taken',state.case.p]]);hud.dispose();
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

it('celebrates delivery and relocation without playing the lost-case penalty cue or stacking center messages',()=>{
 const {hud,root,state,feedback}=fixture();state.assignment=createAssignment('chain-of-custody',0);state.assignment.phase='active';
 hud.setScores([{id:'me',name:'Me',kills:0,deaths:0}],'me');state.case.owner='me';hud.update(state,4000,'Me',true);feedback.mockClear();
 state.assignment.deliverySerial=1;state.assignment.deliveries.me=1;state.assignment.lastDelivery={playerId:'me',playerName:'Me',at:4100};state.case.owner=null;
 hud.update(state,4100,undefined,false);
 expect(feedback).toHaveBeenCalledWith('verified');expect(feedback).not.toHaveBeenCalledWith('case-lost');
 expect(root.querySelector('.assignment-confirmation').textContent).toContain('CASE RELOCATED');
 expect(root.querySelector('.case-broadcast strong').textContent).toBe('CASE RELOCATED');
 expect(root.querySelector('.case-broadcast').hidden).toBe(true);
 hud.dispose();
});

it('keeps a case quip stable between events and rotates it on a later pickup while retaining essential scoring status',()=>{
 const {hud,state,root}=fixture();state.assignment=createAssignment('excessive-force',0);state.assignment.phase='active';
 hud.setScores([{id:'me',name:'Me',kills:0,deaths:0}],'me');hud.update(state,4000);
 expect(root.querySelector('.assignment-detail').textContent).toBe('GET THE CASE TO SCORE');
 state.case.owner='me';hud.update(state,4100,'Me',true);
 const first=root.querySelector('.case-broadcast span').textContent;expect(MUNICIPAL_QUIPS.casePickup).toContain(first);
 for(let i=0;i<30;i++)hud.update(state,4101+i,'Me',true);
 expect(root.querySelector('.case-broadcast span').textContent).toBe(first);
 expect(root.querySelector('.assignment-detail').textContent).toBe('KILLS COUNT');expect(root.querySelector('.case-ledger small').hidden).toBe(true);
 state.case.owner=null;hud.update(state,4200);state.case.owner='me';hud.update(state,4300,'Me',true);
 expect(root.querySelector('.case-broadcast span').textContent).not.toBe(first);hud.dispose();
});

 it('shows Jurisdiction scores and deduplicates relocation cues without case-kill announcements',()=>{
  const {hud,root,state,feedback}=fixture();hud.setScores([{id:'me',name:'Me',kills:3,deaths:1}],'me');
  state.assignment=createAssignment('jurisdiction',0);state.assignment.phase='active';const j=state.assignment.jurisdiction!;
  j.heldMs.me=12000;j.scorerId='me';state.case.owner='me';hud.update(state,5000,'Me',true);
  expect(root.querySelector('.assignment-progress').textContent).toBe('YOU: 12 / 60');
  expect(root.querySelector('.assignment-detail').textContent).toBe('SCORING');
  expect(root.querySelector('.jurisdiction-timer').hidden).toBe(false);
  expect(root.querySelector('.assignment-zone-clock').textContent).toBe('75s');
  j.heldMs.me=13000;hud.update(state,6000,'Me',true);expect(feedback).not.toHaveBeenCalledWith('case-point');
  j.remainingMs=9999;hud.update(state,7000,'Me',true);hud.update(state,7100,'Me',true);
  expect(feedback.mock.calls.filter(([cue])=>cue==='countdown')).toHaveLength(1);
  expect(root.querySelector('.assignment-zone-next').hidden).toBe(false);
  expect(root.querySelector('.assignment-zone-clock').textContent).toBe('10s');
  expect(root.querySelector('.jurisdiction-timer').dataset.urgent).toBe('true');
  j.scorerId=null;hud.update(state,7200,'Me',true);expect(root.querySelector('.assignment-detail').textContent).toBe('TAKE THE CASE TO THE ZONE');
  j.scorerId='other';hud.update(state,7300,'Other',false);expect(root.querySelector('.assignment-detail').textContent).toBe('DISARM THE CARRIER');
  state.assignment.phase='suspended';hud.update(state,7400);expect(root.querySelector('.assignment-detail').textContent).toContain('PROGRESS PAUSED');
  expect(root.querySelector('.jurisdiction-timer-label').textContent).toBe('ZONE TIMER PAUSED');
  state.assignment=createAssignment('closing-time',8000);hud.update(state,8000);expect(root.querySelector('.jurisdiction-timer').hidden).toBe(true);
  state.assignment=undefined;hud.update(state,8100);expect(root.querySelector('.jurisdiction-timer').hidden).toBe(true);hud.dispose();
 });
