import * as THREE from 'three';
import * as C from 'cannon-es';
import {NoirCity} from '../../src/feel/NoirCity';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {CaseFiles} from '../../src/prototype/CaseFiles';
import {ShoulderCamera,SHOULDER} from '../../src/player/ShoulderCamera';
import {CameraBlockers} from '../../src/player/CameraBlockers';
import {RatEntity} from '../../src/entities/RatEntity';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {FLASHLIGHT,FLASHLIGHT_REACH} from '../../src/shared/rat/ratBody';
import {FEEL} from '../../src/feel/feelTuning';
import type {CaseClue} from '../../src/shared/caseClues';
const stage=createStage(new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}));
const city=new Neighborhood(stage.scene,stage.world);
const rat=new RatEntity(stage.scene,stage.world,new THREE.Vector3(-10,0,-27),'',DEFAULT_APPEARANCE,true);
rat.billboard.sprite.visible=false;
stage.scene.updateMatrixWorld(true);
const camera=new ShoulderCamera(new CameraBlockers(city.solids));
const files=new CaseFiles();stage.scene.add(files.root);
const noir=new NoirCity(stage.scene);noir.adopt(files.root);
const ray=new C.RaycastResult(),from=new C.Vec3(),to=new C.Vec3();
files.support=p=>{from.set(p.x,p.y+.3,p.z);to.set(p.x,p.y-.4,p.z);ray.reset();
 if(!stage.world.raycastClosest(from,to,{collisionFilterMask:1},ray))return undefined;
 return {y:ray.hitPointWorld.y,normal:{x:ray.hitNormalWorld.x,y:ray.hitNormalWorld.y,z:ray.hitNormalWorld.z}};};
const now=100000;
let closeView=false;
let clues:CaseClue[]=[],walk=false,time=0,view='street';
const origin=new THREE.Vector3(-10,0,-27);
const views:Record<string,{p:number[];points:number[][]}>={
 street:{p:[-10,0,-27],points:[[-9.7,0,-31],[-10.2,0,-35],[-9.6,0,-39],[-10.3,0,-43]]},
 corner:{p:[-10,0,-34],points:[[-10,0,-42],[-18,0,-44],[-24,0,-44]]},
 sewer:{p:[0,-7,18],points:[[0,-7,10],[0,-7,0],[0,-7,-10]]},
 blackout:{p:[-10,0,-27],points:[[-9.7,0,-31],[-10.2,0,-35],[-9.6,0,-39],[-10.3,0,-43]]},
};
function setView(name:string){
 view=name;walk=false;closeView=false;const v=views[name]??views.street;origin.set(v.p[0],v.p[1],v.p[2]);time=0;
 clues=v.points.map(([x,y,z],i)=>({id:'visual-file-'+i,p:{x,y:y+.035,z},at:now,anchored:true}));
 const dark=name==='blackout',beam=FEEL.blackout.params;
 city.power=dark?0:1;noir.setDark(dark?1:0);noir.update();
 Object.assign(stage.flashlight,{intensity:dark?beam.beam:FLASHLIGHT.intensity,distance:dark?FLASHLIGHT_REACH:FLASHLIGHT.distance,angle:dark?beam.angle:FLASHLIGHT.angle,penumbra:dark?beam.penumbra:FLASHLIGHT.penumbra,decay:dark?beam.decay:FLASHLIGHT.decay});
 stage.scene.traverse(o=>{if(o instanceof THREE.Light&&o!==stage.flashlight)o.visible=name!=='blackout';});
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
 render();document.body.dataset.ready='true';
}
function render(){
 const p=origin.clone();if(walk)p.z-=4-4*Math.cos(time*Math.PI/10);
 rat.mesh.position.copy(p);rat.mesh.rotation.y=Math.PI;rat.syncGlowTransform();
 camera.place(stage.camera,p,new THREE.Spherical(SHOULDER.radius,SHOULDER.phi,walk?.10*Math.sin(time*.7):0));
 if(closeView){stage.camera.position.set(-10,3,-33);stage.camera.lookAt(-10,0,-35);}
 stage.flashlight.position.copy(stage.camera.position);stage.flashlight.target.position.copy(p).add(new THREE.Vector3(0,0,-20));
 files.update(clues,now,stage.camera);city.update(1/60,stage.camera);
 stage.syncViewport();if(new URLSearchParams(location.search).has('low'))stage.renderer.setPixelRatio(.7);stage.renderer.render(stage.scene,stage.camera);
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view!));
document.getElementById('walk')!.onclick=()=>{walk=!walk;time=0;};
document.getElementById('record')!.onclick=()=>{
 const canvas=stage.renderer.domElement,stream=canvas.captureStream(30),chunks:Blob[]=[];
 const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});walk=true;time=0;
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=()=>{const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));const a=document.createElement('a');a.href=url;a.download='physical-files-'+view+'.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);for(const track of stream.getTracks())track.stop();walk=false;};
 recorder.start();setTimeout(()=>recorder.stop(),20000);
};
setView(new URLSearchParams(location.search).get('view')??'street');
let last=performance.now();
stage.renderer.setAnimationLoop(at=>{time+=Math.min(.1,(at-last)/1000);last=at;render();});
Object.assign(window,{clueFixture:{setView,visible:()=>files.visibleIds,render,
 metrics:()=>({calls:stage.renderer.info.render.calls,triangles:stage.renderer.info.render.triangles,
 textures:stage.renderer.info.memory.textures,geometries:stage.renderer.info.memory.geometries,
 paperDraws:files.root.children.filter(o=>(o as THREE.InstancedMesh).count>0).length,
 documents:files.root.children.map(o=>({name:o.name,count:(o as THREE.InstancedMesh).count})),
 resolution:stage.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()}),
 close:()=>{walk=false;closeView=true;render();},
 atlas:()=>(((files.root.children[0] as THREE.InstancedMesh).material as THREE.MeshStandardMaterial).map!.image as HTMLCanvasElement).toDataURL()
}});
