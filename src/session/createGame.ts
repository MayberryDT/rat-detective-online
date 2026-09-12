import * as THREE from 'three';
import { GameSession } from './GameSession';
import { createStage } from './createStage';
import { Neighborhood } from '../prototype/Neighborhood';
import { CityGenerator } from '../world/CityGenerator';
import { createWorldSpec, type WorldSpec } from '../shared/worldSpec';
import { GRAYBOX_VERSION } from '../shared/grayboxLayout';
import { DEFAULT_APPEARANCE } from '../shared/ratAppearance';
import { RatEntity } from '../entities/RatEntity';
import { yieldToPage } from './yieldToPage';
import type { NetworkManager } from '../network/NetworkManager';
import type { TitleScreen } from '../ui/TitleScreen';
import type { TitleMusic } from '../ui/TitleMusic';

export async function createGame(title:TitleScreen,music:TitleMusic,transport:NetworkManager,world:WorldSpec|undefined,signal:AbortSignal):Promise<GameSession> {
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    const stage=createStage(renderer);
    const spec=world??createWorldSpec(1);
    if(!world&&new URLSearchParams(window.location.search).get('room')?.startsWith('graybox-'))spec.version=GRAYBOX_VERSION;
    let city:CityGenerator|Neighborhood|undefined;
    let model:RatEntity|undefined;
    try {
        await yieldToPage(signal);
        performance.mark('city-prepare-start');
        if(spec.version===GRAYBOX_VERSION)city=await Neighborhood.prepare(stage.scene,stage.world,spec,signal);
        else {
            city=new CityGenerator(stage.scene,stage.world,undefined,spec);
            let slice=performance.now();
            for(const _step of city.generateSteps())if(performance.now()-slice>=8){await yieldToPage(signal);slice=performance.now();}
        }
        performance.mark('city-prepare-end');
        await yieldToPage(signal);
        city.update(0,stage.camera);
        const scenery=new Set(stage.scene.children);
        model=new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',
            DEFAULT_APPEARANCE);
        await renderer.compileAsync(stage.scene,stage.camera);
        // Keep compiled character programs alive until the actual rats have
        // rendered once, without a dummy participant or collider in the city.
        stage.scene.remove(...stage.scene.children.filter(object=>!scenery.has(object)));
        stage.world.removeBody(model.body);
        await yieldToPage(signal);
        renderer.render(stage.scene,stage.camera);
        performance.mark('city-render-ready');
        return new GameSession(renderer,spec,{title,music,transport,stage,city,releasePreparedModels:()=>model?.dispose()});
    } catch(error) {model?.dispose();city?.dispose();stage.dispose();throw error;}
}
