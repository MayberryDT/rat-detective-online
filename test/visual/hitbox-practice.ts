import {FeedbackAudio} from '../../src/audio/FeedbackAudio';
import {HeldFire} from '../../src/session/HeldFire';
import {WEAPON_TUNING} from '../../src/shared/pickups';
import {LaserBeamVisual} from '../../src/prototype/LaserBeamVisual';
import {TrapField} from '../../src/prototype/TrapVisual';
import {PickupVisual} from '../../src/prototype/PickupVisual';
import * as THREE from 'three';
import * as C from 'cannon-es';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {RatController} from '../../src/player/RatController';
import {InputState} from '../../src/session/InputState';
import {bindPointerLockMenu} from '../../src/session/PointerLockMenu';
import {RatEntity} from '../../src/entities/RatEntity';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {CheeseImpactEffects} from '../../src/weapons/CheeseImpactEffects';
import {createCheeseBallGeometry,createCheeseBallMaterial} from '../../src/weapons/CheeseProjectileModel';
import {initEntitySounds,disposeEntitySounds} from '../../src/audio/EntityAudio';
import {FeelDirector} from '../../src/feel/FeelDirector';
import {FoleyAudio} from '../../src/audio/FoleyAudio';
import {duckWorld} from '../../src/audio/PlayerAudioMix';
import {playerPreferences} from '../../src/settings/PlayerPreferences';
import {MAX_HP} from '../../src/shared/networkProtocol';
import {SHOOT_RATE} from '../../src/shared/shotTiming';
import {CITY_BOUNDS} from '../../src/shared/grayboxLayout';
import {CHAOS_TUNING} from '../../src/shared/chaosState';
import {HitboxPractice,PRACTICE_APPEARANCE,PRACTICE_START,PRACTICE_TARGETS,PRACTICE_SUPPLIES,PRACTICE_WORLD} from './HitboxPractice';

const candidate=new URLSearchParams(location.search).get('shooting')!=='stock';
document.body.classList.toggle('heavy-cheese',candidate);
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
initEntitySounds(stage.listener);
const neighborhood=new Neighborhood(stage.scene,stage.world,PRACTICE_WORLD);
const player=new RatController(stage.scene,stage.world,stage.camera,'You',PRACTICE_APPEARANCE,
    new THREE.Vector3(PRACTICE_START.x,PRACTICE_START.y,PRACTICE_START.z),CITY_BOUNDS);
player.entity.isPlayer=true;player.entity.billboard.sprite.visible=false;
const gun=new CheeseGun(stage.scene,stage.world,stage.listener);
gun.setPlayer(stage.camera,player.entity);gun.authoritative=true;
const feel=new FeelDirector();feel.attach(stage.renderer.domElement,stage.listener);
const foley=new FoleyAudio(stage.listener);const feedback=new FeedbackAudio(stage.listener);
if(candidate){feel.enableHeavyCheese(stage.scene);gun.localReport=()=>feel.heavyReport();gun.localWeaponReport=weapon=>feel.heavyArsenal(weapon);}
const diagnostics={candidate,shots:0,hits:0,kills:0,jumps:0,maxY:0,steps:0,events:[] as object[]};
const note=(event:object)=>{diagnostics.events.push({at:performance.now(),...event});if(diagnostics.events.length>100)diagnostics.events.shift();};
Object.assign(window,{__practice:()=>({...diagnostics,position:{...player.entity.body.position},camera:stage.camera.position.toArray(),quaternion:stage.camera.quaternion.toArray(),targets:[...practice.players.values()].map(p=>({id:p.id,x:p.x,y:p.y,z:p.z,hp:p.hp,screen:new THREE.Vector3(p.x,p.y+1,p.z).project(stage.camera).toArray()})),weapon:practice.simulation.weapon('local'),traps:practice.simulation.snapshot(false).traps??[],locked:document.pointerLockElement===stage.renderer.domElement})});
// Read-only, opt-in diagnostics for the existing range consumer; no hit injection.
const aimProbe=new URLSearchParams(location.search).has('aimProbe');
const renderedCamera=stage.camera.clone();
let lastDraw:unknown;
function aimSample(camera:THREE.PerspectiveCamera){
    camera.updateMatrixWorld(true);
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(),camera);
    const hits=ray.intersectObjects(stage.scene.children.filter(o=>o.userData.aimTarget===true),true);
    const hit=hits.find(h=>{let self=h.object===player.entity.mesh;h.object.traverseAncestors(a=>{if(a===player.entity.mesh)self=true;});return !self;});
    const target=hit?hit.point.clone():ray.ray.at(200,new THREE.Vector3());
    return {origin:ray.ray.origin.toArray(),direction:ray.ray.direction.toArray(),target:target.toArray(),object:hit?.object.name??'sky',fov:camera.fov,quaternion:camera.quaternion.toArray()};
}
if(aimProbe)Object.assign(window,{__aim:()=>({lastDraw,events:diagnostics.events}),__aimProject:(x:number,y:number,z:number)=>({ndc:new THREE.Vector3(x,y,z).project(renderedCamera).toArray(),fov:renderedCamera.fov,aspect:renderedCamera.aspect})});
const targets=new Map<string,RatEntity>();
const result=document.getElementById('result')!;
const totals=document.getElementById('totals')!;
const crosshair=document.getElementById('crosshair')!;
let hitUntil=0;
const hitDirection=new THREE.Vector3(),contact=new THREE.Vector3(),outward=new THREE.Vector3();
// This private range is served on tailnet HTTP. randomUUID is secure-context-only;
// preserve UUID entropy using the Web Crypto primitive available on HTTP too.
if(!crypto.randomUUID)crypto.randomUUID=()=>('10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16))) as `${string}-${string}-${string}-${string}-${string}`;
const practice=new HitboxPractice(hit=>{
    const entity=targets.get(hit.target)!;
    hitDirection.set(hit.incoming.x,hit.incoming.y,hit.incoming.z).normalize();
    if(!hit.killed){entity.takeDamage(hit.damage,hitDirection,candidate);if(!candidate)feel.impact(entity,false);}
    else {entity.hp=MAX_HP;entity.billboard.setHealth(MAX_HP);if(candidate)entity.heavyReaction(hitDirection);}
    if(candidate){
        if(hit.point)contact.set(hit.point.x,hit.point.y,hit.point.z);else contact.copy(entity.mesh.position).add(new THREE.Vector3(0,1,0));
        feel.heavyImpact(contact,outward.copy(hitDirection).negate(),entity.mesh);
    }else {foley.play('hit-confirm');if(!hit.killed)feel.hitDealt(entity.mesh.position,stage.camera);}
    duckWorld(stage.listener.context,hit.killed?1:.5);
    if(hit.killed){feel.killed(entity.mesh.position,false,stage.camera,performance.now(),false,hit.region==='HEAD');if(hit.region==='HEAD')feel.headshot(entity.mesh.position,stage.camera,true);}
    result.textContent=`${entity.name} · ${hit.region} · ${hit.damage} damage · ${hit.killed?'KILL / REFILLED':`${hit.remaining} HP left`}`;
    if(hit.killed||!crosshair.classList.contains('kill-confirmed')){
    hitUntil=performance.now()+(hit.killed?hit.region==='HEAD'?700:500:180);
    crosshair.classList.remove('hit-confirmed','kill-confirmed','headshot');void crosshair.offsetWidth;
    crosshair.classList.add(hit.killed?'kill-confirmed':'hit-confirmed');if(hit.killed&&hit.region==='HEAD')crosshair.classList.add('headshot');
    }
    diagnostics.hits=practice.hits;diagnostics.kills=practice.kills;note({kind:'confirmed-hit',...hit});
});
practice.moving=true;
for(const target of PRACTICE_TARGETS){
    const data=practice.players.get(target.id)!;
    const entity=new RatEntity(stage.scene,stage.world,new THREE.Vector3(data.x,data.y,data.z),data.name,data,true);
    entity.mesh.rotation.y=target.yaw;entity.syncGlowTransform();
    entity.billboard.sprite.position.set(data.x,data.y+2.65,data.z);
    // Kinematic authority poses; presentation can react without moving these hit shapes.
    targets.set(target.id,entity);
}

const held=new HeldFire();
const laser=new LaserBeamVisual(stage.scene,(cue,at)=>{if(!candidate)feedback.play(cue,at);});laser.apply([]);
const trapField=new TrapField(stage.scene);
const supplies=new Map(PRACTICE_SUPPLIES.map(site=>{const visual=new PickupVisual(stage.scene,site.kind);visual.setPosition(site.p.x,site.p.y,site.p.z);return[site.id,visual] as const;}));
function visitRack(index:number){
    const site=PRACTICE_SUPPLIES[index];
    player.entity.respawn({x:site.p.x,y:site.p.y-.7,z:site.p.z,hp:MAX_HP});player.entity.billboard.sprite.visible=false;player.resetGrounding();
    Object.assign(practice.players.get('local')!,{x:site.p.x,y:site.p.y-.7,z:site.p.z});
    practice.restockRack(site.id);held.release();player.updateView();
    for(const wire of wireTargets){const entry=[...practice.simulation.targets].find(([,t])=>t.kind==='rat'&&t.player?.id===wire.id);if(entry)wire.body=entry[0];}

}

// Debug wires are built from authoritative bodies, not copied model dimensions.
const wireTargets:Array<{mesh:THREE.Mesh;body:C.Body;offset:C.Vec3;id:string}>=[];
const hitboxes=new THREE.Group();hitboxes.visible=false;stage.scene.add(hitboxes);
const wireGeometry=new THREE.SphereGeometry(1,16,10);
const bodyMaterial=new THREE.MeshBasicMaterial({color:0x70e5d3,wireframe:true,transparent:true,opacity:.6,depthTest:false,depthWrite:false,toneMapped:false});
const headMaterial=bodyMaterial.clone();headMaterial.color.setHex(0xffd574);
for(const [body,target] of practice.simulation.targets){
    if(target.kind!=='rat'||target.player?.id==='local')continue;
    body.shapes.forEach((shape,index)=>{
        if(!(shape instanceof C.Sphere))return;
        const mesh=new THREE.Mesh(wireGeometry,shape===target.head?headMaterial:bodyMaterial);
        const center=body.pointToWorldFrame(body.shapeOffsets[index]);
        mesh.position.set(center.x,center.y,center.z);mesh.scale.setScalar(shape.radius);mesh.renderOrder=100;
        hitboxes.add(mesh);wireTargets.push({mesh,body,offset:body.shapeOffsets[index],id:target.player!.id});
    });
}
// The ordinary game ball and impact visuals follow shared simulation snapshots.
const ballGeometry=createCheeseBallGeometry(),ballMaterial=createCheeseBallMaterial();
const balls=new THREE.InstancedMesh(ballGeometry,ballMaterial,CHAOS_TUNING.maxShots);
balls.count=0;balls.frustumCulled=false;stage.scene.add(balls);
const ballPose=new THREE.Object3D();
const impacts=new CheeseImpactEffects(stage.scene);
const point=new THREE.Vector3(),normal=new THREE.Vector3(),direction=new THREE.Vector3();
const canvas=stage.renderer.domElement;
const input=new InputState(),abort=new AbortController();
const options={signal:abort.signal};
const panel=document.getElementById('panel')!;
const play=document.getElementById('play') as HTMLButtonElement;
const overlay=document.getElementById('overlay') as HTMLButtonElement;
const overlayStatus=document.getElementById('overlay-status')!;
const pointerMenu=bindPointerLockMenu({canvas,panel,play,veil:document.getElementById('veil')!,signal:abort.signal,
    lock:()=>{play.blur();canvas.focus();void canvas.requestPointerLock().catch(()=>{result.textContent='Mouse capture refused. Click Enter again in this tab.';});void stage.listener.context.resume();}});
function toggleHitboxes(){
    hitboxes.visible=!hitboxes.visible;
    overlay.textContent=hitboxes.visible?'Hide hitboxes':'Show hitboxes';
    overlayStatus.textContent=hitboxes.visible?'Gold: head · Cyan: body · H to hide':'Hitboxes hidden · H to show';
}
overlay.addEventListener('click',toggleHitboxes,options);
canvas.tabIndex=0;
const volume=document.getElementById('volume') as HTMLInputElement,calm=document.getElementById('calm') as HTMLInputElement;
volume.value=String(playerPreferences().current.masterVolume);calm.checked=playerPreferences().current.reducedMotion;
volume.addEventListener('input',()=>playerPreferences().update({masterVolume:Number(volume.value)}),options);
calm.addEventListener('change',()=>{playerPreferences().update({reducedMotion:calm.checked,flashStrength:calm.checked?0:1});document.body.classList.toggle('reduced-motion',calm.checked);},options);
document.body.classList.toggle('reduced-motion',calm.checked);
(document.getElementById('variant')!).textContent=candidate?'HEAVY CHEESE · CANDIDATE':'STOCK PRESENTATION';
let theta=Math.PI,phi=Math.PI*.4;
function returnToLine(){
    player.entity.respawn({...PRACTICE_START,hp:MAX_HP});player.entity.billboard.sprite.visible=false;player.resetGrounding();
    Object.assign(practice.players.get('local')!,PRACTICE_START);
    const aimTheta=-1.215,aimPhi=1.665;
    player.onMouseMove((theta-aimTheta)/.002,(phi-aimPhi)/.002);theta=aimTheta;phi=aimPhi;
    input.clear();player.updateView();
}
function trapTestLine(occupied:boolean){
    const p=occupied?{x:-16.9,y:0,z:-22}:{x:63,y:0,z:-46};
    player.entity.respawn({...p,hp:MAX_HP});player.entity.billboard.sprite.visible=false;player.resetGrounding();
    Object.assign(practice.players.get('local')!,p);input.clear();player.updateView();
    result.textContent=occupied?'Occupied target line · aim at blue coat and set trap':'Wall test line · aim west toward wall and set trap';
}
function reset(){
    practice.reset();held.release();laser.clear();laser.apply([]);trapField.clear();gun.clearProjectiles();impacts.clear();feel.reset();balls.count=0;
    for(const wire of wireTargets){const entry=[...practice.simulation.targets].find(([,t])=>t.kind==='rat'&&t.player?.id===wire.id);if(entry)wire.body=entry[0];}
    shotTimes.length=0;
    diagnostics.shots=diagnostics.hits=diagnostics.kills=diagnostics.jumps=0;diagnostics.maxY=0;diagnostics.events.length=0;
    for(const [id,entity] of targets){const p=practice.players.get(id)!;entity.respawn(p);entity.mesh.rotation.y=PRACTICE_TARGETS.find(t=>t.id===id)!.yaw;}
    hitUntil=0;crosshair.classList.remove('hit-confirmed','kill-confirmed','headshot');result.textContent='Targets refilled. Counters cleared.';
}
returnToLine();
window.addEventListener('mousemove',event=>{
    if(document.pointerLockElement!==canvas)return;
    if(aimProbe)note({kind:"mouse",dx:event.movementX,dy:event.movementY});
    player.onMouseMove(event.movementX,event.movementY);
    theta-=event.movementX*.002;phi=Math.max(.1,Math.min(Math.PI-.1,phi-event.movementY*.002));
},options);
window.addEventListener('keydown',event=>{
    if(document.pointerLockElement!==canvas||event.repeat)return;
    if(event.code==='Digit1')reset();
    if(event.code==='Digit2')visitRack(0);
    if(event.code==='Digit3')visitRack(1);
    if(event.code==='Digit4')visitRack(2);
    if(event.code==='Digit5')trapTestLine(false);
    if(event.code==='Digit6')trapTestLine(true);
    if(event.code==='KeyH')toggleHitboxes();
    if(event.code==='KeyR')reset();
    if(event.code==='KeyT')returnToLine();
    if(event.code==='KeyM')practice.moving=!practice.moving;
    if(event.code==='Space'){event.preventDefault();diagnostics.jumps++;note({kind:'jump-input'});}
},options);
const shotTimes:number[]=[];
function fire(){
    if(document.pointerLockElement!==canvas)return;
    const weapon=practice.simulation.weapon('local');
    const now=performance.now();while(shotTimes.length&&now-shotTimes[0]>=SHOOT_RATE.windowMs)shotTimes.shift();
    if(weapon!=='tommy-gun'&&weapon!=='mousetrap'&&shotTimes.length>=SHOOT_RATE.limit)return;
    if(weapon!=='mousetrap')shotTimes.push(now);
    player.updateView();
    // Aim from the current input pose composed with the SAME existing visual
    // camera offset as this frame. Do not use last frame's camera (stale mouse /
    // movement), and do not let this shot's new impulse steer its own launch.
    let aimBefore:unknown;
    let composed:ReturnType<typeof aimSample>|undefined;
    if(aimProbe){
        feel.beforeRender(stage.camera);
        try{composed=aimSample(stage.camera);}
        finally{feel.afterRender(stage.camera);}
    }
    let shot:ReturnType<CheeseGun['shoot']>;
    feel.beforeRender(stage.camera);
    try{
        if(aimProbe)aimBefore={firing:aimSample(stage.camera),composed,lastDraw};
        stage.camera.getWorldDirection(direction);
        shot=gun.shoot(player.entity,point.copy(stage.camera.position).addScaledVector(direction,200),weapon);
    }finally{feel.afterRender(stage.camera);}
    if(shot&&practice.shoot(shot)){feel.shot(weapon);
        if(candidate&&weapon!=='mousetrap')feel.heavyWeaponLaunch(point.set(shot.origin.x,shot.origin.y,shot.origin.z),direction.set(shot.direction.x,shot.direction.y,shot.direction.z),weapon);
        diagnostics.shots=practice.shots;note({kind:'shot',weapon,shot,...(aimProbe?{aim:aimBefore}: {})});}
}
window.addEventListener('mousedown',event=>{if(document.pointerLockElement!==canvas||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();fire();held.press(performance.now(),practice.simulation.weapon('local')==='tommy-gun'?WEAPON_TUNING.tommyIntervalMs:undefined);},{...options,capture:true});
window.addEventListener('mouseup',()=>held.release(),options);
window.addEventListener('blur',()=>held.release(),options);
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)held.release();},options);
function resize(){stage.renderer.setSize(innerWidth,innerHeight);stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();}
window.addEventListener('resize',resize,options);resize();
let last=performance.now(),acc=0,ready=false;
stage.renderer.setAnimationLoop(now=>{
    held.tick(now,practice.simulation.weapon('local')==='tommy-gun'?WEAPON_TUNING.tommyIntervalMs:undefined,fire);
    const dt=Math.max(0,Math.min((now-last)/1000,.05));last=now;acc+=dt;
    while(acc>=1/60){
        player.prepareMovement(1/60,document.pointerLockElement===canvas?input.keys:{});
        stage.world.step(1/60);player.syncAfterPhysics(1/60);gun.update(1/60);
        const p=player.entity.body.position,q=player.entity.mesh.quaternion;
        Object.assign(practice.players.get('local')!,{x:p.x,y:p.y,z:p.z,meshQx:q.x,meshQy:q.y,meshQz:q.z,meshQw:q.w});
        practice.step(1/60,Date.now());diagnostics.steps++;acc-=1/60;
    }
    for(const [id,entity] of targets){const p=practice.players.get(id)!;entity.body.position.set(p.x,p.y,p.z);entity.mesh.position.set(p.x,p.y,p.z);entity.presentAlive(dt);}
    for(const wire of wireTargets){const p=wire.body.pointToWorldFrame(wire.offset);wire.mesh.position.set(p.x,p.y,p.z);}
    diagnostics.maxY=Math.max(diagnostics.maxY,player.entity.body.position.y);
    const state=practice.simulation.snapshot();
    const weapon=practice.simulation.weapon('local');player.entity.setWeapon(weapon);
    laser.apply(state.beams);laser.update(dt,stage.camera);trapField.apply(state.traps,true);trapField.update(dt);
    for(const site of state.pickups??[]){const visual=supplies.get(site.id);if(visual){visual.setAvailableAt(site.availableAt??0);visual.update(Date.now(),stage.camera);}}
    for(const event of practice.simulation.drainPickupEvents()){
        note({kind:'authority-pickup',event});
        if(event.kind==='collected'&&event.playerId==='local'){if(candidate)feel.heavyArsenal('pickup');else feedback.play('pickup-slap');result.textContent=`${event.pickup} picked up · T returns to firing line`;}
        if(event.kind==='trap'&&event.what==='set'){if(candidate)feel.heavyArsenal('mousetrap');else feedback.play('trap-set',event.p);result.textContent='TRAP SET · pistol restored';}
    }
    for(const event of practice.simulation.drainShotEvents())note({kind:'authority-shot',event});
    balls.count=state.shots.length;
    state.shots.forEach((shot,index)=>{
        ballPose.position.set(shot.p.x,shot.p.y,shot.p.z);ballPose.rotation.set(shot.age*7,shot.age*11,0);
        ballPose.updateMatrix();balls.setMatrixAt(index,ballPose.matrix);
    });
    balls.instanceMatrix.needsUpdate=true;
    for(const impact of state.impacts){
        if(impact.foley)continue;
        impacts.emit(point.set(impact.p.x,impact.p.y,impact.p.z),normal.set(impact.n.x,impact.n.y,impact.n.z),impact.surface);
    }
    if(aimProbe)for(const impact of state.impacts)note({kind:'world-impact',impact});
    impacts.update(dt);
    if(player.entity.body.position.y< -20)returnToLine();
    player.updateView();
    stage.flashlight.position.copy(player.entity.mesh.position).add(point.set(0,2,0));
    stage.camera.getWorldDirection(direction);stage.flashlight.target.position.copy(stage.flashlight.position).addScaledVector(direction,15);
    neighborhood.update(dt,stage.camera,player.entity.body.position);feel.update(dt,stage.camera,player.entity.mesh.position);
    totals.textContent=`${weapon??'pistol'} · ${practice.shots} shots · ${practice.hits} hits · ${practice.headshots} head · ${practice.kills} kills`;
    if(now>=hitUntil)crosshair.classList.remove('hit-confirmed','kill-confirmed','headshot');
    feel.beforeRender(stage.camera);for(const target of targets.values())target.applyHeavyRender();
    try{if(aimProbe){
        renderedCamera.copy(stage.camera);
        const cr=crosshair.getBoundingClientRect(),vr=canvas.getBoundingClientRect();
        lastDraw={at:performance.now(),steps:diagnostics.steps,ray:aimSample(stage.camera),crosshair:[cr.x+cr.width/2,cr.y+cr.height/2],viewport:[vr.x,vr.y,vr.width,vr.height]};
    }stage.renderer.render(stage.scene,stage.camera);}finally{for(const target of targets.values())target.restoreHeavyRender();feel.afterRender(stage.camera);}
    if(!ready){ready=true;play.disabled=overlay.disabled=false;play.textContent='Enter target practice';}
});
window.addEventListener('pagehide',()=>{
    stage.renderer.setAnimationLoop(null);abort.abort();pointerMenu.dispose();input.dispose();
    held.release();feedback.dispose();laser.dispose();trapField.dispose();for(const visual of supplies.values())visual.dispose();feel.dispose();foley.dispose();impacts.dispose();gun.dispose();for(const entity of targets.values())entity.dispose();
    player.dispose();neighborhood.dispose();balls.dispose();ballGeometry.dispose();ballMaterial.dispose();
    wireGeometry.dispose();bodyMaterial.dispose();headMaterial.dispose();disposeEntitySounds();stage.dispose();
},{once:true});
