import * as THREE from 'three';
import {createRatArm} from '../utils/RatArmModel';
import type { RatEntity } from '../entities/RatEntity';
import { CASE_HAND } from '../shared/chaosState';
import { getRatCarryAnchor, RAT_CARRY_SHOULDER } from '../utils/RatAnimator';

/** Floating sleeve and cuff, created only while a case is equipped. */
export function createCaseGrip(entity:RatEntity):THREE.Group {
    const arm=new THREE.Group();arm.name='hot-case-off-hand';
    // Borrow the rig materials so lighting, hit flashes and Ironclad stay shared.
    let coat:THREE.MeshStandardMaterial|undefined,highlight:THREE.MeshStandardMaterial|undefined;
    entity.mesh.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){
            if(m.name==='rat-coat')coat=m;
            if(m.name==='rat-highlight')highlight=m;
        }
    });
    if(!coat||!highlight)throw new Error('Rat carry materials missing');
    const sleeve=createRatArm(coat,highlight);
    const grip=new THREE.Vector3(CASE_HAND.x,CASE_HAND.y+.43,CASE_HAND.z).sub(RAT_CARRY_SHOULDER);
    // Keep the original shoulder and case handle placement. The extra reach belongs
    // to the straight sleeve, not a displaced case or a bent anatomical arm.
    sleeve.position.copy(grip);
    sleeve.scale.z=grip.length()/.370;
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),grip.clone().normalize());
    sleeve.getObjectByName('rat-arm-cuff')!.name='rat-case-cuff';
    sleeve.getObjectByName('rat-sleeve-grip')!.name='case-sleeve-grip';
    arm.add(sleeve);getRatCarryAnchor(entity.mesh).add(arm);return arm;
}

/** Grip owns its geometry; the rat owns the borrowed materials. */
export function disposeCaseGrip(arm:THREE.Group):void {
    arm.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>();
    arm.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
    for(const geometry of geometries)geometry.dispose();
}
