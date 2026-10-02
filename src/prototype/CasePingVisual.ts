import * as THREE from 'three';
import type { CaseState } from '../shared/chaosState';
import { CasePingAudio } from '../audio/CasePingAudio';
import { CASE_GOLD } from './caseGold';

/** Seconds the world flare, ring and column last; the HUD's last-seen glow halves every `FADE` s after a ping. */
const LIFE = 1.8, RING = 1.2, FADE = 1.1;
/** The column's height in units: tall enough to stand over every roof. */
const COLUMN = 90;
const vertex = `varying vec2 vUv;varying vec3 n;varying vec3 eye;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;}`;
const fragment = (body: string) => `uniform vec3 color;uniform float alpha;varying vec2 vUv;varying vec3 n;varying vec3 eye;void main(){${body}\n#include <colorspace_fragment>\n}`;
const material = (body: string) => new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {color: {value: new THREE.Color(CASE_GOLD)}, alpha: {value: 0}},
    vertexShader: vertex, fragmentShader: fragment(body),
});

/** The case ping (clarity batch, protocol 29). A carried case is not marked between pings; when the authority pings it
 * (`CaseState.ping`), everyone else sees, through every wall, a gold flare and a spreading ring at the case and a short
 * light column over it that reads across the city, and hears a ping from its direction. The carrier gets a soft tick
 * (and, through `update`'s result, an edge flash) instead. Emissive additive shapes only; no scene lights. */
export class CasePingVisual {
    readonly root = new THREE.Group();
    private readonly flare: THREE.Mesh;
    private readonly ring: THREE.Mesh;
    private readonly column: THREE.Mesh;
    private readonly materials: THREE.ShaderMaterial[];
    private readonly audio: CasePingAudio;
    private readonly ear = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    /** The latest ping presented (`CaseState.ping.at`) and when its world effect started (performance time). */
    private pingAt = NaN;
    private startedAt = -Infinity;
    /** 1 at a ping, fading toward 0 until the next: the HUD's last-seen marker and line follow it. */
    fresh = 0;

    constructor(scene: THREE.Scene, context?: AudioContext) {
        this.audio = new CasePingAudio(context);
        const plane = new THREE.PlaneGeometry(1, 1);
        // A hot white core in a gold bloom, with a short horizontal glint.
        const flare = material(`vec2 d=vUv-.5;float r=length(d)*2.;float a=exp(-r*r*5.)+.9*exp(-r*r*45.)+.55*exp(-abs(d.y)*60.)*max(0.,1.-abs(d.x)*2.);
            gl_FragColor=vec4(mix(color,vec3(1.),exp(-r*r*40.)),min(1.,a)*alpha);`);
        const ring = material(`float r=length(vUv-.5)*2.;float a=smoothstep(.8,.93,r)*(1.-smoothstep(.95,1.,r));gl_FragColor=vec4(color,a*alpha);`);
        // Brightest along the beam's middle and at its foot, gone at the top.
        const column = material(`float core=pow(abs(dot(normalize(n),normalize(eye))),1.5);float a=pow(1.-vUv.y,1.6)*(.25+.75*core);
            gl_FragColor=vec4(mix(color,vec3(1.),.25*core),a*alpha);`);
        this.materials = [flare, ring, column];
        this.flare = new THREE.Mesh(plane, flare);
        this.ring = new THREE.Mesh(plane, ring);
        this.column = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1, 14, 1, true).translate(0, .5, 0), column);
        for (const mesh of [this.column, this.ring, this.flare]) {mesh.frustumCulled = false; mesh.renderOrder = 2001; mesh.raycast = () => {}; this.root.add(mesh);}
        this.root.name = 'case-ping'; this.root.userData.noNoir = true; this.root.visible = false;
        // In the scene from the start, hidden, so the load's warm-up links its programs, not the first ping.
        scene.add(this.root);
    }

    /** Each frame, with the case, your id, the authority's time now (`serverNow`) and wall time. Returns 'mine' on the
     * frame your own carried case pings, 'theirs' when someone else's does, otherwise null. A ping already over a
     * second old when it arrives (joining mid-carry) is shown on the HUD but not replayed. */
    update(c: CaseState, myId: string, serverNow: number, camera: THREE.Camera, wall: number): 'mine' | 'theirs' | null {
        const ping = c.owner ? c.ping : undefined;
        let started: 'mine' | 'theirs' | null = null;
        this.fresh = ping ? Math.pow(.5, Math.max(0, serverNow - ping.at) / 1000 / FADE) : 0;
        if (ping && ping.at !== this.pingAt) {
            this.pingAt = ping.at;
            if (serverNow - ping.at < 1000) {
                started = c.owner === myId ? 'mine' : 'theirs';
                camera.getWorldPosition(this.ear);
                if (started === 'mine') this.audio.tick();
                else {
                    this.root.position.set(ping.p.x, ping.p.y, ping.p.z); this.startedAt = wall;
                    const dx = ping.p.x - this.ear.x, dy = ping.p.y - this.ear.y, dz = ping.p.z - this.ear.z, distance = Math.hypot(dx, dy, dz);
                    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
                    this.audio.ping(distance, distance > 1 ? (dx * this.right.x + dy * this.right.y + dz * this.right.z) / distance : 0);
                }
            }
        }
        // A case that comes loose ends any flare in flight; the loose case's own glow takes over.
        const t = (wall - this.startedAt) / 1000;
        this.root.visible = !!c.owner && c.owner !== myId && t >= 0 && t < LIFE;
        if (!this.root.visible) return started;
        camera.getWorldPosition(this.ear);
        const distance = this.ear.distanceTo(this.root.position);
        // World units per screen pixel at the ping, so it stays obvious from across the city.
        const pixel = 2 * distance / (Math.max(1, window.innerHeight) * camera.projectionMatrix.elements[5]!);
        const rise = Math.min(1, t / .06), r = Math.min(1, t / RING);
        this.flare.quaternion.copy(camera.quaternion); this.ring.quaternion.copy(camera.quaternion);
        this.flare.scale.setScalar(Math.max(4, 150 * pixel) * (1.25 - .25 * rise));
        this.materials[0]!.uniforms.alpha.value = rise * Math.exp(-Math.max(0, t - .06) / .45);
        this.ring.scale.setScalar(Math.max(18, 360 * pixel) * (1 - Math.pow(1 - r, 3)));
        this.materials[1]!.uniforms.alpha.value = t < RING ? Math.pow(1 - r, 1.4) : 0;
        this.column.scale.set(Math.max(1, 8 * pixel), COLUMN, Math.max(1, 8 * pixel));
        this.materials[2]!.uniforms.alpha.value = rise * Math.pow(1 - Math.max(0, t - .06) / (LIFE - .06), 2);
        return started;
    }
    /** The case changed hands or the room reset: forget the presented ping. */
    clear(): void {this.pingAt = NaN; this.startedAt = -Infinity; this.fresh = 0; this.root.visible = false;}
    dispose(): void {
        this.root.removeFromParent();
        this.flare.geometry.dispose(); this.column.geometry.dispose();
        for (const m of this.materials) m.dispose();
    }
}
