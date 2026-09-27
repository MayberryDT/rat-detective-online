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
import { warmPrograms } from './warmPrograms';
import { PickupVisual } from '../prototype/PickupVisual';
import { addLeatherBriefcase } from '../prototype/CaseModel';
import { PICKUP_KINDS } from '../shared/pickups';
import { disposeMeshResources } from '../utils/disposeMeshResources';
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
    let built:GameSession|undefined;
    let cameos:CameoView|undefined,failed=false;
    const cameoLoad=spec.version===GRAYBOX_VERSION?loadCameos(signal).then(view=>{if(failed)view?.dispose();else cameos=view;}):Promise.resolve();
    try {
        await yieldToPage(signal);
        performance.mark('city-prepare-start');
        if(spec.version===GRAYBOX_VERSION)city=await Neighborhood.prepare(stage.scene,stage.world,spec,signal);
        else {
            city=new CityGenerator(stage.scene,stage.world,undefined,spec);
            let slice=performance.now();
            for(const _step of city.generateSteps())if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
        }
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
            for(const model of models)model.dispose();for(const pickup of pickups)pickup.dispose();disposeMeshResources(briefcase);
        }});
        built=session;
        const bound={onEnter:title.onEnter,available:title.available};
        Object.assign(title,queued);
        const scenery=new Set(stage.scene.children);
        // Representative rats, supplies and case keep their programs alive
        // until the real ones render once; no participant or collider remains.
        models.push(new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE));
        const enemy=new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE,true);
        enemy.enableRigidBatching();models.push(enemy);
        for(const kind of PICKUP_KINDS)pickups.push(new PickupVisual(stage.scene,kind));
        addLeatherBriefcase(briefcase);stage.scene.add(briefcase);
        const standIns=stage.scene.children.filter(object=>!scenery.has(object));
        stage.syncViewport();
        await warmPrograms(renderer,stage.scene,stage.camera,signal,standIns);
        stage.scene.remove(...standIns);
        for(const model of models)stage.world.removeBody(model.body);
        await yieldToPage(signal);
        renderer.render(stage.scene,stage.camera);
        if(cameos)warmCameoBuffers(cameos,stage.scene,renderer);
        performance.mark('city-render-ready');
        Object.assign(title,bound);
        return session;
    } catch(error) {failed=true;if(built)built.dispose();else{cameos?.dispose();for(const model of models)model.dispose();for(const pickup of pickups)pickup.dispose();city?.dispose();stage.dispose();}throw error;}
}
