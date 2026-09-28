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
import {PoliceLineup} from '../../src/feel/PoliceLineup';
import {PickupVisual} from '../../src/prototype/PickupVisual';
import {kickDust} from '../../src/feel/Dust';
import {cityImpact} from '../../src/feel/CityReactions';
import {FeelAudio} from '../../src/feel/FeelAudio';
import {createPlayer} from '../../src/worker/gameState';
import {MAX_HP} from '../../src/shared/networkProtocol';
import {createRatMesh} from '../../src/utils/RatModel';
import {RatAnimator,type DeathStyle} from '../../src/utils/RatAnimator';
import {PressureMachine} from '../../src/prototype/PressureMachine';
import {LAUNCH_MACHINES,PRESSURE_TUNING,type PressureState} from '../../src/shared/chaosState';

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
    entity.mesh.rotation.y=-Math.PI/2;entity.syncGlowTransform();entity.enableRigidBatching();
    return entity;
});
const feel=new FeelDirector();
feel.attach(stage.renderer.domElement,stage.listener);feel.attachScene(stage.scene);feel.attachCity(stage.scene,city.streetLamps);
const status=document.getElementById('feel-status')!;
// Juice T5: the police lineup, with the three suspects, you and a stand-in.
const lineup=new PoliceLineup(stage.scene,document,()=>feel.flashbulb());
// A Quick Fix kit around the corner (behind the right-hand buildings) for the last-hit-point x-ray.
const kit=new PickupVisual(stage.scene,'quick-fix');kit.setPosition(-14,.5,6);
const coat=new PickupVisual(stage.scene,'ironclad'),shoes=new PickupVisual(stage.scene,'hustle');coat.setPosition(0,-50,0);shoes.setPosition(0,-50,0);
/** Line the three supplies up `ahead` units in front of the camera for inspection. */
function supplies(ahead:number):void {
    rat.updateView();stage.camera.getWorldDirection(aim);aim.setY(0).normalize();
    const side=new THREE.Vector3(-aim.z,0,aim.x),base=rat.entity.mesh.position.clone().addScaledVector(aim,ahead);
    [coat,shoes,kit].forEach((prop,i)=>{const p=base.clone().addScaledVector(side,(i-1)*3.2);prop.setPosition(p.x,.7,p.z);});
}
const aim=new THREE.Vector3();
const impacts=new CheeseImpactEffects(stage.scene);
const ray=new THREE.Raycaster(),blockers=stage.scene.children.filter(o=>o.userData.aimTarget===true);
// The Hunch: the workshop re-makes on every lost/regained read so each capture shows the moment.
FEEL.hunch.params.remake=0;FEEL.hunch.params.cardGap=0;
let wantedSuspect:string|undefined;
const hunchRats=new Map(suspects.map((entity,i)=>[`suspect-${i}`,{entity}]));
/** Put the suspects `beyond` units behind the first wall straight ahead of the camera. */
function behindWall(beyond:number):string {
    stage.camera.getWorldDirection(aim);aim.setY(0).normalize();
    ray.set(rat.entity.mesh.position.clone().setY(1.2),aim);
    const hit=ray.intersectObjects(blockers,true)[0];if(!hit)return 'no wall ahead';
    const side=new THREE.Vector3(-aim.z,0,aim.x);
    suspects.forEach((s,i)=>{const p=rat.entity.mesh.position.clone().addScaledVector(aim,hit.distance+beyond).addScaledVector(side,(i-1)*1.6);
        s.body.position.set(p.x,.5,p.z);s.mesh.position.set(p.x,.5,p.z);s.syncGlowTransform();});
    return `wall at ${hit.distance.toFixed(1)}`;
}
/** Turn the camera to world angle `degrees` (the probeWalls convention) and hide the suspects there. */
function faceWall(degrees:number,beyond:number):string {
    const want=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),degrees*Math.PI/180);
    const error=()=>{rat.updateView();stage.camera.getWorldDirection(aim);aim.setY(0).normalize();return Math.atan2(aim.x*want.z-aim.z*want.x,aim.dot(want));};
    for(let i=0;i<6;i++){const e=error();if(Math.abs(e)<.01)break;rat.onMouseMove(e/.002,0);if(Math.abs(error())>Math.abs(e))rat.onMouseMove(-2*e/.002,0);}
    return behindWall(beyond);
}
/** Drop a read for a moment and regain it, so the made moment plays. */
function blink(who:'you'|'them'):void {
    const set=(hp:number)=>{if(who==='you'){rat.entity.hp=hp;rat.entity.billboard.setHealth(hp);}else for(const s of suspects)s.hp=hp;};
    set(MAX_HP-1);setTimeout(()=>set(MAX_HP),150);
}
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
    'Headshot suspect 2 (T4)':()=>{const v=suspects[1]!;const c=document.getElementById('crosshair')!;c.classList.remove('kill-confirmed','headshot');void c.offsetWidth;c.classList.add('kill-confirmed','headshot');
        const head=v.mesh.getObjectByName('rat-head')!.getWorldPosition(new THREE.Vector3());feel.killed(v.mesh.position,false,stage.camera,performance.now(),false,true);feel.headshot(head,stage.camera,true);
        v.markHeadshot();v.hp=1;v.takeDamage(1,new THREE.Vector3(30,0,6));},
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
    'Police lineup (T5)':()=>lineup.start([
        {id:'you',name:'You',appearance,winner:true,award:{id:'headhunter',title:'HEADHUNTER',playerId:'you',playerName:'You',value:4}},
        ...suspects.map((s,i)=>({id:`suspect-${i}`,name:s.name,appearance:s.appearance,winner:false,
            award:[{id:'sharpshooter' as const,title:'SHARPSHOOTER',playerId:'',playerName:'',value:41},{id:'legwork' as const,title:'LEGWORK',playerId:'',playerName:'',value:812},undefined][i]})),
        {id:'extra',name:'Mugsy Malone',appearance:{...appearance,hatType:'porkpie',coatColor:0x4f5a3d},winner:false,award:{id:'frequent-flier',title:'FREQUENT FLIER',playerId:'extra',playerName:'',value:3}},
    ]),
    'End lineup':()=>lineup.end(),
    'Reset feel':()=>feel.reset(),
    'Hunch: suspects 3 behind the wall ahead':()=>{status.textContent=behindWall(3);},
    'Hunch: suspects 12 behind the wall ahead':()=>{status.textContent=behindWall(12);},
    'Hunch: suspects back in the open':()=>suspects.forEach((s,i)=>{s.body.position.set(-22,.5,-18+(i-1)*4.2);s.mesh.position.set(-22,.5,-18+(i-1)*4.2);s.syncGlowTransform();}),
    'Hunch: you make them (photo)':()=>blink('you'),
    'Hunch: they make you (card)':()=>blink('them'),
    'Hunch: Clean Bill supercharge':()=>feel.setIncident('clean-bill'),
    'Supplies: three props 7 ahead':()=>supplies(7),
    'Supplies: three props 22 ahead':()=>supplies(22),
    'Supplies: restocking':()=>{for(const prop of [coat,shoes,kit])prop.setAvailableAt(performance.now()+20_000);},
    'Blackout on':()=>feel.setIncident('blackout'),
    'Blackout off':()=>feel.setIncident(),
    'Blackout: suspect fires':()=>{const s=suspects[1]!.mesh.position;feel.fired(`bo-${Math.random()}`,{x:s.x,y:s.y+1.2,z:s.z},{x:-1,y:0,z:0},false,stage.camera);},
    'Most Wanted: suspect 2':()=>{wantedSuspect='suspect-1';},
    'Most Wanted: nobody':()=>{wantedSuspect=undefined;},
    'Malpractice: kit fidgets and hops':()=>{kit.setNervous(true);const p=kit.root.position;kit.setPosition(p.x+4,p.y+.7,p.z+1.5);},
    'Show your nameplate':()=>{rat.entity.billboard.sprite.visible=true;},
    'Hunch: turn around':()=>rat.onMouseMove(1570.8,0),
    'L5 Dumpster fires 12 ahead':()=>{const p=ahead(12);feel.launcherFired('dumpster',{x:p.x,y:0,z:p.z,radius:5},false,stage.camera);},
    'L5 Rat trap fires 12 ahead':()=>{const p=ahead(12);feel.launcherFired('mousetrap',{x:p.x,y:0,z:p.z,radius:5},false,stage.camera);},
    'L5 Wind tunnel fires 12 ahead':()=>{const p=ahead(12);feel.launcherFired('fan',{x:p.x,y:0,z:p.z,radius:5},false,stage.camera);},
    'L5 Overpressure misfire 12 ahead':()=>{const p=ahead(12);feel.launcherFired('pressure',{x:p.x,y:0,z:p.z,radius:5},true,stage.camera);},
    'L5 Hats blown off suspects':()=>{for(const s of suspects)s.blowHat(1.2);},
    'L5 Your launch (kick, scream, view)':()=>{feel.launched(rat.entity.mesh.position,true,false,stage.camera);const t=setInterval(()=>feel.motion(1/60,false,50,8,1),16);setTimeout(()=>{clearInterval(t);feel.motion(1/60,true,0,0,1);},1500);},
    'L6 Suspects launched (flail, contrails)':()=>{for(const s of suspects){s.body.velocity.set(4,38,0);s.body.wakeUp();s.playReaction('launch');feel.launched(s.mesh.position,false,false,stage.camera);}},
    'R Corpse 4 ahead: fling, splay, dead face':()=>studioCorpse('fling',false),
    'R Corpse 4 ahead: headshot':()=>studioCorpse('spin',true),
    'R Corpse 4 ahead: jolt':()=>corpse?.animator.joltDeath(1),
    'M1 Suspects gasp':()=>{for(const s of suspects)s.startle();},
    'P Street launchers ahead':()=>{const at=performance.now()+1000;pressure.vents=[0,1,2].map(i=>{const p=ahead(6+i*4);return {id:`vent-${at}-${i}`,x:p.x+(i-1)*3,y:0,z:p.z,at};});},
    'P Surge look on':()=>{surging=true;feel.setIncident('pressure-surge');},
    'P Surge look off':()=>{surging=false;feel.setIncident();},
    'P Shoot the trigger':()=>{const t=LAUNCH_MACHINES.find(m=>m.id===viewing)!.target;machines.triggerHit({x:t.x+1.9,y:t.y,z:t.z},false,stage.camera);},
    'P Machines empty':()=>setPressure(0),
    'P Machines 30% (building)':()=>setPressure(.3),
    'P Machines 60% (straining)':()=>setPressure(.6),
    'P Machines 88% (danger)':()=>setPressure(.88),
    'P Machines full (hang)':()=>{setPressure(1);pressure.blowing=Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,performance.now()+60_000]));},
    'P Machines fire':()=>firePressure(false),
    'P Machines fire (overpressure)':()=>firePressure(true),
    ...Object.fromEntries(LAUNCH_MACHINES.map(m=>[`P View ${m.label}`,()=>viewMachine(m.id)])),
    'R Walk up to suspect 2 body':()=>{const body=suspects[1]!.mesh.position;stage.camera.getWorldDirection(aim);aim.setY(0).normalize();
        rat.entity.body.position.set(body.x-aim.x*3.4,Math.max(.5,body.y),body.z-aim.z*3.4);rat.entity.body.velocity.set(0,0,0);rat.onMouseMove(0,160);},
    'R Gentle death suspect 2':()=>{const v=suspects[1]!;if(v.dead)v.respawn({x:v.body.position.x,y:.5,z:v.body.position.z,hp:3});v.hp=1;v.takeDamage(1,new THREE.Vector3(.2,0,0));},
    'L7 Landing 8 ahead':()=>feel.landed(ahead(8),55,stage.camera),
    'L7 Case whistle then paperwork 8 ahead':()=>{const p=ahead(8);feel.cases([{p:{x:p.x,y:30,z:p.z},v:{x:0,y:-12,z:0},owner:null}],stage.camera);setTimeout(()=>feel.cases([{p:{x:p.x,y:.5,z:p.z},v:{x:0,y:0,z:0},owner:null}],stage.camera),900);},
};
/** A scripted corpse 4 ahead: it drops from 2.5 units, rolls onto its back, bounces and
 * rests, so the ragdoll limbs, splay and dead face read at close range. */
let corpse:{mesh:THREE.Group;animator:RatAnimator;age:number;at:THREE.Vector3}|undefined;
function studioCorpse(style:DeathStyle,headshot:boolean):void {
    if(corpse){corpse.mesh.removeFromParent();}
    const mesh=createRatMesh(appearance),animator=new RatAnimator(mesh);
    animator.setDeathStyle(style,headshot);stage.scene.add(mesh);
    const side=stage.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().cross(new THREE.Vector3(0,1,0));
    corpse={mesh,animator,age:0,at:ahead(6).addScaledVector(side,1.6)};
}
const lying=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,.6,0));
function poseStudioCorpse(dt:number):void {
    if(!corpse)return;
    const c=corpse,t=c.age+=dt,fall=Math.min(1,t/.55),bounce=t>.55&&t<.95?Math.sin((t-.55)/.4*Math.PI)*.45:0;
    c.mesh.position.set(c.at.x,.3+(1-fall*fall)*2.5+bounce,c.at.z);
    c.mesh.quaternion.slerpQuaternions(new THREE.Quaternion(),lying,Math.min(1,t/.6));
    const impact=t-dt<.55&&t>=.55?1:t-dt<.95&&t>=.95?.5:0;
    c.animator.poseDeath(t,dt,{x:t<.6?-5:0,y:0,z:t<.6?2:0},impact,t>1.1);
}
/** P2: the six launchers with a scripted pressure state the buttons set. */
const machines=new PressureMachine(stage.scene,stage.listener.context as AudioContext);
const pressure:PressureState={serial:0,levels:{},launches:[]};
let surging=false;
machines.onTriggerHit=(_machine,at,busy,level)=>feel.triggerHit(at,busy,level,stage.camera);
machines.onFire=(machine,boost)=>feel.launcherFired(machine.kind,machine.pad,boost,stage.camera);
machines.onVent=vent=>{feel.launcherFired('geyser',{x:vent.x,y:vent.y,z:vent.z,radius:3.2},false,stage.camera);feel.surgePulse(vent,stage.camera);};
function setPressure(fraction:number):void {
    pressure.levels=Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,fraction*PRESSURE_TUNING.full]));delete pressure.blowing;
}
function firePressure(boost:boolean):void {
    const at=performance.now();pressure.levels={};delete pressure.blowing;
    pressure.fired=Object.fromEntries(LAUNCH_MACHINES.map(m=>[m.id,at]));pressure.boosts=boost?{...pressure.fired}:{};
}
/** Park the camera three-quarters on to a machine and its pad (stops following your rat). */
let viewing='pressure';
function viewMachine(id:string):void {
    viewing=id;
    const m=LAUNCH_MACHINES.find(machine=>machine.id===id)!,dx=m.pad.x-m.box.x,dz=m.pad.z-m.box.z,d=Math.hypot(dx,dz);
    rat.updateView=()=>{};rat.entity.mesh.visible=false;
    // The Gate geyser has a wall on its left; look from the street side.
    const flip=m.id==='geyser'?-1:1,side={x:-dz/d*flip,z:dx/d*flip},mid={x:(m.box.x+m.pad.x)/2,z:(m.box.z+m.pad.z)/2};
    stage.camera.position.set(mid.x+side.x*11-dx/d*4,6.5,mid.z+side.z*11-dz/d*4);stage.camera.lookAt(mid.x,1.6,mid.z);
}
/** A ground point `distance` ahead of the camera. */
function ahead(distance:number):THREE.Vector3 {
    const forward=stage.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    return rat.entity.mesh.position.clone().addScaledVector(forward,distance).setY(0);
}
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
Object.assign(window,{stage,rat,suspects,studioCorpseAt:()=>corpse?.at,renderCues,feelActions:actions,faceWall,probeWalls:()=>Array.from({length:24},(_,i)=>i*15).map(d=>{const dir=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),d*Math.PI/180);ray.set(rat.entity.mesh.position.clone().setY(1.6),dir);const hit=ray.intersectObjects(blockers,true)[0];return `${d}:${hit?hit.distance.toFixed(1):'-'}`;}).join(' ')});
let previous=0;
function frame(now:number){
    const dt=previous?Math.min(.05,(now-previous)/1000):1/60;previous=now;
    stage.syncViewport();
    stage.world.step(1/60,dt,3);
    rat.update(dt,{});gun.update(dt);impacts.update(dt);
    const unitsPerPixel=2*Math.tan(THREE.MathUtils.degToRad(stage.camera.fov)/2)/innerHeight;
    for(const [i,suspect] of suspects.entries()){suspect.update(dt);suspect.fitOutline(stage.camera.position,unitsPerPixel);feel.flightTrail(`suspect-${i}`,suspect.mesh.position,suspect.launchFlight,dt);}
    for(const prop of [kit,coat,shoes])prop.update(performance.now(),stage.camera);
    feel.footsteps(dt,suspects.map((s,i)=>({id:`suspect-${i}`,position:s.mesh.position})),rat.entity.mesh.position,stage.camera);
    city.update(dt,stage.camera,rat.entity.body.position);
    feel.hunch(dt,now,stage.camera,rat.entity.dead?undefined:rat.entity,hunchRats,wantedSuspect);
    feel.wanted(dt,wantedSuspect?suspects[1]!.mesh.position:undefined,false);
    poseStudioCorpse(dt);
    machines.update(pressure,performance.now(),stage.camera,surging);
    feel.update(dt,stage.camera,rat.entity.mesh.position);
    if(lineup.active)lineup.update(dt,stage.camera,stage.flashlight);
    stage.renderer.toneMappingExposure=1.1*feel.exposure;
    feel.beforeRender(stage.camera);
    stage.renderer.render(stage.scene,stage.camera);
    feel.afterRender(stage.camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
