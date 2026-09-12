import * as THREE from 'three';
import type { RatEntity } from '../entities/RatEntity';
import { CASE_HAND } from '../shared/chaosState';
import { getRatCarryAnchor, RAT_CARRY_SHOULDER } from '../utils/RatAnimator';

/** Shared grip for every carryable case; attaches to the animated unused hand. */
export function createCaseGrip(entity:RatEntity):THREE.Group {
        const arm=new THREE.Group();arm.name='hot-case-off-hand';
        // Borrow the actual rig materials so lighting, hit flashes and Ironclad
        // remain identical even when this arm appears after the buff was applied.
        let coatMaterial:THREE.MeshStandardMaterial|undefined,skin:THREE.MeshStandardMaterial|undefined;
        entity.mesh.traverse(o=>{
            if(!(o instanceof THREE.Mesh))return;
            for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){
                if(m.name==='rat-coat')coatMaterial=m;if(m.name==='rat-skin')skin=m;
            }
        });
        if(!coatMaterial||!skin)throw new Error('Rat carry materials missing');
        const segment=(from:THREE.Vector3,to:THREE.Vector3,radius:number,material:THREE.Material)=>{
            const direction=to.clone().sub(from);
            const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.9,direction.length(),10),material);
            mesh.position.copy(from).add(to).multiplyScalar(.5);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());arm.add(mesh);
        };
        const shoulder=new THREE.Vector3(),elbow=new THREE.Vector3(.61,1.08,.015).sub(RAT_CARRY_SHOULDER);
        const hand=new THREE.Vector3(CASE_HAND.x,CASE_HAND.y+.43,CASE_HAND.z).sub(RAT_CARRY_SHOULDER);
        segment(shoulder,elbow,.12,coatMaterial);segment(elbow,hand,.09,coatMaterial);
        const paw=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),skin);
        paw.name='case-gripping-paw';paw.position.copy(hand);paw.scale.set(.8,1,1.2);arm.add(paw);
        // Fingers curl over the handle running fore-and-aft, rather than pushing the case outward.
        for(const z of [-.065,0,.065]){
            const finger=new THREE.Mesh(new THREE.SphereGeometry(.027,8,6),skin);
            finger.position.copy(hand).add(new THREE.Vector3(.045,-.025,z));finger.scale.set(.8,1.5,.8);arm.add(finger);
        }
        getRatCarryAnchor(entity.mesh).add(arm);return arm;
}

/** Grip owns its geometry; the rat owns the borrowed coat/skin materials. */
export function disposeCaseGrip(arm:THREE.Group):void {
    arm.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>();
    arm.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
    for(const geometry of geometries)geometry.dispose();
}
