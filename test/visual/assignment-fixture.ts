import * as THREE from 'three';
import '../../src/style.css';
import { createStage } from '../../src/session/createStage';
import { Neighborhood } from '../../src/prototype/Neighborhood';
import { RatController } from '../../src/player/RatController';
import { ChaosView } from '../../src/prototype/ChaosView';
import { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import { GameHud } from '../../src/ui/GameHud';
import { createPlayer } from '../../src/worker/gameState';
import { CITY_BOUNDS, CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { createAssignment, isAssignmentId, CHAIN_ROUTE } from '../../src/shared/assignments';
import { DISPATCH_STATIONS } from '../../src/shared/chaosState';
import { DispatchSirenAudio } from '../../src/audio/DispatchSirenAudio';

// Fixed presentation states over the real city and shoulder camera. This page
// has no gameplay input, matchmaking, scoring loop or network.
const query=new URLSearchParams(location.search),selection=query.get('assignment');
const id=isAssignmentId(selection)?selection:'excessive-force';
const view=query.get('view'),phase=query.get('phase'),now=Date.now();
const position=view==='streetlight'?new THREE.Vector3(-4,.3,-24.6):view==='dispatch'?new THREE.Vector3(-11,.3,-26):view==='city'?new THREE.Vector3(85,.3,35):view==='maintenance'?new THREE.Vector3(63,-6.7,-35.7):view==='sewer'?new THREE.Vector3(55,-6.7,-36):view==='icebox'?new THREE.Vector3(130,.3,-15):view==='archive'?new THREE.Vector3(-64,.3,-59):new THREE.Vector3(-16,.3,-21);
const heading=view==='city'?-Math.atan2(45,96):view==='sewer'||view==='maintenance'?-Math.PI/2:view==='offscreen'?Math.PI:view==='archive'?-Math.PI/2:0;
const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
const city=new Neighborhood(stage.scene,stage.world,spec);
const appearance={hatType:'fedora' as const,coatColor:0xbe4545,hatColor:0xdc4a3c,furColor:0xe8b84d};
const player=new RatController(stage.scene,stage.world,stage.camera,'Inspector Brie',appearance,position,CITY_BOUNDS);
player.entity.isPlayer=true;player.entity.billboard.sprite.visible=false;
player.onMouseMove((Math.PI-heading)/.002,view==='city'?-400:-180);player.entity.mesh.rotation.y=heading+Math.PI;
const actor=createPlayer('local','Inspector Brie',appearance,position),players=new Map([[actor.id,actor]]);
const sim=new ChaosSimulation(players,()=>{},undefined,spec);
const assignment=createAssignment(id,now-(phase==='briefing'?0:5000));
if(phase!=='briefing')assignment.phase='active';
if(id==='closing-time')assignment.remainingMs=Number(query.get('remaining'))||7300;
if(id==='chain-of-custody'){assignment.destinations=[...CHAIN_ROUTE];assignment.stamps=Math.min(CHAIN_ROUTE.length-1,Math.max(0,Number(query.get('stamps'))||0));}
if(id==='excessive-force')assignment.caseKills={local:6,'other-0':8,'other-2':4,'other-3':2};
sim.setAssignment(assignment);
const state=sim.snapshot(false);state.time=now;
if(query.get('dispatch')==='busy')state.dispatch={phase:'cooldown',started:now,until:now+16000,serial:1};
state.case.p={x:position.x+(view==='archive'?4:0),y:position.y+.9,z:position.z+(view==='archive'?0:-4)};
if(query.has('held'))state.case.owner=actor.id;
if(phase==='suspended'){
    state.assignment!.phase='suspended';state.case.owner=null;
    state.dispatch={phase:'active',incident:'evidence-tampering',serial:1,started:now-5000,until:now+20_000};
    // Use the real incident constructor to populate all eight case visuals.
    const incident=new ChaosSimulation(players,()=>{},state,spec);incident.step(0,now);
    state.extraCases=incident.snapshot(false).extraCases;
}
if(phase==='closed'){
    const a=state.assignment!;a.phase='closed';a.remainingMs=0;if(id==='chain-of-custody')a.stamps=CHAIN_ROUTE.length;
    if(id==='excessive-force')a.caseKills.local=10;
    a.result={winnerId:actor.id,winnerName:actor.name,at:now,method:id==='closing-time'?'held':id==='chain-of-custody'?'carried':'kills',posthumous:false};
}
const chaosView=new ChaosView(stage.scene,playerId=>playerId===actor.id?player.entity:undefined,undefined,false);
chaosView.apply(state);
const hud=new GameHud();
if(phase==='title'){document.getElementById('player-name')!.textContent=actor.name;(document.getElementById('enter-city-btn') as HTMLButtonElement).disabled=false;}else hud.enterPlaying();
chaosView.setScores(['Detective Rind','Inspector Brie','Gumshoe Squeak','Sergeant Stilton','Officer Crumb'].map((name,index)=>({id:index===1?'local':`other-${index}`,name,kills:12-index*2,deaths:index+1})),actor.id);
if(query.has('confirm'))setTimeout(()=>{
    if(id==='excessive-force')state.assignment!.caseKills.local++;
    else if(id==='chain-of-custody')state.assignment!.stamps=Math.min(CHAIN_ROUTE.length-1,state.assignment!.stamps+1);
    state.time=now+20;chaosView.apply(state);
},250);
let deathReplay:ReturnType<typeof setInterval>|undefined;
if(phase==='death'){const replay=()=>{hud.hideRespawn();hud.showRespawn(Date.now()+3000);};replay();deathReplay=setInterval(replay,4500);}
if(phase==='closed')hud.showVictory(actor.name,0,state.assignment);
const direction=new THREE.Vector3();
// Explicit opt-in to audition the real readiness sound from this fixed camera.
// The fixture stays silent until the reviewer presses LISTEN.
let sirenAudition:DispatchSirenAudio|undefined;
const listenButton=document.getElementById('fixture-listen') as HTMLButtonElement;
listenButton.hidden=view!=='dispatch';
listenButton.addEventListener('click',async()=>{
    if(sirenAudition){sirenAudition.dispose();sirenAudition=undefined;listenButton.textContent='LISTEN';return;}
    listenButton.disabled=true;
    try{await stage.listener.context.resume();sirenAudition=new DispatchSirenAudio(stage.listener.context);listenButton.textContent='MUTE';}
    catch{listenButton.textContent='RETRY AUDIO';}
    finally{listenButton.disabled=false;}
});
const audioPosition=new THREE.Vector3();
stage.renderer.setAnimationLoop(()=>{
    player.syncAfterPhysics(0);player.updateView();
    stage.flashlight.position.copy(position).add(new THREE.Vector3(0,2,0));stage.camera.getWorldDirection(direction);
    stage.flashlight.target.position.copy(stage.flashlight.position).addScaledVector(direction,15);
    city.update(0,stage.camera);chaosView.update(0,stage.camera);stage.renderer.render(stage.scene,stage.camera);chaosView.renderOutline(stage.renderer,stage.camera);
    if(sirenAudition){stage.camera.getWorldPosition(audioPosition);const nearest=DISPATCH_STATIONS.reduce((distance,s)=>Math.min(distance,Math.hypot(s.box.x-audioPosition.x,s.box.y+2.1-audioPosition.y,s.box.z-audioPosition.z)),Infinity);sirenAudition.update(state.dispatch.phase==='ready',nearest);}
});
window.addEventListener('resize',()=>{stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();stage.renderer.setSize(innerWidth,innerHeight);});
window.addEventListener('pagehide',()=>{stage.renderer.setAnimationLoop(null);sirenAudition?.dispose();if(deathReplay)clearInterval(deathReplay);hud.dispose();chaosView.dispose();player.dispose();city.dispose();stage.dispose();},{once:true});
