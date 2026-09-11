import {build} from 'esbuild';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';

const root=resolve(import.meta.dirname,'..');
const label=process.argv[2]??'current';
if(!/^[a-z0-9-]{1,60}$/.test(label))throw Error('Use a short benchmark label');
const out=resolve(root,'output/optimization',label);mkdirSync(out,{recursive:true});
const hasPool=existsSync(resolve(root,'src/prototype/CorpseRigPool.ts'));
const hasSharedClock=existsSync(resolve(root,'src/shared/WorldPresentationClock.ts'));
await build({stdin:{contents:`
 export {SnapshotBuffer,BotSnapshotBuffer} from './src/shared/SnapshotBuffer';
 export {ChaosPresentation} from './src/shared/ChaosPresentation';
 export {ChaosSimulation} from './src/shared/ChaosSimulation';
 export {createPlayer} from './src/worker/gameState';
 export {createRatMesh} from './src/utils/RatModel';
 export {RatAnimator} from './src/utils/RatAnimator';
 export {batchRigidMeshes} from './src/utils/RigidMeshBatch';
 export {disposeMeshResources} from './src/utils/disposeMeshResources';
 export {ChaosEncoder} from './src/shared/chaosWire';
 export {LocalShotPresentation} from './src/shared/LocalShotPresentation';
 ${hasPool?"export {CorpseRigPool} from './src/prototype/CorpseRigPool';":''}
 ${hasSharedClock?"export {WorldPresentationClock,WorldSnapshotBuffer} from './src/shared/WorldPresentationClock';":''}
 `,resolveDir:root,loader:'ts'},outfile:resolve(out,'subjects.mjs'),bundle:true,packages:'external',platform:'node',format:'esm'});
const subject=await import(resolve(out,'subjects.mjs'));
const C=await import('cannon-es');
const {SnapshotBuffer,BotSnapshotBuffer,ChaosPresentation,ChaosSimulation,createPlayer,createRatMesh,RatAnimator,batchRigidMeshes,disposeMeshResources}=subject;
const zero=()=>({x:0,y:0,z:0}),q=()=>({x:0,y:0,z:0,w:1});
const snapshot=t=>({time:t,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:t*.012,y:100,z:0},v:{x:12,y:0,z:0},q:q(),spin:zero()},dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},corpses:[],shots:[{id:'probe-ball',owner:'probe',p:{x:t*.012,y:100,z:0},v:{x:12,y:0,z:0},age:t/1000}],impacts:[],notice:{serial:0,text:''}});
const quantile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]??0;
const temporal=[];
for(const [kind,Buffer] of [['human',SnapshotBuffer],['AI',BotSnapshotBuffer],...(hasSharedClock?[['shared-human',subject.WorldSnapshotBuffer],['shared-AI',subject.WorldSnapshotBuffer]]:[])]){
 const clock=kind.startsWith('shared')?new subject.WorldPresentationClock():undefined;
 const rat=new Buffer(clock),chaos=new ChaosPresentation(75,clock),pose={p:zero(),q:q()},ages=[],ballAges=[],separations=[];let ratTick=0,ballTick=0;
 for(let frame=0;frame<=600;frame++){
  const now=frame*1000/60;
  while(ratTick*50<=now+1e-7){const t=ratTick++*50;rat.push({x:t*.012,y:100,z:0,qx:0,qy:0,qz:0,qw:1},t,t);}
  while(ballTick*1000/30<=now+1e-7){const t=ballTick++*1000/30;chaos.apply(snapshot(t),t);}
  const p=rat.sample(now);chaos.shot('probe-ball',now,pose);
  if(now>=8000){ages.push(now-p.x/.012);ballAges.push(now-pose.p.x/.012);separations.push(Math.abs(p.x-pose.p.x)/.012);}
 }
 const removal=snapshot(10000+1000/30);removal.shots=[];chaos.apply(removal,removal.time);
 temporal.push({kind,ratAgeMedianMs:quantile(ages,.5),ballAgeMedianMs:quantile(ballAges,.5),disagreementP95Ms:quantile(separations,.95),existsOnOmissionReceipt:chaos.shot('probe-ball',removal.time,pose)});
}
const appearance={hatType:'fedora',hatColor:0x605050,coatColor:0x333344,furColor:0x999999};
const collisions=[];
for(const obstacle of ['victim','wall'])for(const ownerOnPath of [true,false]){
 const shooter=createPlayer('probe-shooter','Shooter',appearance,{x:0,y:100,z:ownerOnPath?0:5});
 const victim=createPlayer('probe-victim','Victim',appearance,{x:1.25,y:100,z:0});
 const players=new Map([[shooter.id,shooter]]);if(obstacle==='victim')players.set(victim.id,victim);
 const hits=[],sim=new ChaosSimulation(players,hit=>hits.push(hit),undefined,{version:2,seed:341283204});
 if(obstacle==='wall'){
  const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.1,2,2)),position:new C.Vec3(1.25,100.6,0)});
  sim.world.addBody(body);sim.targets.set(body,{kind:'world'});
 }
 sim.step(0,1000);sim.shoot(shooter.id,{shotId:'probe-shot',origin:{x:-1,y:100.6,z:0},direction:{x:1,y:0,z:0}});
 sim.step(1/60,1000+1000/60);const shot=sim.snapshot(false).shots.find(s=>s.id==='probe-shot');
 collisions.push({obstacle,ownerOnPath,hits,shot,eligibleContact:obstacle==='victim'?hits.some(h=>h.victim===victim.id):!!shot?.wallBounced});
}
const corpse=[];
for(const mode of ['unbatched','batched',...(hasPool?['pooled']:[])]){
 const runs=[];
 for(let run=0;run<4;run++){
  const pool=mode==='pooled'?new subject.CorpseRigPool(16):null;
  const warmStart=performance.now();pool?.prewarm(appearance,16);const prewarmMs=performance.now()-warmStart;
  let acquireMs=0,releaseMs=0,poseMs=0,visibleMeshes=0;
  for(let cycle=0;cycle<8;cycle++){
   const rigs=[];let start=performance.now();
   for(let i=0;i<16;i++){
    if(pool)rigs.push(pool.acquire(appearance));
    else {const mesh=createRatMesh(appearance),animator=new RatAnimator(mesh);if(mode==='batched')batchRigidMeshes(mesh);rigs.push({mesh,animator});}
   }
   acquireMs+=performance.now()-start;start=performance.now();
   for(const [i,rig] of rigs.entries()){
    rig.mesh.position.set(i,0,-20);rig.animator.poseDeath(.15,1/60,{x:1,y:2,z:3},.4,false);rig.mesh.updateMatrixWorld(true);
   }
   poseMs+=performance.now()-start;
   if(cycle===0){visibleMeshes=0;rigs[0].mesh.traverseVisible(o=>{if(o.isMesh)visibleMeshes++;});}
   start=performance.now();for(const rig of rigs)if(pool)pool.release(rig);else disposeMeshResources(rig.mesh);
   releaseMs+=performance.now()-start;
  }
  const diagnostics=pool?.diagnostics();pool?.dispose();
  if(run>0)runs.push({acquireMs,releaseMs,poseMs,lifecycleMs:acquireMs+releaseMs,prewarmMs,visibleMeshes,diagnostics});
 }
  corpse.push({mode,burstsPerRun:8,corpsesPerBurst:16,runs,medianLifecycleMs:quantile(runs.map(r=>r.lifecycleMs),.5),medianPoseMs:quantile(runs.map(r=>r.poseMs),.5)});
}
// Wire framing: the same 30 Hz chaos snapshot stream encoded with and without
// the delta motion option, using the production encoder. Measures lossless
// bytes-per-frame and encode CPU; no decoding or network is involved.
const wire=[];
{
 const restCase=(i,t)=>({owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:-22+i*3+Math.sin(t*.001)*2,y:1,z:-20},v:{x:0,y:0,z:0},q:q(),spin:zero()});
 const chaosState=t=>({time:t,case:restCase(0,t),extraCases:Array.from({length:7},(_,i)=>({id:'extra-'+i,...restCase(i+1,t)})),
  dispatch:{phase:'active',started:0,until:1e9,serial:1,incident:'evidence-tampering'},possession:{},notice:{serial:0,text:''},
  corpses:Array.from({length:16},(_,i)=>({id:'corpse-'+Math.floor(t/3000)+'-'+i,victimId:'rat-'+i,born:Math.floor(t/3000)*3000,expires:Math.floor(t/3000)*3000+3000,
   p:{x:-24+(i%4)*3+Math.sin(t*.002+i),y:1+Math.abs(Math.sin(t*.002+i))*.8,z:-21+Math.floor(i/4)*2},q:{x:0,y:0,z:Math.sin(t*.001+i),w:Math.cos(t*.001+i)},v:zero(),spin:{x:1,y:2,z:3}})),
  impacts:[],shots:Array.from({length:256},(_,i)=>({id:'ball-'+i+'-'+Math.floor(t/2500),owner:'rat-'+(i%16),
   p:{x:-24+(i%16)*3+Math.sin(t*.003+i)*2,y:1+Math.abs(Math.sin(t*.002+i))*2,z:-23+(i%16)*2},v:{x:Math.cos(i)*175,y:Math.sin(t*.01+i)*40,z:Math.sin(i)*175},age:((t%2500)/1000),wallBounced:i%3===0}))});
 for(const deltaMotion of [false,true]){
  const encoder=new subject.ChaosEncoder('bench-wire',deltaMotion);
  let bytes=0,frames=0;const started=performance.now();
  for(let step=0;step<300;step++){const frame=encoder.encode(chaosState(step*1000/30));bytes+=frame.bytes;frames++;}
  wire.push({deltaMotion,frames,bytes,bytesPerFrame:bytes/frames,encodeMs:performance.now()-started});
 }
}
// Local responsive-shot replay: one accepted local ball advanced over its
// 2.5 s lifetime at 60 Hz, including the bounded reconciliation substeps.
const localShot=[];
{
 const presentation=new subject.LocalShotPresentation();
 presentation.fire('me',{shotId:'local-1',origin:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:-1}},undefined,0);
 let now=0;const started=performance.now();
 for(let frame=0;frame<150;frame++){now+=1000/60;presentation.render([],now);}
 localShot.push({frames:150,tracked:1,renderMs:performance.now()-started});
}
const sourceHashes={};
for(const name of ['src/shared/SnapshotBuffer.ts','src/shared/ChaosPresentation.ts','src/shared/ChaosSimulation.ts','src/shared/SpatialRayQuery.ts','src/shared/chaosWire.ts','src/shared/LocalShotPresentation.ts','src/utils/RatModel.ts','src/utils/RatAnimator.ts','src/utils/RigidMeshBatch.ts',...(hasPool?['src/prototype/CorpseRigPool.ts']:[])])sourceHashes[name]=createHash('sha256').update(readFileSync(resolve(root,name))).digest('hex');
const report={label,createdAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,sourceHashes,scope:'Offline presentation and actual authoritative collision; corpse model birth/death CPU matching ChaosView operations, without DOM/network/GPU. Batched arm includes cold batch construction. Pool prewarming is reported separately.',temporal,collisions,corpse,wire,localShot};
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:resolve(out,'report.json'),temporal,collisions:collisions.map(({obstacle,ownerOnPath,eligibleContact})=>({obstacle,ownerOnPath,eligibleContact})),corpse:corpse.map(({mode,medianLifecycleMs,medianPoseMs})=>({mode,medianLifecycleMs,medianPoseMs})),wire,localShot},null,2));
