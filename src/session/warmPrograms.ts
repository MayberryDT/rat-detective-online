import * as THREE from 'three';
import {yieldToPage} from './yieldToPage';

interface WarmProgram {isReady():boolean;getUniforms():unknown}
function warmProgram(state:unknown):WarmProgram|undefined {
    if(typeof state!=='object'||state===null||!('currentProgram' in state))return;
    const program=state.currentProgram;
    if(typeof program!=='object'||program===null||!('isReady' in program)||!('getUniforms' in program))return;
    const {isReady,getUniforms}=program;
    if(typeof isReady!=='function'||typeof getUniforms!=='function')return;
    return {isReady:()=>isReady.call(program)===true,getUniforms:()=>getUniforms.call(program)};
}

/** Compile every program the scene needs before Enter, without one long stall.
 * Hidden parts of the `reveal` stand-ins (muzzle flash, glow shells) are compiled too.
 * With KHR_parallel_shader_compile the driver links off-thread and we only
 * poll; without it, each link wait is forced separately between yields so
 * the title keeps painting while the name is typed. */
export async function warmPrograms(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,signal:AbortSignal,reveal:readonly THREE.Object3D[]):Promise<void> {
    const hidden:THREE.Object3D[]=[];
    for(const root of reveal)root.traverse(object=>{if(!object.visible){hidden.push(object);object.visible=true;}});
    const materials=new Set<THREE.Material>();
    try {
        // Stand-ins first, one per turn (the first metallic one also builds
        // the reflection map, the longest single step), then the city at once:
        // each compile call walks the whole scene for lights.
        for(const root of reveal){
            await yieldToPage(signal);
            for(const material of renderer.compile(root,camera,scene))materials.add(material);
        }
        await yieldToPage(signal);
        for(const material of renderer.compile(scene,camera))materials.add(material);
    } finally {for(const object of hidden)object.visible=false;}
    const parallel=renderer.extensions.has('KHR_parallel_shader_compile');
    let slice=performance.now();
    for(const material of materials){
        const program=warmProgram(renderer.properties.get(material));
        if(!program)continue;
        if(parallel)while(!program.isReady())await yieldToPage(signal);
        program.getUniforms();
        if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
    }
}
