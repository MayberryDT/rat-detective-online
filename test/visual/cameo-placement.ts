import * as THREE from 'three';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
import {loadCameos,warmCameoBuffers} from '../../src/cameos/loadCameos';
import {CAMEO_LAYOUT,type CameoKind} from '../../src/cameos/cameoLayout';
import {CameoAnimator} from '../../src/cameos/CameoAnimator';
const renderer=new THREE.WebGLRenderer({antialias:true}),stage=createStage(renderer);
const abort=new AbortController();let city:Neighborhood|undefined;
const status=document.getElementById('status')!;
async function init(){
    const loading=loadCameos(abort.signal);
    city=await Neighborhood.prepare(stage.scene,stage.world,{seed:341283204,version:2},abort.signal);
    const loaded=await loading;if(!loaded)throw new Error('Cameo assets unavailable');
    const cameos=loaded;
    stage.scene.add(cameos.root);city.update(0,stage.camera);
    await renderer.compileAsync(stage.scene,stage.camera);warmCameoBuffers(cameos,stage.scene,renderer);
    function show(kind:CameoKind){
        const p=CAMEO_LAYOUT.find(p=>p.kind===kind)!;
        if(kind==='spider')stage.camera.position.set(p.x-5,p.y+3,p.z-6);
        else stage.camera.position.set(60.6,-4.8,-34.8);
        stage.camera.lookAt(p.x,p.y+1.1,p.z);
        city!.update(0,stage.camera,{x:stage.camera.position.x,y:p.y,z:stage.camera.position.z});
        cameos.beginFrame(0,stage.camera.position);cameos.update(()=>[],()=>true);
        const model=cameos.root.getObjectByName(`cameo-${kind}`) as THREE.Group;
        new CameoAnimator(model,kind).sample('idle',.8);
        renderer.render(stage.scene,stage.camera);
        status.textContent=`${kind==='spider'?'Spider-rat':'Bat-rat'} · actual world geometry and lighting`;
    }
    document.getElementById('spider')!.onclick=()=>show('spider');document.getElementById('bat')!.onclick=()=>show('bat');
    show(new URLSearchParams(location.search).get('view')==='bat'?'bat':'spider');
    addEventListener('pagehide',()=>{cameos.dispose();city?.dispose();stage.dispose();},{once:true});
}
void init().catch(error=>status.textContent=String(error));
addEventListener('pagehide',()=>abort.abort(),{once:true});
