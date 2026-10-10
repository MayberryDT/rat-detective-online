import * as THREE from 'three';
import {createStage} from '../../src/session/createStage';
import {RatEntity} from '../../src/entities/RatEntity';
import {createCaseGrip,disposeCaseGrip} from '../../src/presentation/CaseGrip';
import {powerupCard} from '../../src/presentation/pickupArtwork';
import {PickupVisual} from '../../src/presentation/PickupVisual';
import {BUFF_MS,PICKUP_KINDS,isTimedPickup,isWeaponKind} from '../../src/shared/pickups';
import '../../src/style.css';
import '../../src/presentation/dispatchHud.css';
// Art inspection only. Human gameplay previews always use the hosted Worker.
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
const {scene,camera,renderer,world}=stage;
camera.position.set(7,5.5,12);camera.lookAt(0,1,0);
const rats=[-6,-2,2,6].map((x,i)=>{
    const rat=new RatEntity(scene,world,new THREE.Vector3(x,0,0),['Ironclad Alibi','Hot Pursuit','Quick Fix','Stakeout'][i],{hatType:'fedora',hatColor:0x493944,furColor:0xab8a79,coatColor:0x645668});
    rat.isPlayer=i===0;rat.enableRigidBatching();return rat;
});
const arms=rats.map(r=>createCaseGrip(r));
const pickups=PICKUP_KINDS.map((kind,i)=>{
    const prop=new PickupVisual(scene,kind);prop.setPosition(i*4-6,.7,2.5);return prop;
});
const restock=new URLSearchParams(location.search).has('restock');
if(restock)pickups.forEach((p,i)=>p.setAvailableAt(performance.now()+[45,23,5,33][i]*1000));
const wall=new THREE.Mesh(new THREE.BoxGeometry(1,2.7,.5),new THREE.MeshStandardMaterial({color:0x3c3742}));
wall.position.set(.7,1.35,-2);scene.add(wall);
// `?focus=<kind>`: the camera on that kind's display, with the first rat holding it if it is a weapon (`held` too).
const focus=new URLSearchParams(location.search).get('focus') as typeof PICKUP_KINDS[number]|null;
if(focus&&PICKUP_KINDS.includes(focus)){
    const x=PICKUP_KINDS.indexOf(focus)*4-6;camera.position.set(x+1.6,2.2,6.2);camera.lookAt(x-.6,.9,2);
    if(isWeaponKind(focus)){rats[0]!.setWeapon(focus);rats[0]!.mesh.position.set(x-2.4,0,2.6);rats[0]!.mesh.rotation.y=Math.PI/2;}
}
const hud=document.createElement('div');hud.className='pickup-buffs';const cards=PICKUP_KINDS.map(kind=>{const c=powerupCard(kind);hud.appendChild(c);return c;});document.body.appendChild(hud);
let previous=performance.now(),heal=0;
renderer.setAnimationLoop(now=>{
    const dt=Math.min(.05,(now-previous)/1000);previous=now;
    rats[0].setPowerups(12,0,0);rats[1].setPowerups(0,10,0);
    // Stakeout re-granted every two seconds so its peer and lens-cyan wave repeat.
    rats[3].setPowerups(0,0,2-now/1000%2);
    rats[1].mesh.position.z=-Math.sin(now*.0015)*3;
    rats[1].mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.cos(now*.0015)<0?0:Math.PI);
    heal-=dt;if(heal<=0){rats[2].hp=1;rats[2].heal(3);heal=1.5;}
    for(const rat of rats)rat.presentAlive(dt);
    for(const [i,card] of cards.entries()){const kind=PICKUP_KINDS[i]!;if(!isTimedPickup(kind))continue;const total=BUFF_MS[kind]/1000,seconds=total-now/1000%total;card.querySelector('b')!.textContent=String(Math.ceil(seconds));card.style.setProperty('--remaining',String(seconds/total));card.classList.toggle('powerup-expiring',seconds<3);}
    for(const prop of pickups)prop.update(now,camera);
    renderer.render(scene,camera);
});
window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);arms.forEach(disposeCaseGrip);rats.forEach(r=>r.dispose());pickups.forEach(p=>p.dispose());stage.dispose();});
