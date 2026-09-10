import * as THREE from 'three';
import {gpuTimer} from './capacity-gpu';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {RemotePlayers} from '../../src/session/RemotePlayers';
import {createPlayer} from '../../src/worker/gameState';
import {ChaosView} from '../../src/prototype/ChaosView';
import type {ChaosState} from '../../src/shared/chaosState';
const params=new URLSearchParams(location.search),count=Number(params.get('rats')??50);
if(![0,12,24,32,50,75,100].includes(count))throw Error('Unsupported renderer count');
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
stage.renderer.setPixelRatio(1);
stage.renderer.info.autoReset=false;
const gpu=gpuTimer(stage.renderer.getContext() as WebGL2RenderingContext);let gpuWarm=false;
const spec={seed:341283204,version:2};
const city=new Neighborhood(stage.scene,stage.world,spec);city.generate();
stage.camera.position.set(-43,7,-18);stage.camera.lookAt(-6,1,-18);
stage.flashlight.position.copy(stage.camera.position);stage.flashlight.target.position.set(-6,1,-18);
const remotes=new RemotePlayers(stage.scene,stage.world,()=>performance.now(),params.get('batch')==='1');
const appearance={hatType:'fedora' as const,hatColor:0x605050,coatColor:0x333344,furColor:0x999999};
const players=Array.from({length:count},(_,i)=>createPlayer(`rat-${i}`,`Rat ${i}`,appearance,{x:-20+Math.floor(i/5)*2.2,y:0,z:-22+(i%5)*2}));
for(const p of players)remotes.add(p);
const chaos=new ChaosView(stage.scene,id=>remotes.get(id));
const state:ChaosState={time:0,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-10,y:1,z:-20},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},extraCases:[],dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},notice:{serial:0,text:''},corpses:[],impacts:[],shots:[]};
const balls=Number(params.get('balls')??256);if(![0,256].includes(balls))throw Error('Unsupported ball count');
const frames:number[]=[],cpu:number[]=[],present:number[]=[];let first=0,previous=0,packetAt=0,samples=0;
const output=document.getElementById('result')!;
const quantile=(a:number[],p:number)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]??0;
function frame(now:number){
 if(!first){first=now;packetAt=now;}const dt=previous?Math.min(.05,(now-previous)/1000):1/60;const start=performance.now();
 while(now-packetAt>=50){packetAt+=50;for(const [i,p] of players.entries()){const a=packetAt*.00325+i;remotes.move({...p,x:p.x+Math.sin(a)*2,z:p.z+Math.cos(a)*2,meshQy:Math.sin(a/2),meshQw:Math.cos(a/2)},packetAt);}
 state.time=packetAt;state.shots=Array.from({length:balls},(_,i)=>({id:`ball-${i}`,owner:'rat-0',p:{x:-24+Math.floor(i/16)*1.8,y:1+Math.sin(packetAt*.002+i),z:-23+(i%16)*.65},v:{x:0,y:0,z:0},age:1}));chaos.apply(state);}
 remotes.prepareFrame(now);remotes.presentFrame();chaos.update(dt,stage.camera);city.update(dt,stage.camera);const beforeRender=performance.now();stage.renderer.info.reset();if(now-first>5000&&!gpuWarm){gpu.reset();gpuWarm=true;}gpu.begin();stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);gpu.end();
 if(now-first>5000){frames.push(now-previous);cpu.push(performance.now()-beforeRender);present.push(beforeRender-start);samples++;}
 previous=now;
 if(now-first<20000){requestAnimationFrame(frame);return;}
 const gpuSamples=gpu.finish();
 const result={gpuSupported:gpu.supported,gpuSamples:gpuSamples.length,gpuP95:gpuSamples.length?quantile(gpuSamples,.95):null,batched:params.get('batch')==='1',kind:'synthetic-renderer-only',rats:count,balls,samples,hidden:document.hidden,viewport:[innerWidth,innerHeight],dpr:stage.renderer.getPixelRatio(),frameP50:quantile(frames,.5),frameP95:quantile(frames,.95),frameP99:quantile(frames,.99),renderCpuP95:quantile(cpu,.95),presentationCpuP95:quantile(present,.95),counterScope:'whole-frame-including-shadows',drawCalls:stage.renderer.info.render.calls,triangles:stage.renderer.info.render.triangles,notes:'Actual city, remote rat presentation and chaos views. Synthetic positions; no server or input. CPU submission is not GPU time.'};
 if(params.get('compare')==='1'){
  const batches:THREE.Mesh[]=[];stage.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.rigidSources)batches.push(o);});
  const target=new THREE.WebGLRenderTarget(1280,720,{samples:4}),a=new Uint8Array(1280*720*4),b=new Uint8Array(a.length);
  stage.renderer.setRenderTarget(target);stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);stage.renderer.readRenderTargetPixels(target,0,0,1280,720,a);
  for(const batch of batches){batch.visible=false;for(const source of batch.userData.rigidSources as THREE.Mesh[])source.visible=true;}
  stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);stage.renderer.readRenderTargetPixels(target,0,0,1280,720,b);
  for(const batch of batches){batch.visible=true;for(const source of batch.userData.rigidSources as THREE.Mesh[])source.visible=false;}
  stage.renderer.setRenderTarget(null);target.dispose();
  let sum=0,max=0,changed=0;for(let i=0;i<a.length;i++){if(i%4===3)continue;const delta=Math.abs(a[i]-b[i]);sum+=delta;max=Math.max(max,delta);if(delta>2)changed++;}
  Object.assign(result,{pixelComparison:{channels:a.length/4*3,changedAbove2:changed,maxDelta:max,meanAbsoluteDelta:sum/(a.length/4*3),samePose:true}});
 }
 (window as unknown as {capacityRenderResult:unknown}).capacityRenderResult=result;output.textContent=JSON.stringify(result,null,2);
}
requestAnimationFrame(frame);
