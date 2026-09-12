import * as THREE from 'three';
import {metalReflection} from '../utils/metalReflection';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {batchRigidMeshes} from '../utils/RigidMeshBatch';
import {PickupRespawnVisual} from './PickupRespawnVisual';
import type {PickupKind} from '../shared/pickups';

/** Authored supply props: a plated coat, red detective shoes and a medical tin.
 * Each sits over a pavement tray, with emissive details and no additional lights. */
export class PickupVisual {
    readonly root=new THREE.Group();
    private readonly item=new THREE.Group();
    private availableAt=0;
    private pending=false;
    private restock?:PickupRespawnVisual;
    constructor(scene:THREE.Scene,kind:PickupKind){
        const steel=new THREE.MeshStandardMaterial({color:0xd8e2ed,metalness:.8,roughness:.22,emissive:0x8b9aad,emissiveIntensity:.24});
        const dark=new THREE.MeshStandardMaterial({color:0x29252a,metalness:.45,roughness:.55});
        const accent=new THREE.MeshStandardMaterial({color:kind==='hustle'?0xda2417:kind==='quick-fix'?0x66e79a:0xe6edf6,
            emissive:kind==='hustle'?0xff1908:kind==='quick-fix'?0x42ff83:0xb9d7f5,emissiveIntensity:.5,roughness:.32,metalness:.3});
        for(const material of [steel,dark,accent]){material.envMap=metalReflection();material.envMapIntensity=1.2;}
        const box=(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,r=.04)=>{
            const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,r),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
        };
        box(this.root,1.65,.11,1.3,0,.07,0,dark);
        for(const x of [-.68,.68])box(this.root,.09,.025,1.02,x,.14,0,accent,.01);
        this.root.add(this.item);
        if(kind==='ironclad'){
            this.item.name='plated-trenchcoat';
            box(this.item,.85,1.18,.35,0,.72,0,steel);
            box(this.item,.91,.4,.4,0,.26,0,steel);
            for(const sign of [-1,1]){
                const arm=box(this.item,.28,.78,.32,sign*.54,.91,0,steel);arm.rotation.z=sign*.23;
                const lapel=box(this.item,.22,.49,.09,sign*.16,1.09,.24,accent);lapel.rotation.z=sign*-.32;
                for(const y of [.39,.66,.88])box(this.item,.06,.06,.055,sign*.16,y,.205,dark,.02);
            }
            box(this.item,.87,.09,.39,0,.55,0,dark);
            box(this.item,.18,.12,.045,0,.55,.23,accent,.02);
            box(this.item,.25,.08,.13,0,1.37,0,dark);
        }else if(kind==='hustle'){
            this.item.name='red-detective-shoes';
            for(const sign of [-1,1]){
                const shoe=new THREE.Group();shoe.position.x=sign*.34;shoe.rotation.y=sign*-.18;this.item.add(shoe);
                box(shoe,.47,.14,.99,0,.16,0,dark);
                box(shoe,.45,.28,.94,0,.33,.03,accent,.09);
                box(shoe,.42,.43,.44,0,.48,-.22,accent,.07);
                box(shoe,.23,.06,.2,0,.71,-.22,dark);
                for(const z of [-.04,.09,.22]){const lace=box(shoe,.29,.025,.035,0,.495,z,steel,.01);lace.rotation.y=z*1.2;}
                box(shoe,.4,.025,.04,0,.465,.33,steel,.01);
            }
        }else{
            this.item.name='quick-fix-medkit';
            const white=new THREE.MeshStandardMaterial({color:0xf5fff9,roughness:.42,metalness:.06,emissive:0xdcebe1,emissiveIntensity:.4});
            // Dark casing rims frame a bright white medical box. Green plus, no red.
            box(this.item,1.18,.86,.66,0,.57,0,dark,.08);
            box(this.item,1.06,.73,.68,0,.57,0,white,.06);
            box(this.item,1.13,.09,.69,0,.92,0,dark,.025);
            box(this.item,1.05,.085,.63,0,.99,0,white,.025);
            box(this.item,.44,.09,.13,0,1.18,0,dark);
            for(const x of [-.18,.18])box(this.item,.075,.16,.13,x,1.1,0,dark);
            for(const face of [-1,1]){
                box(this.item,.16,.49,.025,0,.58,face*.355,accent,.015);
                box(this.item,.49,.16,.029,0,.58,face*.355,accent,.015);
            }
            for(const x of [-.43,.43])box(this.item,.085,.15,.04,x,.9,.365,white,.015);
        }
        batchRigidMeshes(this.item);
        this.item.position.y=.22;
        this.root.name='pickup-'+kind;scene.add(this.root);
    }
    setPosition(x:number,y:number,z:number):void {this.root.position.set(x,y-.7,z);}
    setAvailableAt(at:number):void {this.availableAt=at;}
    setPending(pending:boolean):void {this.pending=pending;}
    update(now:number,camera?:THREE.Camera):void {
        const unavailable=now<this.availableAt,empty=unavailable||this.pending;
        this.item.visible=!empty;
        if(unavailable&&camera){
            if(!this.restock){this.restock=new PickupRespawnVisual();this.root.add(this.restock.root);}
            this.restock.update(now,this.availableAt,camera);
        }
        if(this.restock)this.restock.root.visible=unavailable;
        this.item.rotation.y=now*.00065;this.item.position.y=.22+Math.sin(now*.0025)*.08;
    }
    dispose():void {this.restock?.dispose();this.root.removeFromParent();disposeMeshResources(this.root);}
}
