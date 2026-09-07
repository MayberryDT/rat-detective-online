import * as THREE from 'three';

const PARTS = ['rat-body', 'rat-head', 'rat-hat', 'rat-tail',
    'rat-eye-left', 'rat-eye-right', 'rat-ear-left', 'rat-ear-right', 'rat-arm', 'rat-pistol'] as const;

/** Small procedural poses shared by the visible character and its outline shell. */
export class RatAnimator {
    private readonly rigs;
    private readonly tails;
    private tailMotion = 0;
    private tailTurn = 0;
    private time = 0;
    private stride = 0;
    private movement = 0;
    private recoil = 0;
    private acceleration = 0;
    private coatTurn = 0;
    private respawnAge = 1;
    private hit = 0;
    private hitAge = 10;
    private readonly flop = new THREE.Vector2();
    private readonly flopVelocity = new THREE.Vector2();
    private readonly localSpin = new THREE.Vector3();
    private readonly localGravity = new THREE.Vector3();
    private readonly tailFall = new THREE.Vector3();
    private landingPulse = 0;
    private deathAnimation = false;
    private readonly tailCenter = new THREE.Vector3();
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

    constructor(private readonly root: THREE.Group, outline: THREE.Group) {
        this.tails = [root, outline].map(model => {
            const tail = model.getObjectByName('rat-tail') as THREE.Mesh<THREE.TubeGeometry>;
            const positions = tail.geometry.getAttribute('position') as THREE.BufferAttribute;
            positions.setUsage(THREE.DynamicDrawUsage);
            return { tail, rest: positions.array.slice(), tip: tail.children[0],
                tipRest: tail.children[0].position.clone() };
        });
        this.rigs = [root, outline].map(model => PARTS.map(name => {
            const part = model.getObjectByName(name)!;
            return { part, position: part.position.clone(), rotation: part.rotation.clone(), scale: part.scale.clone() };
        }));
    }

    takeHit(): void {
        this.hit = 1;
        this.hitAge = 0;
        this.applyPose();
    }

    /** Damped secondary motion reacts to actual tumble and contact impulses. */
    poseDeath(time: number, dt: number, spin: { x: number; y: number; z: number }, impact: number, resting: boolean): void {
        this.restore();
        this.deathAnimation = true;
        this.parentRotation.copy(this.root.quaternion).invert();
        this.localSpin.set(spin.x, spin.y, spin.z).applyQuaternion(this.parentRotation);
        this.localGravity.set(0, -1, 0).applyQuaternion(this.parentRotation);
        this.flopVelocity.x += impact * 3.5;
        this.flopVelocity.y -= impact * 2.2;
        this.landingPulse = Math.max(this.landingPulse, impact);
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
        const stretch = time >= 0.28 ? 0 : Math.sin(time / 0.28 * Math.PI) * 0.13;
        for (const rig of this.rigs) {
            const body = rig[0].part, head = rig[1].part, hat = rig[2].part;
            body.scale.y *= 1 + stretch - this.landingPulse * 0.13;
            body.scale.x *= 1 - stretch * 0.4 + this.landingPulse * 0.08;
            body.scale.z *= 1 - stretch * 0.4 + this.landingPulse * 0.08;
            head.rotation.x += this.flop.x * 0.6;
            head.rotation.z += this.flop.y * 0.6;
            hat.rotation.x += this.flop.x;
            hat.rotation.z += this.flop.y;
            // A brief lift on launch, then a soft wobble when the body lands.
            hat.position.y += stretch * 0.55 + this.landingPulse * 0.035;
            rig[8].part.rotation.x += this.flop.x * 1.4;
            rig[8].part.rotation.z += this.flop.y * 1.6;
            rig[4].part.scale.y = rig[5].part.scale.y = 0.18;
        }
        this.tailFall.lerp(this.localGravity, 1 - Math.exp(-5 * dt));
        this.time = time;
        this.stride = time * 7;
        this.tailMotion = resting ? 0 : Math.min(this.localSpin.length() / 12, 1);
        this.tailTurn = this.flop.y * 0.6;
        this.deformTails();
    }

    shoot(target?: THREE.Vector3): void {
        this.aimTarget = target?.clone() ?? null;
        this.recoil = 1;
        this.aimHold = 0.7;
        this.aim = 1;
        this.applyPose();
    }

    playRespawn(): void {
        this.respawnAge = 0;
    }

    reset(): void {
        this.time = this.stride = this.movement = this.recoil = this.turn = this.hit = 0;
        this.acceleration = this.coatTurn = 0;
        this.respawnAge = 1;
        this.aimHold = this.aim = 0;
        this.aimTarget = null;
        this.lastPosition = null;
        this.hitAge = 10;
        this.flop.set(0, 0); this.flopVelocity.set(0, 0);
        this.tailFall.set(0, 0, 0);
        this.landingPulse = 0;
        this.deathAnimation = false;
        this.tailMotion = this.tailTurn = 0;
        this.restore();
        this.deformTails(true);
    }

    private restore(): void {
        for (const rig of this.rigs) for (const { part, position, rotation, scale } of rig) {
            part.position.copy(position);
            part.rotation.copy(rotation);
            part.scale.copy(scale);
        }
    }

    update(dt: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) return;
        dt = Math.min(dt, 0.1);
        const position = this.root.position;
        const yaw = this.orientation.setFromQuaternion(this.root.quaternion, 'YXZ').y;
        let speed = 0;
        let turnRate = 0;
        if (this.lastPosition) {
            const distance = Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z);
            // Teleports/corrections do not trigger a sprint pose.
            if (distance < 2) speed = distance / dt;
            turnRate = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / dt;
        } else this.lastPosition = new THREE.Vector3();
        this.lastPosition.copy(position);
        this.lastYaw = yaw;
        const blend = 1 - Math.exp(-10 * dt);
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
        this.time += dt;
        // Slower, distinct alternating steps read better than a fast vibration.
        this.stride += dt * (4 + this.movement * 5);
        this.recoil *= Math.exp(-14 * dt);
        this.hitAge += dt;
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
        const blinkPhase = this.time % 4.7;
        const blink = blinkPhase > 4.48 ? Math.sin((blinkPhase - 4.48) / 0.22 * Math.PI) : 0;
        const twitchPhase = this.time % 6.1;
        const twitch = twitchPhase > 5.7 ? Math.sin((twitchPhase - 5.7) * Math.PI / 0.4) * 0.12 : 0;
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
            body.position.z = -this.recoil * 0.055;
            head.rotation.y += this.turn * 0.9;
            head.rotation.z = -sway * 0.06;
            head.rotation.x = -this.hit * 0.025 + breath * 0.009 - compression * 0.02 - this.recoil * 0.035;
            hat.rotation.x += Math.sin(this.hitAge * 22) * Math.exp(-this.hitAge * 13) * 0.035 + this.recoil * 0.11 + followThrough * 0.045;
            hat.rotation.z += followThrough * 0.035 + (this.turn - this.coatTurn) * 0.2;
            hat.position.y += entrance * 0.24;
            hat.rotation.x += entrance * 0.14;
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
            leftEye.scale.y = rightEye.scale.y = 1 - blink * 0.94;
            leftEar.rotation.z = twitch;
            rightEar.rotation.z = -twitch * 0.65;
        }
        this.deformTails();
    }

    private deformTails(reset = false): void {
        for (const { tail, rest, tip, tipRest } of this.tails) {
            const positions = tail.geometry.getAttribute('position') as THREE.BufferAttribute;
            const uv = tail.geometry.getAttribute('uv');
            let tipX = 0, tipY = 0, tipZ = 0;
            if (this.deathAnimation) {
                tail.updateWorldMatrix(true, false);
                this.inverseTail.copy(tail.matrixWorld).invert();
            }
            for (let i = 0; i < positions.count; i++) {
                const u = uv.getX(i);
                // The root stays attached; a delayed wave bends the middle before
                // reaching the tip, instead of swinging the whole tail rigidly.
                const weight = u * u;
                let x = reset ? 0 : weight * (
                    Math.sin(this.time * 1.5 - u * 2.4) * 0.07 * (this.deathAnimation ? this.tailMotion : 1) +
                    Math.sin(this.stride - u * 2.8) * this.tailMotion * 0.38 +
                    this.tailTurn * 1.1);
                // Ground contact stays steady through the middle. Only the last
                // quarter lifts slightly as the tip flicks across the floor.
                const tipWeight = Math.max(0, (u - 0.75) / 0.25);
                let y = reset ? 0 : tipWeight * tipWeight *
                    (1 + Math.sin(this.stride - u * 2.8 - 0.8)) * this.tailMotion * 0.025;
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
                positions.setXYZ(i, rest[i * 3] + x, rest[i * 3 + 1] + y, rest[i * 3 + 2] + z);
                if (u === 1) { tipX = x; tipY = y; tipZ = z; }
            }
            tip.position.copy(tipRest);
            tip.position.x += tipX;
            tip.position.y += tipY;
            tip.position.z += tipZ;
            positions.needsUpdate = true;
            tail.geometry.computeVertexNormals();
            tail.geometry.computeBoundingSphere();
        }
    }
}
