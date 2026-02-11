import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RatEntity } from '../entities/RatEntity';

// ─── CHEESE BALL TUNING ────────────────────────────────────────────
const BALL_RADIUS = 0.15;
const BALL_SPEED = 175;       // Fast and chaotic!
const BALL_RESTITUTION = 0.9; // Bouncy
const BALL_GRAVITY = -25;     // Matches world gravity
const BALL_LIFETIME = 5;
const BALL_COLOR = 0xffaa00;  // Neon Orange

// Collision Groups
const GROUP_DEFAULT = 1;
const GROUP_PROJECTILE = 4;

interface CheeseBall {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    position: THREE.Vector3;
    age: number;
    toRemove: boolean;
    owner: RatEntity;
}

export class CheeseGun {
    private scene: THREE.Scene;
    private world: CANNON.World;
    private camera: THREE.PerspectiveCamera | null = null;
    private playerEntity: RatEntity | null = null;

    private balls: CheeseBall[] = [];

    // Network callback: fires when a local projectile hits an entity
    public onHitEntity: ((victim: RatEntity, damage: number) => void) | null = null;

    private listener: THREE.AudioListener;
    private gunshotSound: THREE.Audio;

    constructor(scene: THREE.Scene, world: CANNON.World, listener: THREE.AudioListener) {
        this.scene = scene;
        this.world = world;
        this.listener = listener;

        // Audio
        this.gunshotSound = new THREE.Audio(this.listener);
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('/sounds/gunshot.mp3', (buffer) => {
            this.gunshotSound.setBuffer(buffer);
            this.gunshotSound.setVolume(0.4);
        });
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
    shoot(owner: RatEntity, targetPoint: THREE.Vector3): void {
        this.playFireSound();

        let finalTarget: THREE.Vector3;

        // ── PLAYER AIM: Camera Raycasting for Convergence ──
        if (this.camera && this.playerEntity && owner === this.playerEntity) {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

            const intersects = raycaster.intersectObjects(this.scene.children, true);
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
        const origin = owner.mesh.position.clone();
        origin.y += 1.45; // Gun / neck height

        // ── Direction (no gravity compensation — consistent power at all distances) ──
        const finalDir = new THREE.Vector3().subVectors(finalTarget, origin).normalize();

        // Nudge origin forward to avoid self-hit
        origin.addScaledVector(finalDir, 0.6);

        this.createBall(origin, finalDir, owner);
    }

    update(dt: number): void {
        const gravityStep = new THREE.Vector3(0, BALL_GRAVITY * dt, 0);

        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            ball.age += dt;

            if (ball.age > BALL_LIFETIME) {
                ball.toRemove = true;
            }

            if (ball.toRemove) {
                this.removeBall(i);
                continue;
            }

            // ─── KINEMATIC PHYSICS UPDATE ───

            // 1. Apply Gravity
            ball.velocity.add(gravityStep);

            // 2. Calculate projected movement
            const moveStep = ball.velocity.clone().multiplyScalar(dt);
            const moveDist = moveStep.length();

            if (moveDist < 0.0001) continue;

            const nextPos = ball.position.clone().add(moveStep);

            // 3. Raycast for physics collision
            const from = new CANNON.Vec3(ball.position.x, ball.position.y, ball.position.z);
            const to = new CANNON.Vec3(nextPos.x, nextPos.y, nextPos.z);

            const rayOptions: CANNON.RayOptions = {
                collisionFilterGroup: GROUP_PROJECTILE,
                collisionFilterMask: GROUP_DEFAULT,
                skipBackfaces: true
            };

            const result = new CANNON.RaycastResult();
            const hasHit = this.world.raycastClosest(from, to, rayOptions, result);

            if (hasHit) {
                const hitBody = result.body;

                // ★ SKIP hits on the owner's own body (ball spawns inside player)
                if (hitBody && (hitBody as any).userData && (hitBody as any).userData.entity === ball.owner) {
                    // Pass through own body — just move normally
                    ball.position.copy(nextPos);
                } else {
                    const hitPoint = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
                    const hitNormal = new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z);

                    // Move ball to hit point
                    ball.position.copy(hitPoint).addScaledVector(hitNormal, 0.05);

                    // Check if we hit a RatEntity (enemy)
                    if (hitBody && (hitBody as any).userData && (hitBody as any).userData.entity instanceof RatEntity) {
                        const victim = (hitBody as any).userData.entity as RatEntity;
                        if (!victim.dead) {
                            // ── PRECISE HEADSHOT CHECK ──
                            const isHead = (result.shape === victim.headShape);
                            const dmg = isHead ? 3 : 1;

                            // Only apply local damage for LOCAL entities
                            // Remote entity damage is handled by the server
                            if (!victim.isRemote) {
                                victim.takeDamage(dmg, isHead, ball.velocity);
                            }

                            // Notify network manager (for remote hits → server)
                            if (this.onHitEntity) {
                                this.onHitEntity(victim, dmg);
                            }

                            // Destroy ball on entity hit
                            this.removeBall(i);
                            continue;
                        }
                    }

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
    }

    private playFireSound(): void {
        if (this.gunshotSound.buffer) {
            if (this.gunshotSound.isPlaying) this.gunshotSound.stop();
            this.gunshotSound.play();
        }
    }

    private createBall(origin: THREE.Vector3, direction: THREE.Vector3, owner: RatEntity): void {
        // Visuals
        const geo = new THREE.SphereGeometry(BALL_RADIUS, 8, 8);
        const mat = new THREE.MeshStandardMaterial({
            color: BALL_COLOR,
            roughness: 0,
            emissive: BALL_COLOR,
            emissiveIntensity: 3
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(origin);
        this.scene.add(mesh);

        // Kinematic state (no physics body — we raycast manually for reliability)
        const velocity = direction.clone().normalize().multiplyScalar(BALL_SPEED);

        this.balls.push({
            mesh,
            velocity,
            position: origin.clone(),
            age: 0,
            toRemove: false,
            owner
        });
    }

    private removeBall(index: number): void {
        if (index < 0 || index >= this.balls.length) return;
        const ball = this.balls[index];
        this.scene.remove(ball.mesh);
        ball.mesh.geometry.dispose();
        (ball.mesh.material as THREE.Material).dispose();
        this.balls.splice(index, 1);
    }
}
