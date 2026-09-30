import * as THREE from 'three';

/** Shadow-map depth materials by caster form. three draws every caster that has no depth material
 * of its own with one shared material, so a map that mixes plain, instanced and skinned casters
 * re-selects that material's program at every change of form: a program lookup each time, in every
 * flashlight frame. Instanced and skinned casters get one material per form instead; plain ones keep
 * three's. They link the same programs three's material would. */
const FORMS={instanced:new THREE.MeshDepthMaterial(),instancedColor:new THREE.MeshDepthMaterial(),skinned:new THREE.MeshDepthMaterial()};
const FORM_MATERIALS:ReadonlySet<THREE.Material>=new Set(Object.values(FORMS));

/** Give an instanced or skinned `mesh` its form's depth material. Casters whose depth pass depends on
 * their own material (alpha-tested maps, displacement, clipping) or that morph keep three's handling. */
export function useShadowDepthForm(mesh:THREE.Mesh):void {
    if(mesh.customDepthMaterial||Object.keys(mesh.geometry.morphAttributes).length)return;
    const form=mesh instanceof THREE.InstancedMesh?mesh.instanceColor?FORMS.instancedColor:FORMS.instanced:mesh instanceof THREE.SkinnedMesh?FORMS.skinned:undefined;
    if(!form)return;
    for(const material of [mesh.material].flat()){
        const m=material as THREE.Material&{map?:THREE.Texture|null;alphaMap?:THREE.Texture|null;displacementMap?:THREE.Texture|null;displacementScale?:number};
        if((m.map||m.alphaMap)&&m.alphaTest>0||m.displacementMap&&m.displacementScale!==0||m.alphaToCoverage||m.clipShadows&&m.clippingPlanes?.length)return;
    }
    mesh.customDepthMaterial=form;
}

/** `material` is one of the form depth materials (it draws exactly as three's own would). */
export const isShadowDepthForm=(material:THREE.Material):boolean=>FORM_MATERIALS.has(material);
