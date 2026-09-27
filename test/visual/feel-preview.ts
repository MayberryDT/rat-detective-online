/** Feel workshop: the real city, a local rat on the shoulder camera and three
 * suspects, with buttons that fire each polish effect through the same
 * FeelDirector the game uses. Static review only: no network, bots or input. */
import * as THREE from 'three';
import '../../src/ui/crosshair.css';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {RatController} from '../../src/player/RatController';
import {RatEntity} from '../../src/entities/RatEntity';
import {CheeseGun} from '../../src/weapons/CheeseGun';
import {CheeseImpactEffects} from '../../src/weapons/CheeseImpactEffects';
import {initEntitySounds} from '../../src/audio/EntityAudio';
import {FeelDirector} from '../../src/feel/FeelDirector';
import {kickDust} from '../../src/feel/Dust';
import {createPlayer} from '../../src/worker/gameState';

const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
initEntitySounds(stage.listener);
const city=new Neighborhood(stage.scene,stage.world,{seed:341283204,version:2});city.generate();
const appearance={hatType:'fedora' as const,hatColor:0x386caa,coatColor:0x885b89,furColor:0xe8b84d,highlightColor:0xe9dfc9};
const rat=new RatController(stage.scene,stage.world,stage.camera,'You',appearance,new THREE.Vector3(-32,.5,-18));
rat.entity.isPlayer=true;rat.entity.billboard.sprite.visible=false;
rat.onMouseMove(750*Math.PI,20);
const gun=new CheeseGun(stage.scene,stage.world,stage.listener);gun.setPlayer(stage.camera,rat.entity);
const suspects=[-3,0,3].map((dz,i)=>{
    const data=createPlayer(`suspect-${i}`,`Suspect ${i+1}`,{hatType:'fedora',hatColor:[0x43825e,0xc5a044,0x7c899c][i],coatColor:[0xcd873f,0x398d92,0x97765f][i],furColor:0xb79d83,highlightColor:0xcbb596},{x:-22,y:.5,z:-18+dz*1.4});
    const entity=new RatEntity(stage.scene,stage.world,new THREE.Vector3(data.x,data.y,data.z),data.name,data,true);
    entity.mesh.rotation.y=-Math.PI/2;entity.syncGlowTransform();
    return entity;
});
const feel=new FeelDirector();
feel.attach(stage.renderer.domElement,stage.listener);feel.attachScene(stage.scene);
const status=document.getElementById('feel-status')!;
const aim=new THREE.Vector3();
function fire():void {
    rat.updateView();stage.camera.getWorldDirection(aim);
    const target=stage.camera.position.clone().addScaledVector(aim,200);
    if(gun.shoot(rat.entity,target))feel.shot();
}
/** Nonlethal hit on the local rat from a suspect, as GameSession applies it. */
function hurt(from:number,damage:number):void {
    const attacker=suspects[from]!,direction=rat.entity.mesh.position.clone().sub(attacker.mesh.position).setY(0);
    rat.entity.hp=3;rat.entity.billboard.setHealth(3);
    feel.hurt(damage,rat.entity.mesh.position,attacker.mesh.position,stage.camera);
    rat.entity.takeDamage(Math.min(2,damage),direction);
}
const impacts=new CheeseImpactEffects(stage.scene);
const ray=new THREE.Raycaster(),blockers=stage.scene.children.filter(o=>o.userData.aimTarget===true);
/** Splat the nearest wall in a view direction `degrees` left (+) or right (-) of ahead. */
function splatWall(degrees:number,count:number):number {
    let hits=0;
    stage.camera.getWorldDirection(aim);aim.setY(0).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),degrees*Math.PI/180);
    for(let i=0;i<count;i++){
        const dir=aim.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(i-(count-1)/2)*.04);dir.y=(i%3)*.05;
        ray.set(rat.entity.mesh.position.clone().setY(1.6),dir.normalize());
        const hit=ray.intersectObjects(blockers,true)[0];
        if(hit?.face){const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);impacts.emit(hit.point,normal,true,1);hits++;}
    }
    return hits;
}
const actions:Record<string,()=>void>={
    'Splat left wall ×4':()=>{splatWall(40,4);},
    'Splat right wall ×4':()=>{splatWall(-40,4);},
    'Shot':fire,
    'Rapid fire ×6':()=>{for(let i=0;i<6;i++)setTimeout(fire,i*110);},
    'Scattershot shot':()=>{feel.setIncident('scattershot');fire();feel.setIncident();},
    'Hit from left suspect':()=>hurt(0,1),
    'Hit from right suspect':()=>hurt(2,1),
    'Heavy hit (3 damage)':()=>hurt(1,3),
    'Hit suspect 2 (freeze)':()=>{const victim=suspects[1]!;victim.hp=3;feel.impact(victim,false);victim.takeDamage(1,new THREE.Vector3(1,0,0));},
    'Stain suspects ×3':()=>{for(const [i,s] of suspects.entries())for(let k=0;k<3;k++){s.hp=3;s.takeDamage(1,new THREE.Vector3(1,0,(k-1)*.6+(i-1)*.3));}},
    'Ironclad reflection sparks':()=>{const p=suspects[1]!.mesh.position.clone().setY(1.3);impacts.spark(p,new THREE.Vector3(-1,.2,0));},
    'Kill (bloom + punch-in)':()=>{const c=document.getElementById('crosshair')!;c.classList.remove('kill-confirmed');void c.offsetWidth;c.classList.add('kill-confirmed');feel.killed(suspects[1]!.mesh.position,false,stage.camera);},
    'Double kill (comic word)':()=>{feel.killed(suspects[0]!.mesh.position,false,stage.camera);feel.killed(suspects[2]!.mesh.position,false,stage.camera);},
    'Air kill (comic word)':()=>{feel.reset();feel.killed(suspects[1]!.mesh.position,true,stage.camera,performance.now()+60_000);},
    'Wounded (2 HP)':()=>feel.health(2),
    'Last hit point (1 HP)':()=>feel.health(1),
    'Quick Fix heal':()=>feel.health(3,true),
    'Kill suspect 2 (hat pop-off)':()=>{const v=suspects[1]!;v.hp=1;v.takeDamage(1,new THREE.Vector3(30,0,6));},
    'Deaths: spin / fling / flop':()=>{(['spin','fling','flop'] as const).forEach((style,i)=>{const v=suspects[i]!;if(v.dead)return;v.hp=1;v.setDeathStyle(style);v.takeDamage(1,new THREE.Vector3(style==='flop'?2:14,style==='fling'?18:0,0));});},
    'Respawn suspects':()=>{for(const v of suspects)if(v.dead)v.respawn({x:v.body.position.x,y:.5,z:v.body.position.z,hp:3});},
    'Your death (camera + iris)':()=>{rat.entity.hp=1;rat.entity.takeDamage(1,new THREE.Vector3(0,6,-14));feel.died(()=>rat.entity.mesh.position);},
    'Respawn you':()=>{rat.entity.respawn({x:-32,y:.5,z:-18,hp:3});feel.reset();},
    'Hard landing (dip + dust)':()=>{feel.motion(false,-30,0,1);feel.motion(true,0,0,1);kickDust(rat.entity.mesh.position,.9);},
    'Launch view (hold 1.5 s)':()=>{feel.motion(false,60,0,1);setTimeout(()=>feel.motion(true,0,0,1),1500);},
    'Hot Pursuit streaks (2 s)':()=>{const t=setInterval(()=>feel.motion(true,0,16,1.45),16);setTimeout(()=>{clearInterval(t);feel.motion(true,0,0,1);},2000);},
    'Reset feel':()=>feel.reset(),
};
const buttons=document.getElementById('feel-buttons')!;
for(const [label,run] of Object.entries(actions)){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.addEventListener('click',()=>{run();status.textContent=label;});buttons.appendChild(button);
}
Object.assign(window,{feelActions:actions,probeWalls:()=>Array.from({length:24},(_,i)=>i*15).map(d=>{const dir=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),d*Math.PI/180);ray.set(rat.entity.mesh.position.clone().setY(1.6),dir);const hit=ray.intersectObjects(blockers,true)[0];return `${d}:${hit?hit.distance.toFixed(1):'-'}`;}).join(' ')});
let previous=0;
function frame(now:number){
    const dt=previous?Math.min(.05,(now-previous)/1000):1/60;previous=now;
    stage.syncViewport();
    stage.world.step(1/60,dt,3);
    rat.update(dt,{});gun.update(dt);impacts.update(dt);
    for(const suspect of suspects)suspect.update(dt);
    city.update(dt,stage.camera,rat.entity.body.position);
    feel.update(dt,stage.camera,rat.entity.mesh.position);feel.beforeRender(stage.camera);
    stage.renderer.render(stage.scene,stage.camera);
    feel.afterRender(stage.camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
