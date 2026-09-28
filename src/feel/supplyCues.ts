import type {Vec3Data} from '../shared/networkProtocol';

/** Supply sounds for any rat's claim and for a site restocking, played by the feel layer. */
export type SupplyCue='claim'|'restock';
let play:((cue:SupplyCue,at:Vec3Data)=>void)|undefined;
/** Scene-wide sink for supply cues; visual fixtures register none. */
export function registerSupplyCues(sink:((cue:SupplyCue,at:Vec3Data)=>void)|undefined):void {play=sink;}
export function supplyCue(cue:SupplyCue,at:Vec3Data):void {play?.(cue,at);}
