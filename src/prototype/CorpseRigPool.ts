import * as THREE from 'three';
import type {RatAppearance,HatTypeName} from '../shared/networkProtocol';
import {createRatMesh,setRatAppearanceColors} from '../utils/RatModel';
import {RatAnimator} from '../utils/RatAnimator';
import {batchRigidMeshes} from '../utils/RigidMeshBatch';
import {disposeMeshResources} from '../utils/disposeMeshResources';

export interface CorpseRig {readonly mesh:THREE.Group;readonly animator:RatAnimator;readonly hatType:HatTypeName}
/** Up to capacity active corpses; one bounded reserve for each of the three
 * authored hat geometries. Every rig owns its resources, including its palette. */
export class CorpseRigPool {
    private readonly owned=new Set<CorpseRig>();
    private readonly active=new Set<CorpseRig>();
    private readonly free=new Map<HatTypeName,CorpseRig[]>();
    private disposed=false;
    private created=0;
    constructor(readonly capacity=16){
        if(!Number.isInteger(capacity)||capacity<1||capacity>16)throw Error('Corpse pool capacity must be 1–16');
    }
    prewarm(appearance:RatAppearance,count:number):void {
        if(this.disposed)return;
        const wanted=Math.min(this.capacity,Math.max(0,Math.floor(count)));
        let existing=0;for(const rig of this.owned)if(rig.hatType===appearance.hatType)existing++;
        for(;existing<wanted;existing++){
            const rig=this.create(appearance);rig.mesh.visible=false;this.bucket(appearance.hatType).push(rig);
        }
    }
    private bucket(hat:HatTypeName):CorpseRig[]{
        let bucket=this.free.get(hat);if(!bucket){bucket=[];this.free.set(hat,bucket);}return bucket;
    }
    private create(appearance:RatAppearance):CorpseRig {
        const mesh=createRatMesh(appearance),animator=new RatAnimator(mesh);
        batchRigidMeshes(mesh);
        const rig={mesh,animator,hatType:appearance.hatType};this.owned.add(rig);this.created++;return rig;
    }
    acquire(appearance:RatAppearance):CorpseRig {
        if(this.disposed)throw Error('Corpse pool is disposed');
        if(this.active.size>=this.capacity)throw Error('Corpse pool active capacity exceeded');
        const rig=this.bucket(appearance.hatType).pop()??this.create(appearance);
        this.active.add(rig);
        rig.mesh.removeFromParent();rig.mesh.position.set(0,0,0);rig.mesh.quaternion.identity();rig.mesh.scale.setScalar(1);
        rig.mesh.visible=true;rig.animator.reset();setRatAppearanceColors(rig.mesh,appearance);
        return rig;
    }
    release(rig:CorpseRig):void {
        if(!this.active.delete(rig))return;
        rig.mesh.removeFromParent();rig.mesh.visible=false;this.bucket(rig.hatType).push(rig);
    }
    /** Preparation may temporarily attach these owned meshes for shader/upload
     * work. Callers restore their visibility/parent after rendering. */
    preparedRigs():readonly CorpseRig[]{return [...this.owned];}
    diagnostics(){return{active:this.active.size,retained:this.owned.size,created:this.created,capacity:this.capacity,maxRetained:this.capacity*3};}
    dispose():void {
        if(this.disposed)return;this.disposed=true;
        for(const rig of this.owned){rig.mesh.removeFromParent();disposeMeshResources(rig.mesh);}
        this.active.clear();this.free.clear();this.owned.clear();
    }
}
