import * as THREE from 'three';
import type { RatEntity } from '../entities/RatEntity';
import { RigidBatch } from '../utils/RigidMeshBatch';
import { RAT_CARRY_SHOULDER } from '../utils/RatAnimator';
import { metalReflection } from '../utils/metalReflection';
import { CASE_HAND, CASE_SIZE, type CaseState } from '../shared/chaosState';
import { beatPhase, pingFlash } from '../shared/caseHeartbeat';
import { reducedMotion } from '../ui/motion';
import type { CaseMaterials } from './CaseModel';
import { HeatSparks, SPARK_EMBER, SPARK_SMOKE } from './HeatSparks';

/** One case material's red-hot look: albedo, emissive colour, emissive at rest (`base`) and added at a ping (`flare`),
 * surface, and how much it flickers like coal. */
interface Heat { color: number; emissive: number; base: number; flare: number; roughness: number; metalness: number; flicker: number }
/** The leather turns to dark cherry-red iron; the seams, straps, brass frame, corners and stitching glow like coal;
 * the EVIDENCE tag's stripe burns brightest. */
const CASE_HEAT: Record<Exclude<keyof CaseMaterials, 'shells'>, Heat> = {
    leather: { color: 0x3a110a, emissive: 0xa81c08, base: .8, flare: 1.4, roughness: .42, metalness: .55, flicker: .05 },
    panel: { color: 0x2c0d08, emissive: 0x821406, base: .65, flare: 1.2, roughness: .45, metalness: .5, flicker: .05 },
    edge: { color: 0x2a0a05, emissive: 0xff4510, base: 1.6, flare: 2.2, roughness: .6, metalness: .2, flicker: .18 },
    brass: { color: 0x5a1c0c, emissive: 0xff6a1e, base: 1.35, flare: 2.4, roughness: .3, metalness: .8, flicker: .12 },
    paper: { color: 0xc9a37a, emissive: 0xff5a18, base: .35, flare: .9, roughness: .95, metalness: 0, flicker: .2 },
    ink: { color: 0x3a0c04, emissive: 0xffa040, base: 1.8, flare: 2.4, roughness: .9, metalness: 0, flicker: .25 },
    red: { color: 0xff3024, emissive: 0xff2a10, base: 2.2, flare: 2.6, roughness: .6, metalness: 0, flicker: .08 },
};
/** Seconds the heat takes to come up after a rat takes the case (off is immediate). */
const HEAT_UP = .3;

// The cuff and chain, in the carry anchor's frame (the case grip's sleeve runs from the shoulder to the hand).
const GRIP = new THREE.Vector3(CASE_HAND.x, CASE_HAND.y + .43, CASE_HAND.z).sub(RAT_CARRY_SHOULDER);
const SLEEVE = GRIP.clone().normalize();
/** The handcuff closes round the coat sleeve just behind the shirt cuff, where it reads against the sleeve. */
const WRIST = GRIP.clone().addScaledVector(SLEEVE, -.19);
const WRIST_TURN = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), SLEEVE);
/** The case end: a small cuff through one of the handle's brass loops (case space). */
const LOOP = new THREE.Vector3(.12, CASE_SIZE.y * .47 + .03, 0);
/** Wrist and case cuff radii; the chain's length (slack between them, units at rat scale 1), each link's ring radius
 * (its long axis 1.6×, so its hole shows), the pitch at which links interlock, and the most links. */
const WRIST_CUFF = .118, CASE_CUFF = .05, CHAIN = .56, LINK = .03, LINK_PITCH = .072, MAX_LINKS = 10;
const LINK_TWIST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
/** Dark steel never quite black; it glows coal red only at a ping. */
const STEEL_BASE = new THREE.Color(0x14171c), COAL = new THREE.Color(0xff3a10);
/** The hat band overlay sits just proud of the band it covers. */
const BAND_GROW = new THREE.Matrix4().makeScale(1.035, 1.05, 1.035);

const Y = new THREE.Vector3(0, 1, 0);
const anchorPosition = new THREE.Vector3(), anchorQuaternion = new THREE.Quaternion(), anchorScale = new THREE.Vector3();
const wrist = new THREE.Vector3(), wristQuaternion = new THREE.Quaternion(), axis = new THREE.Vector3(), up = new THREE.Vector3();
const loop = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3(), span = new THREE.Vector3(), reach = new THREE.Vector3();
const point = new THREE.Vector3(), tangent = new THREE.Vector3(), scale = new THREE.Vector3(), turn = new THREE.Quaternion(), bow = new THREE.Vector3();
const matrix = new THREE.Matrix4();

/** The coat's red-hot edges: the carrier's batched rig drawn again as a hair-thin shell over its coat only, painted
 * only along the silhouette where the coat turns away from the eye, and blended over (not added to) the coat so a
 * coat of any colour stays its own colour face-on and goes red-orange only at its edge. Each ping widens and heats it. */
function coatHeatMaterial(uniforms: { heatGlow: { value: number }; heatFlare: { value: number }; heatCoat: { value: number } }): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false });
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'attribute float ratMaterial;uniform float heatCoat;varying vec3 vHeatView;varying vec3 vHeatNormal;varying float vHeatMask;\n'
            + shader.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
            // Just proud of the coat, so the overlay never depth-fights it.
            transformed+=normalize(objectNormal)*.012;`).replace('#include <project_vertex>', `#include <project_vertex>
            vHeatView=mvPosition.xyz;vHeatNormal=normalize(transformedNormal);
            vHeatMask=heatCoat<0.?1.:1.-step(.5,abs(ratMaterial-heatCoat));`);
        shader.fragmentShader = 'uniform float heatGlow;uniform float heatFlare;varying vec3 vHeatView;varying vec3 vHeatNormal;varying float vHeatMask;\n'
            + shader.fragmentShader.replace('#include <opaque_fragment>', `
            if(vHeatMask<.5)discard;
            float turn=1.-abs(dot(normalize(vHeatNormal),normalize(-vHeatView)));
            float rim=smoothstep(.6-.18*heatFlare,.93,turn);
            float a=rim*min(1.,heatGlow*.9+heatFlare);
            if(a<.004)discard;
            // Coal red inside the edge, orange-hot right at the turn.
            gl_FragColor=vec4(mix(vec3(.95,.1,.02),vec3(1.,.5,.12),smoothstep(.8,1.,turn)*(.5+.5*heatFlare)),a);`);
    };
    material.customProgramCacheKey = () => 'hot-case-coat-v2';
    return material;
}

interface HeatedMaterial { material: THREE.MeshStandardMaterial; heat: Heat; color: THREE.Color; emissive: THREE.Color; intensity: number;
    roughness: number; metalness: number; hotColor: THREE.Color; hotEmissive: THREE.Color; phase: number }

/** The carried hot case and its carrier (Tyler, 2 October), in direct sight and depth-tested for everyone, the carrier
 * included: the case turns red-hot metal (coal-glowing seams, edges and corners, a faint heat haze, smoke) and is
 * handcuffed to the rat's wrist by a short steel chain; the rat gets red-hot coat edges, a red hat band, embers rising
 * off it. Every glow beats on the case's heartbeat (`caseHeartbeat`): a big
 * flare at each ping. The through-wall ping flash is `HeartbeatPing`'s. A loose case keeps its leather look.
 *
 * About four draws while carried (chain, sparks, coat rim, hat band), none loose; all buffers preallocated. */
export class HotCaseLook {
    private readonly root = new THREE.Group();
    private readonly heated: HeatedMaterial[] = [];
    private readonly shells: { material: THREE.MeshBasicMaterial; opacity: number }[] = [];
    private readonly chain: THREE.InstancedMesh;
    private readonly steel: THREE.MeshStandardMaterial;
    private readonly sparks = new HeatSparks();
    private readonly coatUniforms = { heatGlow: { value: 0 }, heatFlare: { value: 0 }, heatCoat: { value: -1 } };
    private readonly coatMaterial = coatHeatMaterial(this.coatUniforms);
    private coat: THREE.SkinnedMesh | null = null;
    private readonly bandMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false });
    /** Borrows the carrier's hat band geometry while carried; an empty stand-in otherwise. */
    private readonly band: THREE.Mesh;
    private readonly noBand = new THREE.BufferGeometry();
    private bandSource: THREE.Object3D | null = null;
    private rat: RatEntity | null = null;
    private heat = 0;
    private hot = false;
    private time = 0;
    private lastRender = NaN;
    private pingAt = NaN;
    private emberDue = 0; private caseEmberDue = 0; private smokeDue = 0;

    constructor(private readonly scene: THREE.Scene, private readonly caseRoot: THREE.Object3D, materials: CaseMaterials) {
        this.root.name = 'hot-case-look';
        for (const key of Object.keys(CASE_HEAT) as (keyof typeof CASE_HEAT)[]) {
            const material = materials[key], heat = CASE_HEAT[key];
            this.heated.push({ material, heat, color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity,
                roughness: material.roughness, metalness: material.metalness, hotColor: new THREE.Color(heat.color), hotEmissive: new THREE.Color(heat.emissive),
                phase: this.heated.length * 1.9 });
        }
        for (const material of materials.shells) this.shells.push({ material, opacity: material.opacity });
        // Dark, polished: the reflection bands give it the bright specular edge that reads as steel at a distance.
        this.steel = new THREE.MeshStandardMaterial({ color: 0x7d838c, metalness: .92, roughness: .3, envMap: metalReflection(), envMapIntensity: 1.6,
            emissive: STEEL_BASE, emissiveIntensity: 1 });
        this.chain = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .26, 6, 12), this.steel, 2 + MAX_LINKS);
        this.chain.name = 'hot-case-handcuff'; this.chain.frustumCulled = false; this.chain.raycast = () => {}; this.chain.count = 0;
        this.band = new THREE.Mesh(this.noBand, this.bandMaterial);
        this.band.name = 'hot-case-hat-band'; this.band.frustumCulled = false; this.band.raycast = () => {};
        // Follows the carrier's (hidden, batched) hat band leaf exactly, at draw time.
        this.band.matrixAutoUpdate = false; this.band.matrixWorldAutoUpdate = false;
        this.band.onBeforeRender = () => { if (this.bandSource) this.band.matrixWorld.multiplyMatrices(this.bandSource.matrixWorld, BAND_GROW); };
        this.root.add(this.chain, this.sparks.mesh);
        this.root.visible = false;
        scene.add(this.root);
    }

    /** Per frame, after the case's pose. `state` is this case, `now` the view's server-time clock, `renderTime` the
     * presentation clock (ms); `carrier` the live rat carrying it (null loose) and `anchor` its case grip's anchor. */
    update(_camera: THREE.Camera, renderTime: number, state: CaseState, now: number, carrier: RatEntity | null, anchor: THREE.Object3D | null): void {
        const dt = Number.isFinite(this.lastRender) ? Math.max(0, Math.min(.1, (renderTime - this.lastRender) / 1000)) : 0;
        this.lastRender = renderTime;
        if (carrier !== this.rat) { this.detach(); if (carrier) this.attach(carrier); }
        if (!carrier) return;
        const motion = !reducedMotion();
        if (motion) this.time += dt;
        this.heat = Math.min(1, this.heat + dt / HEAT_UP);
        const flash = pingFlash(state, now), phase = beatPhase(state, now);
        // The glow swells toward the next ping, then each ping flares.
        const glow = .62 + .3 * phase * phase, flare = flash * this.heat;
        const ping = state.owner && state.ping ? state.ping.at : NaN, pinged = !Number.isNaN(ping) && ping !== this.pingAt;
        this.pingAt = ping;
        this.heatCase(glow, flare);
        this.root.visible = true; this.hot = true;
        const shown = carrier.mesh.visible, p = carrier.mesh.position;
        if (anchor) this.cuff(anchor, p, flare); else this.chain.count = 0;
        this.coatUniforms.heatGlow.value = glow * this.heat; this.coatUniforms.heatFlare.value = flare;
        if (this.coat) this.coat.visible = shown;
        this.band.visible = shown && !!this.bandSource;
        const k = Math.min(1, glow * .55 * this.heat + flare);
        this.bandMaterial.color.setRGB(.55 + .45 * k, .015 + .1 * k * k, .008 + .04 * k * k);
        // Embers, smoke and shimmer move; reduced motion keeps only the glow.
        if (motion) { this.emit(dt, p, shown, glow, flare, pinged); this.sparks.step(dt); } else this.sparks.clear();
    }

    /** Back to the loose look at once (round reset, reconnect). */
    clear(): void { this.detach(); }

    /** Programs warm-up: draw everything once on `rat` (rigid-batched) and this case. */
    warm(rat: RatEntity): void {
        this.attach(rat); this.heat = 1; this.heatCase(1, 1); this.root.visible = true;
        this.chain.count = 2 + MAX_LINKS;
        this.sparks.shimmer(this.caseRoot.position.x, this.caseRoot.position.y + .6, this.caseRoot.position.z, 1, 1, 1);
        this.sparks.emit(SPARK_EMBER, 0, 1, 0, 0, 0, 0, 1, .1); this.sparks.emit(SPARK_SMOKE, 0, 1, 0, 0, 0, 0, 1, .3);
        this.sparks.step(0);
    }

    dispose(): void {
        this.detach();
        this.root.removeFromParent();
        this.chain.geometry.dispose(); this.chain.dispose(); this.steel.dispose();
        this.sparks.dispose();
        this.coatMaterial.dispose(); this.bandMaterial.dispose(); this.noBand.dispose();
    }

    private attach(rat: RatEntity): void {
        this.rat = rat; this.heat = 0; this.pingAt = NaN;
        const batch = rat.mesh.getObjectByName('rat-rigid-batch');
        if (batch instanceof RigidBatch) {
            // The batch's buffers drawn again (without the tail), skinned by the same bones, as the sketch does.
            const geometry = new THREE.BufferGeometry();
            for (const [name, attribute] of Object.entries(batch.geometry.attributes)) geometry.setAttribute(name, attribute);
            geometry.setIndex(batch.geometry.index); geometry.setDrawRange(0, batch.rigidIndexCount);
            const parts = batch.userData.rigidSources as THREE.Mesh[];
            const materials = [...new Set(parts.map(part => part.material as THREE.Material))];
            this.coatUniforms.heatCoat.value = materials.findIndex(material => material.name === 'rat-coat');
            this.coat = new THREE.SkinnedMesh(geometry, this.coatMaterial);
            this.coat.bind(batch.skeleton, batch.bindMatrix);
            this.coat.name = 'hot-case-coat-rim'; this.coat.frustumCulled = false; this.coat.matrixAutoUpdate = false; this.coat.raycast = () => {};
            this.coat.castShadow = this.coat.receiveShadow = false;
            this.scene.add(this.coat);
        }
        const band = rat.mesh.getObjectByName('rat-hatband');
        if (band instanceof THREE.Mesh) { this.bandSource = band; this.band.geometry = band.geometry; this.scene.add(this.band); }
    }

    private detach(): void {
        if (this.coat) {
            this.coat.removeFromParent();
            // The buffers are the rig's: release only this draw's own state.
            const geometry = this.coat.geometry;
            for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
            geometry.setIndex(null); geometry.dispose(); this.coat = null;
        }
        this.band.removeFromParent(); this.band.geometry = this.noBand; this.bandSource = null;
        this.rat = null; this.heat = 0;
        this.sparks.clear(); this.chain.count = 0;
        this.emberDue = this.caseEmberDue = this.smokeDue = 0;
        this.root.visible = false;
        if (this.hot) this.cool();
    }

    /** The case's materials toward red-hot by the heat ramp, beating with the heartbeat. */
    private heatCase(glow: number, flare: number): void {
        const h = this.heat;
        for (let i = 0; i < this.heated.length; i++) {
            const e = this.heated[i]!, heat = e.heat, m = e.material;
            const flicker = 1 + heat.flicker * Math.sin(this.time * 13.7 + e.phase) * Math.sin(this.time * 5.3 + e.phase * .7);
            m.color.lerpColors(e.color, e.hotColor, h); m.emissive.lerpColors(e.emissive, e.hotEmissive, h);
            m.emissiveIntensity = e.intensity + ((heat.base * glow + heat.flare * flare) * flicker - e.intensity) * h;
            m.roughness = e.roughness + (heat.roughness - e.roughness) * h; m.metalness = e.metalness + (heat.metalness - e.metalness) * h;
        }
        for (let i = 0; i < this.shells.length; i++) {
            const shell = this.shells[i]!;
            shell.material.opacity = Math.min(1, shell.opacity * (1 + (.5 + 1.2 * flare) * h));
        }
    }

    /** The loose case's own leather again. */
    private cool(): void {
        this.hot = false;
        for (const e of this.heated) {
            e.material.color.copy(e.color); e.material.emissive.copy(e.emissive); e.material.emissiveIntensity = e.intensity;
            e.material.roughness = e.roughness; e.material.metalness = e.metalness;
        }
        for (const shell of this.shells) shell.material.opacity = shell.opacity;
    }

    /** The handcuff on the wrist, the small cuff through the handle's loop and the slack chain between them, which
     * loops out from the rat's side (`rat`: its feet) so it reads past the paw and the case's papers. */
    private cuff(anchor: THREE.Object3D, rat: THREE.Vector3, flare: number): void {
        anchor.matrixWorld.decompose(anchorPosition, anchorQuaternion, anchorScale);
        const size = (anchorScale.x + anchorScale.y + anchorScale.z) / 3, caseSize = this.caseRoot.scale.x;
        wrist.copy(WRIST).applyMatrix4(anchor.matrixWorld);
        wristQuaternion.copy(anchorQuaternion).multiply(WRIST_TURN);
        axis.set(0, 0, 1).applyQuaternion(wristQuaternion);
        this.chain.setMatrixAt(0, matrix.compose(wrist, wristQuaternion, scale.set(WRIST_CUFF * size, WRIST_CUFF * size, WRIST_CUFF * size * 1.8)));
        const q = this.caseRoot.quaternion;
        loop.copy(LOOP).multiplyScalar(caseSize).applyQuaternion(q).add(this.caseRoot.position);
        this.chain.setMatrixAt(1, matrix.compose(loop, q, scale.setScalar(CASE_CUFF * caseSize)));
        // The chain runs from the cuff's rim nearest the case to the top of the case's cuff.
        to.copy(loop).addScaledVector(up.set(0, 1, 0).applyQuaternion(q), CASE_CUFF * caseSize);
        reach.subVectors(to, wrist); reach.addScaledVector(axis, -reach.dot(axis));
        if (reach.lengthSq() < 1e-8) reach.set(0, -1, 0);
        from.copy(wrist).addScaledVector(reach.normalize(), WRIST_CUFF * size);
        span.subVectors(to, from);
        // Its slack bows out and down; the bow's depth makes a parabola about `CHAIN` long.
        bow.set(wrist.x - rat.x, 0, wrist.z - rat.z);
        if (bow.lengthSq() < 1e-8) bow.set(1, 0, 0);
        bow.normalize(); bow.y = -.25;
        // A parabola of span L and depth s runs about √(L² + 16s²/3) long: deep enough that the chain is `CHAIN` long.
        const length = span.length(), chain = Math.max(length, CHAIN * size), sag = Math.sqrt((chain * chain - length * length) * 3 / 16);
        const links = Math.max(1, Math.min(MAX_LINKS, Math.round(chain / LINK_PITCH))), ring = LINK * size;
        for (let i = 0; i < links; i++) {
            const t = (i + .5) / links;
            point.copy(from).addScaledVector(span, t).addScaledVector(bow, sag * 4 * t * (1 - t));
            tangent.copy(span).addScaledVector(bow, sag * 4 * (1 - 2 * t));
            if (tangent.lengthSq() < 1e-10) tangent.copy(Y);
            turn.setFromUnitVectors(Y, tangent.normalize());
            if (i % 2) turn.multiply(LINK_TWIST);
            this.chain.setMatrixAt(2 + i, matrix.compose(point, turn, scale.set(ring, ring * 1.6, ring)));
        }
        this.chain.count = 2 + links;
        this.chain.instanceMatrix.needsUpdate = true;
        // The steel takes the case's heat only on the beat.
        this.steel.emissive.copy(STEEL_BASE).lerp(COAL, .55 * flare);
    }

    private emit(dt: number, p: THREE.Vector3, shown: boolean, glow: number, flare: number, pinged: boolean): void {
        const c = this.caseRoot.position, h = this.heat;
        // A faint haze of heat over the case only; the rat gets embers, not a shimmer.
        this.sparks.shimmer(c.x, c.y + .6, c.z, .9, 1.05, (.3 + .15 * glow + .5 * flare) * h);
        this.emberDue += dt * 16 * h + (pinged && shown ? 14 : 0);
        this.caseEmberDue += dt * 9 * h + (pinged ? 8 : 0);
        this.smokeDue += dt * 3.5 * h;
        for (; this.emberDue >= 1; this.emberDue--) {
            if (!shown) continue;
            const a = Math.random() * Math.PI * 2, r = .2 + Math.random() * .2, out = .1 + Math.random() * .2, fast = flare > .5 ? 1.6 : 1;
            this.sparks.emit(SPARK_EMBER, p.x + Math.cos(a) * r, p.y + .35 + Math.random() * 1.35, p.z + Math.sin(a) * r,
                Math.cos(a) * out * fast, (.7 + Math.random() * .6) * fast, Math.sin(a) * out * fast, .6 + Math.random() * .5, .04 + Math.random() * .035);
        }
        for (; this.caseEmberDue >= 1; this.caseEmberDue--) {
            const a = Math.random() * Math.PI * 2;
            this.sparks.emit(SPARK_EMBER, c.x + (Math.random() - .5) * .8, c.y + (Math.random() - .3) * .6, c.z + (Math.random() - .5) * .35,
                Math.cos(a) * .15, .5 + Math.random() * .6, Math.sin(a) * .15, .5 + Math.random() * .5, .035 + Math.random() * .03);
        }
        for (; this.smokeDue >= 1; this.smokeDue--) {
            this.sparks.emit(SPARK_SMOKE, c.x + (Math.random() - .5) * .6, c.y + .36, c.z + (Math.random() - .5) * .25,
                (Math.random() - .5) * .1, .45 + Math.random() * .25, (Math.random() - .5) * .1, 1.1 + Math.random() * .5, .16 + Math.random() * .08);
        }
    }
}
