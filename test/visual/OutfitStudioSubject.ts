import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { RatController } from '../../src/player/RatController';
import type { RatAppearance } from '../../src/shared/networkProtocol';
import { addLeatherBriefcase } from '../../src/prototype/CaseModel';
import { createCaseGrip, disposeCaseGrip } from '../../src/prototype/CaseGrip';
import { updateCaseCarryPose } from '../../src/prototype/CaseCarryPose';
import { disposeMeshResources } from '../../src/utils/disposeMeshResources';

/** The workshop supplies poses; all model, material and carry behavior is shared with the game. */
export class OutfitStudioSubject {
    readonly controller: RatController;
    readonly caseRoot = new THREE.Group();
    private grip?: THREE.Group;
    get rat() { return this.controller.entity; }
    constructor(scene:THREE.Scene,world:CANNON.World,camera:THREE.PerspectiveCamera,
        appearance:RatAppearance,position:THREE.Vector3,remote:boolean,carried:boolean) {
        this.controller=new RatController(scene,world,camera,'',appearance,position);
        this.rat.isPlayer=!remote;this.rat.billboard.sprite.visible=false;
        if(remote)this.rat.enableRigidBatching();
        this.caseRoot.name='workshop-held-case';
        addLeatherBriefcase(this.caseRoot);scene.add(this.caseRoot);
        this.setCarried(carried);
    }
    setCarried(carried:boolean):void {
        if(this.grip){disposeCaseGrip(this.grip);this.grip=undefined;}
        if(carried)this.grip=createCaseGrip(this.rat);
        this.caseRoot.visible=carried;
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
