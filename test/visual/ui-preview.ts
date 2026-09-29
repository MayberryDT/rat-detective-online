/** UI workshop: the real HUD modules over a static city, with buttons that drive each
 * piece of the seventh-batch interface (U1–U9). Static review only: no network or input. */
import * as THREE from 'three';
import '../../src/style.css';
import {GameHud} from '../../src/ui/GameHud';
import {MatchScoreboard} from '../../src/ui/MatchScoreboard';
import {PlayerSettings} from '../../src/ui/PlayerSettings';
import {TouchControls} from '../../src/ui/TouchControls';
import {TitleScreen} from '../../src/ui/TitleScreen';
import {DispatchHud} from '../../src/prototype/DispatchHud';
import {AssignmentDestinations} from '../../src/prototype/AssignmentDestinations';
import {powerupCard} from '../../src/prototype/pickupArtwork';
import {ScreenFeel} from '../../src/feel/ScreenFeel';
import {leave} from '../../src/ui/motion';
import {playerPreferences} from '../../src/settings/PlayerPreferences';
import {createAssignment,type AssignmentId} from '../../src/shared/assignments';
import type {ChaosState} from '../../src/shared/chaosState';
import {PROTOCOL_VERSION,type Award,type ScoreEntry} from '../../src/shared/networkProtocol';
import {createWorldSpec,DEFAULT_CITY_OPTIONS} from '../../src/shared/worldSpec';
import {createPlayer} from '../../src/worker/gameState';
import {createStage} from '../../src/session/createStage';
import {CityGenerator} from '../../src/world/CityGenerator';
import {createRatMesh} from '../../src/utils/RatModel';

const params=new URLSearchParams(location.search);
if(params.has('capture'))document.getElementById('ui-panel')!.classList.add('hidden');else document.getElementById('ui-panel')!.classList.add('docked');

const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
stage.renderer.setPixelRatio(1);
new CityGenerator(stage.scene,stage.world,DEFAULT_CITY_OPTIONS,createWorldSpec(20260905)).generate();
stage.camera.position.set(15,3.6,23);stage.camera.lookAt(15,1.3,15);
stage.flashlight.position.set(15,5,22);stage.flashlight.target.position.set(15,1.2,15);
const suspect=createRatMesh({hatType:'fedora',hatColor:0x665342,furColor:0xc0aa81,coatColor:0x5a654b});
suspect.position.set(15,.8,17);suspect.rotation.y=Math.PI;stage.scene.add(suspect);
function render(){stage.renderer.setSize(innerWidth,innerHeight);stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();stage.renderer.render(stage.scene,stage.camera);}
render();addEventListener('resize',render);

const settings=new PlayerSettings();
settings.attach({playing:()=>playing,touch:()=>document.body.classList.contains('touch-mode'),clear:()=>{},resume:()=>{}});
const hud=new GameHud();
const screen=new ScreenFeel(()=>1);
let playing=false;
function enter():void {playing=true;touch?.setPlaying(true);touch?.update(0,true);}
document.getElementById('title-screen')?.classList.add('awake');
const title=new TitleScreen();title.settings=settings;title.onEnter=()=>{hud.enterPlaying();enter();};

const names=['Inspector Brie','Detective Rind','Gumshoe Squeak','Sergeant Stilton','Officer Crumb','Inspector Fontina','Deputy Muenster','Lieutenant Curd'];
const people=names.map((name,i)=>({...createPlayer(i?`rat-${i}`:'me',name,{hatType:'fedora',hatColor:1,coatColor:2,furColor:3},{x:0,y:0,z:0}),kills:9-i,deaths:i%3}));
const scores:ScoreEntry[]=people.map(p=>({id:p.id,name:p.name,kills:p.kills,deaths:p.deaths}));
let mode:AssignmentId='excessive-force';
let assignment=createAssignment(mode,0);
const state={time:0,assignment,dispatch:{phase:'ready',started:0,until:0,serial:0},case:{owner:null,p:{x:0,y:0,z:0}},possession:{me:31,'rat-1':62,'rat-2':12}} as unknown as ChaosState;
function setMode(id:AssignmentId):void {
    mode=id;assignment=createAssignment(id,0);assignment.phase='active';assignment.liveAt=0;
    assignment.caseKills={me:4,'rat-1':6,'rat-2':5,'rat-3':2};assignment.deliveries={me:1,'rat-1':2};
    if(assignment.jurisdiction)assignment.jurisdiction.heldMs={me:31000,'rat-1':44000,'rat-2':20000};
    state.assignment=assignment;
}
setMode('excessive-force');
const dispatch=new DispatchHud(()=>{});dispatch.setScores(scores,'me');
const destinations=new AssignmentDestinations();
const board=new MatchScoreboard();
board.receive({type:'welcome',id:'me',player:people[0]!,players:Object.fromEntries(people.map(p=>[p.id,p])),round:{phase:'playing',assignment},world:createWorldSpec(1),protocolVersion:PROTOCOL_VERSION,serverTime:0});
board.setAvailable(true);
const touch=params.get('controls')==='touch'?new TouchControls({canvas:stage.renderer.domElement,look:()=>{},shoot:()=>{},scores:visible=>board.setVisible(visible),clearKeys:()=>{}}):undefined;
const buffs=document.createElement('div');buffs.className='pickup-buffs';buffs.style.display='none';document.body.appendChild(buffs);

// Animated clocks: Closing Time and Jurisdiction count down in real time once started.
let clock:{kind:'closing'|'zone';until:number}|undefined;
let spreadSpeed=0,iris=-1;
let last=performance.now();
function frame(now:number){
    const dt=Math.min(.05,(now-last)/1000);last=now;
    if(clock&&assignment){
        const left=Math.max(0,clock.until-now);
        if(clock.kind==='closing')assignment.remainingMs=left;else if(assignment.jurisdiction)assignment.jurisdiction.remainingMs=left;
    }
    state.time=now;
    if(playing){dispatch.update(state,now,'YOU',state.case.owner==='me');destinations.updateCue(assignment,stage.camera,{x:15,y:0,z:23});}
    screen.crosshairMotion(spreadSpeed);
    if(iris>=0){iris+=dt;screen.iris(Math.max(0,Math.min(1,(iris-.8)/.6)),suspect.position,stage.camera,16);}
    screen.update(dt,stage.camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const award=(id:Award['id'],title:string,playerName:string,value:number):Award=>({id,title,playerId:playerName,playerName,value});
const awards=[award('top-gun','TOP GUN','Detective Rind',14),award('sharpshooter','SHARPSHOOTER','Inspector Brie',41),award('headhunter','HEADHUNTER','Gumshoe Squeak',4),
    award('legwork','LEGWORK','Officer Crumb',812),award('dispatcher','DISPATCHER','Sergeant Stilton',3),award('frequent-flier','FREQUENT FLIER','Deputy Muenster',6)];
// Every award a real round can hand out, with long names: the worst case for fitting the Case File.
const allAwards=[award('top-gun','TOP GUN','Lieutenant Gorgonzola',14),award('most-cheesed','MOST CHEESED','Inspector Fontina',23),award('butterfingers','BUTTERFINGERS','Deputy Muenster',5),
    award('sewer-dweller','SEWER DWELLER','Sergeant Stilton',96),award('high-flier','HIGH FLIER','Officer Crumb',129),award('sharpshooter','SHARPSHOOTER','Inspector Brie',41),
    award('headhunter','HEADHUNTER','Gumshoe Squeak',4),award('long-shot','LONG SHOT','Detective Rind',87),award('case-keeper','CASE KEEPER','Lieutenant Curd',143),
    award('frequent-flier','FREQUENT FLIER','Deputy Muenster',6),award('supply-run','SUPPLY RUN','Officer Crumb',9),award('legwork','LEGWORK','Constable Camembert',1812),
    award('dispatcher','DISPATCHER','Sergeant Stilton',3)];
function score(id:string,delta:number):void {
    const table=mode==='chain-of-custody'?assignment.deliveries:assignment.caseKills;table[id]=(table[id]??0)+delta;
    board.receive({type:'chaos',state});
}
const actions:Record<string,()=>void>={
    'Title: back to the wall':()=>location.reload(),
    'Title: roll a name (dice)':()=>document.getElementById('reroll-name-btn')!.click(),
    'Title: headlights through the blinds':()=>{for(const a of document.querySelector('.fx-sweep b')?.getAnimations()??[]){a.currentTime=3500+13000*.89;a.pause();}},
    'Title: pinned Settings':()=>document.getElementById('title-settings-btn')!.click(),
    'Title: ENTER CITY (swoop)':()=>document.getElementById('enter-city-btn')!.click(),
    'Title: swoop held mid-way':()=>{document.getElementById('enter-city-btn')!.click();
        const swoop=document.querySelector('.title-swoop');if(swoop)Object.defineProperty(swoop,'remove',{value:()=>{}});
        for(const a of document.getAnimations())if((a.effect as KeyframeEffect|null)?.target?.closest('.title-swoop')){a.currentTime=300;a.pause();}},
    'Enter instantly (no swoop)':()=>{hud.enterPlaying();enter();document.querySelector('.title-swoop')?.remove();},
    'Feed: you nabbed a rat':()=>hud.addKillFeed({kind:'kill',killer:'Inspector Brie',victim:'Detective Rind',local:'killer'}),
    'Feed: headshot':()=>hud.addKillFeed({kind:'kill',killer:'Gumshoe Squeak',victim:'Officer Crumb',headshot:true}),
    'Feed: you were nabbed':()=>hud.addKillFeed({kind:'kill',killer:'Sergeant Stilton',victim:'Inspector Brie',local:'victim'}),
    'Feed: the city (launcher)':()=>hud.addKillFeed({kind:'kill',killer:null,victim:'Deputy Muenster'}),
    'Feed: you called Dispatch':()=>hud.addKillFeed({kind:'dispatch',caller:'Inspector Brie',local:true}),
    'Feed: Dispatch called':()=>hud.addKillFeed({kind:'dispatch',caller:'Lieutenant Curd'}),
    'Feed: case note':()=>hud.addKillFeed({kind:'note',text:'Officer Crumb was filed under "tragic".'}),
    'Feed: all kinds':()=>{actions['Feed: you nabbed a rat']!();actions['Feed: headshot']!();actions['Feed: you were nabbed']!();actions['Feed: the city (launcher)']!();actions['Feed: you called Dispatch']!();},
    'Score: Case Kills mode':()=>setMode('excessive-force'),
    'Score: Paper Chase mode':()=>setMode('chain-of-custody'),
    'Score: case kill +1 (roll, fly)':()=>score('me',1),
    'Score: rank swap (you overtake)':()=>{score('me',3);},
    'Score: rival overtakes':()=>score('rat-3',5),
    'Score: Closing Time final 8 s':()=>{setMode('closing-time');state.case.owner='me';clock={kind:'closing',until:performance.now()+8000};},
    'Score: Jurisdiction last 10 s':()=>{setMode('jurisdiction');clock={kind:'zone',until:performance.now()+10000};},
    'Crosshair: walk (spread)':()=>{spreadSpeed=9;},
    'Crosshair: stand still':()=>{spreadSpeed=0;},
    'Crosshair: fire ×3':()=>{for(let i=0;i<3;i++)setTimeout(()=>screen.crosshairKick(),i*110);},
    'Crosshair: hit ×3 (stacking X)':()=>{for(let i=0;i<3;i++)setTimeout(()=>hud.showHitMarker(),i*90);},
    'Crosshair: heavy hit (3 dmg)':()=>hud.showHitMarker(3),
    'Crosshair: kill X':()=>hud.showKillConfirmation('Detective Rind'),
    'Crosshair: headshot X':()=>hud.showKillConfirmation('Detective Rind',true),
    'Death: iris, then RAT DOWN and clock':()=>{iris=0;hud.showRespawn(Date.now()+3000);},
    'Death: respawn':()=>{iris=-1;screen.reset();hud.hideRespawn();},
    'Round end: CASE CLOSED card':()=>{hud.showVictory('Detective Rind',9,assignment,awards);},
    'Round end: results (Case File stamps)':()=>{
        assignment.result={winnerId:'rat-1',winnerName:'Detective Rind',at:0,method:'kills',posthumous:false};board.receive({type:'chaos',state});
        hud.showResults(true);board.setVisible(true);},
    'Round end: full Case File (13 awards)':()=>{hud.showVictory('Lieutenant Gorgonzola',14,assignment,allAwards);
        assignment.result={winnerId:'rat-1',winnerName:'Lieutenant Gorgonzola',at:0,method:'kills',posthumous:false};board.receive({type:'chaos',state});
        hud.showResults(true);board.setVisible(true);},
    'Round end: done':()=>{hud.hideVictory();board.setVisible(false);delete assignment.result;},
    'Scoreboard: open':()=>board.setVisible(true),
    'Scoreboard: close':()=>board.setVisible(false),
    'Scoreboard: live reorder':()=>{const p=people[5]!;p.kills+=12;board.receive({type:'scoreboardUpdate',scores:people.map(x=>({id:x.id,name:x.name,kills:x.kills,deaths:x.deaths}))});score('rat-5',9);},
    'Settings: open folder':()=>settings.open(),
    'Settings: next tab':()=>{const tabs=[...document.querySelectorAll<HTMLButtonElement>('.settings-tab')];const i=tabs.findIndex(t=>t.classList.contains('active'));tabs[(i+1)%tabs.length]!.click();},
    'Settings: pause (Resume)':()=>{playing=true;settings.pause();},
    'Settings: tick the boxes':()=>playerPreferences().update({invertMouseY:true,invertTouchY:true}),
    'Settings: sliders mid-way':()=>playerPreferences().update({mouseSensitivity:1.55,touchSensitivity:1.6,masterVolume:.5,effectsVolume:.35,uiScale:1.05,cameraShake:.6,flashStrength:.4}),
    'Settings: stamp + on mouse sensitivity':()=>document.querySelector<HTMLButtonElement>('[aria-label="Raise mouse sensitivity"]')!.click(),
    'Settings: close':()=>{document.querySelector<HTMLButtonElement>('.settings-back')!.click();},
    'Cards: three pickups':()=>{buffs.style.display='flex';for(const kind of ['ironclad','hustle','quick-fix'] as const)buffs.appendChild(powerupCard(kind));},
    'Cards: expire one':()=>{const card=buffs.firstElementChild;if(card instanceof HTMLElement)leave(card,'paperSlide',[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(46px) rotate(6deg) scale(.9)'}]);},
    'Connection: reconnecting':()=>hud.setConnection('reconnecting'),
    'Connection: disconnected':()=>hud.setConnection('disconnected','Connection lost. The city keeps turning.'),
    'Connection: hide':()=>hud.setConnection('playing'),
    'Callout: COLD CASE':()=>screen.callout('COLD CASE'),
    'Case: you take the case':()=>{state.case.owner='me';},
    'Case: loose again':()=>{state.case.owner=null;},
    'Hot case marker (over the suspect)':()=>{
        const tag=document.querySelector<HTMLElement>('.hot-case-tag')??document.body.appendChild(document.createElement('div'));
        tag.className='hot-case-tag';tag.setAttribute('aria-label','Hot Case location');tag.innerHTML='<div class="hot-case-title">HOT CASE</div><div class="hot-case-detail">LOOSE · 24 m</div>';
        const p=suspect.position.clone();p.y+=2.1;p.project(stage.camera);
        tag.style.display='block';tag.style.transform=`translate(${(p.x+1)/2*innerWidth-87}px,${(1-p.y)/2*innerHeight-32}px)`;
    },
    'Dispatch: roulette, then incident':()=>{
        const now=performance.now(),d=state.dispatch;
        Object.assign(d,{phase:'rolling',started:now,until:now+2600,serial:d.serial+1,incident:'pressure-surge'});
        setTimeout(()=>Object.assign(d,{phase:'active',started:performance.now(),until:performance.now()+30000}),2600);
    },
    'Reduced motion on':()=>playerPreferences().update({reducedMotion:true}),
    'Reduced motion off':()=>playerPreferences().update({reducedMotion:false}),
};
const buttons=document.getElementById('ui-buttons')!;
for(const [label,run] of Object.entries(actions)){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',run);buttons.appendChild(button);
}
Object.assign(window,{feelActions:actions,hud,board,dispatch,settings});
// `?run=<action>` (repeatable) plays actions once ready, for headless captures.
void document.fonts.ready.then(()=>{for(const name of params.getAll('run'))actions[name]?.();document.body.dataset.ready='true';render();});
