import * as THREE from 'three';
import {PickupRespawnVisual} from '../../src/prototype/PickupRespawnVisual';
// A deterministic art sheet using production meshes/shaders, not a gameplay preview.
const scene=new THREE.Scene();scene.background=new THREE.Color(0x28232e);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-6,6,4.5,-4.5,.1,50);camera.position.set(0,0,15);
const dials:PickupRespawnVisual[]=[];
for(const [row,kind] of (['ironclad','hustle','quick-fix'] as const).entries()){
    for(const [column,progress] of [0,.5,.94].entries()){
        const dial=new PickupRespawnVisual(kind);dial.root.position.set(column*3-3,1.7-row*2.1,0);scene.add(dial.root);
        dial.update(1000,1000+(1-progress)*45000,camera);dials.push(dial);
    }
}
const wall=new THREE.Mesh(new THREE.BoxGeometry(.85,6.5,.3),new THREE.MeshBasicMaterial({color:0x514651}));wall.position.set(.35,-.3,1);wall.visible=false;scene.add(wall);
const background=document.querySelector<HTMLButtonElement>('#background')!;let interior=false;
background.onclick=()=>{interior=!interior;scene.background=new THREE.Color(interior?0x51453e:0x28232e);background.textContent=interior?'Switch to street backdrop':'Switch to interior backdrop';render();};
document.querySelector<HTMLButtonElement>('#occlusion')!.onclick=()=>{wall.visible=!wall.visible;render();};
function render(){renderer.render(scene,camera);}
function resize(){const aspect=innerWidth/innerHeight;camera.left=-4.5*aspect;camera.right=4.5*aspect;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);render();}
addEventListener('resize',resize);resize();
addEventListener('pagehide',()=>{dials.forEach(d=>d.dispose());wall.geometry.dispose();(wall.material as THREE.Material).dispose();renderer.dispose();});
