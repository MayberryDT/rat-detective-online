import type {Scene} from 'three';
import type {FoleyPlay} from './foleyCatalog';
const listeners=new WeakMap<Scene,FoleyPlay>();
/** Scene-scoped optional presentation bridge; visual fixtures need no audio. */
export function registerWorldSound(scene:Scene,play:FoleyPlay):()=>void {
    listeners.set(scene,play);return ()=>{if(listeners.get(scene)===play)listeners.delete(scene);};
}
export function emitWorldSound(scene:Scene,...args:Parameters<FoleyPlay>):void {listeners.get(scene)?.(...args);}
