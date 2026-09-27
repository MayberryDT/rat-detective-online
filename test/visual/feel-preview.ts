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
import {initEntitySounds} from '../../src/audio/EntityAudio';
import {FeelDirector} from '../../src/feel/FeelDirector';
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
const actions:Record<string,()=>void>={
    'Shot':fire,
    'Rapid fire ×6':()=>{for(let i=0;i<6;i++)setTimeout(fire,i*110);},
    'Scattershot shot':()=>{feel.setIncident('scattershot');fire();feel.setIncident();},
    'Hit from left suspect':()=>hurt(0,1),
    'Hit from right suspect':()=>hurt(2,1),
    'Heavy hit (3 damage)':()=>hurt(1,3),
    'Reset feel':()=>feel.reset(),
};
const buttons=document.getElementById('feel-buttons')!;
for(const [label,run] of Object.entries(actions)){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.addEventListener('click',()=>{run();status.textContent=label;});buttons.appendChild(button);
}
Object.assign(window,{feelActions:actions});
let previous=0;
function frame(now:number){
    const dt=previous?Math.min(.05,(now-previous)/1000):1/60;previous=now;
    stage.syncViewport();
    stage.world.step(1/60,dt,3);
    rat.update(dt,{});gun.update(dt);
    for(const suspect of suspects)suspect.update(dt);
    city.update(dt,stage.camera,rat.entity.body.position);
    feel.update(dt);feel.beforeRender(stage.camera);
    stage.renderer.render(stage.scene,stage.camera);
    feel.afterRender(stage.camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
