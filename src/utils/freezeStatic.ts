import type * as THREE from 'three';

/** Scenery that never moves once placed: compose `root`'s and its descendants' local matrices now
 * and stop three.js recomputing them every frame. World matrices still follow a moving ancestor.
 * Each of `moving` keeps updating its own matrix (its children are frozen relative to it).
 * Call after the last placement; anything frozen that moves later must call `updateMatrix()`. */
export function freezeStatic(root:THREE.Object3D,moving:readonly THREE.Object3D[]=[]):void {
    root.traverse(object=>{
        if(moving.includes(object))return;
        object.updateMatrix();object.matrixAutoUpdate=false;
    });
}
