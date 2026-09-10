import * as THREE from 'three';
import * as C from 'cannon-es';
import {CHAOS_TUNING} from '../../src/shared/chaosState';
import {PracticeBotBrain,PracticeLifeCycle,addPracticePlayers,practiceBotCount,practiceSpawnPoints,cityPracticeSpawnPoints,practiceRespawnPoint} from '../../src/prototype/PracticeBots';
import {buildScoreboard} from '../../src/worker/gameState';
import {StaticCityBroadphase} from '../../src/shared/StaticCityBroadphase';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {RatController} from '../../src/player/RatController';
import {InputState} from '../../src/session/InputState';
import {bindPointerLockMenu} from '../../src/session/PointerLockMenu';
import {ChaosSimulation,type ChaosHit} from '../../src/shared/ChaosSimulation';
import {INCIDENTS,incidentInfo} from '../../src/shared/incidentCatalog';
import {CITY_BOUNDS,CITY_PREVIEW_SEED,GRAYBOX_VERSION} from '../../src/shared/grayboxLayout';
import {ChaosView} from '../../src/prototype/ChaosView';
import {RatEntity} from '../../src/entities/RatEntity';
import {createPlayer} from '../../src/worker/gameState';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {initEntitySounds,disposeEntitySounds} from '../../src/audio/EntityAudio';

const spec={seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION};
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
initEntitySounds(stage.listener);
const neighborhood=new Neighborhood(stage.scene,stage.world,spec);
const player=new RatController(stage.scene,stage.world,stage.camera,'',{hatType:'fedora',coatColor:0xbe4545,hatColor:0xdc4a3c,furColor:0xe8b84d},new THREE.Vector3(-10,0,-27),CITY_BOUNDS);
player.entity.billboard.sprite.visible=false;
const gun=new CheeseGun(stage.scene,stage.world,stage.listener);gun.setPlayer(stage.camera,player.entity);
gun.authoritative=true;
const appearance={hatType:'fedora' as const,coatColor:0xbe4545,hatColor:0xdc4a3c,furColor:0xe8b84d};
const search=new URLSearchParams(location.search);
const botCount=practiceBotCount(location.search);
if(botCount){stage.world.broadphase=new StaticCityBroadphase(stage.world);stage.world.broadphase.useBoundingBoxes=true;}
const players=new Map([['local',createPlayer('local','You',appearance,{x:-10,y:0,z:-27})]]);
const spawnPoints=cityPracticeSpawnPoints({x:-10,y:0,z:-27});
const botIds=addPracticePlayers(players,botCount,spawnPoints);
if(!botCount)players.set('practice',createPlayer('practice','Practice rat',{...appearance,coatColor:0x485a75,hatColor:0x526b94},{x:-18,y:0,z:-33}));
const entities=new Map<string,RatEntity>([['local',player.entity]]);
for(const data of players.values())if(data.id!=='local')entities.set(data.id,new RatEntity(stage.scene,stage.world,new THREE.Vector3(data.x,data.y,data.z),data.name,data));
const brains=new Map(botIds.map(id=>[id,new PracticeBotBrain()]));
const life=new PracticeLifeCycle(players);
const launched=new Map<string,number>();
const seenLaunches=new Set<string>();
const applyPracticeHit=(hit:ChaosHit)=>{
 const entity=entities.get(hit.victim),data=players.get(hit.victim);
 if(!entity||!data)return;
 const result=life.hit(hit.owner,hit.victim,hit.damage,Date.now(),chaos.caseHolderId);
 if(!result.applied)return;
 if(result.killed && chaos.death(data,hit.incoming,hit.owner))entity.useSharedCorpse();
 else entity.takeDamage(result.damage,new THREE.Vector3(hit.incoming.x,hit.incoming.y,hit.incoming.z));
};
let chaos=new ChaosSimulation(players,applyPracticeHit,undefined,spec);
player.entity.isPlayer=true;
const chaosView=new ChaosView(stage.scene,id=>entities.get(id),stage.listener.context as AudioContext,false);
const input=new InputState();const abort=new AbortController();const options={signal:abort.signal};
const canvas=stage.renderer.domElement;let overview=false;let viewTheta=0;player.onMouseMove(Math.PI/.002,0);
const status=document.getElementById('status')!;
const panel=document.getElementById('panel')!;
if(search.has('review'))panel.hidden=true;
function play(){overview=false;void canvas.requestPointerLock();void stage.listener.context.resume();}
const playButton=document.getElementById('play') as HTMLButtonElement;
playButton.textContent='Play / resume';
const veil=document.createElement('div');
veil.id='pause-veil';
Object.assign(veil.style,{position:'fixed',inset:'0',zIndex:'1',background:'#100b19aa'});
document.body.insertBefore(veil,panel);
document.getElementById('overview')!.onclick=()=>{overview=true;document.exitPointerLock();};
function reset(x:number,y:number,z:number,heading=0){life.respawn('local',{x,y,z});player.onMouseMove((viewTheta-heading)/.002,0);viewTheta=heading;player.entity.respawn({x,y,z,hp:3});player.resetGrounding();gun.clearProjectiles();input.clear();overview=false;player.entity.billboard.sprite.visible=false;}
document.getElementById('reset')!.onclick=()=>reset(-10,0,-27);
document.getElementById('gate')!.onclick=()=>reset(-147,0,0,-Math.PI/2);
document.getElementById('icebox')!.onclick=()=>reset(130,0,-18);
document.getElementById('needleworks')!.onclick=()=>reset(-105,0,127);
document.getElementById('pump')!.onclick=()=>reset(157,0,118,Math.PI/2);
document.getElementById('sewer')!.onclick=()=>reset(0,-7,0,Math.PI);
let practiceScores:HTMLElement|undefined;
if(botCount){
 const heading=panel.querySelector('h1');if(heading)heading.textContent=`Practice city · ${botCount+1} rats`;
 const intro=panel.querySelector('p');if(intro)intro.textContent='Local practice: bots walk, jump, shoot each other and you. Everyone respawns. Shoot Dispatch to try the incidents. Esc opens this menu.';
 const regroup=document.createElement('button');regroup.textContent='Bring bots to this neighborhood';regroup.onclick=()=>{
  const candidate=practiceSpawnPoints(player.entity.body.position);
  for(const [i,id] of botIds.entries()){const p=candidate[(i*3)%candidate.length];if(p){life.respawn(id,p);entities.get(id)!.respawn({...p,hp:3});}}
 };panel.appendChild(regroup);
 const incidentChoice=document.createElement('select');incidentChoice.setAttribute('aria-label','Practice incident');incidentChoice.style.cssText='display:block;width:100%;margin-top:10px;padding:8px;background:#28212a;color:#f4e6ce;border:1px solid #806644';
 for(const incident of INCIDENTS){const option=document.createElement('option');option.value=incident.id;option.textContent=incident.title;incidentChoice.appendChild(option);}
 panel.appendChild(incidentChoice);
 const testIncident=document.createElement('button');testIncident.textContent='Start selected incident';testIncident.onclick=()=>{
  const state=chaos.snapshot(false),incident=INCIDENTS.find(i=>i.id===incidentChoice.value)!;
  state.dispatch={phase:'active',incident:incident.id,serial:state.dispatch.serial+1,started:state.time,until:state.time+CHAOS_TUNING.activeMs};
  // Local-only fixture reconstruction uses the normal shared simulation and leaves server code untouched.
  chaos=new ChaosSimulation(players,applyPracticeHit,state,spec);
 };panel.appendChild(testIncident);
 const scoreBox=document.createElement('section');scoreBox.id='practice-scoreboard';scoreBox.style.cssText='position:fixed;top:16px;left:16px;width:250px;padding:12px 15px;background:#17151de6;border-top:3px solid #cfb883;color:#f4e6ce;pointer-events:none;font:12px/1.65 monospace';
 const scoreTitle=document.createElement('strong');scoreTitle.textContent='SCOREBOARD';scoreTitle.style.cssText='display:block;letter-spacing:.1em;font:700 15px Georgia,serif;margin-bottom:6px';scoreBox.appendChild(scoreTitle);
 const scoreLegend=document.createElement('div');scoreLegend.textContent='RAT                    K / D';scoreLegend.style.color='#aa9f91';scoreBox.appendChild(scoreLegend);
 practiceScores=document.createElement('div');practiceScores.style.whiteSpace='pre-line';scoreBox.appendChild(practiceScores);document.body.appendChild(scoreBox);
 const scoreStyle=document.createElement('style');scoreStyle.textContent='body:not(.playing) #practice-scoreboard{display:none}#panel{max-height:calc(100vh - 32px);overflow:auto}';document.head.appendChild(scoreStyle);
}else{
 const startBots=document.createElement('button');startBots.textContent='Practice with 11 AI rats';startBots.onclick=()=>{location.search='?bots=11';};panel.appendChild(startBots);
}

const reviewView=search.get('view');
if(reviewView==='pressure')reset(146,0,151);
if(reviewView==='dumpster')reset(-57,0,-27);
if(reviewView==='fan')reset(75,0,41);
if(reviewView==='manhole')reset(72,0,9);
if(reviewView==='sewer-detail')reset(-90,-7,0,-Math.PI/2);
if(reviewView==='case-carry')reset(-16,0,-28);
if(reviewView==='approach')reset(-16,0,-21);
if(reviewView==='side')reset(-30,0,-48,Math.PI);
if(reviewView==='rear')reset(-16,0,-84,Math.PI);
if(reviewView==='gate')reset(-147,0,0,-Math.PI/2);
if(reviewView==='icebox')reset(130,0,-18);
if(reviewView==='needleworks')reset(-105,0,127);
if(reviewView==='pump')reset(157,0,118,Math.PI/2);
if(reviewView==='icebox-interior')reset(130,0,-43);
if(reviewView==='records-interior')reset(-16,0,-48);
if(reviewView==='needleworks-interior')reset(-105,0,98);
if(reviewView==='pump-interior')reset(125,0,128);
if(reviewView==='records-upper')reset(-30,16,-70,Math.PI);
if(reviewView==='pump-upper')reset(146,8,112,Math.PI);
if(reviewView==='needleworks-upper')reset(-85,16,75,Math.PI);
window.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){player.onMouseMove(e.movementX,e.movementY);viewTheta-=e.movementX*.002;}},options);
window.addEventListener('keydown',e=>{if(e.code==='KeyM'){overview=!overview;if(overview)document.exitPointerLock();}if(e.code==='Space')e.preventDefault();},options);
panel.style.zIndex='3';
const pointerMenu=search.has('review')?{dispose(){panel.hidden=true;veil.hidden=true;}} :
 bindPointerLockMenu({canvas,panel,play:playButton,lock:play,veil,signal:abort.signal});
if(search.has('review')){panel.hidden=true;veil.hidden=true;}
window.addEventListener('mousedown',e=>{
 if(document.pointerLockElement!==canvas)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.button===0&&!player.entity.dead){
  const target=stage.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(200).add(stage.camera.position);
  const shot=gun.shoot(player.entity,target);if(shot)chaos.shoot('local',shot);
 }
},{...options,capture:true});
function resize(){stage.renderer.setSize(innerWidth,innerHeight);stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();}window.addEventListener('resize',resize,options);resize();
const direction=new THREE.Vector3();
const rayFrom=new C.Vec3(),rayTo=new C.Vec3(),rayResult=new C.RaycastResult();
// Aim/obstacle probes ignore every rat, testing world geometry only.
const staticBodies=stage.world.bodies.filter(body=>body.type===C.Body.STATIC);
const visibilityRay=new C.Ray();
function visibleFrom(entity:RatEntity,target:{x:number;y:number;z:number},height=1.1){
 rayFrom.set(entity.body.position.x,entity.body.position.y+height,entity.body.position.z);
 rayTo.set(target.x,target.y+height,target.z);rayResult.reset();
 visibilityRay.from.copy(rayFrom);visibilityRay.to.copy(rayTo);visibilityRay.mode=C.Ray.ANY;
 visibilityRay.skipBackfaces=true;visibilityRay.result=rayResult;visibilityRay.hasHit=false;
 visibilityRay.intersectBodies(staticBodies,rayResult);return !rayResult.hasHit;
}
let last=performance.now(),acc=0,scoreAt=0;
stage.renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,0.05);last=now;acc+=dt;
while(acc>=1/60){
 const tick=Date.now();
 for(const id of life.due(tick)){
  const entity=entities.get(id)!;
  const point=id==='local'?{x:-10,y:2,z:-27}:practiceRespawnPoint(spawnPoints,players.values(),id);
  life.respawn(id,point);entity.respawn({...point,hp:3});launched.delete(id);
  if(id==='local'){player.resetGrounding();entity.billboard.sprite.visible=false;}
 }
 player.prepareMovement(1/60,document.pointerLockElement===canvas?input.keys:{});
 for(const [id,brain] of brains){
  const entity=entities.get(id)!,data=players.get(id)!;
  if(entity.dead)continue;
  if(document.pointerLockElement!==canvas){entity.body.velocity.x*=.8;entity.body.velocity.z*=.8;continue;}
  let grounded=false;
  for(const contact of stage.world.contacts){const normal=contact.bi===entity.body?-contact.ni.y:contact.bj===entity.body?contact.ni.y:0;if(normal>.5){grounded=true;break;}}
  const v=entity.body.velocity;
  const blocked=grounded&&Math.hypot(v.x,v.z)<1;
  const intent=brain.step(tick,data,players.values(),target=>visibleFrom(entity,target),blocked,grounded);
  if((launched.get(id)??0)<tick){v.x+=(intent.x-v.x)*.14;v.z+=(intent.z-v.z)*.14;if(intent.jump)v.y=16;}
  for(const axis of ['x','z'] as const){if(entity.body.position[axis]<CITY_BOUNDS.min+4&&v[axis]<0)v[axis]=Math.max(8,-v[axis]*.45);if(entity.body.position[axis]>CITY_BOUNDS.max-4&&v[axis]>0)v[axis]=-Math.max(8,v[axis]*.45);}
  entity.mesh.rotation.y=intent.facing;
  entity.body.wakeUp();
  if(intent.shoot){const shot=gun.shoot(entity,new THREE.Vector3(intent.shoot.x,intent.shoot.y,intent.shoot.z));if(shot)chaos.shoot(id,shot);}
 }
 stage.world.step(1/60);player.syncAfterPhysics(1/60);gun.update(1/60);
 for(const [id,entity] of entities){
  if(id!=='local'){
   for(const axis of ['x','z'] as const){const value=entity.body.position[axis];entity.body.position[axis]=Math.max(CITY_BOUNDS.min+3,Math.min(CITY_BOUNDS.max-3,value));if(value!==entity.body.position[axis])entity.body.aabbNeedsUpdate=true;}
   entity.update(1/60);
  }
  if(id!=='local' && !entity.dead && (entity.body.position.y< -20 || !Number.isFinite(entity.body.position.x+entity.body.position.y+entity.body.position.z))){
   const point=practiceRespawnPoint(spawnPoints,players.values(),id);life.respawn(id,point);entity.respawn({...point,hp:3});
  }
  const data=players.get(id)!,p=entity.body.position,q=entity.mesh.quaternion;
  Object.assign(data,{x:p.x,y:p.y,z:p.z,hp:entity.hp,meshQx:q.x,meshQy:q.y,meshQz:q.z,meshQw:q.w});
 }
 chaos.step(1/60,tick);acc-=1/60;}
const chaosState=chaos.snapshot();
// Explicit review-only broadcast frames, rendered over the ordinary gameplay camera.
if(new URLSearchParams(location.search).has('review')&&reviewView?.startsWith('dispatch-')){
 const active=reviewView==='dispatch-active';
 chaosState.dispatch={phase:active?'active':'rolling',incident:'pressure-surge',serial:99,started:chaosState.time-(active?900:1700),until:chaosState.time+(active?24100:700)};
}
player.applyPressureLaunches(chaosState,'local');
for(const event of chaosState.pressure?.launches||[]){const entity=entities.get(event.playerId);if(event.playerId!=='local' && entity && !seenLaunches.has(event.id) && !entity.dead){seenLaunches.add(event.id);if(seenLaunches.size>64)seenLaunches.delete(seenLaunches.values().next().value!);entity.body.velocity.set(event.velocity.x,event.velocity.y,event.velocity.z);entity.body.wakeUp();launched.set(event.playerId,Date.now()+2600);}}
gun.fireCue=chaosState.dispatch.phase==='active'&&incidentInfo(chaosState.dispatch.incident).id==='bad-ammunition'?'malfunction':'normal';
chaosView.apply(chaosState);
const p=player.entity.mesh.position;
if(p.y < -20 && !player.entity.dead)reset(-10,0,-27);
(stage.scene.fog as THREE.FogExp2).density=overview?0.00045:0.008;
if(overview){
 const mid=(CITY_BOUNDS.min+CITY_BOUNDS.max)/2,span=CITY_BOUNDS.max-CITY_BOUNDS.min;
 stage.camera.position.set(mid+span*0.22,span*0.78,mid+span*0.26);stage.camera.lookAt(mid,0,mid);
}else{player.updateView();}
stage.flashlight.position.copy(p).add(new THREE.Vector3(0,2,0));stage.camera.getWorldDirection(direction);stage.flashlight.target.position.copy(stage.flashlight.position).addScaledVector(direction,15);
neighborhood.update(dt,stage.camera);
if(practiceScores && now>=scoreAt){scoreAt=now+500;practiceScores.textContent=buildScoreboard(players.values()).map(p=>`${p.name.padEnd(20)} ${p.kills} / ${p.deaths}`).join('\n');}
status.textContent=player.entity.dead?`Respawning in ${Math.max(1,Math.ceil(((life.respawns.get('local')??Date.now())-Date.now())/1000))}…`:overview?'Full city overview':p.y < -3?'Sewers · follow the lit passages':'Street level · M overview · Esc menu';chaosView.update(dt,stage.camera);stage.renderer.render(stage.scene,stage.camera);chaosView.renderOutline(stage.renderer,stage.camera);
});
window.addEventListener('pagehide',()=>{stage.renderer.setAnimationLoop(null);abort.abort();pointerMenu.dispose();input.dispose();chaosView.dispose();gun.dispose();for(const [id,entity] of entities)if(id!=='local')entity.dispose();player.dispose();neighborhood.dispose();disposeEntitySounds();stage.dispose();},{once:true});
