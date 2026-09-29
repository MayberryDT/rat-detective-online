import * as THREE from 'three';
import {yieldToPage} from './yieldToPage';
import {ACTOR_SPOTS} from '../prototype/StreetLightPool';
import {SEWER_LAMPS} from '../prototype/Neighborhood';

interface WarmProgram {program:object;isReady():boolean;getUniforms():unknown}
function warmProgram(state:unknown):WarmProgram|undefined {
    if(typeof state!=='object'||state===null||!('currentProgram' in state))return;
    const program=state.currentProgram;
    if(typeof program!=='object'||program===null||!('isReady' in program)||!('getUniforms' in program))return;
    const {isReady,getUniforms}=program;
    if(typeof isReady!=='function'||typeof getUniforms!=='function')return;
    return {program,isReady:()=>isReady.call(program)===true,getUniforms:()=>getUniforms.call(program)};
}

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

/** Compile every program the scene needs before Enter, without one long stall.
 * Hidden parts of the `reveal` stand-ins (muzzle flash, glow shells) are compiled too, and
 * with `lamps` lit as well (sewer lamps hidden above ground), so the first trip underground
 * does not recompile the city. Every variant is queued first and the GPU works through all
 * of them before any program is queried. With KHR_parallel_shader_compile we then only
 * poll; without it, each link wait is forced separately between yields so the title keeps
 * painting while the name is typed. */
export async function warmPrograms(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,signal:AbortSignal,reveal:readonly THREE.Object3D[],lamps:readonly THREE.Light[]=[]):Promise<void> {
    const hidden:THREE.Object3D[]=[];
    for(const root of reveal)root.traverse(object=>{if(!object.visible){hidden.push(object);object.visible=true;}});
    const programs=new Map<object,WarmProgram>();
    const collect=(materials:Iterable<THREE.Material>)=>{
        for(const material of materials){const program=warmProgram(renderer.properties.get(material));if(program)programs.set(program.program,program);}
    };
    try {
        for(const lit of lamps.length?[false,true]:[false]){
            for(const lamp of lamps)lamp.visible=lit;
            // Stand-ins first, one per turn (the first metallic one also builds
            // the reflection map, the longest single step), then the city at once:
            // each compile call walks the whole scene for lights.
            for(const root of reveal){await yieldToPage(signal);collect(renderer.compile(root,camera,scene));}
            await yieldToPage(signal);
            collect(renderer.compile(scene,camera));
        }
    } finally {for(const object of hidden)object.visible=false;for(const lamp of lamps)lamp.visible=false;}
    await gpuDrained(renderer,signal);
    const parallel=renderer.extensions.has('KHR_parallel_shader_compile');
    let slice=performance.now();
    for(const program of programs.values()){
        if(parallel)while(!program.isReady())await yieldToPage(signal);
        program.getUniforms();
        if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
    }
}
