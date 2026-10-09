import {CaseFiles} from './CaseFiles';
import { effectsOutput, type VoiceRoute } from '../audio/PlayerAudioMix';
import { JurisdictionZones } from './JurisdictionZones';
import type {FoleyWorld} from '../audio/FoleyWorld';
import { createCaseGrip, disposeCaseGrip } from './CaseGrip';
import {fly, leave} from '../ui/motion';
import {headlines} from '../ui/Headlines';
import { ExtraCaseVisual } from './ExtraCaseVisual';
import * as THREE from 'three';
import type { CaseState, ChaosState, CorpseState, LaunchMachine, SurgeVent, TrapState } from '../shared/chaosState';
import { CHAOS_TUNING, CASE_LOOSE_SCALE } from '../shared/chaosState';
import { BALL_RADIUS } from '../shared/ballTuning';
import { createRatMesh, ratAccessory } from '../utils/RatModel';
import { RatAnimator } from '../utils/RatAnimator';
import { batchRigidMeshes } from '../utils/RigidMeshBatch';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { instanceGeometry } from '../utils/instanceGeometry';
import { createCheeseBallGeometry, createCheeseBallMaterial } from '../weapons/CheeseProjectileModel';
import { CheeseImpactEffects } from '../weapons/CheeseImpactEffects';
import { bindIncidentAudio, disposeIncidentAudio, playSynth, startCaseBuzz } from '../audio/IncidentAudio';
import type { RatEntity } from '../entities/RatEntity';
import { incidentInfo } from '../shared/incidentCatalog';
import {PoliceScannerFeed} from '../ui/PoliceScannerFeed';
import { DispatchHud } from './DispatchHud';
import { AssignmentDestinations } from './AssignmentDestinations';
import { ASSIGNMENT_DESTINATIONS, activeDestination } from '../shared/assignments';
import { activeZone } from '../shared/jurisdiction';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import type { Vec3Data, ServerMessage, ShotDescriptor, PickupTarget } from '../shared/networkProtocol';
import { locateCase } from './caseLocator';
import { PressureMachine } from './PressureMachine';
import { CarrierPingFlash } from './CarrierPingFlash';
import { DispatchPillars, type DispatchStation } from './DispatchPillars';
import { reactToLandmarkImpact } from './LandmarkReactions';
import { addLeatherBriefcase } from './CaseModel';
import {LocalShotPresentation,type ShotTrace} from '../shared/LocalShotPresentation';
import type {ShotWeapon} from '../shared/shotPattern';
import type {LaserBeam} from '../shared/chaosState';
import {LaserBeamVisual} from './LaserBeamVisual';
import {CrossfireVisual,heatPalette} from './CrossfireVisual';
import {heatStreak} from './CrossfireFlames';
import {badRound} from '../shared/shotPattern';
import {BAD_AMMO} from '../shared/shotBallistics';
import { ChaosPresentation, copyPresentationPose, type PresentationPose } from '../shared/ChaosPresentation';
import { PickupVisual } from './PickupVisual';
import {faultyCard, heldCard, hotCaseCard, pickupArtwork, powerupCard} from './pickupArtwork';
import {CASE_RED} from './caseRed';
import { BUFF_FIELD, BUFF_MS, FAULTY_MS, PICKUP_TUNING, TIMED_PICKUPS, WEAPON_KINDS, WEAPON_MS, WEAPON_TUNING, activeBuffs, entryWeapon, heldWeapon, isTimedPickup, type BuffMap, type FaultyKind, type PickupKind, type TimedPickup, type WeaponKind } from '../shared/pickups';
import {TrapField,type TrapEvent} from './TrapVisual';
import {closestPointOnSegment} from '../shared/netplay';

import { slipCaseCarryPose, updateCaseCarryPose } from './CaseCarryPose';
import { CaseMotion } from './CaseMotion';
import { HotCaseLook } from './HotCaseLook';
import {RatReactionEvents} from './RatReactionEvents';
import {FlyingHat} from '../entities/FlyingHat';
import {contactShadowsOf} from '../session/shadows';
import {cityImpact} from '../feel/CityReactions';
import type {DeathStyle} from '../utils/RatAnimator';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {freezeStatic} from '../utils/freezeStatic';

/** A corpse model's origin is its feet; its body lies around this point of its own frame. */
const CORPSE_CENTRE=new THREE.Vector3(0,.95,0);
/** Grip feedback: radians of swing and units of sag per hit taken, and the jolt's peak swing. */
const GRIP_SWING=.34,GRIP_SAG=.05,GRIP_JOLT=.3;

export interface InteractionCandidate {
    target:PickupTarget;targetId:string;generation:number;pickup?:import('../shared/pickups').PickupKind;
}

/** U9: a pickup card drops away instead of vanishing. */
const CARD_EXIT:Keyframe[]=[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(46px) rotate(6deg) scale(.9)'}];
/** C1: a claimed supply this far (units) from your rat is the prop its card artwork flies from; otherwise it flies from your rat. */
const CLAIM_REACH=5;
/** Clarity batch (protocol 29): another rat's ball that is not coming at you draws at `dim` brightness (body, rim and
 * trail), so the ones that are stand out. A threat is within `near` units of your chest, or within `range` and heading
 * to pass within `miss` of it. Your own balls always draw full. */
export const THREAT={range:26,miss:2.6,near:4,dim:.55} as const;
/** From this far (units) from its scoring target a carried case's beacon beats at the plain rate. */
const CASE_TARGET_FAR=120;

/** An exhibit replay's view (docs/replay/playback.md): no case tag, buff bar, Dispatch HUD or fix beacons on the
 * page, no headlines, no city reactions and no live sound; its own pools. */
export interface ChaosReplay {
    /** The replay's clock (server ms), in place of `performance.now()`; a state counts as received at its own time. */
    clock:()=>number;
    /** Sounds on the replay bus. */
    synth:typeof playSynth;
    route:VoiceRoute;
    /** Bodies are posed on this fixed step (s), `delay` ms behind the clock, from their own recorded samples, so a
     * body falls the same way each time the clip plays. */
    corpseStep:number;
    delay:number;
}
type CorpseSample={time:number;p:Vec3Data;q:{x:number;y:number;z:number;w:number};v:Vec3Data};
/** `speed`: last presented speed, so a sudden stop reads as an impact for the limbs. In a replay, `since` is the
 * state time it appeared, `samples` its recorded poses and `last` its previous stepped position. */
type CorpseModel={mesh:THREE.Group;animator:RatAnimator;state:CorpseState;hat?:FlyingHat;hatPending:boolean;speed:number;
    since?:number;samples?:CorpseSample[];last?:THREE.Vector3};
const REPLAY_SAMPLES=16;
const SLERP_A=new THREE.Quaternion(),SLERP_B=new THREE.Quaternion();
/** The recorded pose of a replay body at `time` (between its samples; held at either end). */
function replayPose(samples:readonly CorpseSample[],time:number,out:PresentationPose):void {
    let i=0;while(i<samples.length-1&&samples[i+1]!.time<=time)i++;
    const a=samples[i]!,b=samples[Math.min(i+1,samples.length-1)]!,span=b.time-a.time,k=span>0?Math.max(0,Math.min(1,(time-a.time)/span)):0;
    out.p.x=a.p.x+(b.p.x-a.p.x)*k;out.p.y=a.p.y+(b.p.y-a.p.y)*k;out.p.z=a.p.z+(b.p.z-a.p.z)*k;
    SLERP_A.set(a.q.x,a.q.y,a.q.z,a.q.w).slerp(SLERP_B.set(b.q.x,b.q.y,b.q.z,b.q.w),k);
    out.q.x=SLERP_A.x;out.q.y=SLERP_A.y;out.q.z=SLERP_A.z;out.q.w=SLERP_A.w;
}
/** A body's twitch seed from its id, the same on every play of a clip. */
function seedOf(id:string):number {let h=7;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))%997;return h;}

/** Instanced shot draws: balls, Crossfire balls and glows, danger rims and trails, the case
 * missile's trail. Instance colours exist from the start, as play will need them, so the
 * programs never change. The title warm-up builds a one-instance set as a stand-in; the
 * welcome's full set then links nothing. */
export function createShotDraws(capacity:number){
    const ballGeometry=createCheeseBallGeometry(),glowGeometry=new THREE.SphereGeometry(.17,24,16);
    const glow=(color:number,opacity:number)=>new THREE.MeshBasicMaterial({color,side:THREE.BackSide,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const trail=(radius:number,segments:number,rings:number,color:number,opacity:number,count:number)=>
        new THREE.InstancedMesh(new THREE.SphereGeometry(radius,segments,rings),new THREE.MeshBasicMaterial({color,transparent:true,opacity,toneMapped:false,depthWrite:false}),count);
    // The second pool of each shape draws a geometry view of its own over the same buffers (see instanceGeometry).
    const draws={root:new THREE.Group(),
        bullets:new THREE.InstancedMesh(ballGeometry,createCheeseBallMaterial(),capacity),
        chargedBullets:new THREE.InstancedMesh(instanceGeometry(ballGeometry),createCheeseBallMaterial(true),capacity),
        // White: each Crossfire glow takes its heat's colour per instance.
        chargedGlow:new THREE.InstancedMesh(glowGeometry,glow(0xffffff,.96),capacity),
        dangerGlow:new THREE.InstancedMesh(instanceGeometry(glowGeometry),glow(0xff4822,.9),capacity),
        dangerTrails:trail(.1,8,6,0xffffff,.65,capacity),
        missileTrail:trail(.18,8,8,0xff2a12,.42,12),
        dispose(){draws.root.removeFromParent();disposeMeshResources(draws.root);for(const mesh of meshes)mesh.dispose();}};
    const meshes=[draws.bullets,draws.chargedBullets,draws.chargedGlow,draws.dangerGlow,draws.dangerTrails,draws.missileTrail];
    const names=['cheese-balls','crossfire-balls','crossfire-glow','danger-cheese-rims','danger-cheese-trails','case-missile-trail'];
    meshes.forEach((mesh,i)=>{mesh.count=0;mesh.frustumCulled=false;mesh.name=names[i]!;draws.root.add(mesh);});
    // Every ball pool carries instance colours from the start (the clarity batch dims non-threats through them).
    for(const mesh of [draws.bullets,draws.chargedBullets,draws.chargedGlow,draws.dangerGlow,draws.dangerTrails])mesh.setColorAt(0,new THREE.Color(1,1,1));
    return draws;
}

export class ChaosView {
    private readonly reactions:RatReactionEvents;
    private readonly root=new THREE.Group();
    private readonly caseRoot=new THREE.Group();
    private readonly caseMotion:CaseMotion;
    /** The carried case's red-hot look, its cuff and chain, and its carrier's (direct sight). */
    private readonly hotLook:HotCaseLook;
    private readonly extraCases=new Map<string,ExtraCaseVisual>();
    private readonly pickups=new Map<string,PickupVisual>();
    /** Placed Mousetraps, pooled. */
    private readonly traps=new TrapField(this.root,true);
    /** A placed trap set down, snapped, hit or broke (after the view's first state), for sounds and the SNAP. */
    onTrap?:(event:TrapEvent,trap:TrapState)=>void;
    /** Rats shown holding a special weapon. */
    private readonly armed=new Set<string>();
    private readonly buffBar?:HTMLElement;
    private readonly buffCards=new Map<PickupKind,HTMLElement>();
    private healingUntil=0;
    /** C1: your claim waiting for this frame's card, and the pooled card-artwork chip per supply that flies into it. */
    private claimed?:PickupKind;
    private readonly claimChips=new Map<PickupKind,HTMLElement>();
    private readonly claimAt=new THREE.Vector3();
    private readonly claimFrom={x:0,y:0};
    /** Your own supply claim (not other rats'), raised once the card is up. Legacy lockMs is always zero. */
    onClaim?:(kind:PickupKind,camera:THREE.Camera,lockMs:number)=>void;
    private readonly localBuffs:Record<TimedPickup,number>={ironclad:0,hustle:0,stakeout:0};
    private buffsSeen=false;
    /** Your special weapon and its deadline as last seen, so a new claim (or a refresh) is announced once. */
    private localWeapon?:WeaponKind;
    /** The police scanner's calls on screen (not in replays). */
    private scanner?:PoliceScannerFeed;
    private localWeaponUntil=0;
    /** Your Code Violation dud's deadline as last seen (so a new one is announced once), and its card. */
    private dud?:{kind:FaultyKind;card:HTMLElement};
    /** HELD: another rat's Mousetrap has you, until it lets go. */
    private held?:HTMLElement;
    /** K3: the HOT CASE card while you carry the buffed case. */
    private hotCase?:HTMLElement;
    /** K3, each frame: the buffed hot case you carry (null when you do not or are dead), the server time `now` and how
     * near it is to scoring (`caseUrgency`), for the carrier's ping pulse and heartbeat. */
    onCarry?:(mine:CaseState|null,now:number,urgency:number)=>void;
    private readonly pendingInteractions=new Map<string,InteractionCandidate>();
    readonly caseFiles=new CaseFiles();
    private readonly acceptedPickups=new Map<string,{generation:number;tick:number;epoch:string}>();
    private anticipatedCase:{acceptedTick?:number;epoch?:string}|null=null;
    /** Someone else's carrier flashing red through walls at each heartbeat ping. */
    private readonly carrierFlash:CarrierPingFlash;
    private readonly pillars:DispatchPillars;
    private readonly pressureMachine:PressureMachine;
    private readonly hud?:DispatchHud;
    private readonly jurisdictionZones:JurisdictionZones;
    private readonly assignmentDestinations?:AssignmentDestinations;
    private readonly impacts:CheeseImpactEffects;
    /** Crossfire's bounce sparks, scorches and ricochets, a bank kill's path and your aim guide. */
    readonly crossfire:CrossfireVisual;
    private readonly draws=createShotDraws(CHAOS_TUNING.maxShots);
    private readonly bullets=this.draws.bullets;
    private readonly chargedBullets=this.draws.chargedBullets;
    private readonly chargedGlow=this.draws.chargedGlow;
    private readonly dangerGlow=this.draws.dangerGlow;
    private readonly dangerTrails=this.draws.dangerTrails;
    private readonly missileTrail=this.draws.missileTrail;
    private readonly shotMeshes=[this.bullets,this.chargedBullets,this.chargedGlow,this.dangerGlow,this.dangerTrails,this.missileTrail];
    private readonly trailPose=new THREE.Object3D();
    private readonly trailDirection=new THREE.Vector3();
    private readonly trailAxis=new THREE.Vector3(0,0,1);
    private readonly dangerColor=new THREE.Color(0xff602a);
    /** Bad Ammunition: the pale cheese streak behind your own personality balls (enemy balls keep their red-orange). */
    private readonly quirkColor=new THREE.Color(0xffe7a0);
    private readonly fullTint=new THREE.Color(1,1,1);
    private readonly calmTint=new THREE.Color(THREAT.dim,THREAT.dim,THREAT.dim);
    private readonly calmDanger=this.dangerColor.clone().multiplyScalar(THREAT.dim);
    /** K3: a buffed carrier's ball on the red cheese: a deep red core, a bright case-red rim and a case-red streak, full and calm. */
    private readonly carrierTint=new THREE.Color(1.3,.6,.5);
    private readonly calmCarrierTint=this.carrierTint.clone().multiplyScalar(THREAT.dim);
    private readonly carrierRim=new THREE.Color(CASE_RED).multiplyScalar(1.6);
    private readonly calmCarrierRim=this.carrierRim.clone().multiplyScalar(THREAT.dim);
    private readonly carrierStreak=new THREE.Color(CASE_RED).multiplyScalar(1.3);
    private readonly calmCarrierStreak=this.carrierStreak.clone().multiplyScalar(THREAT.dim);
    /** Crossfire heat colours (red, orange, white-hot) for ball tints, glows and trails, full and calm. */
    private readonly heat=heatPalette(THREAT.dim);
    /** Your rat's chest this frame, when you are alive: what other rats' balls are judged a threat to. */
    private readonly threatTarget=new THREE.Vector3();
    private threatAlive=false;
    private myId='';
    private readonly ballPose=new THREE.Object3D();
    /** Polish 12: recent death causes by victim, consumed when the shared corpse appears. */
    private readonly deathStyles=new Map<string,{style:DeathStyle;headshot:boolean;at:number}>();
    private corpses=new Map<string,CorpseModel>();
    /** A replay's last corpse step (server ms), and shots that jolted bodies waiting for the step at their time. */
    private replayTick=-Infinity;
    private readonly replayJolts:{at:number;p:Vec3Data;n:Vec3Data;kick:boolean}[]=[];
    private readonly clock:()=>number;
    private readonly synth:typeof playSynth;
    private arm:THREE.Group|null=null;
    private carrier:RatEntity|null=null;
    private state:ChaosState|null=null;
    /** The carried case's slip: its eased swing (radians) and when the grip last took a hit (performance.now ms). */
    private gripSwing=0;private gripHitAt=-Infinity;
    private receivedAt=0;
    private readonly presentation=new ChaosPresentation();
    private readonly localShots:LocalShotPresentation;
    /** W2: every rat's laser beams, scorches and their zap/crack (yours drawn on the press). */
    private readonly beams:LaserBeamVisual;
    /** Code Violation: when the next malfunction spark (and its zap) may fly. */
    private readonly presented:PresentationPose={p:{x:0,y:0,z:0},q:{x:0,y:0,z:0,w:1}};
    private readonly p=new THREE.Vector3();
    private readonly impactPoint=new THREE.Vector3();
    private readonly impactNormal=new THREE.Vector3();
    private readonly audioPosition=new THREE.Vector3();
    onPresentedShot?: (id:string,p:Vec3Data)=>void;
    /** A launched rat's landing, raised when the playback shows it (your own at once); `speed` is its fall speed. */
    onLanding?: (p:Vec3Data,speed:number)=>void;
    /** R3: a shot jolted a body at `p` (for its squeak). */
    onCorpseJolt?: (p:Vec3Data)=>void;
    /** K1: the case burst paperwork at `p` (taken, knocked loose or shot): `kind` sizes it. */
    onCasePaper?: (p:Vec3Data,kind:'taken'|'loose'|'kick')=>void;
    /** Bad Ammunition: a superball bounced off the world at `p`. */
    onSuperball?: (p:Vec3Data)=>void;
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
    setObserving(value:boolean):void {if(this.hud)this.hud.observing=value;}
    setScores(scores: readonly import('../shared/networkProtocol').ScoreEntry[], myId: string):void {this.myId=myId;this.hud?.setScores(scores,myId);}
    setIncidentRoster(incidents: readonly import('../shared/incidentCatalog').IncidentId[]|undefined):void {
        this.hud?.setRoster(incidents?.length?incidents.map(id=>incidentInfo(id)):undefined);
    }
    /** `replay`: an exhibit replay's view (`ChaosReplay`); `audio` then only voices its machines and pillars on the replay route. */
    constructor(private readonly scene:THREE.Scene,private resolveRat:(id:string)=>RatEntity|undefined,private audio?:AudioContext,private extrapolate=true,private feedback?:(cue:FeedbackCue,origin?:Vec3Data)=>void,private foley?:FoleyWorld,traceShot?:ShotTrace,private readonly replay?:ChaosReplay){
        scene.add(this.caseFiles.root);
        this.clock=replay?.clock??(()=>performance.now());this.synth=replay?.synth??playSynth;
        // The hot case spooks pigeons: their clatter where they burst up (heard far off, in the ranked world mix).
        this.caseFiles.marks.pigeons.onFlush=p=>this.synth('flutter',p,.95+Math.random()*.1,1.6);
        this.reactions=new RatReactionEvents(resolveRat);
        this.localShots=new LocalShotPresentation(traceShot);
        this.root.add(this.draws.root);
        if(!replay)bindIncidentAudio(this.audio);
        // The root and the shot draws (moved by instance) stay put; corpses added later keep updating.
        this.root.name='records-chaos';freezeStatic(this.root);scene.add(this.root);scene.add(this.caseRoot);
        this.caseRoot.name='hot-case';
        this.carrierFlash=new CarrierPingFlash(scene);
        this.hotLook=new HotCaseLook(scene,this.caseRoot,addLeatherBriefcase(this.caseRoot));this.caseMotion=new CaseMotion(this.caseRoot);
        this.caseRoot.userData.aimTarget=true;
        this.pressureMachine=new PressureMachine(scene,this.audio,replay?.route);
        this.pillars=new DispatchPillars(scene,this.audio,replay?.route);
        this.jurisdictionZones=new JurisdictionZones(scene);
        if(!replay){
            this.hud=new DispatchHud(frequency=>this.feedback?this.feedback('tick'):this.bell(frequency),this.feedback);
            this.scanner=new PoliceScannerFeed(document,()=>this.synth('radio',undefined,.97+Math.random()*.06,.7));
            this.assignmentDestinations=new AssignmentDestinations();
            const bar=this.buffBar=document.createElement('div');
            bar.className='pickup-buffs';bar.style.display='none';
            document.body.appendChild(bar);
        }
        this.impacts=new CheeseImpactEffects(scene);this.crossfire=new CrossfireVisual(scene,this.synth);
        this.beams=new LaserBeamVisual(scene,(cue,at,local)=>{if(!local||!feelState().on('heavyCheese'))this.feedback?.(cue,at);});
        this.traps.onEvent=(event,p)=>this.onTrap?.(event,p);
    }
    /** Only the authoritative heal event confirms this instant pickup. */
    showHealing():void {
        this.healingUntil=this.clock()+3200;
        const healing=this.buffCards.get('quick-fix');if(healing)leave(healing,'paperSlide',CARD_EXIT);this.buffCards.delete('quick-fix');
        this.pickupFeedback('quick-fix');
    }
    private pickupFeedback(kind:PickupKind):void {
        this.feedback?.('pickup-slap');this.feedback?.(`pickup-${kind}`);this.claimed=kind;
    }
    /** C1/C3: your claim's card artwork flies from the claimed prop (or your rat) into its card; Ironclad throws silver sparks. */
    private claim(kind:PickupKind,camera:THREE.Camera):void {
        const self=this.resolveRat(this.myId);
        if(!self||self.dead)return;
        const me=self.mesh.position;let best=CLAIM_REACH*CLAIM_REACH;
        this.claimAt.set(me.x,me.y+1.2,me.z);
        for(const pickup of this.state?.pickups??[]){
            const d=(pickup.x-me.x)**2+(pickup.y-me.y)**2+(pickup.z-me.z)**2;
            // The claimed site has already rolled its next pickup, so it is the nearest empty one (or still of this kind).
            if((pickup.kind===kind||(pickup.availableAt??0)>(this.state?.time??0))&&d<best){best=d;this.claimAt.set(pickup.x,pickup.y,pickup.z);}
        }
        const card=this.buffCards.get(kind);
        if(card){
            let chip=this.claimChips.get(kind);
            if(!chip){chip=document.createElement('div');chip.className=`claim-fly powerup-${kind}`;chip.innerHTML=pickupArtwork(kind);chip.setAttribute('aria-hidden','true');this.claimChips.set(kind,chip);}
            this.impactPoint.copy(this.claimAt).project(camera);
            const behind=this.impactPoint.z>1;
            this.claimFrom.x=(behind?.5:Math.min(1,Math.max(0,(this.impactPoint.x+1)/2)))*innerWidth;
            this.claimFrom.y=(behind?.6:Math.min(1,Math.max(0,(1-this.impactPoint.y)/2)))*innerHeight;
            fly(document,chip,this.claimFrom,card,'claimMoment',FEEL.claimMoment.params.flight);
        }
        if(kind==='ironclad'&&feelState().on('claimIronclad'))for(let i=0;i<FEEL.claimIronclad.params.sparks;i++){
            const angle=i*2.4+Math.random();
            this.impacts.spark(this.impactPoint.set(me.x+Math.cos(angle)*.35,me.y+1.1+i*.25,me.z+Math.sin(angle)*.35),this.impactNormal.set(Math.cos(angle),.8,Math.sin(angle)));
        }
        this.onClaim?.(kind,camera,0);
    }
    private clearPickupCards():void {
        this.healingUntil=0;this.claimed=undefined;for(const kind of TIMED_PICKUPS)this.localBuffs[kind]=0;this.localWeapon=undefined;this.localWeaponUntil=0;
        for(const card of this.buffCards.values())leave(card,'paperSlide',CARD_EXIT);
        if(this.dud){leave(this.dud.card,'paperSlide',CARD_EXIT);this.dud=undefined;}
        if(this.held){leave(this.held,'paperSlide',CARD_EXIT);this.held=undefined;}
        if(this.hotCase){leave(this.hotCase,'paperSlide',CARD_EXIT);this.hotCase=undefined;}
        this.buffCards.clear();if(this.buffBar)this.buffBar.style.display=this.buffBar.childElementCount?'flex':'none';
    }
    resetProjectiles():void{
        this.caseFiles.clear();
        this.localShots.clear();this.beams.clear();this.presentation.clear();this.landings.length=0;this.clearPickupCards();this.clearInteractions();this.reactions.reset();
        // gameReset precedes the new chaos snapshot. Do not render or interact
        // with the previous round's confirmed carrier during that gap.
        this.state=null;this.setCarrier(null);this.hotLook.clear();this.root.visible=false;
        this.caseRoot.visible=false;this.carrierFlash.hide();
        for(const visual of this.extraCases.values())visual.dispose();this.extraCases.clear();
        this.assignmentDestinations?.clear();this.jurisdictionZones.clear();
    }
    /** An exhibit replay starting its clip again: every moving thing and body goes, its static machines, pillars,
     * zones and pools stay. Call before its rats are cleared (a carried case lets go of its carrier's paw). */
    rewind():void {
        this.resetProjectiles();
        const contacts=contactShadowsOf(this.scene);
        for(const c of this.corpses.values()){c.hat?.dispose();this.root.remove(c.mesh);contacts?.remove(c.mesh);disposeMeshResources(c.mesh);}
        this.corpses.clear();this.deathStyles.clear();this.replayTick=-Infinity;this.replayJolts.length=0;
        for(const id of this.armed)this.resolveRat(id)?.setWeapon(undefined);this.armed.clear();
        // Supply sites remember what they last showed (their claim and restock bursts): they start the clip afresh,
        // keeping their built props (rebuilding every site's was a quarter of each loop's restart).
        for(const visual of this.pickups.values())visual.restart();
        this.traps.clear();this.impacts.clear();this.crossfire.clear();
        this.gripSwing=0;this.gripHitAt=-Infinity;
    }
    get trapPending():boolean{return this.traps.pending;}
    /** Your trigger: `weapon` is the held special weapon (with the Tommy's heat); `beam` your Laser's predicted path. */
    fire(shot:ShotDescriptor,weapon?:ShotWeapon,beam?:LaserBeam['points']):void {
        if(weapon?.kind==='mousetrap'){this.traps.predict(this.myId,shot);return;}
        if(beam)this.beams.predict(shot.shotId,beam);
        if(!this.extrapolate)return;
        const dispatch=this.state?.dispatch;
        const incident=dispatch?.phase==='active'?incidentInfo(dispatch.incident).id:undefined;
        this.localShots.fire(this.myId,shot,incident,this.clock(),weapon);
    }
    private readonly localMuzzle=()=>this.resolveRat(this.myId)?.getMuzzlePosition()??this.presented.p;
    launch(message:Extract<ServerMessage,{type:'playerShot'}>):void {
        if(this.extrapolate&&!this.localShots.confirm(message,this.clock()))this.presentation.launch(message,this.clock());
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
    /** Scratch for `updateFixBeacons`: the nearest ready kits and their squared distances, nearest first. */
    private readonly nearestFixes:PickupVisual[]=[];
    private readonly nearestFixDistances:number[]=[];
    setLastHitPoint(on:boolean):void {
        if(on===this.lastHitPoint)return;
        this.lastHitPoint=on;
        if(on){this.assignmentDestinations?.clear();}
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
    /** K3: a buffed carrier's ball hit a rat at `point`: a bigger cheese burst and a spray of case-red sparks. */
    carrierHit(point:THREE.Vector3,normal:THREE.Vector3):void {this.impacts.emit(point,normal,false,1.8);this.impacts.spark(point,normal,true);}
    noteDeathStyle(victimId:string,style:DeathStyle,headshot=false):void {
        this.deathStyles.set(victimId,{style,headshot,at:this.clock()});
        if(this.deathStyles.size>32)this.deathStyles.delete(this.deathStyles.keys().next().value!);
    }
    shotResult(message:Extract<ServerMessage,{type:'shotResult'}>):void {if(message.outcome==='rejected'){this.traps.reject(message.shotId);if(this.state)this.syncWeapons(this.state);}this.localShots.result(message);this.reactions.shotResult(message);}
    /** Use the exact segment crossed this display frame so high-speed movement
     * cannot step over a small pickup between render samples. */
    interaction(from:Vec3Data,to:Vec3Data,fullHealth:boolean):InteractionCandidate|undefined {
        const state=this.state;if(!state)return;
        const now=state.time+Math.min(80,Math.max(0,this.clock()-this.receivedAt));
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
        const grip=state.case.owner?state.case.grip??0:0;
        if(grip>(previous?.case.owner===state.case.owner?previous?.case.grip??0:0)){
            this.gripHitAt=this.clock();this.caseMotion.kick();this.feedback?.(grip>=2?'case-grip-2':'case-grip-1',state.case.p);
        }
        // Taken or knocked loose: the case squashes into the paw, or bursts paperwork where it comes loose.
        if(previous&&previous.case.owner!==state.case.owner&&previous.epoch===state.epoch){
            if(state.case.owner)this.caseMotion.taken(this.clock());
            this.onCasePaper?.(state.case.p,state.case.owner?'taken':'loose');
        }
        this.reactions.apply(state);
        this.foley?.apply(state);
        this.state=state;this.root.visible=true;this.receivedAt=this.replay?state.time:this.clock();
        if(this.replay&&!Number.isFinite(this.replayTick))this.replayTick=Math.floor(state.time/(this.replay.corpseStep*1000))*this.replay.corpseStep*1000;
        if(this.anticipatedCase?.acceptedTick!==undefined&&state.epoch===this.anticipatedCase.epoch&&(state.tick??0)>=this.anticipatedCase.acceptedTick)
            this.anticipatedCase=null;
        if(this.extrapolate){this.presentation.apply(state,this.receivedAt);this.localShots.apply(state,this.receivedAt);}
        this.beams.apply(state.beams);
        const extraIds=new Set((state.extraCases??[]).map(c=>c.id));
        for(const [id,visual] of this.extraCases)if(!extraIds.has(id)){visual.dispose();this.extraCases.delete(id);}
        for(const extra of state.extraCases??[]){
            let visual=this.extraCases.get(extra.id);
            if(!visual){visual=new ExtraCaseVisual(this.scene,extra.id,this.resolveRat,this.extrapolate);this.extraCases.set(extra.id,visual);}
            visual.apply(state,extra,this.receivedAt);
        }
        this.syncPickups(state);
        this.syncWeapons(state);
        this.traps.apply(state.traps,previous!==undefined,state.time);
        this.noteLocalBuffs(state);
        for(const hit of state.impacts){
            if(!hit.audioOnly)this.impacts.emit(this.impactPoint.set(hit.p.x,hit.p.y,hit.p.z),this.impactNormal.set(hit.n.x,hit.n.y,hit.n.z),hit.surface,hit.scale??1);
            if(hit.cue==='thud')this.synth('thud',hit.p);
            if(hit.bounces)this.crossfire.bounce(hit.p,hit.n,hit.bounces);
            if(hit.foley==='boing')this.onSuperball?.(hit.p);
            if(hit.foley==='corpse-kick'||hit.foley==='corpse-bounce'&&(hit.energy??0)>16){
                // A replay jolts its bodies on their fixed step, at the hit's time.
                if(this.replay)this.replayJolts.push({at:state.time,p:hit.p,n:hit.n,kick:hit.foley==='corpse-kick'});
                else this.jolt(hit.p,hit.n,hit.foley==='corpse-kick');
            }
            // A ball the authority counted on a launcher's trigger or, failing that, a Dispatch bell.
            if((hit.foley==='trigger'||hit.foley==='trigger-busy')&&this.cameraForTriggers&&!this.pressureMachine.triggerHit(hit.p,hit.foley==='trigger-busy',this.cameraForTriggers))
                this.pillars.hit(hit.p,hit.foley==='trigger-busy',this.cameraForTriggers);
            if(hit.foley==='launch-landing'){
                // Other rats are shown a playback delay behind; your own landing already happened.
                const self=this.resolveRat(this.myId)?.mesh.position,mine=!!self&&Math.hypot(self.x-hit.p.x,self.z-hit.p.z)<3;
                this.landings.push({at:this.clock()+(mine?0:this.presentation.delayMs),p:hit.p,speed:hit.energy??0});
            }
            if(hit.cue==='case-hit'||hit.cue==='armor-clang')this.feedback?.(hit.cue,hit.p);
            // A ball on the loose case: the tag flaps and a few sheets fly.
            if(hit.cue==='case-hit'&&!state.case.owner&&Math.hypot(hit.p.x-state.case.p.x,hit.p.y-state.case.p.y,hit.p.z-state.case.p.z)<2){this.caseMotion.kick();this.onCasePaper?.(hit.p,'kick');}
            if(hit.cue==='armor-clang')this.impacts.spark(this.impactPoint.set(hit.p.x,hit.p.y,hit.p.z),this.impactNormal.set(hit.n.x,hit.n.y,hit.n.z));
            if(!hit.audioOnly&&!this.replay){reactToLandmarkImpact(this.root.parent as THREE.Scene,hit.p);cityImpact(hit.p,hit.cue==='thud'?3:hit.scale??1);this.caseFiles.impact(hit.p,hit.cue==='thud'?3:hit.scale??1);}
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
                // A replay's body: the same twitch and every limb ray each step, whatever else is falling (RatCorpseChain).
                if(this.replay){model.since=state.time;model.samples=[];model.animator.deathSeed=seedOf(c.id);model.animator.chain.unmetered=true;}
                contactShadowsOf(this.scene)?.add(mesh,.9,CORPSE_CENTRE);
                // Up to 16 corpses: one skinned draw each instead of ~40 per pass.
                batchRigidMeshes(mesh);
                const noted=this.deathStyles.get(c.victimId);
                if(noted&&this.clock()-noted.at<2000)model.animator.setDeathStyle(noted.style,noted.headshot);
                this.deathStyles.delete(c.victimId);
            }
            model.state=c;
            if(model.samples){model.samples.push({time:state.time,p:c.p,q:c.q,v:c.v});if(model.samples.length>REPLAY_SAMPLES)model.samples.shift();}
        }
    }
    /** Pickups are static world props: build and place on the snapshot, animate each frame. */
    private syncPickups(state:ChaosState):void{
        const live=new Set((state.pickups??[]).map(p=>p.id));
        for(const [id,visual] of this.pickups)if(!live.has(id)){visual.dispose();this.pickups.delete(id);}
        for(const pickup of state.pickups??[]){
            let visual=this.pickups.get(pickup.id);
            // A site rolls its next pickup on each claim and round: rebuild its prop once the claim pop has played.
            if(visual&&visual.kind!==pickup.kind&&visual.settled){visual.dispose();this.pickups.delete(pickup.id);visual=undefined;}
            if(!visual){visual=new PickupVisual(this.scene,pickup.kind);visual.setXray(this.fixXray);this.pickups.set(pickup.id,visual);}
            visual.setPosition(pickup.x,pickup.y,pickup.z);
            visual.setAvailableAt(pickup.availableAt??0);
            const accepted=this.acceptedPickups.get(pickup.id);
            if(accepted&&state.epoch===accepted.epoch&&(state.tick??0)>=accepted.tick&&(pickup.availableAt??0)!==accepted.generation)
                this.acceptedPickups.delete(pickup.id);
            visual.setPending(this.pendingTarget('pickup',pickup.id)||this.acceptedPickups.has(pickup.id));
        }
    }
    /** Every rat shows the special weapon it holds; one that holds none any more gets its pistol back. */
    private syncWeapons(state:ChaosState):void{
        for(const id of this.armed)if(!heldWeapon(state.buffs,id,state.time)){this.resolveRat(id)?.setWeapon(undefined);this.armed.delete(id);}
        for(const id in state.buffs){
            const weapon=heldWeapon(state.buffs,id,state.time);
            // A new weapon is shown immediately; acquisition does not lock the trigger.
            if(weapon){if(id===this.myId&&weapon==='mousetrap'&&this.traps.pending)continue;this.resolveRat(id)?.setWeapon(weapon);this.armed.add(id);}
        }
    }
    /** Announce a claim locally when the authoritative buff first appears; a new view's first state (a reconnect
     * with a buff running) is only the baseline. */
    private noteLocalBuffs(state:ChaosState):void{
        if(!this.myId)return;
        const mine=state.buffs?.[this.myId],seen=this.buffsSeen;this.buffsSeen=true;
        for(const kind of TIMED_PICKUPS){
            const until=mine?.[BUFF_FIELD[kind]]??0;
            if(seen&&until!==this.localBuffs[kind]&&until>state.time)this.pickupFeedback(kind);
            this.localBuffs[kind]=until;
        }
        const weapon=entryWeapon(mine,state.time),until=mine?.weaponUntil??0;
        if(seen&&weapon&&(weapon!==this.localWeapon||until!==this.localWeaponUntil)){this.pickupFeedback(weapon);}
        // W3: the trap is up in your paws: the next press launches it.
        this.localWeapon=weapon;this.localWeaponUntil=until;
    }
    private updateBuffs(buffs:BuffMap|undefined,now:number):void{
        if(this.resolveRat(this.myId)?.dead){this.clearPickupCards();return;}
        const mine=activeBuffs(buffs,this.myId,now);
        if(!this.buffBar||typeof this.buffBar.replaceChildren!=='function')return;
        for(const kind of TIMED_PICKUPS)this.showCard(kind,mine[BUFF_FIELD[kind]],now);
        // One special weapon at most: a timed one has a clock like a supply, the Mousetrap is held until thrown.
        for(const kind of WEAPON_KINDS)this.showCard(kind,mine.weapon===kind?mine.weaponUntil??Infinity:undefined,now);
        const healing=this.buffCards.get('quick-fix');
        if(this.clock()<this.healingUntil){
            if(!healing){const card=powerupCard('quick-fix');card.setAttribute('role','status');
                this.buffCards.set('quick-fix',card);this.buffBar.appendChild(card);}
        }else {if(healing)leave(healing,'paperSlide',CARD_EXIT);this.buffCards.delete('quick-fix');}
        // Code Violation's dud: its own condemned card, saying what it does to you (the first time), until it wears off.
        if(this.dud&&this.dud.kind!==mine.faulty){leave(this.dud.card,'paperSlide',CARD_EXIT);this.dud=undefined;}
        if(mine.faulty&&mine.faultyUntil!==undefined){
            if(!this.dud){
                this.dud={kind:mine.faulty,card:faultyCard(mine.faulty)};this.buffBar.appendChild(this.dud.card);
                this.dud.card.classList.toggle('explained',!headlines.firstTime(`dud-${mine.faulty}`));
            }
            this.tickCard(this.dud.card,mine.faultyUntil-now,FAULTY_MS[mine.faulty]);
        }
        // A Mousetrap's hold: the HELD card (what it means the first time) and its clock until the trap lets go.
        if(mine.trappedUntil!==undefined){
            if(!this.held){this.held=heldCard();this.held.classList.toggle('explained',!headlines.firstTime('held'));this.buffBar.appendChild(this.held);}
            this.tickCard(this.held,mine.trappedUntil-now,WEAPON_TUNING.trapHoldMs);
        }else if(this.held){leave(this.held,'paperSlide',CARD_EXIT);this.held=undefined;}
        // K3: the HOT CASE card for as long as you carry the buffed case (it replaced the first-time explanation).
        const s=this.state,carrying=!!s&&s.case.owner===this.myId&&s.assignment?.phase==='active';
        if(carrying&&!this.hotCase){this.hotCase=hotCaseCard();this.buffBar.appendChild(this.hotCase);}
        else if(!carrying&&this.hotCase){leave(this.hotCase,'paperSlide',CARD_EXIT);this.hotCase=undefined;}
        this.buffBar.style.display=this.buffBar.childElementCount?'flex':'none';
    }
    /** Show, tick or drop the card of an effect running until `until` (Infinity: held until used). */
    private showCard(kind:TimedPickup|WeaponKind,until:number|undefined,now:number):void{
        if(!this.buffBar)return;
        let card=this.buffCards.get(kind);
        if(!until){if(card)leave(card,'paperSlide',CARD_EXIT);this.buffCards.delete(kind);return;}
        if(!card){
            card=powerupCard(kind);this.buffCards.set(kind,card);this.buffBar.appendChild(card);
            // Ironclad (cheese bounces off you, traps still hold you) and Stakeout are explained the first time.
            if(kind==='ironclad'||kind==='stakeout')headlines.explain(kind);
        }
        const duration=isTimedPickup(kind)?BUFF_MS[kind]:WEAPON_MS[kind];
        if(duration!==undefined)this.tickCard(card,until-now,duration);
    }
    /** A timed card's seconds clock and gauge, `remaining` of `duration` ms; it flickers through its last three seconds. */
    private tickCard(card:HTMLElement,remaining:number,duration:number):void{
        remaining=Math.max(0,remaining);
        const seconds=String(Math.ceil(remaining/1000)),clock=card.querySelector('b')!;
        if(clock.textContent!==seconds)clock.textContent=seconds;
        card.style.setProperty('--remaining',String(Math.min(1,remaining/duration)));
        card.classList.toggle('powerup-expiring',remaining<=3000);
    }

    private setCarrier(entity:RatEntity|null){
        if(this.carrier===entity)return;
        if(this.arm){disposeCaseGrip(this.arm);this.arm=null;}
        this.carrier=entity;
        if(!entity)return;
        this.arm=createCaseGrip(entity);
    }
    /** `renderTime` is the presentation clock (slowed briefly for the victory moment). */
    update(dt:number,camera:THREE.Camera,renderTime=this.clock()){
        this.impacts.update(dt);this.crossfire.update(dt,camera);
        this.beams.update(dt,camera);
        this.traps.update(dt);
        const wall=this.clock();
        for(let i=0;i<this.landings.length;){
            const landing=this.landings[i]!;
            if(landing.at>wall){i++;continue;}
            this.landings.splice(i,1);this.onLanding?.(landing.p,landing.speed);
        }
        camera.getWorldPosition(this.audioPosition);
        if(this.audio&&!this.replay)bindIncidentAudio(this.audio,this.audioPosition);
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
            // A weakened grip: the case swings out of the fist a step per hit and eases back once the grip is whole; each hit jolts it.
            const grip=s.case.owner?s.case.grip??0:0,since=(wall-this.gripHitAt)/1000,swing=this.caseMotion.carried(dt);
            this.gripSwing+=(grip*GRIP_SWING-this.gripSwing)*Math.min(1,dt*(grip?14:4));
            slipCaseCarryPose(this.caseRoot,this.gripSwing+swing+(since<.45?Math.sin(since*38)*Math.exp(-since*8)*GRIP_JOLT:0),this.gripSwing/GRIP_SWING*GRIP_SAG);
            contactShadowsOf(this.scene)?.remove(this.caseRoot);
        }else{
            if(!this.extrapolate||!this.presentation.looseCase(renderTime,this.presented))copyPresentationPose(s.case,this.presented);
            const {p,q}=this.presented;
            this.caseRoot.position.set(p.x,p.y,p.z);this.caseRoot.quaternion.set(q.x,q.y,q.z,q.w);
            // A loose case is grounded by a contact disc; a carried one by its carrier's.
            contactShadowsOf(this.scene)?.add(this.caseRoot,.5);
            this.caseMotion.loose(wall,Math.hypot(s.case.v.x,s.case.v.y,s.case.v.z));
        }
        this.caseMotion.finish(dt,wall);
        this.caseFiles.update(s.clues??[],now,camera,dt,this.resolveRat(this.myId)?.mesh.position,s.prints??[],s);
        this.hotLook.update(camera,renderTime,s.case,now,this.carrier,this.arm?.parent??null);
        // Physical evidence replaces the primary case's through-wall and screen locators.
        this.carrierFlash.hide();
        for(const visual of this.extraCases.values())visual.update(camera,renderTime,now);
        for(const visual of this.pickups.values())visual.update(now,camera);
        if(this.buffBar)this.updateBuffs(s.buffs,now);
        if(this.onCarry){
            const self=this.resolveRat(this.myId),mine=s.case.owner===this.myId&&s.assignment?.phase==='active'&&!!self&&!self.dead;
            this.onCarry(mine?s.case:null,now,mine?this.caseUrgency(s):0);
        }
        if(this.claimed){const kind=this.claimed;this.claimed=undefined;this.claim(kind,camera);}

        if(this.fixXray)this.updateFixBeacons(camera,now);
        this.bullets.count=0;this.chargedBullets.count=0;this.chargedGlow.count=0;this.missileTrail.count=0;this.dangerGlow.count=0;this.dangerTrails.count=0;
        const active=s.dispatch.phase==='active'?incidentInfo(s.dispatch.incident).id:undefined,crossfire=active==='crossfire';
        // Bad Ammunition: each ball's personality shows in its look as well as its path (the path itself is real): a
        // superball is big and bouncy, a floater a fat lazy bubble, a hiccup quivers while it hangs, a corkscrew spins
        // hard, a snake waggles; each trails a pale streak so its path reads. Your own carry their personality; other
        // rats' are named by their id (never a special weapon's ball, never neutral debris).
        const bad=active==='bad-ammunition'&&feelState().on('badAmmo');
        const heavy=s.assignment?.phase==='active'&&!!s.case.owner;
        const shots=this.extrapolate?this.localShots.render(this.presentation.renderShots(s.shots,renderTime),renderTime):s.shots;
        const me=this.resolveRat(this.myId);this.threatAlive=!!me&&!me.dead;
        if(me)this.threatTarget.set(me.mesh.position.x,me.mesh.position.y+1,me.mesh.position.z);
        for(let i=0;i<Math.min(shots.length,CHAOS_TUNING.maxShots);i++){
            const shot=shots[i];
            const p=this.localShots.owns(shot.id)||!(this.extrapolate&&this.presentation.shot(shot.id,renderTime,this.presented,shot.owner===this.myId?this.localMuzzle:undefined))?shot.p:this.presented.p;
            this.onPresentedShot?.(shot.id,p);
            this.ballPose.position.set(p.x,p.y,p.z);
            let quirk=shot.quirk;
            if(!quirk&&bad&&shot.owner&&!heldWeapon(s.buffs,shot.owner,s.time)){quirk=badRound(shot.id);if(quirk!=='superball'&&shot.wallBounced)quirk=undefined;}
            // The case carrier's balls hit twice as hard in every assignment, and look it: heavier, red-cored, a red rim
            // and streak (K3; a Crossfire ball keeps its heat colours).
            const carried=heavy&&shot.owner===s.case.owner;
            let look=carried?1.35:1,spin=1;
            // The Persuader's slug: a fat ball of cheese, its size the size it hits with, turning slowly.
            if(shot.slug){look*=WEAPON_TUNING.persuaderRadius/BALL_RADIUS;spin=.4;}
            if(quirk==='superball'){look=1.4+.12*Math.sin(now*.05+i);spin=3;}
            else if(quirk==='floater'){look=1.7+.12*Math.sin(now*.008+i);spin=.3;}
            else if(quirk==='hiccup'){const hang=shot.age>=BAD_AMMO.hiccup.stopAt&&shot.age<BAD_AMMO.hiccup.goAt;look=hang?1.3+.3*Math.sin(now*.07):1.15;}
            else if(quirk==='corkscrew')spin=5;
            else if(quirk==='snake')spin=2;
            this.ballPose.rotation.set(now*.015*spin+i,now*.009*spin,quirk==='snake'?Math.sin(now*.02)*.8:0);
            this.ballPose.scale.setScalar(look);this.ballPose.updateMatrix();
            const own=shot.owner===this.myId||!!(shot.owner&&this.resolveRat(shot.owner)?.isPlayer);
            // Clarity: other rats' balls that are not coming at you draw dimmer, so the ones that are stand out.
            const calm=!own&&!this.threatens(p,shot.v);
            // Crossfire: a bounced ball is on fire, and each bounce heats it on through orange to white-hot, faster, its streak
            // stretching with its speed out to a tracer round's.
            // One bounce and it is fully on fire: every hot ball wears the top fire look (visual level 2).
            const hot=crossfire&&shot.wallBounced,level=2;
            // A carrier's ball is drawn in the red cheese (the Crossfire material), so its core reads deep red, not orange.
            const batch=hot||carried?this.chargedBullets:this.bullets;
            const ballIndex=batch.count++;batch.setMatrixAt(ballIndex,this.ballPose.matrix);
            batch.setColorAt(ballIndex,hot?(own?this.heat.own:calm?this.heat.calm:this.heat.enemy)[level]!:carried?(calm?this.calmCarrierTint:this.carrierTint):calm?this.calmTint:this.fullTint);
            // Your own hot ball gets no enemy glow, but once it has heated past red it trails its heat too.
            if(!own||quirk||carried||hot&&level>0){
                this.ballPose.scale.setScalar(look*(hot?1.14+.08*level:carried?1.22:1));this.ballPose.updateMatrix();
                if(!own||carried&&!hot){const rim=hot||carried?this.chargedGlow:this.dangerGlow,at=rim.count++;rim.setMatrixAt(at,this.ballPose.matrix);rim.setColorAt(at,hot?(calm?this.heat.calmRim:this.heat.rim)[level]!:carried?(calm?this.calmCarrierRim:this.carrierRim):calm?this.calmTint:this.fullTint);}
                this.trailDirection.set(shot.v.x,shot.v.y,shot.v.z);
                if(this.trailDirection.lengthSq()>.01){
                    const speed=this.trailDirection.length();this.trailDirection.divideScalar(speed);
                    // A carrier's streak: about four ball lengths of case red, twice as thick.
                    const length=hot?heatStreak(speed):carried?8*BALL_RADIUS*look:.85,width=carried&&!hot?1:.5;
                    this.trailPose.position.copy(this.ballPose.position).addScaledVector(this.trailDirection,-BALL_RADIUS-length/2);
                    this.trailPose.quaternion.setFromUnitVectors(this.trailAxis,this.trailDirection);
                    this.trailPose.scale.set(width,width,length/.2);this.trailPose.updateMatrix();
                    const at=this.dangerTrails.count++;this.dangerTrails.setMatrixAt(at,this.trailPose.matrix);
                    this.dangerTrails.setColorAt(at,hot?(calm?this.heat.calmTrail:this.heat.trail)[level]!:carried?(calm?this.calmCarrierStreak:this.carrierStreak):own?this.quirkColor:calm?this.calmDanger:this.dangerColor);
                }
            }
            if(hot)this.crossfire.flames.ball(p,shot.v,level,calm?THREAT.dim:own?.7:1,dt,heatStreak(Math.hypot(shot.v.x,shot.v.y,shot.v.z)));
        }
        const missiles=[s.case,...s.extraCases??[]].filter(c=>!c.owner&&(c.missileOwner||evidence));
        let nearestCase=missiles[0],nearestDistance=Infinity;
        for(const missile of missiles){
            const distance=(this.audioPosition.x-missile.p.x)**2+(this.audioPosition.y-missile.p.y)**2+(this.audioPosition.z-missile.p.z)**2;
            if(distance<nearestDistance){nearestDistance=distance;nearestCase=missile;}
        }
        if(!this.replay)startCaseBuzz(evidence&&!!nearestCase,nearestCase?.p);
        for(const missile of missiles.slice(0,8)){
            const visual=missile===s.case?this.caseRoot:'id' in missile&&typeof missile.id==='string'?this.extraCases.get(missile.id)?.root:undefined;
            if(!visual)continue;
            this.ballPose.position.copy(visual.position);this.ballPose.quaternion.copy(visual.quaternion);
            this.ballPose.scale.set(1.5,.8,1.2);this.ballPose.updateMatrix();
            this.missileTrail.setMatrixAt(this.missileTrail.count++,this.ballPose.matrix);
        }
        // An empty pool still costs a program bind and uniform upload per frame, and its instance buffer an upload.
        for(const mesh of this.shotMeshes){mesh.visible=mesh.count>0;if(mesh.count){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}}
        if(this.replay)this.stepReplayCorpses(renderTime,this.replay);
        else for(const c of this.corpses.values()){
            const b=c.state;
            if(!this.extrapolate||!this.presentation.corpse(b.id,renderTime,this.presented))copyPresentationPose(b,this.presented);
            const {p,q}=this.presented;c.mesh.quaternion.set(q.x,q.y,q.z,q.w);
            c.mesh.position.set(p.x,p.y,p.z);
            c.mesh.position.sub(this.p.set(0,.95,0).applyQuaternion(c.mesh.quaternion));
            // The server box has no contact events here: a sharp drop in speed is the landing.
            const speed=Math.hypot(b.v.x,b.v.y,b.v.z),impact=Math.max(0,Math.min(1,(c.speed-speed-4)/20));c.speed=speed;
            c.animator.poseDeath((now-b.born)/1000,dt,b.spin,impact,speed<.6);
            if(c.hatPending)this.popCorpseHat(c,now,b.v);
            c.hat?.update(dt);
        }
        const d=s.dispatch;
        const localCase=[s.case,...s.extraCases??[]].find(c=>c.owner&&this.resolveRat(c.owner)?.isPlayer);
        const hudCase=localCase??s.case,hudOwner=hudCase.owner?this.resolveRat(hudCase.owner):undefined;
        const caller=d.caller?this.resolveRat(d.caller):undefined;
        this.hud?.update(hudCase===s.case?s:{...s,case:hudCase},now,hudOwner?.name,!!hudOwner?.isPlayer,caller?.isPlayer?'you':caller?.name);
        this.scanner?.update(s.scanner??[],now);
        if(this.lastHitPoint)this.assignmentDestinations?.clear();else this.assignmentDestinations?.updateCue(s.assignment,camera,this.resolveRat(this.myId)?.mesh.position);this.jurisdictionZones.update(s.assignment);
        this.cameraForTriggers=camera;
        this.pressureMachine.update(s.pressure,now,camera,active==='pressure-surge',false);
        this.pillars.update(d,now,camera,false);
    }
    /** Polish 11: a fresh body pops its fedora on its first pose; `now` the body's clock (server ms), `v` its velocity. */
    private popCorpseHat(c:CorpseModel,now:number,v:Vec3Data):void {
        c.hatPending=false;c.mesh.updateMatrixWorld(true);
        const hat=c.mesh.getObjectByName('rat-hat'),b=c.state;
        if(!hat)return;
        const params=FEEL.hatPop.params;
        // Ground under the body: the lowest point the corpse box has reached (never rises).
        let floor=Infinity;const mesh=c.mesh,e=new THREE.Matrix4();
        c.hat=new FlyingHat(this.root.parent as THREE.Scene,hat,this.p.set(v.x,0,v.z),()=>{
            e.makeRotationFromQuaternion(mesh.quaternion);const m=e.elements;
            const centre=mesh.position.y+m[5]*.95,extent=Math.abs(m[1])*.48+Math.abs(m[5])*.92+Math.abs(m[9])*.38;
            return floor=Math.min(floor,centre-extent);
        },params.speed,params.lift,b.born%97);
        c.animator.setHatHidden(true);c.animator.poseDeath((now-b.born)/1000,0,b.spin,0,false);
    }
    /** R3: a shot or bounce at `p` jolts the nearest body within reach (a kick harder, pushed along `n`). */
    private jolt(p:Vec3Data,n:Vec3Data,kick:boolean):void {
        let nearest:{animator:RatAnimator}|undefined,best=2.5*2.5;
        for(const corpse of this.corpses.values()){
            const q=corpse.mesh.position,d=(q.x-p.x)**2+(q.y+.9-p.y)**2+(q.z-p.z)**2;
            if(d<best){best=d;nearest=corpse;}
        }
        nearest?.animator.joltDeath(kick?1:.5,p,kick?n:undefined);
        if(nearest&&kick)this.onCorpseJolt?.(p);
    }
    /** An exhibit replay's bodies, on the replay's fixed step up to `renderTime`: each pose is read `delay` ms back
     * from its own samples, and jolts land on the step at their time, so the fall never depends on the frame rate. */
    private stepReplayCorpses(renderTime:number,replay:ChaosReplay):void {
        const step=replay.corpseStep*1000;
        while(this.replayTick+step<=renderTime){
            const t=this.replayTick+=step,seen=t-replay.delay;
            for(let i=0;i<this.replayJolts.length;){
                const jolt=this.replayJolts[i]!;
                if(jolt.at>t){i++;continue;}
                this.replayJolts.splice(i,1);this.jolt(jolt.p,jolt.n,jolt.kick);
            }
            for(const c of this.corpses.values()){
                if(c.since!>t||!c.samples?.length)continue;
                const b=c.state;
                replayPose(c.samples,seen,this.presented);
                const {p,q}=this.presented;c.mesh.quaternion.set(q.x,q.y,q.z,q.w);
                c.mesh.position.set(p.x,p.y,p.z).sub(this.p.set(0,.95,0).applyQuaternion(c.mesh.quaternion));
                // The landing reads from the stepped body itself (no velocity from a later state).
                const speed=c.last?c.last.distanceTo(c.mesh.position)/replay.corpseStep:0,impact=Math.max(0,Math.min(1,(c.speed-speed-4)/20));
                (c.last??=new THREE.Vector3()).copy(c.mesh.position);c.speed=speed;
                c.animator.poseDeath(Math.max(0,seen-b.born)/1000,replay.corpseStep,b.spin,impact,speed<.6);
                if(c.hatPending)this.popCorpseHat(c,seen,c.samples[0]!.v);
                c.hat?.update(replay.corpseStep);
            }
        }
    }
    /** Whether a ball at `p` moving at `v` threatens your rat this frame (`THREAT`); never while you are dead or away. */
    private threatens(p:Vec3Data,v:Vec3Data):boolean {
        if(!this.threatAlive)return false;
        const t=this.threatTarget,rx=t.x-p.x,ry=t.y-p.y,rz=t.z-p.z,d2=rx*rx+ry*ry+rz*rz;
        if(d2<THREAT.near*THREAT.near)return true;
        if(d2>THREAT.range*THREAT.range)return false;
        const along=rx*v.x+ry*v.y+rz*v.z,speed2=v.x*v.x+v.y*v.y+v.z*v.z;
        return along>0&&speed2>0&&d2-along*along/speed2<THREAT.miss*THREAT.miss;
    }
    private updateFixBeacons(camera:THREE.Camera,now:number){
        // The three nearest ready kits, kept sorted by insertion; equal distances keep pickup order.
        const nearest=this.nearestFixes,distances=this.nearestFixDistances;
        let found=0;
        for(const visual of this.pickups.values()){
            if(!visual.readyQuickFix(now))continue;
            const d=visual.root.position.distanceToSquared(camera.position);
            if(found===3&&!(d<distances[2]))continue;
            let i=found<3?found++:2;
            for(;i>0&&distances[i-1]>d;i--){distances[i]=distances[i-1];nearest[i]=nearest[i-1];}
            distances[i]=d;nearest[i]=visual;
        }
        for(let i=0;i<3;i++){
            let beacon=this.fixBeacons[i];
            const visual=i<found?nearest[i]:undefined;
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
    /** The marker's inline opacity while it shows a ping (-1: the stylesheet's). */
    /** How near a carried case is to where it scores (the Paper Chase drop-off or the active Jurisdiction zone): 0 from
     * `CASE_TARGET_FAR` units or with no target, 1 there: the hot case heartbeat quickens with it. */
    caseUrgency(s:ChaosState):number {
        const a=s.assignment;if(!s.case.owner||a?.phase!=='active')return 0;
        const next=activeDestination(a);
        const t=next?ASSIGNMENT_DESTINATIONS[next].approach:a.jurisdiction?JURISDICTION_ZONES[activeZone(a.jurisdiction)].posts[0]:undefined;
        if(!t)return 0;
        return 1-Math.min(1,Math.hypot(t.x-s.case.p.x,t.z-s.case.p.z)/CASE_TARGET_FAR);
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
    getDiagnostics(){return {clues:this.caseFiles.visibleIds,receivedShots:this.state?.shots.length??0,renderedBalls:this.bullets.count+this.chargedBullets.count,corpses:this.corpses.size,snapshotAgeMs:this.receivedAt?performance.now()-this.receivedAt:null,presentation:this.extrapolate?this.presentation.diagnostics():null};}
    dispose(){
        this.caseFiles.dispose();
        for(const beacon of this.fixBeacons)beacon.remove();
        for(const c of this.corpses.values())c.hat?.dispose();
        this.clearPickupCards();this.buffBar?.remove();for(const chip of this.claimChips.values())chip.remove();
        this.clearInteractions();
        this.localShots.clear();
        this.pillars.dispose();this.assignmentDestinations?.dispose();this.jurisdictionZones.dispose();
        this.presentation.clear();
        for(const visual of this.extraCases.values())visual.dispose();this.extraCases.clear();
        // Supply sites live at the scene root: a reconnect's new view would otherwise draw over stale ones.
        for(const visual of this.pickups.values())visual.dispose();this.pickups.clear();
        this.traps.dispose();for(const id of this.armed)this.resolveRat(id)?.setWeapon(undefined);this.armed.clear();
        this.pressureMachine.dispose();this.carrierFlash.dispose();this.setCarrier(null);this.hotLook.dispose();this.hud?.dispose();this.scanner?.dispose();this.root.removeFromParent();this.caseRoot.removeFromParent();
        const contacts=contactShadowsOf(this.scene);contacts?.remove(this.caseRoot);for(const c of this.corpses.values())contacts?.remove(c.mesh);
        disposeMeshResources(this.caseRoot);
        // The incident sounds are the live view's (module-wide); a replay's own voices end with its bus.
        if(!this.replay){startCaseBuzz(false);disposeIncidentAudio();}
        this.impacts.dispose();this.crossfire.dispose();this.beams.dispose();
        this.draws.dispose();disposeMeshResources(this.root);
    }
}
