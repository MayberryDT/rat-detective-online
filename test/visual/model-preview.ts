import './outfit-studio.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStage } from '../../src/session/createStage';
import { CLOTHING_PALETTE, HIGHLIGHT_PALETTE, FUR_PALETTE, DEFAULT_APPEARANCE, generateRandomAppearance } from '../../src/shared/ratAppearance';
import type { RatAppearance } from '../../src/shared/networkProtocol';
import type { Neighborhood } from '../../src/prototype/Neighborhood';
import { CITY_PREVIEW_SEED, GRAYBOX_VERSION } from '../../src/shared/grayboxLayout';
import { disposeMeshResources } from '../../src/utils/disposeMeshResources';
import { OutfitStudioSubject, type OffHandMode, type ModelStudy } from './OutfitStudioSubject';

const query=new URLSearchParams(location.search);
// This surface never plays game audio. Human gameplay links remain independently audible.
query.set('mute','1');history.replaceState(null,'',`?${query}`);
const el=(id:string)=>document.getElementById(id)!;
const options:RatAppearance={...DEFAULT_APPEARANCE};
const palettes=[['coat','coatColor','Coat',CLOTHING_PALETTE],['hat','hatColor','Hat',CLOTHING_PALETTE],
    ['highlight','highlightColor','Shared highlight',HIGHLIGHT_PALETTE],['fur','furColor','Fur',FUR_PALETTE]] as const;
for(const [id,field,label,palette] of palettes){
    const selected=palette.find(p=>p.name.toLowerCase()===query.get(id)?.toLowerCase());
    if(selected)options[field]=selected.color;
    const fieldset=document.createElement('fieldset');fieldset.className='palette';fieldset.dataset.count=String(palette.length);
    const legend=document.createElement('legend');legend.appendChild(document.createTextNode(label));
    const value=document.createElement('output');value.id=`${id}-name`;legend.appendChild(value);fieldset.appendChild(legend);
    const swatches=document.createElement('div');swatches.className='swatches';swatches.setAttribute('role','group');swatches.setAttribute('aria-label',label);
    for(const entry of palette){
        const button=document.createElement('button');button.type='button';button.dataset.field=field;button.dataset.color=String(entry.color);
        button.style.setProperty('--swatch',`#${entry.color.toString(16).padStart(6,'0')}`);
        button.setAttribute('aria-label',`${label}: ${entry.name}`);button.title=entry.name;
        button.onclick=()=>{options[field]=entry.color;refreshOutfit();};swatches.appendChild(button);
    }
    fieldset.appendChild(swatches);
    if(id==='highlight'){const note=document.createElement('small');note.id='highlight-note';note.textContent='One accent for the band, collar, lapels and cuffs.';fieldset.appendChild(note);}
    el('palettes').appendChild(fieldset);
}
const renderer=new THREE.WebGLRenderer({antialias:true});
const stage=createStage(renderer,'pools');
const viewport=el('viewport');viewport.appendChild(renderer.domElement);
renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
const {scene,camera,world}=stage;
const gameBackground=scene.background,gameFog=scene.fog;
const gameObjects=[...scene.children];
const studio=new THREE.Group();studio.name='workshop-set';scene.add(studio);
const hemisphere=new THREE.HemisphereLight(0xfff3e0,0x544a64,1.0);studio.add(hemisphere);
const key=new THREE.DirectionalLight(0xffe7cd,2.2);key.position.set(-3,6,5);key.target.position.set(0,1,0);
key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.025;
key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=4;key.shadow.camera.bottom=-3;
key.shadow.camera.near=.1;key.shadow.camera.far=20;studio.add(key,key.target);
const fill=new THREE.DirectionalLight(0xc4c9ef,.55);fill.position.set(4,2,-3);studio.add(fill,fill.target);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x292630,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;studio.add(floor);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.12;controls.enablePan=false;
controls.minDistance=1.8;controls.maxDistance=12;controls.minPolarAngle=.22;controls.maxPolarAngle=Math.PI*.55;controls.autoRotateSpeed=.6;
let environment=['studio','street','records'].includes(query.get('environment')??'')?query.get('environment')!:'studio';
let view=query.get('view')??'three-quarter';if(!['front','side','case','rear','three-quarter'].includes(view))view='three-quarter';
let study:ModelStudy=query.get('model')==='original'?'original':query.get('model')==='original-arms'?'original-arms':'latest';
let offHand:OffHandMode=query.get('hand')==='empty'||query.get('hand')==='none'||query.get('held')==='0'?'none':'case';
let remote=query.get('presentation')==='remote'||query.has('batch');
let walking=false,paused=false,detail=false,ironclad=false,turntable=false,disposed=false,preparing=false;
let city:Neighborhood|undefined,cityObjects:THREE.Object3D[]=[],cityPromise:Promise<void>|undefined;
const abort=new AbortController();
let subject:OutfitStudioSubject;
const currentPosition=new THREE.Vector3(),previousPosition=new THREE.Vector3(),delta=new THREE.Vector3();
const viewVectors:Record<string,THREE.Vector3>={
    'three-quarter':new THREE.Vector3(-2.5,1.25,5.3),front:new THREE.Vector3(0,.7,5.8),
    side:new THREE.Vector3(-5.8,1.0,0),case:new THREE.Vector3(5.8,1.0,0),rear:new THREE.Vector3(0,1.3,-6.5),
};
function pressed(id:string,value:boolean){el(id).setAttribute('aria-pressed',String(value));}
function syncUi(){
    for(const [id,field,,palette] of palettes){
        const value=palette.find(p=>p.color===options[field])!;el(`${id}-name`).textContent=value.name;query.set(id,value.name.toLowerCase());
        for(const button of document.querySelectorAll<HTMLButtonElement>(`[data-field="${field}"]`))button.setAttribute('aria-pressed',String(Number(button.dataset.color)===options[field]));
    }
    query.set('environment',environment);query.set('view',view);query.set('model',study);query.set('hand',offHand);query.delete('held');query.set('presentation',remote?'remote':'local');query.delete('batch');
    history.replaceState(null,'',`?${query}`);
    (el('model-study') as unknown as HTMLSelectElement).value=study;
    el('highlight-note').textContent=study==='original'?'Original model keeps its original fixed trim.':study==='original-arms'?'One accent for the new outfit. Original arms retain their coat color.':'One accent for the hatband, collar, lapels and both cuffs.';
    el('combination-count').textContent=study==='original'?'256':'1,024';
    el('combination-pools').textContent=study==='original'?'8 hats · 8 coats · 4 furs · fixed original trim':'8 hats · 8 coats · 4 accents · 4 furs';
    el('study-note').textContent=study==='original'?'Original release geometry · selected hat, coat and fur colors':study==='original-arms'?'New tailoring · exact original pistol and case arms':'Matching straight sleeves · longer case sleeve · no sleeve without a case';
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-field="highlightColor"]'))button.disabled=study==='original';
    el('outfit-label').textContent=`${el('coat-name').textContent} coat / ${el('hat-name').textContent?.toLowerCase()} hat`;
    el('case-status').textContent=offHand==='case'?'Carrying the case':'No case · no sleeve';el('render-status').textContent=remote?'Opponent':'Local rat';
    el('environment-note').textContent=environment==='studio'?'Neutral light · game materials':'Real city · game shoulder camera';
    el('view-label').textContent=environment==='studio'?(detail?'COAT DETAIL':`${view.replace('-',' ')} VIEW`):environment==='street'?'STREET / SHOULDER CAMERA':'RECORDS / SHOULDER CAMERA';
    el('orbit-hint').textContent=environment==='studio'?'Drag to orbit · scroll to zoom':'Walk in place · game animation and lighting';
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-hand]'))button.setAttribute('aria-pressed',String(button.dataset.hand===offHand));pressed('idle',!walking);pressed('walk',walking);pressed('pause',paused);pressed('detail',detail);pressed('turntable',turntable);
    el('pause').textContent=paused?'Resume':'Pause';
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-environment]'))button.setAttribute('aria-pressed',String(button.dataset.environment===environment));
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')){
        button.setAttribute('aria-pressed',String(button.dataset.view===view&&!detail));button.disabled=environment!=='studio';
    }
    for(const id of ['detail','turntable'])(el(id) as unknown as HTMLButtonElement).disabled=environment!=='studio';
    (el('walk') as unknown as HTMLButtonElement).title='Preview the existing movement animation';
    (el('presentation') as unknown as HTMLSelectElement).value=remote?'remote':'local';
}
function spawn(){
    return environment==='street'?new THREE.Vector3(-4,0,-24.6):environment==='records'?new THREE.Vector3(-36,0,-43):new THREE.Vector3();
}
function rebuild(){
    subject?.dispose();
    const p=environment==='studio'?currentPosition:spawn();
    subject=new OutfitStudioSubject(scene,world,camera,options,p,remote,offHand,study);
    if(environment!=='studio'){
        const heading=environment==='street'?-Math.PI/2:0;
        subject.controller.onMouseMove((Math.PI-heading)/.002,-180);subject.rat.mesh.rotation.y=heading+Math.PI;
    }
    if(ironclad)subject.rat.setPowerups(3600,0);
    subject.rat.update(0);subject.updateCarry();
    previousPosition.copy(subject.rat.mesh.position);
}
function refreshOutfit(){if(!preparing)rebuild();syncUi();}
function frame(){
    if(environment!=='studio'){subject.controller.updateView();return;}
    const p=subject.rat.mesh.position;
    controls.target.copy(p).add(new THREE.Vector3(0,detail?1.13:1.02,detail?.04:-.23));
    const direction=(viewVectors[view]??viewVectors['three-quarter']).clone();
    const aspect=Math.max(.45,camera.aspect);direction.multiplyScalar((detail?.51:1)*Math.max(.95,.78/aspect));
    camera.position.copy(controls.target).add(direction);camera.lookAt(controls.target);controls.update();
}
function resize(){
    const width=viewport.clientWidth,height=viewport.clientHeight;
    if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=environment==='studio'?36:60;
    camera.updateProjectionMatrix();if(subject)frame();
}
const observer=new ResizeObserver(resize);observer.observe(viewport);
async function setEnvironment(next:string){
    environment=next;detail=false;turntable=false;controls.autoRotate=false;currentPosition.set(0,0,0);syncUi();
    if(next!=='studio'&&!city){
        preparing=true;el('loading').hidden=false;
        cityPromise??=(async()=>{
            const before=new Set(scene.children);
            const {Neighborhood}=await import('../../src/prototype/Neighborhood');
            city=await Neighborhood.prepare(scene,world,{seed:CITY_PREVIEW_SEED,version:GRAYBOX_VERSION},abort.signal);
            cityObjects=scene.children.filter(o=>!before.has(o));
        })();
        try{await cityPromise;}catch(error){if(!disposed){el('error').textContent=`Could not prepare the city: ${String(error)}`;el('error').hidden=false;}return;}
        finally{preparing=false;el('loading').hidden=true;}
    }
    if(disposed)return;
    const inStudio=environment==='studio';
    gameObjects.forEach(o=>{o.visible=!inStudio;});cityObjects.forEach(o=>{o.visible=!inStudio;});studio.visible=inStudio;
    scene.background=inStudio?new THREE.Color(0x292630):gameBackground;scene.fog=inStudio?null:gameFog;
    controls.enabled=inStudio;rebuild();syncUi();resize();
}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-environment]'))button.onclick=()=>{void setEnvironment(button.dataset.environment!);};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))button.onclick=()=>{view=button.dataset.view!;detail=false;syncUi();frame();};
el('model-study').onchange=()=>{study=(el('model-study') as unknown as HTMLSelectElement).value as ModelStudy;refreshOutfit();};
el('shuffle').onclick=()=>{Object.assign(options,generateRandomAppearance());refreshOutfit();};
el('reset-outfit').onclick=()=>{Object.assign(options,DEFAULT_APPEARANCE);refreshOutfit();};
el('idle').onclick=()=>{walking=false;syncUi();};el('walk').onclick=()=>{walking=true;paused=false;syncUi();};
el('pause').onclick=()=>{paused=!paused;syncUi();};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-hand]'))button.onclick=()=>{offHand=button.dataset.hand as OffHandMode;if(!preparing)subject.setOffHand(offHand);syncUi();};
el('detail').onclick=()=>{detail=!detail;syncUi();frame();};
el('turntable').onclick=()=>{turntable=!turntable;controls.autoRotate=turntable;syncUi();};
el('frame').onclick=()=>{detail=false;frame();syncUi();};
el('fire').onclick=()=>{
    if(preparing)return;paused=false;
    const target=subject.rat.mesh.localToWorld(new THREE.Vector3(0,1.55,20));subject.rat.playShootAnimation(target);syncUi();
};
el('presentation').onchange=()=>{remote=(el('presentation') as unknown as HTMLSelectElement).value==='remote';refreshOutfit();};
el('finish').onchange=()=>{
    ironclad=(el('finish') as unknown as HTMLSelectElement).value==='ironclad';
    if(!preparing)subject.rat.setPowerups(ironclad?3600:0,0);
};
void setEnvironment(environment);
let last=performance.now(),lastStats=0;
renderer.setAnimationLoop(now=>{
    const dt=paused?0:Math.min((now-last)/1000,.05);last=now;
    if(!subject||preparing||disposed)return;
    if(environment==='studio'){
        if(walking)currentPosition.z+=18*dt;
        subject.rat.body.position.set(currentPosition.x,currentPosition.y,currentPosition.z);
        subject.rat.update(dt);
        delta.copy(subject.rat.mesh.position).sub(previousPosition);camera.position.add(delta);controls.target.add(delta);
        studio.position.copy(subject.rat.mesh.position);controls.update();
    }else{
        subject.rat.presentAlive(dt,walking?18:0);subject.controller.updateView();city?.update(dt,camera,subject.rat.mesh.position);
    }
    subject.updateCarry();previousPosition.copy(subject.rat.mesh.position);
    renderer.render(scene,camera);
    if(now-lastStats>500){
        el('stats').textContent=`${renderer.info.render.calls} scene draws · ${renderer.info.render.triangles.toLocaleString()} triangles. Studio poses are illustrative; game physics are unchanged.`;lastStats=now;
    }
});
window.addEventListener('pagehide',()=>{
    disposed=true;abort.abort();renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();
    subject?.dispose();city?.dispose();key.shadow.dispose();disposeMeshResources(studio);studio.removeFromParent();stage.dispose();
});
