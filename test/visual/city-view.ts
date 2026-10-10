/**
 * Static art inspection of the whole city (not gameplay): the real Neighborhood with
 * the noir layer, no network, no rats. Camera from the URL:
 *   ?view=<name>  a named view (see VIEWS), or
 *   ?eye=x,y,z&at=x,y,z  any camera.
 *   ?incident=<id>  an incident's look, already set in (e.g. `pea-souper`).
 *   ?rats=x,z;x,z…  remote rats standing on the street there (their far outlines).
 *   ?safes=x,y,z,yaw,hp;…  penthouse safes in those states (hp 30 locked … 0 cracked, its door open and dial up).
 * `window.cityViewReady` turns true once a few frames have rendered (for screenshots).
 */
import * as THREE from 'three';
import {createStage} from '../../src/session/createStage';
import {Neighborhood} from '../../src/presentation/Neighborhood';
import {FeelDirector} from '../../src/feel/FeelDirector';
import {RatEntity} from '../../src/entities/RatEntity';
import {SafeField} from '../../src/presentation/SafeVisual';
import {SAFE} from '../../src/shared/safes';
import {isIncidentId} from '../../src/shared/incidentCatalog';

const VIEWS:Record<string,[number[],number[]]>={
    overview:[[-15,260,40],[-15,0,-10]],
    north:[[-15,150,-40],[-15,0,-150]],
    quay:[[40,9,-152],[110,4,-178]],
    docks:[[20,40,-95],[60,0,-160]],
    boat:[[60,14,-150],[112,5,-184]],
    yard:[[-10,6,-104],[20,3,-140]],
    warehouse:[[110,5,-104],[110,4,-128]],
    precinct:[[-70,24,-80],[-105,8,-140]],
    'precinct-front':[[-122,3,-97],[-102,9,-110]],
    cellblock:[[-105,18,-138],[-105,8,-160]],
    'precinct-aerial':[[-150,55,-205],[-104,4,-138]],
    'precinct-yard':[[-115,1.8,-151],[-103,13,-148]],
    'precinct-gallery':[[-116.7,9.8,-145.7],[-110.1,9,-135.9]],
    'precinct-cell':[[-90.3,9.6,-160.7],[-105,12,-150]],
    'precinct-lookout':[[-105,21,-146.6],[-105,6,-130]],
    'precinct-lineup':[[-88.4,2.2,-118.4],[-88.4,2.4,-127]],
    'precinct-observation':[[-88.4,2.4,-111],[-88.4,2.4,-127]],
    'precinct-stairs':[[-114,3,-120],[-126,6,-121]],
    'gate-lane':[[-137,6,-28],[-137,3,-95]],
    corner:[[-50,5,-30],[-66,4,-12]],
    needleworks:[[-85,10,25],[-95,10,60]],
    records:[[-16,8,-20],[-16,8,-50]],
    'precinct-sewer':[[-66,4.5,-168],[-72,3,-140]],
    'docks-sewer':[[58,4.5,-168],[52,3,-140]],
    'precinct-branch':[[-60,-4.2,2.5],[-60,-4.5,-60]],
    'precinct-ramp':[[-66,-4.6,-113],[-72,-2,-146]],
    'docks-branch':[[64,-4.2,-33],[70,-4.5,-100]],
    'docks-ramp':[[66,-4.6,-113],[52,-2,-140]],
};
const params=new URLSearchParams(location.search);
const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
stage.renderer.setPixelRatio(1);
const beforeCity=new Set(stage.scene.children);
const city=new Neighborhood(stage.scene,stage.world,{seed:341283204,version:3});city.generate();
stage.moonShadow.adoptCity(stage.scene,beforeCity);
const feel=new FeelDirector();
feel.attach(stage.renderer.domElement,stage.listener);feel.attachCity(stage.scene,city.streetLamps);
const incident=params.get('incident');
if(isIncidentId(incident)){feel.setIncident(incident);for(let i=0;i<300;i++)feel.update(.05,stage.camera);}
const rats=(params.get('rats')??'').split(';').filter(Boolean).map((xz,i)=>{
    const [x,z]=xz.split(',').map(Number);
    return new RatEntity(stage.scene,stage.world,new THREE.Vector3(x,0,z),`Witness ${i+1}`,undefined,true);
});
const safes=new SafeField(stage.scene);
safes.apply((params.get('safes')??'').split(';').filter(Boolean).map((v,i)=>{const [x,y,z,yaw,hp]=v.split(',').map(Number);
    return {id:`s${i}`,x:x!,y:y!,z:z!,yaw:yaw!,hp:hp!,n:0,...(hp===0?{at:SAFE.restockMs*.6}:{})};}),false);
const named=VIEWS[params.get('view')??'overview']??VIEWS.overview!;
const parse=(v:string|null,fallback:number[])=>v?v.split(',').map(Number):fallback;
const [ex,ey,ez]=parse(params.get('eye'),named[0]!),[ax,ay,az]=parse(params.get('at'),named[1]!);
stage.camera.position.set(ex!,ey!,ez!);stage.camera.lookAt(ax!,ay!,az!);
stage.camera.far=Math.max(stage.camera.far,900);
stage.flashlight.position.copy(stage.camera.position);stage.flashlight.target.position.set(ax!,ay!,az!);
function resize(){stage.renderer.setSize(innerWidth,innerHeight);stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
let frames=0,last=performance.now();
const info=document.getElementById('info')!;
stage.renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,.05);last=now;
    city.update(dt,stage.camera,stage.camera.position);feel.update(dt,stage.camera,stage.camera.position);
    const unitsPerPixel=2*Math.tan(THREE.MathUtils.degToRad(stage.camera.fov)/2)/innerHeight;
    for(const rat of rats){rat.presentAlive(dt);rat.fitOutline(stage.camera.position,unitsPerPixel);}
    safes.update(dt,0,stage.camera);
    stage.renderer.render(stage.scene,stage.camera);
    // Every frame: a headless screenshot may land before the thirtieth.
    info.textContent=`static art inspection · draws ${stage.renderer.info.render.calls} · tris ${stage.renderer.info.render.triangles} · programs ${stage.renderer.info.programs?.length??0}`;
    if(++frames>=30&&now>2500)Object.assign(window,{cityViewReady:true});
});
