import type {Scene} from 'three';
type Point={x:number;y:number;z:number};
const listeners=new WeakMap<Scene,(point:Point)=>void>();
export function registerLandmarkReactions(scene:Scene,react:(point:Point)=>void){listeners.set(scene,react);return ()=>listeners.delete(scene);}
export function reactToLandmarkImpact(scene:Scene,point:Point){listeners.get(scene)?.(point);}
