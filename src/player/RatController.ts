import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { RatOptions } from '../utils/RatModel';

// ─── TUNING CONSTANTS ─────────────────────────────────────────────
const MOVE_SPEED = 18;
const ACCEL = 0.28;
const DECEL = 0.12;
const JUMP_IMPULSE = 16;

const CAM_RADIUS = 6.0;
const CAM_PIVOT_Y = 3.5;
const MOUSE_SENS = 0.002;

export class RatController {
    public entity: RatEntity;
    private camera: THREE.PerspectiveCamera;
    private spherical = new THREE.Spherical(CAM_RADIUS, Math.PI * 0.4, Math.PI);

    private groundGrace = 0;
    private disposed = false;
    private readonly forward = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly up = new THREE.Vector3(0, 1, 0);
    private readonly pivot = new THREE.Vector3();
    private readonly offset = new THREE.Vector3();

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        camera: THREE.PerspectiveCamera,
        name: string = 'Player',
        options?: RatOptions,
        spawnPos?: THREE.Vector3
    ) {
        this.camera = camera;

        // Create the Player Entity with the player's chosen name and appearance
        const pos = spawnPos ?? new THREE.Vector3(15, 2, 15);
        this.entity = new RatEntity(scene, world, pos, name, options);

    }

    onMouseMove(dx: number, dy: number): void {
        this.spherical.theta -= dx * MOUSE_SENS;
        this.spherical.phi -= dy * MOUSE_SENS;
        // Wider clamp so you can look almost straight up/down without snap
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
    }

    update(dt: number, keys: Record<string, boolean>): void {
        this.prepareMovement(dt, keys);
        this.syncAfterPhysics(dt);
    }

    /** Apply controls before the fixed physics step. Factors match the original at60Hz. */
    prepareMovement(dt: number, keys: Record<string, boolean>): void {
        if (this.disposed) return;
        this.groundGrace = Math.max(0, this.groundGrace - dt);
        if (!this.entity.dead && this.entity.hp > 0) this.applyMovement(dt, keys);
    }

    syncAfterPhysics(dt: number): void {
        if (this.disposed) return;
        this.entity.update(dt);
        if (!this.entity.dead && this.entity.body.velocity.y <= 1) {
            const body = this.entity.body;
            for (const contact of this.entity.world.contacts) {
                const normalY = contact.bi === body ? -contact.ni.y : contact.bj === body ? contact.ni.y : 0;
                // Explicit80ms grace permits forgiving edge jumps, never unlimited air jumps.
                if (normalY > 0.5) { this.groundGrace = 0.08; break; }
            }
        }
        this.updateView();
    }

    updateView(): void {
        this.updateCamera();
        this.entity.syncGlowTransform();
    }

    resetGrounding(): void { this.groundGrace = 0; }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.resetGrounding();
        this.entity.dispose();
    }

    private applyMovement(dt: number, keys: Record<string, boolean>): void {
        // Camera-relative directions
        const forward = this.forward.set(0, 0, -1).applyAxisAngle(this.up, this.spherical.theta);
        const right = this.right.set(1, 0, 0).applyAxisAngle(this.up, this.spherical.theta);

        let desiredX = 0;
        let desiredZ = 0;

        if (keys['KeyW'] || keys['ArrowUp']) { desiredX += forward.x; desiredZ += forward.z; }
        if (keys['KeyS'] || keys['ArrowDown']) { desiredX -= forward.x; desiredZ -= forward.z; }
        if (keys['KeyA'] || keys['ArrowLeft']) { desiredX -= right.x; desiredZ -= right.z; }
        if (keys['KeyD'] || keys['ArrowRight']) { desiredX += right.x; desiredZ += right.z; }

        // Normalize
        const len = Math.sqrt(desiredX * desiredX + desiredZ * desiredZ);
        if (len > 0) {
            desiredX = (desiredX / len) * MOVE_SPEED;
            desiredZ = (desiredZ / len) * MOVE_SPEED;
        }

        const v = this.entity.body.velocity;

        const acceleration = 1 - Math.pow(1 - ACCEL, dt * 60);
        const braking = Math.pow(1 - DECEL, dt * 60);
        // Apply
        if (len > 0) {
            this.entity.body.wakeUp();
            v.x += (desiredX - v.x) * acceleration;
            v.z += (desiredZ - v.z) * acceleration;
        } else {
            v.x *= braking;
            v.z *= braking;
        }

        // Jump
        if (keys['Space'] && this.groundGrace > 0) {
            v.y = JUMP_IMPULSE;
            this.groundGrace = 0;
        }

        // Rotate Character to face camera (Always Strafe mode for shooting)
        const targetAngle = this.spherical.theta + Math.PI;
        let diff = targetAngle - this.entity.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.entity.mesh.rotation.y += diff * (1 - Math.pow(1 - 0.35, dt * 60));
    }

    private updateCamera(): void {
        const mesh = this.entity.mesh;
        const pivot = this.pivot.set(mesh.position.x, mesh.position.y + CAM_PIVOT_Y, mesh.position.z);
        const offset = this.offset.setFromSpherical(this.spherical);


        // Direct copy — NO lerp. Lerp causes snap-back when whipping around fast
        // because it interpolates through 3D space, not spherical space.
        this.camera.position.copy(pivot).add(offset);
        this.camera.lookAt(pivot);
    }
}
