import * as THREE from 'three';
import {loadCameos,warmCameoBuffers} from '../cameos/loadCameos';
import type {CameoView} from '../cameos/CameoView';
import { GameSession } from './GameSession';
import { createStage } from './createStage';
import { Neighborhood } from '../prototype/Neighborhood';
import { CityGenerator } from '../world/CityGenerator';
import { createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import { GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { DEFAULT_APPEARANCE } from '../shared/ratAppearance';
import { RatEntity } from '../entities/RatEntity';
import { yieldToPage } from './yieldToPage';
import { gpuDrained, issuePrograms, warmPrograms } from './warmPrograms';
import { readLightingMode } from './lightingMode';
import { PickupVisual } from '../prototype/PickupVisual';
import { PickupRespawnVisual } from '../prototype/PickupRespawnVisual';
import { addLeatherBriefcase } from '../prototype/CaseModel';
import { PICKUP_KINDS } from '../shared/pickups';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { PressureMachine } from '../prototype/PressureMachine';
import { DispatchPillars } from '../prototype/DispatchPillars';
import { CaseBeacon } from '../prototype/CaseBeacon';
import { JurisdictionZones } from '../prototype/JurisdictionZones';
import { createShotDraws } from '../prototype/ChaosView';
import type { NetworkManager } from '../network/NetworkManager';
import type { TitleScreen } from '../ui/TitleScreen';
import type { TitleMusic } from '../ui/TitleMusic';

export async function createGame(title:TitleScreen,music:TitleMusic,transport:NetworkManager,world:WorldSpec|undefined,signal:AbortSignal):Promise<GameSession> {
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    const stage=createStage(renderer);
    const spec=world??createWorldSpec(1);
    if(!world&&new URLSearchParams(window.location.search).get('room')?.startsWith('graybox-'))spec.version=GRAYBOX_VERSION;
    let city:CityGenerator|Neighborhood|undefined;
    const models:RatEntity[]=[],pickups:PickupVisual[]=[],briefcase=new THREE.Group();
    const street:{dispose():void}[]=[];
    let built:GameSession|undefined;
    let cameos:CameoView|undefined,failed=false;
    const cameoLoad=spec.version===GRAYBOX_VERSION?loadCameos(signal).then(view=>{if(failed)view?.dispose();else cameos=view;}):Promise.resolve();
    try {
        await yieldToPage(signal);
        performance.mark('city-prepare-start');
        // Representative rats, supplies and case keep their programs alive for the
        // whole session (released on dispose); no participant or collider remains.
        // Their lit programs are the slowest to link (1–2 s each on some GPUs), and the
        // driver links in the background once they are issued, so issue them before
        // the city builds. They sit outside the scene while the session is made,
        // so the city's noir patch never reaches them.
        const early=spec.version===GRAYBOX_VERSION&&readLightingMode()==='pools';
        const scenery=new Set(stage.scene.children);
        models.push(new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE));
        const enemy=new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE,true);
        enemy.enableRigidBatching();enemy.sense(.001);models.push(enemy);
        for(const kind of PICKUP_KINDS)pickups.push(new PickupVisual(stage.scene,kind));
        addLeatherBriefcase(briefcase);stage.scene.add(briefcase);
        // The welcome builds the launchers, Dispatch pillars, the case's beacon, the zones, the
        // flying cheese and the supplies' restock dials; warm them too.
        const shots=createShotDraws(1),restock=new PickupRespawnVisual('quick-fix');stage.scene.add(shots.root,restock.root);
        street.push(new PressureMachine(stage.scene),new DispatchPillars(stage.scene),new CaseBeacon(stage.scene),new JurisdictionZones(stage.scene),shots,restock);
        const standIns=stage.scene.children.filter(object=>!scenery.has(object));
        for(const model of models)stage.world.removeBody(model.body);
        if(early)await issuePrograms(renderer,stage.scene,stage.camera,signal,standIns);
        stage.scene.remove(...standIns);
        if(spec.version===GRAYBOX_VERSION)city=await Neighborhood.prepare(stage.scene,stage.world,spec,signal);
        else {
            city=new CityGenerator(stage.scene,stage.world,undefined,spec);
            let slice=performance.now();
            for(const _step of city.generateSteps())if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
        }
        // The city is the moon map's only caster; the first render below (after the warm-up) draws it.
        stage.moonShadow.adoptCity(stage.scene,scenery);
        await cameoLoad;
        if(cameos)stage.scene.add(cameos.root);
        performance.mark('city-prepare-end');
        await yieldToPage(signal);
        city.update(0,stage.camera);
        // The session adds the feel layer's shader patches and presentation
        // objects; warm after it exists so Enter never recompiles the city.
        // An Enter during the warm-up stays queued (main.ts) until the session is
        // returned, so no welcome can populate the scene mid-warm.
        const queued={onEnter:title.onEnter,available:title.available};
        const session=new GameSession(renderer,spec,{title,music,transport,stage,city,cameos,releasePreparedModels:()=>{
            for(const model of models)model.dispose();for(const pickup of pickups)pickup.dispose();disposeMeshResources(briefcase);for(const view of street)view.dispose();
        }});
        built=session;
        const bound={onEnter:title.onEnter,available:title.available};
        Object.assign(title,queued);
        stage.scene.add(...standIns);
        stage.syncViewport();
        const lamps=city instanceof Neighborhood?city.sewerLights:[];
        await warmPrograms(renderer,stage.scene,stage.camera,signal,standIns,lamps);
        stage.scene.remove(...standIns);
        await yieldToPage(signal);
        renderer.render(stage.scene,stage.camera);
        // That render drew the moon map from the city alone. Render again with the stand-ins (out
        // of sight behind the camera, never culled), with the sewer lamps hidden and then shown, so
        // the flashlight's shadow pass links the depth programs of rats and props for both light
        // counts before Enter, not on the first frame of play or the first trip underground.
        const behind=stage.camera.localToWorld(new THREE.Vector3(0,0,20));
        for(const root of standIns){root.position.copy(behind);root.traverse(object=>{object.frustumCulled=false;});}
        stage.scene.add(...standIns);
        try {
            for(const lit of lamps.length?[false,true]:[false]){
                await yieldToPage(signal);
                for(const lamp of lamps)lamp.visible=lit;
                renderer.render(stage.scene,stage.camera);
            }
        } finally {stage.scene.remove(...standIns);for(const lamp of lamps)lamp.visible=false;}
        await gpuDrained(renderer,signal);
        if(cameos)warmCameoBuffers(cameos,stage.scene,renderer);
        performance.mark('city-render-ready');
        Object.assign(title,bound);
        return session;
    } catch(error) {failed=true;if(built)built.dispose();else{cameos?.dispose();for(const model of models)model.dispose();for(const pickup of pickups)pickup.dispose();for(const view of street)view.dispose();city?.dispose();stage.dispose();}throw error;}
}
