/// <reference types="vite/client" />
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import spiderAsset from '../assets/cameos/spider-rat.glb?url';
import batAsset from '../assets/cameos/bat-rat.glb?url';
import {CameoView} from './CameoView';
import type {CameoKind} from './cameoLayout';
import {disposeMeshResources} from '../utils/disposeMeshResources';

/** Start beside city preparation. Missing cosmetic assets never reject entry. */
export async function loadCameos(signal?:AbortSignal):Promise<CameoView|undefined>{
    const abort=new AbortController(),cancel=()=>abort.abort();
    if(signal?.aborted)return;
    signal?.addEventListener('abort',cancel,{once:true});
    const timeout=setTimeout(cancel,8000);
    const models=new Map<CameoKind,THREE.Group>();
    try{
        await Promise.all(([['spider',spiderAsset],['bat',batAsset]] as const).map(async([kind,url])=>{
            try{
                const response=await fetch(url,{signal:abort.signal});
                if(!response.ok)throw new Error(`HTTP ${response.status}`);
                const asset=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
                if(abort.signal.aborted){disposeMeshResources(asset.scene);return;}
                models.set(kind,asset.scene);
            }catch(error){if(!abort.signal.aborted)console.warn(`Could not load ${kind} cameo`,error);}
        }));
        if(signal?.aborted){for(const model of models.values())disposeMeshResources(model);return;}
        return models.size?new CameoView(models):undefined;
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}

/** Upload the two tiny models offscreen during title preparation using world lighting. */
export function warmCameoBuffers(view:CameoView,scene:THREE.Scene,renderer:THREE.WebGLRenderer){
    const target=new THREE.WebGLRenderTarget(1,1),camera=new THREE.PerspectiveCamera(45,1,.1,20);
    const previousTarget=renderer.getRenderTarget(),autoUpdate=renderer.shadowMap.autoUpdate;
    const visible=new Map<THREE.Object3D,boolean>();
    for(const object of scene.children){visible.set(object,object.visible);if(object!==view.root&&!(object instanceof THREE.Light))object.visible=false;}
    const models=view.root.children;
    const modelVisibility=models.map(model=>model.visible);
    try{
        renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(target);
        for(const model of models){
            for(const other of models)other.visible=other===model;
            camera.position.copy(model.position).add(new THREE.Vector3(0,1.3,5));
            camera.lookAt(model.position.x,model.position.y+1,model.position.z);
            renderer.render(scene,camera);
        }
    }finally{
        models.forEach((model,i)=>model.visible=modelVisibility[i]);
        for(const [object,value] of visible)object.visible=value;
        renderer.setRenderTarget(previousTarget);renderer.shadowMap.autoUpdate=autoUpdate;target.dispose();
    }
}
