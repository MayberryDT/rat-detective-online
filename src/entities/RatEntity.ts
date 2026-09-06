import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createRatMesh, RatOptions, HatType } from '../utils/RatModel';
import { MAX_HP, type Vec3Data, type PlayerData } from '../shared/networkProtocol';
import { DEFAULT_APPEARANCE, generateRandomAppearance } from '../shared/ratAppearance';
import { RatBillboard } from '../ui/RatBillboard';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { playEntitySound } from '../audio/EntityAudio';
export { initEntitySounds, disposeEntitySounds, playHitSound, playPlayerHitSound } from '../audio/EntityAudio';

// ─── PHYSICS CONSTANTS ───
const HEAD_RADIUS = 0.28;
const HEAD_OFFSET_Y = 1.9;

// ─── GAMEPLAY CONSTANTS ───
const FLASH_DURATION = 0.15;
const DEATH_FORCE = 35;

// ─── RAGDOLL DEATH PHASES ───
const DEATH_PHASE_LAUNCH = 0.8;   // Violent launch duration (longer = more airtime)
const DEATH_PHASE_SPIN = 1.8;   // Airborne spin ends
const DEATH_PHASE_SETTLE = 2.5;   // Fully settled on ground

// ─── OUTLINE GLOW CONFIG ───
const GLOW_THICKNESS = 0.025;    // Surface offset, without moving body-part centers
const GLOW_OPACITY = 0.25;        // Outline transparency
const GLOW_COLOR = 0xffffff;      // Base glow tint (will blend with coat color)
const EMISSIVE_INTENSITY = 0.35;  // Subtle self-illumination on all rat materials

// ─── UNIQUE COMBINATION TRACKER ──────────────────────────────────
// 3 hats × 5 hat colors × 5 furs × 5 coats = 375 unique combos
const usedCombinations = new Set<string>();

function makeComboKey(hat: HatType, hatCol: number, fur: number, coat: number): string {
    return `${hat}-${hatCol}-${fur}-${coat}`;
}

// ─── ENTITY CLASS ────────────────────────────────────────────────

export class RatEntity {
    public isRemote: boolean = false;
    public scene: THREE.Scene;
    public world: CANNON.World;

    // Physics
    public body: CANNON.Body;
    public headShape: CANNON.Shape;

    // Visuals
    public mesh: THREE.Group;
    public billboard: RatBillboard;
    private glowMesh: THREE.Group | null = null;
    private disposed = false;
    private allMaterials: THREE.MeshStandardMaterial[] = [];
    private originalColors: { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }[] = [];

    // State
    public hp: number = MAX_HP;
    public dead: boolean = false;
    public name: string;
    public isPlayer: boolean = false;

    // Combo tracking
    private comboKeyStr: string | null = null;

    // Timers
    private flashTimer: number = 0;

    // Ragdoll / death state
    private deathTimer: number = 0;
    private deathTargetQuat: THREE.Quaternion | null = null;
    private deathPosition: THREE.Vector3 | null = null;
    private impactPlayed: boolean = false;
    private deathPhase: 'launch' | 'spin' | 'settle' | 'done' = 'launch';

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        position: THREE.Vector3,
        name: string,
        options?: RatOptions,
        isRemote: boolean = false
    ) {
        this.scene = scene;
        this.world = world;
        this.name = name;
        this.isRemote = isRemote;

        // 1. GENERATE UNIQUE APPEARANCE
        const opts = options || this.generateRandomOptions();

        // 2. VISUALS
        this.mesh = createRatMesh(opts);
        this.mesh.position.copy(position);
        this.mesh.userData.aimTarget = true;
        this.scene.add(this.mesh);

        // Cache materials for hit flash + apply emissive glow
        this.mesh.traverse((c) => {
            if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial && !this.allMaterials.includes(c.material)) {
                // Add subtle emissive self-illumination so rats glow from distance
                c.material.emissive.copy(c.material.color).multiplyScalar(0.5);
                c.material.emissiveIntensity = EMISSIVE_INTENSITY;

                this.allMaterials.push(c.material);
                this.originalColors.push({
                    color: c.material.color.clone(),
                    emissive: c.material.emissive.clone(),
                    emissiveIntensity: c.material.emissiveIntensity
                });
            }
        });

        // ── OUTLINE GLOW MESH ──
        // Create a slightly larger, additive, backface-only clone for the glow halo
        this.glowMesh = this.createGlowOutline(opts);
        this.syncGlowTransform();

        // 3. UI
        this.billboard = new RatBillboard(name, this.hp);
        this.billboard.sprite.layers.set(1);
        this.scene.add(this.billboard.sprite);

        // 4. PHYSICS — Compound shape: Body + Chest + Head
        // Remote entities get kinematic bodies (mass=0, no gravity)
        this.body = new CANNON.Body({
            mass: isRemote ? 0 : 5,
            type: isRemote ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC,
            fixedRotation: true,
            linearDamping: isRemote ? 0 : 0.1,
            angularDamping: isRemote ? 0 : 1.0,
            position: new CANNON.Vec3(position.x, position.y, position.z)
        });

        const bodyShape = new CANNON.Sphere(0.6);
        this.body.addShape(bodyShape, new CANNON.Vec3(0, 0.6, 0));

        const chestShape = new CANNON.Sphere(0.45);
        this.body.addShape(chestShape, new CANNON.Vec3(0, 1.3, 0));

        this.headShape = new CANNON.Sphere(HEAD_RADIUS);
        this.body.addShape(this.headShape, new CANNON.Vec3(0, HEAD_OFFSET_Y, 0));

        (this.body as any).userData = { entity: this };
        this.world.addBody(this.body);
    }

    private generateRandomOptions(): RatOptions {
        let attempts = 0;
        while (attempts < 500) {
            const { hatType, hatColor, furColor, coatColor } = generateRandomAppearance();

            const key = makeComboKey(hatType, hatColor, furColor, coatColor);
            if (!usedCombinations.has(key)) {
                usedCombinations.add(key);
                this.comboKeyStr = key;
                return { hatType, hatColor, furColor, coatColor };
            }
            attempts++;
        }

        // Fallback (shouldn't happen — 375 combos available, max ~7 entities)
        return { ...DEFAULT_APPEARANCE };
    }

    /**
     * Creates a glowing outline mesh — a surface-expanded clone rendered
     * with BackSide + Additive blending to create a visible aura.
     */
    private createGlowOutline(opts: RatOptions): THREE.Group {
        const glowGroup = createRatMesh(opts);

        // Determine glow tint from coat color
        const coatColor = new THREE.Color(opts.coatColor ?? 0x5c4a3a);
        const tint = coatColor.clone().lerp(new THREE.Color(GLOW_COLOR), 0.5);

        // Expand along each vertex normal instead of scaling from the feet.
        // Eyes/ears can share geometry, so expand each geometry only once.
        const expandedGeometries = new Set<THREE.BufferGeometry>();
        const replacedMaterials = new Set<THREE.Material>();
        glowGroup.traverse((c) => {
            if (c instanceof THREE.Mesh) {
                if (!expandedGeometries.has(c.geometry)) {
                    expandedGeometries.add(c.geometry);
                    const positions = c.geometry.getAttribute('position');
                    const normals = c.geometry.getAttribute('normal');
                    for (let i = 0; i < positions.count; i++) {
                        positions.setXYZ(i,
                            positions.getX(i) + normals.getX(i) * GLOW_THICKNESS,
                            positions.getY(i) + normals.getY(i) * GLOW_THICKNESS,
                            positions.getZ(i) + normals.getZ(i) * GLOW_THICKNESS);
                    }
                    positions.needsUpdate = true;
                    c.geometry.computeBoundingSphere();
                }
                for (const material of Array.isArray(c.material) ? c.material : [c.material]) {
                    replacedMaterials.add(material);
                }
                c.material = new THREE.MeshBasicMaterial({
                    color: tint,
                    transparent: true,
                    opacity: GLOW_OPACITY,
                    side: THREE.BackSide,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                c.castShadow = false;
                c.receiveShadow = false;
            }
        });
        replacedMaterials.forEach(material => material.dispose());

        // Position will be synced each frame
        this.scene.add(glowGroup);
        return glowGroup;
    }

    public update(dt: number) {
        if (this.dead) {
            this.deathTimer += dt;
            this.updateDeathRagdoll();
            return;
        }

        // ── ALIVE ──
        const p = this.body.position;
        this.mesh.position.set(p.x, p.y, p.z);
        this.billboard.sprite.position.set(p.x, p.y + 2.2, p.z);

        this.syncGlowTransform();

        // Flash Logic
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) this.resetColor();
        }
    }

    /** Also called after the controller applies this frame's character rotation. */
    public syncGlowTransform(): void {
        if (this.glowMesh) {
            this.glowMesh.position.copy(this.mesh.position);
            this.glowMesh.quaternion.copy(this.mesh.quaternion);
        }
    }

    /**
     * 3-phase dramatic ragdoll death:
     *   Phase 1 (LAUNCH):  0 – 0.6s — Violent launch backward + spin, low damping
     *   Phase 2 (SPIN):    0.6 – 1.2s — Airborne tumble, damping ramps up
     *   Phase 3 (SETTLE):  1.2 – 2.0s — Slam to ground, snap to laying-flat, "thunk"
     */
    private updateDeathRagdoll() {
        const t = this.deathTimer;

        if (this.deathPhase === 'launch') {
            // ── PHASE 1: LAUNCH (0 – 0.6s) ──
            // Keep physics very active — low damping, body flies
            const p = this.body.position;
            this.mesh.position.set(p.x, p.y, p.z);
            this.mesh.quaternion.copy(this.body.quaternion);

            this.body.linearDamping = 0.05;
            this.body.angularDamping = 0.05;

            if (t >= DEATH_PHASE_LAUNCH) {
                this.deathPhase = 'spin';
            }
        }
        else if (this.deathPhase === 'spin') {
            // ── PHASE 2: AIRBORNE SPIN (0.6 – 1.2s) ──
            // Body tumbles in air, damping ramps up to slow rotation
            const p = this.body.position;
            this.mesh.position.set(p.x, p.y, p.z);
            this.mesh.quaternion.copy(this.body.quaternion);

            const spinProgress = (t - DEATH_PHASE_LAUNCH) / (DEATH_PHASE_SPIN - DEATH_PHASE_LAUNCH);
            this.body.linearDamping = THREE.MathUtils.lerp(0.1, 0.7, spinProgress);
            this.body.angularDamping = THREE.MathUtils.lerp(0.1, 0.8, spinProgress);

            if (t >= DEATH_PHASE_SPIN) {
                this.deathPhase = 'settle';
                // Freeze physics — we take over positioning
                this.body.velocity.set(0, 0, 0);
                this.body.angularVelocity.set(0, 0, 0);
                this.body.linearDamping = 0.99;
                this.body.angularDamping = 0.99;
                this.body.sleep();
                this.deathPosition = this.mesh.position.clone();
            }
        }
        else if (this.deathPhase === 'settle') {
            // ── PHASE 3: SETTLE TO GROUND (1.2 – 2.0s) ──
            // Slam down, snap rotation to flat, play thunk
            const settleProgress = Math.min((t - DEATH_PHASE_SPIN) / (DEATH_PHASE_SETTLE - DEATH_PHASE_SPIN), 1.0);

            // Ease-out slam to ground
            const eased = 1 - Math.pow(1 - settleProgress, 3);

            // Y position: slam to flat on ground (0.3 = laying on side height)
            if (this.deathPosition) {
                this.mesh.position.y = THREE.MathUtils.lerp(this.deathPosition.y, 0.3, eased);
            }

            // Snap rotation to laying-down pose
            if (this.deathTargetQuat) {
                this.mesh.quaternion.slerp(this.deathTargetQuat, eased * 0.3 + 0.05);
            }

            // Play impact thunk at start of settle phase (once)
            if (!this.impactPlayed) {
                this.impactPlayed = true;
                playEntitySound('ratHit', 0.7);
            }

            if (settleProgress >= 1.0) {
                this.deathPhase = 'done';
                // Force final flat pose
                if (this.deathTargetQuat) {
                    this.mesh.quaternion.copy(this.deathTargetQuat);
                }
                this.mesh.position.y = 0.3;
            }
        }

        // Sync glow outline to ragdoll position (fade out during death)
        if (this.glowMesh) {
            this.glowMesh.position.copy(this.mesh.position);
            this.glowMesh.quaternion.copy(this.mesh.quaternion);
            // Fade out glow as they die
            const fadeOut = Math.max(0, 1 - t / DEATH_PHASE_SETTLE);
            this.glowMesh.traverse((c) => {
                if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
                    c.material.opacity = GLOW_OPACITY * fadeOut;
                }
            });
        }

        // Billboard stays above during death
        this.billboard.sprite.position.set(
            this.mesh.position.x,
            this.mesh.position.y + 1.5,
            this.mesh.position.z
        );
    }

    public takeDamage(amount: number, impactVel: THREE.Vector3) {
        if (this.dead) return;

        this.hp -= amount;
        this.billboard.setHealth(this.hp);

        // Flash Red
        this.flashColor(0xff0000);

        // ── SOUND EFFECTS ──
        if (this.hp > 0) {
            if (this.isPlayer) {
                playEntitySound('playerHit', 0.6);
            } else {
                playEntitySound('ratHit', 0.5);
            }
        }

        if (this.hp <= 0) {
            this.die(impactVel);
        }
    }

    public flashColor(color: number) {
        this.flashTimer = FLASH_DURATION;
        this.allMaterials.forEach(m => {
            m.color.setHex(color);
            m.emissive.setHex(color);
            m.emissiveIntensity = 2.0;
        });
    }

    private resetColor() {
        this.allMaterials.forEach((m, i) => {
            const orig = this.originalColors[i];
            m.color.copy(orig.color);
            m.emissive.copy(orig.emissive);
            m.emissiveIntensity = orig.emissiveIntensity;
        });
    }

    private die(impactVel: THREE.Vector3) {
        if (this.dead) return;
        this.dead = true;
        this.deathTimer = 0;
        this.impactPlayed = false;
        this.deathPhase = 'launch';
        this.resetColor();

        // ── DEATH SOUND ──
        playEntitySound('ratDeath', 0.6);
        if (this.isPlayer) {
            playEntitySound('playerHit', 0.6);
        } else {
            playEntitySound('ratHit', 0.4);
        }

        // ── COMPUTE "LAYING DOWN" TARGET QUATERNION ──
        // They fall in the direction they were pushed (away from bullet)
        const impDir = new THREE.Vector3(impactVel.x, 0, impactVel.z);
        if (impDir.lengthSq() < 0.01) {
            impDir.set(0, 0, 1); // fallback: fall backward
        }
        impDir.normalize();

        // Rotation axis perpendicular to impact = topple axis
        const upVec = new THREE.Vector3(0, 1, 0);
        const fallAxis = new THREE.Vector3().crossVectors(upVec, impDir).normalize();
        this.deathTargetQuat = new THREE.Quaternion().setFromAxisAngle(fallAxis, Math.PI / 2);

        // ── RAGDOLL PHYSICS — DRAMATIC LAUNCH ──
        if (this.isRemote) {
            this.body.type = CANNON.Body.DYNAMIC;
        }
        this.body.fixedRotation = false;
        this.body.mass = 2;              // Lighter during ragdoll = more dramatic flight
        this.body.updateMassProperties();
        this.body.linearDamping = 0.02;  // Near-zero — let them FLY
        this.body.angularDamping = 0.02;
        this.body.wakeUp();

        // MASSIVE death blow: launch UP + backward for dramatic hang time
        const impulse = new CANNON.Vec3(
            impDir.x * DEATH_FORCE,
            80,                           // HUGE upward pop — they need to FLY
            impDir.z * DEATH_FORCE
        );
        this.body.applyImpulse(impulse, new CANNON.Vec3(0, 1.0, 0));

        // Aggressive spin — multiple rotations in the air
        this.body.angularVelocity.set(
            fallAxis.x * 12 + (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 6,     // Random yaw spin
            fallAxis.z * 12 + (Math.random() - 0.5) * 4
        );

        // Remove UI billboard
        this.scene.remove(this.billboard.sprite);
    }

    private resetAlivePresentation(): void {
        this.flashTimer = 0;
        this.deathTimer = 0;
        this.deathTargetQuat = null;
        this.deathPosition = null;
        this.impactPlayed = false;
        this.deathPhase = 'launch';
        this.resetColor();
        this.glowMesh?.traverse(child => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                child.material.opacity = GLOW_OPACITY;
            }
        });
    }

    /** Apply authoritative state without replaying historical hit/death sounds or impulses. */
    public applySnapshot(data: PlayerData): void {
        if (this.disposed) return;
        if (data.hp > 0 && this.dead) this.respawn(data);
        this.hp = data.hp;
        this.dead = data.hp <= 0;
        this.body.position.set(data.x, data.y, data.z);
        this.body.quaternion.set(data.qx, data.qy, data.qz, data.qw);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.aabbNeedsUpdate = true;
        this.mesh.position.set(data.x, data.y, data.z);
        this.mesh.quaternion.set(data.meshQx, data.meshQy, data.meshQz, data.meshQw);
        this.billboard.setHealth(data.hp);
        if (this.dead) {
            // A snapshot depicts an existing corpse, not a new death event.
            this.deathTimer = DEATH_PHASE_SETTLE;
            this.deathPhase = 'done';
            this.body.sleep();
            this.mesh.position.y = 0.3;
            this.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            this.body.position.set(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);
            this.body.quaternion.set(this.mesh.quaternion.x, this.mesh.quaternion.y, this.mesh.quaternion.z, this.mesh.quaternion.w);
            this.body.type = CANNON.Body.DYNAMIC;
            this.body.mass = 2;
            this.body.fixedRotation = false;
            this.body.updateMassProperties();
            this.body.sleep();
            this.billboard.sprite.removeFromParent();
            this.updateDeathRagdoll();
        } else {
            this.resetAlivePresentation();
            this.mesh.visible = true;
            this.scene.add(this.billboard.sprite);
            this.billboard.sprite.visible = true;
            this.billboard.sprite.position.set(data.x, data.y + 2.2, data.z);
            this.syncGlowTransform();
        }
    }

    /** Restore the existing local/remote alive-body settings after a server respawn. */
    public respawn(data: Vec3Data & { hp: number }): void {
        this.dead = false;
        this.resetAlivePresentation();
        this.hp = data.hp;
        this.billboard.setHealth(data.hp);
        this.mesh.visible = true;
        this.billboard.sprite.visible = true;
        this.scene.add(this.billboard.sprite);

        const body = this.body;
        body.mass = this.isRemote ? 0 : 5;
        body.type = this.isRemote ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
        body.fixedRotation = true;
        // Respawn damping intentionally differs from constructor damping.
        body.linearDamping = this.isRemote ? 0 : 0.01;
        body.angularDamping = this.isRemote ? 0 : 0.01;
        body.updateMassProperties();
        body.position.set(data.x, data.y, data.z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.quaternion.set(0, 0, 0, 1);
        body.wakeUp();
        this.mesh.position.set(data.x, data.y, data.z);
        this.mesh.quaternion.set(0, 0, 0, 1);
        this.billboard.sprite.position.set(data.x, data.y + 2.2, data.z);
        this.body.aabbNeedsUpdate = true;
        this.syncGlowTransform();
    }

    public dispose() {
        if (this.disposed) return;
        this.disposed = true;
        // Release unique combination
        if (this.comboKeyStr) {
            usedCombinations.delete(this.comboKeyStr);
        }
        this.scene.remove(this.mesh);
        disposeMeshResources(this.mesh);
        this.billboard.dispose();
        // Remove glow outline
        if (this.glowMesh) {
            disposeMeshResources(this.glowMesh);
            this.scene.remove(this.glowMesh);
            this.glowMesh = null;
        }
        this.world.removeBody(this.body);
        this.allMaterials.length = 0;
        this.originalColors.length = 0;
    }
}
