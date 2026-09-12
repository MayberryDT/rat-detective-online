import * as THREE from 'three';

/** A floating cartoon sleeve and cuff, without an elbow or anatomical hand.
 * Used for the pistol and equipped case; local +Z points toward the grip.
 */
export function createRatArm(coat:THREE.Material,highlight:THREE.Material):THREE.Group {
    const root=new THREE.Group();root.name='rat-floating-sleeve';
    const add=(name:string,profile:number[][],material:THREE.Material)=>{
        const geometry=new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),16);
        geometry.rotateX(Math.PI/2);
        const part=new THREE.Mesh(geometry,material);part.name=name;part.castShadow=true;
        root.add(part);
    };
    // Restore the original carry sleeve reach and taper, without adding an elbow.
    // The softened end and cuff lip give the cloth shape while the axis stays straight.
    add('rat-arm-sleeve',[[0,-.370],[.092,-.370],[.107,-.357],[.108,-.338],[.097,-.160],[.089,-.109],[0,-.109]],coat);
    add('rat-arm-cuff',[[0,-.117],[.091,-.117],[.098,-.110],[.098,-.007],[.104,.001],[.104,.011],[.095,.020],[0,.020]],highlight);
    const grip=new THREE.Object3D();grip.name='rat-sleeve-grip';root.add(grip);
    return root;
}

/** The visible sleeve pivots here; weapon aiming keeps its existing independent rig. */
export const RAT_GUN_SHOULDER=new THREE.Vector3(-.49,1.20,-.12);
export type GunSleeveRig={shoulder:THREE.Object3D;sleeve:THREE.Object3D;arm:THREE.Object3D;pistol:THREE.Object3D};
const sleeveTip=new THREE.Vector3(),sleeveForward=new THREE.Vector3(0,0,1);

/** Keep the shoulder fixed in coat space while the cuff follows the actual pistol grip. */
export function updateGunSleeve({shoulder,sleeve,arm,pistol}:GunSleeveRig):void {
    arm.updateMatrix();pistol.updateMatrix();
    sleeveTip.set(-.035,-.065,-.055).applyMatrix4(pistol.matrix).applyMatrix4(arm.matrix).sub(shoulder.position);
    const reach=Math.max(.001,sleeveTip.length());
    shoulder.quaternion.setFromUnitVectors(sleeveForward,sleeveTip.divideScalar(reach));
    // Straight cloth span changes slightly with the existing weapon motion. Its top
    // remains at the shoulder, its grip at the pistol, without changing the muzzle.
    sleeve.scale.z=reach/.370;
    sleeve.position.set(0,0,reach);
}
