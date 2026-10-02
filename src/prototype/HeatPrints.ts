import * as THREE from 'three';

const PRINTS = 24;
/** Seconds a print glows; stride (units) between prints; how far apart the paws fall; camera range (units: the
 * camera rides some 7 behind its own rat), fading out over the last `FADE`. */
const LIFE = 1, STRIDE = .5, GAIT = .15, RANGE = 22, FADE = 4;

/** The hot-case carrier's glowing red paw prints (Tyler, 2 October): left on the ground as it walks, fading over a
 * second, drawn only within `RANGE` of the viewer. A bounded ring of flat instanced quads, one draw, written in place. */
export class HeatPrints {
    readonly mesh: THREE.Mesh;
    private readonly geometry = new THREE.InstancedBufferGeometry();
    /** Per print: x, y, z, yaw. */
    private readonly prints = new Float32Array(PRINTS * 4);
    private readonly fades = new Float32Array(PRINTS);
    private readonly born = new Float32Array(PRINTS).fill(-Infinity);
    private readonly printAttribute = new THREE.InstancedBufferAttribute(this.prints, 4).setUsage(THREE.DynamicDrawUsage);
    private readonly fadeAttribute = new THREE.InstancedBufferAttribute(this.fades, 1).setUsage(THREE.DynamicDrawUsage);
    private next = 0; private side = 1; private time = 0; private travelled = 0;
    private lastX = 0; private lastZ = 0; private tracking = false;

    constructor() {
        const quad = new THREE.PlaneGeometry(1, 1);
        this.geometry.setIndex(quad.getIndex());
        this.geometry.setAttribute('position', quad.getAttribute('position'));
        this.geometry.setAttribute('uv', quad.getAttribute('uv'));
        this.geometry.setAttribute('aPrint', this.printAttribute);
        this.geometry.setAttribute('aFade', this.fadeAttribute);
        this.geometry.instanceCount = PRINTS;
        const material = new THREE.ShaderMaterial({
            transparent: true, depthTest: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
            vertexShader: `attribute vec4 aPrint;attribute float aFade;varying vec2 vUv;varying float vFade;
                void main(){vUv=uv;vFade=aFade;
                vec2 l=position.xy*vec2(.36,.46);float c=cos(aPrint.w),s=sin(aPrint.w);
                vec3 w=vec3(aPrint.x+l.x*c+l.y*s,aPrint.y,aPrint.z-l.x*s+l.y*c);
                gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
            fragmentShader: `varying vec2 vUv;varying float vFade;
                float blob(vec2 q,vec2 at,float r){return 1.-smoothstep(r*.7,r,length(q-at));}
                void main(){
                    if(vFade<=0.)discard;
                    vec2 q=vUv-.5;
                    // A heel pad and four toes, in a soft glow.
                    float paw=blob(q*vec2(1.,1.3),vec2(0.,-.14),.19);
                    paw=max(paw,blob(q,vec2(-.21,.11),.08));paw=max(paw,blob(q,vec2(-.075,.24),.08));
                    paw=max(paw,blob(q,vec2(.075,.24),.08));paw=max(paw,blob(q,vec2(.21,.11),.08));
                    float halo=1.-smoothstep(.05,.5,length(q*vec2(1.,.85)));
                    // Burns at full for the first half of its life, then fades to nothing.
                    float k=smoothstep(0.,.55,vFade),a=(paw+halo*halo*.45)*k;if(a<=.002)discard;
                    gl_FragColor=vec4(mix(vec3(1.,.06,.015),vec3(1.,.42,.12),paw*vFade),a);
                }`,
        });
        this.mesh = new THREE.Mesh(this.geometry, material);
        this.mesh.name = 'hot-case-paw-prints'; this.mesh.frustumCulled = false; this.mesh.raycast = () => {};
        this.mesh.visible = false;
    }

    /** Per frame for the carrier at `x,y,z` (its feet). `grounded`: walking on the ground (no print in the air).
     * `viewer`: the camera's world position. `strength` scales the glow (the heartbeat). */
    update(dt: number, x: number, y: number, z: number, grounded: boolean, viewer: THREE.Vector3, strength: number): void {
        this.time += dt;
        const near = (x - viewer.x) ** 2 + (y - viewer.y) ** 2 + (z - viewer.z) ** 2 < (RANGE + 1) ** 2;
        if (!this.tracking) { this.lastX = x; this.lastZ = z; this.tracking = true; this.travelled = 0; }
        const dx = x - this.lastX, dz = z - this.lastZ, step = Math.hypot(dx, dz);
        // A teleport (respawn, warp) leaves no trail behind it.
        if (step > 3) this.travelled = 0;
        else if (grounded && near && step > 0) {
            this.travelled += step;
            if (this.travelled >= STRIDE) {
                this.travelled %= STRIDE;
                const yaw = Math.atan2(dx, dz), i = this.next, j = i * 4;
                this.side = -this.side;
                this.prints[j] = x + Math.cos(yaw) * GAIT * this.side; this.prints[j + 1] = y + .02;
                this.prints[j + 2] = z - Math.sin(yaw) * GAIT * this.side; this.prints[j + 3] = yaw;
                this.born[i] = this.time; this.next = (i + 1) % PRINTS;
                this.printAttribute.needsUpdate = true;
            }
        }
        this.lastX = x; this.lastZ = z;
        let any = false;
        for (let i = 0; i < PRINTS; i++) {
            const age = this.time - this.born[i], j = i * 4;
            let fade = age < LIFE ? 1 - age / LIFE : 0;
            if (fade > 0) {
                const d = Math.hypot(this.prints[j] - viewer.x, this.prints[j + 1] - viewer.y, this.prints[j + 2] - viewer.z);
                fade *= (1 - THREE.MathUtils.smoothstep(d, RANGE - FADE, RANGE)) * strength;
            }
            this.fades[i] = fade; any ||= fade > 0;
        }
        this.fadeAttribute.needsUpdate = any;
        this.mesh.visible = any;
    }

    clear(): void { this.born.fill(-Infinity); this.tracking = false; this.mesh.visible = false; }

    dispose(): void { this.mesh.removeFromParent(); this.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
