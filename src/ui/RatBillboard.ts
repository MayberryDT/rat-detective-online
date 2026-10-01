import * as THREE from 'three';
import { MAX_HP } from '../shared/networkProtocol';
import { STREAK_TIERS, streakTier } from '../shared/streak';

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
const EYE_SIZE = 0.2, EYE_GAP = 0.14;
/** Seconds for the eye to open, and to shut then fade. */
const EYE_OPEN = 0.4, EYE_SHUT = 0.2, EYE_FADE = 0.35;
/** Kill streak stamp under the pips: the bulletin word per tier (`STREAK_TIERS`),
 * the most tally marks drawn, and seconds for the stamp to land. */
const STREAK_WORDS = ['ARMED', 'DANGEROUS', 'PUBLIC ENEMY'] as const;
const MAX_TALLIES = 10, STAMP_SECONDS = 0.28;
const STAMP_FONT = '400 28px Bangers, Impact, sans-serif';
const STAMP_RED = '#c8322a', STAMP_INK = '#ee5b4f';

/** Noir nameplate: the rat's name in spaced small caps over a row of slanted
 * pips, one per hit point, like tabs on a case file. Lost pips flash, shake and
 * drain to an empty outline; the last one burns red. Dead rats' names dim and
 * are struck through. A rat on a kill streak of 3 or more carries a red rubber
 * stamp under its pips (ARMED, DANGEROUS, PUBLIC ENEMY) with a tally mark per
 * kill. The canvas only redraws while something changes. */
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
    /** Per pip: seconds a regained pip still waits, empty, before it refills (a staggered Quick Fix), and the tick for each. */
    private readonly waiting = new Array<number>(MAX_HP).fill(0);
    private onPip?: () => void;
    private animating = false;
    private disposed = false;
    /** The Hunch (your own plate only): a small eye sprite and its open/shut clock. */
    private eye?: THREE.Sprite;
    private hunch = false;
    private eyeAge = Infinity;
    private streak = 0;
    /** Seconds since the stamp last came down (a new kill while on a streak). */
    private stampAge = Infinity;
    private stampFont = false;
    /** Plate brightness: a Blackout hides the plates of rats outside your flashlight. */
    public light = 1;

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

    /** The Hunch on your own plate: a small eye opens beside the pips and the pips take a
     * subtle gold glow; on losing it the eye shuts and fades. */
    public setHunch(on: boolean): void {
        if (on === this.hunch) return;
        this.hunch = on; this.eyeAge = 0;
        if (on) this.buildEye();
        this.draw();
    }

    /** Kills since this rat's last death; the stamp comes down again on each new kill from 3. */
    public setStreak(streak: number): void {
        if (streak === this.streak) return;
        const up = streak > this.streak;
        this.streak = streak;
        if (up && streakTier(streak) > 0) {
            this.stampAge = 0; this.animating = this.health > 0;
            if (!this.stampFont) { this.stampFont = true; void document.fonts?.load?.(STAMP_FONT).then(() => { if (!this.disposed) this.draw(); }, () => {}); }
        }
        this.draw();
    }

    /** With `stagger` (s) the regained pips refill one at a time, left to right, calling `tick` as each fills. */
    public setHealth(hp: number, stagger = 0, tick?: () => void) {
        // Dead: the eye resets without ceremony so the next life opens it again.
        if (hp <= 0 && this.hunch) { this.hunch = false; this.eyeAge = Infinity; if (this.eye) this.eye.visible = false; }
        if (this.health === hp) return;
        let order = 0;
        for (let i = 0; i < MAX_HP; i++) {
            const was = i < this.health, now = i < hp;
            if (was && !now) { this.lost[i] = 0; this.gained[i] = -1; this.waiting[i] = 0; }
            else if (!was && now) { this.gained[i] = 0; this.lost[i] = -1; this.waiting[i] = stagger > 0 ? ++order * stagger : 0; }
        }
        if (order) this.onPip = tick;
        this.health = hp;
        this.animating = hp > 0;
        if (!this.animating) { this.lost.fill(-1); this.gained.fill(-1); this.waiting.fill(0); }
        this.draw();
    }

    /** Advance pip and stamp animations; redraws only while one is running. */
    public update(dt: number): void {
        if (this.sprite.material.opacity !== this.light) this.sprite.material.opacity = this.light;
        this.animateEye(dt);
        if (!this.animating || this.disposed) return;
        let running = false;
        const advance = (times: number[], i: number, limit: number) => {
            const t = times[i]!;
            if (t < 0) return;
            times[i] = t + dt >= limit ? -1 : t + dt;
            running ||= times[i]! >= 0;
        };
        for (let i = 0; i < MAX_HP; i++) {
            const wait = this.waiting[i]!;
            if (wait > 0) {
                running = true;
                if ((this.waiting[i] = wait - dt) <= 0) { this.waiting[i] = 0; this.gained[i] = 0; this.onPip?.(); }
                continue;
            }
            advance(this.lost, i, LOSS_SECONDS); advance(this.gained, i, GAIN_SECONDS);
        }
        if (this.stampAge < STAMP_SECONDS) { this.stampAge += dt; running = true; }
        this.animating = running;
        this.draw();
    }

    private buildEye(): void {
        if (this.eye || typeof document === 'undefined') return;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const c = canvas.getContext('2d');
        if (!c || typeof c.beginPath !== 'function') return;
        // A plain open eye with a gold iris: the detective's hunch.
        c.lineJoin = 'round';
        c.fillStyle = '#f5ecd2'; c.strokeStyle = '#1a1208'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(12, 64); c.quadraticCurveTo(64, 22, 116, 64); c.quadraticCurveTo(64, 106, 12, 64); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#c8922e'; c.beginPath(); c.arc(64, 64, 19, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#050308'; c.beginPath(); c.arc(64, 64, 9, 0, Math.PI * 2); c.fill();
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        this.eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false }));
        this.eye.layers.mask = this.sprite.layers.mask; this.sprite.add(this.eye);
    }

    /** Children inherit the plate's scale; size and offset the eye in world units beside the pips. */
    private placeEye(sprite: THREE.Sprite, size: number, squash = 1): void {
        const total = MAX_HP * PIP_W + (MAX_HP - 1) * PIP_GAP;
        const x = -(total / 2 / HEIGHT * WORLD_HEIGHT) - EYE_GAP, y = (HEIGHT - PIP_Y - PIP_H / 2) / HEIGHT * WORLD_HEIGHT;
        sprite.scale.set(size / this.sprite.scale.x, size * squash / this.sprite.scale.y, 1);
        sprite.center.set(0.5 - x / size, 0.5 - y / (size * squash));
    }

    private animateEye(dt: number): void {
        if (!this.eye) return;
        this.eyeAge += dt;
        let open = 0, alpha = 0;
        if (this.hunch) {
            const t = Math.min(1, this.eyeAge / EYE_OPEN);
            open = t < 1 ? Math.sin(t * Math.PI * .5) * (1 + .25 * Math.sin(t * Math.PI)) : 1;
            alpha = Math.min(1, t * 2.5);
        } else if (this.eyeAge < EYE_SHUT + EYE_FADE) {
            // The lid shuts, then the closed eye fades away.
            open = Math.max(.06, 1 - this.eyeAge / EYE_SHUT);
            alpha = this.eyeAge < EYE_SHUT ? 1 : 1 - (this.eyeAge - EYE_SHUT) / EYE_FADE;
        }
        this.eye.visible = alpha > .01;
        if (!this.eye.visible) return;
        this.placeEye(this.eye, EYE_SIZE, Math.max(.06, open));
        this.eye.material.opacity = alpha;
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
            if (i < this.health && this.waiting[i]! <= 0) {
                // Filling left to right when regained.
                ctx.globalAlpha = gained >= 0 ? 0.35 + 0.65 * gained / GAIN_SECONDS : 1;
                ctx.fillStyle = last ? RED : this.hunch ? GOLD : CREAM;
                if (this.hunch && !last) { ctx.shadowColor = 'rgba(240,181,60,.6)'; ctx.shadowBlur = 5; }
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
        if (this.streak >= STREAK_TIERS[0]) this.drawStamp(w);
        ctx.globalAlpha = 1;
        this.texture.needsUpdate = true;
    }

    /** A red rubber stamp under the pips: the tier's word and a tally mark per kill (four
     * strokes and a slash per five). It comes down big and faint and lands with a small squash. */
    private drawStamp(w: number): void {
        const ctx = this.ctx, word = STREAK_WORDS[streakTier(this.streak) - 1]!;
        const tallies = Math.min(this.streak, MAX_TALLIES), more = this.streak > MAX_TALLIES;
        const t = Math.min(1, this.stampAge / STAMP_SECONDS);
        ctx.save();
        ctx.font = STAMP_FONT; ctx.letterSpacing = '2px'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const textW = typeof ctx.measureText === 'function' ? ctx.measureText(word).width : word.length * 15;
        const tallyW = Math.floor(tallies / 5) * 35 + (tallies % 5) * 7 + (more ? 14 : 0);
        const boxW = 14 + textW + 10 + tallyW + 8, boxH = 34, left = -boxW / 2, top = -boxH / 2;
        const scale = Math.min(1, (w - 12) / boxW) * (t < 1 ? 1 + 1.3 * (1 - t) * (1 - t) - 0.08 * Math.sin(t * Math.PI) : 1);
        ctx.translate(w / 2, 105); ctx.rotate(-0.04); ctx.scale(scale, scale);
        ctx.globalAlpha = Math.min(1, 0.25 + t * 1.5);
        // A single heavy border: a double line turns to mush at nameplate size.
        ctx.fillStyle = 'rgba(10,8,12,.55)'; ctx.fillRect(left, top, boxW, boxH);
        ctx.strokeStyle = STAMP_RED; ctx.lineWidth = 3; ctx.strokeRect(left, top, boxW, boxH);
        ctx.fillStyle = STAMP_INK; ctx.fillText(word, left + 14, 1);
        ctx.strokeStyle = STAMP_INK; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
        let x = left + 14 + textW + 10;
        for (let i = 0; i < tallies; i++) {
            if (i % 5 === 4) { ctx.moveTo(x - 31, 7); ctx.lineTo(x - 4, -7); x += 7; continue; }
            ctx.moveTo(x, -8); ctx.lineTo(x + 1, 8); x += 7;
        }
        ctx.stroke();
        if (more) ctx.fillText('+', x, 1);
        ctx.restore();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.sprite.removeFromParent();
        this.texture.dispose();
        this.sprite.material.dispose();
        this.eye?.material.map?.dispose(); this.eye?.material.dispose();
        // Sprite geometry belongs to Three.js and is shared by every sprite.
    }
}
