import type * as THREE from 'three';
import type {Vec3Data} from '../shared/networkProtocol';
import {sceneRoot} from './Dust';

/** Supply sounds for any rat's claim and for a site restocking, played by the feel layer. */
export type SupplyCue='claim'|'restock';
type Sink=(cue:SupplyCue,at:Vec3Data)=>void;
const sinks=new WeakMap<THREE.Object3D,Sink>();
/** The sink for supply cues in `scene` (the live game's); visual fixtures and exhibit replays register none. */
export function registerSupplyCues(scene:THREE.Scene,sink:Sink|undefined):void {if(sink)sinks.set(scene,sink);else sinks.delete(scene);}
/** A supply cue from a prop in the scene `from` belongs to. */
export function supplyCue(from:THREE.Object3D,cue:SupplyCue,at:Vec3Data):void {sinks.get(sceneRoot(from))?.(cue,at);}
