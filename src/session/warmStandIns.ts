import {adoptEvidence} from '../presentation/evidencePresentation';
import {SafeField} from '../presentation/SafeVisual';
import {CaseFiles} from '../presentation/CaseFiles';
import {NoirCity} from '../feel/NoirCity';
import {HeavyCheese} from '../feel/HeavyCheese';
import {TrapField} from '../presentation/TrapVisual';
import * as THREE from 'three';
import type { createStage } from './createStage';
import { DEFAULT_APPEARANCE } from '../shared/ratAppearance';
import { RatEntity } from '../entities/RatEntity';
import { PickupVisual } from '../presentation/PickupVisual';
import { PickupRespawnVisual } from '../presentation/PickupRespawnVisual';
import { addLeatherBriefcase } from '../presentation/CaseModel';
import { HotCaseLook } from '../presentation/HotCaseLook';
import { PICKUP_KINDS } from '../shared/pickups';
import { PressureMachine } from '../presentation/PressureMachine';
import { DispatchPillars } from '../presentation/DispatchPillars';
import { JurisdictionZones } from '../presentation/JurisdictionZones';
import { createShotDraws } from '../presentation/shotDraws';

/** Representative live constructors and their material variants. Caller retains these until session disposal. GPU issue/drain and scene ordering remain in createGame. */
export function populateWarmStandIns(stage:ReturnType<typeof createStage>,resources:{models:RatEntity[];pickups:PickupVisual[];briefcase:THREE.Group;street:{dispose():void}[]}):void {
    const {models,pickups,briefcase,street}=resources;
        models.push(new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE));
        const enemy=new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE,true);
        enemy.enableRigidBatching();enemy.sense(.001);models.push(enemy);
        // An opponent under Ironclad draws its batch with the metal reflection: another program.
        const ironclad=new RatEntity(stage.scene,stage.world,new THREE.Vector3(),'Preparation',DEFAULT_APPEARANCE,true);
        ironclad.setPowerups(1e6,0,0);ironclad.enableRigidBatching();models.push(ironclad);
        // Quick Fix kits grow an x-ray shell at low health.
        for(const kind of PICKUP_KINDS){const pickup=new PickupVisual(stage.scene,kind);pickup.setXray(true);pickups.push(pickup);}
        // The carried case's red-hot look (its own coat-rim, spark, print and chain programs) on the batched opponent.
        const hotLook=new HotCaseLook(stage.scene,briefcase,addLeatherBriefcase(briefcase));stage.scene.add(briefcase);hotLook.warm(enemy);street.push(hotLook);
        // The welcome builds the launchers, Dispatch pillars, the zones, the
        // flying cheese and the supplies' restock dials (one per kind: each draws its shared icon); warm them too.
        const shots=createShotDraws(1),restocks=PICKUP_KINDS.map(kind=>new PickupRespawnVisual(kind));stage.scene.add(shots.root,...restocks.map(dial=>dial.root));
        street.push(new PressureMachine(stage.scene),new DispatchPillars(stage.scene),new JurisdictionZones(stage.scene),shots,...restocks);
        const heavyWarm=new HeavyCheese(stage.scene),trapWarm=new TrapField(stage.scene,true);trapWarm.apply([{id:'warm-trap',owner:'warm',x:0,y:0,z:0,yaw:0,hp:8,at:0}],false);street.push(heavyWarm,trapWarm);
        const safeWarm=new SafeField(stage.scene);safeWarm.warm(stage.camera);street.push(safeWarm);
        // The live papers are adopted into the noir evidence patch (FeelDirector.adoptEvidence): warm that program.
        const filesWarm=new CaseFiles();filesWarm.warm();adoptEvidence(filesWarm,root=>new NoirCity(new THREE.Scene()).adopt(root,true));stage.scene.add(filesWarm.root);street.push(filesWarm);
}
