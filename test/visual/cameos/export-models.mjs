import { build } from 'vite';
import { mkdir, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Box3, LoopOnce, Mesh, Vector3 } from 'three';

const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(here,'exports');
await mkdir(output,{recursive:true});
// The models contain no textures. GLTFExporter only needs Blob -> ArrayBuffer here.
globalThis.FileReader=class {
  result=null;
  onloadend=null;
  readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}
};
const bundle=await build({
  configFile:false,logLevel:'warn',
  build:{write:false,minify:false,lib:{entry:resolve(here,'CameoAssets.ts'),formats:['es']},
    rollupOptions:{external:id=>id==='three'||id.startsWith('three/')}},
});
const code=bundle[0].output.find(file=>file.type==='chunk').code;
const modulePath=resolve(output,'models.generated.mjs');
await writeFile(modulePath,code);
const {createCameoRat,CameoAnimator}=await import(pathToFileURL(modulePath).href);
const manifest={generatedAt:new Date().toISOString(),scope:'Animated art prototypes; no live-game integration',models:[]};
for(const kind of ['spider','bat']){
  const model=createCameoRat(kind);
  model.updateMatrixWorld(true);
  let triangles=0,meshes=0;
  model.traverse(object=>{
    if(!(object instanceof Mesh))return;
    meshes++;
    const positions=object.geometry.getAttribute('position');
    for(const value of positions.array)if(!Number.isFinite(value))throw new Error(`${kind}: non-finite geometry`);
    triangles+=(object.geometry.index?.count??positions.count)/3;
  });
  const bounds=new Box3().setFromObject(model,true),size=bounds.getSize(new Vector3());
  if(bounds.min.y<-.01||size.y<1||size.y>3)throw new Error(`${kind}: invalid standing bounds`);
  const animator=new CameoAnimator(model,kind),animations=animator.clips();
  const data=await new GLTFExporter().parseAsync(model,{binary:true,animations});
  const buffer=Buffer.from(data);
  if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)throw new Error('Invalid GLB header');
  const jsonLength=buffer.readUInt32LE(12);
  const gltf=JSON.parse(buffer.subarray(20,20+jsonLength).toString());
  if(!gltf.meshes?.length||!gltf.materials?.length)throw new Error('Empty model export');
  const roundtrip=await new GLTFLoader().parseAsync(data,'');
  if(roundtrip.animations.length!==3||roundtrip.animations.some(clip=>!clip.tracks.length||!clip.validate()))throw new Error(`${kind}: missing or invalid exported animation`);
  const reloadedBounds=new Box3().setFromObject(roundtrip.scene,true);
  if(reloadedBounds.min.distanceTo(bounds.min)>.001||reloadedBounds.max.distanceTo(bounds.max)>.001)throw new Error(`${kind}: export changed model bounds`);
  for(const clip of roundtrip.animations){
    const reaction=clip.name.split('-').at(-1);
    for(const time of [.4,1.2,2.5,4.3]){
      const mixer=new AnimationMixer(roundtrip.scene),action=mixer.clipAction(clip);
      action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(time);
      animator.sample(reaction,time);
      const originalPose=new Box3().setFromObject(model,true),exportedPose=new Box3().setFromObject(roundtrip.scene,true);
      if(originalPose.min.distanceTo(exportedPose.min)>.002||originalPose.max.distanceTo(exportedPose.max)>.002)throw new Error(`${kind}: ${reaction} export pose differs at ${time}s`);
      mixer.stopAllAction();mixer.uncacheRoot(roundtrip.scene);animator.reset();
    }
  }
  const filename=`${kind}-rat.glb`;
  await writeFile(resolve(output,filename),buffer);
  const gameAssets=resolve(here,'../../../src/assets/cameos');
  await mkdir(gameAssets,{recursive:true});await writeFile(resolve(gameAssets,filename),buffer);
  manifest.models.push({kind,filename,bytes:buffer.length,meshes,triangles,size:size.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},gltfMeshes:gltf.meshes.length,roundtripBoundsVerified:true,roundtripAnimationPosesVerified:true,animations:roundtrip.animations.map(clip=>({name:clip.name,duration:clip.duration,tracks:clip.tracks.length}))});
}
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const previewOutput=resolve(here,'../../../output/cameo-model-review');
await build({configFile:false,root:resolve(here,'..'),publicDir:false,logLevel:'warn',
  build:{outDir:previewOutput,emptyOutDir:false,rollupOptions:{input:resolve(here,'../cameo-preview.html')}}});
await cp(output,resolve(previewOutput,'cameos/exports'),{recursive:true});
console.log(JSON.stringify(manifest,null,2));
