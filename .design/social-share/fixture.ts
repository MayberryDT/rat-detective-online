import * as THREE from 'three';
import { createStage } from '../../src/session/createStage';
import { Neighborhood } from '../../src/presentation/Neighborhood';
import { createRatMesh } from '../../src/rat/RatModel';
import { addLeatherBriefcase } from '../../src/presentation/CaseModel';
import { createCheeseBallGeometry, createCheeseBallMaterial } from '../../src/weapons/CheeseProjectileModel';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
const stage=createStage(renderer,'pools');
const city=new Neighborhood(stage.scene,stage.world,{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION});
const {scene,camera}=stage;
const q=new URLSearchParams(location.search);const shot=q.get('shot')||'chase';
const art=[
 {coatColor:0x2e466b,hatColor:0x243653,furColor:0xc9a27b,highlightColor:0xd4b97d},
 {coatColor:0x9b3640,hatColor:0x792e38,furColor:0xb88b6a,highlightColor:0xd6a769},
 {coatColor:0x376750,hatColor:0x2a5845,furColor:0xd2a97e,highlightColor:0xb4c88a},
];
const rats=art.map(a=>{const r=createRatMesh(a);scene.add(r);return r;});
const caseRoot=new THREE.Group();addLeatherBriefcase(caseRoot);scene.add(caseRoot);
const ballGeo=createCheeseBallGeometry(),ballMat=createCheeseBallMaterial();
const balls=[0,1,2].map(()=>{const m=new THREE.Mesh(ballGeo,ballMat);m.scale.setScalar(1.7);scene.add(m);return m;});
const poses:{[key:string]:{rats:[number,number,number,number,number][];case:[number,number,number];balls:[number,number,number][];eye:[number,number,number];at:[number,number,number]}}={
 chase:{rats:[[-4,0,-24,2.7],[-1,.8,-28,4.1],[-9,0,-30,1.2]],case:[-4.7,1.15,-23.8],balls:[[-2,1.4,-27],[-.5,1.1,-25],[-6,1.8,-29]],eye:[0,3.2,-13],at:[-4,1.5,-27]},
 launch:{rats:[[18,17,-28,1.8],[12,0,-25,3.3],[26,0,-34,5.1]],case:[17.5,17.8,-27.5],balls:[[15,16,-28],[20,12,-27],[17,8,-24]],eye:[31,24,-6],at:[17,14,-29]},
 alley:{rats:[[23,0,49,2.4],[18,0,46,4.3],[26,1.2,43,5.8]],case:[22.4,1.1,49.1],balls:[[21,1.3,46],[25,1.7,45],[23,1.1,43]],eye:[32,3.7,59],at:[22,1.5,46]},
};
const p=poses[shot]||poses.chase;
p.rats.forEach(([x,y,z,yaw],i)=>{rats[i].position.set(x,y,z);rats[i].rotation.y=yaw;});
rats[1].rotation.z=shot==='chase'?0.65:0;
caseRoot.position.set(...p.case);balls.forEach((b,i)=>b.position.set(...p.balls[i]));
camera.position.set(...p.eye);camera.lookAt(...p.at);camera.fov=53;camera.updateProjectionMatrix();
stage.flashlight.position.set(p.eye[0],p.eye[1]+3,p.eye[2]);stage.flashlight.target.position.set(...p.at);
city.update(0,camera,{x:p.rats[0][0],y:p.rats[0][1],z:p.rats[0][2]});
renderer.render(scene,camera);
document.getElementById('ready')!.remove();
(document.body as any).dataset.ready='true';
