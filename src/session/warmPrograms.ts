import * as THREE from 'three';
import {yieldToPage} from './yieldToPage';
import {ACTOR_SPOTS} from '../prototype/StreetLightPool';
import {SEWER_LAMPS} from '../prototype/Neighborhood';
import {isShadowDepthForm} from '../utils/shadowDepthForms';

/** Issue the stand-ins' programs, without waiting on them, lit as the finished city will be:
 * the stage lights plus the city's actor spots, then with its sewer lamps as well. The driver
 * links them while the city builds; warmPrograms later finds them ready under the same keys. */
export async function issuePrograms(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,signal:AbortSignal,reveal:readonly THREE.Object3D[]):Promise<void> {
    const spots=Array.from({length:ACTOR_SPOTS},()=>new THREE.SpotLight()),lamps=Array.from({length:SEWER_LAMPS},()=>new THREE.PointLight());
    const hidden:THREE.Object3D[]=[];
    for(const root of reveal)root.traverse(object=>{if(!object.visible){hidden.push(object);object.visible=true;}});
    try {
        scene.add(...spots);
        for(const root of reveal){await yieldToPage(signal);renderer.compile(root,camera,scene);}
        scene.add(...lamps);
        for(const root of reveal){await yieldToPage(signal);renderer.compile(root,camera,scene);}
    } finally {scene.remove(...spots,...lamps);for(const object of hidden)object.visible=false;}
    renderer.getContext().flush();
}

/** Wait, without blocking, until the GPU has worked through every queued command. Any synchronous
 * query (a program's uniforms, its log) otherwise waits behind all the links queued before it:
 * seconds of frozen title on some GPUs, even when the driver says each link is complete. */
export async function gpuDrained(renderer:THREE.WebGLRenderer,signal?:AbortSignal):Promise<void> {
    const gl=renderer.getContext();
    if(typeof WebGL2RenderingContext==='undefined'||!(gl instanceof WebGL2RenderingContext))return;
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!fence)return;
    gl.flush();
    try{while(!gl.isContextLost()&&gl.getSyncParameter(fence,gl.SYNC_STATUS)!==gl.SIGNALED)await yieldToPage(signal);}
    finally{gl.deleteSync(fence);}
}

/** Three.js leaves a program's readiness poll (KHR_parallel_shader_compile) out of its types. Only an
 * explicit `false` is still linking: a released program or a lost context answers null, never true. */
function linking(program:THREE.WebGLProgram):boolean {
    const poll:unknown=Reflect.get(program,'isReady');
    return typeof poll==='function'&&poll.call(program)===false;
}

/** Finish the first use of every program the renderer holds, between yields. Three.js first uses a
 * program by reading its link logs and uniforms: synchronous round trips to the GPU process that
 * otherwise land on the frame that first draws it, mid-play, behind a frame of queued work (tens of
 * ms, more where ANGLE finishes links lazily). Waits for the GPU first (see `gpuDrained`). With
 * KHR_parallel_shader_compile we then only poll; without it, each link wait is forced separately
 * between yields so the page keeps painting. */
export async function checkPrograms(renderer:THREE.WebGLRenderer,signal?:AbortSignal):Promise<void> {
    await gpuDrained(renderer,signal);
    const parallel=renderer.extensions.has('KHR_parallel_shader_compile');
    const held=(program:THREE.WebGLProgram)=>renderer.info.programs?.includes(program)===true;
    let slice=performance.now();
    for(const program of [...renderer.info.programs??[]]){
        while(parallel&&held(program)&&linking(program))await yieldToPage(signal);
        // Released while we waited: its GL program is gone.
        if(!held(program))continue;
        program.getUniforms();
        if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
    }
}

/** Compile every program the scene needs before Enter, without one long stall.
 * Hidden parts of the `reveal` stand-ins (muzzle flash, glow shells) are compiled too, and
 * with `lamps` lit as well (sewer lamps hidden above ground), so the first trip underground
 * does not recompile the city. `shadows` (see `shadowCasterProbes`) are compiled as shadow maps
 * are drawn: into a render target. Every variant is queued first and the GPU works through all
 * of them before any program is queried (`checkPrograms`). */
export async function warmPrograms(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,signal:AbortSignal,reveal:readonly THREE.Object3D[],lamps:readonly THREE.Light[]=[],shadows?:THREE.Object3D):Promise<void> {
    const hidden:THREE.Object3D[]=[];
    for(const root of reveal)root.traverse(object=>{if(!object.visible){hidden.push(object);object.visible=true;}});
    const target=shadows&&new THREE.WebGLRenderTarget(1,1),screen=renderer.getRenderTarget();
    try {
        for(const lit of lamps.length?[false,true]:[false]){
            for(const lamp of lamps)lamp.visible=lit;
            // Stand-ins first, one per turn (the first metallic one also builds
            // the reflection map, the longest single step), then the city at once:
            // each compile call walks the whole scene for lights.
            for(const root of reveal){await yieldToPage(signal);renderer.compile(root,camera,scene);}
            await yieldToPage(signal);
            renderer.compile(scene,camera);
            if(target&&shadows){
                // Shadow maps are drawn into a render target with no scene, so no fog.
                const fog=scene.fog;scene.fog=null;renderer.setRenderTarget(target);
                try {renderer.compile(shadows,camera,scene);} finally {renderer.setRenderTarget(screen);scene.fog=fog;}
            }
        }
    } finally {for(const object of hidden)object.visible=false;for(const lamp of lamps)lamp.visible=false;renderer.setRenderTarget(screen);target?.dispose();}
    await checkPrograms(renderer,signal);
}

const SHADOW_SIDE:Record<THREE.Side,THREE.Side>={[THREE.FrontSide]:THREE.BackSide,[THREE.BackSide]:THREE.FrontSide,[THREE.DoubleSide]:THREE.DoubleSide};
const texture=(material:THREE.Material,key:'map'|'alphaMap'|'displacementMap'):THREE.Texture|null=>{
    const value:unknown=key in material?Reflect.get(material,key):null;
    return value instanceof THREE.Texture?value:null;
};

/** One depth-material stand-in for every kind of shadow caster under `roots`, for `warmPrograms`.
 * three draws casters into shadow maps with one shared depth material (or their form's, see
 * `useShadowDepthForm`, which links the same programs) that takes each caster's texture map and
 * side and its form (plain, instanced, skinned), with the lights of the render before; otherwise
 * those programs link when a caster first enters the flashlight. The stand-ins are never disposed
 * (that would release the programs they link). */
export function shadowCasterProbes(roots:readonly THREE.Object3D[]):THREE.Group {
    const probes=new THREE.Group(),seen=new Set<string>();
    for(const root of roots)root.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||!object.castShadow||object.customDepthMaterial&&!isShadowDepthForm(object.customDepthMaterial))return;
        const geometry=object.geometry,morphs=Object.keys(geometry.morphAttributes).length;
        const form=object instanceof THREE.InstancedMesh?object.instanceColor?'instanced-color':'instanced':object instanceof THREE.SkinnedMesh?'skinned':'plain';
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
            const map=texture(material,'map'),alphaMap=texture(material,'alphaMap'),displacement=texture(material,'displacementMap');
            const own:THREE.Side=material.side,side=material.shadowSide??SHADOW_SIDE[own],wireframe='wireframe' in material&&material.wireframe===true;
            const key=[form,morphs?geometry.uuid:'',map?.channel,alphaMap?.channel,material.alphaTest>0,side,displacement?.channel,wireframe].join(':');
            if(seen.has(key))continue;
            seen.add(key);
            const depth=new THREE.MeshDepthMaterial({side,map,alphaMap,alphaTest:material.alphaTest,displacementMap:displacement,wireframe});
            let probe:THREE.Mesh;
            if(object instanceof THREE.InstancedMesh){
                const instanced=new THREE.InstancedMesh(geometry,depth,1);
                if(object.instanceColor)instanced.setColorAt(0,new THREE.Color());
                probe=instanced;
            }else if(object instanceof THREE.SkinnedMesh){
                const skinned=new THREE.SkinnedMesh(geometry,depth);skinned.bind(object.skeleton,object.bindMatrix);probe=skinned;
            }else probe=new THREE.Mesh(geometry,depth);
            probes.add(probe);
        }
    });
    return probes;
}

