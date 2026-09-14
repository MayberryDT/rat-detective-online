import '../../src/style.css';
import '../../src/ui/touchControls.css';
import {DispatchHud} from '../../src/prototype/DispatchHud';
import {createAssignment,isAssignmentId} from '../../src/shared/assignments';
import type {ChaosState} from '../../src/shared/chaosState';

// Static HUD inspection only: no gameplay, network, input capture or audio.
const query=new URLSearchParams(location.search),selected=query.get('assignment');
const id=isAssignmentId(selected)?selected:'chain-of-custody';
if(query.has('touch'))document.body.classList.add('touch-mode');
const hud=new DispatchHud(()=>{});
hud.setScores(Array.from({length:5},(_,i)=>({id:i?'rat-'+i:'me',name:['Inspector Brie','Officer Cheddar','Sergeant Stilton','Agent Gouda','Detective Swiss'][i],kills:5-i,deaths:i})),'me');
const a=createAssignment(id,0);a.phase='active';a.deliveries={me:1,'rat-1':2};a.caseKills={me:3,'rat-1':5};a.remainingMs=57000;
const state={time:5000,assignment:a,dispatch:{phase:'rolling',started:4500,until:6900,serial:1,incident:'popcorn-panic'},case:{owner:null,p:{x:0,y:0,z:0}},possession:{}} as unknown as ChaosState;
const report=document.createElement('output');report.style.cssText='position:fixed;bottom:12px;left:16px;z-index:99;color:#cabfd0;font:14px system-ui;max-width:90vw';document.body.appendChild(report);
let checked=0;
for(const mode of ['closing-time','chain-of-custody','excessive-force'] as const){
 state.assignment=createAssignment(mode,0);
 for(const [phase,started,now] of [['ready',0,1000],['rolling',4500,5000],['active',5000,6000],['active',5000,7850],['cooldown',5000,9000]] as const){
  state.dispatch={phase,started,until:30000,serial:1,incident:'popcorn-panic'};hud.update(state,now);
  const panel=document.querySelector<HTMLElement>('.assignment-ledger')!,style=getComputedStyle(panel);
  if(panel.hidden||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)throw new Error(mode+' score card hidden during '+phase);
  checked++;
 }
}
state.assignment=a;
const phase=query.get('phase');state.dispatch=phase==='briefing'?{phase:'ready',started:0,until:0,serial:1}:{phase:'rolling',started:4500,until:6900,serial:1,incident:'popcorn-panic'};
if(phase==='briefing'){state.assignment=createAssignment(id,5000);}
hud.update(state,5000);
report.textContent=`PASS · ${checked} mode/phase visibility checks · ${innerWidth} × ${innerHeight} · ${query.has('touch')?'touch':'desktop'} · static HUD review`;
addEventListener('pagehide',()=>hud.dispose());
