import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createStage } from '../../src/session/createStage';
import { RatEntity } from '../../src/entities/RatEntity';
import { CheeseGun } from '../../src/weapons/CheeseGun';
import { createCheeseBallGeometry } from '../../src/weapons/CheeseProjectileModel';

const stage = createStage(new THREE.WebGLRenderer({antialias:true}));
const rat = new RatEntity(stage.scene,stage.world,new THREE.Vector3(0,0,2),'',{coatColor:0xbe4545,hatColor:0xdc4a3c,furColor:0xe8b84d},true);
rat.mesh.rotation.y = Math.PI; rat.billboard.sprite.visible=false;
const gun = new CheeseGun(stage.scene,stage.world,stage.listener);
const wallGeometry = new THREE.BoxGeometry(3.8,4,0.5);
const wallMaterial = new THREE.MeshStandardMaterial({color:0x383344,roughness:0.85});
const wall = new THREE.Mesh(wallGeometry,wallMaterial); wall.position.set(0,2,-4); wall.receiveShadow=true; stage.scene.add(wall);
const wallBody = new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(1.9,2,0.25))});
wallBody.position.set(0,2,-4); wallBody.aabbNeedsUpdate = true; stage.world.addBody(wallBody);
const showcase = new THREE.Mesh(createCheeseBallGeometry(),new THREE.MeshStandardMaterial({color:0xffc34a,emissive:0xffc34a,emissiveIntensity:0.7,roughness:0.65}));
showcase.scale.setScalar(7); showcase.position.set(0,1.5,0); showcase.visible=false; stage.scene.add(showcase);
const fill = new THREE.DirectionalLight(0xffdfb1, 1.8); fill.position.set(-3,6,5); stage.scene.add(fill);
stage.flashlight.intensity=8; stage.flashlight.position.set(2,5,5); stage.flashlight.target.position.set(0,1,-3);
let slow=true, close=false, count=0;
document.getElementById('fire')!.onclick=()=>{ if(!close) gun.shoot(rat,new THREE.Vector3(Math.sin(count++ * 1.6)*1.2,1.3,-4)); };
document.getElementById('slow')!.onclick=()=>{slow=!slow; document.getElementById('slow')!.setAttribute('aria-pressed',String(slow));};
document.getElementById('close')!.onclick=()=>{
    close=!close; document.getElementById('close')!.setAttribute('aria-pressed',String(close));
    (document.getElementById('fire') as HTMLButtonElement).disabled = close;
    showcase.visible=close; wall.visible=!close; rat.mesh.visible=!close;
    // The entity's outline shares its visual root pose but is a separate scene object.
    stage.scene.children.forEach(child=>{if(child instanceof THREE.Group && child!==rat.mesh && child.name!=='cheese-impact-effects') child.visible=!close;});
    gun.clearProjectiles(); resize();
};
function resize(){
    stage.renderer.setSize(innerWidth,innerHeight); stage.camera.aspect=innerWidth/innerHeight;
    stage.camera.position.set(close?1.8:4,close?2.3:3.8,close?5:8);
    const target=new THREE.Vector3(0,1.3,close?0:-1);
    stage.camera.position.sub(target).multiplyScalar(Math.max(1,0.55/stage.camera.aspect)).add(target);
    stage.camera.lookAt(target);stage.camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();let last=performance.now();
stage.renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,0.05);last=now;
    const simulationDt=dt*(slow?0.12:1);
    // Match the game's small simulation steps even when the preview renders slowly.
    const steps=Math.max(1,Math.ceil(simulationDt/(1/60)));
    for(let i=0;i<steps;i++){rat.update(simulationDt/steps);gun.update(simulationDt/steps);}
    showcase.rotation.y+=dt*0.6; showcase.rotation.z=0.18;
    stage.renderer.render(stage.scene,stage.camera);
});
window.addEventListener('pagehide',()=>{
    stage.renderer.setAnimationLoop(null);window.removeEventListener('resize',resize);
    gun.dispose();rat.dispose();stage.world.removeBody(wallBody);wallGeometry.dispose();wallMaterial.dispose();
    showcase.geometry.dispose();showcase.material.dispose();stage.dispose();
});
