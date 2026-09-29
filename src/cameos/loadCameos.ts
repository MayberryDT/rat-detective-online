/// <reference types="vite/client" />
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
// Gzipped: Cloudflare serves .glb uncompressed, and these two are 870 KB raw, 281 KB gzipped.
import spiderAsset from '../assets/cameos/spider-rat.glb.gz?url';
import batAsset from '../assets/cameos/bat-rat.glb.gz?url';
import {CameoView} from './CameoView';
import type {CameoKind} from './cameoLayout';
import {disposeMeshResources} from '../utils/disposeMeshResources';

/** A cameo model's GLB bytes: the gzipped asset unpacked by the browser's own decoder, or passed through
 * when a server already decoded it (sent `Content-Encoding: gzip`). */
export async function readCameoAsset(response:Response):Promise<ArrayBuffer>{
    const bytes=await response.arrayBuffer(),head=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
    if(head[0]!==0x1f||head[1]!==0x8b)return bytes;
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

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
                const asset=await new GLTFLoader().parseAsync(await readCameoAsset(response),'');
                if(abort.signal.aborted){disposeMeshResources(asset.scene);return;}
                models.set(kind,asset.scene);
            }catch(error){if(!abort.signal.aborted)console.warn(`Could not load ${kind} cameo`,error);}
        }));
        if(signal?.aborted){for(const model of models.values())disposeMeshResources(model);return;}
        return models.size?new CameoView(models):undefined;
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}

/** Upload the two tiny models during title preparation using world lighting. This draws to the
 * canvas hidden under the title: an offscreen target would compile untone-mapped variants
 * (seconds of linking on some GPUs) that the city never uses, then the real ones in play. */
export function warmCameoBuffers(view:CameoView,scene:THREE.Scene,renderer:THREE.WebGLRenderer){
    const camera=new THREE.PerspectiveCamera(45,1,.1,20);
    const previousTarget=renderer.getRenderTarget(),autoUpdate=renderer.shadowMap.autoUpdate;
    const visible=new Map<THREE.Object3D,boolean>();
    for(const object of scene.children){visible.set(object,object.visible);if(object!==view.root&&!(object instanceof THREE.Light))object.visible=false;}
    const models=view.root.children;
    const modelVisibility=models.map(model=>model.visible);
    try{
        renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(null);
        for(const model of models){
            for(const other of models)other.visible=other===model;
            camera.position.copy(model.position).add(new THREE.Vector3(0,1.3,5));
            camera.lookAt(model.position.x,model.position.y+1,model.position.z);
            renderer.render(scene,camera);
        }
    }finally{
        models.forEach((model,i)=>model.visible=modelVisibility[i]);
        for(const [object,value] of visible)object.visible=value;
        renderer.setRenderTarget(previousTarget);renderer.shadowMap.autoUpdate=autoUpdate;
    }
}
