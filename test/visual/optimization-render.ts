import * as THREE from 'three';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {RemotePlayers} from '../../src/session/RemotePlayers';
import {ChaosView} from '../../src/prototype/ChaosView';
import {createPlayer} from '../../src/worker/gameState';
import {EXTRA_CASE_IDS,type ChaosState,type CorpseState} from '../../src/shared/chaosState';
import {gpuTimer} from './capacity-gpu';
import {CorpseRigPool} from '../../src/prototype/CorpseRigPool';
import {prepareCorpseRigs} from '../../src/prototype/prepareCorpseRigs';

const query=new URLSearchParams(location.search);
const seconds=Number(query.get('seconds')??120),warmup=10;
if(!Number.isFinite(seconds)||seconds<5||seconds>180)throw Error('Expected 5–180 seconds');
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
stage.renderer.setPixelRatio(1);stage.renderer.setSize(1280,720);
stage.camera.aspect=1280/720;stage.camera.updateProjectionMatrix();
stage.camera.position.set(-43,7,-18);stage.camera.lookAt(-6,1,-18);
stage.renderer.info.autoReset=false;
const gl=stage.renderer.getContext() as WebGL2RenderingContext;
const debug=gl.getExtension('WEBGL_debug_renderer_info');
const gpu=gpuTimer(gl);
const spec={version:2,seed:341283204};
const city=new Neighborhood(stage.scene,stage.world,spec);city.generate();
const remotes=new RemotePlayers(stage.scene,stage.world,()=>performance.now());
const hats=['fedora','trilby','porkpie'] as const;
const players=Array.from({length:16},(_,i)=>createPlayer(`rat-${i}`,`Rat ${i}`,{hatType:hats[i%3],hatColor:0x605050+i*0x070300,coatColor:0x333344+i*0x030205,furColor:0x999999},{x:-20+Math.floor(i/4)*3,y:0,z:-23+(i%4)*3}));
for(const p of players)remotes.add(p);
const pool=new CorpseRigPool();
const chaos=new ChaosView(stage.scene,id=>remotes.get(id),undefined,false,undefined,undefined,undefined,pool);
const identity=()=>({x:0,y:0,z:0,w:1}),zero=()=>({x:0,y:0,z:0});
const caseState=(i:number,time:number)=>({owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-22+i*3+Math.sin(time*.001)*2,y:1,z:-20},q:identity(),v:zero(),spin:zero()});
function stateAt(time:number):ChaosState{
 const generation=Math.floor(time/3000),life=time-generation*3000;
 const corpses:CorpseState[]=players.map((p,i)=>({id:`corpse-${generation}-${i}`,victimId:p.id,appearance:p,born:generation*3000,expires:(generation+1)*3000,p:{x:-24+Math.floor(i/4)*3,y:1+Math.abs(Math.sin(life*.002+i))*.8,z:-21+(i%4)*2},q:{x:0,y:0,z:Math.sin((life*.001+i)/2),w:Math.cos((life*.001+i)/2)},v:zero(),spin:{x:1,y:2,z:3}}));
 return {time,case:caseState(0,time),extraCases:EXTRA_CASE_IDS.map((id,i)=>({id,...caseState(i+1,time)})),dispatch:{phase:'active',started:0,until:1e9,serial:1,incident:'evidence-tampering'},possession:{},notice:{serial:0,text:''},corpses,impacts:[],shots:Array.from({length:256},(_,i)=>({id:`shot-${Math.floor(time/2500)}-${i}`,owner:players[i%16].id,p:{x:-24+Math.floor(i/16)*1.8,y:1+Math.sin(time*.002+i),z:-23+(i%16)*.65},v:{x:175,y:0,z:0},age:(time%2500)/1000,wallBounced:i%3===0}))};
}
const raw:Array<{interval:number;apply:number;move:number;state:number;present:number;render:number;calls:number}>=[];
const q=(a:number[],p:number)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]??0;
let start=0,previous=0,packet=-1,measured=false;
let preparationMs=0;
async function prepare(){
 const before=performance.now();
 await prepareCorpseRigs(pool,stage.renderer,stage.scene,new AbortController().signal);
 preparationMs=performance.now()-before;
 chaos.apply(stateAt(0));city.update(0,stage.camera);
 await stage.renderer.compileAsync(stage.scene,stage.camera);
 requestAnimationFrame(frame);
}
function frame(now:number){
 if(!start)start=now;
 const elapsed=now-start,dt=previous?Math.min(.05,(now-previous)/1000):1/60;
 const measuredTime=Math.max(0,elapsed-warmup*1000);
 if(elapsed>=warmup*1000&&!measured){measured=true;gpu.reset();}
 const before=performance.now(),tick=Math.floor(elapsed/50);
 let moveMs=0,stateMs=0;
 if(tick!==packet){
  packet=tick;const time=tick*50;
  const moveStart=performance.now();
  for(const [i,p] of players.entries())remotes.move({...p,x:p.x+Math.sin(time*.001+i),z:p.z+Math.cos(time*.001+i)},now);
  const moveEnd=performance.now();
  chaos.apply(stateAt(time));
  moveMs=moveEnd-moveStart;stateMs=performance.now()-moveEnd;
 }
 const applied=performance.now();
 remotes.prepareFrame(now);remotes.presentFrame();chaos.update(dt,stage.camera);city.update(dt,stage.camera);
 const presented=performance.now();stage.renderer.info.reset();gpu.begin();stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);gpu.end();
 const rendered=performance.now();
 if(measured)raw.push({interval:now-previous,apply:applied-before,move:moveMs,state:stateMs,present:presented-applied,render:rendered-presented,calls:stage.renderer.info.render.calls});
 previous=now;
 if(measuredTime<seconds*1000){requestAnimationFrame(frame);return;}
 const gpuSamples=gpu.finish();
 const summary=(name:'interval'|'apply'|'move'|'state'|'present'|'render'|'calls')=>{const a=raw.map(f=>f[name]);return{p50:q(a,.5),p95:q(a,.95),p99:q(a,.99),max:Math.max(...a)};};
 const result={kind:'synthetic-rendering-no-input-no-network',seconds,warmup,preparationMs,corpsePool:pool.diagnostics(),seed:spec.seed,rats:16,balls:256,corpses:16,cases:8,viewport:[1280,720],dpr:stage.renderer.getPixelRatio(),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],gpuRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),hidden:document.hidden,samples:raw.length,frame:summary('interval'),apply:summary('apply'),move:summary('move'),state:summary('state'),present:summary('present'),render:summary('render'),calls:summary('calls'),overBudgetFrames:raw.filter(f=>f.interval>17.5).length,gpu:{supported:gpu.supported,samples:gpuSamples.length,p95:gpuSamples.length?q(gpuSamples,.95):null},memory:{...stage.renderer.info.memory},raw,gpuSamples};
 // A fixed final pose makes before/after screenshots comparable independently of scheduling.
 chaos.apply(stateAt(1000));chaos.update(0,stage.camera);city.update(0,stage.camera);stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);
 // Compare the pooled batch with its original source geometry in the exact same
 // pose and lighting. Readback is outside the measured interval.
 const batches=pool.preparedRigs().filter(rig=>rig.mesh.parent).map(rig=>rig.mesh.getObjectByName('rat-rigid-batch') as THREE.SkinnedMesh);
 const target=new THREE.WebGLRenderTarget(1280,720,{samples:4}),a=new Uint8Array(1280*720*4),b=new Uint8Array(a.length);
 stage.renderer.setRenderTarget(target);stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);stage.renderer.readRenderTargetPixels(target,0,0,1280,720,a);
 for(const batch of batches){batch.visible=false;for(const source of batch.userData.rigidSources as THREE.Mesh[])source.visible=true;}
 stage.renderer.render(stage.scene,stage.camera);chaos.renderOutline(stage.renderer,stage.camera);stage.renderer.readRenderTargetPixels(target,0,0,1280,720,b);
 for(const batch of batches){batch.visible=true;for(const source of batch.userData.rigidSources as THREE.Mesh[])source.visible=false;}
 stage.renderer.setRenderTarget(null);target.dispose();
 let sum=0,max=0,changed=0;for(let i=0;i<a.length;i++){if(i%4===3)continue;const delta=Math.abs(a[i]-b[i]);sum+=delta;max=Math.max(max,delta);if(delta>2)changed++;}
 Object.assign(result,{pixelComparison:{channels:a.length/4*3,changedAbove2:changed,maxDelta:max,meanAbsoluteDelta:sum/(a.length/4*3),samePose:true,corpses:batches.length}});
 // Attribute the remaining draw calls by top-level scene group. These extra
 // renders run after the measured interval and the fixed-pose comparison.
 const children=[...stage.scene.children];
 const category=(name:string,type:string):string=>{
  if(name.startsWith('records-chaos'))return 'chaos';
  if(name.startsWith('hot-case'))return 'case';
  if(/^(sewer|street|facade|noir|rat-detective)/.test(name))return 'city-fixtures';
  if(name.startsWith('municipal-launch'))return 'incident-props';
  if(name.startsWith('rat'))return 'rats';
  if(name==='cheese-impact-effects')return 'impact-effects';
  if(name==='outline-overlay')return 'outline-overlay';
  if(type==='Sprite')return 'sprites';
  if(type==='Group')return 'groups';
  if(type.endsWith('Light'))return 'lights';
  return 'scenery-mesh';
 };
 const byCategory=new Map<string,{calls:number;objects:number}>();
 const top:Array<{name:string;calls:number}>=[];
 for(const child of children){
  for(const other of children)other.visible=other===child;
  stage.renderer.info.reset();stage.renderer.render(stage.scene,stage.camera);
  const calls=stage.renderer.info.render.calls,name=child.name||child.type,key=category(child.name||'',child.type);
  const entry=byCategory.get(key)??{calls:0,objects:0};entry.calls+=calls;entry.objects++;byCategory.set(key,entry);
  if(calls>0)top.push({name,calls});
 }
 for(const child of children)child.visible=true;
 stage.renderer.info.reset();chaos.renderOutline(stage.renderer,stage.camera);
 const overlay=stage.renderer.info.render.calls;
 Object.assign(result,{callAttribution:{byCategory:[...byCategory].map(([name,v])=>({name,...v})).sort((a,b)=>b.calls-a.calls),top:top.sort((a,b)=>b.calls-a.calls).slice(0,10),overlay}});
 (window as unknown as {optimizationRenderResult:unknown}).optimizationRenderResult=result;
 document.getElementById('result')!.textContent='Rendering replay complete';
}
void prepare();
