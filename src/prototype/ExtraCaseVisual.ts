import * as THREE from 'three';
import type {RatEntity} from '../entities/RatEntity';
import {CASE_LOOSE_SCALE,type ChaosState} from '../shared/chaosState';
import {incidentInfo} from '../shared/incidentCatalog';
import {ChaosPresentation,copyPresentationPose,type PresentationPose} from '../shared/ChaosPresentation';
import {updateCaseCarryPose} from './CaseCarryPose';
import {disposeMeshResources} from '../utils/disposeMeshResources';
import {addLeatherBriefcase} from './CaseModel';
import {CaseBeacon} from './CaseBeacon';
import {createCaseGrip,disposeCaseGrip} from './CaseGrip';
/** Seven bounded incident props, using the same model, outline, grip and smoothing. */
export class ExtraCaseVisual {
    readonly root=new THREE.Group();
    private readonly beacon:CaseBeacon;
    private readonly presentation=new ChaosPresentation();
    private readonly pose:PresentationPose={p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1}};
    private state?:ChaosState['case'];
    private incident?:ChaosState['dispatch'];
    private carrier:RatEntity|null=null;
    private arm:THREE.Group|null=null;
    constructor(scene:THREE.Scene,id:string,private readonly resolve:(id:string)=>RatEntity|undefined,private readonly extrapolate=true,fake=false){
        this.root.name='hot-case-'+id;this.root.userData.aimTarget=true;
        addLeatherBriefcase(this.root);scene.add(this.root);this.beacon=new CaseBeacon(scene,fake);
    }
    apply(state:ChaosState,extra:ChaosState['case'],arrival:number):void {
        this.state=extra;this.incident=state.dispatch;
        if(this.extrapolate)this.presentation.apply({...state,case:extra,shots:[],corpses:[]},arrival);
    }
    update(camera:THREE.Camera,renderTime:number,now:number):void {
        const state=this.state;if(!state)return;
        const owner=state.owner?this.resolve(state.owner):undefined;
        const carrier=owner&&!owner.dead?owner:null;
        if(carrier!==this.carrier){
            if(this.arm){disposeCaseGrip(this.arm);this.arm=null;}
            this.carrier=carrier;if(carrier)this.arm=createCaseGrip(carrier);
        }
        this.root.scale.setScalar(state.owner?1:CASE_LOOSE_SCALE);
        this.root.visible=!state.returningUntil||Math.floor(now/100)%2===0;
        const evidence=!!this.incident&&this.incident.phase==='active'&&incidentInfo(this.incident.incident).id==='evidence-tampering';
        // A counterfeit carries no objective glow. It keeps a faint unstable sheen
        // so an attentive player can read it in time without a label.
        const fake=state.fake===true;
        const hot=!fake&&!state.owner&&(!!state.missileOwner||evidence);
        this.root.traverse(object=>{
            const material=(object as THREE.Mesh).material;
            if(!(material instanceof THREE.MeshStandardMaterial)||object.name!=='leather-case-shell')return;
            material.emissive.setHex(hot?0xff2208:fake?0x7a3a10:0x633d29);
            material.emissiveIntensity=hot?1.4:fake?.5:.28;
        });
        if(carrier&&this.arm?.parent){
            updateCaseCarryPose(this.root,this.arm.parent);
        }else{
            if(!this.extrapolate||!this.presentation.looseCase(renderTime,this.pose))copyPresentationPose(state,this.pose);
            const {p,q}=this.pose;this.root.position.set(p.x,p.y,p.z);this.root.quaternion.set(q.x,q.y,q.z,q.w);
        }
        this.beacon.update(this.root,camera,!!carrier?.isPlayer);
    }
    dispose():void {
        if(this.arm){disposeCaseGrip(this.arm);this.arm=null;}
        this.carrier=null;this.presentation.clear();this.beacon.dispose();this.root.removeFromParent();disposeMeshResources(this.root);
    }
}
