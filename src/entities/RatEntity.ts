import {metalReflection} from '../utils/metalReflection';
import {RatPowerupEffects} from './RatPowerupEffects';
import {RatStreakSmoke} from './RatStreakSmoke';
import {emitWorldSound} from '../audio/WorldSoundEvents';
import * as THREE from 'three';
import {RatStains} from './RatStains';
import {FlyingHat} from './FlyingHat';
import {kickDust} from '../feel/Dust';
import type {DeathStyle} from '../utils/RatAnimator';
import {FEEL} from '../feel/feelTuning';
import {feelState} from '../feel/feelState';
import * as CANNON from 'cannon-es';
import { createRatMesh, ratAccessory, RatOptions } from '../utils/RatModel';
import {batchRigidMeshes} from '../utils/RigidMeshBatch';
import type {RatReaction} from '../utils/RatActing';
import { RatAnimator } from '../utils/RatAnimator';
import { setRagdollWorld } from '../utils/RatCorpseChain';
import { MAX_HP, type Vec3Data, type PlayerData } from '../shared/networkProtocol';
import { DEFAULT_APPEARANCE, generateRandomAppearance } from '../shared/ratAppearance';
import { RatBillboard, streakTier } from '../ui/RatBillboard';
import { disposeMeshResources } from '../utils/disposeMeshResources';
import { playEntitySound } from '../audio/EntityAudio';
import { contactShadowsOf } from '../session/shadows';
import { RAT_BODY, addRatShapes } from '../shared/rat/ratBody';
export { initEntitySounds, disposeEntitySounds, playHitSound, playPlayerHitSound } from '../audio/EntityAudio';

// ─── GAMEPLAY CONSTANTS ───
const FLASH_DURATION = 0.24;
const DEATH_FORCE = 46;

const DEATH_GLOW_FADE = 2.5;

// ─── OUTLINE GLOW CONFIG ───
const GLOW_THICKNESS = 0.025;    // Surface offset, without moving body-part centers
/** Opponent outline: a faint moonlit edge that only appears with distance.
 * Close rats have none; from `OUTLINE_NEAR` it fades in, reaching
 * `OUTLINE_PIXELS` wide on screen and full opacity at `OUTLINE_FAR`. */
const GLOW_OPACITY = 0.5;
const OUTLINE_COLOR = 0xaebfd6;
const OUTLINE_PIXELS = 1.5;
const OUTLINE_NEAR = 16, OUTLINE_FAR = 45;
const EMISSIVE_INTENSITY = 0.28;  // Rat-only lift; lamps still model the hat and coat
/** The Hunch: occluded parts of a rat drawn as a pale boiling pencil sketch.
 * One time uniform shared by every rat; materials stay per rat for disposal. */
const HUNCH_TIME={value:0};
/** World units a hidden part must sit behind scenery before it sketches, so a
 * rat's own far arm never hatches across its visible body. */
const HUNCH_DEPTH_BIAS=1.2;
export const advanceHunchSketch=(dt:number):void=>{HUNCH_TIME.value=(HUNCH_TIME.value+dt)%1000;};
function hunchSketchMaterial():{material:THREE.MeshBasicMaterial;strength:{value:number}} {
    const strength={value:.6};
    const material=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,depthFunc:THREE.GreaterDepth,fog:false,toneMapped:false});
    material.onBeforeCompile=shader=>{
        shader.uniforms.hunchTime=HUNCH_TIME;shader.uniforms.hunchStrength=strength;
        shader.vertexShader='varying vec3 vHunchView;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
            vHunchView=mvPosition.xyz;
            vec4 hunchBiased=projectionMatrix*vec4(mvPosition.xy,mvPosition.z+${HUNCH_DEPTH_BIAS.toFixed(2)},1.);
            gl_Position.z=hunchBiased.z/hunchBiased.w*gl_Position.w;`);
        shader.fragmentShader='uniform float hunchTime;\nuniform float hunchStrength;\nvarying vec3 vHunchView;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
            // Two hatch directions, re-drawn eight times a second like a boiling pencil line.
            float hunchStep=floor(hunchTime*8.);
            vec2 hunchP=gl_FragCoord.xy+vec2(fract(sin(hunchStep*12.9898)*43758.5)*9.,fract(sin(hunchStep*78.233)*43758.5)*9.);
            float hunchA=abs(fract((hunchP.x+hunchP.y)/5.)-.5),hunchB=abs(fract((hunchP.x-hunchP.y*1.3)/8.)-.5);
            float hunchLine=max(smoothstep(.2,.04,hunchA),smoothstep(.12,.0,hunchB)*.6);
            // A heavier contour where the surface turns away, so the hatching reads as a rat.
            vec3 hunchN=normalize(cross(dFdx(vHunchView),dFdy(vHunchView)));
            hunchLine=max(hunchLine,smoothstep(.6,.9,1.-abs(dot(hunchN,normalize(-vHunchView)))));
            gl_FragColor=vec4(vec3(.84,.8,.72),hunchLine*hunchStrength);`);
    };
    material.customProgramCacheKey=()=> 'rat-hunch-sketch-v1';
    return {material,strength};
}

// ─── UNIQUE COMBINATION TRACKER ──────────────────────────────────
// Local fixture allocation; network appearances are assigned when joining.
const usedCombinations = new Set<string>();

function makeComboKey(options: RatOptions): string {
    return `${options.hatColor}-${options.coatColor}-${options.highlightColor}-${options.furColor}`;
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
    private originalColors: { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; metalness:number; roughness:number; envMap:THREE.Texture|null; envMapIntensity:number }[] = [];
    private readonly powerupEffects:RatPowerupEffects;
    private readonly streakSmoke:RatStreakSmoke;
    /** Kills since this rat's last death (authoritative, from snapshots and kill events). */
    private streak=0;
    private ironcladRemaining=0;
    private metalApplication=0;
    private hustleRemaining=0;
    private glowMaterials:THREE.MeshBasicMaterial[]=[];
    /** Extra shell offset (world units) that keeps the outline's on-screen width. */
    private outlineReach=0;
    /** 0 (close: no outline) … 1 (far: full edge). Local and preview rats stay at 1. */
    private outlineFade=1;
    /** The Hunch sketch, sharing the rigid batch's geometry and skeleton. */
    private sketch?:THREE.SkinnedMesh;
    private sketchUniform?:{value:number};
    private readonly shellOffset={value:0};

    // State
    public hp: number = MAX_HP;
    public dead: boolean = false;
    public name: string;
    /** The options this rat was built from (juice T5 lineup rebuilds it). */
    public readonly appearance: RatOptions;
    private localPlayer = false;
    public get isPlayer(): boolean { return this.localPlayer; }
    public set isPlayer(value: boolean) {
        this.localPlayer = value;
        if (this.glowMesh) this.glowMesh.visible = (!value || this.hustleRemaining>0) && !this.sharedDeath;
    }

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
    private freezeLeft = 0;
    /** Juice T4: the next death is a headshot (bigger hat blast, head splat, a held beat before the fall). */
    private headshot = false;
    private deathHold = 0;
    private headStains?: RatStains;
    private stains?: RatStains;
    private stainJoints?: {belly: THREE.Object3D; chest: THREE.Object3D};
    private flyingHat?: FlyingHat;
    private deathStyle: DeathStyle = 'default';
    private stainSeed = 0;
    private freezeHold = false;
    private readonly frozenPosition = new THREE.Vector3();
    private readonly frozenQuaternion = new THREE.Quaternion();
    private readonly hitHighlight = new THREE.Color(0xffe8b0);
    private readonly onRagdollContact = (event: { contact: CANNON.ContactEquation }) => {
        if(!this.dead){
            const speed=Math.abs(event.contact.getImpactVelocityAlongNormal());
            if(speed>8&&Math.abs(event.contact.ni.y)<.5)emitWorldSound(this.scene,'wall-bonk',this.body.position,{key:String(this.body.id),gain:Math.min(1.3,speed/20)});
            return;
        }
        if (this.deathPhase === 'done' || this.deathTimer < 0.16) return;
        const contact = event.contact;
        const speed = Math.abs(contact.getImpactVelocityAlongNormal());
        // Let the solver produce real rebounds; later contacts lose more energy.
        contact.restitution = this.deathContacts === 0 ? 0.48 : 0.22;
        if (speed < 1.5 || this.deathTimer - this.deathContactTime < 0.12) return;
        this.deathContactTime = this.deathTimer;
        this.deathContacts++;
        this.deathImpact = Math.min(speed / 12, 1);
        playEntitySound('ratHit', Math.min(0.25 + speed * 0.025, 0.65), this.body.position);
    };

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        position: THREE.Vector3,
        name: string,
        options?: RatOptions,
        isRemote: boolean = false,
        private readonly modelFactory: typeof createRatMesh = createRatMesh
    ) {
        this.scene = scene;
        this.world = world;
        this.name = name;
        this.isRemote = isRemote;

        // 1. GENERATE UNIQUE APPEARANCE
        const opts = options || this.generateRandomOptions();
        this.appearance = opts;

        // 2. VISUALS
        this.mesh = this.modelFactory({...opts, accessory: ratAccessory(name)});
        this.mesh.position.copy(position);
        this.mesh.userData.aimTarget = true;
        this.scene.add(this.mesh);
        // Rats cast no moon shadow (the moon map is the static city's); a contact disc grounds them.
        contactShadowsOf(scene)?.add(this.mesh, .75);

        // Cache materials for hit flash + apply emissive glow
        this.mesh.traverse((c) => {
            if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial && !this.allMaterials.includes(c.material)) {
                // Add subtle emissive self-illumination so rats glow from distance
                c.material.color.multiplyScalar(1.16);
                c.material.emissive.copy(c.material.color).lerp(new THREE.Color(0x73697b),.15).multiplyScalar(0.5);
                c.material.emissiveIntensity = EMISSIVE_INTENSITY;

                this.allMaterials.push(c.material);
                this.originalColors.push({
                    color: c.material.color.clone(),
                    emissive: c.material.emissive.clone(),
                    emissiveIntensity: c.material.emissiveIntensity, metalness:c.material.metalness, roughness:c.material.roughness, envMap:c.material.envMap, envMapIntensity:c.material.envMapIntensity
                });
            }
        });

        // ── OUTLINE GLOW MESH ──
        // Create a slightly larger, additive, backface-only clone for the glow halo
        this.glowMesh = this.createGlowOutline(opts);
        // Close rats and the local rat usually hide the outline. Its ~65 nodes
        // skip matrix updates while hidden and catch up on the frame it shows.
        this.glowMesh.updateMatrixWorld = function (force?: boolean) { if (this.visible) THREE.Group.prototype.updateMatrixWorld.call(this, force); };
        this.powerupEffects=new RatPowerupEffects(scene);
        this.streakSmoke=new RatStreakSmoke(scene,this.mesh.getObjectByName('rat-hat'));
        this.animator = new RatAnimator(this.mesh, this.glowMesh);
        this.syncGlowTransform();

        // 3. UI
        this.billboard = new RatBillboard(name, this.hp);
        this.billboard.sprite.layers.set(1);
        this.scene.add(this.billboard.sprite);

        // 4. PHYSICS — Compound shape: Body + Chest + Head
        // Remote entities get kinematic bodies (mass=0, no gravity)
        this.body = new CANNON.Body({
            mass: isRemote ? 0 : RAT_BODY.mass,
            type: isRemote ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC,
            fixedRotation: true,
            linearDamping: isRemote ? 0 : RAT_BODY.linearDamping,
            angularDamping: isRemote ? 0 : RAT_BODY.angularDamping,
            position: new CANNON.Vec3(position.x, position.y, position.z)
        });

        // The foot, chest and head spheres every rat shares.
        this.headShape = addRatShapes(this.body)[2]!;

        (this.body as any).userData = { entity: this };
        this.body.addEventListener('collide', this.onRagdollContact);
        this.world.addBody(this.body);
        // R2: corpse limbs rest on this world's city and bodies (never on this rat's own body).
        setRagdollWorld(this.world);this.animator.chain.ignore = this.body;
    }

    private generateRandomOptions(): RatOptions {
        let attempts = 0;
        while (attempts < 500) {
            const options = generateRandomAppearance();

            const key = makeComboKey(options);
            if (!usedCombinations.has(key)) {
                usedCombinations.add(key);
                this.comboKeyStr = key;
                return options;
            }
            attempts++;
        }

        // Bounded fallback for unusually crowded standalone fixtures.
        return { ...DEFAULT_APPEARANCE };
    }

    /**
     * Creates a glowing outline mesh — a surface-expanded clone rendered
     * with BackSide + Additive blending to create a visible aura.
     */
    private createGlowOutline(opts: RatOptions): THREE.Group {
        // The shell mirrors the model part for part, extras included.
        const glowGroup = this.modelFactory({...opts, accessory: ratAccessory(this.name)});

        // Expand along each vertex normal instead of scaling from the feet.
        // Eyes/ears can share geometry, so expand each geometry only once.
        // Every shell part has the same tint and lifetime. Share one owned
        // material per rat so a crowd does not switch identical GPU state.
        // The deforming tail and muzzle stay ordinary meshes while the rest is
        // skin-batched; one material shared by both kinds would switch shader
        // programs twice per rat per frame, so they get an identical twin.
        const shell = () => {
            const material = new THREE.MeshBasicMaterial({
                color: OUTLINE_COLOR, transparent: true, opacity: GLOW_OPACITY,
                side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
            });
            material.onBeforeCompile=shader=>{
                shader.uniforms.pursuitShell=this.shellOffset;
                shader.vertexShader='uniform float pursuitShell;\n'+shader.vertexShader;
                shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normal*pursuitShell;');
            };
            material.customProgramCacheKey=()=> 'rat-pursuit-shell-v1';
            return material;
        };
        const glowMaterial = shell(), glowTailMaterial = shell();
        this.glowMaterials=[glowMaterial,glowTailMaterial];
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
                let deforming=false;
                for(let parent:THREE.Object3D|null=c;parent&&parent!==glowGroup;parent=parent.parent)if(parent.name==='rat-tail'||parent.name==='rat-muzzle')deforming=true;
                c.material = deforming ? glowTailMaterial : glowMaterial;
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
            if (this.deathHold > 0) {
                this.deathHold -= dt;
                this.flyingHat?.update(dt);
                if (this.deathHold > 0) {
                    // R3: the body goes limp (knees buckle, waist folds) before it flies. The
                    // death clock starts at the launch, so launch contacts are never impacts.
                    if (feelState().on('ragdollBody') && !this.sharedDeath) this.updateDeathRagdoll(dt);
                    return;
                }
                // An incident corpse may have taken over during the hold.
                if (!this.sharedDeath) this.launchRagdoll();
            }
            this.deathTimer += dt;
            this.updateDeathRagdoll(dt);
            this.flyingHat?.update(dt);
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

    /** The Hunch: `strength` 0 hides; otherwise the parts of this rat hidden
     * behind scenery show as a pencil sketch. Needs rigid batching. */
    public sense(strength:number):void {
        const on=strength>0&&!this.dead&&!this.sharedDeath;
        if(!on){if(this.sketch)this.sketch.visible=false;return;}
        if(!this.sketch){
            const batch=this.mesh.getObjectByName('rat-rigid-batch');
            if(!(batch instanceof THREE.SkinnedMesh))return;
            // Bones carry world matrices, so the sketch lives at the scene root.
            const {material,strength}=hunchSketchMaterial();
            this.sketch=new THREE.SkinnedMesh(batch.geometry,material);this.sketchUniform=strength;
            this.sketch.bind(batch.skeleton,batch.bindMatrix);
            this.sketch.name='rat-hunch-sketch';this.sketch.frustumCulled=false;this.sketch.raycast=()=>{};
            this.sketch.castShadow=this.sketch.receiveShadow=false;this.sketch.matrixAutoUpdate=false;
            this.scene.add(this.sketch);
        }
        this.sketch.visible=true;
        if(this.sketchUniform)this.sketchUniform.value=strength;
    }

    public resetMotionHistory(): void { this.animator.resetMotionHistory();this.powerupEffects.clear(); }

    /** Isolated workshop A/B; gameplay uses the candidate by default. */
    public setLocomotionPolish(enabled:boolean):void { this.animator.setLocomotionPolish(enabled); }
    public setActingEnabled(enabled:boolean):void {this.animator.setActingEnabled(enabled);}
    public resetReactions():void {this.animator.resetReactions();}
    /** L5: a nearby launcher blew this rat's hat off (it lands back on). */
    public blowHat(strength=1):void {if(!this.dead&&this.hp>0)this.animator.blowHat(strength);}
    /** M1: a near miss: wide eyes and a gasp. */
    public startle():void {if(!this.dead&&this.hp>0)this.animator.startle();}
    /** True while riding a launcher throw, until the landing. */
    public get launchFlight():boolean {return !this.dead&&this.animator.launchFlight;}
    public playReaction(event:RatReaction,strength=1):void {
        if(!this.dead&&this.hp>0)this.animator.playReaction(event,strength);
    }

    /** Durations are relative to the latest authoritative snapshot, then expire locally. */
    public setPowerups(ironcladSeconds:number,hustleSeconds:number):void {
        const silver=this.ironcladRemaining>0;
        if(!this.dead&&ironcladSeconds>this.ironcladRemaining+.5){this.metalApplication=.28;this.powerupEffects.apply('ironclad');this.animator.pulse('ironclad');}
        if(!this.dead&&hustleSeconds>this.hustleRemaining+.5){this.powerupEffects.apply('hustle');this.animator.pulse('hustle');}
        this.ironcladRemaining=this.dead?0:Math.max(0,ironcladSeconds);
        this.hustleRemaining=this.dead?0:Math.max(0,hustleSeconds);
        if(silver!==(this.ironcladRemaining>0)){this.resetColor();if(this.flashTimer>0)this.applyHitColor();}
        this.updatePowerupOutline();
    }
    /** Per frame: widen the shell so the outline keeps its on-screen width.
     * `unitsPerPixel` is the world size of one screen pixel at one unit away. */
    public fitOutline(camera:THREE.Vector3,unitsPerPixel:number):void {
        if(this.dead)return;
        const distance=this.mesh.position.distanceTo(camera);
        this.outlineFade=THREE.MathUtils.smoothstep(distance,OUTLINE_NEAR,OUTLINE_FAR);
        this.outlineReach=Math.max(0,OUTLINE_PIXELS*this.outlineFade*unitsPerPixel*distance-GLOW_THICKNESS);
        this.updatePowerupOutline();
    }
    private updatePowerupOutline():void {
        const pursuit=this.hustleRemaining>0&&!this.dead;
        for(const material of this.glowMaterials){material.color.setHex(pursuit?0xff1605:OUTLINE_COLOR);material.opacity=pursuit?.95:GLOW_OPACITY*this.outlineFade;}
        this.shellOffset.value=pursuit?Math.max(.055,this.outlineReach):this.outlineReach;
        if(this.glowMesh)this.glowMesh.visible=!this.sharedDeath&&(pursuit||!this.isPlayer&&this.outlineFade>.01);
    }
    private clearPowerups():void {this.metalApplication=0;this.ironcladRemaining=this.hustleRemaining=0;this.powerupEffects.clear();this.streakSmoke.clear();this.updatePowerupOutline();this.resetColor();}

    /** Kill streak: 3 or more stamps the nameplate and makes the fedora smoulder. A death ends it. */
    public setStreak(streak:number):void {this.streak=this.dead?0:streak;this.billboard.setStreak(this.streak);if(streakTier(this.streak)===0)this.streakSmoke.clear();}

    /** Hit-stop: hold this rat's animated pose for `seconds`. `holdPosition` also pins the
     * rendered root (remote rats); the local rat keeps moving so its camera never hitches.
     * Presentation only: the physics body and collision queries are untouched. */
    public freeze(seconds:number,holdPosition:boolean):void {
        if(this.dead||this.disposed||!(seconds>0))return;
        if(this.freezeLeft<=0){this.frozenPosition.copy(this.mesh.position);this.frozenQuaternion.copy(this.mesh.quaternion);}
        this.freezeLeft=Math.max(this.freezeLeft,seconds);this.freezeHold=holdPosition;
    }

    /** Animate the current render root; remote presentation need not read physics. */
    public presentAlive(dt: number, previewSpeed?:number): void {
        if (this.dead) return;
        this.billboard.update(dt);
        const p = this.mesh.position;
        if(this.freezeLeft>0){
            this.freezeLeft=Math.max(0,this.freezeLeft-dt);
            // Keep the animator's motion baseline at the live pose (before pinning) so resuming isn't read as a skid.
            this.animator.holdMotion();
            if(this.freezeHold){p.copy(this.frozenPosition);this.mesh.quaternion.copy(this.frozenQuaternion);}
            this.billboard.sprite.position.set(p.x, p.y + 2.2, p.z);
            this.syncGlowTransform();
            return;
        }
        this.billboard.sprite.position.set(p.x, p.y + 2.2, p.z);
        this.syncGlowTransform();
        this.animator.setHustle(this.hustleRemaining>0);
        this.animator.update(dt,previewSpeed);
        // Polish 16: dust from this frame's animation events (consumed once).
        if(this.animator.skidStarted){this.animator.skidStarted=false;kickDust(p,.45);}
        if(this.animator.landedFall>0){kickDust(p,Math.min(1,.3+(this.animator.landedFall-12)/25));this.animator.landedFall=0;}
        if(this.animator.launched){this.animator.launched=false;kickDust(p,1);}

        const silver=this.ironcladRemaining>0,pursuit=this.hustleRemaining>0;
        this.ironcladRemaining=Math.max(0,this.ironcladRemaining-dt);
        this.hustleRemaining=Math.max(0,this.hustleRemaining-dt);
        if(this.metalApplication>0){this.metalApplication=Math.max(0,this.metalApplication-dt);this.resetColor();}
        if(silver&&this.ironcladRemaining===0)this.resetColor();
        if(pursuit&&this.hustleRemaining===0)this.updatePowerupOutline();
        this.powerupEffects.update(dt,p,this.hustleRemaining>0);
        this.streakSmoke.update(dt,streakTier(this.streak),this.isPlayer);

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
        // R1: stains ride the bent coat, not the unbent body they hang on.
        if (this.stains) {
            this.stainJoints ??= {belly: this.mesh.getObjectByName('rat-spine-belly')!, chest: this.mesh.getObjectByName('rat-spine-chest')!};
            this.stains.bend(this.stainJoints.belly, this.stainJoints.chest);
        }

        // Sync glow outline to ragdoll position (fade out during death)
        if (this.glowMesh) {
            this.glowMesh.position.copy(this.mesh.position);
            this.glowMesh.quaternion.copy(this.mesh.quaternion);
            // Fade out glow as they die
            const fadeOut = Math.max(0, 1 - t / DEATH_GLOW_FADE);
            this.glowMesh.traverse((c) => {
                if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
                    c.material.opacity = GLOW_OPACITY * this.outlineFade * fadeOut;
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
        this.sharedDeath=true;this.dead=true;this.hp=0;this.clearPowerups();this.setStreak(0);
        // The shared corpse model pops its own hat (ChaosView); drop any local one.
        this.flyingHat?.dispose();this.flyingHat=undefined;
        this.animator.resetReactions();
        this.mesh.visible=false;if(this.glowMesh)this.glowMesh.visible=false;
        this.billboard.sprite.removeFromParent();
        this.body.velocity.setZero();this.body.angularVelocity.setZero();
        this.body.collisionFilterMask=0;this.body.sleep();
        playEntitySound('ratDeath',.6, this.isPlayer ? undefined : this.body.position);
    }

    /** Quick Fix: restore authoritative health without any death or respawn path. */
    public heal(hp: number): void {
        if (this.dead || hp <= this.hp) return;
        this.hp = hp;
        this.billboard.setHealth(this.hp);
        this.flashColor(0x8fffb0);this.powerupEffects.heal();
        this.playReaction('heal');this.animator.pulse('heal');
    }

    public takeDamage(amount: number, impactVel: THREE.Vector3) {
        if (this.dead) return;

        this.hp -= amount;
        this.billboard.setHealth(this.hp);
        this.stain(impactVel);

        // Flash Red
        this.flashColor(0xffa16b);

        // ── SOUND EFFECTS ──
        if (this.hp > 0) {
            this.animator.takeHit(impactVel);
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

    /** Polish 15: composed kill nod. */
    public nod(): void { if (!this.dead) this.animator.nod(); }

    /** Juice T4: present the next death as a headshot. */
    public markHeadshot(): void { this.headshot = true; }

    /** Polish 12: flavour the next death's secondary motion by its cause. */
    public setDeathStyle(style: DeathStyle): void { this.deathStyle = style; }

    /** Polish 11: knock the fedora off as its own tumbling object. */
    private popHat(impactVel: THREE.Vector3): void {
        this.flyingHat?.dispose();this.flyingHat = undefined;
        if (this.disposed || this.sharedDeath || !feelState().on('hatPop')) return;
        const hat = this.mesh.getObjectByName('rat-hat');
        if (!hat) return;
        const p = FEEL.hatPop.params,blast = this.headshot ? FEEL.headshot.params : undefined;
        // Legacy ragdoll: its lowest reached height stands in for the ground (never rises).
        const body = this.body.position;let floor = Infinity;
        this.flyingHat = new FlyingHat(this.scene, hat, impactVel, () => floor = Math.min(floor, body.y - .5),
            p.speed * (blast?.hatSpeed ?? 1), p.lift * (blast?.hatLift ?? 1), ++this.stainSeed);
        this.animator.setHatHidden(true);
    }

    /** Polish 6: a cheese stain on the side facing the shooter (opposite the impact). */
    private stain(impactVel: THREE.Vector3): void {
        if (this.disposed || !feelState().on('stains')) return;
        if (!this.stains) { const body = this.mesh.getObjectByName('rat-body'); if (!body) return; this.stains = new RatStains(body); }
        const x = -impactVel.x, z = -impactVel.z, yaw = this.mesh.rotation.y;
        const angle = x || z ? Math.atan2(x, z) - yaw : this.stainSeed * 2.1;
        this.stains.add(angle + Math.sin(this.stainSeed * 12.9) * .5, ++this.stainSeed);
    }

    public flashColor(color: number) {
        this.hitColor.setHex(color);
        this.flashTimer = FLASH_DURATION;
        this.applyHitColor();
    }

    private applyHitColor(): void {
        this.resetColor();
        const age = FLASH_DURATION - this.flashTimer;
        const fade = Math.pow(Math.max(0, this.flashTimer / FLASH_DURATION), 1.5);
        const highlight = Math.exp(-age * 65) * 0.45;
        this.allMaterials.forEach((material, i) => {
            const original = this.originalColors[i];
            // Keep dark facial details readable instead of turning the rat into neon.
            const dark = Math.max(original.color.r, original.color.g, original.color.b) < 0.08;
            const strength = dark ? 0.08 : 1;
            material.color.lerp(this.hitColor, fade * 0.38 * strength)
                .lerp(this.hitHighlight, highlight * strength);
            material.emissive.lerp(this.hitColor, fade * 0.25 * strength);
            material.emissiveIntensity += fade * 0.22 * strength;
        });
    }

    private resetColor() {
        this.allMaterials.forEach((m, i) => {
            const orig = this.originalColors[i];
            const envMap=this.ironcladRemaining>0?metalReflection():orig.envMap;
            if(m.envMap!==envMap){m.envMap=envMap;m.needsUpdate=true;}
            m.envMapIntensity=this.ironcladRemaining>0?1.6:orig.envMapIntensity;
            if(this.ironcladRemaining>0){
                m.color.setHex(0xdce4ed).lerp(orig.color,this.metalApplication/.28);m.emissive.setHex(0x9facbb);m.emissiveIntensity=.22;
                m.metalness=.88;m.roughness=.16;
            }else{
                m.color.copy(orig.color);m.emissive.copy(orig.emissive);m.emissiveIntensity=orig.emissiveIntensity;
                m.metalness=orig.metalness;m.roughness=orig.roughness;
            }
        });
    }

    private die(impactVel: THREE.Vector3) {
        if (this.dead) return;
        this.dead = true;
        this.setStreak(0);
        this.clearPowerups();
        this.animator.reset();
        this.deathTimer = 0;
        this.deathContactTime = -10;
        this.deathImpact = this.deathContacts = this.restTime = 0;
        this.deathPhase = 'launch';
        this.resetColor();
        const headshot = this.headshot && feelState().on('headshot');
        this.animator.setDeathStyle(this.deathStyle,headshot);this.deathStyle = 'default';
        this.popHat(impactVel);
        this.headshot = false;
        if (headshot) this.splatHead(impactVel);

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

        // Remove UI billboard
        this.scene.remove(this.billboard.sprite);
        this.launchDirection.copy(impDir);this.launchAxis.copy(fallAxis);
        // A headshot holds the rat in place for a beat before the fall; the R7 limp beat
        // lets it sag as a slack ragdoll body (no blow yet) before it flies.
        this.deathHold = Math.max(headshot ? FEEL.headshot.params.hold : 0, feelState().on('ragdollBody') ? FEEL.ragdollBody.params.limp : 0);
        if (this.deathHold > 0) {
            if (headshot) this.body.type = CANNON.Body.KINEMATIC;else this.launchRagdoll(false);
            this.body.velocity.setZero();this.body.angularVelocity.setZero();
        } else this.launchRagdoll();
    }

    private readonly launchDirection = new THREE.Vector3();
    private readonly launchAxis = new THREE.Vector3();
    /** Make the body a light tumbling ragdoll and, with `blow`, give it the death launch. */
    private launchRagdoll(blow = true): void {
        const impDir = this.launchDirection, fallAxis = this.launchAxis;
        // ── RAGDOLL PHYSICS — DRAMATIC LAUNCH ──
        this.body.type = CANNON.Body.DYNAMIC;
        this.body.fixedRotation = false;
        this.body.mass = 2;              // Lighter during ragdoll = more dramatic flight
        this.body.updateMassProperties();
        this.body.linearDamping = 0.02;  // Near-zero — let them FLY
        this.body.angularDamping = 0.02;
        this.body.wakeUp();
        if (!blow) return;

        // MASSIVE death blow: launch UP + backward for dramatic hang time
        const impulse = new CANNON.Vec3(
            impDir.x * DEATH_FORCE,
            60 + Math.random() * 8,         // Huge airborne arc; physics still owns the landing
            impDir.z * DEATH_FORCE
        );
        this.body.applyImpulse(impulse, new CANNON.Vec3(0, 1.0, 0));

        // Aggressive spin — multiple rotations in the air. The R7 chain body shows no
        // spin, so its box tumbles only gently (a sack, not a thrown bottle).
        const spin = feelState().on('ragdollBody') ? FEEL.ragdollBody.params.spin : 16, wobble = spin / 16;
        this.body.angularVelocity.set(
            fallAxis.x * spin + (Math.random() - 0.5) * 5 * wobble,
            (Math.random() - 0.5) * 5 * wobble,     // Off-axis twist keeps each tumble different
            fallAxis.z * spin + (Math.random() - 0.5) * 5 * wobble
        );
    }

    /** Juice T4: cheese splattered over the head, facing the shooter. */
    private splatHead(impactVel: THREE.Vector3): void {
        if (this.disposed) return;
        const head = this.mesh.getObjectByName('rat-head');
        if (!head) return;
        this.headStains ??= new RatStains(head);
        const yaw = this.mesh.rotation.y, x = -impactVel.x, z = -impactVel.z;
        const facing = x || z ? Math.atan2(x, z) - yaw : 0;
        for (let i = 0; i < 4; i++) this.headStains.addOnSphere(facing + (i - 1.5) * .55, .05 + (i % 2) * .16, .3, ++this.stainSeed, 1.25);
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
        this.clearPowerups();
        this.restoreBodyOrigin();
        this.animator.reset();
        this.flashTimer = 0;
        this.freezeLeft = 0;
        this.stains?.dispose();this.stains = undefined;
        this.headStains?.dispose();this.headStains = undefined;this.headshot = false;this.deathHold = 0;
        this.flyingHat?.dispose();this.flyingHat = undefined;
        this.deathTimer = 0;

        this.deathContactTime = -10;
        this.deathImpact = this.deathContacts = this.restTime = 0;
        this.deathPhase = 'launch';
        this.resetColor();
        this.glowMesh?.traverse(child => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                child.material.opacity = GLOW_OPACITY * this.outlineFade;
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
        this.setStreak(data.streak ?? 0);
    }

    /** Restore the existing local/remote alive-body settings after a server respawn. */
    public respawn(data: Vec3Data & { hp: number }): void {
        this.dead = false;
        this.sharedDeath=false;this.body.collisionFilterMask=-1;if(this.glowMesh)this.glowMesh.visible=!this.isPlayer;
        this.resetAlivePresentation();
        this.animator.playRespawn();
        this.hp = data.hp;
        this.billboard.setHealth(data.hp);
        this.mesh.visible = true;
        this.billboard.sprite.visible = true;
        this.scene.add(this.billboard.sprite);

        const body = this.body;
        body.mass = this.isRemote ? 0 : RAT_BODY.mass;
        body.type = this.isRemote ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
        body.fixedRotation = true;
        // Respawn damping intentionally differs from constructor damping.
        body.linearDamping = this.isRemote ? 0 : RAT_BODY.respawnDamping;
        body.angularDamping = this.isRemote ? 0 : RAT_BODY.respawnDamping;
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
        this.powerupEffects.dispose();this.streakSmoke.dispose();
        // Shared stain resources must leave the rig before its resources are disposed.
        this.stains?.dispose();
        this.headStains?.dispose();
        this.flyingHat?.dispose();
        this.scene.remove(this.mesh);
        contactShadowsOf(this.scene)?.remove(this.mesh);
        disposeMeshResources(this.mesh);
        this.billboard.dispose();
        if(this.sketch){this.scene.remove(this.sketch);(Array.isArray(this.sketch.material)?this.sketch.material:[this.sketch.material]).forEach(m=>m.dispose());this.sketch=undefined;}
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
