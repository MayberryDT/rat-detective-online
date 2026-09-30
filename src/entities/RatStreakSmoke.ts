import * as THREE from 'three';

const PUFFS = 56;
/** Per streak tier (1: 3–4 kills, 2: 5–7, 3: 8 or more): seconds between puffs, puff life (s),
 * final puff size (world units), opacity, rise speed and the chance of an ember per puff. */
const TIERS = [
    { every: .13, life: 1.5, size: .42, alpha: .4, rise: 1, ember: 0 },
    { every: .085, life: 1.9, size: .56, alpha: .48, rise: 1.15, ember: .3 },
    { every: .055, life: 2.3, size: .72, alpha: .55, rise: 1.3, ember: .5 },
] as const;
/** Your own rat's smoke is fainter, so it never clouds the crosshair. */
const OWN_ALPHA = .45;
/** The crown's top and hat band, in the hat pivot's frame (see RatModel). */
const CROWN_Y = .36, BAND_Y = .07, BAND_R = .33;
/** A light shared breeze, so every wisp leans the same way. */
const WIND_X = .22, WIND_Z = .1;

const QUAD = new THREE.PlaneGeometry(1, 1);
/** Unlit and fog-free: puffs are camera-facing quads sized per instance. Every rat's copy shares one program. */
const SMOKE_SHADER = {
    vertexShader: `attribute vec4 puff;attribute vec2 look;varying vec2 vUv;varying vec2 vLook;
void main(){vUv=uv;vLook=look;vec4 mv=modelViewMatrix*vec4(puff.xyz,1.);mv.xy+=position.xy*puff.w;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec2 vUv;varying vec2 vLook;
void main(){vec2 p=vUv*2.-1.;float r=dot(p,p);
if(vLook.y>.5){gl_FragColor=vec4(1.,.36,.12,smoothstep(1.,.1,r)*vLook.x);}
else{float wisp=.72+.28*sin(p.x*4.+p.y*6.);gl_FragColor=vec4(.74,.72,.68,smoothstep(1.,.12,r)*wisp*vLook.x);}
if(gl_FragColor.a<.004)discard;}`,
};

interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; alpha: number; ember: boolean; seed: number }

/** A kill streak of 3 or more makes the fedora smoulder: a thin wisp of smoke from the
 * crown, thicker at 5 with the odd ember from the hat band, heavier again at 8. Puffs
 * live in world space, so a running rat trails its smoke. One pooled instanced draw per
 * rat, in the scene from the start and hidden while idle (the warm-up compiles it). */
export class RatStreakSmoke {
    private readonly puffs: Puff[] = Array.from({ length: PUFFS }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: Infinity, life: 1, size: 0, alpha: 0, ember: false, seed: 0 }));
    private readonly puffData = new Float32Array(PUFFS * 4);
    private readonly lookData = new Float32Array(PUFFS * 2);
    private readonly geometry = new THREE.InstancedBufferGeometry();
    private readonly puffAttribute = new THREE.InstancedBufferAttribute(this.puffData, 4).setUsage(THREE.DynamicDrawUsage);
    private readonly lookAttribute = new THREE.InstancedBufferAttribute(this.lookData, 2).setUsage(THREE.DynamicDrawUsage);
    private readonly root = new THREE.Group();
    private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    private readonly point = new THREE.Vector3();
    private cursor = 0;
    private clock = 0;
    private live = false;

    constructor(scene: THREE.Scene, private readonly hat: THREE.Object3D | undefined) {
        // Each rat owns its quad's buffers (cloned, four corners), so disposing one rat frees only its own.
        this.geometry.setIndex(QUAD.index!.clone());
        this.geometry.setAttribute('position', QUAD.getAttribute('position').clone());
        this.geometry.setAttribute('uv', QUAD.getAttribute('uv').clone());
        this.geometry.setAttribute('puff', this.puffAttribute);
        this.geometry.setAttribute('look', this.lookAttribute);
        this.geometry.instanceCount = 0;
        this.mesh = new THREE.Mesh(this.geometry, new THREE.ShaderMaterial({ ...SMOKE_SHADER, transparent: true, depthWrite: false, toneMapped: false }));
        // Drawn before other see-through things, so nameplates stay on top of the smoke.
        this.mesh.frustumCulled = false; this.mesh.renderOrder = -1; this.mesh.raycast = () => {};
        this.root.name = 'streak-smoke'; this.root.userData.noNoir = true; this.root.visible = false; this.root.add(this.mesh);
        scene.add(this.root);
    }

    /** `tier` from `streakTier`; `own` for the local player's rat. Call once per alive frame. */
    update(dt: number, tier: number, own: boolean): void {
        if (tier > 0 && this.hat) {
            const t = TIERS[Math.min(tier, TIERS.length) - 1]!;
            this.clock += dt;
            while (this.clock >= t.every) { this.clock -= t.every; this.spawn(t, own); }
        } else this.clock = 0;
        if (!this.live) return;
        let n = 0;
        for (let i = 0; i < PUFFS; i++) {
            const p = this.puffs[i]!;
            if (p.age >= p.life) continue;
            p.age += dt;
            if (p.age >= p.life) continue;
            const k = p.age / p.life;
            // Smoke slows as it rises and curls sideways; embers climb, then wink out.
            const drag = Math.exp(-(p.ember ? 1.2 : 1.6) * dt);
            p.vx = p.vx * drag + (p.ember ? 0 : Math.sin(p.age * 3.1 + p.seed) * .45 * dt);
            p.vz = p.vz * drag + (p.ember ? 0 : Math.cos(p.age * 2.3 + p.seed) * .45 * dt);
            p.vy *= p.ember ? 1 : Math.exp(-.35 * dt);
            p.x += (p.vx + (p.ember ? 0 : WIND_X * k)) * dt; p.y += p.vy * dt; p.z += (p.vz + (p.ember ? 0 : WIND_Z * k)) * dt;
            const i4 = n * 4, i2 = n * 2;
            this.puffData[i4] = p.x; this.puffData[i4 + 1] = p.y; this.puffData[i4 + 2] = p.z;
            this.puffData[i4 + 3] = p.ember ? p.size * (1 - k * .6) : p.size * (.22 + .78 * Math.sqrt(k));
            // Fades in quickly and out slowly; an ember flickers.
            this.lookData[i2] = p.alpha * Math.min(1, k * 6) * (1 - k) * (p.ember ? .7 + .3 * Math.sin(p.age * 40 + p.seed) : 1);
            this.lookData[i2 + 1] = p.ember ? 1 : 0;
            n++;
        }
        this.live = n > 0;
        this.geometry.instanceCount = n;
        this.root.visible = this.live;
        if (this.live) { this.puffAttribute.needsUpdate = true; this.lookAttribute.needsUpdate = true; }
    }

    private spawn(t: typeof TIERS[number], own: boolean): void {
        const hat = this.hat!, alpha = own ? OWN_ALPHA : 1;
        const smoke = this.next(), seed = Math.random() * 6.28;
        // The hat's world matrix from the last drawn frame: exact enough for smoke.
        this.point.set((Math.random() - .5) * .16, CROWN_Y, (Math.random() - .5) * .12).applyMatrix4(hat.matrixWorld);
        this.emit(smoke, t.rise * (.85 + Math.random() * .3), t.life * (.85 + Math.random() * .3), t.size * (.85 + Math.random() * .3), t.alpha * alpha, false, seed);
        if (t.ember && Math.random() < t.ember) {
            const a = Math.random() * 6.28, ember = this.next();
            this.point.set(Math.cos(a) * BAND_R, BAND_Y, Math.sin(a) * BAND_R * .86).applyMatrix4(hat.matrixWorld);
            this.emit(ember, 1.4 + Math.random() * .8, .45 + Math.random() * .35, .05 + Math.random() * .03, alpha, true, seed);
        }
        this.live = true;
    }

    private next(): Puff { const p = this.puffs[this.cursor]!; this.cursor = (this.cursor + 1) % PUFFS; return p; }

    private emit(p: Puff, rise: number, life: number, size: number, alpha: number, ember: boolean, seed: number): void {
        p.x = this.point.x; p.y = this.point.y; p.z = this.point.z;
        p.vx = (Math.random() - .5) * (ember ? .9 : .12); p.vy = rise; p.vz = (Math.random() - .5) * (ember ? .9 : .12);
        p.age = 0; p.life = life; p.size = size; p.alpha = alpha; p.ember = ember; p.seed = seed;
    }

    /** Death, respawn or a reset: the smoke goes at once. */
    clear(): void {
        for (const p of this.puffs) p.age = Infinity;
        this.clock = 0; this.live = false; this.geometry.instanceCount = 0; this.root.visible = false;
    }

    dispose(): void { this.root.removeFromParent(); this.geometry.dispose(); this.mesh.material.dispose(); }
}
