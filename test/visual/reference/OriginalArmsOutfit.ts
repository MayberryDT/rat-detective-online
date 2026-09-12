import * as THREE from 'three';
import {createRatMesh, type RatOptions} from '../../../src/utils/RatModel';
import {createRatMesh as createOriginalRat} from './OriginalRatModel';
import {disposeMeshResources} from '../../../src/utils/disposeMeshResources';

/** Current tailoring with the original pistol/arm geometry and original small paw. */
export function createOriginalArmsOutfit(options:RatOptions={}):THREE.Group {
    const root=createRatMesh(options),original=createOriginalRat(options);
    const previous=root.getObjectByName('rat-arm')!,arm=original.getObjectByName('rat-arm')!;
    // Share current coat/skin material so the later case grip borrows the same colors.
    const shared=new Map<string,THREE.Material>();
    root.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.name)shared.set(o.material.name,o.material);});
    const release=new Set<THREE.Material>();
    arm.traverse(o=>{
        if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;
        const replacement=shared.get(o.material.name);
        if(replacement)o.material=replacement;else release.add(o.material);
    });
    // Discard the separate new shoulder sleeve as well as the weapon rig.
    const shoulder=root.getObjectByName('rat-gun-shoulder');
    shoulder?.removeFromParent();
    if(shoulder)previous.add(shoulder);
    previous.removeFromParent();
    const oldMaterials=new Set<THREE.Material>();
    previous.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(![...shared.values()].includes(m))oldMaterials.add(m);}});
    oldMaterials.forEach(m=>m.dispose());
    arm.removeFromParent();root.getObjectByName('rat-body')!.add(arm);
    // The remaining original body owns its old coat/skin; moved pistol materials stay alive.
    original.traverse(o=>{if(o instanceof THREE.Mesh&&release.has(o.material as THREE.Material))throw new Error('Original arm material unexpectedly shared with body');});
    disposeMeshResources(original);
    return root;
}
