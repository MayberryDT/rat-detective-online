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
import {initEntitySounds,disposeEntitySounds,playEntitySound} from '../../src/audio/EntityAudio';
import {CITY_BOUNDS} from '../../src/shared/grayboxLayout';
import {CHAOS_TUNING} from '../../src/shared/chaosState';
import {HitboxPractice,PRACTICE_APPEARANCE,PRACTICE_START,PRACTICE_TARGETS,PRACTICE_WORLD} from './HitboxPractice';

const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
initEntitySounds(stage.listener);
const neighborhood=new Neighborhood(stage.scene,stage.world,PRACTICE_WORLD);
const player=new RatController(stage.scene,stage.world,stage.camera,'You',PRACTICE_APPEARANCE,
    new THREE.Vector3(PRACTICE_START.x,PRACTICE_START.y,PRACTICE_START.z),CITY_BOUNDS);
player.entity.isPlayer=true;player.entity.billboard.sprite.visible=false;
const gun=new CheeseGun(stage.scene,stage.world,stage.listener);
gun.setPlayer(stage.camera,player.entity);gun.authoritative=true;
const targets=new Map<string,RatEntity>();
const result=document.getElementById('result')!;
const totals=document.getElementById('totals')!;
const crosshair=document.getElementById('crosshair')!;
let hitUntil=0;
const practice=new HitboxPractice(hit=>{
    const entity=targets.get(hit.target)!;
    entity.hp=practice.players.get(hit.target)!.hp;entity.billboard.setHealth(entity.hp);
    result.textContent=`${entity.name} · ${hit.region} · ${hit.damage} damage · ${hit.killed?'KILL / REFILLED':`${hit.remaining} HP left`}`;
    hitUntil=performance.now()+180;
    crosshair.classList.remove('hit-confirmed');void crosshair.offsetWidth;crosshair.classList.add('hit-confirmed');
    playEntitySound(hit.killed?'ratDeath':'ratHit',.5,entity.body.position);
});
for(const target of PRACTICE_TARGETS){
    const data=practice.players.get(target.id)!;
    const entity=new RatEntity(stage.scene,stage.world,new THREE.Vector3(data.x,data.y,data.z),data.name,data,true);
    entity.mesh.rotation.y=target.yaw;entity.syncGlowTransform();
    entity.billboard.sprite.position.set(data.x,data.y+2.65,data.z);
    // Kinematic bodies cannot be pushed. Deliberately never tick their animator:
    // idle breathing, flinches and ragdolls would move the silhouette under aim.
    targets.set(target.id,entity);
}

// Debug wires are built from authoritative bodies, not copied model dimensions.
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
        hitboxes.add(mesh);
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
    lock:()=>{void canvas.requestPointerLock();void stage.listener.context.resume();}});
function toggleHitboxes(){
    hitboxes.visible=!hitboxes.visible;
    overlay.textContent=hitboxes.visible?'Hide hitboxes':'Show hitboxes';
    overlayStatus.textContent=hitboxes.visible?'Gold: head · Cyan: body · H to hide':'Hitboxes hidden · H to show';
}
overlay.addEventListener('click',toggleHitboxes,options);
let theta=Math.PI,phi=Math.PI*.4;
function returnToLine(){
    player.entity.respawn({...PRACTICE_START,hp:3});player.entity.billboard.sprite.visible=false;player.resetGrounding();
    Object.assign(practice.players.get('local')!,PRACTICE_START);
    const aimTheta=-1.25,aimPhi=1.65;
    player.onMouseMove((theta-aimTheta)/.002,(phi-aimPhi)/.002);theta=aimTheta;phi=aimPhi;
    input.clear();player.updateView();
}
function reset(){
    practice.reset();gun.clearProjectiles();impacts.clear();balls.count=0;
    for(const entity of targets.values()){entity.hp=3;entity.billboard.setHealth(3);}
    hitUntil=0;crosshair.classList.remove('hit-confirmed');result.textContent='Targets refilled. Counters cleared.';
}
returnToLine();
window.addEventListener('mousemove',event=>{
    if(document.pointerLockElement!==canvas)return;
    player.onMouseMove(event.movementX,event.movementY);
    theta-=event.movementX*.002;phi=Math.max(.1,Math.min(Math.PI-.1,phi-event.movementY*.002));
},options);
window.addEventListener('keydown',event=>{
    if(document.pointerLockElement!==canvas||event.repeat)return;
    if(event.code==='KeyH')toggleHitboxes();
    if(event.code==='KeyR')reset();
    if(event.code==='KeyT')returnToLine();
    if(event.code==='Space')event.preventDefault();
},options);
window.addEventListener('mousedown',event=>{
    if(document.pointerLockElement!==canvas)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.button!==0)return;
    player.updateView();
    stage.camera.getWorldDirection(direction);
    const shot=gun.shoot(player.entity,point.copy(stage.camera.position).addScaledVector(direction,200));
    if(shot)practice.shoot(shot);
},{...options,capture:true});
function resize(){stage.renderer.setSize(innerWidth,innerHeight);stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();}
window.addEventListener('resize',resize,options);resize();
let last=performance.now(),acc=0,ready=false;
stage.renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,.05);last=now;acc+=dt;
    while(acc>=1/60){
        player.prepareMovement(1/60,document.pointerLockElement===canvas?input.keys:{});
        stage.world.step(1/60);player.syncAfterPhysics(1/60);gun.update(1/60);
        const p=player.entity.body.position,q=player.entity.mesh.quaternion;
        Object.assign(practice.players.get('local')!,{x:p.x,y:p.y,z:p.z,meshQx:q.x,meshQy:q.y,meshQz:q.z,meshQw:q.w});
        practice.step(1/60,Date.now());acc-=1/60;
    }
    const state=practice.simulation.snapshot();
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
    impacts.update(dt);
    if(player.entity.body.position.y< -20)returnToLine();
    player.updateView();
    stage.flashlight.position.copy(player.entity.mesh.position).add(point.set(0,2,0));
    stage.camera.getWorldDirection(direction);stage.flashlight.target.position.copy(stage.flashlight.position).addScaledVector(direction,15);
    neighborhood.update(dt,stage.camera,player.entity.body.position);
    totals.textContent=`${practice.shots} shots · ${practice.hits} hits · ${practice.headshots} head · ${practice.kills} kills`;
    if(now>=hitUntil)crosshair.classList.remove('hit-confirmed');
    stage.renderer.render(stage.scene,stage.camera);
    if(!ready){ready=true;play.disabled=overlay.disabled=false;play.textContent='Enter target practice';}
});
window.addEventListener('pagehide',()=>{
    stage.renderer.setAnimationLoop(null);abort.abort();pointerMenu.dispose();input.dispose();
    impacts.dispose();gun.dispose();for(const entity of targets.values())entity.dispose();
    player.dispose();neighborhood.dispose();balls.dispose();ballGeometry.dispose();ballMaterial.dispose();
    wireGeometry.dispose();bodyMaterial.dispose();headMaterial.dispose();disposeEntitySounds();stage.dispose();
},{once:true});
