/// <reference types="node" />
import {afterEach,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {loadCameos,warmCameoBuffers} from '../../src/cameos/loadCameos';
import {CameoView} from '../../src/cameos/CameoView';
const fetchOriginal=globalThis.fetch;
afterEach(()=>{globalThis.fetch=fetchOriginal;vi.restoreAllMocks();});
it('loads both packed assets and keeps their accepted rig without procedural construction',async()=>{
    globalThis.fetch=vi.fn(async(input)=>{
        const kind=String(input).includes('spider')?'spider':'bat';
        const data=await readFile(`src/assets/cameos/${kind}-rat.glb`);
        return new Response(data);
    });
    const view=await loadCameos();expect(view?.root.children).toHaveLength(2);
    expect(view?.root.getObjectByName('scalloped-cape')).toBeDefined();
    expect(view?.root.getObjectByName('cameo-forearm-right')).toBeDefined();
    view?.dispose();
});
it('treats missing optional assets as nonfatal and skips already-aborted loads',async()=>{
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    globalThis.fetch=vi.fn(async()=>new Response('',{status:404}));
    expect(await loadCameos()).toBeUndefined();
    const abort=new AbortController();abort.abort();
    const before=vi.mocked(fetch).mock.calls.length;expect(await loadCameos(abort.signal)).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls.length).toBe(before);
});
it('cancels pending optional asset requests when the page closes',async()=>{
    const abort=new AbortController();
    globalThis.fetch=vi.fn((_input,init)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Closed','AbortError')))));
    const loading=loadCameos(abort.signal);abort.abort();expect(await loading).toBeUndefined();
});
it('restores world visibility and render state even if offscreen upload fails',()=>{
    const scene=new THREE.Scene(),scenery=new THREE.Group(),lamp=new THREE.PointLight();
    scene.add(scenery,lamp);const view=new CameoView(new Map([['bat',new THREE.Group()]]));scene.add(view.root);
    const target=new THREE.WebGLRenderTarget(2,2);
    const renderer={getRenderTarget:()=>target,setRenderTarget:vi.fn(),shadowMap:{autoUpdate:true},render:vi.fn(()=>{throw new Error('GPU failure');})};
    expect(()=>warmCameoBuffers(view,scene,renderer as unknown as THREE.WebGLRenderer)).toThrow('GPU failure');
    expect(scenery.visible).toBe(true);expect(lamp.visible).toBe(true);expect(view.root.children[0].visible).toBe(false);
    expect(renderer.shadowMap.autoUpdate).toBe(true);expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(target);
    view.dispose();target.dispose();
});
