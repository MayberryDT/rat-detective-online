import {emitWorldSound} from '../audio/WorldSoundEvents';
import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';
import { RatOptions } from '../utils/RatModel';
import { PRESSURE_LAUNCH, type ChaosState } from '../shared/chaosState';
import type {TouchMovement} from '../session/TouchInput';

// ─── TUNING CONSTANTS ─────────────────────────────────────────────
const MOVE_SPEED = 18;
const ACCEL = 0.28;
const DECEL = 0.12;
// A quicker player-only arc: v scales with sqrt(g), preserving the old apex.
// This shortens a normal hop about 12% without changing world/ball gravity.
const JUMP_GRAVITY_SCALE = 1.28;
const JUMP_IMPULSE = 16 * Math.sqrt(JUMP_GRAVITY_SCALE);

const CAM_RADIUS = 6.0;
const CAM_PIVOT_Y = 3.5;
const CAM_SHOULDER = 1.25;
const MOUSE_SENS = 0.002;

export class RatController {
    public entity: RatEntity;
    private camera: THREE.PerspectiveCamera;
    private spherical = new THREE.Spherical(CAM_RADIUS, Math.PI * 0.4, Math.PI);

    private readonly cameraBlockers: THREE.Object3D[];
    private readonly cameraRay = new THREE.Raycaster();
    private groundGrace = 0;
    get grounded():boolean {return this.groundGrace>0;}
    /** Hot Pursuit only: scales the owner's normal walking speed while active. */
    private speedScale = 1;
    private launcherFlight = false;
    private beforeLaunchDamping:number|undefined;
    private normalJump = false;
    private readonly appliedLaunches = new Set<string>();
    private disposed = false;
    private readonly forward = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly up = new THREE.Vector3(0, 1, 0);
    private readonly pivot = new THREE.Vector3();
    private readonly viewDirection = new THREE.Vector3();
    private readonly shoulder = new THREE.Vector3();
    private readonly offset = new THREE.Vector3();

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        camera: THREE.PerspectiveCamera,
        name: string = 'Player',
        options?: RatOptions,
        spawnPos?: THREE.Vector3,
        private readonly launcherBounds?: {min:number;max:number}
    ) {
        this.camera = camera;
        scene.updateMatrixWorld(true);
        this.cameraBlockers = scene.children.filter(o=>o.userData.aimTarget===true);

        // Create the Player Entity with the player's chosen name and appearance
        const pos = spawnPos ?? new THREE.Vector3(15, 2, 15);
        this.entity = new RatEntity(scene, world, pos, name, options);

    }

    /** 1 restores the ratified ordinary movement exactly; never a new base speed. */
    setSpeedScale(scale:number):void { this.speedScale = Number.isFinite(scale) && scale > 0 ? scale : 1; }
    get moveSpeedScale():number { return this.speedScale; }
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
    prepareMovement(dt: number, keys: Record<string, boolean>, touch?: TouchMovement): void {
        if (this.disposed) return;
        this.groundGrace = Math.max(0, this.groundGrace - dt);
        if (!this.entity.dead && this.entity.hp > 0) this.applyMovement(dt, keys, touch);
        else {this.normalJump=false;this.beforeLaunchDamping=undefined;}
    }

    syncAfterPhysics(dt: number): void {
        if (this.disposed) return;
        this.containLauncherFlight();
        this.entity.update(dt);
        if (!this.entity.dead && this.entity.body.velocity.y <= 1) {
            const body = this.entity.body;
            for (const contact of this.entity.world.contacts) {
                const normalY = contact.bi === body ? -contact.ni.y : contact.bj === body ? contact.ni.y : 0;
                // Explicit80ms grace permits forgiving edge jumps, never unlimited air jumps.
                if (normalY > 0.5) { if(this.beforeLaunchDamping!==undefined){body.linearDamping=this.beforeLaunchDamping;this.beforeLaunchDamping=undefined;} this.groundGrace = 0.08; this.launcherFlight=false; this.normalJump=false; break; }
            }
        }
        this.updateView();
    }

    updateView(): void {
        this.updateCamera();
        // Keep the camera ray current when input arrives before the next render.
        this.camera.updateWorldMatrix(true, false);
        this.entity.syncGlowTransform();
    }

    /** Server-selected launch events are retained briefly in snapshots and applied once. */
    applyPressureLaunches(state:ChaosState,playerId:string):void {
        for(const event of state.pressure?.launches||[]){
            if(event.playerId!==playerId || this.appliedLaunches.has(event.id))continue;
            this.appliedLaunches.add(event.id);
            if(this.appliedLaunches.size>32)this.appliedLaunches.delete(this.appliedLaunches.values().next().value!);
            if(state.time-event.at<0 || state.time-event.at>PRESSURE_LAUNCH.eventMs || this.entity.dead || this.entity.hp<=0)continue;
            this.beforeLaunchDamping??=this.entity.body.linearDamping;
            this.entity.body.linearDamping=.1; // Match server flight, including after a low-damping respawn.
            this.entity.body.velocity.set(event.velocity.x,event.velocity.y,event.velocity.z);
            this.entity.body.wakeUp();this.groundGrace=0;this.normalJump=false;
            this.launcherFlight=!!this.launcherBounds;
        }
    }

    /** Keep launcher flights in the prototype city throughout unrestricted air steering.
     * A gentle inward deflection precedes the hard body inset, which also catches
     * collision kicks that cross the boundary within a single physics step.
     */
    private containLauncherFlight():void {
        if(this.entity.dead || this.entity.hp<=0){this.launcherFlight=false;return;}
        if(!this.launcherFlight || !this.launcherBounds)return;
        const body=this.entity.body,min=this.launcherBounds.min+3,max=this.launcherBounds.max-3;
        for(const axis of ['x','z'] as const){
            const position=body.position[axis],velocity=body.velocity[axis];
            if(position<min+5 && velocity<0)body.velocity[axis]=Math.max(8,-velocity*.45);
            else if(position>max-5 && velocity>0)body.velocity[axis]=-Math.max(8,velocity*.45);
            body.position[axis]=Math.max(min,Math.min(max,position));
            if(body.position[axis]!==position)body.aabbNeedsUpdate=true;
        }
    }

    resetGrounding(): void { this.beforeLaunchDamping=undefined; this.groundGrace = 0; this.launcherFlight=false; this.normalJump=false; }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.resetGrounding();
        this.entity.dispose();
    }

    private applyMovement(dt: number, keys: Record<string, boolean>, touch?: TouchMovement): void {
        // Camera-relative directions
        const forward = this.forward.set(0, 0, -1).applyAxisAngle(this.up, this.spherical.theta);
        const right = this.right.set(1, 0, 0).applyAxisAngle(this.up, this.spherical.theta);

        let desiredX = 0;
        let desiredZ = 0;

        if (keys['KeyW'] || keys['ArrowUp']) { desiredX += forward.x; desiredZ += forward.z; }
        if (keys['KeyS'] || keys['ArrowDown']) { desiredX -= forward.x; desiredZ -= forward.z; }
        if (keys['KeyA'] || keys['ArrowLeft']) { desiredX -= right.x; desiredZ -= right.z; }
        if (keys['KeyD'] || keys['ArrowRight']) { desiredX += right.x; desiredZ += right.z; }
        if (touch) {
            desiredX += forward.x * touch.y + right.x * touch.x;
            desiredZ += forward.z * touch.y + right.z * touch.x;
        }

        // Normalize
        const len = Math.sqrt(desiredX * desiredX + desiredZ * desiredZ);
        if (len > 0) {
            desiredX = (desiredX / Math.max(1, len)) * MOVE_SPEED;
            desiredZ = (desiredZ / Math.max(1, len)) * MOVE_SPEED;
            desiredX *= this.speedScale;
            desiredZ *= this.speedScale;
        }

        const v = this.entity.body.velocity;

        const acceleration = 1 - Math.pow(1 - ACCEL, dt * 60);
        const braking = Math.pow(1 - DECEL, dt * 60);
        // Apply
        // Full steering throughout a launch; only the vertical impulse is retained.
        if (len > 0) {
            this.entity.body.wakeUp();
            v.x += (desiredX - v.x) * acceleration;
            v.z += (desiredZ - v.z) * acceleration;
        } else {
            v.x *= braking;
            v.z *= braking;
        }

        // Jump
        if ((keys['Space'] || touch?.jump) && this.groundGrace > 0) {
            v.y = JUMP_IMPULSE;
            emitWorldSound(this.entity.scene,'jump',this.entity.body.position,{key:'local-jump'});
            this.groundGrace = 0;
            this.normalJump = true;
        }
        // Only deliberate player jumps receive the extra gravity. Falling off ledges,
        // ragdolls, and any of the machine throws retain their original arc.
        if(this.normalJump)this.entity.body.force.y +=
            this.entity.body.mass*this.entity.world.gravity.y*(JUMP_GRAVITY_SCALE-1);

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
        pivot.y = mesh.position.y + 2.2;
        // Translate the view sideways without toeing it back into the rat's head.
        this.viewDirection.copy(pivot).sub(this.camera.position).normalize();
        this.shoulder.set(1,0,0).applyAxisAngle(this.up,this.spherical.theta).multiplyScalar(CAM_SHOULDER);
        // Resolve the shoulder first, then the boom: backing into a wall must
        // shorten distance without collapsing the view back onto the rat.
        this.cameraRay.set(pivot,this.shoulder.clone().normalize());
        this.cameraRay.far=CAM_SHOULDER;
        const shoulderHit=this.cameraRay.intersectObjects(this.cameraBlockers,true)[0];
        if(shoulderHit)this.shoulder.setLength(Math.max(0,shoulderHit.distance-.3));
        this.camera.position.add(this.shoulder);
        pivot.add(this.shoulder);
        offset.copy(this.camera.position).sub(pivot);
        this.cameraRay.far = offset.length();
        this.cameraRay.set(pivot, offset.normalize());
        const hit = this.cameraRay.intersectObjects(this.cameraBlockers,true)[0];
        if(hit) this.camera.position.copy(pivot).addScaledVector(this.cameraRay.ray.direction,Math.max(.3,hit.distance-.3));
        this.camera.lookAt(this.offset.copy(this.camera.position).add(this.viewDirection));
    }
}
