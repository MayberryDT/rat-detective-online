import * as THREE from 'three';

/** Kinds of heat billboard, one draw for all: a rising ember, a thin smoke wisp, a heat shimmer. */
export const SPARK_EMBER = 0, SPARK_SMOKE = 1;
const SHIMMER = 2;
const PARTICLES = 56, SHIMMERS = 2, SLOTS = PARTICLES + SHIMMERS;

/** The hot case's embers, smoke wisps and heat shimmer (Tyler, 2 October): camera-facing quads in one instanced draw,
 * premultiplied so embers and shimmer add light while smoke darkens. Bounded pool, written in place every frame;
 * no lights, no screen-space pass. */
export class HeatSparks {
    readonly mesh: THREE.Mesh;
    private readonly geometry = new THREE.InstancedBufferGeometry();
    private readonly centers = new Float32Array(SLOTS * 3);
    /** Per slot: width, height, kind, strength. */
    private readonly shapes = new Float32Array(SLOTS * 4);
    private readonly centerAttribute = new THREE.InstancedBufferAttribute(this.centers, 3).setUsage(THREE.DynamicDrawUsage);
    private readonly shapeAttribute = new THREE.InstancedBufferAttribute(this.shapes, 4).setUsage(THREE.DynamicDrawUsage);
    private readonly p = new Float32Array(PARTICLES * 3);
    private readonly v = new Float32Array(PARTICLES * 3);
    private readonly age = new Float32Array(PARTICLES);
    private readonly life = new Float32Array(PARTICLES);
    private readonly size = new Float32Array(PARTICLES);
    private readonly kind = new Uint8Array(PARTICLES);
    private live = 0;
    private shimmers = 0;
    private readonly time = { value: 0 };

    constructor() {
        const quad = new THREE.PlaneGeometry(1, 1);
        this.geometry.setIndex(quad.getIndex());
        this.geometry.setAttribute('position', quad.getAttribute('position'));
        this.geometry.setAttribute('uv', quad.getAttribute('uv'));
        this.geometry.setAttribute('aCenter', this.centerAttribute);
        this.geometry.setAttribute('aShape', this.shapeAttribute);
        this.geometry.instanceCount = 0;
        const material = new THREE.ShaderMaterial({
            uniforms: { heatTime: this.time },
            transparent: true, depthTest: true, depthWrite: false, fog: false, toneMapped: false,
            blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
            vertexShader: `attribute vec3 aCenter;attribute vec4 aShape;varying vec2 vUv;varying vec2 vShape;varying float vSeed;
                void main(){vUv=uv;vShape=aShape.zw;vSeed=aCenter.x*1.7+aCenter.z*2.3;
                vec4 mv=viewMatrix*vec4(aCenter,1.);mv.xy+=position.xy*aShape.xy;gl_Position=projectionMatrix*mv;}`,
            fragmentShader: `uniform float heatTime;varying vec2 vUv;varying vec2 vShape;varying float vSeed;
                void main(){
                    vec2 q=vUv-.5;float r=length(q),k=vShape.y;
                    if(vShape.x<.5){
                        // An ember: a white-hot core in an orange-red glow.
                        float glow=smoothstep(.5,.05,r);glow*=glow;
                        gl_FragColor=vec4((vec3(1.,.3,.06)*glow+vec3(1.,.85,.5)*smoothstep(.16,0.,r))*k,0.);
                    }else if(vShape.x<1.5){
                        // A smoke wisp: a soft dark puff.
                        float a=smoothstep(.5,.1,r)*k*.32;
                        gl_FragColor=vec4(vec3(.1,.075,.065)*a,a);
                    }else{
                        // Heat shimmer: thin wavering bands rising through a soft column.
                        float column=(1.-smoothstep(.18,.5,abs(q.x)))*smoothstep(-.5,-.3,q.y)*(1.-smoothstep(0.,.5,q.y));
                        float wave=sin(q.y*34.-heatTime*7.+sin(q.x*10.+heatTime*2.6+vSeed)*2.4);
                        float a=column*(.2+.8*pow(.5+.5*wave,3.))*k;
                        gl_FragColor=vec4(vec3(1.,.16,.03)*a*.24,0.);
                    }
                }`,
        });
        this.mesh = new THREE.Mesh(this.geometry, material);
        this.mesh.name = 'hot-case-heat-sparks'; this.mesh.frustumCulled = false; this.mesh.raycast = () => {};
        this.mesh.visible = false;
    }

    /** This frame's shimmer column (call before `step`; at most two). */
    shimmer(x: number, y: number, z: number, width: number, height: number, strength: number): void {
        if (this.shimmers >= SHIMMERS || strength <= 0) return;
        this.write(this.shimmers++, x, y, z, width, height, SHIMMER, strength);
    }

    emit(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number): void {
        if (this.live >= PARTICLES) return;
        const i = this.live++, j = i * 3;
        this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
        this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.kind[i] = kind;
    }

    /** Advance the particles by `dt` (s), then draw them with this frame's shimmers. Reduced motion clears them
     * instead (`clear`), so nothing here is still. */
    step(dt: number): void {
        this.time.value = (this.time.value + dt) % 1000;
        let slot = this.shimmers;
        for (let i = 0; i < this.live;) {
            this.age[i] += dt;
            if (this.age[i] >= this.life[i]) { this.remove(i); continue; }
            const j = i * 3, age = this.age[i], t = age / this.life[i], ember = this.kind[i] === SPARK_EMBER;
            // Embers flutter sideways as they climb and slow; smoke drifts and spreads.
            const flutter = ember ? Math.sin(age * 11 + i * 1.7) * .6 : Math.sin(age * 2.3 + i) * .15;
            this.p[j] += (this.v[j] + flutter) * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += (this.v[j + 2] - flutter * .7) * dt;
            if (ember) this.v[j + 1] *= 1 - Math.min(1, dt * .8);
            const size = ember ? this.size[i] * (1 - t * .5) : this.size[i] * (1 + t * 1.6);
            const strength = ember ? (1 - t) * (.75 + .25 * Math.sin(age * 37 + i)) : Math.sin(Math.PI * t);
            this.write(slot++, this.p[j], this.p[j + 1], this.p[j + 2], size, size, this.kind[i], strength);
            i++;
        }
        this.geometry.instanceCount = slot;
        // A few hundred floats: the whole buffer uploads, so no update ranges pile up while hidden.
        this.centerAttribute.needsUpdate = this.shapeAttribute.needsUpdate = slot > 0;
        this.mesh.visible = slot > 0;
        this.shimmers = 0;
    }

    clear(): void { this.live = 0; this.shimmers = 0; this.geometry.instanceCount = 0; this.mesh.visible = false; }

    dispose(): void { this.mesh.removeFromParent(); this.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }

    private write(slot: number, x: number, y: number, z: number, width: number, height: number, kind: number, strength: number): void {
        const c = slot * 3, s = slot * 4;
        this.centers[c] = x; this.centers[c + 1] = y; this.centers[c + 2] = z;
        this.shapes[s] = width; this.shapes[s + 1] = height; this.shapes[s + 2] = kind; this.shapes[s + 3] = strength;
    }

    /** Swap the last live particle into `i`. */
    private remove(i: number): void {
        const last = --this.live;
        if (i === last) return;
        const j = i * 3, k = last * 3;
        for (let a = 0; a < 3; a++) { this.p[j + a] = this.p[k + a]!; this.v[j + a] = this.v[k + a]!; }
        this.age[i] = this.age[last]!; this.life[i] = this.life[last]!; this.size[i] = this.size[last]!; this.kind[i] = this.kind[last]!;
    }
}
