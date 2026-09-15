import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Mesh,AnimationMixer,LoopOnce} from 'three';
const here=dirname(fileURLToPath(import.meta.url));
const baseline=resolve(process.argv[2]??'output/cameo-before-optimization');
const report={scope:'Node GLTF decode benchmark, not browser FPS or network timing',models:[]};
const arrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
function meshes(root){const list=[];root.traverse(node=>{if(node instanceof Mesh)list.push(node);});return list;}
function stats(asset){
  let vertices=0,geometryBytes=0;
  for(const mesh of meshes(asset.scene)){
    vertices+=mesh.geometry.attributes.position.count;
    for(const attribute of Object.values(mesh.geometry.attributes))geometryBytes+=attribute.array.byteLength;
    geometryBytes+=mesh.geometry.index?.array.byteLength??0;
  }
  return {vertices,geometryBytes,keyframes:asset.animations.reduce((sum,clip)=>sum+clip.tracks.reduce((n,track)=>n+track.times.length,0),0)};
}
function dispose(asset){const materials=new Set();for(const mesh of meshes(asset.scene)){mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);}materials.forEach(m=>m.dispose());}
function poses(root){const values=[];root.traverse(node=>{node.position.toArray(values,values.length);node.quaternion.toArray(values,values.length);node.scale.toArray(values,values.length);});return values;}
async function benchmark(buffer){
  const times=[];
  for(let i=0;i<10;i++){
    const start=performance.now(),asset=await new GLTFLoader().parseAsync(arrayBuffer(buffer),'');
    const elapsed=performance.now()-start;if(i)times.push(elapsed);dispose(asset);
  }
  times.sort((a,b)=>a-b);return {medianMs:times[4],maxMs:times[8],runs:9};
}
for(const kind of ['spider','bat']){
  const beforeBuffer=await readFile(resolve(baseline,`${kind}-rat.glb`));
  const afterBuffer=await readFile(resolve(here,'exports',`${kind}-rat.glb`));
  const before=await new GLTFLoader().parseAsync(arrayBuffer(beforeBuffer),'');
  const after=await new GLTFLoader().parseAsync(arrayBuffer(afterBuffer),'');
  const oldMeshes=meshes(before.scene),newMeshes=meshes(after.scene);
  assert.equal(newMeshes.length,oldMeshes.length);
  // Expanded triangle streams must be identical, including normals and material colors.
  oldMeshes.forEach((oldMesh,m)=>{
    const newMesh=newMeshes[m];assert.equal(newMesh.name,oldMesh.name);
    assert.deepEqual(newMesh.material.color.toArray(),oldMesh.material.color.toArray());
    assert.equal(newMesh.material.roughness,oldMesh.material.roughness);
    assert.equal(newMesh.material.side,oldMesh.material.side);
    const oldCount=oldMesh.geometry.index?.count??oldMesh.geometry.attributes.position.count;
    const newCount=newMesh.geometry.index?.count??newMesh.geometry.attributes.position.count;
    assert.equal(newCount,oldCount);
    for(const name of ['position','normal']){
      const a=oldMesh.geometry.attributes[name],b=newMesh.geometry.attributes[name];
      for(let i=0;i<oldCount;i++){
        const ai=oldMesh.geometry.index?.getX(i)??i,bi=newMesh.geometry.index?.getX(i)??i;
        for(let c=0;c<a.itemSize;c++)assert.ok(b.array[bi*b.itemSize+c]===a.array[ai*a.itemSize+c],`${kind}/${m}/${name}/${i}/${c}`);
      }
    }
  });
  for(let i=0;i<3;i++){
    const a=new AnimationMixer(before.scene),b=new AnimationMixer(after.scene);
    for(const [mixer,clip] of [[a,before.animations[i]],[b,after.animations[i]]]){const action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();}
    for(let frame=0;frame<=480;frame++){
      const time=before.animations[i].duration*frame/480;a.setTime(time);b.setTime(time);
      const oldPose=poses(before.scene),newPose=poses(after.scene);assert.equal(oldPose.length,newPose.length);
      assert.ok(oldPose.every((value,j)=>Math.abs(value-newPose[j])<1e-6),`${kind} clip ${i} pose ${time}`);
    }
    a.stopAllAction();b.stopAllAction();a.uncacheRoot(before.scene);b.uncacheRoot(after.scene);
  }
  const oldStats=stats(before),newStats=stats(after);
  assert.ok(afterBuffer.length<beforeBuffer.length*.7);
  assert.ok(newStats.geometryBytes<oldStats.geometryBytes*.7);
  report.models.push({kind,before:{bytes:beforeBuffer.length,...oldStats,decode:await benchmark(beforeBuffer)},after:{bytes:afterBuffer.length,...newStats,decode:await benchmark(afterBuffer)},identicalTriangleStreams:true,animationPosesCompared:1443});
  dispose(before);dispose(after);
}
await mkdir(resolve(here,'../../../output/cameo-model-review'),{recursive:true});
await writeFile(resolve(here,'../../../output/cameo-model-review/optimization-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
