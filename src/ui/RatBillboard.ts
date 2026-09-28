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

    public setHealth(hp: number) {
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
                ctx.fillStyle = last ? RED : CREAM;
                ctx.fill();
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
        // Sprite geometry belongs to Three.js and is shared by every sprite.
    }
}
