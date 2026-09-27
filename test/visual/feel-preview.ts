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
import {FEEL} from '../../src/feel/feelTuning';
import {feelState} from '../../src/feel/feelState';
import {PickupVisual} from '../../src/prototype/PickupVisual';
import {kickDust} from '../../src/feel/Dust';
import {cityImpact} from '../../src/feel/CityReactions';
import {FeelAudio} from '../../src/feel/FeelAudio';
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
feel.attach(stage.renderer.domElement,stage.listener);feel.attachScene(stage.scene);feel.attachCity(stage.scene,city.streetLamps);
const status=document.getElementById('feel-status')!;
// A Quick Fix kit around the corner (behind the right-hand buildings) for the last-hit-point x-ray.
const kit=new PickupVisual(stage.scene,'quick-fix');kit.setPosition(-14,.5,6);
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
    'Last hit point (1 HP)':()=>{feel.health(1);kit.setXray(true);},
    'Quick Fix heal':()=>{feel.health(3,true);kit.setXray(false);},
    'Kill suspect 2 (hat pop-off)':()=>{const v=suspects[1]!;v.hp=1;v.takeDamage(1,new THREE.Vector3(30,0,6));},
    'Deaths: spin / fling / flop':()=>{(['spin','fling','flop'] as const).forEach((style,i)=>{const v=suspects[i]!;if(v.dead)return;v.hp=1;v.setDeathStyle(style);v.takeDamage(1,new THREE.Vector3(style==='flop'?2:14,style==='fling'?18:0,0));});},
    'Respawn suspects':()=>{for(const v of suspects)if(v.dead)v.respawn({x:v.body.position.x,y:.5,z:v.body.position.z,hp:3});},
    'Your death (camera + iris)':()=>{rat.entity.hp=1;rat.entity.takeDamage(1,new THREE.Vector3(0,6,-14));feel.died(()=>rat.entity.mesh.position);},
    'Respawn you':()=>{rat.entity.respawn({x:-32,y:.5,z:-18,hp:3});feel.reset();},
    'Hard landing (dip + dust)':()=>{feel.motion(1/60,false,-30,0,1);feel.motion(1/60,true,0,0,1);kickDust(rat.entity.mesh.position,.9);},
    'Launch view (hold 1.5 s)':()=>{feel.motion(1/60,false,60,0,1);setTimeout(()=>feel.motion(1/60,true,0,0,1),1500);},
    'Hot Pursuit streaks (2 s)':()=>{const t=setInterval(()=>feel.motion(1/60,true,0,16,1.45),16);setTimeout(()=>{clearInterval(t);feel.motion(1/60,true,0,0,1);},2000);},
    'City: blast near the rat (props react)':()=>{const p=rat.entity.mesh.position;for(const lamp of city.streetLamps){if(Math.hypot(lamp[0]-p.x,lamp[1]-p.z)<30)cityImpact({x:lamp[0]+2,y:.5,z:lamp[1]+2},4);}},
    'Callout: ON THE CASE':()=>feel.sting('case'),
    'Victory slow-motion (1.4 s)':()=>{feel.victory();},
    'Noir strength 0.35':()=>{FEEL.noir.params.strength=.35;},
    'Noir strength 0.65 (Bold)':()=>{FEEL.noir.params.strength=.65;},
    'Noir strength 1.0':()=>{FEEL.noir.params.strength=1;},
    'Lightning strike':()=>feel.lightning(),
    'Look up (sky)':()=>rat.onMouseMove(0,-420),
    'Go outside Records Hall (neon)':()=>{rat.entity.body.position.set(-6,.5,-24);rat.entity.body.velocity.set(0,0,0);rat.onMouseMove(-785.4,0);rat.onMouseMove(0,-330);},
    'Go inside Records Hall (blinds)':()=>{rat.entity.body.position.set(-12,.5,-52);rat.entity.body.velocity.set(0,0,0);rat.onMouseMove(-785.4,0);rat.onMouseMove(1570.8,0);rat.onMouseMove(0,120);},
    'Look ahead':()=>rat.onMouseMove(0,420),
    'Enemy look: lab all on':()=>{for(const item of ['enemyEyeshine','enemySaturation','enemyInk','breathPuffs'] as const)feelState().set(item,true);},
    'Enemy look: lab all off':()=>{for(const item of ['enemyEyeshine','enemySaturation','enemyInk','breathPuffs'] as const)feelState().set(item,false);},
    'Reset feel':()=>feel.reset(),
};
const buttons=document.getElementById('feel-buttons')!;
for(const [label,run] of Object.entries(actions)){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.addEventListener('click',()=>{run();status.textContent=label;});buttons.appendChild(button);
}
/** Render every polish-17 cue offline into one WAV (base64) for listening review. */
async function renderCues():Promise<string> {
    const rate=24000,gap=.35;
    const cues:[string,number,(a:FeelAudio)=>void][]=[
        ['step pavement',.3,a=>a.step('a','pavement',.5,0)],['step water',.35,a=>a.step('b','water',.5,0)],
        ['step metal',.35,a=>a.step('c','metal',.5,0)],['step wood',.3,a=>a.step('d','wood',.5,0)],
        ['rustle',.4,a=>a.rustle(.5)],['jostle',.25,a=>a.jostle(.5)],['squelch',.3,a=>a.squelch(.5,0)],
        ['whizz',.35,a=>a.whizz(.5,0)],['brass',.7,a=>a.brass(.5)],['sting case',.6,a=>a.sting('case',.5)],
        ['sting delivery',1,a=>a.sting('delivery',.5)],['sting closing',1.3,a=>a.sting('closing',.5)]];
    const parts:Float32Array[]=[];
    for(const [,length,play] of cues){
        const context=new OfflineAudioContext(1,Math.ceil(rate*length),rate);
        play(new FeelAudio(context as unknown as AudioContext));
        parts.push((await context.startRendering()).getChannelData(0),new Float32Array(Math.ceil(rate*gap)));
    }
    const total=parts.reduce((n,p)=>n+p.length,0),pcm=new Int16Array(total);let offset=0;
    for(const part of parts){for(let i=0;i<part.length;i++)pcm[offset+i]=Math.max(-1,Math.min(1,part[i]!))*32767;offset+=part.length;}
    const header=new DataView(new ArrayBuffer(44)),write=(o:number,t:string)=>{for(let i=0;i<t.length;i++)header.setUint8(o+i,t.charCodeAt(i));};
    write(0,'RIFF');header.setUint32(4,36+pcm.byteLength,true);write(8,'WAVEfmt ');header.setUint32(16,16,true);header.setUint16(20,1,true);header.setUint16(22,1,true);
    header.setUint32(24,rate,true);header.setUint32(28,rate*2,true);header.setUint16(32,2,true);header.setUint16(34,16,true);write(36,'data');header.setUint32(40,pcm.byteLength,true);
    const bytes=new Uint8Array(44+pcm.byteLength);bytes.set(new Uint8Array(header.buffer),0);bytes.set(new Uint8Array(pcm.buffer),44);
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
}
Object.assign(window,{renderCues,feelActions:actions,probeWalls:()=>Array.from({length:24},(_,i)=>i*15).map(d=>{const dir=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),d*Math.PI/180);ray.set(rat.entity.mesh.position.clone().setY(1.6),dir);const hit=ray.intersectObjects(blockers,true)[0];return `${d}:${hit?hit.distance.toFixed(1):'-'}`;}).join(' ')});
let previous=0;
function frame(now:number){
    const dt=previous?Math.min(.05,(now-previous)/1000):1/60;previous=now;
    stage.syncViewport();
    stage.world.step(1/60,dt,3);
    rat.update(dt,{});gun.update(dt);impacts.update(dt);
    for(const suspect of suspects)suspect.update(dt);
    kit.update(performance.now(),stage.camera);
    feel.footsteps(dt,suspects.map((s,i)=>({id:`suspect-${i}`,position:s.mesh.position,facing:s.mesh.quaternion})),rat.entity.mesh.position,stage.camera);
    city.update(dt,stage.camera,rat.entity.body.position);
    feel.update(dt,stage.camera,rat.entity.mesh.position);feel.beforeRender(stage.camera);
    stage.renderer.render(stage.scene,stage.camera);
    feel.afterRender(stage.camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
