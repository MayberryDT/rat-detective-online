/** Static art-direction fixture: no network, simulation, gameplay input or pointer lock. */
import * as THREE from 'three';
import '../../src/style.css';
import {GameHud} from '../../src/ui/GameHud';
import {DispatchHud} from '../../src/prototype/DispatchHud';
import {INCIDENTS, type IncidentId} from '../../src/shared/incidentCatalog';
import type {ChaosState} from '../../src/shared/chaosState';
import {createStage} from '../../src/session/createStage';
import {DEFAULT_CITY_OPTIONS,createWorldSpec} from '../../src/shared/worldSpec';
import {CityGenerator} from '../../src/world/CityGenerator';
import {createRatMesh} from '../../src/utils/RatModel';

const params=new URLSearchParams(location.search);
const hud=new GameHud();hud.enterPlaying();
const scores=Array.from({length:8},(_,i)=>({id:String(i),name:['Inspector Nightwhisker','Detective Trap','Sergeant Stilton','Constable Squeak','Marshal Breadcrumb','Inspector Cheese','Deputy Nibbles','Chief Scurry'][i],kills:12-i,deaths:i+1}));

const requested=params.get('incident');
const incident=INCIDENTS.some(i=>i.id===requested)?requested as IncidentId:'popcorn-panic';
const phase=params.get('phase')||'active';
const dispatch=new DispatchHud(()=>{});dispatch.setScores(scores,'6');
const state={dispatch:{phase:'active',started:0,until:25000,serial:1,incident},case:{owner:null},possession:{}} as unknown as ChaosState;
if(incident==='evidence-tampering'&&(phase==='active'||phase==='reveal'))state.extraCases=Array.from({length:7},(_,i)=>({...state.case,id:`evidence-${i}`}));
if(phase==='ready')state.dispatch={phase:'ready',started:0,until:0,serial:0};
if(phase==='rolling')state.dispatch={phase:'rolling',started:10000,until:12400,serial:1,incident};
if(phase==='cooldown')state.dispatch={phase:'cooldown',started:0,until:16000,serial:1};
const now=phase==='reveal'?900:phase==='rolling'?11000:12000;
dispatch.update(state,now-3000);dispatch.update(state,now);
// Remove the unrelated initial loose-case broadcast from this incident-only fixture.
document.querySelector<HTMLElement>('.case-broadcast')!.hidden=true;

const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
stage.renderer.setPixelRatio(1);
new CityGenerator(stage.scene,stage.world,DEFAULT_CITY_OPTIONS,createWorldSpec(20260905)).generate();
stage.camera.position.set(15,3.6,23);stage.camera.lookAt(15,1.3,15);
stage.flashlight.position.set(15,5,22);stage.flashlight.target.position.set(15,1.2,15);
const rat=createRatMesh({hatType:'fedora',hatColor:0x665342,furColor:0xc0aa81,coatColor:0x5a654b});
rat.position.set(15,.8,17);rat.rotation.y=Math.PI;stage.scene.add(rat);
function render(){stage.renderer.setSize(innerWidth,innerHeight);stage.camera.aspect=innerWidth/innerHeight;stage.camera.updateProjectionMatrix();stage.renderer.render(stage.scene,stage.camera);}
render();window.addEventListener('resize',render);
void document.fonts.ready.then(()=>{document.body.dataset.ready='true';render();});
