import * as THREE from 'three';
import {ratSpineWeights} from './RatModel';
import {useShadowDepthForm} from './shadowDepthForms';

/** How a deforming mesh (a rat's tail) reaches the current pose. Whoever draws it calls this
 * first: the renderer through the hooks of the mesh and the parts riding it, or the rigid batch. */
const deformers=new WeakMap<THREE.Object3D,()=>void>();
export function setDeformer(mesh:THREE.Mesh,deform:()=>void):void {
    deformers.set(mesh,deform);
    mesh.traverse(part=>{part.onBeforeRender=part.onBeforeShadow=deform;});
}

function batchable(object:THREE.Object3D):object is THREE.Mesh {
    return object instanceof THREE.Mesh&&!(object instanceof THREE.SkinnedMesh)&&!(object instanceof THREE.InstancedMesh)&&object.visible&&!Array.isArray(object.material);
}

/** A rig's leaves in one skinned draw: each bone follows its original leaf (then the spine
 * joints, then the tail). The deforming tail's vertices come last, rewritten when it moves. */
export class RigidBatch extends THREE.SkinnedMesh {
    /** Brings the tail's vertices up to the current pose; called before every draw. */
    readonly showPose:()=>void;
    constructor(geometry:THREE.BufferGeometry,material:THREE.Material|THREE.Material[],
        private readonly follow:readonly THREE.Object3D[],
        /** Indices before the tail's: a draw range over them leaves the tail out. */
        readonly rigidIndexCount:number,showPose:()=>void){
        super(geometry,material);this.showPose=showPose;
    }
    override updateMatrixWorld(force?:boolean):void {
        super.updateMatrixWorld(force);
        // Original leaves precede this appended batch in root traversal.
        const bones=this.skeleton.bones;
        for(let i=0;i<this.follow.length;i++)bones[i]!.matrixWorld.copy(this.follow[i]!.matrixWorld);
    }
}

/** Draw a rig's leaves together while retaining the original animated/pickable
 * hierarchy. Transient effects remain ordinary meshes. A rat's coat and tailoring
 * (direct `rat-body` meshes) are skinned across its soft spine (body, belly, chest) so a
 * corpse bends smoothly; its tail (and tip) ride one bone with vertices copied from the
 * deformed tail; every other leaf is rigid. */
/** Merged geometry by share key (supply props: every site of a kind has the same parts). Rigid leaves keep their own
 * local space, so the geometry does not depend on where the rig stands. A rig's dispose may release the shared
 * buffers; the next draw simply uploads them again (as the props' shared part shapes). */
const SHARED=new Map<string,{geometry:THREE.BufferGeometry;vertexCount:number;indexCount:number;rigidIndexCount:number}>();
export function batchRigidMeshes(root:THREE.Group,share?:string):RigidBatch|undefined {
    const sources:THREE.Mesh[]=[];
    root.traverse(object=>{
        if(!batchable(object)||object.children.length)return;
        for(let parent:THREE.Object3D|null=object;parent&&parent!==root;parent=parent.parent){
            if(parent.name==='rat-tail'||parent.name==='rat-muzzle'||!parent.visible)return;
        }
        sources.push(object);
    });
    const tail=root.getObjectByName('rat-tail'),tip=tail?.children[0];
    const deforming=tail&&batchable(tail)&&tail.children.length===1&&tip&&batchable(tip)&&!tip.children.length?[tail,tip]:[];
    if(sources.length+deforming.length<2)return;
    const materials=[...new Set([...sources,...deforming].map(s=>s.material as THREE.Material))];
    sources.sort((a,b)=>materials.indexOf(a.material as THREE.Material)-materials.indexOf(b.material as THREE.Material));
    const parts=[...sources,...deforming];
    // Sized up front and written in place: a corpse is batched on every death, mid-fight.
    let vertexCount=0,indexCount=0;
    for(const {geometry} of parts){const count=geometry.getAttribute('position').count;vertexCount+=count;indexCount+=geometry.index?.count??count;}
    const cached=share!==undefined&&!deforming.length?SHARED.get(share):undefined;
    const reuse=cached&&cached.vertexCount===vertexCount&&cached.indexCount===indexCount?cached:undefined,size=reuse?0:vertexCount;
    const positions=new Float32Array(size*3),normals=new Float32Array(size*3),uvs=new Float32Array(size*2),materialIndices=new Float32Array(size);
    const skinIndices=new Uint16Array(size*4),weights=new Float32Array(size*4);
    // The largest index is vertexCount-1: the type an index array would have picked.
    const indices=size>65535?new Uint32Array(reuse?0:indexCount):new Uint16Array(reuse?0:indexCount);
    const geometry=reuse?.geometry??new THREE.BufferGeometry();let vertexOffset=0,indexOffset=0,rigidIndexCount=reuse?.rigidIndexCount??0,tailStart=0;
    const body=root.getObjectByName('rat-body'),belly=body?.getObjectByName('rat-spine-belly'),chest=body?.getObjectByName('rat-spine-chest');
    const spine=body&&belly&&chest?[body,belly,chest]:[];
    // Spine bones follow the leaf bones; at rest each spine joint is identity in body space.
    const spineBone=sources.length,tailBone=spineBone+spine.length;
    const follow=[...sources,...spine,...deforming.slice(0,1)],bones=follow.map(()=>new THREE.Bone());
    const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
    if(!reuse)parts.forEach((source,bone)=>{
        const g=source.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
        const start=indexOffset,skinned=spine.length>0&&source.parent===body,materialIndex=materials.indexOf(source.material as THREE.Material);
        // Skinned leaves are baked into body space and blended by height; the tip into tail space.
        const baked=skinned||source===tip&&deforming.length>0;
        if(source===tail)tailStart=vertexOffset;
        if(baked){source.updateMatrix();normalMatrix.getNormalMatrix(source.matrix);}
        for(let i=0;i<p.count;i++){
            const v=vertexOffset+i;
            point.fromBufferAttribute(p,i);normal.set(n?.getX(i)??0,n?.getY(i)??0,n?.getZ(i)??1);
            if(baked){point.applyMatrix4(source.matrix);normal.applyMatrix3(normalMatrix).normalize();}
            if(skinned){
                const w=ratSpineWeights(point.y);
                skinIndices[v*4]=spineBone;skinIndices[v*4+1]=spineBone+1;skinIndices[v*4+2]=spineBone+2;
                weights[v*4]=1-w.belly-w.chest;weights[v*4+1]=w.belly;weights[v*4+2]=w.chest;
            }else{skinIndices[v*4]=bone<sources.length?bone:tailBone;weights[v*4]=1;}
            positions[v*3]=point.x;positions[v*3+1]=point.y;positions[v*3+2]=point.z;
            normals[v*3]=normal.x;normals[v*3+1]=normal.y;normals[v*3+2]=normal.z;
            uvs[v*2]=uv?.getX(i)??0;uvs[v*2+1]=uv?.getY(i)??0;materialIndices[v]=materialIndex;
        }
        const count=g.index?.count??p.count;
        for(let i=0;i<count;i++)indices[indexOffset+i]=vertexOffset+(g.index?.getX(i)??i);
        const last=geometry.groups[geometry.groups.length-1];
        if(last?.materialIndex===materialIndex)last.count+=count;else geometry.addGroup(start,count,materialIndex);
        vertexOffset+=p.count;indexOffset+=count;
        if(bone===sources.length-1)rigidIndexCount=indexOffset;
    });
    const positionAttribute=new THREE.BufferAttribute(positions,3),normalAttribute=new THREE.BufferAttribute(normals,3);
    if(!reuse){
        geometry.setAttribute('position',positionAttribute);
        geometry.setAttribute('normal',normalAttribute);
        geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
        geometry.setAttribute('ratMaterial',new THREE.BufferAttribute(materialIndices,1));
        geometry.setAttribute('skinIndex',new THREE.BufferAttribute(skinIndices,4));
        geometry.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));geometry.setIndex(new THREE.BufferAttribute(indices,1));
        if(share!==undefined&&!deforming.length)SHARED.set(share,{geometry,vertexCount,indexCount,rigidIndexCount});
    }
    // The tail's vertices follow its deformed geometry (and the tip its offset), copied only when they changed.
    let showPose=()=>{};
    if(tail instanceof THREE.Mesh&&tip instanceof THREE.Mesh&&deforming.length){
        const tailPositions=tail.geometry.getAttribute('position'),tailNormals=tail.geometry.getAttribute('normal');
        const tipPositions=tip.geometry.getAttribute('position'),tailCount=tailPositions.count,count=tailCount+tipPositions.count;
        let positionVersion=tailPositions.version,normalVersion=tailNormals.version;
        showPose=()=>{
            deformers.get(tail)?.();
            if(tailNormals.version!==normalVersion){
                normalVersion=tailNormals.version;normals.set(tailNormals.array,tailStart*3);
                normalAttribute.addUpdateRange(tailStart*3,tailCount*3);normalAttribute.needsUpdate=true;
            }
            if(tailPositions.version===positionVersion)return;
            positionVersion=tailPositions.version;positions.set(tailPositions.array,tailStart*3);
            tip.updateMatrix();
            for(let i=0,v=(tailStart+tailCount)*3;i<tipPositions.count;i++,v+=3){
                point.fromBufferAttribute(tipPositions,i).applyMatrix4(tip.matrix);positions[v]=point.x;positions[v+1]=point.y;positions[v+2]=point.z;
            }
            positionAttribute.addUpdateRange(tailStart*3,count*3);positionAttribute.needsUpdate=true;
        };
    }
    // The model uses opaque untextured standard materials. A small palette
    // retains their exact per-part PBR parameters in one draw, including flashes.
    let drawMaterial:THREE.Material|THREE.Material[]=materials.length===1?materials[0]:materials;
    let syncPalette=()=>{};
    if(materials.length>1&&materials.length<=16&&materials.every(m=>m instanceof THREE.MeshStandardMaterial&&!m.map&&!m.normalMap&&!m.roughnessMap&&!m.metalnessMap&&!m.transparent)){
        const originals=materials as THREE.MeshStandardMaterial[];
        const palette=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,roughness:1,metalness:0,fog:originals[0].fog});
        const colors=Array.from({length:16},(_,i)=>originals[i]?.color??new THREE.Color());
        const emissives=Array.from({length:16},(_,i)=>originals[i]?.emissive??new THREE.Color());
        const intensity=new Float32Array(16),roughness=new Float32Array(16),metalness=new Float32Array(16);
        syncPalette=()=>{
            for(let i=0;i<originals.length;i++){const m=originals[i]!;intensity[i]=m.emissiveIntensity;roughness[i]=m.roughness;metalness[i]=m.metalness;}
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
                // Rigid leaves weigh (1,0,0,0), so this is exactly their own bone.
                mat4 skinMatrix=bindMatrixInverse*(skinWeight.x*boneMatX+skinWeight.y*boneMatY+skinWeight.z*boneMatZ+skinWeight.w*boneMatW)*bindMatrix;
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
        material.customProgramCacheKey=()=>key.call(material)+':rigid-normal-v2';
        material.needsUpdate=true;
    }
    const skeleton=new THREE.Skeleton(bones,bones.map(()=>new THREE.Matrix4()));
    const batch=new RigidBatch(geometry,drawMaterial,follow,deforming.length?rigidIndexCount:indexCount,showPose);
    batch.name='rat-rigid-batch';
    // Conservative local bound for the approved procedural rig, including its
    // largest death/respawn stretch. Verified against animated vertices.
    batch.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),4);
    batch.castShadow=sources[0]?.castShadow??deforming[0]!.castShadow;batch.receiveShadow=sources[0]?.receiveShadow??deforming[0]!.receiveShadow;
    batch.bind(skeleton,new THREE.Matrix4());useShadowDepthForm(batch);
    // Picking keeps original object identity, transforms and exact geometry.
    batch.raycast=()=>{};
    // Shadow maps draw before the camera pass: whichever comes first brings the tail up to date.
    batch.onBeforeShadow=showPose;batch.onBeforeRender=()=>{syncPalette();showPose();};
    batch.userData.rigidSources=parts;
    parts.forEach(source=>{source.visible=false;source.userData.rigidBatchSource=true;});
    root.add(batch);return batch;
}
