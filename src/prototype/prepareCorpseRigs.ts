import * as THREE from 'three';
import {CorpseRigPool} from './CorpseRigPool';
import {yieldToPage} from '../session/yieldToPage';

/** Prepare all three authored hat shapes within a fixed reserve. Yield between
 * creations so the title remains usable. No participants or bodies are added. */
export async function prepareCorpseRigs(pool:CorpseRigPool,renderer:THREE.WebGLRenderer,scene:THREE.Scene,signal:AbortSignal):Promise<void>{
    for(const hatType of ['fedora','trilby','porkpie'] as const)for(let count=1;count<=pool.capacity;count++){
        await yieldToPage(signal);
        pool.prewarm({hatType,hatColor:0x605050,coatColor:0x333344,furColor:0x999999},count);
    }
    const group=new THREE.Group();group.name='corpse-resource-preparation';
    for(const rig of pool.preparedRigs()){rig.mesh.visible=true;group.add(rig.mesh);}
    scene.add(group);
    const camera=new THREE.PerspectiveCamera(60,1,.1,20);camera.position.set(0,2,5);camera.lookAt(0,1,0);
    const target=new THREE.WebGLRenderTarget(1,1),previous=renderer.getRenderTarget();
    try{
        await renderer.compileAsync(scene,camera);await yieldToPage(signal);
        // A real draw prepares buffers and depth/shadow variants as well as
        // programs. The tiny offscreen target cannot flash over the title.
        renderer.setRenderTarget(target);renderer.render(scene,camera);
    }finally{
        renderer.setRenderTarget(previous);target.dispose();group.removeFromParent();
        for(const rig of pool.preparedRigs()){rig.mesh.removeFromParent();rig.mesh.visible=false;}
    }
}
