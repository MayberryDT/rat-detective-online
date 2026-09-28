import * as THREE from 'three';
import { MAX_HP } from '../shared/networkProtocol';

const HEIGHT = 128;
const WORLD_HEIGHT = 0.6;
const FONT = '600 30px Outfit, Arial, sans-serif';
const CREAM = '#e9e1cc';
const RED = '#e2382e';
const PIP_W = 30, PIP_H = 9, PIP_GAP = 7, PIP_SLANT = 6, PIP_Y = 70;
/** Seconds a lost pip flashes before draining, and a regained pip takes to fill. */
const LOSS_SECONDS = 0.45, GAIN_SECONDS = 0.3;
const GOLD = '#f3cf6f';
/** The Hunch eye beside your own pips: world size, and its centre relative to the plate's anchor (bottom centre). */
const EYE_SIZE = 0.42, GLOW_SIZE = 1.25, EYE_GAP = 0.26;
/** Seconds for the eye to open, and to shut then fade. */
const EYE_OPEN = 0.4, EYE_SHUT = 0.2, EYE_FADE = 0.35;
/** Nameplate brightness shared by every rat; Blackout dims it with the city. */
export const NAMEPLATE_LIGHT = { value: 1 };

/** Noir nameplate: the rat's name in spaced small caps over a row of slanted
 * pips, one per hit point, like tabs on a case file. Lost pips flash, shake and
 * drain to an empty outline; the last one burns red. Dead rats' names dim and
 * are struck through. The canvas only redraws while something changes. */
export class RatBillboard {
    public sprite: THREE.Sprite;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;

    private name: string;
    private readonly nameWidth: number;
    private health: number;
    /** Per pip: seconds since it was lost (negative: not animating) and since it was regained. */
    private readonly lost = new Array<number>(MAX_HP).fill(-1);
    private readonly gained = new Array<number>(MAX_HP).fill(-1);
    private animating = false;
    private disposed = false;
    /** The Hunch (your own plate only): eye and glow sprites, and the open/shut clock. */
    private eye?: THREE.Sprite;
    private glow?: THREE.Sprite;
    private hunch = false;
    private supercharged = false;
    private eyeAge = Infinity;
    private eyeTime = 0;

    constructor(name: string, initialHealth: number = MAX_HP) {
        this.name = name.toUpperCase();
        this.health = initialHealth;

        this.canvas = document.createElement('canvas');
        this.canvas.height = HEIGHT;
        this.ctx = this.canvas.getContext('2d')!;
        this.ctx.font = FONT;
        this.nameWidth = typeof this.ctx.measureText === 'function' ? this.ctx.measureText(this.name).width + this.name.length * 3 : this.name.length * 21;
        this.canvas.width = Math.max(256, Math.min(1024, Math.ceil(this.nameWidth + 48)));
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;
        this.texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            depthTest: true, // Walls hide it
            depthWrite: false,
            toneMapped: false,
        });
        this.sprite = new THREE.Sprite(material);
        this.sprite.scale.set(this.canvas.width / HEIGHT * WORLD_HEIGHT, WORLD_HEIGHT, 1);
        this.sprite.center.set(0.5, 0); // Sits on the head

        this.draw();
        // The web font may arrive after the first draw.
        void document.fonts?.load?.(FONT).then(() => { if (!this.disposed) this.draw(); }, () => {});
    }

    /** The Hunch on your own plate: a gold eye opens beside the pips with a soft pulsing glow
     * and the pips burn gold; on losing it the eye shuts and fades. */
    public setHunch(on: boolean, supercharged = false): void {
        this.supercharged = supercharged;
        if (on === this.hunch) return;
        this.hunch = on; this.eyeAge = 0;
        if (on) this.buildEye();
        this.draw();
    }

    public setHealth(hp: number) {
        // Dead: the eye resets without ceremony so the next life opens it again.
        if (hp <= 0 && this.hunch) { this.hunch = false; this.eyeAge = Infinity; if (this.eye) this.eye.visible = this.glow!.visible = false; }
        if (this.health === hp) return;
        for (let i = 0; i < MAX_HP; i++) {
            const was = i < this.health, now = i < hp;
            if (was && !now) { this.lost[i] = 0; this.gained[i] = -1; }
            else if (!was && now) { this.gained[i] = 0; this.lost[i] = -1; }
        }
        this.health = hp;
        this.animating = hp > 0;
        if (!this.animating) { this.lost.fill(-1); this.gained.fill(-1); }
        this.draw();
    }

    /** Advance pip animations; redraws only while one is running. */
    public update(dt: number): void {
        if (this.sprite.material.opacity !== NAMEPLATE_LIGHT.value) this.sprite.material.opacity = NAMEPLATE_LIGHT.value;
        this.animateEye(dt);
        if (!this.animating || this.disposed) return;
        let running = false;
        const advance = (times: number[], i: number, limit: number) => {
            const t = times[i]!;
            if (t < 0) return;
            times[i] = t + dt >= limit ? -1 : t + dt;
            running ||= times[i]! >= 0;
        };
        for (let i = 0; i < MAX_HP; i++) { advance(this.lost, i, LOSS_SECONDS); advance(this.gained, i, GAIN_SECONDS); }
        this.animating = running;
        this.draw();
    }

    private buildEye(): void {
        if (this.eye || typeof document === 'undefined') return;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const c = canvas.getContext('2d');
        if (!c || typeof c.beginPath !== 'function') return;
        // Hat brim over a wide-open eye with a gold iris: the detective's hunch.
        c.lineJoin = 'round';
        c.fillStyle = '#0b0810'; c.strokeStyle = GOLD; c.lineWidth = 4;
        c.beginPath(); c.moveTo(10, 44); c.quadraticCurveTo(64, 8, 118, 44); c.quadraticCurveTo(64, 30, 10, 44); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#f5ecd2'; c.strokeStyle = '#1a1208'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(16, 72); c.quadraticCurveTo(64, 34, 112, 72); c.quadraticCurveTo(64, 108, 16, 72); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#c8922e'; c.beginPath(); c.arc(64, 72, 17, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#050308'; c.beginPath(); c.arc(64, 72, 8, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(70, 66, 4, 0, Math.PI * 2); c.fill();
        const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
        const g = glowCanvas.getContext('2d')!, gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,222,140,1)'); gradient.addColorStop(.3, 'rgba(245,185,60,.7)'); gradient.addColorStop(1, 'rgba(240,160,40,0)');
        g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
        const sprite = (image: HTMLCanvasElement, additive: boolean) => {
            const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
            const made = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
                ...(additive ? { blending: THREE.AdditiveBlending } : {}) }));
            made.layers.mask = this.sprite.layers.mask; made.renderOrder = additive ? 0 : 1; this.sprite.add(made);
            return made;
        };
        this.glow = sprite(glowCanvas, true); this.eye = sprite(canvas, false);
    }

    /** Children inherit the plate's scale; size and offset the eye in world units beside the pips. */
    private placeEye(sprite: THREE.Sprite, size: number, squash = 1): void {
        const total = MAX_HP * PIP_W + (MAX_HP - 1) * PIP_GAP;
        const x = -(total / 2 / HEIGHT * WORLD_HEIGHT) - EYE_GAP, y = (HEIGHT - PIP_Y - PIP_H / 2) / HEIGHT * WORLD_HEIGHT;
        sprite.scale.set(size / this.sprite.scale.x, size * squash / this.sprite.scale.y, 1);
        sprite.center.set(0.5 - x / size, 0.5 - y / (size * squash));
    }

    private animateEye(dt: number): void {
        if (!this.eye || !this.glow) return;
        this.eyeAge += dt; this.eyeTime += dt;
        let open = 0, alpha = 0, glow = 0;
        if (this.hunch) {
            const t = Math.min(1, this.eyeAge / EYE_OPEN);
            // Pops open past full, then settles, with a flare of glow.
            open = t < 1 ? Math.sin(t * Math.PI * .5) * (1 + .35 * Math.sin(t * Math.PI)) : 1;
            alpha = Math.min(1, t * 2.5);
            const pulse = .55 + .25 * Math.sin(this.eyeTime * 3.2) + (this.supercharged ? .25 : 0);
            glow = pulse + (t < 1 ? (1 - t) * 1.2 : 0);
        } else if (this.eyeAge < EYE_SHUT + EYE_FADE) {
            // The lid shuts, then the closed eye fades away.
            open = Math.max(.06, 1 - this.eyeAge / EYE_SHUT);
            alpha = this.eyeAge < EYE_SHUT ? 1 : 1 - (this.eyeAge - EYE_SHUT) / EYE_FADE;
            glow = Math.max(0, .8 * (1 - this.eyeAge / EYE_SHUT));
        }
        const visible = alpha > .01;
        this.eye.visible = this.glow.visible = visible;
        if (!visible) return;
        const light = NAMEPLATE_LIGHT.value;
        this.placeEye(this.eye, EYE_SIZE, Math.max(.06, open));
        this.placeEye(this.glow, GLOW_SIZE * (1 + .08 * Math.sin(this.eyeTime * 3.2)));
        this.eye.material.opacity = alpha * light; this.glow.material.opacity = Math.min(1, glow) * alpha * light;
    }

    private draw() {
        const w = this.canvas.width, ctx = this.ctx, dead = this.health <= 0, last = this.health === 1;
        ctx.clearRect(0, 0, w, HEIGHT);
        ctx.globalAlpha = 1;
        ctx.font = FONT;
        ctx.textAlign = 'center';
        ctx.letterSpacing = '3px';
        ctx.shadowColor = 'rgba(8,6,10,.9)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = dead ? 'rgba(233,225,204,.4)' : CREAM;
        ctx.fillText(this.name, w / 2, 46, w - 32);
        ctx.shadowBlur = 0;
        if (dead) {
            ctx.fillStyle = RED;
            const strike = Math.min(w - 40, this.nameWidth + 12);
            ctx.fillRect((w - strike) / 2, 35, strike, 3);
            this.texture.needsUpdate = true;
            return;
        }
        const total = MAX_HP * PIP_W + (MAX_HP - 1) * PIP_GAP, left = (w - total) / 2;
        for (let i = 0; i < MAX_HP; i++) {
            const lost = this.lost[i]!, gained = this.gained[i]!;
            // A just-lost pip jolts sideways as it flashes out.
            const shake = lost >= 0 ? Math.sin(lost * 90) * 3 * (1 - lost / LOSS_SECONDS) : 0;
            const x = left + i * (PIP_W + PIP_GAP) + shake;
            ctx.beginPath();
            ctx.moveTo(x + PIP_SLANT, PIP_Y);
            ctx.lineTo(x + PIP_W + PIP_SLANT, PIP_Y);
            ctx.lineTo(x + PIP_W, PIP_Y + PIP_H);
            ctx.lineTo(x, PIP_Y + PIP_H);
            ctx.closePath();
            if (i < this.health) {
                // Filling left to right when regained.
                ctx.globalAlpha = gained >= 0 ? 0.35 + 0.65 * gained / GAIN_SECONDS : 1;
                ctx.fillStyle = last ? RED : this.hunch ? GOLD : CREAM;
                if (this.hunch && !last) { ctx.shadowColor = 'rgba(240,181,60,.95)'; ctx.shadowBlur = 10; }
                ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                ctx.globalAlpha = 0.35;
                ctx.strokeStyle = CREAM;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                if (lost >= 0) {
                    ctx.globalAlpha = 1 - lost / LOSS_SECONDS;
                    ctx.fillStyle = lost < 0.08 ? '#ffffff' : RED;
                    ctx.fill();
                }
            }
        }
        ctx.globalAlpha = 1;
        this.texture.needsUpdate = true;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.sprite.removeFromParent();
        this.texture.dispose();
        this.sprite.material.dispose();
        for (const child of [this.eye, this.glow]) { child?.material.map?.dispose(); child?.material.dispose(); }
        // Sprite geometry belongs to Three.js and is shared by every sprite.
    }
}
