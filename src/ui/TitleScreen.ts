import { generateRandomName } from '../shared/ratNames';
import { bindGameCredits } from './GameCredits';

/** The title is usable without the renderer, physics, room metadata or audio. */
export class TitleScreen {
    name = '';
    onEnter: (name: string) => void = () => {};
    onGesture: () => void = () => {};
    onCue: (cue: 'name-tick' | 'name-stamp') => void = () => {};
    available: () => boolean = () => true;
    readonly credits;
    private readonly events = new AbortController();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;
    constructor(private readonly doc: Document = document, private readonly target: Window = window) {
        this.credits = bindGameCredits(this.events.signal, doc);
        const options = { signal: this.events.signal };
        const enter = doc.getElementById('enter-city-btn') as HTMLButtonElement;
        const reroll = doc.getElementById('reroll-name-btn') as HTMLButtonElement;
        enter.disabled = false;
        enter.addEventListener('click', event => { event.stopPropagation(); this.enter(); }, options);
        reroll.addEventListener('click', event => {
            event.stopPropagation(); if (this.available()) this.roll(true);
        }, options);
        doc.addEventListener('keydown', event => {
            if ((event.key !== 'Enter' && event.code !== 'Enter') || this.credits.isLink(event.target) || !this.available()) return;
            event.preventDefault(); this.enter();
        }, options);
        for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) {
            doc.addEventListener(type, () => this.onGesture(), { ...options, capture: true });
        }
        target.addEventListener('focus', () => this.focus(), options);
        doc.addEventListener('visibilitychange', () => { if (!doc.hidden) this.focus(); }, options);
        this.roll(); this.focus();
    }
    private enter(): void {
        if (!this.available()) return;
        this.clearRoll(); this.show(this.name); this.onGesture(); this.onEnter(this.name);
    }
    private pick(exclude = ''): string {
        let next = generateRandomName();
        for (let tries = 0; tries < 8 && next === exclude; tries++) next = generateRandomName();
        return next;
    }
    private restart(el: HTMLElement | null, className: string): void {
        if (!el) return;
        el.classList.remove(className); void el.offsetWidth; el.classList.add(className);
    }
    private show(name: string, animate = false): void {
        const plate = this.doc.getElementById('player-name');
        if (plate) { plate.textContent = name; if (animate) this.restart(plate, 'shuffling'); }
    }
    private roll(animate = false): void {
        this.clearRoll(); this.name = this.pick(this.name);
        if (!animate || this.target.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            this.show(this.name); if (animate) this.onCue('name-stamp'); return;
        }
        const dice = this.doc.getElementById('reroll-name-btn');
        this.restart(dice, 'rolling');
        const tick = (step: number) => {
            if (this.disposed) return;
            if (step >= 4) {
                this.show(this.name, true); this.onCue('name-stamp');
                this.timer = setTimeout(() => this.clearRoll(), 180); return;
            }
            this.onCue('name-tick'); this.show(this.pick(this.name), true);
            this.timer = setTimeout(() => tick(step + 1), 55);
        };
        tick(0);
    }
    private clearRoll(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.doc.getElementById('player-name')?.classList.remove('shuffling');
        this.doc.getElementById('reroll-name-btn')?.classList.remove('rolling');
    }
    focus(): void {
        if (this.available()) (this.doc.getElementById('enter-city-btn') as HTMLButtonElement)?.focus({ preventScroll: true });
    }
    dispose(): void {
        this.disposed = true; this.clearRoll(); this.events.abort();
        this.onEnter = this.onGesture = this.onCue = () => {};
    }
}
