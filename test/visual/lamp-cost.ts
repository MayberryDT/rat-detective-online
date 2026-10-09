/** GPU cost of keeping the eight sewer lamps in the light count above ground (at zero intensity, skipped per pixel by
 * guardLightLoops) against hiding them (which relinks every lit program when they flip mid-play: Tyler's 9 October
 * 5 s freeze). The real city and lighting at three street views; GPU time from EXT_disjoint_timer_query_webgl2,
 * hidden and counted runs interleaved. Static measurement, not gameplay. */
import * as THREE from 'three';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/prototype/Neighborhood';
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
stage.renderer.setPixelRatio(1);stage.renderer.setSize(1280,720);stage.camera.aspect=1280/720;stage.camera.updateProjectionMatrix();
const city=new Neighborhood(stage.scene,stage.world);
const gl=stage.renderer.getContext() as WebGL2RenderingContext,timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
const views:[number,number,number,number,number,number][]=[[-10,3.5,-22,-10,1,-40],[60,4,-150,60,1,-120],[-140,4,-30,-110,1,-30]];
async function gpuMs(frames:number):Promise<number[]> {
    const out:number[]=[];
    for(let i=0;i<frames;i++){
        const q=timer?gl.createQuery():null;if(q)gl.beginQuery(timer!.TIME_ELAPSED_EXT,q);
        stage.renderer.render(stage.scene,stage.camera);
        if(q){gl.endQuery(timer!.TIME_ELAPSED_EXT);
            await new Promise(r=>requestAnimationFrame(r));
            for(let k=0;k<20&&!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE);k++)await new Promise(r=>requestAnimationFrame(r));
            if(!gl.getParameter(timer!.GPU_DISJOINT_EXT))out.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
    }
    return out;
}
const median=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]??NaN;};
(async()=>{
    const result:{view:number;hiddenMs:number;countedMs:number}[]=[];
    for(const [i,[x,y,z,tx,ty,tz]] of views.entries()){
        stage.camera.position.set(x,y,z);stage.camera.lookAt(tx,ty,tz);stage.flashlight.position.set(x,y+1,z);stage.flashlight.target.position.set(tx,ty,tz);
        city.update(1/60,stage.camera);
        const hidden:number[]=[],counted:number[]=[];
        for(const lamp of city.sewerLights){lamp.visible=true;lamp.intensity=0;}await gpuMs(30);
        for(const lamp of city.sewerLights)lamp.visible=false;await gpuMs(30);
        for(let round=0;round<4;round++){
            for(const lamp of city.sewerLights)lamp.visible=false;hidden.push(...await gpuMs(40));
            for(const lamp of city.sewerLights){lamp.visible=true;lamp.intensity=0;}counted.push(...await gpuMs(40));
        }
        result.push({view:i,hiddenMs:+median(hidden).toFixed(3),countedMs:+median(counted).toFixed(3)});
    }
    Object.assign(window,{lampCost:{timer:!!timer,result}});
})();
