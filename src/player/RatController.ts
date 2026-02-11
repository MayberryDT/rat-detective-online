import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { CheeseGun } from '../weapons/CheeseGun';
import { RatOptions } from '../utils/RatModel';

// ─── TUNING CONSTANTS ─────────────────────────────────────────────
const MOVE_SPEED = 18;
const ACCEL = 0.28;
const DECEL = 0.12;
const JUMP_IMPULSE = 16;

const CAM_RADIUS = 6.0;
const CAM_PIVOT_Y = 3.5;
const CAM_LERP = 0.12;
const MOUSE_SENS = 0.002;

export class RatController {
    public entity: RatEntity;
    private camera: THREE.PerspectiveCamera;
    private spherical = new THREE.Spherical(CAM_RADIUS, Math.PI * 0.4, Math.PI);

    private canJump = false;
    private elapsed = 0;

    constructor(scene: THREE.Scene, world: CANNON.World, camera: THREE.PerspectiveCamera, name: string = 'Player', options?: RatOptions) {
        this.camera = camera;

        // Create the Player Entity with the player's chosen name and appearance
        this.entity = new RatEntity(scene, world, new THREE.Vector3(15, 2, 15), name, options);

        // Listen for ground contact
        this.entity.body.addEventListener('collide', (evt: any) => {
            const contactNormal = new CANNON.Vec3();
            const contact = evt.contact;

            // Normalize direction
            if (contact.bi.id === this.entity.body.id) {
                contact.ni.negate(contactNormal);
            } else {
                contactNormal.copy(contact.ni);
            }

            if (contactNormal.y > 0.5) {
                this.canJump = true;
            }
        });
    }

    onMouseMove(dx: number, dy: number): void {
        this.spherical.theta -= dx * MOUSE_SENS;
        this.spherical.phi -= dy * MOUSE_SENS;
        // Wider clamp so you can look almost straight up/down without snap
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
    }

    /** Expose theta so others can see look direction */
    get yaw(): number {
        return this.spherical.theta;
    }

    update(dt: number, keys: Record<string, boolean>, gun: CheeseGun): void {
        this.elapsed += dt;
        this.entity.update(dt); // Updates mesh position
        this.updateCamera();    // Keeps camera following

        if (this.entity.dead) return; // Stop input/movement if dead

        this.applyMovement(keys); // <--- RESTORED: This was missing!

        // Shooting Input (handled in main, but we provide data or Could do it here if passed keys)
    }

    private applyMovement(keys: Record<string, boolean>): void {
        // Camera-relative directions
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.spherical.theta);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.spherical.theta);

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

        // Apply
        if (len > 0) {
            this.entity.body.wakeUp();
            v.x += (desiredX - v.x) * ACCEL;
            v.z += (desiredZ - v.z) * ACCEL;
        } else {
            v.x *= (1.0 - DECEL);
            v.z *= (1.0 - DECEL);
        }

        // Jump
        if (keys['Space'] && this.canJump) {
            v.y = JUMP_IMPULSE;
            this.canJump = false;
        }

        // Rotate Character to face camera (Always Strafe mode for shooting)
        const targetAngle = this.spherical.theta + Math.PI;
        let diff = targetAngle - this.entity.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.entity.mesh.rotation.y += diff * 0.35;
    }

    private updateCamera(): void {
        const mesh = this.entity.mesh;
        const pivot = new THREE.Vector3(mesh.position.x, mesh.position.y + CAM_PIVOT_Y, mesh.position.z);
        const offset = new THREE.Vector3().setFromSpherical(this.spherical);
        const desired = pivot.clone().add(offset);

        // Direct copy — NO lerp. Lerp causes snap-back when whipping around fast
        // because it interpolates through 3D space, not spherical space.
        this.camera.position.copy(desired);
        this.camera.lookAt(pivot);
    }
}
