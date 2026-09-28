import * as THREE from 'three';
import {feelState} from '../feel/feelState';
import {FEEL} from '../feel/feelTuning';

/** Ordinary shot → spin, explosion → fling, neutral trap/case → flop. */
export type DeathStyle='default'|'spin'|'fling'|'flop';
import {updateGunSleeve,type GunSleeveRig} from './RatArmModel';
import { RatLocomotionFollowThrough } from './RatLocomotionFollowThrough';
import {RatActing,type RatReaction} from './RatActing';

/** Polish 14 parts, present only on rats built with model touch-ups. */
const EXTRA_PARTS = ['rat-brow-left','rat-brow-right','rat-whiskers-left','rat-whiskers-right','rat-shoe-left','rat-shoe-right'] as const;
interface ExtraPart {part:THREE.Object3D;kind:'brow'|'whiskers'|'shoe'|'pupil';side:number;position:THREE.Vector3;rotation:THREE.Euler}
const PARTS = ['rat-body', 'rat-head', 'rat-hat', 'rat-tail',
    'rat-eye-left', 'rat-eye-right', 'rat-ear-left', 'rat-ear-right', 'rat-arm', 'rat-pistol'] as const;

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
        root.getObjectByName('rat-body')!.add(anchor);
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
    private readonly rigs;
    private readonly gunSleeves:GunSleeveRig[];
    private readonly carryAnchor: THREE.Object3D;
    private verticalSpeed = 0;
    private airPose = 0;
    private jumpLift = 0;
    private jumpLanding = 0;
    private readonly tails;
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
    private hatKnockZ = 0;
    private hatKnockX = 0;
    private hatHidden = false;
    /** Polish 12: cause-flavoured death secondary motion (presentation only). */
    private deathStyle:DeathStyle='default';
    private readonly flop = new THREE.Vector2();
    private readonly flopVelocity = new THREE.Vector2();
    private readonly localSpin = new THREE.Vector3();
    private readonly localGravity = new THREE.Vector3();
    private readonly tailFall = new THREE.Vector3();
    private landingPulse = 0;
    private deathAnimation = false;
    private readonly tailCenter = new THREE.Vector3();
    /** Per-ring tail offsets: every vertex of a TubeGeometry ring shares its u,
     * so the wave and death projection are computed once per ring, not per vertex. */
    private ringWave = new Float64Array(0);
    private ringOffset = new Float64Array(0);
    private ringWaveReady = new Uint8Array(0);
    private ringReady = new Uint8Array(0);
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
    private pulseKind: 'ironclad'|'hustle'|'heal' = 'heal';
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
                if (part) this.extras.push({part, kind:name.startsWith('rat-brow')?'brow':name.startsWith('rat-whiskers')?'whiskers':'shoe',
                    side:name.endsWith('-left')?-1:1, position:part.position.clone(), rotation:part.rotation.clone()});
            }
            model.traverse(object => {
                if (object.name !== 'rat-pupil') return;
                const side = object.parent?.name === 'rat-eye-left' ? -1 : 1;
                this.extras.push({part:object, kind:'pupil', side, position:object.position.clone(), rotation:object.rotation.clone()});
            });
        }
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
        this.tails = models.map(model => {
            const tail = model.getObjectByName('rat-tail') as THREE.Mesh<THREE.TubeGeometry>;
            const positions = tail.geometry.getAttribute('position') as THREE.BufferAttribute;
            positions.setUsage(THREE.DynamicDrawUsage);
            return { tail, rest: positions.array.slice(), tip: tail.children[0],
                tipRest: tail.children[0].position.clone() };
        });
        this.rigs = models.map(model => PARTS.map(name => {
            const part = model.getObjectByName(name)!;
            return { part, position: part.position.clone(), rotation: part.rotation.clone(), scale: part.scale.clone() };
        }));
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
    /** True while the rat rides a launcher throw (until it lands). */
    get launchFlight():boolean {return this.actingEnabled&&this.acting.launchFlight;}

    playReaction(event:RatReaction,strength=1):void {
        if(!this.actingEnabled||this.deathAnimation)return;
        this.acting.trigger(event,strength);this.applyPose();
    }
    setHustle(active:boolean):void {this.hustle=active;}
    resetReactions():void {
        this.acting.reset();this.hustle=false;
        this.flight=0;this.wasLaunched=false;this.skidAge=this.nodAge=this.pulseAge=this.hatKnockAge=this.hatBlowAge=10;
        this.applyPose();
    }
    setActingEnabled(enabled:boolean):void {
        this.actingEnabled=enabled;this.acting.reset();this.applyPose();
    }

    /** Damped secondary motion reacts to actual tumble and contact impulses. */
    poseDeath(time: number, dt: number, spin: { x: number; y: number; z: number }, impact: number, resting: boolean): void {
        this.locomotion.reset();
        this.acting.reset();
        this.restore();
        this.deathAnimation = true;
        this.muzzleFlash.visible = false;
        this.parentRotation.copy(this.root.quaternion).invert();
        this.localSpin.set(spin.x, spin.y, spin.z).applyQuaternion(this.parentRotation);
        this.localGravity.set(0, -1, 0).applyQuaternion(this.parentRotation);
        const style=this.deathStyle==='default'?undefined:FEEL.deathVariety.params;
        const gain=!style?1:this.deathStyle==='spin'?style.spinGain:this.deathStyle==='fling'?style.flingGain:style.flopGain;
        this.flopVelocity.x += impact * 3.5 * gain;
        this.flopVelocity.y -= impact * 2.2 * gain;
        this.landingPulse = Math.max(this.landingPulse, impact * (this.deathStyle==='flop'&&style?style.flopLanding:1));
        const targetX = THREE.MathUtils.clamp(-this.localSpin.x * 0.028 + this.localGravity.z * 0.14, -0.32, 0.32);
        const targetZ = THREE.MathUtils.clamp(-this.localSpin.z * 0.028 - this.localGravity.x * 0.14, -0.28, 0.28);
        // Substeps keep the spring stable at low frame rates.
        const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / (1 / 120)));
        const step = Math.min(dt, 0.1) / steps;
        for (let i = 0; i < steps; i++) {
            this.flopVelocity.x += ((targetX - this.flop.x) * 85 - this.flopVelocity.x * 8) * step;
            this.flopVelocity.y += ((targetZ - this.flop.y) * 85 - this.flopVelocity.y * 8) * step;
            this.flop.addScaledVector(this.flopVelocity, step);
        }
        this.landingPulse *= Math.exp(-12 * dt);
        const stretchTime = style&&this.deathStyle==='fling'?style.flingTime:.28, stretchSize=style&&this.deathStyle==='fling'?style.flingStretch:.13;
        const stretch = time >= stretchTime ? 0 : Math.sin(time / stretchTime * Math.PI) * stretchSize;
        // Spin: a lingering whirl of hat/arm/head; flop: ears and head droop flat.
        const whirl = style&&this.deathStyle==='spin'?Math.sin(time*18)*Math.exp(-time*2.2)*style.spinWhirl:0;
        const droop = style&&this.deathStyle==='flop'?Math.min(1,time/.35)*style.flopDroop:0;
        for (const rig of this.rigs) {
            const body = rig[0].part, head = rig[1].part, hat = rig[2].part;
            body.scale.y *= 1 + stretch - this.landingPulse * 0.13;
            body.scale.x *= 1 - stretch * 0.4 + this.landingPulse * 0.08;
            body.scale.z *= 1 - stretch * 0.4 + this.landingPulse * 0.08;
            head.rotation.x += this.flop.x * 0.6 + droop * .35;
            head.rotation.z += this.flop.y * 0.6 + whirl * .5;
            hat.rotation.x += this.flop.x;
            hat.rotation.z += this.flop.y + whirl;
            rig[6].part.rotation.x += droop;rig[7].part.rotation.x += droop;
            rig[8].part.rotation.y += whirl * 1.4;
            // A brief lift on launch, then a soft wobble when the body lands.
            hat.position.y += stretch * 0.55 + this.landingPulse * 0.035;
            rig[8].part.rotation.x += this.flop.x * 1.4;
            rig[8].part.rotation.z += this.flop.y * 1.6;
            rig[4].part.scale.y = rig[5].part.scale.y = 0.18;
            if (this.hatHidden) hat.scale.setScalar(1e-4);
        }
        this.tailFall.lerp(this.localGravity, 1 - Math.exp(-5 * dt));
        this.time = time;
        this.stride = time * 7;
        this.tailMotion = resting ? 0 : Math.min(this.localSpin.length() / 12, 1);
        this.tailTurn = this.flop.y * 0.6;
        this.gunSleeves.forEach(updateGunSleeve);
        this.deformTails();
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

    setDeathStyle(style:DeathStyle):void {this.deathStyle=feelState().on('deathVariety')?style:'default';}

    /** Hit-stop: treat this frame as stationary so resuming doesn't register as a speed spike. */
    holdMotion():void {this.lastPosition?.copy(this.root.position);this.lastVelocity.set(0,0,0);}

    /** Composed nod that tips the brim (your kill). */
    nod():void {this.nodAge=0;}
    /** Pickup body reaction: Ironclad chest puff, Hot Pursuit bounce, Quick Fix relieved breath. */
    pulse(kind:'ironclad'|'hustle'|'heal'):void {this.pulseKind=kind;this.pulseAge=0;}

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
        this.verticalSpeed = this.airPose = this.jumpLift = this.jumpLanding = 0;
        this.respawnAge = 1;
        this.aimHold = this.aim = 0;
        this.aimTarget = null;
        this.flashAge = 1;
        this.muzzleFlash.visible = false;
        this.lastPosition = null;
        this.hitAge = 10;
        this.hatKnockAge = this.hatBlowAge = 10;this.flail = 0;this.hatKnockZ = this.hatKnockX = 0;this.hatHidden = false;this.deathStyle = 'default';
        this.skidAge = this.nodAge = this.pulseAge = 10;this.flight = 0;this.skidStarted = false;this.landedFall = 0;this.launched = this.wasLaunched = false;this.lastVelocity.set(0, 0, 0);
        this.flop.set(0, 0); this.flopVelocity.set(0, 0);
        this.tailFall.set(0, 0, 0);
        this.landingPulse = 0;
        this.deathAnimation = false;
        this.tailMotion = this.tailTurn = 0;
        this.restore();
        this.gunSleeves.forEach(updateGunSleeve);
        this.deformTails(true);
    }

    private restore(): void {
        this.carryAnchor.position.copy(RAT_CARRY_SHOULDER);
        this.carryAnchor.rotation.set(0, 0, 0);
        for (const rig of this.rigs) for (const { part, position, rotation, scale } of rig) {
            part.position.copy(position);
            part.rotation.copy(rotation);
            part.scale.copy(scale);
        }
        for (const extra of this.extras) {extra.part.position.copy(extra.position);extra.part.rotation.copy(extra.rotation);}
    }

    /** Polish 14 secondary motion: brows, whiskers, shoes and pupils. */
    private poseExtras(sway:number, stepLift:number):void {
        if (!this.extras.length) return;
        const hitEnv = this.hitAge < 1.4 ? Math.exp(-this.hitAge * 4) : 0;
        const twitch = Math.sin(this.time * 9.3) * Math.max(0, Math.sin(this.time * .7)) * .06;
        const look = THREE.MathUtils.clamp(-this.turn * .35, -1, 1);
        for (const {part, kind, side} of this.extras) {
            if (kind === 'brow') {
                part.position.y += .035 * hitEnv - .012 * this.aim;
                part.rotation.z += side * (.2 * this.aim - .25 * hitEnv);
            } else if (kind === 'whiskers') {
                part.rotation.z += side * (sway * .22 + twitch) - side * .4 * hitEnv + side * this.flail * .5;
                part.rotation.y += side * stepLift * this.movement * .12;
            } else if (kind === 'shoe') {
                const step = Math.sin(this.stride + (side < 0 ? 0 : Math.PI));
                part.position.z += step * .09 * this.movement;
                part.position.y += Math.max(0, step) * .05 * this.movement;
                part.rotation.x -= Math.max(0, step) * .35 * this.movement;
                // Legs kicking in the air during a launcher flight.
                part.position.z += Math.sin(this.time * 19 + side) * this.flail * .12;
                part.rotation.x += Math.sin(this.time * 19 + side * 2) * this.flail * .8;
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
        this.verticalSpeed = this.airPose = this.jumpLift = this.jumpLanding = 0;
        this.movement = this.acceleration = this.turn = this.coatTurn = 0;
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
        }
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
        if (launchFlight && !this.wasLaunched) this.launched = true;
        this.wasLaunched = launchFlight;
        this.flight = THREE.MathUtils.lerp(this.flight, launchFlight ? 1 : 0, 1 - Math.exp(-6 * dt));
        this.hit = Math.exp(-this.hitAge * 16) * Math.cos(this.hitAge * 22);
        this.aimHold = Math.max(0, this.aimHold - dt);
        this.aim = THREE.MathUtils.lerp(this.aim, this.aimHold > 0 ? 1 : 0, 1 - Math.exp(-7 * dt));
        this.applyPose();
    }

    private applyPose(): void {
        this.restore();
        const entrance = this.respawnAge < 0.65 ? Math.sin(this.respawnAge / 0.65 * Math.PI) * Math.exp(-this.respawnAge * 5) : 0;
        const breath = Math.sin(this.time * 2.3);
        const sway = Math.sin(this.stride) * this.movement;
        const stepLift = Math.abs(Math.sin(this.stride));
        const compression = Math.cos(this.stride * 2) * this.movement;
        const followThrough = Math.sin(this.stride - 0.65) * this.movement;
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
        const blow=this.hatBlowAge<HAT_BLOW?this.hatBlowAge/HAT_BLOW:1,blowArc=blow<1?Math.sin(blow*Math.PI):0;
        const settle=FEEL.hatKnock.params.settle;
        const knock=this.hatKnockAge<4*settle?Math.min(1,this.hatKnockAge/.05)*Math.exp(-this.hatKnockAge/settle)*(1+.3*Math.cos(this.hatKnockAge*15)*Math.exp(-this.hatKnockAge*6)):0;
        for (const rig of this.rigs) {
            const [{ part: body }, { part: head }, { part: hat }, { part: tail },
                { part: leftEye }, { part: rightEye }, { part: leftEar }, { part: rightEar },
                { part: arm }, { part: pistol }] = rig;
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
                head.rotation.z += flap * .22;leftEar.rotation.z += flap * .7;rightEar.rotation.z -= flap * .7;hat.rotation.z += flap * .12;
                hat.rotation.x += flight * (.16 + anim.flare);tail.rotation.x += flight * .45;
                head.rotation.x += nod * anim.nod;hat.rotation.x += nod * anim.nod * 1.4;
                if (this.pulseKind === 'ironclad') {head.position.y += pulse * .05;head.rotation.x -= pulse * .1;}
                else if (this.pulseKind === 'hustle') {hat.position.y += pulse * .12;leftEar.rotation.z += pulse * .3;rightEar.rotation.z -= pulse * .3;}
                else {head.rotation.x -= pulse * .12;hat.position.y += pulse * .04;}
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
            leftEye.scale.y = rightEye.scale.y = 1 - Math.max(blink, this.extras.length && this.hitAge < .14 ? Math.sin(this.hitAge / .14 * Math.PI) : 0) * 0.94;
            leftEar.rotation.z = twitch;
            rightEar.rotation.z = -twitch * 0.65;
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
        }
        this.poseExtras(sway, stepLift);
        this.gunSleeves.forEach(updateGunSleeve);
        this.deformTails();
    }

    private deformTails(reset = false): void {
        // The longitudinal wave is identical around each ring and across rigs.
        // Death contact projection remains per rig in world space below.
        let rings = 0;
        for (const { tail } of this.tails) rings = Math.max(rings, tail.geometry.parameters.tubularSegments + 1);
        if (this.ringReady.length < rings) {
            this.ringWave = new Float64Array(rings * 2); this.ringOffset = new Float64Array(rings * 3);
            this.ringWaveReady = new Uint8Array(rings); this.ringReady = new Uint8Array(rings);
        }
        const waves = this.ringWave, waveReady = this.ringWaveReady, offsets = this.ringOffset, ready = this.ringReady;
        let waveSegments = -1;
        for (const { tail, rest, tip, tipRest } of this.tails) {
            const positions = tail.geometry.getAttribute('position') as THREE.BufferAttribute;
            const segments = tail.geometry.parameters.tubularSegments;
            // Rigs share the wave per u; ring indices only match at equal segment counts.
            if (segments !== waveSegments) { waveReady.fill(0); waveSegments = segments; }
            ready.fill(0);
            const uv = tail.geometry.getAttribute('uv');
            let tipX = 0, tipY = 0, tipZ = 0;
            if (this.deathAnimation) {
                tail.updateWorldMatrix(true, false);
                this.inverseTail.copy(tail.matrixWorld).invert();
            }
            for (let i = 0; i < positions.count; i++) {
                const u = uv.getX(i), ring = Math.round(u * segments);
                if (ready[ring]) {
                    positions.setXYZ(i, rest[i * 3] + offsets[ring * 3], rest[i * 3 + 1] + offsets[ring * 3 + 1], rest[i * 3 + 2] + offsets[ring * 3 + 2]);
                    continue;
                }
                // The root stays attached; a delayed wave bends the middle before
                // reaching the tip, instead of swinging the whole tail rigidly.
                const weight = u * u;
                if (!waveReady[ring]) {
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
                        // L6: the tail whips like a flag in flight.
                        x+=weight*Math.sin(this.time*12-u*5)*this.flail*.55;
                    }
                    waves[ring * 2] = x; waves[ring * 2 + 1] = y; waveReady[ring] = 1;
                }
                let x = waves[ring * 2], y = waves[ring * 2 + 1];
                let z = 0;
                if (this.deathAnimation && !reset) {
                    x += weight * this.tailFall.x * 0.85;
                    y += weight * this.tailFall.y * 0.85;
                    z += weight * this.tailFall.z * 0.85;
                    tail.geometry.parameters.path.getPointAt(u, this.tailCenter);
                    this.tailCenter.x += x; this.tailCenter.y += y; this.tailCenter.z += z;
                    this.tailCenter.applyMatrix4(tail.matrixWorld);
                    const lift = Math.max(0, 0.068 - this.tailCenter.y);
                    // Keep the flexible tail resting on the floor as the torso rolls.
                    x += this.inverseTail.elements[4] * lift;
                    y += this.inverseTail.elements[5] * lift;
                    z += this.inverseTail.elements[6] * lift;
                }
                offsets[ring * 3] = x; offsets[ring * 3 + 1] = y; offsets[ring * 3 + 2] = z; ready[ring] = 1;
                positions.setXYZ(i, rest[i * 3] + x, rest[i * 3 + 1] + y, rest[i * 3 + 2] + z);
                if (u === 1) { tipX = x; tipY = y; tipZ = z; }
            }
            tip.position.copy(tipRest);
            tip.position.x += tipX;
            tip.position.y += tipY;
            tip.position.z += tipZ;
            positions.needsUpdate = true;
            // The additive outline is unlit and casts no shadow: its deformed
            // normals are never consumed. Keep lit-tail normals exact.
            if(!(tail.material instanceof THREE.MeshBasicMaterial&&!tail.castShadow&&!tail.material.envMap))tail.geometry.computeVertexNormals();
            if(this.deathAnimation)tail.geometry.computeBoundingSphere();
            else {
                // Living-tail displacement is bounded by the clamped motion/turn
                // wave; avoid a per-vertex bounds scan on every display frame.
                tail.geometry.boundingSphere??=new THREE.Sphere();
                tail.geometry.boundingSphere.center.set(0,0,-.6);tail.geometry.boundingSphere.radius=2;
            }
        }
    }
}
