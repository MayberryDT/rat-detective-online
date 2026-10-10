import * as THREE from 'three';

const PARTS=new Map<string,THREE.BufferGeometry[]>();

/** A rat's part geometry never depends on the rat (colours live in materials), so each part is
 * extruded, lathed or merged once and every new rat, a corpse on each death among them, gets
 * copies: the same vertices without re-running the builders. Copies, not shared objects, because
 * rigs are disposed with their geometry and a few parts are reshaped per rat. */
export function ratPartGeometries(key:string,build:()=>THREE.BufferGeometry[]):THREE.BufferGeometry[] {
    let parts=PARTS.get(key);
    if(!parts){parts=build().map(built=>{const plain=new THREE.BufferGeometry().copy(built);built.dispose();return plain;});PARTS.set(key,parts);}
    return parts.map(part=>part.clone());
}
export function ratPartGeometry(key:string,build:()=>THREE.BufferGeometry):THREE.BufferGeometry {
    return ratPartGeometries(key,()=>[build()])[0]!;
}
