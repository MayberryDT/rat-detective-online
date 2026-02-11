import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createRatMesh, RatOptions, HatType } from '../utils/RatModel';
import { RatBillboard } from '../ui/RatBillboard';

// ─── PHYSICS CONSTANTS ───
const HEAD_RADIUS = 0.28;
const HEAD_OFFSET_Y = 1.9;

// ─── GAMEPLAY CONSTANTS ───
const MAX_HP = 3;
const FLASH_DURATION = 0.15;
const DEATH_FORCE = 35;

// ─── RAGDOLL DEATH PHASES ───
const DEATH_PHASE_LAUNCH = 0.8;   // Violent launch duration (longer = more airtime)
const DEATH_PHASE_SPIN = 1.8;   // Airborne spin ends
const DEATH_PHASE_SETTLE = 2.5;   // Fully settled on ground

// ─── OUTLINE GLOW CONFIG ───
const GLOW_SCALE = 1.08;          // How much larger the outline is
const GLOW_OPACITY = 0.25;        // Outline transparency
const GLOW_COLOR = 0xffffff;      // Base glow tint (will blend with coat color)
const EMISSIVE_INTENSITY = 0.35;  // Subtle self-illumination on all rat materials

// ─── COLOR PALETTES ──────────────────────────────────────────────
// Bright and saturated — must stand out against the dark purple city

const HAT_COLORS = [
    0xDC4A3C, // Bright Red
    0x3498DB, // Sky Blue
    0x2ECC71, // Emerald
    0xA855F7, // Vivid Purple
    0xE67E22, // Tangerine
];

const FUR_COLORS = [
    0xE8B84D, // Rich Gold
    0xC8C8D0, // Bright Silver
    0xD4A06A, // Warm Honey
    0xCD6839, // Copper
    0xF0E0C0, // Light Cream
];

const COAT_COLORS = [
    0xBE4545, // Bright Burgundy
    0x3A5F95, // Rich Navy
    0x45945A, // Sage Green
    0xA08050, // Warm Tan
    0x7E4F99, // Rich Purple
];

const HAT_TYPES: HatType[] = ['fedora', 'trilby', 'porkpie'];

// ─── UNIQUE COMBINATION TRACKER ──────────────────────────────────
// 3 hats × 5 hat colors × 5 furs × 5 coats = 375 unique combos
const usedCombinations = new Set<string>();

function makeComboKey(hat: HatType, hatCol: number, fur: number, coat: number): string {
    return `${hat}-${hatCol}-${fur}-${coat}`;
}

// ─── SHARED AUDIO (loaded once, reused by all entities) ──────────
let audioListener: THREE.AudioListener | null = null;

const soundBuffers: {
    ratHit: AudioBuffer | null;
    ratDeath: AudioBuffer | null;
    playerHit: AudioBuffer | null;
} = { ratHit: null, ratDeath: null, playerHit: null };

let soundsLoaded = false;

export function initEntitySounds(listener: THREE.AudioListener): void {
    if (soundsLoaded) return;
    soundsLoaded = true;
    audioListener = listener;

    const loader = new THREE.AudioLoader();
    loader.load('/sounds/rathit.mp3', (buf) => { soundBuffers.ratHit = buf; });
    loader.load('/sounds/ratdeath.mp3', (buf) => { soundBuffers.ratDeath = buf; });
    loader.load('/sounds/playerhit.mp3', (buf) => { soundBuffers.playerHit = buf; });
}

function playOneShot(buffer: AudioBuffer | null, volume: number = 0.5): void {
    if (!buffer || !audioListener) return;
    const sound = new THREE.Audio(audioListener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.play();
    sound.onEnded = () => { sound.disconnect(); };
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
    private elapsed: number = 0;

    // Ragdoll / death state
    private deathTimer: number = 0;
    private deathTargetQuat: THREE.Quaternion | null = null;
    private ragdollSettled: boolean = false;
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
        this.scene.add(this.mesh);

        // Cache materials for hit flash + apply emissive glow
        this.mesh.traverse((c) => {
            if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial) {
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
            const hatType = HAT_TYPES[Math.floor(Math.random() * HAT_TYPES.length)];
            const hatColor = HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)];
            const furColor = FUR_COLORS[Math.floor(Math.random() * FUR_COLORS.length)];
            const coatColor = COAT_COLORS[Math.floor(Math.random() * COAT_COLORS.length)];

            const key = makeComboKey(hatType, hatColor, furColor, coatColor);
            if (!usedCombinations.has(key)) {
                usedCombinations.add(key);
                this.comboKeyStr = key;
                return { hatType, hatColor, furColor, coatColor };
            }
            attempts++;
        }

        // Fallback (shouldn't happen — 375 combos available, max ~7 entities)
        return {
            hatType: HAT_TYPES[0],
            hatColor: HAT_COLORS[0],
            furColor: FUR_COLORS[0],
            coatColor: COAT_COLORS[0]
        };
    }

    /**
     * Creates a glowing outline mesh — a slightly larger clone rendered
     * with BackSide + Additive blending to create a visible aura.
     */
    private createGlowOutline(opts: RatOptions): THREE.Group {
        const glowGroup = createRatMesh(opts);

        // Determine glow tint from coat color
        const coatColor = new THREE.Color(opts.coatColor ?? 0x5c4a3a);
        const tint = coatColor.clone().lerp(new THREE.Color(GLOW_COLOR), 0.5);

        glowGroup.traverse((c) => {
            if (c instanceof THREE.Mesh) {
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

        glowGroup.scale.setScalar(GLOW_SCALE);
        // Position will be synced each frame
        this.scene.add(glowGroup);
        return glowGroup;
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
        this.billboard.sprite.position.set(p.x, p.y + 2.2, p.z);

        // Sync glow outline position + rotation
        if (this.glowMesh) {
            this.glowMesh.position.copy(this.mesh.position);
            this.glowMesh.quaternion.copy(this.mesh.quaternion);
        }

        this.elapsed += dt;

        // Flash Logic
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) this.resetColor();
        }
    }

    /**
     * 3-phase dramatic ragdoll death:
     *   Phase 1 (LAUNCH):  0 – 0.6s — Violent launch backward + spin, low damping
     *   Phase 2 (SPIN):    0.6 – 1.2s — Airborne tumble, damping ramps up
     *   Phase 3 (SETTLE):  1.2 – 2.0s — Slam to ground, snap to laying-flat, "thunk"
     */
    private updateDeathRagdoll(dt: number) {
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
                playOneShot(soundBuffers.ratHit, 0.7);
            }

            if (settleProgress >= 1.0) {
                this.deathPhase = 'done';
                this.ragdollSettled = true;
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

    public takeDamage(amount: number, isHeadshot: boolean, impactVel: THREE.Vector3) {
        if (this.dead) return;

        this.hp -= amount;
        this.billboard.setHealth(this.hp);

        // Flash Red
        this.flashColor(0xff0000);

        // ── SOUND EFFECTS ──
        if (this.hp > 0) {
            if (this.isPlayer) {
                playOneShot(soundBuffers.playerHit, 0.6);
            } else {
                playOneShot(soundBuffers.ratHit, 0.5);
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
        console.log(`${this.name} died!`);
        this.dead = true;
        this.deathTimer = 0;
        this.ragdollSettled = false;
        this.impactPlayed = false;
        this.deathPhase = 'launch';
        this.resetColor();

        // ── DEATH SOUND ──
        playOneShot(soundBuffers.ratDeath, 0.6);
        if (this.isPlayer) {
            playOneShot(soundBuffers.playerHit, 0.6);
        } else {
            playOneShot(soundBuffers.ratHit, 0.4);
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
        this.body.fixedRotation = false;
        this.body.mass = 2;              // Lighter during ragdoll = more dramatic flight
        this.body.updateMassProperties();
        this.body.linearDamping = 0.02;  // Near-zero — let them FLY
        this.body.angularDamping = 0.02;

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

    public dispose() {
        // Release unique combination
        if (this.comboKeyStr) {
            usedCombinations.delete(this.comboKeyStr);
        }
        this.scene.remove(this.mesh);
        this.scene.remove(this.billboard.sprite);
        // Remove glow outline
        if (this.glowMesh) {
            this.glowMesh.traverse((c) => {
                if (c instanceof THREE.Mesh) {
                    c.geometry.dispose();
                    if (c.material instanceof THREE.Material) c.material.dispose();
                }
            });
            this.scene.remove(this.glowMesh);
            this.glowMesh = null;
        }
        this.world.removeBody(this.body);
    }
}
