import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createRatMesh, RatOptions, HatType } from '../utils/RatModel';
import {batchRigidMeshes} from '../utils/RigidMeshBatch';
import { RatAnimator } from '../utils/RatAnimator';
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
const FLASH_DURATION = 0.24;
const DEATH_FORCE = 46;

const DEATH_GLOW_FADE = 2.5;

// ─── OUTLINE GLOW CONFIG ───
const GLOW_THICKNESS = 0.012;    // Surface offset, without moving body-part centers
const GLOW_OPACITY = 0.10;        // Outline transparency
const GLOW_COLOR = 0xffffff;      // Base glow tint (will blend with coat color)
const EMISSIVE_INTENSITY = 0.12;  // Subtle self-illumination on all rat materials

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
    private readonly animator: RatAnimator;
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
    private deathPhase: 'launch' | 'settle' | 'done' = 'launch';
    private deathContactTime = -10;
    private deathImpact = 0;
    private deathContacts = 0;
    private restTime = 0;
    private sharedDeath = false;
    private ragdollCenter = 0;
    private readonly centerOffset = new THREE.Vector3();
    private readonly hitColor = new THREE.Color(0xffa16b);
    private readonly hitHighlight = new THREE.Color(0xffe8b0);
    private readonly onRagdollContact = (event: { contact: CANNON.ContactEquation }) => {
        if (!this.dead || this.deathPhase === 'done' || this.deathTimer < 0.16) return;
        const contact = event.contact;
        const speed = Math.abs(contact.getImpactVelocityAlongNormal());
        // Let the solver produce real rebounds; later contacts lose more energy.
        contact.restitution = this.deathContacts === 0 ? 0.48 : 0.22;
        if (speed < 1.5 || this.deathTimer - this.deathContactTime < 0.12) return;
        this.deathContactTime = this.deathTimer;
        this.deathContacts++;
        this.deathImpact = Math.min(speed / 12, 1);
        playEntitySound('ratHit', Math.min(0.25 + speed * 0.025, 0.65), this.isPlayer ? undefined : this.body.position);
    };

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
        this.animator = new RatAnimator(this.mesh, this.glowMesh);
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
        this.body.addEventListener('collide', this.onRagdollContact);
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
        // Every shell part has the same tint and lifetime. Share one owned
        // material per rat so a crowd does not switch identical GPU state.
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: tint, transparent: true, opacity: GLOW_OPACITY,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
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
                c.material = glowMaterial;
                c.castShadow = false;
                c.receiveShadow = false;
                if (c.userData.noOutline) c.visible = false;
            }
        });
        replacedMaterials.forEach(material => material.dispose());

        // Position will be synced each frame
        this.scene.add(glowGroup);
        return glowGroup;
    }

    public playShootAnimation(target?: THREE.Vector3): void {
        if (!this.dead && !this.disposed) {
            this.syncGlowTransform();
            this.animator.shoot(target);
        }
    }

    public getMuzzlePosition(): THREE.Vector3 {
        return this.mesh.getObjectByName('rat-muzzle')!.getWorldPosition(new THREE.Vector3());
    }

    public update(dt: number) {
        if (this.dead) {
            this.deathTimer += dt;
            this.updateDeathRagdoll(dt);
            return;
        }

        // ── ALIVE ──
        const p = this.body.position;
        this.mesh.position.set(p.x, p.y, p.z);
        this.presentAlive(dt);
    }

    /** Preserve the procedural rig and picking while batching its rigid leaves. */
    public enableRigidBatching():void {
        if(this.mesh.getObjectByName('rat-rigid-batch'))return;
        batchRigidMeshes(this.mesh);
        if(this.glowMesh)batchRigidMeshes(this.glowMesh);
    }

    public resetMotionHistory(): void { this.animator.resetMotionHistory(); }

    /** Animate the current render root; remote presentation need not read physics. */
    public presentAlive(dt: number): void {
        if (this.dead) return;
        const p = this.mesh.position;
        this.billboard.sprite.position.set(p.x, p.y + 2.2, p.z);
        this.syncGlowTransform();
        this.animator.update(dt);

        // Flash Logic
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) this.resetColor();
            else this.applyHitColor();
        }
    }

    /** Also called after the controller applies this frame's character rotation. */
    public syncGlowTransform(): void {
        if (this.glowMesh) {
            this.glowMesh.position.copy(this.mesh.position);
            this.glowMesh.quaternion.copy(this.mesh.quaternion);
        }
    }

    /** Physics owns the entire fall, including rebounds and the resting orientation. */
    private updateDeathRagdoll(dt = 0) {
        if(this.sharedDeath)return;
        const t = this.deathTimer;
        if (this.deathPhase !== 'done') {
            const supported = this.world.contacts.some(contact =>
                (contact.bi === this.body || contact.bj === this.body) && Math.abs(contact.ni.y) > 0.35);
            this.body.linearDamping = supported && t > 0.2 ? 0.75 : 0.08;
            this.body.angularDamping = supported && t > 0.2 ? 0.82 : 0.06;
            if (this.deathContacts > 0) this.deathPhase = 'settle';
            const quiet = supported && this.body.velocity.length() < 0.35 && this.body.angularVelocity.length() < 0.45;
            this.restTime = quiet ? this.restTime + dt : 0;
            if (this.restTime > 0.4) {
                this.deathPhase = 'done';
                this.body.velocity.set(0, 0, 0);
                this.body.angularVelocity.set(0, 0, 0);
                this.body.sleep();
            }
        }
        this.mesh.quaternion.copy(this.body.quaternion);
        this.centerOffset.set(0, this.ragdollCenter, 0).applyQuaternion(this.mesh.quaternion);
        this.mesh.position.copy(this.body.position).sub(this.centerOffset);
        this.animator.poseDeath(t, dt, this.body.angularVelocity, this.deathImpact,
            this.deathPhase === 'done');
        this.deathImpact = 0;

        // Sync glow outline to ragdoll position (fade out during death)
        if (this.glowMesh) {
            this.glowMesh.position.copy(this.mesh.position);
            this.glowMesh.quaternion.copy(this.mesh.quaternion);
            // Fade out glow as they die
            const fadeOut = Math.max(0, 1 - t / DEATH_GLOW_FADE);
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

    /** The incident corpse is a separate shared object; this player waits for respawn. */
    public useSharedCorpse():void {
        if(this.sharedDeath)return;
        this.sharedDeath=true;this.dead=true;this.hp=0;
        this.mesh.visible=false;if(this.glowMesh)this.glowMesh.visible=false;
        this.billboard.sprite.removeFromParent();
        this.body.velocity.setZero();this.body.angularVelocity.setZero();
        this.body.collisionFilterMask=0;this.body.sleep();
        playEntitySound('ratDeath',.6, this.isPlayer ? undefined : this.body.position);
    }

    public takeDamage(amount: number, impactVel: THREE.Vector3) {
        if (this.dead) return;

        this.hp -= amount;
        this.billboard.setHealth(this.hp);

        // Flash Red
        this.flashColor(0xffa16b);

        // ── SOUND EFFECTS ──
        if (this.hp > 0) {
            this.animator.takeHit();
            if (this.isPlayer) {
                playEntitySound('playerHit', 0.6);
            } else {
                playEntitySound('ratHit', 0.5, this.body.position);
            }
        }

        if (this.hp <= 0) {
            this.die(impactVel);
        }
    }

    public flashColor(color: number) {
        this.hitColor.setHex(color);
        this.flashTimer = FLASH_DURATION;
        this.applyHitColor();
    }

    private applyHitColor(): void {
        const age = FLASH_DURATION - this.flashTimer;
        const fade = Math.pow(Math.max(0, this.flashTimer / FLASH_DURATION), 1.5);
        const highlight = Math.exp(-age * 65) * 0.45;
        this.allMaterials.forEach((material, i) => {
            const original = this.originalColors[i];
            // Keep dark facial details readable instead of turning the rat into neon.
            const dark = Math.max(original.color.r, original.color.g, original.color.b) < 0.08;
            const strength = dark ? 0.08 : 1;
            material.color.copy(original.color).lerp(this.hitColor, fade * 0.38 * strength)
                .lerp(this.hitHighlight, highlight * strength);
            material.emissive.copy(original.emissive).lerp(this.hitColor, fade * 0.25 * strength);
            material.emissiveIntensity = original.emissiveIntensity + fade * 0.22 * strength;
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
        this.animator.reset();
        this.deathTimer = 0;
        this.deathContactTime = -10;
        this.deathImpact = this.deathContacts = this.restTime = 0;
        this.deathPhase = 'launch';
        this.resetColor();

        // ── DEATH SOUND ──
        playEntitySound('ratDeath', 0.6, this.isPlayer ? undefined : this.body.position);
        if (this.isPlayer) {
            playEntitySound('playerHit', 0.6);
        } else {
            playEntitySound('ratHit', 0.4, this.body.position);
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


        // Move the physics origin into the torso for the tumble. The living
        // controller uses a feet origin, which otherwise makes a dead rat a
        // bottom-weighted toy that rights itself after every fall.
        this.body.quaternion.set(this.mesh.quaternion.x, this.mesh.quaternion.y, this.mesh.quaternion.z, this.mesh.quaternion.w);
        this.ragdollCenter = 0.95;
        for (const offset of this.body.shapeOffsets) offset.y -= this.ragdollCenter;
        this.centerOffset.set(0, this.ragdollCenter, 0).applyQuaternion(this.mesh.quaternion);
        this.body.position.x += this.centerOffset.x;
        this.body.position.y += this.centerOffset.y;
        this.body.position.z += this.centerOffset.z;
        this.body.updateBoundingRadius();
        this.body.aabbNeedsUpdate = true;

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
            60 + Math.random() * 8,         // Huge airborne arc; physics still owns the landing
            impDir.z * DEATH_FORCE
        );
        this.body.applyImpulse(impulse, new CANNON.Vec3(0, 1.0, 0));

        // Aggressive spin — multiple rotations in the air
        this.body.angularVelocity.set(
            fallAxis.x * 16 + (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,     // Off-axis twist keeps each tumble different
            fallAxis.z * 16 + (Math.random() - 0.5) * 5
        );

        // Remove UI billboard
        this.scene.remove(this.billboard.sprite);
    }

    private restoreBodyOrigin(): void {
        if (!this.ragdollCenter) return;
        for (const offset of this.body.shapeOffsets) offset.y += this.ragdollCenter;
        this.ragdollCenter = 0;
        this.body.updateBoundingRadius();
        this.body.updateMassProperties();
        this.body.aabbNeedsUpdate = true;
    }

    private resetAlivePresentation(): void {
        this.restoreBodyOrigin();
        this.animator.reset();
        this.flashTimer = 0;
        this.deathTimer = 0;

        this.deathContactTime = -10;
        this.deathImpact = this.deathContacts = this.restTime = 0;
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
        this.restoreBodyOrigin();
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
            this.deathTimer = DEATH_GLOW_FADE;
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
        this.sharedDeath=false;this.body.collisionFilterMask=-1;if(this.glowMesh)this.glowMesh.visible=true;
        this.resetAlivePresentation();
        this.animator.playRespawn();
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
        this.body.removeEventListener('collide', this.onRagdollContact);
        this.world.removeBody(this.body);
        this.allMaterials.length = 0;
        this.originalColors.length = 0;
    }
}
