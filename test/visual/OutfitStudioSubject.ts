import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { RatController } from '../../src/player/RatController';
import type { RatAppearance } from '../../src/shared/networkProtocol';
import { addLeatherBriefcase } from '../../src/prototype/CaseModel';
import { createCaseGrip, disposeCaseGrip } from '../../src/prototype/CaseGrip';
import { updateCaseCarryPose } from '../../src/prototype/CaseCarryPose';
import {createRatMesh as createOriginalRat} from './reference/OriginalRatModel';
import {createCaseGrip as createOriginalGrip} from './reference/OriginalCaseGrip';
import {createOriginalArmsOutfit} from './reference/OriginalArmsOutfit';
import { disposeMeshResources } from '../../src/utils/disposeMeshResources';

export type ModelStudy='original'|'original-arms'|'latest';
export type OffHandMode='case'|'none';

/** The workshop supplies poses; all model, material and carry behavior is shared with the game. */
export class OutfitStudioSubject {
    readonly controller: RatController;
    readonly caseRoot = new THREE.Group();
    private grip?: THREE.Group;
    get rat() { return this.controller.entity; }
    constructor(scene:THREE.Scene,world:CANNON.World,camera:THREE.PerspectiveCamera,
        appearance:RatAppearance,position:THREE.Vector3,remote:boolean,carried:boolean|OffHandMode,private readonly study:ModelStudy='latest') {
        const factory=study==='original'?createOriginalRat:study==='original-arms'?createOriginalArmsOutfit:undefined;
        this.controller=new RatController(scene,world,camera,'',appearance,position,undefined,factory);
        this.rat.isPlayer=!remote;this.rat.billboard.sprite.visible=false;
        if(remote)this.rat.enableRigidBatching();
        this.caseRoot.name='workshop-held-case';
        addLeatherBriefcase(this.caseRoot);scene.add(this.caseRoot);
        this.setOffHand(typeof carried==='boolean'?(carried?'case':'none'):carried);
    }
    setCarried(carried:boolean):void {this.setOffHand(carried?'case':'none');}
    setOffHand(mode:OffHandMode):void {
        if(this.grip){disposeCaseGrip(this.grip);this.grip=undefined;}
        if(mode==='case')this.grip=this.study==='latest'?createCaseGrip(this.rat):createOriginalGrip(this.rat);
        this.caseRoot.visible=mode==='case';
        this.updateCarry();
    }
    updateCarry():void {
        if(this.grip?.parent)updateCaseCarryPose(this.caseRoot,this.grip.parent);
    }
    dispose():void {
        if(this.grip)disposeCaseGrip(this.grip);
        this.caseRoot.removeFromParent();disposeMeshResources(this.caseRoot);this.controller.dispose();
    }
}
