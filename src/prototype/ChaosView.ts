import { effectsOutput } from '../audio/PlayerAudioMix';
import { JurisdictionZones } from './JurisdictionZones';
import type {FoleyWorld} from '../audio/FoleyWorld';
import { createCaseGrip, disposeCaseGrip } from './CaseGrip';
import {setText} from '../ui/setText';
import {clearAimLabel} from '../ui/aimClearance';
import {leave} from '../ui/motion';
import { ExtraCaseVisual } from './ExtraCaseVisual';
import * as THREE from 'three';
import type { ChaosState, CorpseState, LaunchMachine, SurgeVent } from '../shared/chaosState';
import { CHAOS_TUNING, CASE_LOOSE_SCALE } from '../shared/chaosState';
import { BALL_RADIUS } from '../shared/ballTuning';
import { createRatMesh, ratAccessory } from '../utils/RatModel';
import { RatAnimator } from '../utils/RatAnimator';
import { batchRigidMeshes } from '../utils/RigidMeshBatch';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { createCheeseBallGeometry, createCheeseBallMaterial } from '../weapons/CheeseProjectileModel';
import { CheeseImpactEffects } from '../weapons/CheeseImpactEffects';
import { bindIncidentAudio, disposeIncidentAudio, playDelayedThud, startCaseBuzz } from '../audio/IncidentAudio';
import type { RatEntity } from '../entities/RatEntity';
import { incidentInfo } from '../shared/incidentCatalog';
import { DispatchHud } from './DispatchHud';
import { AssignmentDestinations } from './AssignmentDestinations';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import type { Vec3Data, ServerMessage, ShotDescriptor, PickupTarget } from '../shared/networkProtocol';
import { locateCase } from './caseLocator';
import { PressureMachine } from './PressureMachine';
import { CaseBeacon } from './CaseBeacon';
import { DispatchPillars, type DispatchStation } from './DispatchPillars';
import { reactToLandmarkImpact } from './LandmarkReactions';
import { addLeatherBriefcase } from './CaseModel';
import {LocalShotPresentation,type ShotTrace} from '../shared/LocalShotPresentation';
import { ChaosPresentation, copyPresentationPose, type PresentationPose } from '../shared/ChaosPresentation';
import { PickupVisual } from './PickupVisual';
import {powerupCard} from './pickupArtwork';
import { PICKUP_TUNING, activeBuffs, type BuffMap, type PickupKind } from '../shared/pickups';
import {closestPointOnSegment} from '../shared/netplay';

import { updateCaseCarryPose } from './CaseCarryPose';
import {RatReactionEvents} from './RatReactionEvents';
import {FlyingHat} from '../entities/FlyingHat';
import {contactShadowsOf} from '../session/shadows';
import {cityImpact} from '../feel/CityReactions';
import type {DeathStyle} from '../utils/RatAnimator';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';

/** A corpse model's origin is its feet; its body lies around this point of its own frame. */
const CORPSE_CENTRE=new THREE.Vector3(0,.95,0);

export interface InteractionCandidate {
    target:PickupTarget;targetId:string;generation:number;pickup?:import('../shared/pickups').PickupKind;
}

/** U9: a pickup card drops away instead of vanishing. */
const CARD_EXIT:Keyframe[]=[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(46px) rotate(6deg) scale(.9)'}];

/** Instanced shot draws: balls, Crossfire balls and glows, danger rims and trails, the case
 * missile's trail. Instance colours exist from the start, as play will need them, so the
 * programs never change. The title warm-up builds a one-instance set as a stand-in; the
 * welcome's full set then links nothing. */
export function createShotDraws(capacity:number){
    const ballGeometry=createCheeseBallGeometry(),glowGeometry=new THREE.SphereGeometry(.17,24,16);
    const glow=(color:number,opacity:number)=>new THREE.MeshBasicMaterial({color,side:THREE.BackSide,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const trail=(radius:number,segments:number,rings:number,color:number,opacity:number,count:number)=>
        new THREE.InstancedMesh(new THREE.SphereGeometry(radius,segments,rings),new THREE.MeshBasicMaterial({color,transparent:true,opacity,toneMapped:false,depthWrite:false}),count);
    const draws={root:new THREE.Group(),
        bullets:new THREE.InstancedMesh(ballGeometry,createCheeseBallMaterial(),capacity),
        chargedBullets:new THREE.InstancedMesh(ballGeometry,createCheeseBallMaterial(true),capacity),
        chargedGlow:new THREE.InstancedMesh(glowGeometry,glow(0xff240b,.96),capacity),
        dangerGlow:new THREE.InstancedMesh(glowGeometry,glow(0xff4822,.9),capacity),
        dangerTrails:trail(.1,8,6,0xffffff,.65,capacity),
        missileTrail:trail(.18,8,8,0xff2a12,.42,12),
        dispose(){draws.root.removeFromParent();disposeMeshResources(draws.root);for(const mesh of meshes)mesh.dispose();}};
    const meshes=[draws.bullets,draws.chargedBullets,draws.chargedGlow,draws.dangerGlow,draws.dangerTrails,draws.missileTrail];
    const names=['cheese-balls','crossfire-balls','crossfire-glow','danger-cheese-rims','danger-cheese-trails','case-missile-trail'];
    meshes.forEach((mesh,i)=>{mesh.count=0;mesh.frustumCulled=false;mesh.name=names[i]!;draws.root.add(mesh);});
    for(const mesh of [draws.chargedBullets,draws.dangerTrails])mesh.setColorAt(0,new THREE.Color(1,1,1));
    return draws;
}

export class ChaosView {
    private readonly reactions:RatReactionEvents;
    private readonly root=new THREE.Group();
    private readonly caseRoot=new THREE.Group();
    private readonly extraCases=new Map<string,ExtraCaseVisual>();
    private readonly pickups=new Map<string,PickupVisual>();
    private readonly buffBar=document.createElement('div');
    private readonly buffCards=new Map<PickupKind,HTMLElement>();
    private healingUntil=0;
    private localBuffs={ironcladUntil:0,hustleUntil:0};
    private readonly pendingInteractions=new Map<string,InteractionCandidate>();
    private readonly acceptedPickups=new Map<string,{generation:number;tick:number;epoch:string}>();
    private anticipatedCase:{acceptedTick?:number;epoch?:string}|null=null;
    private readonly caseBeacon:CaseBeacon;
    private readonly pillars:DispatchPillars;
    private readonly pressureMachine:PressureMachine;
    private readonly hud:DispatchHud;
    private readonly jurisdictionZones:JurisdictionZones;
    private readonly assignmentDestinations:AssignmentDestinations;
    private readonly caseMarker=document.createElement('div');
    private readonly caseMarkerDetail=document.createElement('div');
    private readonly impacts:CheeseImpactEffects;
    private readonly draws=createShotDraws(CHAOS_TUNING.maxShots);
    private readonly bullets=this.draws.bullets;
    private readonly chargedBullets=this.draws.chargedBullets;
    private readonly chargedGlow=this.draws.chargedGlow;
    private readonly dangerGlow=this.draws.dangerGlow;
    private readonly dangerTrails=this.draws.dangerTrails;
    private readonly missileTrail=this.draws.missileTrail;
    private readonly trailPose=new THREE.Object3D();
    private readonly trailDirection=new THREE.Vector3();
    private readonly trailAxis=new THREE.Vector3(0,0,1);
    private readonly dangerColor=new THREE.Color(0xff602a);
    private readonly lethalColor=new THREE.Color(0xff3015);
    private readonly ownCrossfireTint=new THREE.Color(1,1,1);
    private readonly enemyCrossfireTint=new THREE.Color(2.4,1.4,1.2);
    private myId='';
    private readonly ballPose=new THREE.Object3D();
    /** Polish 12: recent death causes by victim, consumed when the shared corpse appears. */
    private readonly deathStyles=new Map<string,{style:DeathStyle;headshot:boolean;at:number}>();
    /** `speed`: last presented speed, so a sudden stop reads as an impact for the limbs. */
    private corpses=new Map<string,{mesh:THREE.Group;animator:RatAnimator;state:CorpseState;hat?:FlyingHat;hatPending:boolean;speed:number}>();
    private arm:THREE.Group|null=null;
    private carrier:RatEntity|null=null;
    private state:ChaosState|null=null;
    private receivedAt=0;
    private readonly presentation=new ChaosPresentation();
    private readonly localShots:LocalShotPresentation;
    private readonly presented:PresentationPose={p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1}};
    private readonly p=new THREE.Vector3();
    private readonly impactPoint=new THREE.Vector3();
    private readonly impactNormal=new THREE.Vector3();
    private readonly audioPosition=new THREE.Vector3();
    onPresentedShot?: (id:string,p:Vec3Data,radius:number)=>void;
    /** A launched rat's landing, raised when the playback shows it (your own at once); `speed` is its fall speed. */
    onLanding?: (p:Vec3Data,speed:number)=>void;
    /** R3: a shot jolted a body at `p` (for its squeak). */
    onCorpseJolt?: (p:Vec3Data)=>void;
    /** A launcher firing in the presented timeline. */
    set onLauncherFired(listener:((machine:LaunchMachine,boost:boolean)=>void)|undefined){this.pressureMachine.onFire=listener;}
    /** Latest render camera, for placing trigger-hit sounds raised from snapshots. */
    private cameraForTriggers?:THREE.Camera;
    /** A ball counted on a launcher trigger (for the shooter's-side juice). */
    set onTriggerHit(listener:((machine:LaunchMachine,at:THREE.Vector3,busy:boolean,level:number)=>void)|undefined){this.pressureMachine.onTriggerHit=listener;}
    /** A Pressure Surge street launcher erupting in the presented timeline. */
    set onVentErupted(listener:((vent:SurgeVent)=>void)|undefined){this.pressureMachine.onVent=listener;}
    /** The ball that started an incident struck a Dispatch pillar's bell. */
    set onDispatchShot(listener:((station:DispatchStation,at:THREE.Vector3)=>void)|undefined){this.pillars.onShot=listener;}
    private readonly landings:{at:number;p:Vec3Data;speed:number}[]=[];
    setObserving(value:boolean):void {this.hud.observing=value;}
    setScores(scores: readonly import('../shared/networkProtocol').ScoreEntry[], myId: string):void {this.myId=myId;this.hud.setScores(scores,myId);}
    setIncidentRoster(incidents: readonly import('../shared/incidentCatalog').IncidentId[]|undefined):void {
        this.hud.setRoster(incidents?.length?incidents.map(id=>incidentInfo(id)):undefined);
    }
    constructor(private readonly scene:THREE.Scene,private resolveRat:(id:string)=>RatEntity|undefined,private audio?:AudioContext,private extrapolate=true,private feedback?:(cue:FeedbackCue,origin?:Vec3Data)=>void,private foley?:FoleyWorld,traceShot?:ShotTrace){
        this.reactions=new RatReactionEvents(resolveRat);
        this.localShots=new LocalShotPresentation(traceShot);
        this.root.add(this.draws.root);
        bindIncidentAudio(this.audio);
        this.root.name='records-chaos';scene.add(this.root);scene.add(this.caseRoot);
        this.caseRoot.name='hot-case';
        this.caseBeacon=new CaseBeacon(scene);
        addLeatherBriefcase(this.caseRoot);
        this.caseRoot.userData.aimTarget=true;
        this.pressureMachine=new PressureMachine(scene,this.audio);
        this.pillars=new DispatchPillars(scene,this.audio);
        this.hud=new DispatchHud(frequency=>this.feedback?this.feedback('tick'):this.bell(frequency),this.feedback);
        this.assignmentDestinations=new AssignmentDestinations();this.jurisdictionZones=new JurisdictionZones(scene);
        // DOM projection stays crisp at city scale and visible through all architecture.
        // It adds no dynamic lights, raycasts, or physics to the physical case.
        // U1, Carbon scrawl: a small, dim carbon marker styled in dispatchHud.css (.hot-case-tag); its position is set each frame.
        this.caseMarker.className='hot-case-tag';this.caseMarker.style.display='none';
        this.caseMarker.setAttribute('aria-label','Hot Case location');
        const title=document.createElement('div');title.className='hot-case-title';title.textContent='HOT CASE';
        this.caseMarkerDetail.className='hot-case-detail';
        for(const child of [title,this.caseMarkerDetail])this.caseMarker.appendChild(child);
        document.body.appendChild(this.caseMarker);
        this.buffBar.className='pickup-buffs';this.buffBar.style.display='none';
        document.body.appendChild(this.buffBar);
        this.impacts=new CheeseImpactEffects(scene);
    }
    /** Only the authoritative heal event confirms this instant pickup. */
    showHealing():void {
        this.healingUntil=performance.now()+3200;
        const healing=this.buffCards.get('quick-fix');if(healing)leave(healing,'paperSlide',CARD_EXIT);this.buffCards.delete('quick-fix');
        this.pickupFeedback('quick-fix');
    }
    private pickupFeedback(kind:PickupKind):void {
        this.feedback?.('pickup-slap');this.feedback?.(`pickup-${kind}`);
    }
    private clearPickupCards():void {
        this.healingUntil=0;this.localBuffs={ironcladUntil:0,hustleUntil:0};
        for(const card of this.buffCards.values())leave(card,'paperSlide',CARD_EXIT);
        this.buffCards.clear();this.buffBar.style.display=this.buffBar.childElementCount?'flex':'none';
    }
    resetProjectiles():void{
        this.localShots.clear();this.presentation.clear();this.landings.length=0;this.clearPickupCards();this.clearInteractions();this.reactions.reset();
        // gameReset precedes the new chaos snapshot. Do not render or interact
        // with the previous round's confirmed carrier during that gap.
        this.state=null;this.setCarrier(null);this.root.visible=false;
        this.caseRoot.visible=false;this.caseBeacon.root.visible=false;this.caseMarker.style.display='none';
        for(const visual of this.extraCases.values())visual.dispose();this.extraCases.clear();
        this.assignmentDestinations.clear();this.jurisdictionZones.clear();
    }
    fire(shot:ShotDescriptor):void {
        if(!this.extrapolate)return;
        const dispatch=this.state?.dispatch;
        const incident=dispatch?.phase==='active'?incidentInfo(dispatch.incident).id:undefined;
        this.localShots.fire(this.myId,shot,incident,performance.now());
    }
    private readonly localMuzzle=()=>this.resolveRat(this.myId)?.getMuzzlePosition()??this.presented.p;
    launch(message:Extract<ServerMessage,{type:'playerShot'}>):void {
        if(this.extrapolate&&!this.localShots.confirm(message,performance.now()))this.presentation.launch(message,performance.now());
    }
    /** The live position of `victimId`'s shared corpse model, if one is shown. */
    /** Juice T2: at your last hit point the case loses its outline, badge and
     * guidance (the case itself stays visible). */
    private lastHitPoint=false;
    /** From two hit points Quick Fix kits glow green through walls. */
    private fixXray=false;
    /** Screen beacons for Quick Fix kits at low health. DOM, so the black-and-white
     * city never turns them grey. */
    private readonly fixBeacons:HTMLElement[]=[];
    setLastHitPoint(on:boolean):void {
        if(on===this.lastHitPoint)return;
        this.lastHitPoint=on;
        if(on){this.caseBeacon.root.visible=false;this.caseMarker.style.display='none';this.assignmentDestinations.clear();}
    }
    setFixXray(on:boolean):void {
        if(on===this.fixXray)return;
        this.fixXray=on;
        for(const visual of this.pickups.values())visual.setXray(on);
        if(!on)for(const beacon of this.fixBeacons)beacon.style.display='none';
    }
    corpseOf(victimId:string):THREE.Vector3|undefined {
        // Newest matching corpse only; an older body of the same rat may still be lying elsewhere.
        let best:{mesh:THREE.Group;state:CorpseState}|undefined;
        for(const c of this.corpses.values())if(c.state.victimId===victimId&&(!best||c.state.born>best.state.born))best=c;
        return best&&this.state&&this.state.time-best.state.born<5000?best.mesh.position:undefined;
    }
    /** Juice T4: an oversized cheese burst (a headshot splat). */
    burst(point:THREE.Vector3,normal:THREE.Vector3,scale:number):void {this.impacts.emit(point,normal,false,scale);}
    noteDeathStyle(victimId:string,style:DeathStyle,headshot=false):void {
        this.deathStyles.set(victimId,{style,headshot,at:performance.now()});
        if(this.deathStyles.size>32)this.deathStyles.delete(this.deathStyles.keys().next().value!);
    }
    shotResult(message:Extract<ServerMessage,{type:'shotResult'}>):void {this.localShots.result(message);this.reactions.shotResult(message);}
    /** Use the exact segment crossed this display frame so high-speed movement
     * cannot step over a small pickup between render samples. */
    interaction(from:Vec3Data,to:Vec3Data,fullHealth:boolean):InteractionCandidate|undefined {
        const state=this.state;if(!state)return;
        const now=state.time+Math.min(80,Math.max(0,performance.now()-this.receivedAt));
        let best:InteractionCandidate|undefined,bestDistance=Infinity;
        const consider=(candidate:InteractionCandidate,p:Vec3Data,radius:number)=>{
            const closest=closestPointOnSegment(from,to,p),distance=Math.hypot(closest.x-p.x,closest.y-p.y,closest.z-p.z);
            if(distance<=radius&&distance<bestDistance){best=candidate;bestDistance=distance;}
        };
        const c=state.case;
        const classicWeaponized=state.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='evidence-tampering';
        if(!this.anticipatedCase&&!c.owner&&!c.returningUntil&&!c.missileOwner&&!classicWeaponized&&state.assignment?.phase!=='closed'&&
            Math.hypot(c.v.x,c.v.y,c.v.z)<=CHAOS_TUNING.casePickupMaxSpeed&&now>=c.pickupAfter)
            // Interaction runs before update(): the rendered prop may still be
            // in yesterday's paw after a delivery/drop/reset snapshot. Use the
            // current authoritative pickup position, never that stale mesh.
            consider({target:'case',targetId:'primary',generation:c.pickupAfter},c.p,CHAOS_TUNING.pickupRadius);
        for(const pickup of state.pickups??[]){
            if((pickup.availableAt??0)>now||this.pendingTarget('pickup',pickup.id)||fullHealth&&pickup.kind==='quick-fix')continue;
            consider({target:'pickup',targetId:pickup.id,generation:pickup.availableAt??0,pickup:pickup.kind},pickup,PICKUP_TUNING.claimRadius);
        }
        return best;
    }
    private pendingTarget(target:PickupTarget,targetId:string):boolean {
        return [...this.pendingInteractions.values()].some(candidate=>candidate.target===target&&candidate.targetId===targetId);
    }
    anticipateInteraction(interactionId:string,candidate:InteractionCandidate):void {
        this.pendingInteractions.set(interactionId,candidate);
        if(candidate.target==='pickup')this.pickups.get(candidate.targetId)?.setPending(true);
        else this.anticipatedCase={};
    }
    resolveInteraction(message:Extract<ServerMessage,{type:'pickupResult'}>):void {
        const candidate=this.pendingInteractions.get(message.interactionId);this.pendingInteractions.delete(message.interactionId);
        if(message.target==='pickup'){
            if(message.accepted)this.acceptedPickups.set(message.targetId,{generation:candidate?.generation??0,tick:message.tick,epoch:message.epoch});
            else this.pickups.get(message.targetId)?.setPending(false);
        }else if(candidate){
            // A cancelled/previous-round claim cannot resurrect a carried case.
            const superseded=this.state?.epoch!==message.epoch||
                this.state.tick!==undefined&&this.state.tick>message.tick;
            this.anticipatedCase=message.accepted&&!superseded?{acceptedTick:message.tick,epoch:message.epoch}:null;
        }
    }
    clearInteractions():void {
        this.pendingInteractions.clear();this.acceptedPickups.clear();this.anticipatedCase=null;
        for(const visual of this.pickups.values())visual.setPending(false);
    }
    cancelInteraction(interactionId:string):void {
        const candidate=this.pendingInteractions.get(interactionId);this.pendingInteractions.delete(interactionId);
        if(candidate?.target==='pickup')this.pickups.get(candidate.targetId)?.setPending(false);
        else if(candidate)this.anticipatedCase=null;
    }
    apply(state:ChaosState){
        const previous=this.state;
        if(previous&&(previous.epoch!==state.epoch||previous.assignment?.roundId!==state.assignment?.roundId))this.clearInteractions();
        else if(state.case.owner||previous&&((state.assignment?.deliverySerial??0)>(previous.assignment?.deliverySerial??0))){
            // Ownership and a delivery are authoritative even if a claim result
            // is still pending. Never keep an old grip across case relocation.
            this.anticipatedCase=null;
            for(const [id,candidate] of this.pendingInteractions)if(candidate.target==='case')this.pendingInteractions.delete(id);
        }
        this.reactions.apply(state);
        this.foley?.apply(state);
        this.state=state;this.root.visible=true;this.receivedAt=performance.now();
        if(this.anticipatedCase?.acceptedTick!==undefined&&state.epoch===this.anticipatedCase.epoch&&(state.tick??0)>=this.anticipatedCase.acceptedTick)
            this.anticipatedCase=null;
        if(this.extrapolate){this.presentation.apply(state,this.receivedAt);this.localShots.apply(state,this.receivedAt);}
        const extraIds=new Set((state.extraCases??[]).map(c=>c.id));
        for(const [id,visual] of this.extraCases)if(!extraIds.has(id)){visual.dispose();this.extraCases.delete(id);}
        for(const extra of state.extraCases??[]){
            let visual=this.extraCases.get(extra.id);
            if(!visual){visual=new ExtraCaseVisual(this.scene,extra.id,this.resolveRat,this.extrapolate,extra.fake===true);this.extraCases.set(extra.id,visual);}
            visual.apply(state,extra,this.receivedAt);
        }
        this.syncPickups(state);
        this.noteLocalBuffs(state);
        for(const hit of state.impacts){
            if(!hit.audioOnly)this.impacts.emit(this.impactPoint.set(hit.p.x,hit.p.y,hit.p.z),this.impactNormal.set(hit.n.x,hit.n.y,hit.n.z),hit.surface,hit.scale??1);
            if(hit.cue==='thud')playDelayedThud(hit.p);
            if(hit.foley==='corpse-kick'||hit.foley==='corpse-bounce'&&(hit.energy??0)>16){
                // The nearest body within reach takes the jolt.
                let nearest:{animator:RatAnimator}|undefined,best=2.5*2.5;
                for(const corpse of this.corpses.values()){
                    const q=corpse.mesh.position,d=(q.x-hit.p.x)**2+(q.y+.9-hit.p.y)**2+(q.z-hit.p.z)**2;
                    if(d<best){best=d;nearest=corpse;}
                }
                nearest?.animator.joltDeath(hit.foley==='corpse-kick'?1:.5,hit.p,hit.foley==='corpse-kick'?hit.n:undefined);
                if(nearest&&hit.foley==='corpse-kick')this.onCorpseJolt?.(hit.p);
            }
            // A ball the authority counted on a launcher's trigger or, failing that, a Dispatch bell.
            if((hit.foley==='trigger'||hit.foley==='trigger-busy')&&this.cameraForTriggers&&!this.pressureMachine.triggerHit(hit.p,hit.foley==='trigger-busy',this.cameraForTriggers))
                this.pillars.hit(hit.p,hit.foley==='trigger-busy',this.cameraForTriggers);
            if(hit.foley==='launch-landing'){
                // Other rats are shown a playback delay behind; your own landing already happened.
                const self=this.resolveRat(this.myId)?.mesh.position,mine=!!self&&Math.hypot(self.x-hit.p.x,self.z-hit.p.z)<3;
                this.landings.push({at:performance.now()+(mine?0:this.presentation.delayMs),p:hit.p,speed:hit.energy??0});
            }
            if(hit.cue==='case-hit'||hit.cue==='armor-clang')this.feedback?.(hit.cue,hit.p);
            if(hit.cue==='armor-clang')this.impacts.spark(this.impactPoint.set(hit.p.x,hit.p.y,hit.p.z),this.impactNormal.set(hit.n.x,hit.n.y,hit.n.z));
            if(!hit.audioOnly){reactToLandmarkImpact(this.root.parent as THREE.Scene,hit.p);cityImpact(hit.p,hit.cue==='thud'?3:hit.scale??1);}
        }
        const corpses=new Set(state.corpses.map(c=>c.id));
        for(const [id,c] of this.corpses)if(!corpses.has(id)){c.hat?.dispose();this.root.remove(c.mesh);contactShadowsOf(this.scene)?.remove(c.mesh);disposeMeshResources(c.mesh);this.corpses.delete(id);}
        for(const c of state.corpses){
            const victim=this.resolveRat(c.victimId);if(victim?.dead)victim.useSharedCorpse();
            let model=this.corpses.get(c.id);
            if(!model){
                const name=this.resolveRat(c.victimId)?.name;
                const mesh=createRatMesh(name===undefined?c.appearance:{...c.appearance,accessory:ratAccessory(name)});
                // Polish 11: a fresh corpse pops its fedora (not one already lying there on join).
                const hatPending=feelState().on('hatPop')&&state.time-c.born<600;
                model={mesh,animator:new RatAnimator(mesh),state:c,hatPending,speed:0};this.corpses.set(c.id,model);this.root.add(mesh);
                contactShadowsOf(this.scene)?.add(mesh,.9,CORPSE_CENTRE);
                // Up to 16 corpses: one skinned draw each instead of ~40 per pass.
                batchRigidMeshes(mesh);
                const noted=this.deathStyles.get(c.victimId);
                if(noted&&performance.now()-noted.at<2000)model.animator.setDeathStyle(noted.style,noted.headshot);
                this.deathStyles.delete(c.victimId);
            }
            model.state=c;
        }
    }
    /** Pickups are static world props: build and place on the snapshot, animate each frame. */
    private syncPickups(state:ChaosState):void{
        const live=new Set((state.pickups??[]).map(p=>p.id));
        for(const [id,visual] of this.pickups)if(!live.has(id)){visual.dispose();this.pickups.delete(id);}
        for(const pickup of state.pickups??[]){
            let visual=this.pickups.get(pickup.id);
            if(!visual){visual=new PickupVisual(this.scene,pickup.kind);visual.setXray(this.fixXray);this.pickups.set(pickup.id,visual);}
            visual.setPosition(pickup.x,pickup.y,pickup.z);
            visual.setNervous(pickup.kind==='quick-fix'&&state.dispatch.phase==='active'&&incidentInfo(state.dispatch.incident).id==='malpractice');
            visual.setAvailableAt(pickup.availableAt??0);
            const accepted=this.acceptedPickups.get(pickup.id);
            if(accepted&&state.epoch===accepted.epoch&&(state.tick??0)>=accepted.tick&&(pickup.availableAt??0)!==accepted.generation)
                this.acceptedPickups.delete(pickup.id);
            visual.setPending(this.pendingTarget('pickup',pickup.id)||this.acceptedPickups.has(pickup.id));
        }
    }
    /** Announce a claim locally when the authoritative buff first appears. */
    private noteLocalBuffs(state:ChaosState):void{
        if(!this.myId)return;
        const mine=state.buffs?.[this.myId];
        const next={ironcladUntil:mine?.ironcladUntil??0,hustleUntil:mine?.hustleUntil??0};
        if(next.ironcladUntil!==this.localBuffs.ironcladUntil&&next.ironcladUntil>state.time)
            this.pickupFeedback('ironclad');
        if(next.hustleUntil!==this.localBuffs.hustleUntil&&next.hustleUntil>state.time)
            this.pickupFeedback('hustle');
        this.localBuffs=next;
    }
    private updateBuffs(buffs:BuffMap|undefined,now:number):void{
        if(this.resolveRat(this.myId)?.dead){this.clearPickupCards();return;}
        const mine=activeBuffs(buffs,this.myId,now);
        if(typeof this.buffBar.replaceChildren!=='function')return;
        for(const kind of ['ironclad','hustle'] as const){
            const until=kind==='ironclad'?mine.ironcladUntil:mine.hustleUntil;
            let card=this.buffCards.get(kind);
            if(!until){if(card)leave(card,'paperSlide',CARD_EXIT);this.buffCards.delete(kind);continue;}
            if(!card){card=powerupCard(kind);this.buffCards.set(kind,card);this.buffBar.appendChild(card);}
            const remaining=Math.max(0,until-now),duration=kind==='ironclad'?PICKUP_TUNING.ironcladMs:PICKUP_TUNING.hustleMs;
            const seconds=String(Math.ceil(remaining/1000)),clock=card.querySelector('b')!;
            if(clock.textContent!==seconds)clock.textContent=seconds;
            card.style.setProperty('--remaining',String(Math.min(1,remaining/duration)));
            card.classList.toggle('powerup-expiring',remaining<=3000);
        }
        const healing=this.buffCards.get('quick-fix');
        if(performance.now()<this.healingUntil){
            if(!healing){const card=powerupCard('quick-fix');card.setAttribute('role','status');
                this.buffCards.set('quick-fix',card);this.buffBar.appendChild(card);}
        }else {if(healing)leave(healing,'paperSlide',CARD_EXIT);this.buffCards.delete('quick-fix');}
        this.buffBar.style.display=this.buffBar.childElementCount?'flex':'none';
    }

    private setCarrier(entity:RatEntity|null){
        if(this.carrier===entity)return;
        if(this.arm){disposeCaseGrip(this.arm);this.arm=null;}
        this.carrier=entity;
        if(!entity)return;
        this.arm=createCaseGrip(entity);
    }
    /** `renderTime` is the presentation clock (slowed briefly for the victory moment). */
    update(dt:number,camera:THREE.Camera,renderTime=performance.now()){
        this.impacts.update(dt);
        const wall=performance.now();
        for(let i=0;i<this.landings.length;){
            const landing=this.landings[i]!;
            if(landing.at>wall){i++;continue;}
            this.landings.splice(i,1);this.onLanding?.(landing.p,landing.speed);
        }
        camera.getWorldPosition(this.audioPosition);
        if(this.audio)bindIncidentAudio(this.audio,this.audioPosition);
        const s=this.state;if(!s)return;
        // The solo preview already stepped physics this frame. Extrapolating it
        // again counted CPU/render preparation time as extra ball travel.
        const elapsed=this.extrapolate?Math.min((renderTime-this.receivedAt)/1000,.08):0,now=s.time+elapsed*1000;
        const predictedOwner=this.anticipatedCase&&!s.case.owner?this.resolveRat(this.myId):undefined;
        const owner=s.case.owner?this.resolveRat(s.case.owner):predictedOwner;
        this.setCarrier(owner&&!owner.dead?owner:null);
        this.caseRoot.scale.setScalar(owner?1:CASE_LOOSE_SCALE);
        this.caseRoot.visible=!s.case.returningUntil || Math.floor(now/100)%2===0;
        const evidence=s.dispatch.phase==='active'&&incidentInfo(s.dispatch.incident).id==='evidence-tampering';
        const hot=!s.case.owner&&(!!s.case.missileOwner||evidence);
        this.caseRoot.traverse(object=>{
            const material=(object as THREE.Mesh).material;
            if(!(material instanceof THREE.MeshStandardMaterial)||object.name!=='leather-case-shell')return;
            material.emissive.setHex(hot?0xff2208:0x633d29);
            material.emissiveIntensity=hot?1.4:.28;
        });
        if(owner&&!owner.dead){
            const anchor=this.arm!.parent!;
            updateCaseCarryPose(this.caseRoot, anchor);
            contactShadowsOf(this.scene)?.remove(this.caseRoot);
        }else{
            if(!this.extrapolate||!this.presentation.looseCase(renderTime,this.presented))copyPresentationPose(s.case,this.presented);
            const {p,q}=this.presented;
            this.caseRoot.position.set(p.x,p.y,p.z);this.caseRoot.quaternion.set(q.x,q.y,q.z,q.w);
            // A loose case is grounded by a contact disc; a carried one by its carrier's.
            contactShadowsOf(this.scene)?.add(this.caseRoot,.5);
        }
        this.caseBeacon.update(this.caseRoot,camera,!!this.carrier?.isPlayer||this.lastHitPoint);
        for(const visual of this.extraCases.values())visual.update(camera,renderTime,now);
        for(const visual of this.pickups.values())visual.update(now,camera);
        this.updateBuffs(s.buffs,now);
        this.updateCaseMarker(camera);
        if(this.fixXray)this.updateFixBeacons(camera,now);
        this.bullets.count=0;this.chargedBullets.count=0;this.chargedGlow.count=0;this.missileTrail.count=0;this.dangerGlow.count=0;this.dangerTrails.count=0;
        const active=s.dispatch.phase==='active'?incidentInfo(s.dispatch.incident).id:undefined,crossfire=active==='crossfire';
        // Bad Ammunition: crooked balls visibly wobble in flight (presentation only; hits stay authoritative).
        const wobble=active==='bad-ammunition'&&feelState().on('badAmmo')?FEEL.badAmmo.params.wobble:0;
        const shots=this.extrapolate?this.localShots.render(this.presentation.renderShots(s.shots,renderTime),renderTime):s.shots;
        for(let i=0;i<Math.min(shots.length,CHAOS_TUNING.maxShots);i++){
            const shot=shots[i];
            const p=this.localShots.owns(shot.id)||shot.stuckUntil||!(this.extrapolate&&this.presentation.shot(shot.id,renderTime,this.presented,shot.owner===this.myId?this.localMuzzle:undefined))?shot.p:this.presented.p;
            this.onPresentedShot?.(shot.id,p,shot.radius??BALL_RADIUS);
            const scale=(shot.radius??BALL_RADIUS)/BALL_RADIUS;
            this.ballPose.position.set(p.x,p.y,p.z);
            if(wobble&&!shot.stuckUntil){
                let phase=0;for(let c=0;c<shot.id.length;c++)phase=(phase*31+shot.id.charCodeAt(c))%6283;
                const speed=Math.hypot(shot.v.x,shot.v.z)||1,t=now*.022+phase/1000,grow=Math.max(0,Math.min(1,(shot.age-.08)*6));
                this.ballPose.position.x+=-shot.v.z/speed*Math.sin(t)*wobble*grow;
                this.ballPose.position.z+=shot.v.x/speed*Math.sin(t)*wobble*grow;
                this.ballPose.position.y+=Math.cos(t*1.3)*wobble*.7*grow;
            }
            this.ballPose.rotation.set(now*.015+i,now*.009,0);
            const pulse=shot.stuckUntil?1+Math.sin(now*.03)*.16:1;
            this.ballPose.scale.setScalar(scale*pulse);this.ballPose.updateMatrix();
            const own=shot.owner===this.myId||!!(shot.owner&&this.resolveRat(shot.owner)?.isPlayer);
            const hot=crossfire&&shot.wallBounced;
            const batch=hot?this.chargedBullets:this.bullets;
            const ballIndex=batch.count++;batch.setMatrixAt(ballIndex,this.ballPose.matrix);
            if(hot)batch.setColorAt(ballIndex,own?this.ownCrossfireTint:this.enemyCrossfireTint);
            if(!own){
                this.ballPose.scale.setScalar(scale*pulse*(hot?1.14:1));this.ballPose.updateMatrix();
                const rim=hot?this.chargedGlow:this.dangerGlow;rim.setMatrixAt(rim.count++,this.ballPose.matrix);
                this.trailDirection.set(shot.v.x,shot.v.y,shot.v.z);
                if(!shot.stuckUntil&&this.trailDirection.lengthSq()>.01){
                    this.trailDirection.normalize();const length=Math.min(2.4,(hot?1.4:.85)*Math.sqrt(scale));
                    this.trailPose.position.copy(this.ballPose.position).addScaledVector(this.trailDirection,-scale*BALL_RADIUS-length/2);
                    this.trailPose.quaternion.setFromUnitVectors(this.trailAxis,this.trailDirection);
                    this.trailPose.scale.set(.5*Math.sqrt(scale),.5*Math.sqrt(scale),length/.2);this.trailPose.updateMatrix();
                    const at=this.dangerTrails.count++;this.dangerTrails.setMatrixAt(at,this.trailPose.matrix);this.dangerTrails.setColorAt(at,hot?this.lethalColor:this.dangerColor);
                }
            }
        }
        const missiles=[s.case,...s.extraCases??[]].filter(c=>!c.owner&&(c.missileOwner||evidence));
        let nearestCase=missiles[0],nearestDistance=Infinity;
        for(const missile of missiles){
            const distance=(this.audioPosition.x-missile.p.x)**2+(this.audioPosition.y-missile.p.y)**2+(this.audioPosition.z-missile.p.z)**2;
            if(distance<nearestDistance){nearestDistance=distance;nearestCase=missile;}
        }
        startCaseBuzz(evidence&&!!nearestCase,nearestCase?.p);
        for(const missile of missiles.slice(0,8)){
            const visual=missile===s.case?this.caseRoot:'id' in missile&&typeof missile.id==='string'?this.extraCases.get(missile.id)?.root:undefined;
            if(!visual)continue;
            this.ballPose.position.copy(visual.position);this.ballPose.quaternion.copy(visual.quaternion);
            this.ballPose.scale.set(1.5,.8,1.2);this.ballPose.updateMatrix();
            this.missileTrail.setMatrixAt(this.missileTrail.count++,this.ballPose.matrix);
        }
        this.bullets.instanceMatrix.needsUpdate=true;this.chargedBullets.instanceMatrix.needsUpdate=true;
        if(this.chargedBullets.instanceColor)this.chargedBullets.instanceColor.needsUpdate=true;
        this.chargedGlow.instanceMatrix.needsUpdate=true;this.missileTrail.instanceMatrix.needsUpdate=true;
        this.dangerGlow.instanceMatrix.needsUpdate=true;this.dangerTrails.instanceMatrix.needsUpdate=true;
        if(this.dangerTrails.instanceColor)this.dangerTrails.instanceColor.needsUpdate=true;
        for(const c of this.corpses.values()){
            const b=c.state;
            if(!this.extrapolate||!this.presentation.corpse(b.id,renderTime,this.presented))copyPresentationPose(b,this.presented);
            const {p,q}=this.presented;c.mesh.quaternion.set(q.x,q.y,q.z,q.w);
            c.mesh.position.set(p.x,p.y,p.z);
            c.mesh.position.sub(this.p.set(0,.95,0).applyQuaternion(c.mesh.quaternion));
            // The server box has no contact events here: a sharp drop in speed is the landing.
            const speed=Math.hypot(b.v.x,b.v.y,b.v.z),impact=Math.max(0,Math.min(1,(c.speed-speed-4)/20));c.speed=speed;
            c.animator.poseDeath((now-b.born)/1000,dt,b.spin,impact,speed<.6);
            if(c.hatPending){
                c.hatPending=false;c.mesh.updateMatrixWorld(true);
                const hat=c.mesh.getObjectByName('rat-hat');
                if(hat){
                    const params=FEEL.hatPop.params;
                    // Ground under the body: the lowest point the corpse box has reached (never rises).
                    let floor=Infinity;const mesh=c.mesh,e=new THREE.Matrix4();
                    c.hat=new FlyingHat(this.root.parent as THREE.Scene,hat,this.p.set(b.v.x,0,b.v.z),()=>{
                        e.makeRotationFromQuaternion(mesh.quaternion);const m=e.elements;
                        const centre=mesh.position.y+m[5]*.95,extent=Math.abs(m[1])*.48+Math.abs(m[5])*.92+Math.abs(m[9])*.38;
                        return floor=Math.min(floor,centre-extent);
                    },params.speed,params.lift,b.born%97);
                    c.animator.setHatHidden(true);c.animator.poseDeath((now-b.born)/1000,0,b.spin,0,false);
                }
            }
            c.hat?.update(dt);
        }
        const d=s.dispatch;
        const localCase=[s.case,...s.extraCases??[]].find(c=>c.owner&&this.resolveRat(c.owner)?.isPlayer);
        const hudCase=localCase??s.case,hudOwner=hudCase.owner?this.resolveRat(hudCase.owner):undefined;
        const caller=d.caller?this.resolveRat(d.caller):undefined;
        this.hud.update(hudCase===s.case?s:{...s,case:hudCase},now,hudOwner?.name,!!hudOwner?.isPlayer,caller?.isPlayer?'you':caller?.name);
        if(this.lastHitPoint)this.assignmentDestinations.clear();else this.assignmentDestinations.updateCue(s.assignment,camera,this.resolveRat(this.myId)?.mesh.position);this.jurisdictionZones.update(s.assignment);
        this.cameraForTriggers=camera;
        this.pressureMachine.update(s.pressure,now,camera,s.dispatch.phase==='active'&&incidentInfo(s.dispatch.incident).id==='pressure-surge');
        this.pillars.update(d,now,camera);
    }
    private updateFixBeacons(camera:THREE.Camera,now:number){
        const ready:PickupVisual[]=[];
        for(const visual of this.pickups.values())if(visual.readyQuickFix(now))ready.push(visual);
        ready.sort((a,b)=>a.root.position.distanceToSquared(camera.position)-b.root.position.distanceToSquared(camera.position));
        for(let i=0;i<3;i++){
            let beacon=this.fixBeacons[i];
            const visual=ready[i];
            if(!visual){if(beacon)beacon.style.display='none';continue;}
            if(!beacon){
                // Styled in dispatchHud.css; only its projected position changes per frame.
                beacon=document.createElement('div');beacon.className='quick-fix-beacon';beacon.setAttribute('aria-hidden','true');
                beacon.textContent='+';document.body.appendChild(beacon);this.fixBeacons[i]=beacon;
            }
            this.p.copy(visual.root.position);this.p.y+=1.3;
            const location=locateCase(this.p,camera,window.innerWidth,window.innerHeight);
            beacon.style.display='block';
            beacon.style.transform=`translate(${location.x-20}px,${location.y-20}px) scale(${(1+Math.sin(now*.006)*.08)*(i===0?1:.8)})`;
            beacon.style.opacity=i===0?'1':'.7';
        }
    }
    private updateCaseMarker(camera:THREE.Camera){
        const s=this.state!;
        if(this.carrier?.isPlayer||this.lastHitPoint){this.caseMarker.style.display='none';return;}
        // Float the badge above the case so it does not cover the physical pickup
        // or a carrier's gun at close range. The bright shell outline marks its body.
        this.p.copy(this.caseRoot.position);this.p.y+=2.1;
        const location=locateCase(this.p,camera,window.innerWidth,window.innerHeight);
        this.caseMarker.style.display='block';
        // The badge follows the case in world space; its label hangs below it.
        const label=clearAimLabel(location.x,location.y+15,190,90,window.innerWidth,window.innerHeight);
        this.caseMarker.style.transform=`translate(${label.x-87}px,${label.y-32}px)`;
        const tag=s.case.owner?'hot-case-tag carried':'hot-case-tag';if(this.caseMarker.className!==tag)this.caseMarker.className=tag;
        const status=s.case.returningUntil?'RETURNING':s.case.owner?'CARRIED':'LOOSE';
        setText(this.caseMarkerDetail,`${status} · ${Math.round(location.distance)} m${location.behind?' · BEHIND':''}`);
    }
    private bell(frequency:number){
        const context=this.audio;if(!context || context.state!=='running')return;
        const oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,context.currentTime);
        const duration=frequency<=200?.6:.12;
        gain.gain.setValueAtTime(frequency<=200?.24:.08,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
        oscillator.connect(gain);gain.connect(effectsOutput(context));oscillator.start();oscillator.stop(context.currentTime+duration);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
    getDiagnostics(){return {receivedShots:this.state?.shots.length??0,renderedBalls:this.bullets.count+this.chargedBullets.count,corpses:this.corpses.size,snapshotAgeMs:this.receivedAt?performance.now()-this.receivedAt:null,presentation:this.extrapolate?this.presentation.diagnostics():null};}
    dispose(){
        for(const beacon of this.fixBeacons)beacon.remove();
        for(const c of this.corpses.values())c.hat?.dispose();
        this.clearPickupCards();this.buffBar.remove();
        this.clearInteractions();
        this.localShots.clear();
        this.pillars.dispose();this.assignmentDestinations.dispose();this.jurisdictionZones.dispose();
        this.presentation.clear();
        for(const visual of this.extraCases.values())visual.dispose();this.extraCases.clear();
        this.pressureMachine.dispose();this.caseBeacon.dispose();this.setCarrier(null);this.hud.dispose();this.caseMarker.remove();this.root.removeFromParent();this.caseRoot.removeFromParent();
        const contacts=contactShadowsOf(this.scene);contacts?.remove(this.caseRoot);for(const c of this.corpses.values())contacts?.remove(c.mesh);
        disposeMeshResources(this.caseRoot);
        startCaseBuzz(false);disposeIncidentAudio();this.impacts.dispose();
        this.draws.dispose();disposeMeshResources(this.root);
    }
}
