import * as THREE from 'three';

/** Draw static rig leaves together while retaining the original animated/pickable
 * hierarchy. Deforming tails and transient effects remain ordinary meshes. */
export function batchRigidMeshes(root:THREE.Group):THREE.SkinnedMesh|undefined {
    const sources:THREE.Mesh[]=[];
    root.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||!object.visible||object.children.length||Array.isArray(object.material))return;
        for(let parent:THREE.Object3D|null=object;parent&&parent!==root;parent=parent.parent){
            if(parent.name==='rat-tail'||parent.name==='rat-muzzle'||!parent.visible)return;
        }
        sources.push(object);
    });
    if(sources.length<2)return;
    const materials=[...new Set(sources.map(s=>s.material as THREE.Material))];
    sources.sort((a,b)=>materials.indexOf(a.material as THREE.Material)-materials.indexOf(b.material as THREE.Material));
    const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[],skinIndices:number[]=[],weights:number[]=[],materialIndices:number[]=[];
    const geometry=new THREE.BufferGeometry();let vertexOffset=0;
    const bones=sources.map(()=>new THREE.Bone());
    sources.forEach((source,bone)=>{
        const g=source.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
        const start=indices.length;
        for(let i=0;i<p.count;i++){
            positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n?.getX(i)??0,n?.getY(i)??0,n?.getZ(i)??1);
            uvs.push(uv?.getX(i)??0,uv?.getY(i)??0);skinIndices.push(bone,0,0,0);weights.push(1,0,0,0);materialIndices.push(materials.indexOf(source.material as THREE.Material));
        }
        const count=g.index?.count??p.count;
        for(let i=0;i<count;i++)indices.push(vertexOffset+(g.index?.getX(i)??i));
        const materialIndex=materials.indexOf(source.material as THREE.Material),last=geometry.groups[geometry.groups.length-1];
        if(last?.materialIndex===materialIndex)last.count+=count;else geometry.addGroup(start,count,materialIndex);
        vertexOffset+=p.count;
    });
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setAttribute('ratMaterial',new THREE.Float32BufferAttribute(materialIndices,1));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.setIndex(indices);
    // The model uses opaque untextured standard materials. A small palette
    // retains their exact per-part PBR parameters in one draw, including flashes.
    let drawMaterial:THREE.Material|THREE.Material[]=materials.length===1?materials[0]:materials;
    let syncPalette=()=>{};
    if(materials.length>1&&materials.length<=16&&materials.every(m=>m instanceof THREE.MeshStandardMaterial&&!m.map&&!m.normalMap&&!m.roughnessMap&&!m.metalnessMap&&!m.transparent)){
        const originals=materials as THREE.MeshStandardMaterial[];
        const palette=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,roughness:1,metalness:0});
        const colors=Array.from({length:16},(_,i)=>originals[i]?.color??new THREE.Color());
        const emissives=Array.from({length:16},(_,i)=>originals[i]?.emissive??new THREE.Color());
        const intensity=new Float32Array(16),roughness=new Float32Array(16),metalness=new Float32Array(16);
        syncPalette=()=>{
            originals.forEach((m,i)=>{intensity[i]=m.emissiveIntensity;roughness[i]=m.roughness;metalness[i]=m.metalness;});
            // Whole-rat silver changes the source materials for local and batched
            // remote rigs alike. Reuse the same static reflection texture.
            if(palette.envMap!==originals[0].envMap){palette.envMap=originals[0].envMap;palette.needsUpdate=true;}
            palette.envMapIntensity=originals[0].envMapIntensity;
        };
        syncPalette();
        palette.onBeforeCompile=shader=>{
            Object.assign(shader.uniforms,{ratColors:{value:colors},ratEmissives:{value:emissives},ratIntensity:{value:intensity},ratRoughness:{value:roughness},ratMetalness:{value:metalness}});
            shader.vertexShader='attribute float ratMaterial; varying float vRatMaterial;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRatMaterial=ratMaterial;');
            shader.fragmentShader='varying float vRatMaterial; uniform vec3 ratColors[16]; uniform vec3 ratEmissives[16]; uniform float ratIntensity[16]; uniform float ratRoughness[16]; uniform float ratMetalness[16];\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=ratColors[int(vRatMaterial+0.5)];');
            shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=ratEmissives[int(vRatMaterial+0.5)]*ratIntensity[int(vRatMaterial+0.5)];');
            shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=ratRoughness[int(vRatMaterial+0.5)];');
            shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=ratMetalness[int(vRatMaterial+0.5)];');
        };
        palette.customProgramCacheKey=()=> 'rat-material-palette-v1';
        drawMaterial=palette;geometry.clearGroups();
    }
    for(const material of Array.isArray(drawMaterial)?drawMaterial:[drawMaterial]){
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
        material.onBeforeCompile=function(shader,renderer){
            compile.call(this,shader,renderer);
            shader.vertexShader=shader.vertexShader.replace('#include <skinnormal_vertex>',`
                #ifdef USE_SKINNING
                mat4 skinMatrix=bindMatrixInverse*boneMatX*bindMatrix;
                mat3 rigidMatrix=mat3(skinMatrix);
                vec3 c0=cross(rigidMatrix[1],rigidMatrix[2]);
                vec3 c1=cross(rigidMatrix[2],rigidMatrix[0]);
                vec3 c2=cross(rigidMatrix[0],rigidMatrix[1]);
                objectNormal=mat3(c0,c1,c2)*objectNormal/dot(rigidMatrix[0],c0);
                #ifdef USE_TANGENT
                objectTangent=rigidMatrix*objectTangent;
                #endif
                #endif
            `);
        };
        material.customProgramCacheKey=()=>key.call(material)+':rigid-normal-v1';
        material.needsUpdate=true;
    }
    const skeleton=new THREE.Skeleton(bones,bones.map(()=>new THREE.Matrix4()));
    class RigidBatch extends THREE.SkinnedMesh {
        override updateMatrixWorld(force?:boolean):void {
            super.updateMatrixWorld(force);
            // Original leaves precede this appended batch in root traversal.
            sources.forEach((source,i)=>bones[i].matrixWorld.copy(source.matrixWorld));
        }
    }
    const batch=new RigidBatch(geometry,drawMaterial);
    batch.name='rat-rigid-batch';
    // Conservative local bound for the approved procedural rig, including its
    // largest death/respawn stretch. Verified against animated vertices.
    batch.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),4);
    batch.castShadow=sources[0].castShadow;batch.receiveShadow=sources[0].receiveShadow;
    batch.bind(skeleton,new THREE.Matrix4());
    // Picking keeps original object identity, transforms and exact geometry.
    batch.raycast=()=>{};batch.onBeforeRender=syncPalette;
    batch.userData.rigidSources=sources;
    sources.forEach(source=>{source.visible=false;source.userData.rigidBatchSource=true;});
    root.add(batch);return batch;
}
