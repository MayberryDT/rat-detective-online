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
import {RatEntity} from '../../src/entities/RatEntity';
import {MatchScoreboard} from '../../src/ui/MatchScoreboard';
import {PROTOCOL_VERSION} from '../../src/shared/networkProtocol';
import {TouchControls} from '../../src/ui/TouchControls';
import {INCIDENTS} from '../../src/shared/incidentCatalog';

// Fixed presentation states over the real city and shoulder camera. This page
// has no gameplay input, matchmaking, scoring loop or network.
const query=new URLSearchParams(location.search),selection=query.get('assignment');
const id=isAssignmentId(selection)?selection:'excessive-force';
const view=query.get('view'),phase=query.get('phase'),now=Date.now();
const interiors:Record<string,{p:[number,number,number];heading:number}>={
    recordsinside:{p:[-36,.3,-43],heading:0},recordsupstairs:{p:[-36,8.3,-43],heading:0},
    iceinside:{p:[130,.3,-40],heading:0},needleinside:{p:[-94,.3,63],heading:Math.PI},
    pumpinside:{p:[125,.3,132],heading:0},sluiceinside:{p:[-137,.3,0],heading:Math.PI/2},
    alleywindow:{p:[-54,.3,15],heading:0},alleydoor:{p:[-40,.3,24],heading:0},
    alleycorner:{p:[23,.3,49],heading:Math.PI/2},
};
const interior=view?interiors[view]:undefined;
const position=interior?new THREE.Vector3(...interior.p):view==='streetlight'?new THREE.Vector3(-4,.3,-24.6):view==='dispatch'?new THREE.Vector3(-11,.3,-26):view==='city'?new THREE.Vector3(85,.3,35):view==='maintenance'?new THREE.Vector3(63,-6.7,-35.7):view==='sewer'?new THREE.Vector3(55,-6.7,-36):view==='icebox'?new THREE.Vector3(130,.3,-15):view==='archive'?new THREE.Vector3(-64,.3,-59):new THREE.Vector3(-16,.3,-21);
const heading=interior?interior.heading:view==='city'?-Math.atan2(45,96):view==='sewer'||view==='maintenance'||view==='streetlight'?-Math.PI/2:view==='offscreen'?Math.PI:view==='archive'?-Math.PI/2:0;
const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
const city=new Neighborhood(stage.scene,stage.world,spec);
const appearance={hatType:'fedora' as const,coatColor:0xbe4545,hatColor:0xdc4a3c,furColor:0xe8b84d};
const player=new RatController(stage.scene,stage.world,stage.camera,'Inspector Brie',appearance,position,CITY_BOUNDS);
player.entity.isPlayer=true;player.entity.billboard.sprite.visible=false;
player.onMouseMove((Math.PI-heading)/.002,view==='city'?-400:-180);player.entity.mesh.rotation.y=heading+Math.PI;
const distantRats=query.has('rats')?[12,26,42].map((distance,index)=>{
    const p=position.clone().add(new THREE.Vector3(distance,0,index===1?3:0));
    const rat=new RatEntity(stage.scene,stage.world,p,`Camera rat ${index+1}`,{...appearance,coatColor:[0x302639,0x25412d,0x403025][index]},true);
    rat.billboard.sprite.visible=false;rat.mesh.rotation.y=-Math.PI/2;rat.update(0);return rat;
}):[];
const actor=createPlayer('local','Inspector Brie',appearance,position),players=new Map([[actor.id,actor]]);
const sim=new ChaosSimulation(players,()=>{},undefined,spec);
const assignment=createAssignment(id,now-(phase==='briefing'?0:5000));
if(phase!=='briefing')assignment.phase='active';
if(id==='closing-time')assignment.remainingMs=Number(query.get('remaining'))||7300;
if(id==='chain-of-custody'){assignment.destinations=[...CHAIN_ROUTE];assignment.deliverySerial=Math.min(CHAIN_ROUTE.length-1,Math.max(0,Number(query.get('stop')??query.get('stamps'))||0));}
if(id==='chain-of-custody'){assignment.deliveries={local:1,'other-0':2,'other-2':1};assignment.deliverySerial+=6;}
if(id==='excessive-force')assignment.caseKills={local:6,'other-0':8,'other-2':4,'other-3':2};
sim.setAssignment(assignment);
const state=sim.snapshot(false);state.time=now;
if(query.get('dispatch')==='busy')state.dispatch={phase:'cooldown',started:now,until:now+16000,serial:1};
// Static incident states for reviewing simultaneous objective/mobile cards.
const fixtureIncident=INCIDENTS.find(incident=>incident.id===query.get('incident'))?.id??'popcorn-panic';
if(query.get('dispatch')==='rolling')state.dispatch={phase:'rolling',incident:fixtureIncident,started:now-800,until:now+1600,serial:1};
if(query.get('dispatch')==='reveal')state.dispatch={phase:'active',incident:fixtureIncident,started:now-1000,until:now+24000,serial:1};
if(query.get('dispatch')==='active')state.dispatch={phase:'active',incident:fixtureIncident,started:now-5000,until:now+20000,serial:1};
if(query.get('dispatch')==='ending')state.dispatch={phase:'active',incident:fixtureIncident,started:now-20000,until:now+5000,serial:1};
state.case.p={x:position.x+(view==='archive'?4:0),y:position.y+.9,z:position.z+(view==='archive'?0:-4)};
if(query.has('held'))state.case.owner=actor.id;
const caseEvent=query.get('caseEvent');
if(caseEvent==='lost')state.case.owner=actor.id;
if(caseEvent==='loose')state.case.owner='other-0';
if(query.has('cheese')){
    const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading)),right=new THREE.Vector3(Math.cos(heading),0,-Math.sin(heading));
    state.dispatch={phase:'active',incident:'crossfire',serial:1,started:now-5000,until:now+20000};
    state.shots=[-3,-1,1,3].flatMap((offset,i)=>[.15,.7].map((radius,j)=>{
        const p=position.clone().addScaledVector(forward,8+j*4).addScaledVector(right,offset*(j?1.7:1));p.y+=1.5;
        return {id:`cheese-${i}-${j}`,owner:i<2?'local':'other-0',wallBounced:i%2===1,p:{x:p.x,y:p.y,z:p.z},v:{x:-20,y:0,z:5},age:.2,radius};
    }));
}

if(phase==='suspended'){
    state.assignment!.phase='suspended';state.case.owner=null;
    state.dispatch={phase:'active',incident:'evidence-tampering',serial:1,started:now-5000,until:now+20_000};
    // Use the real incident constructor to populate all eight case visuals.
    const incident=new ChaosSimulation(players,()=>{},state,spec);incident.step(0,now);
    state.extraCases=incident.snapshot(false).extraCases;
}
if(phase==='closed'){
    const a=state.assignment!;a.phase='closed';a.remainingMs=0;if(id==='chain-of-custody'){a.deliverySerial++;a.deliveries.local=3;}
    if(id==='excessive-force')a.caseKills.local=10;
    a.result={winnerId:actor.id,winnerName:actor.name,at:now,method:id==='closing-time'?'held':id==='chain-of-custody'?'carried':'kills',posthumous:false};
}
const chaosView=new ChaosView(stage.scene,playerId=>playerId===actor.id?player.entity:undefined,undefined,false);
chaosView.apply(state);
const hud=new GameHud();
let fullScoreboard:MatchScoreboard|undefined;
if(phase==='title'){document.getElementById('player-name')!.textContent=actor.name;(document.getElementById('enter-city-btn') as HTMLButtonElement).disabled=false;}else hud.enterPlaying();
chaosView.setScores(['Detective Rind','Inspector Brie','Gumshoe Squeak','Sergeant Stilton','Officer Crumb'].map((name,index)=>({id:index===1?'local':`other-${index}`,name,kills:12-index*2,deaths:index+1})),actor.id);
if(query.has('scoreboard')){
    fullScoreboard=new MatchScoreboard();
    const names=['Detective Rind','Inspector Brie','Gumshoe Squeak','Sergeant Stilton','Officer Crumb','Inspector Fontina','Deputy Muenster','Lieutenant Curd','Captain Roquefort','Officer Havarti','Detective Wensleydale','Constable Colby'];
    const count=Math.max(2,Math.min(100,Number(query.get('roster'))||12));
    const roster=Array.from({length:count},(_,index)=>{
        const id=index===1?'local':index<5?`other-${index}`:`rd-ai-${index}`;
        return {...createPlayer(id,names[index%names.length],appearance,position),kills:Math.max(0,18-index),deaths:index%5,hp:index===3?0:3-index%3};
    });
    const boardState={...state,possession:Object.fromEntries(roster.map((p,i)=>[p.id,Math.max(0,55-i*7.2)]))};
    fullScoreboard.receive({type:'welcome',id:actor.id,player:actor,players:Object.fromEntries(roster.map(p=>[p.id,p])),round:{phase:'playing',assignment:state.assignment},world:spec,protocolVersion:PROTOCOL_VERSION,serverTime:now});
    fullScoreboard.receive({type:'chaos',state:boardState});fullScoreboard.setAvailable(true);fullScoreboard.setVisible(true);
}
let touch:TouchControls|undefined;
if(query.get('controls')==='touch'){
    touch=new TouchControls({canvas:stage.renderer.domElement,look:()=>{},shoot:()=>{},scores:visible=>fullScoreboard?.setVisible(visible),clearKeys:()=>{}});
    touch.setPlaying(phase!=='title');touch.update(0,phase!=='death'&&phase!=='closed');
    if(query.has('scoreboard'))touch.showScores(true);
}
if(caseEvent)setTimeout(()=>{state.case.owner=caseEvent==='pickup'?actor.id:caseEvent==='taken'?'other-0':null;state.time=now+20;chaosView.apply(state);},500);
if(query.has('confirm'))setTimeout(()=>{
    if(id==='excessive-force')state.assignment!.caseKills.local++;
    else if(id==='chain-of-custody'){const a=state.assignment!;a.deliverySerial++;a.deliveries.local++;a.lastDelivery={playerId:actor.id,playerName:actor.name,at:now+20};state.case.owner=null;state.case.p={x:82,y:1.3,z:-24};}
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
    city.update(0,stage.camera,position);chaosView.update(0,stage.camera);stage.renderer.render(stage.scene,stage.camera);
    (window as unknown as {lightingReview:object}).lightingReview={
        calls:stage.renderer.info.render.calls,triangles:stage.renderer.info.render.triangles,
        textures:stage.renderer.info.memory.textures,bodies:stage.world.bodies.length,
        lights:stage.scene.children.filter(o=>o instanceof THREE.Light).length,
        shadows:stage.scene.children.filter(o=>o instanceof THREE.Light&&o.castShadow).length,
    };
    chaosView.renderOutline(stage.renderer,stage.camera);
    if(sirenAudition){stage.camera.getWorldPosition(audioPosition);const nearest=DISPATCH_STATIONS.reduce((distance,s)=>Math.min(distance,Math.hypot(s.box.x-audioPosition.x,s.box.y+2.1-audioPosition.y,s.box.z-audioPosition.z)),Infinity);sirenAudition.update(state.dispatch.phase==='ready',nearest);}
});
window.addEventListener('resize',()=>{stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();stage.renderer.setSize(innerWidth,innerHeight);});
window.addEventListener('pagehide',()=>{stage.renderer.setAnimationLoop(null);sirenAudition?.dispose();if(deathReplay)clearInterval(deathReplay);for(const rat of distantRats)rat.dispose();touch?.dispose();fullScoreboard?.dispose();hud.dispose();chaosView.dispose();player.dispose();city.dispose();stage.dispose();},{once:true});
