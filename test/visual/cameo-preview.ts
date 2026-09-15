/// <reference types="vite/client" />
import './cameo-preview.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CameoKind } from './cameos/CameoRatModel';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import spiderAsset from './cameos/exports/spider-rat.glb?url';
import batAsset from './cameos/exports/bat-rat.glb?url';
import { CameoAnimator, CAMEO_DURATIONS, CAMEO_REACTIONS, type CameoReaction } from './cameos/CameoAnimator';
import { disposeMeshResources } from '../../src/utils/disposeMeshResources';

// A silent model viewer. Never loads a game session or opens a gameplay socket.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const el = (id: string) => document.getElementById(id)!;
let turning=false, noir=false, disposed=false;
const query=new URLSearchParams(location.search);
let reaction:CameoReaction=query.get('reaction')==='shot'?'shot':query.get('reaction')==='passerby'?'passerby':'idle';
let elapsed=0,paused=reduced.matches,playbackRate=1;
const timeline=el('timeline') as HTMLInputElement;
const selectedView = ['quarter','front','side','rear'].includes(query.get('view')??'')?query.get('view')!:'quarter';
let activeView=selectedView;
const views: Record<string,THREE.Vector3> = {
    quarter:new THREE.Vector3(3.1,1.5,5.6), front:new THREE.Vector3(0,.9,6.1),
    side:new THREE.Vector3(6.1,1.1,0), rear:new THREE.Vector3(-2,1.4,-6),
};
function setup(kind:CameoKind,model:THREE.Group){
    const viewport=el(`${kind}-viewport`);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    viewport.appendChild(renderer.domElement);
    renderer.domElement.style.visibility='hidden';
    const scene=new THREE.Scene();scene.background=new THREE.Color(kind==='spider'?0x29232c:0x222935);
    const camera=new THREE.PerspectiveCamera(34,1,.05,50);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.enablePan=false;controls.minDistance=2;controls.maxDistance=9;
    controls.maxPolarAngle=Math.PI*.51;controls.autoRotateSpeed=.7;
    model.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;}});
    scene.add(model);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:kind==='spider'?0x29232c:0x222935,roughness:1}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.09;floor.receiveShadow=true;scene.add(floor);
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.28,1.33,.08,64),new THREE.MeshStandardMaterial({color:0x363942,roughness:.9}));
    platform.position.set(0,-.045,0);platform.receiveShadow=true;scene.add(platform);
    const ambient=new THREE.HemisphereLight(0xe5e9ff,0x7b6875,1.6);scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffdfb5,3.4);key.position.set(-3,5,5);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-3;key.shadow.camera.right=3;
    key.shadow.camera.top=4;key.shadow.camera.bottom=-3;key.shadow.normalBias=.022;key.shadow.camera.near=.1;key.shadow.camera.far=20;scene.add(key);
    const fill=new THREE.DirectionalLight(0xb3caff,1.7);fill.position.set(4,3,-3);scene.add(fill);
    let triangles=0;
    model.traverse(object=>{if(object instanceof THREE.Mesh)triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;});
    el(`${kind}-stats`).textContent=`${Math.round(triangles).toLocaleString()} triangles`;
    const center=new THREE.Vector3(.05,kind==='spider'?.84:1.1,0);
    const animator=new CameoAnimator(model,kind);
    const observer=new ResizeObserver(()=>{
        const {width,height}=viewport.getBoundingClientRect();
        if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();frame(currentView);}
    });
    let currentView=activeView;
    function frame(view:string){
        currentView=view;controls.target.copy(center);
        const distanceScale=Math.max(.82,.64/camera.aspect)*(kind==='spider'?.91:1);
        camera.position.copy(center).addScaledVector(views[view],distanceScale);controls.update();
    }
    observer.observe(viewport);frame(activeView);
    return {renderer,scene,camera,controls,frame,animator,ambient,key,fill,observer,kind,ready:false,preparing:false,released:false};
}
const subjects: ReturnType<typeof setup>[]=[];
function releaseSubject(subject:ReturnType<typeof setup>){
    if(subject.released)return;subject.released=true;subject.ready=false;
    subject.observer.disconnect();subject.controls.dispose();disposeMeshResources(subject.scene);
    subject.renderer.dispose();subject.renderer.domElement.remove();
}
function showError(error:unknown){el('error').hidden=false;el('error').textContent=`Could not show the models: ${error instanceof Error?error.message:String(error)}`;}
async function loadSubject(kind:CameoKind,url:string){
    const viewport=el(`${kind}-viewport`);
    let subject:ReturnType<typeof setup>|undefined;
    viewport.setAttribute('aria-busy','true');el(`${kind}-stats`).textContent='Loading…';
    viewport.closest('section')!.querySelector<HTMLAnchorElement>('.download')!.href=url;
    try{
        const asset=await new GLTFLoader().loadAsync(url);
        if(disposed){disposeMeshResources(asset.scene);return;}
        subject=setup(kind,asset.scene);subjects.push(subject);
        subject.controls.autoRotate=turning;
        if(noir){subject.ambient.intensity=.48;subject.key.intensity=1.9;subject.fill.intensity=1.2;}
        // Let the page paint before GPU preparation. Show only a fully prepared model.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(disposed)return;
        subject.preparing=true;
        try{await subject.renderer.compileAsync(subject.scene,subject.camera);}
        finally{subject.preparing=false;}
        if(disposed)return;
        subject.animator.sample(reaction,elapsed);
        subject.renderer.render(subject.scene,subject.camera);
        subject.ready=true;subject.renderer.domElement.style.visibility='';syncPlayback();
    }catch(error){
        if(subject){releaseSubject(subject);subjects.splice(subjects.indexOf(subject),1);}
        if(!disposed){el(`${kind}-stats`).textContent='Unavailable';showError(error);}
    }finally{
        if(disposed&&subject)releaseSubject(subject);
        viewport.removeAttribute('aria-busy');
    }
}
function chooseView(view:string){
    activeView=view;
    subjects.forEach(s=>s.frame(view));
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>chooseView(button.dataset.view!));
chooseView(selectedView);
el('turn').onclick=()=>{turning=!turning;subjects.forEach(s=>s.controls.autoRotate=turning);el('turn').setAttribute('aria-pressed',String(turning));};
function syncPlayback(){
    document.querySelectorAll<HTMLButtonElement>('[data-reaction]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reaction===reaction)));
    el('pause').textContent=paused?'Play':'Pause';el('pause').setAttribute('aria-pressed',String(paused));
    timeline.max=String(CAMEO_DURATIONS[reaction]);timeline.value=String(elapsed);
    for(const s of subjects){
        const caption=el(`${s.kind}-viewport`).nextElementSibling!.querySelector('span')!;
        caption.textContent=CAMEO_REACTIONS[s.kind][reaction];
    }
}
function play(next:CameoReaction){reaction=next;elapsed=0;paused=false;syncPlayback();}
document.querySelectorAll<HTMLButtonElement>('[data-reaction]').forEach(button=>button.onclick=()=>play(button.dataset.reaction as CameoReaction));
el('replay').onclick=()=>play(reaction);
el('pause').onclick=()=>{if(paused&&elapsed>=CAMEO_DURATIONS[reaction])elapsed=0;paused=!paused;syncPlayback();};
el('speed').onchange=()=>{playbackRate=Number((el('speed') as unknown as HTMLSelectElement).value);};
timeline.oninput=()=>{elapsed=Number(timeline.value);paused=true;syncPlayback();};
el('light').onclick=()=>{
    noir=!noir;el('light').setAttribute('aria-pressed',String(noir));
    for(const s of subjects){s.ambient.intensity=noir?.48:1.6;s.key.intensity=noir?1.9:3.4;s.fill.intensity=noir?1.2:1.7;}
};
el('reset').onclick=()=>{
    turning=false;subjects.forEach(s=>{s.controls.autoRotate=false;});
    el('turn').setAttribute('aria-pressed','false');chooseView('quarter');
};
const onReduced=()=>{if(reduced.matches){turning=false;paused=true;subjects.forEach(s=>s.controls.autoRotate=false);el('turn').setAttribute('aria-pressed','false');syncPlayback();}};
reduced.addEventListener('change',onReduced);
syncPlayback();
let previous=performance.now();
function render(now:number){
    if(disposed)return;
    const dt=Math.min(.05,(now-previous)/1000);previous=now;
    if(!document.hidden){
        if(!paused){
            elapsed+=dt*playbackRate;
            if(elapsed>=CAMEO_DURATIONS[reaction]){
                if(reaction==='idle')elapsed%=CAMEO_DURATIONS.idle;
                else{elapsed=CAMEO_DURATIONS[reaction];paused=true;syncPlayback();}
            }
            timeline.value=String(elapsed);
        }
        const label=`${elapsed.toFixed(1)} / ${CAMEO_DURATIONS[reaction].toFixed(1)} s`;
        if(el('time').textContent!==label)el('time').textContent=label;
        for(const s of subjects){if(s.ready){s.animator.sample(reaction,elapsed);s.controls.update(dt);s.renderer.render(s.scene,s.camera);}}
    }
    requestAnimationFrame(render);
}
requestAnimationFrame(render);
function dispose(){
    if(disposed)return;disposed=true;reduced.removeEventListener('change',onReduced);
    // compileAsync polls renderer programs: let it finish before destroying them.
    for(const s of subjects)if(!s.preparing)releaseSubject(s);
}
addEventListener('pagehide',dispose,{once:true});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
if(import.meta.hot)import.meta.hot.dispose(dispose);
void loadSubject('spider',spiderAsset);
void loadSubject('bat',batAsset);
