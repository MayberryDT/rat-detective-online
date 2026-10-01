import * as THREE from 'three';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';
import {INCIDENT_TUNING} from '../shared/chaosState';

/** Ordinary shot → spin, explosion → fling, neutral trap/case → flop, killed mid-launch → flail. */
export type DeathStyle='default'|'spin'|'fling'|'flop'|'flail';
import {RAT_PISTOL_GRIP,updateGunSleeve,type GunSleeveRig} from './RatArmModel';
import { RatLocomotionFollowThrough } from './RatLocomotionFollowThrough';
import {RatActing,type RatReaction} from './RatActing';
import {RatRagdoll} from './RatRagdoll';
import {RatCorpseChain} from './RatCorpseChain';
import {RAT_SPINE_JOINTS} from './RatModel';
import {setDeformer} from './RigidMeshBatch';
import type {TimedPickup} from '../shared/pickups';

/** Polish 14 parts, present only on rats built with model touch-ups. */
const EXTRA_PARTS = ['rat-brow-left','rat-brow-right','rat-whiskers-left','rat-whiskers-right','rat-shoe-left','rat-shoe-right',
    'rat-mouth','rat-tongue','rat-x-left','rat-x-right'] as const;
type ExtraKind='brow'|'whiskers'|'shoe'|'pupil'|'mouth'|'tongue'|'x';
const EXTRA_KIND:Record<typeof EXTRA_PARTS[number],ExtraKind>={
    'rat-brow-left':'brow','rat-brow-right':'brow','rat-whiskers-left':'whiskers','rat-whiskers-right':'whiskers',
    'rat-shoe-left':'shoe','rat-shoe-right':'shoe','rat-mouth':'mouth','rat-tongue':'tongue','rat-x-left':'x','rat-x-right':'x',
};
interface ExtraPart {part:THREE.Object3D;kind:ExtraKind;side:number;position:THREE.Vector3;rotation:THREE.Euler;scale:THREE.Vector3}
/** A deforming tail: its rest shape, each vertex's ring (a TubeGeometry ring shares one u), each
 * ring's u and the offsets its geometry shows, and the pose (`RatAnimator.tailPose`) it last caught up to. */
interface TailRig {tail:THREE.Mesh<THREE.TubeGeometry>;rest:Float32Array;ring:Uint8Array;ringU:Float64Array;offsets:Float64Array;tip:THREE.Object3D;tipRest:THREE.Vector3;shown:number;centers?:Float64Array}
/** The tail's rest centre line at each ring. Its path never changes: read once when the tail first lies dead. */
function restCenters(path:THREE.Curve<THREE.Vector3>,ringU:Float64Array):Float64Array {
    const centers=new Float64Array(ringU.length*3),point=new THREE.Vector3();
    for(let r=0;r<ringU.length;r++){path.getPointAt(ringU[r],point);centers[r*3]=point.x;centers[r*3+1]=point.y;centers[r*3+2]=point.z;}
    return centers;
}
const PARTS = ['rat-body', 'rat-head', 'rat-hat', 'rat-tail',
    'rat-eye-left', 'rat-eye-right', 'rat-ear-left', 'rat-ear-right', 'rat-arm', 'rat-pistol'] as const;
/** R1: the soft-spine joints (absent on the frozen reference models). */
const HIP_JOINT = RAT_SPINE_JOINTS[0], WAIST = RAT_SPINE_JOINTS[1];

/** L5 hat blow-off, seconds from lift to landing back on the head. */
const HAT_BLOW = 1.1;

export const RAT_CARRY_SHOULDER = new THREE.Vector3(.43, 1.23, .02);

/** One shared shoulder pivot keeps the sleeve, gripping paw and case together. */
export function getRatCarryAnchor(root: THREE.Group): THREE.Object3D {
    let anchor = root.getObjectByName('rat-carry-anchor');
    if (!anchor) {
        anchor = new THREE.Object3D();
        anchor.name = 'rat-carry-anchor';
        anchor.position.copy(RAT_CARRY_SHOULDER);
        (root.getObjectByName('rat-spine-chest') ?? root.getObjectByName('rat-body'))!.add(anchor);
    }
    return anchor;
}

/** Small procedural poses shared by the visible character and its outline shell. */
export class RatAnimator {
    private readonly locomotion = new RatLocomotionFollowThrough();
    private locomotionPolish = true;
    private readonly acting:RatActing;
    private actingEnabled = true;
    private hustle = false;
    /** Big Cheese: the pistol swells chunky around the hand (eased in and out). */
    bigPistol = false;
    private pistolGrowth = 0;
    private readonly rigs;
    private readonly spines;
    private readonly gunSleeves:GunSleeveRig[];
    private readonly carryAnchor: THREE.Object3D;
    private verticalSpeed = 0;
    private airPose = 0;
    private jumpLift = 0;
    private jumpLanding = 0;
    /** Seconds until a supply claim's pop follows its squash (the jump stretch), and how big. */
    private popIn = 0;
    private popSize = 0;
    /** Bumped by every pose; a tail is deformed to it only when drawn (off-screen rats and hidden outline shells skip the work). */
    private tailPose = 0;
    private tailReset = false;
    private tailMotion = 0;
    private tailTurn = 0;
    private time = 0;
    private stride = 0;
    private movement = 0;
    private recoil = 0;
    private flashAge = 1;
    private readonly muzzleFlash: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    private acceleration = 0;
    private coatTurn = 0;
    private respawnAge = 1;
    private hit = 0;
    private hitAge = 10;
    /** Polish 11: fedora knocked askew by a hit, then settling; hidden after it pops off. */
    private hatKnockAge = 10;
    /** L5: a launcher blast lifts the hat off, spins it and drops it back on. */
    private hatBlowAge = 10;
    private hatBlowSpin = 1;
    /** L6: launcher-flight flailing, 0…1 (legs kick, tail whips, ears and whiskers stream). */
    private flail = 0;
    /** A1 air acting: airborne (a take-off or a fall until the landing), its smoothed amount, the smoothed vertical
     * speed, seconds standing still in the air, the lean and banking spring into travel, and the landing's wobble. */
    private inAir = false;
    private air = 0;
    private airVertical = 0;
    private airStill = 0;
    private airPitch = 0;
    private airBank = 0;
    private airBankRate = 0;
    private landAge = 10;
    private landSize = 0;
    /** This frame's air phases (0…1, already scaled by `air`), read by the extras. */
    private airRise = 0;
    private airFall = 0;
    private airApex = 0;
    private readonly airTilt = new THREE.Euler();
    private readonly airPivot = new THREE.Vector3();
    /** M1: seconds since a scream (launch) or startle (near miss) began, and how big it was. */
    private screamAge = 10;
    private screamSize = 1;
    /** M1: ears and whiskers bounce on vertical jolts (angle, rate). */
    private earFlop = 0;
    private earFlopRate = 0;
    /** M2: the tail swings out behind turns (offset, rate). */
    private tailSwing = 0;
    private tailSwingRate = 0;
    /** M1: how open the mouth (and wide the eyes) are this frame, 0…1. */
    private mouthOpen = 0;
    private hatKnockZ = 0;
    private hatKnockX = 0;
    private hatHidden = false;
    /** Polish 12: cause-flavoured death secondary motion (presentation only). */
    private deathStyle:DeathStyle='default';
    /** R3: rats built with the dead face (X eyes and tongue) swap it in for closed lids. */
    private readonly hasDeadFace:boolean;
    /** R1: floppy limbs on a corpse, started once per death. */
    private readonly ragdoll = new RatRagdoll();
    private ragdollStarted = false;
    private deathHeadshot = false;
    /** Seventh batch R2: the corpse's point chain; `chain.ignore` is its own local physics body. */
    readonly chain = new RatCorpseChain();
    private readonly anchor = new THREE.Vector3();
    private readonly joltPush = new THREE.Vector3();
    /** Tail tip offset from the chain (tail space); zero otherwise. */
    private readonly tailTip = new THREE.Vector3();
    private readonly localSpin = new THREE.Vector3();
    private readonly localGravity = new THREE.Vector3();
    private readonly tailFall = new THREE.Vector3();
    private landingPulse = 0;
    private deathAnimation = false;
    private readonly tailCenter = new THREE.Vector3();
    /** Per-ring tail offsets for the pose being shown; every vertex of a ring shares them. */
    private ringOffset = new Float64Array(0);
    private readonly inverseTail = new THREE.Matrix4();
    private turn = 0;
    private aimHold = 0;
    private aim = 0;
    private aimTarget: THREE.Vector3 | null = null;
    private readonly aimDirection = new THREE.Vector3();
    private readonly armPosition = new THREE.Vector3();
    private readonly parentRotation = new THREE.Quaternion();
    private readonly aimRotation = new THREE.Quaternion();
    private readonly forward = new THREE.Vector3(0, 0, 1);
    private lastPosition: THREE.Vector3 | null = null;
    private lastYaw = 0;
    private readonly orientation = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly extras: ExtraPart[] = [];
    /** Polish 15 animation-pass state. */
    private skidAge = 10;
    private nodAge = 10;
    private pulseAge = 10;
    private pulseKind: TimedPickup|'heal' = 'heal';
    private flight = 0;
    private readonly velocity = new THREE.Vector3();
    private readonly lastVelocity = new THREE.Vector3();
    /** Set when a skid starts; the entity consumes it for dust (polish 16). */
    skidStarted = false;
    /** Fall speed of the latest hard landing, consumed for dust (polish 16). */
    landedFall = 0;
    /** Set when a launcher flight begins, consumed for dust (polish 16). */
    launched = false;
    private wasLaunched = false;

    constructor(private readonly root: THREE.Group, outline?: THREE.Group) {
        this.acting=new RatActing(root.uuid);
        const models = outline ? [root, outline] : [root];
        this.gunSleeves=models.flatMap(model=>{
            const shoulder=model.getObjectByName('rat-gun-shoulder');
            return shoulder?[{shoulder,sleeve:shoulder.getObjectByName('rat-floating-sleeve')!,
                arm:model.getObjectByName('rat-arm')!,pistol:model.getObjectByName('rat-pistol')!}]:[];
        });
        this.carryAnchor = getRatCarryAnchor(root);
        for (const model of models) {
            for (const name of EXTRA_PARTS) {
                const part = model.getObjectByName(name);
                if (part) this.extras.push({part, kind:EXTRA_KIND[name],
                    side:name.endsWith('-left')?-1:1, position:part.position.clone(), rotation:part.rotation.clone(), scale:part.scale.clone()});
            }
            model.traverse(object => {
                if (object.name !== 'rat-pupil') return;
                const side = object.parent?.name === 'rat-eye-left' ? -1 : 1;
                this.extras.push({part:object, kind:'pupil', side, position:object.position.clone(), rotation:object.rotation.clone(), scale:object.scale.clone()});
            });
        }
        this.hasDeadFace=this.extras.some(extra=>extra.kind==='x');
        // The firing cue follows the actual animated barrel. A ball frozen at a
        // prior world-space muzzle appears behind the gun as the rat moves.
        const vertices: number[] = [];
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6;
            const r = i % 2 ? .045 : .11, next = i % 2 ? .11 : .045;
            vertices.push(0, 0, .23, Math.cos(a) * r, Math.sin(a) * r, .015,
                Math.cos(b) * next, Math.sin(b) * next, .015);
        }
        const flashGeometry = new THREE.BufferGeometry();
        flashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        flashGeometry.computeVertexNormals();
        this.muzzleFlash = new THREE.Mesh(flashGeometry, new THREE.MeshStandardMaterial({
            color: 0xffe9b0, emissive: 0xffe9b0, emissiveIntensity: .3, toneMapped: false,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
            side: THREE.DoubleSide, forceSinglePass: true, fog: false,
        }));
        this.muzzleFlash.name = 'rat-muzzle-flash';
        this.muzzleFlash.visible = false;
        this.muzzleFlash.raycast = () => {};
        root.getObjectByName('rat-muzzle')!.add(this.muzzleFlash);
        for (const model of models) {
            const tail = model.getObjectByName('rat-tail') as THREE.Mesh<THREE.TubeGeometry>;
            const positions = tail.geometry.getAttribute('position') as THREE.BufferAttribute, uv = tail.geometry.getAttribute('uv');
            positions.setUsage(THREE.DynamicDrawUsage);
            const segments = tail.geometry.parameters.tubularSegments, ring = new Uint8Array(positions.count), ringU = new Float64Array(segments + 1);
            for (let i = 0; i < ring.length; i++) { ring[i] = Math.round(uv.getX(i) * segments); ringU[ring[i]] = uv.getX(i); }
            const rig: TailRig = { tail, rest: Float32Array.from(positions.array), ring, ringU, offsets: new Float64Array((segments + 1) * 3),
                tip: tail.children[0], tipRest: tail.children[0].position.clone(), shown: 0 };
            // Deformed only right before a draw (by the renderer or the rigid batch drawing the tail).
            setDeformer(tail, () => this.showTail(rig));
            if (this.ringOffset.length < ringU.length * 3) this.ringOffset = new Float64Array(ringU.length * 3);
        }
        this.rigs = models.map(model => PARTS.map(name => {
            const part = model.getObjectByName(name)!;
            return { part, position: part.position.clone(), rotation: part.rotation.clone(), scale: part.scale.clone() };
        }));
        this.spines = models.map(model => {
            const belly = model.getObjectByName('rat-spine-belly'), chest = model.getObjectByName('rat-spine-chest');
            return belly && chest ? {belly, chest} : undefined;
        });
    }

    takeHit(direction?:THREE.Vector3): void {
        this.hit = 1;
        this.hitAge = 0;
        if(direction){
            this.parentRotation.copy(this.root.quaternion).invert();
            this.aimDirection.copy(direction).normalize().applyQuaternion(this.parentRotation);
        }
        if(this.locomotionPolish&&feelState().on('hatKnock')){
            const p=FEEL.hatKnock.params,side=direction&&Math.abs(this.aimDirection.x)>.05?Math.sign(this.aimDirection.x):(this.hatKnockZ>0?-1:1);
            this.hatKnockAge=0;this.hatKnockZ=-side*p.tilt;this.hatKnockX=p.lift;
        }
        if(this.actingEnabled)this.acting.trigger('hit',1,direction?this.aimDirection.x:0);
        this.applyPose();
    }

    /** L5: a nearby launcher blew the hat off; it spins up and lands back on the head. */
    blowHat(strength=1):void {
        if(!this.locomotionPolish||!feelState().on('launchMoment')||this.deathAnimation||this.hatBlowAge<HAT_BLOW*.5)return;
        this.hatBlowAge=0;this.hatBlowSpin=(Math.random()<.5?-1:1)*Math.max(.4,Math.min(1.5,strength));
    }
    /** M1: a near miss: wide eyes and a short gasp. */
    startle():void {if(this.screamAge>.5){this.screamAge=0;this.screamSize=.6;}}
    /** True while the rat rides a launcher throw (until it lands). */
    get launchFlight():boolean {return this.actingEnabled&&this.acting.launchFlight;}

    playReaction(event:RatReaction,strength=1):void {
        if(!this.actingEnabled||this.deathAnimation)return;
        this.acting.trigger(event,strength);this.applyPose();
    }
    setHustle(active:boolean):void {this.hustle=active;}
    resetReactions():void {
        this.acting.reset();this.hustle=false;
        this.flight=0;this.wasLaunched=false;this.skidAge=this.nodAge=this.pulseAge=this.hatKnockAge=this.hatBlowAge=this.screamAge=10;
        this.applyPose();
    }
    setActingEnabled(enabled:boolean):void {
        this.actingEnabled=enabled;this.acting.reset();this.applyPose();
    }

    /** Damped secondary motion reacts to actual tumble and contact impulses. With the
     * seventh-batch body (R7) the corpse physics pose only drags a point chain, which
     * then poses the whole rat: its orientation, spine bend, head, gun hand, shoes and tail. */
    poseDeath(time: number, dt: number, spin: { x: number; y: number; z: number }, impact: number, resting: boolean): void {
        this.locomotion.reset();
        this.acting.reset();
        this.restore();
        this.deathAnimation = true;
        this.muzzleFlash.visible = false;
        const style=this.deathStyle==='default'||this.deathStyle==='flail'?undefined:FEEL.deathVariety.params;
        const gain=!style?1:this.deathStyle==='spin'?style.spinGain:this.deathStyle==='fling'?style.flingGain:style.flopGain;
        const cause=this.deathHeadshot?'headshot':this.deathStyle;
        const chain=feelState().on('ragdollBody')&&this.spines[0]?this.chain:undefined,bodyParams=FEEL.ragdollBody.params;
        if(chain){
            // The physics body's centre drags the chain; its spin is never shown.
            this.anchor.set(0,WAIST,0).applyQuaternion(this.root.quaternion).add(this.root.position);
            if(!chain.active)chain.begin(this.root,this.anchor,cause,Math.floor(Math.random()*997));
            if(impact>0)chain.land(Math.min(1.5,impact*gain));
            chain.step(dt,this.anchor,resting,cause,time,bodyParams.drag,bodyParams.twitch);
            // A corpse shown from a snapshot (posed, not yet stepped) keeps the pose it was given.
            if(chain.stepped){this.root.position.copy(chain.rootPosition);this.root.quaternion.copy(chain.rootQuaternion);}
        }
        this.parentRotation.copy(this.root.quaternion).invert();
        if(chain)this.localSpin.set(0,0,0);else this.localSpin.set(spin.x, spin.y, spin.z).applyQuaternion(this.parentRotation);
        this.localGravity.set(0, -1, 0).applyQuaternion(this.parentRotation);
        if(feelState().on('ragdoll')){
            if(!this.ragdollStarted){this.ragdoll.reset();this.ragdoll.start(cause);this.ragdollStarted=true;}
            // Each hard contact crumples the limbs a little more.
            if(impact>0)this.ragdoll.impulse('all',impact*4*gain,impact*3*gain);
            this.ragdoll.step(dt,this.root,this.localGravity,this.localSpin,resting,cause,time);
        }
        const limbs=this.ragdoll.angles;
        this.landingPulse = Math.max(this.landingPulse, impact * (this.deathStyle==='flop'&&style?style.flopLanding:1));
        this.landingPulse *= Math.exp(-12 * dt);
        const stretchTime = style&&this.deathStyle==='fling'?style.flingTime:.28, stretchSize=style&&this.deathStyle==='fling'?style.flingStretch:.13;
        const stretch = chain||time >= stretchTime ? 0 : Math.sin(time / stretchTime * Math.PI) * stretchSize;
        // Spin: a lingering whirl of hat/arm/head; flop: ears and head droop flat.
        const whirl = style&&this.deathStyle==='spin'?Math.sin(time*18)*Math.exp(-time*2.2)*style.spinWhirl:0;
        const droop = style&&this.deathStyle==='flop'?Math.min(1,time/.35)*style.flopDroop:0;
        // R4: the belly flattens against whatever it landed on; R5: a shot ripples the coat.
        const squash=this.landingPulse*bodyParams.squash,up=this.chain.bellyUp;
        const ripple=chain&&chain.rippleAge<.6?Math.sin(chain.rippleAge*26)*Math.exp(-chain.rippleAge*6)*.14:0;
        for (let i = 0; i < this.rigs.length; i++) {
            const rig = this.rigs[i], body = rig[0].part, head = rig[1].part, hat = rig[2].part, arm = rig[8].part, spine = this.spines[i];
            if (chain && spine) {
                const {belly, chest} = spine;
                belly.quaternion.copy(chain.bellyTurn);
                belly.scale.set(1+squash*(.5-1.5*up.x*up.x)+ripple,1+squash*(.5-1.5*up.y*up.y)-ripple*.5,1+squash*(.5-1.5*up.z*up.z)+ripple);
                // Bend about the hip joint: keep it fixed under the scale too.
                belly.position.set(0,HIP_JOINT*belly.scale.y,0).applyQuaternion(belly.quaternion).negate();belly.position.y+=HIP_JOINT;
                chest.quaternion.copy(chain.chestTurn);chest.scale.set(1-ripple*.7,1,1-ripple*.7);
                chest.position.set(0,WAIST,0).applyQuaternion(chest.quaternion).negate();chest.position.y+=WAIST;
                head.quaternion.premultiply(chain.headTurn);
                arm.position.copy(chain.arm.position);arm.quaternion.copy(chain.arm.quaternion);
            } else {
                body.scale.y *= 1 + stretch - this.landingPulse * 0.13;
                body.scale.x *= 1 - stretch * 0.4 + this.landingPulse * 0.08;
                body.scale.z *= 1 - stretch * 0.4 + this.landingPulse * 0.08;
                head.rotation.x += limbs.head.x + droop * .35;
                head.rotation.z += limbs.head.z + whirl * .5;
                arm.rotation.y += whirl * 1.4;
                arm.rotation.x += limbs.arm.x * 1.2;
                arm.rotation.z += limbs.arm.z;
            }
            hat.rotation.x += limbs.hat.x;
            hat.rotation.z += limbs.hat.z + whirl;
            rig[6].part.rotation.x += limbs.earLeft.x + droop;rig[6].part.rotation.z += limbs.earLeft.z;
            rig[7].part.rotation.x += limbs.earRight.x + droop;rig[7].part.rotation.z += limbs.earRight.z;
            // A brief lift on launch, then a soft wobble when the body lands.
            hat.position.y += stretch * 0.55 + this.landingPulse * 0.035;
            // X eyes replace the closed lids on rats that have them (R3).
            rig[4].part.scale.y = rig[5].part.scale.y = this.hasDeadFace ? 1e-4 : 0.18;
            if (this.hatHidden) hat.scale.setScalar(1e-4);
        }
        if (chain) {this.tailFall.set(0, 0, 0);this.tailTip.copy(chain.tailTip);}
        else this.tailFall.lerp(this.localGravity, 1 - Math.exp(-5 * dt));
        this.time = time;
        this.stride = time * 7;
        this.tailMotion = resting ? 0 : Math.min(this.localSpin.length() / 12, 1);
        this.tailTurn = limbs.head.z * 0.6;
        this.poseDeadExtras(time, !!chain);
        this.gunSleeves.forEach(updateGunSleeve);
        this.tailPose++; this.tailReset = false;
    }
    /** R1/R3 on the extras: kicking then splayed shoes, limp whiskers, X eyes, a lolling tongue.
     * With the chain body the shoes sit on the chain's feet. */
    private poseDeadExtras(time:number, chain:boolean):void {
        const limbs=this.ragdoll.angles;
        for (const {part, kind, side} of this.extras) {
            if (kind === 'shoe') {
                const a = side < 0 ? limbs.shoeLeft : limbs.shoeRight; part.rotation.x += a.x; part.rotation.z += a.z;
                if (chain) part.position.copy(this.chain.shoes[side < 0 ? 0 : 1]);else part.position.x += a.z * side * .05;
            }
            else if (kind === 'whiskers') {const a = side < 0 ? limbs.whiskersLeft : limbs.whiskersRight; part.rotation.z += a.z - side * .35; part.rotation.x += a.x;}
            else if (kind === 'x') part.scale.setScalar(1);
            else if (kind === 'tongue') {const out = Math.min(1, Math.max(0, (time - .2) / .3)); part.scale.set(1, 1, Math.max(1e-4, out)); part.rotation.x += .5 + limbs.head.x * .4;}
            else if (kind === 'mouth') part.scale.y = .6;
        }
    }

    shoot(target?: THREE.Vector3): void {
        if(this.actingEnabled)this.acting.trigger('shot');
        this.aimTarget = target?.clone() ?? null;
        this.recoil = 1;
        this.flashAge = 0;
        this.muzzleFlash.visible = true;
        this.muzzleFlash.material.opacity = 1;
        this.aimHold = 0.7;
        this.aim = 1;
        this.applyPose();
    }

    /** R3: a shot or bounce jolts a corpse's limbs. R5: with the chain body it folds the
     * body where it was hit (`at`), pushed into the surface (`normal` faces the shooter). */
    joltDeath(strength=1,at?:{x:number;y:number;z:number},normal?:{x:number;y:number;z:number}):void {
        if(!this.deathAnimation)return;
        if(feelState().on('ragdoll'))this.ragdoll.impulse('all',6*strength*FEEL.ragdoll.params.jolt,8*strength*FEEL.ragdoll.params.jolt);
        if(feelState().on('ragdollBody'))this.chain.jolt(FEEL.ragdollBody.params.jolt*strength,at,normal&&this.joltPush.set(-normal.x,-normal.y,-normal.z));
    }
    /** `headshot` snaps the head back as the ragdoll starts. */
    setDeathStyle(style:DeathStyle,headshot=false):void {
        this.deathStyle=feelState().on('deathVariety')||style==='flail'?style:'default';
        this.deathHeadshot=headshot;
    }

    /** Hit-stop: treat this frame as stationary so resuming doesn't register as a speed spike. */
    holdMotion():void {this.lastPosition?.copy(this.root.position);this.lastVelocity.set(0,0,0);}

    /** Composed nod that tips the brim (your kill). */
    nod():void {this.nodAge=0;}
    /** Pickup body reaction: Ironclad chest puff, Hot Pursuit bounce, Stakeout head-forward squint, Quick Fix relieved breath. */
    pulse(kind:TimedPickup|'heal'):void {this.pulseKind=kind;this.pulseAge=0;}
    /** Your supply claim: the landing squash, then a pop up through the jump stretch; `size` scales both. */
    squashPop(size:number):void {this.jumpLanding=size;this.popSize=size;this.popIn=.08;}

    /** The fedora has flown off as its own object; collapse the rig's copy until reset. */
    setHatHidden(hidden:boolean):void {this.hatHidden=hidden;}

    playRespawn(): void {
        this.respawnAge = 0;
    }

    reset(): void {
        this.locomotion.reset();
        this.acting.reset();this.hustle=false;
        this.time = this.stride = this.movement = this.recoil = this.turn = this.hit = 0;
        this.acceleration = this.coatTurn = 0;
        this.verticalSpeed = this.airPose = this.jumpLift = this.jumpLanding = this.popIn = 0;
        this.respawnAge = 1;
        this.aimHold = this.aim = 0;
        this.aimTarget = null;
        this.flashAge = 1;
        this.muzzleFlash.visible = false;
        this.lastPosition = null;
        this.hitAge = 10;
        this.hatKnockAge = this.hatBlowAge = this.screamAge = 10;this.flail = this.mouthOpen = this.earFlop = this.earFlopRate = this.tailSwing = this.tailSwingRate = 0;this.hatKnockZ = this.hatKnockX = 0;this.hatHidden = false;this.deathStyle = 'default';
        this.skidAge = this.nodAge = this.pulseAge = 10;this.flight = 0;this.skidStarted = false;this.landedFall = 0;this.launched = this.wasLaunched = false;this.lastVelocity.set(0, 0, 0);
        this.ragdoll.reset();this.ragdollStarted=false;this.deathHeadshot=false;this.chain.reset();
        this.tailFall.set(0, 0, 0);this.tailTip.set(0, 0, 0);
        this.clearAir();this.landAge = 10;
        this.landingPulse = 0;
        this.deathAnimation = false;
        this.tailMotion = this.tailTurn = 0;
        this.restore();
        this.gunSleeves.forEach(updateGunSleeve);
        this.tailPose++; this.tailReset = true;
    }

    private restore(): void {
        this.carryAnchor.position.copy(RAT_CARRY_SHOULDER);
        this.carryAnchor.rotation.set(0, 0, 0);
        // A living rat's spine is exactly identity.
        for (const spine of this.spines) if (spine) {
            spine.belly.position.set(0, 0, 0);spine.belly.quaternion.identity();spine.belly.scale.set(1, 1, 1);
            spine.chest.position.set(0, 0, 0);spine.chest.quaternion.identity();spine.chest.scale.set(1, 1, 1);
        }
        for (const rig of this.rigs) for (const { part, position, rotation, scale } of rig) {
            part.position.copy(position);
            part.rotation.copy(rotation);
            part.scale.copy(scale);
        }
        for (const extra of this.extras) {extra.part.position.copy(extra.position);extra.part.rotation.copy(extra.rotation);extra.part.scale.copy(extra.scale);}
    }

    /** Polish 14 secondary motion: brows, whiskers, shoes and pupils. */
    private poseExtras(sway:number, stepLift:number):void {
        if (!this.extras.length) return;
        const hitEnv = this.hitAge < 1.4 ? Math.exp(-this.hitAge * 4) : 0;
        const twitch = Math.sin(this.time * 9.3) * Math.max(0, Math.sin(this.time * .7)) * .06;
        const look = THREE.MathUtils.clamp(-this.turn * .35, -1, 1);
        for (const {part, kind, side} of this.extras) {
            if (kind === 'mouth') part.scale.y = Math.max(1e-4, this.mouthOpen);
            else if (kind === 'brow') {
                part.position.y += .035 * hitEnv - .012 * this.aim + .045 * this.mouthOpen;
                part.rotation.z += side * (.2 * this.aim - .25 * hitEnv);
            } else if (kind === 'whiskers') {
                part.rotation.z += side * (sway * .22 + twitch) - side * .4 * hitEnv + side * this.flail * .5 + side * this.earFlop * .6;
                part.rotation.z += side * (this.airFall - this.airRise * .5) * .45;
                part.rotation.y += side * stepLift * this.movement * .12;
            } else if (kind === 'shoe') {
                const step = Math.sin(this.stride + (side < 0 ? 0 : Math.PI)), striding = this.movement * (1 - this.air);
                part.position.z += step * .09 * striding;
                part.position.y += Math.max(0, step) * .05 * striding;
                part.rotation.x -= Math.max(0, step) * .35 * striding;
                // Legs kicking in the air during a launcher flight.
                part.position.z += Math.sin(this.time * 19 + side) * this.flail * .12;
                part.rotation.x += Math.sin(this.time * 19 + side * 2) * this.flail * .8;
                // A1: feet trail on the way up, tuck up under the coat at the apex and reach down falling.
                const air = FEEL.airActing.params.feet;
                part.position.y += (this.airApex * .34 - this.airFall * .06) * air;
                part.position.z += (this.airApex * .12 - this.airRise * .14 + side * this.airFall * .03) * air;
                part.rotation.x += (this.airRise * .55 - this.airApex * .6 + this.airFall * .5) * air;
            } else {
                part.position.x += (-side * .014 * this.aim + look * .016) * (side < 0 ? -1 : 1);
            }
        }
    }

    /** Rebase locomotion after a stream discontinuity without erasing action cues. */
    resetMotionHistory(): void {
        this.locomotion.reset();
        this.acting.resetMotion();
        if (this.locomotionPolish) this.tailMotion = this.tailTurn = 0;
        this.lastPosition = null;
        this.verticalSpeed = this.airPose = this.jumpLift = this.jumpLanding = 0;this.clearAir();
        this.movement = this.acceleration = this.turn = this.coatTurn = 0;
    }

    private clearAir(): void {
        this.inAir = false;this.air = this.airVertical = this.airStill = this.airPitch = this.airBank = this.airBankRate = 0;
        this.airRise = this.airFall = this.airApex = 0;
    }

    /** Workshop comparison on the accepted model; never changes control state. */
    setLocomotionPolish(enabled: boolean): void {
        this.locomotionPolish = enabled;
        if(!enabled){this.actingEnabled=false;this.acting.reset();}
        this.locomotion.reset();
        this.applyPose();
    }

    update(dt: number, previewSpeed?: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) return;
        const motionDt = dt;
        dt = Math.min(dt, 0.1);
        const position = this.root.position;
        const yaw = this.orientation.setFromQuaternion(this.root.quaternion, 'YXZ').y;
        let speed = 0;
        let turnRate = 0;
        let verticalSpeed = 0;
        let correction = false;
        let actingVertical = 0;
        let actingCorrection = false;
        if (this.lastPosition) {
            const distance = Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z);
            const height = position.y - this.lastPosition.y;
            correction = distance >= 2 || Math.abs(height) >= 2;
            // Confirmed launch events allow the known high vertical speed even
            // when a 30Hz sample crosses the old two-unit visual cutoff.
            actingCorrection=distance>=Math.max(2,30*motionDt)||
                (Math.abs(height)>=2&&!(this.acting.launchFlight&&Math.abs(height)<=105*motionDt));
            if(!actingCorrection)actingVertical=height/motionDt;
            if (!correction) verticalSpeed = height / motionDt;
            // Teleports/corrections do not trigger a sprint pose.
            if (distance < 2) speed = distance / motionDt;
            turnRate = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / motionDt;
        } else this.lastPosition = new THREE.Vector3();
        if (!correction && motionDt > 0 && this.lastPosition.lengthSq() > 0) {
            this.velocity.set(position.x - this.lastPosition.x, 0, position.z - this.lastPosition.z).divideScalar(motionDt);
            const last = this.lastVelocity, lastSpeed = last.length();
            const along = lastSpeed > 1 ? ((this.velocity.x - last.x) * last.x + (this.velocity.z - last.z) * last.z) / lastSpeed / motionDt : 0;
            // Hard braking against fast travel reads as a skid (reversal or stop).
            if (this.skidAge > .5 && lastSpeed > 9 && along < -FEEL.animationPass.params.skidDecel && feelState().on('animationPass')) {this.skidAge = 0;this.skidStarted = true;}
            this.lastVelocity.copy(this.velocity);
        }
        this.lastPosition.copy(position);
        this.lastYaw = yaw;
        // Optional stationary art-preview input; gameplay continues to derive speed from motion.
        if(previewSpeed!==undefined&&Number.isFinite(previewSpeed))speed=Math.max(0,Math.min(18,previewSpeed));
        if(this.actingEnabled){
            if(actingCorrection){this.acting.resetMotion();this.flight=0;this.wasLaunched=false;}
            this.acting.update(dt,speed,actingVertical,this.hustle);
        }
        const blend = 1 - Math.exp(-10 * dt);
        // Read render-space vertical motion for local and interpolated remote rats.
        // These small secondary poses never feed back into the controller/body.
        if (correction) this.airPose = this.jumpLift = this.jumpLanding = 0;
        else {
            if (verticalSpeed > 5 && this.verticalSpeed <= 5) this.jumpLift = 1;
            if (this.verticalSpeed < -2 && verticalSpeed > -1) {
                this.jumpLanding = Math.min(1, -this.verticalSpeed / 9);
                if (-this.verticalSpeed > 12) this.landedFall = -this.verticalSpeed;
            }
            // Follow the velocity through the apex instead of holding one
            // airborne pose during both ascent and descent. A quicker release
            // keeps the hat/coat from looking suspended after the rat falls.
            const airTarget=THREE.MathUtils.clamp(verticalSpeed / 7,-.65,1);
            this.airPose = THREE.MathUtils.lerp(this.airPose,airTarget,1-Math.exp(-22*dt));
            this.jumpLift *= Math.exp(-15 * dt);
            this.jumpLanding *= Math.exp(-18 * dt);
            if (this.popIn > 0 && (this.popIn -= dt) <= 0) {this.popIn = 0;this.jumpLift = this.popSize;}
        }
        if (!correction && this.locomotionPolish) {
            // Semi-implicit springs, stable at game frame rates.
            const h = Math.min(dt, 1 / 30);
            if (feelState().on('face')) {
                const jolt = THREE.MathUtils.clamp((verticalSpeed - this.verticalSpeed) / Math.max(dt, 1e-3), -400, 400);
                this.earFlopRate += (-this.earFlop * 140 - this.earFlopRate * 9 - jolt * .012) * h;
                this.earFlop = THREE.MathUtils.clamp(this.earFlop + this.earFlopRate * h, -.8, .8);
            } else this.earFlop = this.earFlopRate = 0;
            if (feelState().on('bodySprings')) {
                this.tailSwingRate += ((THREE.MathUtils.clamp(-turnRate * .08, -.9, .9) - this.tailSwing) * 40 - this.tailSwingRate * 5) * h;
                this.tailSwing += this.tailSwingRate * h;
            } else this.tailSwing = this.tailSwingRate = 0;
        }
        // A1: airborne from a take-off or a real fall until the landing (or standing still in the air, on a ledge). The
        // apex crosses zero vertical speed, so the state, not the speed, carries the rat through it.
        const airParams=this.locomotionPolish&&feelState().on('airActing')?FEEL.airActing.params:undefined;
        if(correction||!airParams)this.clearAir();
        else{
            const landed=this.inAir&&this.verticalSpeed<-2&&verticalSpeed>-1;
            if(landed){this.landAge=0;this.landSize=Math.min(1,-this.verticalSpeed/18);}
            this.airStill=this.inAir&&Math.abs(verticalSpeed)<.5?this.airStill+dt:0;
            if(landed||this.airStill>.15)this.inAir=false;
            else if(!this.inAir&&(verticalSpeed>airParams.takeOff||verticalSpeed<-airParams.fall))this.inAir=true;
            this.air=THREE.MathUtils.lerp(this.air,this.inAir?1:0,1-Math.exp(-(this.inAir?16:22)*dt));
            this.airVertical=THREE.MathUtils.lerp(this.airVertical,verticalSpeed,1-Math.exp(-18*dt));
            // Lean into the travel: forward/back pitch and a banking spring that swings over when the rat reverses.
            const sin=Math.sin(yaw),cos=Math.cos(yaw),v=this.velocity;
            const ahead=THREE.MathUtils.clamp((v.x*sin+v.z*cos)/18,-1,1),aside=THREE.MathUtils.clamp((v.x*cos-v.z*sin)/18,-1,1);
            this.airPitch=THREE.MathUtils.lerp(this.airPitch,ahead*airParams.lean*this.air,1-Math.exp(-10*dt));
            const h=Math.min(dt,1/30);
            this.airBankRate+=((-aside*airParams.bank*this.air-this.airBank)*90-this.airBankRate*8)*h;
            this.airBank+=this.airBankRate*h;
        }
        this.landAge+=dt;
        this.verticalSpeed = verticalSpeed;
        const previousMovement = this.movement;
        this.movement = THREE.MathUtils.lerp(this.movement, Math.min(speed / 7, 1), blend);
        this.turn = THREE.MathUtils.lerp(this.turn, THREE.MathUtils.clamp(turnRate * 0.08, -0.3, 0.3), blend);
        this.acceleration = THREE.MathUtils.lerp(this.acceleration,
            THREE.MathUtils.clamp((this.movement - previousMovement) / dt * 0.055, -0.16, 0.16), blend);
        this.coatTurn = THREE.MathUtils.lerp(this.coatTurn, this.turn, 1 - Math.exp(-5 * dt));
        this.respawnAge = Math.min(1, this.respawnAge + dt);
        // A slower response lets the flexible end trail starts, stops and turns.
        this.tailMotion = THREE.MathUtils.lerp(this.tailMotion, this.movement, 1 - Math.exp(-4 * dt));
        this.tailTurn = THREE.MathUtils.lerp(this.tailTurn, this.turn, 1 - Math.exp(-3 * dt));
        if (correction) this.locomotion.reset();
        else this.locomotion.update(dt, speed, turnRate);
        if (this.locomotionPolish) {
            this.tailMotion = this.locomotion.tailMovement;
            this.tailTurn = this.locomotion.tailTurn;
        }
        this.time += dt;
        // Slower, distinct alternating steps read better than a fast vibration.
        this.stride += dt * (4 + this.movement * 5);
        this.recoil *= Math.exp(-14 * dt);
        this.flashAge += dt;
        this.muzzleFlash.visible = this.flashAge < .065;
        this.muzzleFlash.material.opacity = Math.max(0, 1 - this.flashAge / .065);
        this.hitAge += dt;
        this.hatKnockAge += dt;this.hatBlowAge += dt;this.skidAge += dt;this.nodAge += dt;this.pulseAge += dt;
        const launchFlight = this.actingEnabled && this.acting.launchFlight;
        if (launchFlight && !this.wasLaunched) {this.launched = true;this.screamAge = 0;this.screamSize = 1;}
        this.screamAge += dt;
        this.wasLaunched = launchFlight;
        this.flight = THREE.MathUtils.lerp(this.flight, launchFlight ? 1 : 0, 1 - Math.exp(-6 * dt));
        this.hit = Math.exp(-this.hitAge * 16) * Math.cos(this.hitAge * 22);
        this.aimHold = Math.max(0, this.aimHold - dt);
        this.aim = THREE.MathUtils.lerp(this.aim, this.aimHold > 0 ? 1 : 0, 1 - Math.exp(-7 * dt));
        this.pistolGrowth = THREE.MathUtils.lerp(this.pistolGrowth, this.bigPistol ? 1 : 0, 1 - Math.exp(-INCIDENT_TUNING.cheesePistolRate * dt));
        this.applyPose();
    }

    private applyPose(): void {
        this.restore();
        const entrance = this.respawnAge < 0.65 ? Math.sin(this.respawnAge / 0.65 * Math.PI) * Math.exp(-this.respawnAge * 5) : 0;
        const breath = Math.sin(this.time * 2.3);
        // A1: no walking stride in mid-air; the air pose takes over.
        const striding = this.movement * (1 - this.air);
        const sway = Math.sin(this.stride) * striding;
        const stepLift = Math.abs(Math.sin(this.stride)) * (1 - this.air);
        const compression = Math.cos(this.stride * 2) * striding;
        const followThrough = Math.sin(this.stride - 0.65) * striding;
        const air = this.locomotionPolish && feelState().on('airActing') ? FEEL.airActing.params : undefined;
        // Rising stretches and trails, the apex tucks into a ball, falling opens up and reaches for the ground.
        const rise = THREE.MathUtils.clamp(this.airVertical / 12, 0, 1), fall = THREE.MathUtils.clamp(-this.airVertical / 12, 0, 1);
        this.airRise = this.air * rise;this.airFall = this.air * fall;this.airApex = this.air * (1 - Math.max(rise, fall));
        const landing = air && this.landAge < .6 ? this.landSize * Math.cos(this.landAge * 24) * Math.exp(-this.landAge * 8) : 0;
        const blinkPhase = (this.time+(this.actingEnabled?this.acting.blinkOffset:0)) % 4.7;
        const blink = blinkPhase > 4.48 ? Math.sin((blinkPhase - 4.48) / 0.22 * Math.PI) : 0;
        const twitchPhase = this.time % 6.1;
        const twitch = !this.actingEnabled&&twitchPhase > 5.7 ? Math.sin((twitchPhase - 5.7) * Math.PI / 0.4) * 0.12 : 0;
        this.carryAnchor.rotation.x = followThrough * .48 - this.airPose * .12 + this.jumpLanding * .08;
        this.carryAnchor.rotation.z = sway * .035;
        if(this.actingEnabled&&this.carryAnchor.children.length){
            // The whole straight sleeve and rigid case follow the same pivot.
            // Exaggerate transient weight without increasing the periodic swing.
            this.carryAnchor.rotation.x-=this.locomotion.startStop*.65;
            this.carryAnchor.rotation.z-=this.locomotion.turn*.32;
        }
        // The accepted (non-polish) workshop mode stays the frozen reference.
        const anim=this.locomotionPolish&&feelState().on('animationPass')?FEEL.animationPass.params:undefined;
        const skid=anim&&this.skidAge<.45?Math.sin(this.skidAge/.45*Math.PI):0;
        const nod=anim&&this.nodAge<.4?Math.sin(this.nodAge/.4*Math.PI):0;
        const pulse=anim&&this.pulseAge<.6?Math.sin(this.pulseAge/.6*Math.PI):0;
        const carrying=!!anim&&this.carryAnchor.children.length>0;
        const glancePhase=(this.time+(this.actingEnabled?this.acting.blinkOffset:0))%4.2;
        const glance=carrying&&glancePhase<1.1?Math.sin(glancePhase/1.1*Math.PI)*(Math.floor(this.time/4.2)%2?1:-1):0;
        const flight=anim?this.flight:0;
        this.flail=anim&&feelState().on('launchFlight')?this.flight:0;
        const flap=Math.sin(this.time*17)*this.flail;
        const face=!!anim&&feelState().on('face'),springs=!!anim&&feelState().on('bodySprings');
        const screamEnd=1.2*this.screamSize,scream=this.screamAge<screamEnd?Math.min(1,this.screamAge/.08)*Math.min(1,(screamEnd-this.screamAge)/.3)*this.screamSize:0;
        this.mouthOpen=face?Math.max(scream,this.flail*.35):0;
        // M2: a flinch away from the hit, on the head and ears only (never the weapon-bearing body).
        const flinch=springs&&this.hitAge<.6?Math.exp(-this.hitAge*8):0,flinchSide=Math.abs(this.aimDirection.x)>.05?Math.sign(this.aimDirection.x):1;
        const blow=this.hatBlowAge<HAT_BLOW?this.hatBlowAge/HAT_BLOW:1,blowArc=blow<1?Math.sin(blow*Math.PI):0;
        const settle=FEEL.hatKnock.params.settle;
        const knock=this.hatKnockAge<4*settle?Math.min(1,this.hatKnockAge/.05)*Math.exp(-this.hatKnockAge/settle)*(1+.3*Math.cos(this.hatKnockAge*15)*Math.exp(-this.hatKnockAge*6)):0;
        for (let r = 0; r < this.rigs.length; r++) {
            const rig = this.rigs[r];
            // Indexed, not array-destructured: destructuring walks an iterator per rig per frame.
            const body = rig[0].part, head = rig[1].part, hat = rig[2].part, tail = rig[3].part, leftEye = rig[4].part,
                rightEye = rig[5].part, leftEar = rig[6].part, rightEar = rig[7].part, arm = rig[8].part, pistol = rig[9].part;
            // Rock from one side of the coat hem to the other, with a small
            // lift to keep the tilted hem above the floor. All offsets are visual.
            body.scale.y = 1 + breath * 0.006 - compression * 0.022 - this.hit * 0.045;
            body.scale.x = 1 + compression * 0.012;
            body.scale.z = 1 + compression * 0.012;
            body.rotation.z = sway * 0.095;
            body.position.x = sway * 0.035;
            body.position.y = stepLift * this.movement * 0.13 + Math.abs(body.rotation.z) * 0.5;
            body.rotation.x = this.hit * 0.045 + this.movement * 0.035 + compression * 0.018 - this.recoil * 0.055;
            body.rotation.x += this.acceleration;
            body.rotation.y += -this.coatTurn * 0.55;
            body.scale.y -= entrance * 0.4;
            body.scale.x += entrance * 0.22;
            body.scale.z += entrance * 0.22;
            const jumpStretch = this.jumpLift * .045 - this.jumpLanding * .055;
            body.scale.y += jumpStretch;
            body.scale.x -= jumpStretch * .4;
            body.scale.z -= jumpStretch * .4;
            body.rotation.x -= this.airPose * .035;
            body.position.z = -this.recoil * 0.055;
            if (air) {
                // A1: squash and stretch through the arc, a tuck at the apex (the hem swings forward and the belly
                // curls over it, the chest nearly level so the aimed arm barely moves), and a lean and bank into travel,
                // all about the coat's middle. The landing squashes and wobbles back.
                const stretch = air.stretch * this.airRise - air.squash * this.airApex + air.reach * this.airFall - air.land * landing;
                body.scale.y += stretch;body.scale.x -= stretch * .45;body.scale.z -= stretch * .45;
                const tuck = air.tuck * this.airApex, ax = this.airPitch - tuck - air.arch * this.airRise, az = this.airBank;
                body.rotation.x += ax;body.rotation.z += az;
                this.airPivot.set(0, air.pivot, 0).applyEuler(this.airTilt.set(ax, 0, az));
                body.position.x -= this.airPivot.x;body.position.y += air.pivot - this.airPivot.y;body.position.z -= this.airPivot.z;
                const spine = this.spines[r];
                if (spine && (tuck > 1e-4 || this.airRise > 1e-4)) {
                    spine.belly.rotation.x = tuck * 1.6 + air.arch * this.airRise * .6;
                    spine.belly.position.set(0, HIP_JOINT, 0).applyQuaternion(spine.belly.quaternion).negate();spine.belly.position.y += HIP_JOINT;
                    spine.chest.rotation.x = -tuck * .4;
                    spine.chest.position.set(0, WAIST, 0).applyQuaternion(spine.chest.quaternion).negate();spine.chest.position.y += WAIST;
                }
            }
            head.rotation.y += this.turn * 0.9;
            head.rotation.z = -sway * 0.06;
            head.rotation.x = -this.hit * 0.025 + breath * 0.009 - compression * 0.02 - this.recoil * 0.035;
            hat.rotation.x += Math.sin(this.hitAge * 22) * Math.exp(-this.hitAge * 13) * 0.035 + this.recoil * 0.11 + followThrough * 0.045;
            hat.rotation.z += followThrough * 0.035 + (this.turn - this.coatTurn) * 0.2;
            hat.position.y += entrance * 0.24 + this.jumpLift * .035 + this.jumpLanding * .02;
            hat.rotation.x += this.airPose * .045 - this.jumpLanding * .06;
            hat.rotation.x += entrance * 0.14;
            hat.rotation.z += this.hatKnockZ * knock;
            hat.rotation.x -= this.hatKnockX * knock;
            hat.position.x += this.hatKnockZ * knock * .06;
            if (blowArc) {
                hat.position.y += blowArc * 1.5;hat.position.z -= blowArc * .35;
                hat.rotation.y += blow * Math.PI * 4 * this.hatBlowSpin;hat.rotation.x -= blowArc * .9;
            }
            if (anim) {
                // Only secondary parts (head, hat, ears, tail) take this pass: the
                // body carries the pistol and case, whose accepted trajectories stay exact.
                const squash = this.jumpLift * anim.jumpStretch - this.jumpLanding * anim.landSquash;
                head.position.y += squash * 1.2;
                leftEar.rotation.x -= squash * 2;rightEar.rotation.x -= squash * 2;
                head.rotation.x -= skid * anim.skidLean;hat.rotation.x -= skid * anim.skidLean * 1.5;
                if (carrying) {head.position.y -= anim.hunch * .5;head.rotation.x += anim.hunch;head.rotation.y += glance * anim.glance;}
                // Launcher flight: flattened ears, lagging hat, streaming tail.
                leftEar.rotation.x -= flight * .55;rightEar.rotation.x -= flight * .55;
                // L6 flailing: head wobble and flapping ears, never the weapon-bearing body or arm.
                head.rotation.z += flap * .22;hat.rotation.z += flap * .12;
                hat.rotation.x += flight * (.16 + anim.flare);tail.rotation.x += flight * .45;
                head.rotation.x += nod * anim.nod;hat.rotation.x += nod * anim.nod * 1.4;
                if (this.pulseKind === 'ironclad') {head.position.y += pulse * .05;head.rotation.x -= pulse * .1;}
                else if (this.pulseKind === 'hustle') {hat.position.y += pulse * .12;leftEar.rotation.z += pulse * .3;rightEar.rotation.z -= pulse * .3;}
                else if (this.pulseKind === 'stakeout') {head.position.z += pulse * .08;head.rotation.x += pulse * .07;hat.rotation.x += pulse * .08;}
                else {head.rotation.x -= pulse * .12;hat.position.y += pulse * .04;}
            }
            if (springs) {
                // A hat that rocks with each step.
                hat.rotation.z += Math.sin(this.stride) * .05 * this.movement;hat.position.y += stepLift * .012 * this.movement;
                head.rotation.z -= flinchSide * .35 * flinch;head.rotation.x -= .2 * flinch;
                leftEar.rotation.x -= .5 * flinch;rightEar.rotation.x -= .5 * flinch;
            }
            if (face) {leftEar.rotation.x += this.earFlop;rightEar.rotation.x += this.earFlop;}
            if (air) {
                // Falling: ears and tail stream up and the hat lifts off the head; rising: they trail down; the apex curls the tail.
                const up = this.airFall - this.airRise * .5;
                leftEar.rotation.x += up * air.ears;rightEar.rotation.x += up * air.ears * .85;
                tail.rotation.x += up * air.tail + this.airApex * air.tail * .6;
                hat.position.y += this.airFall * air.hat - this.airRise * air.hat * .3;hat.rotation.x += this.airFall * air.hat * 1.5;
            }
            if (this.hatHidden) hat.scale.setScalar(1e-4);
            // Keep the dragging section planted instead of inheriting the step bounce.
            tail.rotation.y = -this.turn * 0.2;

            arm.position.y += this.aim * 0.36;
            arm.position.z += this.aim * 0.10;
            arm.rotation.x = 1.28 * (1 - this.aim) + followThrough * 0.12 * (1 - this.aim);
            arm.rotation.z = -sway * 0.04 * (1 - this.aim);
            if (this.aimTarget && this.aim > 0.001) {
                arm.getWorldPosition(this.armPosition);
                arm.parent!.getWorldQuaternion(this.parentRotation).invert();
                this.aimDirection.copy(this.aimTarget).sub(this.armPosition).normalize().applyQuaternion(this.parentRotation);
                this.aimRotation.setFromUnitVectors(this.forward, this.aimDirection);
                arm.quaternion.slerp(this.aimRotation, this.aim);
            }
            pistol.rotation.x = -this.recoil * 0.14;
            pistol.position.z = -this.recoil * 0.035;
            if (this.pistolGrowth > .001) {
                // Scale about the grip (the cuff's point); the muzzle, a child, rides along to the new barrel.
                const g = this.pistolGrowth, w = 1 + (INCIDENT_TUNING.cheesePistolWidth - 1) * g, l = 1 + (INCIDENT_TUNING.cheesePistolLength - 1) * g;
                pistol.scale.set(w, w, l);
                pistol.position.x += RAT_PISTOL_GRIP.x * (1 - w); pistol.position.y += RAT_PISTOL_GRIP.y * (1 - w); pistol.position.z += RAT_PISTOL_GRIP.z * (1 - l);
            }
            leftEye.scale.y = rightEye.scale.y = 1 - Math.max(blink, this.extras.length && this.hitAge < .14 ? Math.sin(this.hitAge / .14 * Math.PI) : 0) * 0.94;
            // Stakeout: a hard squint while peering forward.
            if (this.pulseKind === 'stakeout' && pulse) {leftEye.scale.y *= 1 - pulse * .6;rightEye.scale.y *= 1 - pulse * .6;}
            leftEar.rotation.z = twitch;
            rightEar.rotation.z = -twitch * 0.65;
            // L6: ears flap in flight (after the twitch, which assigns them).
            leftEar.rotation.z += flap * .7;rightEar.rotation.z -= flap * .7;
            if (this.locomotionPolish) {
                // Preserve the accepted lean/stride in the weapon-bearing body.
                // Stabilize the head above it; only secondary parts catch up.
                head.rotation.x -= this.acceleration * .75;
                head.rotation.z -= sway * .025;
                head.rotation.y += this.coatTurn * .55 - this.turn * .9 + this.locomotion.turn * .025;
                // Quieter periodic motion leaves room for a single movement accent.
                hat.rotation.x += -followThrough * .029 - this.locomotion.startStop * .18;
                hat.rotation.z += -followThrough * .023 - (this.turn - this.coatTurn) * .2
                    - this.locomotion.turn * .07;
                hat.rotation.y -= this.locomotion.hatTurn * .065;
                leftEar.rotation.x -= this.locomotion.startStop * .20;
                rightEar.rotation.x -= this.locomotion.startStop * .13;
                leftEar.rotation.z += this.locomotion.turn * .16;
                rightEar.rotation.z += this.locomotion.turn * .10;
                tail.rotation.y = -this.locomotion.tailTurn * .2;
            }
            if(this.actingEnabled){
                const a=this.acting;
                // Full acting also makes the accepted movement accents legible
                // from behind. The movement-only comparison keeps its old gain.
                if(this.locomotionPolish){
                    head.rotation.x-=this.locomotion.startStop*.25;
                    head.rotation.y+=this.locomotion.turn*.25;
                    hat.rotation.x-=this.locomotion.startStop*.54;
                    hat.rotation.z-=this.locomotion.turn*.21;
                    hat.rotation.y-=this.locomotion.hatTurn*.15;
                    leftEar.rotation.x-=this.locomotion.startStop*.60;
                    rightEar.rotation.x-=this.locomotion.startStop*.39;
                    leftEar.rotation.z+=this.locomotion.turn*.48;
                    rightEar.rotation.z+=this.locomotion.turn*.30;
                    tail.rotation.y-=this.locomotion.tailTurn*.5;
                }
                // Quiet decorative motion while firing; accepted recoil/body and
                // the actual aimed weapon hierarchy remain completely untouched.
                head.rotation.x+=(-breath*.009+compression*.02)*a.focus+a.headX;
                head.rotation.z+=sway*(this.locomotionPolish?.085:.06)*a.focus+a.headZ;
                head.rotation.y+=a.headY;
                hat.rotation.x+=a.hatX;hat.rotation.z+=a.hatZ;hat.position.y+=a.hatY;
                leftEar.rotation.x+=a.earLeftX;rightEar.rotation.x+=a.earRightX;
                leftEar.rotation.z+=a.earLeftZ;rightEar.rotation.z+=a.earRightZ;
                leftEye.scale.y*=a.eyes;rightEye.scale.y*=a.eyes;
                leftEye.rotation.z-=a.eyeSlant;rightEye.rotation.z+=a.eyeSlant;
            }
            if (this.mouthOpen > 0) {
                // M1: wide eyes with the scream.
                const wide = 1 + .3 * this.mouthOpen;
                leftEye.scale.x *= wide;leftEye.scale.y *= wide;rightEye.scale.x *= wide;rightEye.scale.y *= wide;
            }
        }
        this.poseExtras(sway, stepLift);
        this.gunSleeves.forEach(updateGunSleeve);
        this.tailPose++; this.tailReset = false;
    }

    /** Deform one tail to the latest pose, right before it is drawn. The wave and death
     * projection are computed once per ring; a tail already showing this shape is left alone. */
    private showTail(rig: TailRig): void {
        if (rig.shown === this.tailPose) return;
        rig.shown = this.tailPose;
        const { tail, rest, ring, ringU, tip, tipRest } = rig, reset = this.tailReset, offsets = this.ringOffset;
        if (this.deathAnimation) {
            tail.updateWorldMatrix(true, false);
            this.inverseTail.copy(tail.matrixWorld).invert();
        }
        let changed = false;
        for (let r = 0; r < ringU.length; r++) {
            const u = ringU[r];
            // The root stays attached; a delayed wave bends the middle before
            // reaching the tip, instead of swinging the whole tail rigidly.
            const weight = u * u;
            let x = reset ? 0 : weight * (
                Math.sin(this.time * 1.5 - u * 2.4) * 0.07 * (this.deathAnimation ? this.tailMotion : 1) +
                Math.sin(this.stride - u * 2.8) * this.tailMotion * 0.38 *
                    (this.actingEnabled&&!this.deathAnimation?1-this.acting.tailStream:1) +
                this.tailTurn * 1.1);
            // Ground contact stays steady through the middle. Only the last
            // quarter lifts slightly as the tip flicks across the floor.
            const tipWeight = Math.max(0, (u - 0.75) / 0.25);
            let y = reset ? 0 : tipWeight * tipWeight *
                (1 + Math.sin(this.stride - u * 2.8 - 0.8)) * this.tailMotion * 0.025;
            if (!this.deathAnimation && !reset) y += weight * Math.max(0,this.airPose) * .12;
            if(this.actingEnabled&&!this.deathAnimation&&!reset){
                y+=weight*this.acting.tailLift;
                x+=weight*this.acting.tailSide;
                // L6: the tail whips like a flag in flight. M2: it swings out behind turns.
                x+=weight*Math.sin(this.time*12-u*5)*this.flail*.55+weight*this.tailSwing;
            }
            let z = 0;
            if (this.deathAnimation && !reset) {
                x += weight * (this.tailFall.x * 0.85 + this.tailTip.x);
                y += weight * (this.tailFall.y * 0.85 + this.tailTip.y);
                z += weight * (this.tailFall.z * 0.85 + this.tailTip.z);
                const c = rig.centers ??= restCenters(tail.geometry.parameters.path, ringU);
                this.tailCenter.set(c[r * 3] + x, c[r * 3 + 1] + y, c[r * 3 + 2] + z);
                this.tailCenter.applyMatrix4(tail.matrixWorld);
                const lift = Math.max(0, 0.068 - this.tailCenter.y);
                // Keep the flexible tail resting on the floor as the torso rolls.
                x += this.inverseTail.elements[4] * lift;
                y += this.inverseTail.elements[5] * lift;
                z += this.inverseTail.elements[6] * lift;
            }
            const o = r * 3;
            if (x !== rig.offsets[o] || y !== rig.offsets[o + 1] || z !== rig.offsets[o + 2]) changed = true;
            offsets[o] = x; offsets[o + 1] = y; offsets[o + 2] = z;
        }
        if (!changed) return;
        for (let i = 0; i < rig.offsets.length; i++) rig.offsets[i] = offsets[i];
        const positions = tail.geometry.getAttribute('position'), array = positions.array;
        for (let i = 0; i < ring.length; i++) {
            const o = ring[i] * 3;
            array[i * 3] = rest[i * 3] + offsets[o]; array[i * 3 + 1] = rest[i * 3 + 1] + offsets[o + 1]; array[i * 3 + 2] = rest[i * 3 + 2] + offsets[o + 2];
        }
        const end = (ringU.length - 1) * 3;
        tip.position.set(tipRest.x + offsets[end], tipRest.y + offsets[end + 1], tipRest.z + offsets[end + 2]);
        // Drawn after this hook in the same pass, so its world matrix must be current.
        tip.updateMatrixWorld();
        positions.needsUpdate = true;
        // The additive outline is unlit and casts no shadow: its deformed
        // normals are never consumed. Keep lit-tail normals exact.
        if(!(tail.material instanceof THREE.MeshBasicMaterial&&!tail.castShadow&&!tail.material.envMap))tubeNormals(tail.geometry);
        if(this.deathAnimation)tail.geometry.computeBoundingSphere();
        else {
            // Living-tail displacement is bounded by the clamped motion/turn
            // wave; avoid a per-vertex bounds scan on every display frame.
            tail.geometry.boundingSphere??=new THREE.Sphere();
            tail.geometry.boundingSphere.center.set(0,0,-.6);tail.geometry.boundingSphere.radius=2;
        }
    }
}

/** `BufferGeometry.computeVertexNormals` for an indexed geometry, on its typed arrays: the same
 * arithmetic in the same order (bit-identical normals) without its accessor calls and per-call vectors. */
function tubeNormals(geometry: THREE.BufferGeometry): void {
    const p = geometry.getAttribute('position').array, attribute = geometry.getAttribute('normal'), n = attribute.array, index = geometry.index!.array;
    n.fill(0);
    for (let i = 0; i < index.length; i += 3) {
        const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
        const bx = p[b], by = p[b + 1], bz = p[b + 2];
        const cbx = p[c] - bx, cby = p[c + 1] - by, cbz = p[c + 2] - bz, abx = p[a] - bx, aby = p[a + 1] - by, abz = p[a + 2] - bz;
        const x = cby * abz - cbz * aby, y = cbz * abx - cbx * abz, z = cbx * aby - cby * abx;
        // All three read before any write, as three.js does (shared corners accumulate identically).
        const ax = n[a] + x, ay = n[a + 1] + y, az = n[a + 2] + z, ex = n[b] + x, ey = n[b + 1] + y, ez = n[b + 2] + z, fx = n[c] + x, fy = n[c + 1] + y, fz = n[c + 2] + z;
        n[a] = ax; n[a + 1] = ay; n[a + 2] = az; n[b] = ex; n[b + 1] = ey; n[b + 2] = ez; n[c] = fx; n[c + 1] = fy; n[c + 2] = fz;
    }
    for (let i = 0; i < n.length; i += 3) {
        const x = n[i], y = n[i + 1], z = n[i + 2], s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
        n[i] = x * s; n[i + 1] = y * s; n[i + 2] = z * s;
    }
    attribute.needsUpdate = true;
}
