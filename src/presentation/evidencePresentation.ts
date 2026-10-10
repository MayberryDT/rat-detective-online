import * as CANNON from 'cannon-es';
import type * as THREE from 'three';
import type {CaseFiles} from './CaseFiles';
import type {Vec3Data} from '../shared/networkProtocol';
/** Evidence uses a separate noir material patch. Both title warm-up and welcome call this owner. */
export function adoptEvidence(files:CaseFiles,adopt:(root:THREE.Object3D)=>void):void {adopt(files.root);}
/** Surface support and occlusion for the live papers, restored on every welcome. */
export function attachEvidenceWorld(files:CaseFiles,world:CANNON.World,clear:(a:Vec3Data,b:Vec3Data)=>boolean):void {
    const hit=new CANNON.RaycastResult(),from=new CANNON.Vec3(),to=new CANNON.Vec3();
    files.support=p=>{
        from.set(p.x,p.y+.3,p.z);to.set(p.x,p.y-.4,p.z);hit.reset();
        if(!world.raycastClosest(from,to,{collisionFilterMask:1,skipBackfaces:true},hit)||hit.hitNormalWorld.y<.85)return undefined;
        return {y:hit.hitPointWorld.y,normal:{x:hit.hitNormalWorld.x,y:hit.hitNormalWorld.y,z:hit.hitNormalWorld.z}};
    };
    files.clearPath=clear;
}
