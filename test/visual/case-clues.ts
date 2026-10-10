import * as THREE from 'three';
import * as C from 'cannon-es';
import {NoirCity} from '../../src/feel/NoirCity';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/presentation/Neighborhood';
import {CaseFiles} from '../../src/presentation/CaseFiles';
import {PAW_INK} from '../../src/presentation/PawPrints';
import {ShoulderCamera,SHOULDER} from '../../src/player/ShoulderCamera';
import {CameraBlockers} from '../../src/player/CameraBlockers';
import {RatEntity} from '../../src/entities/RatEntity';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {FLASHLIGHT,FLASHLIGHT_REACH} from '../../src/shared/rat/ratBody';
import {FEEL} from '../../src/feel/feelTuning';
import {gustAt,looseLifts} from '../../src/shared/paperWind';
import {PRINTS,type CaseClue,type CasePrints} from '../../src/shared/caseClues';
import type {ChalkMark,Flock,MuckRun,WaxRun} from '../../src/shared/cityMarks';
// Static art and motion fixture (P4): fixed sheets in the real city materials and camera, scripted wind time,
// sheets that blow in and away, a rat brushing past and a ball striking nearby. Not gameplay, not human acceptance.
const stage=createStage(new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}));
const city=new Neighborhood(stage.scene,stage.world);
const rat=new RatEntity(stage.scene,stage.world,new THREE.Vector3(-10,0,-27),'',DEFAULT_APPEARANCE,true);
rat.billboard.sprite.visible=false;
stage.scene.updateMatrixWorld(true);
const camera=new ShoulderCamera(new CameraBlockers(city.solids));
const files=new CaseFiles();stage.scene.add(files.root);
const noir=new NoirCity(stage.scene);noir.adopt(files.root,true);
const ray=new C.RaycastResult(),from=new C.Vec3(),to=new C.Vec3();
files.support=p=>{from.set(p.x,p.y+.3,p.z);to.set(p.x,p.y-.4,p.z);ray.reset();
 if(!stage.world.raycastClosest(from,to,{collisionFilterMask:1,skipBackfaces:true},ray)||ray.hitNormalWorld.y<.85)return undefined;
 return {y:ray.hitPointWorld.y,normal:{x:ray.hitNormalWorld.x,y:ray.hitNormalWorld.y,z:ray.hitNormalWorld.z}};};
files.clearPath=(a,b)=>{from.set(a.x,a.y,a.z);to.set(b.x,b.y,b.z);ray.reset();return !stage.world.raycastClosest(from,to,{collisionFilterMask:1},ray);};
const params=new URLSearchParams(location.search);
// `ink=chalk` compares pale chalk prints with the case-red ink.
files.paws.setInk(PAW_INK[(params.get('ink')??'red') as keyof typeof PAW_INK]??PAW_INK.red);
// Fixed wind time: the first strong gust at the street origin a few seconds in, found the same way on every run.
let base=100000;while(gustAt(-10,-35,base+3500)<.85&&base<2e6)base+=250;
type Marks={chalk?:ChalkMark[];muck?:MuckRun[];wax?:WaxRun[];flocks?:Flock[]};
let marks:Marks={};
let closeView=false,walk=false,time=0,view='street',clues:CaseClue[]=[],prints:CasePrints[]=[],script:{at:number;add?:CaseClue;drop?:string;hit?:THREE.Vector3;addPrints?:CasePrints}[]=[];
const origin=new THREE.Vector3(-10,0,-27);
const sheet=(id:string,x:number,y:number,z:number,s:number,born=base-60000,q?:[number,number]):CaseClue=>({id,p:{x,y:y+.018,z},at:born,s,...(q?{q:{x:q[0],y:y+.018,z:q[1]}}:{})});
/** A run of `n` prints from (x, z) heading `h` (toes toward sin h, cos h), turning `turn` a print, paws alternating. */
const run=(id:string,g:string,x:number,z:number,h:number,n=4,turn=0,y=0,born=base-60000):CasePrints=>{
 const f:number[]=[];let px=x,pz=z,ph=h;
 for(let k=0;k<n;k++){const side=k%2?-1:1;f.push(px+Math.cos(ph)*PRINTS.gait*side,y+.012,pz-Math.sin(ph)*PRINTS.gait*side,ph);px+=Math.sin(ph)*PRINTS.stride;pz+=Math.cos(ph)*PRINTS.stride;ph+=turn;}
 return {id,g,at:born,f};};
/** Pairs of prints across a gap: from (x, z) heading `h` for `length` units, a pair every `PRINTS.pairs`. */
const gap=(id:string,g:string,x:number,z:number,h:number,length:number,turn=0):CasePrints=>{
 const f:number[]=[];let px=x,pz=z,ph=h;
 for(let along=0;along+PRINTS.stride<=length;along+=PRINTS.pairs){
  for(let k=0;k<2;k++){const side=k?-1:1,d=k?PRINTS.stride:0;
   f.push(px+Math.sin(ph)*d+Math.cos(ph)*PRINTS.gait*side,.012,pz+Math.cos(ph)*d-Math.sin(ph)*PRINTS.gait*side,ph);}
  px+=Math.sin(ph)*PRINTS.pairs;pz+=Math.cos(ph)*PRINTS.pairs;ph+=turn;}
 return {id,g,at:base-60000,f};};
// A loose sheet whose gust timetable lifts it inside the clip (searched once, deterministically).
function looseSheet(id:string,x:number,z:number,s:number,q:[number,number]):CaseClue {
 for(let k=0;k<400;k++){const born=base-26000*(1+k%9)-k*911,c=sheet(id+'-'+k,x,0,z,s,born,q);
  const lifts=looseLifts(c.id,c.at,c.p,base+16000).lifts;if(lifts.some(l=>l.at>base+2500&&l.at<base+14000))return c;}
 return sheet(id,x,0,z,s,base-60000,q);
}
const views:Record<string,{p:number[];build:()=>CaseClue[];prints?:()=>CasePrints[];marks?:()=>Marks;script?:()=>typeof script;turn?:true}>={
 // What the chaos leaves (cityMarks): chalk outlines and their fedoras, fresh (drawn in), an older one and a rain-worn one.
 chalk:{p:[-10,0,-27],build:()=>[],marks:()=>({chalk:[{id:'k1',p:{x:-9.6,y:.014,z:-32.4},h:2.4,c:0x2b2b2b,at:base-500},{id:'k2',p:{x:-12.4,y:.014,z:-36.8},h:-.8,c:0x7a3b2a,at:base-60000},{id:'k3',p:{x:-8.2,y:.014,z:-41},h:.4,c:0x1d2a4a,at:base-170000}]})},
 // Hot wax along a carrier's path toward the camera: the nearest drops just landed (bright), the far ones cooling dark.
 wax:{p:[-10,0,-27],build:()=>[],marks:()=>({wax:[{id:'w1',at:base-18000,c:'x',f:Array.from({length:8},(_,i)=>[-10.4+Math.sin(i)*.25,.01,-44+i*1.6,i*400]).flat()},
  {id:'w2',at:base-1200,c:'x',f:Array.from({length:6},(_,i)=>[-10.2+Math.sin(i+2)*.25,.01,-31.2+i*.9,i*200]).flat()}]})},
 // Pigeons the carrier just flushed down the street: the burst, the climb and the circle over the roofs.
 pigeons:{p:[-10,0,-27],build:()=>[],marks:()=>({flocks:[{id:'f1',p:{x:-11,y:0,z:-38},at:base-1000,c:'x'}]})},
 pigeons2:{p:[-10,0,-27],build:()=>[],marks:()=>({flocks:[{id:'f2',p:{x:-11,y:0,z:-38},at:base-3500,c:'x'}]})},
 // Sewer muck: a run of dark prints out toward the camera, as a rat leaves the sewer.
 muck:{p:[-10,0,-27],build:()=>[],marks:()=>({muck:[{id:'m1',at:base-3000,f:run('m1','',-10.6,-40,0,6).f},{id:'m2',at:base-3000,f:run('m2','',-10.6+Math.sin(0)*3.7,-36.3,0,6).f}]})},
 street:{p:[-10,0,-27],build:()=>[sheet('st-0',-9.6,0,-31.5,0),sheet('st-1',-10.9,0,-33.2,5+16),sheet('st-2',-9.2,0,-41,2),sheet('st-3',-10.8,0,-42.8,7+16)],
  prints:()=>[gap('pr-st','st-0',-10.2,-34.6,Math.PI,4.5)],
  script:()=>[{at:5000,add:sheet('st-new',-9.4,0,-37,3+8,base+5000)},{at:5000,addPrints:run('pr-new','st-new',-9.6,-38.4,Math.PI,4,0,0,base+5000)},{at:9000,drop:'st-2'},{at:12000,hit:new THREE.Vector3(-10.2,.3,-34)}]},
 corner:{p:[-10,0,-34],build:()=>[sheet('co-0',-10.4,0,-42,1+4),sheet('co-1',-12.6,0,-44.2,2+8+16),sheet('co-2',-21,0,-44,0+8)],
  prints:()=>[run('pr-co','co-1',-14,-44.4,-Math.PI/2-.25,4,.08)]},
 // Paw prints at reading distance: a group with its prints close by, and the next group's prints turning the corner.
 prints:{p:[-10,0,-27],build:()=>[sheet('pp-0',-9.6,0,-31.5,0),sheet('pp-1',-10.9,0,-33.2,5+16),sheet('pp-2',-10.4,0,-42,1+4),sheet('pp-3',-12.6,0,-44.2,2+8+16)],
  prints:()=>[gap('pr-pp-0','pp-0',-10.2,-34.6,Math.PI,5.5),gap('pr-pp-1','pp-2',-14,-44.4,-Math.PI/2-.2,10,.05)]},
 sewer:{p:[0,-7,18],build:()=>[sheet('se-0',.3,-7,10,1),sheet('se-1',-.4,-7,0,3+4+16),sheet('se-2',.2,-7,-10,2+4)]},
 // The eye-catch: the camera starts turned away and swings back at 2 s; a paper lying in the open 25 units down the street
 // comes into view, lifts in a gust and lands where it lay.
 eyecatch:{p:[-10,0,-27],turn:true,build:()=>[sheet('ec-0',-9.6,0,-31.5,0),sheet('ec-1',-14,0,-52.5,2+4),sheet('ec-2',-13.6,0,-55,1+8+16)],
  prints:()=>[gap('pr-ec-0','ec-0',-10.2,-33.6,Math.PI+.2,17),gap('pr-ec-1','ec-1',-14.2,-56.8,Math.PI,9)]},
 blackout:{p:[-10,0,-27],build:()=>[sheet('bo-0',-9.6,0,-31.5,0),sheet('bo-1',-10.9,0,-33.2,5+16),sheet('bo-2',-9.2,0,-41,2),sheet('bo-3',-10.8,0,-42.8,7+16)],
  prints:()=>[gap('pr-bo','bo-0',-10.2,-34.6,Math.PI,4.5)]},
 // Every front document and both shapes of each family, in two rows on the pavement.
 gallery:{p:[-10,0,-27],build:()=>Array.from({length:12},(_,i)=>{const family=i%4,art=Math.floor(i/4);return sheet('ga-'+i,-13.2+(i%6)*1.3,0,-31.4-Math.floor(i/6)*1.6,family+4*art+16*(i%2));})},
 wind:{p:[-10,0,-27],build:()=>[looseSheet('wi-loose',-9.5,-33,2+4,[-9.2,-35.2]),sheet('wi-0',-10.8,0,-32.4,1),sheet('wi-1',-9.2,0,-38.5,0+8+16),sheet('wi-2',-10.6,0,-40.6,3)]},
};
function setView(name:string){
 view=name;walk=false;closeView=false;const v=views[name]??views.street;origin.set(v.p[0],v.p[1],v.p[2]);time=0;
 files.clear();clues=v.build();prints=v.prints?.()??[];marks=v.marks?.()??{};script=v.script?.()??[];
 const dark=name==='blackout',beam=FEEL.blackout.params;
 city.power=dark?0:1;noir.setDark(dark?1:0);noir.setEvidenceDark(dark?1:0);noir.update();
 Object.assign(stage.flashlight,{intensity:dark?beam.beam:FLASHLIGHT.intensity,distance:dark?FLASHLIGHT_REACH:FLASHLIGHT.distance,angle:dark?beam.angle:FLASHLIGHT.angle,penumbra:dark?beam.penumbra:FLASHLIGHT.penumbra,decay:dark?beam.decay:FLASHLIGHT.decay});
 stage.scene.traverse(o=>{if(o instanceof THREE.Light&&o!==stage.flashlight)o.visible=name!=='blackout';});
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
 render(0);document.body.dataset.ready='true';
}
function render(dt:number){
 const now=base+time*1000;
 for(const step of script)if(step.at<=time*1000){
  if(step.add)clues=[...clues,step.add];if(step.addPrints)prints=[...prints,step.addPrints];if(step.drop)clues=clues.filter(c=>c.id!==step.drop);if(step.hit)files.impact(step.hit,2);
  script=script.filter(s=>s!==step);
 }
 const p=origin.clone();if(walk)p.z-=4-4*Math.cos(time*Math.PI/10);
 rat.mesh.position.copy(p);rat.mesh.rotation.y=Math.PI;rat.syncGlowTransform();
 const turned=views[view]?.turn?Math.max(0,1.3-Math.max(0,time-2)*1.6):0;
 camera.place(stage.camera,p,new THREE.Spherical(SHOULDER.radius,SHOULDER.phi,walk?.10*Math.sin(time*.7):turned));
 if(closeView){stage.camera.position.set(-10.6,1.9,-31.2);stage.camera.lookAt(-10.9,0,-33.2);}
 if(view==='gallery'&&!walk){stage.camera.position.set(-9.95,3.4,-28.3);stage.camera.lookAt(-9.95,0,-32.3);}
 stage.flashlight.position.copy(stage.camera.position);stage.flashlight.target.position.copy(p).add(new THREE.Vector3(0,0,-20));
 files.update(clues,now,stage.camera,dt,p,prints,marks);files.rats([{position:p}]);city.update(1/60,stage.camera);
 stage.syncViewport();if(params.has('low'))stage.renderer.setPixelRatio(.7);stage.renderer.render(stage.scene,stage.camera);
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view!));
document.getElementById('walk')!.onclick=()=>{walk=!walk;time=0;};
document.getElementById('record')!.onclick=()=>{
 const canvas=stage.renderer.domElement,stream=canvas.captureStream(30),chunks:Blob[]=[];
 const moving=view!=='wind'&&view!=='gallery'&&view!=='eyecatch';
 const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});walk=moving;time=0;setView(view);walk=moving;
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=()=>{const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));const a=document.createElement('a');a.href=url;a.download='physical-files-'+view+'.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);for(const track of stream.getTracks())track.stop();walk=false;};
 recorder.start();setTimeout(()=>recorder.stop(),20000);
};
setView(params.get('view')??'street');
let last=performance.now();
// performance.now, not the frame's timestamp: headless Chrome's frame times can lag the clock by seconds.
stage.renderer.setAnimationLoop(()=>{const at=performance.now(),dt=Math.max(0,Math.min(.1,(at-last)/1000));time+=dt;last=at;render(dt);});
Object.assign(window,{clueFixture:{files,setView,visible:()=>files.visibleIds,trace:()=>files.trace(),prints:()=>({runs:files.paws.trace(),stats:files.paws.stats,caught:files.stats.caught}),render:()=>render(0),
 metrics:()=>({calls:stage.renderer.info.render.calls,triangles:stage.renderer.info.render.triangles,
 textures:stage.renderer.info.memory.textures,geometries:stage.renderer.info.memory.geometries,
 paperDraws:files.root.children.filter(o=>(o as THREE.InstancedMesh).count>0).length,
 documents:files.root.children.map(o=>({name:o.name,count:(o as THREE.InstancedMesh).count})),
 resolution:stage.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray()}),
 close:()=>{walk=false;closeView=true;render(0);},
 atlas:()=>{const image=(((files.root.children[0] as THREE.InstancedMesh).material as THREE.MeshStandardMaterial).map!.image as HTMLCanvasElement);return image.toDataURL();}
}});
