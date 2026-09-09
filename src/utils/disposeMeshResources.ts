import * as THREE from 'three';

/** Release an owned, untextured model. Parts may share resources within it. */
export function disposeMeshResources(root: THREE.Object3D): void {
    const skeletons = new Set<THREE.Skeleton>();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((child) => {
        if(child instanceof THREE.SkinnedMesh)skeletons.add(child.skeleton);
        if (child instanceof THREE.Mesh) {
            geometries.add(child.geometry);
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
                materials.add(material);
            }
        }
    });
    skeletons.forEach(skeleton=>skeleton.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
}
