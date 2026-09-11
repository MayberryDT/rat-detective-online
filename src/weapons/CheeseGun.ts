import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {SpatialRayQuery} from '../shared/SpatialRayQuery';
import type {ShotTrace} from '../shared/LocalShotPresentation';
import type { ShotDescriptor } from '../shared/networkProtocol';
import type { IncidentId } from '../shared/incidentCatalog';
import { CheeseImpactEffects } from './CheeseImpactEffects';
import { GunshotAudio } from '../audio/GunshotAudio';
import { createCheeseBallGeometry, createCheeseBallMaterial } from './CheeseProjectileModel';
import { RatEntity } from '../entities/RatEntity';
import { createShotId } from './shotId';

// ─── CHEESE BALL TUNING ────────────────────────────────────────────
import { BALL_SPEED, BALL_RESTITUTION, BALL_GRAVITY, BALL_LIFETIME } from '../shared/ballTuning';

// Collision Groups
const GROUP_DEFAULT = 1;
const GROUP_PROJECTILE = 4;

interface CheeseBall {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    position: THREE.Vector3;
    age: number;
    squash: number;
    owner: RatEntity;
}

export class CheeseGun {
    public authoritative = false;
    public fireCue: 'normal' | 'malfunction' = 'normal';
    private scene: THREE.Scene;
    private world: CANNON.World;
    private presentationRay?:SpatialRayQuery;
    private readonly acceptPresentationBody=(body:CANNON.Body)=>
        (body as CANNON.Body&{userData?:{entity?:RatEntity}}).userData?.entity!==this.playerEntity;
    private camera: THREE.PerspectiveCamera | null = null;
    private playerEntity: RatEntity | null = null;

    private balls: CheeseBall[] = [];
    // Ball meshes own their transforms; the gun owns the shared GPU resources.
    private readonly ballGeometry = createCheeseBallGeometry();
    private readonly ballMaterial = createCheeseBallMaterial();
    private disposed = false;
    private readonly impacts: CheeseImpactEffects;
    private readonly aimRay = new THREE.Raycaster();
    private readonly aimCenter = new THREE.Vector2(0, 0);
    private readonly gravityStep = new THREE.Vector3();
    private readonly moveStep = new THREE.Vector3();
    private readonly nextPos = new THREE.Vector3();
    private readonly hitPoint = new THREE.Vector3();
    private readonly hitNormal = new THREE.Vector3();
    private readonly rayFrom = new CANNON.Vec3();
    private readonly rayTo = new CANNON.Vec3();
    private readonly rayResult = new CANNON.RaycastResult();
    private readonly rayOptions: CANNON.RayOptions = {
        collisionFilterGroup: GROUP_PROJECTILE,
        collisionFilterMask: GROUP_DEFAULT,
        skipBackfaces: true,
    };

    // Network callback: fires when a local projectile hits an entity
    public onHitEntity: ((victim: RatEntity, damage: number) => void) | null = null;

    private readonly fireAudio: GunshotAudio;

    constructor(scene: THREE.Scene, world: CANNON.World, listener: THREE.AudioListener) {
        this.scene = scene;
        this.world = world;
        this.impacts = new CheeseImpactEffects(scene);

        this.fireAudio = new GunshotAudio(listener);
    }

    /** Call once after player is created to enable camera-based aiming */
    setPlayer(camera: THREE.PerspectiveCamera, entity: RatEntity): void {
        this.camera = camera;
        this.playerEntity = entity;
    }

    /**
     * Shoot a cheese ball.
     * For the PLAYER: uses camera raycasting for precise aim convergence.
     * For NPCs: shoots directly at the provided targetPoint.
     */
    shoot(owner: RatEntity, targetPoint: THREE.Vector3): ShotDescriptor | null {
        if (this.disposed) return null;

        let finalTarget: THREE.Vector3;

        // ── PLAYER AIM: Camera Raycasting for Convergence ──
        if (this.camera && this.playerEntity && owner === this.playerEntity) {
            const raycaster = this.aimRay;
            raycaster.setFromCamera(this.aimCenter, this.camera);

            const intersects = raycaster.intersectObjects(this.scene.children.filter(object => object.userData.aimTarget === true), true);
            let hitTarget: THREE.Vector3 | null = null;

            for (const hit of intersects) {
                let isOwner = false;
                hit.object.traverseAncestors((ancestor) => {
                    if (ancestor === owner.mesh) isOwner = true;
                });
                if (hit.object === owner.mesh) isOwner = true;

                if (!isOwner) {
                    hitTarget = hit.point;
                    break;
                }
            }

            if (hitTarget) {
                finalTarget = hitTarget;
            } else {
                // Sky / miss — project far forward
                const forward = new THREE.Vector3();
                this.camera.getWorldDirection(forward);
                finalTarget = this.camera.position.clone().add(forward.multiplyScalar(200));
            }
        } else {
            // ── NPC AIM: Direct ──
            finalTarget = targetPoint.clone();
        }

        // ── Spawn Origin ──
        owner.playShootAnimation(finalTarget);
        const origin = owner.getMuzzlePosition();
        this.fireAudio.play(origin, owner === this.playerEntity, this.fireCue);

        // ── Direction (no gravity compensation — consistent power at all distances) ──
        const finalDir = new THREE.Vector3().subVectors(finalTarget, origin).normalize();

        if(!this.authoritative)this.createBall(origin, finalDir, owner);
        return { shotId: createShotId(), origin: { x: origin.x, y: origin.y, z: origin.z },
            direction: { x: finalDir.x, y: finalDir.y, z: finalDir.z } };
    }

    /** Replay the resolved trajectory; never re-aim from an interpolated remote rat. */
    replayShot(owner: RatEntity, shot: ShotDescriptor): void {
        if (this.disposed) return;
        this.fireAudio.play(shot.origin, false, this.fireCue);
        owner.playShootAnimation(new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z)
            .addScaledVector(new THREE.Vector3(shot.direction.x, shot.direction.y, shot.direction.z), 30));
        if(!this.authoritative)this.createBall(new THREE.Vector3(shot.origin.x, shot.origin.y, shot.origin.z),
            new THREE.Vector3(shot.direction.x, shot.direction.y, shot.direction.z), owner);
    }

    setIncident(incident?: IncidentId): void {
        this.fireCue = incident === 'bad-ammunition' ? 'malfunction' : 'normal';
    }

    /** Presentation sweeps never damage entities or emit hit feedback. Exclude
     * the owner before selecting the closest hit, so it cannot mask a wall. */
    readonly tracePresentation:ShotTrace=(from,to)=>{
        this.rayFrom.set(from.x,from.y,from.z);this.rayTo.set(to.x,to.y,to.z);
        this.presentationRay??=new SpatialRayQuery(this.world);
        const hit=this.presentationRay.closest(this.rayFrom,this.rayTo,GROUP_DEFAULT,this.acceptPresentationBody,GROUP_PROJECTILE);
        if(!hit.hasHit)return undefined;
        const entity=(hit.body as CANNON.Body&{userData?:{entity?:RatEntity}}|null)?.userData?.entity;
        return{p:{x:hit.hitPointWorld.x,y:hit.hitPointWorld.y,z:hit.hitPointWorld.z},
            n:{x:hit.hitNormalWorld.x,y:hit.hitNormalWorld.y,z:hit.hitNormalWorld.z},rat:!!entity&&!entity.dead};
    };

    clearProjectiles(): void {
        while (this.balls.length) this.removeBall(this.balls.length - 1);
        this.impacts.clear();
    }

    update(dt: number): void {
        if (this.disposed || !Number.isFinite(dt) || dt < 0) return;
        const gravityStep = this.gravityStep.set(0, BALL_GRAVITY * dt, 0);

        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            ball.age += dt;
            ball.squash *= Math.exp(-20 * dt);
            ball.mesh.rotation.x += dt * 15;
            ball.mesh.rotation.y += dt * 9;
            ball.mesh.scale.setScalar(1 - ball.squash * 0.1);

            if (ball.age > BALL_LIFETIME) {
                this.removeBall(i);
                continue;
            }

            // ─── KINEMATIC PHYSICS UPDATE ───

            // 1. Apply Gravity
            ball.velocity.add(gravityStep);

            // 2. Calculate projected movement
            const moveStep = this.moveStep.copy(ball.velocity).multiplyScalar(dt);
            const moveDist = moveStep.length();

            if (moveDist < 0.0001) continue;

            const nextPos = this.nextPos.copy(ball.position).add(moveStep);

            // 3. Raycast for physics collision
            this.rayFrom.set(ball.position.x, ball.position.y, ball.position.z);
            this.rayTo.set(nextPos.x, nextPos.y, nextPos.z);
            // Cannon resets this result on every raycast, including misses.
            const result = this.rayResult;
            const hasHit = this.world.raycastClosest(this.rayFrom, this.rayTo, this.rayOptions, result);

            if (hasHit) {
                const hitBody = result.body;

                // ★ SKIP hits on the owner's own body (ball spawns inside player)
                if (hitBody && (hitBody as any).userData && (hitBody as any).userData.entity === ball.owner) {
                    // Pass through own body — just move normally
                    ball.position.copy(nextPos);
                } else {
                    const hitPoint = this.hitPoint.set(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
                    const hitNormal = this.hitNormal.set(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z);

                    // Move ball to hit point
                    ball.position.copy(hitPoint).addScaledVector(hitNormal, 0.05);

                    // Check if we hit a RatEntity (enemy)
                    if (hitBody && (hitBody as any).userData && (hitBody as any).userData.entity instanceof RatEntity) {
                        const victim = (hitBody as any).userData.entity as RatEntity;

                        if (ball.owner.isRemote) {
                            ball.position.copy(nextPos);
                            ball.mesh.position.copy(ball.position);
                            continue;
                        }

                        if (!victim.dead) {
                            // ── PRECISE HEADSHOT CHECK ──
                            const isHead = (result.shape === victim.headShape);
                            const dmg = isHead ? 3 : 1;

                            // Only apply local damage for LOCAL entities
                            // Remote entity damage is handled by the server
                            if (!victim.isRemote) {
                                victim.takeDamage(dmg, ball.velocity);
                            }
                            // Remote hit audio belongs to the confirmed health/death
                            // event, avoiding a second impact when the server replies.

                            // Notify network manager (for remote hits → server)
                            if (this.onHitEntity) {
                                this.onHitEntity(victim, dmg);
                            }

                            this.impacts.emit(hitPoint, hitNormal, false);

                            // Destroy ball on entity hit
                            this.removeBall(i);
                            continue;
                        }
                    }

                    this.impacts.emit(hitPoint, hitNormal, true);
                    ball.squash = 1;
                    ball.mesh.scale.setScalar(0.9);
                    // HIT WALL / GROUND → BOUNCE
                    const dot = ball.velocity.dot(hitNormal);
                    ball.velocity.addScaledVector(hitNormal, -2 * dot);
                    ball.velocity.multiplyScalar(BALL_RESTITUTION);
                }
            } else {
                // No hit — move full step
                ball.position.copy(nextPos);
            }

            // Sync Visuals
            ball.mesh.position.copy(ball.position);
        }
        this.impacts.update(dt);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearProjectiles();
        this.impacts.dispose();
        this.ballGeometry.dispose();
        this.ballMaterial.dispose();
        this.fireAudio.dispose();this.presentationRay?.dispose();this.presentationRay=undefined;
        this.onHitEntity = null;
        this.playerEntity = null;
        this.camera = null;
    }

    private createBall(origin: THREE.Vector3, direction: THREE.Vector3, owner: RatEntity): CheeseBall {
        // Visuals
        const mesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
        mesh.position.copy(origin);
        this.scene.add(mesh);

        // Kinematic state (no physics body — we raycast manually for reliability)
        const velocity = direction.clone().normalize().multiplyScalar(BALL_SPEED);

        const ball: CheeseBall = {
            mesh,
            velocity,
            position: origin.clone(),
            age: 0,
            squash: 0,
            owner
        };
        this.balls.push(ball);
        return ball;
    }

    private removeBall(index: number): void {
        if (index < 0 || index >= this.balls.length) return;
        const ball = this.balls[index];
        this.scene.remove(ball.mesh);
        this.balls.splice(index, 1);
    }
}
