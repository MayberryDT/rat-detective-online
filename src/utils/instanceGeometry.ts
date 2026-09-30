import * as THREE from 'three';

/** A geometry of its own over `base`'s buffers, for one InstancedMesh among several sharing a shape. three keeps
 * one vertex-array binding per (geometry, program); instanced meshes sharing a geometry each bring their own
 * instance buffers, so every draw re-specified every attribute and rebuilt the binding's cache (garbage each draw).
 * The buffers stay shared: one GPU copy. Disposed with `base`. */
export function instanceGeometry(base:THREE.BufferGeometry):THREE.BufferGeometry {
    const view=new THREE.BufferGeometry();
    view.setIndex(base.index);
    for(const name in base.attributes)view.setAttribute(name,base.attributes[name]!);
    for(const group of base.groups)view.addGroup(group.start,group.count,group.materialIndex);
    view.setDrawRange(base.drawRange.start,base.drawRange.count);
    view.boundingBox=base.boundingBox?.clone()??null;view.boundingSphere=base.boundingSphere?.clone()??null;
    base.addEventListener('dispose',()=>view.dispose());
    return view;
}
