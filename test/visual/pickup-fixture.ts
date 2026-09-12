import * as THREE from 'three';
import {createStage} from '../../src/session/createStage';
import {RatEntity} from '../../src/entities/RatEntity';
import {createCaseGrip,disposeCaseGrip} from '../../src/prototype/CaseGrip';
import {powerupCard} from '../../src/prototype/pickupArtwork';
import {PickupVisual} from '../../src/prototype/PickupVisual';
import '../../src/style.css';
import '../../src/prototype/dispatchHud.css';
// Art inspection only. Human gameplay previews always use the hosted Worker.
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
const {scene,camera,renderer,world}=stage;
camera.position.set(7,5.5,12);camera.lookAt(0,1,0);
const rats=[-4,0,4].map((x,i)=>{
    const rat=new RatEntity(scene,world,new THREE.Vector3(x,0,0),['Ironclad Alibi','Hot Pursuit','Quick Fix'][i],{hatType:'fedora',hatColor:0x493944,furColor:0xab8a79,coatColor:0x645668});
    rat.isPlayer=i===0;rat.enableRigidBatching();return rat;
});
const arms=rats.map(r=>createCaseGrip(r));
const pickups=(['ironclad','hustle','quick-fix'] as const).map((kind,i)=>{
    const prop=new PickupVisual(scene,kind);prop.setPosition(i*4-4,.7,2.5);return prop;
});
const restock=new URLSearchParams(location.search).has('restock');
if(restock)pickups.forEach((p,i)=>p.setAvailableAt(performance.now()+[45,23,5][i]*1000));
const wall=new THREE.Mesh(new THREE.BoxGeometry(1,2.7,.5),new THREE.MeshStandardMaterial({color:0x3c3742}));
wall.position.set(.7,1.35,-2);scene.add(wall);
const hud=document.createElement('div');hud.className='pickup-buffs';const cards=(['ironclad','hustle'] as const).map(kind=>{const c=powerupCard(kind);hud.appendChild(c);return c;});document.body.appendChild(hud);
const toast=document.createElement('div');toast.className='pickup-broadcast';toast.classList.add('pickup-slap');toast.innerHTML='<strong>QUICK FIX</strong><small>Full health</small>';document.body.appendChild(toast);
let previous=performance.now(),heal=0;
renderer.setAnimationLoop(now=>{
    const dt=Math.min(.05,(now-previous)/1000);previous=now;
    rats[0].setPowerups(12,0);rats[1].setPowerups(0,10);
    rats[1].mesh.position.z=-Math.sin(now*.0015)*3;
    rats[1].mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.cos(now*.0015)<0?0:Math.PI);
    heal-=dt;if(heal<=0){rats[2].hp=1;rats[2].heal(3);heal=1.5;}
    for(const rat of rats)rat.presentAlive(dt);
    for(const [i,card] of cards.entries()){const seconds=(i?10:12)-now/1000%(i?10:12);card.querySelector('b')!.textContent=String(Math.ceil(seconds));card.style.setProperty('--remaining',String(seconds/(i?10:12)));card.classList.toggle('powerup-expiring',seconds<3);}
    for(const prop of pickups)prop.update(now,camera);
    renderer.render(scene,camera);
});
window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);arms.forEach(disposeCaseGrip);rats.forEach(r=>r.dispose());pickups.forEach(p=>p.dispose());stage.dispose();});
