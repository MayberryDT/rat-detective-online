import {TouchInput, type TouchRole} from '../session/TouchInput';
import './touchControls.css';

type Options = {
    canvas: HTMLElement; look: (dx: number, dy: number) => void; shoot: () => void;
    scores: (visible: boolean) => void; clearKeys: () => void;
    doc?: Document; target?: Window;
};
export function touchControlsAvailable(target: Window = window): boolean {
    const choice = new URLSearchParams(target.location.search).get('controls');
    if (choice) return choice === 'touch';
    return !!target.matchMedia?.('(any-pointer: coarse)').matches || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

/** A session-owned touch surface; controls never impersonate mouse/keyboard events. */
export class TouchControls {
    readonly input: TouchInput;
    readonly root: HTMLElement;
    private readonly doc: Document;
    private readonly target: Window;
    private readonly events = new AbortController();
    private readonly captures = new Map<number, HTMLElement>();
    private readonly pad: HTMLElement;
    private readonly stick: HTMLElement;
    private readonly knob: HTMLElement;
    private readonly fire: HTMLButtonElement;
    private readonly jump: HTMLButtonElement;
    private readonly scores: HTMLButtonElement;
    private readonly settings: HTMLElement;
    private readonly settingsButton: HTMLButtonElement;
    private readonly rotate: HTMLElement;
    private playing = false;
    private alive = false;
    private board = false;
    private portrait = false;
    private disposed = false;
    private sensitivity = 1.5;
    active = false;
    constructor(private readonly options: Options) {
        this.doc = options.doc ?? document; this.target = options.target ?? window;
        this.input = new TouchInput((dx, dy) => options.look(dx * this.lookScale(), dy * this.lookScale()));
        const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text = '') => {
            const node = this.doc.createElement(tag); node.className = className; node.textContent = text; parent.appendChild(node); return node;
        };
        this.root = make('div', 'touch-controls', this.doc.body); this.root.setAttribute('aria-label', 'Touch controls');
        this.pad = make('div', 'touch-play', this.root);
        const move = make('div', 'touch-move-zone', this.pad);
        this.stick = make('div', 'touch-stick', move); make('span', '', this.stick, 'MOVE');
        this.knob = make('i', 'touch-knob', this.stick);
        const look = make('div', 'touch-look-zone', this.pad); look.setAttribute('aria-label', 'Swipe to aim');
        const actions = make('div', 'touch-actions', this.pad);
        this.jump = make('button', 'touch-jump', actions, 'JUMP');
        this.fire = make('button', 'touch-fire', actions, 'FIRE');
        const toolbar = make('div', 'touch-toolbar', this.root);
        this.scores = make('button', 'touch-scores', toolbar, 'SCORES');
        this.scores.setAttribute('aria-expanded', 'false');
        this.settingsButton = make('button', 'touch-settings-button', toolbar, 'AIM');
        this.settingsButton.setAttribute('aria-expanded', 'false');
        this.settings = make('div', 'touch-settings', this.root); this.settings.hidden = true;
        const label = make('label', '', this.settings, 'LOOK SENSITIVITY');
        const slider = make('input', '', label); slider.type = 'range'; slider.min = '.4'; slider.max = '2'; slider.step = '.1';
        try { const saved = Number(this.target.localStorage.getItem('rat-touch-sensitivity')); if (saved >= .4 && saved <= 2) this.sensitivity = saved; } catch { /* Storage can be unavailable in private browsing. */ }
        slider.value = String(this.sensitivity);
        this.rotate = make('div', 'touch-rotate', this.root, 'TURN YOUR PHONE');
        this.rotate.setAttribute('role', 'status');
        const listeners = {signal: this.events.signal};
        const capture = {signal: this.events.signal, capture: true, passive: false};
        for (const [surface, role] of [[move, 'move'], [look, 'look'], [this.fire, 'fire'], [this.jump, 'jump']] as const) {
            this.bindSurface(surface, role);
        }
        slider.addEventListener('input', () => {
            const value = Number(slider.value); if (!Number.isFinite(value)) return;
            this.sensitivity = Math.max(.4, Math.min(2, value));
            try { this.target.localStorage.setItem('rat-touch-sensitivity', String(this.sensitivity)); } catch { /* Optional preference. */ }
        }, listeners);
        this.scores.addEventListener('click', () => this.showScores(!this.board), listeners);
        this.settingsButton.addEventListener('click', () => {
            const open = this.settings.hidden;
            this.clear(); this.showScores(false); this.settings.hidden = !open;
            this.settingsButton.setAttribute('aria-expanded', String(!this.settings.hidden));
        }, listeners);
        if (this.doc.documentElement.requestFullscreen) {
            const full = make('button', 'touch-fullscreen', toolbar, '⛶'); full.setAttribute('aria-label', 'Fullscreen');
            full.addEventListener('click', () => {
                this.clear();
                const request = this.doc.fullscreenElement ? this.doc.exitFullscreen() : this.doc.documentElement.requestFullscreen();
                void request?.catch(() => {}); // Fullscreen is optional, including on iPhone.
            }, listeners);
        }
        this.doc.addEventListener('pointerdown', event => {
            if (event.pointerType === 'touch') { this.setActive(true); if (this.doc.pointerLockElement) this.doc.exitPointerLock(); }
            else if (event.pointerType === 'mouse' && event.target === options.canvas && !this.forced()) this.setActive(false);
        }, capture);
        this.doc.addEventListener('pointermove', event => {
            if (!this.input.fingers.has(event.pointerId)) return;
            event.preventDefault(); this.input.move(event.pointerId, event.clientX, event.clientY); this.drawStick();
        }, capture);
        const end = (event: PointerEvent) => { this.input.end(event.pointerId); this.captures.delete(event.pointerId); this.drawStick(); this.drawActions(); };
        this.doc.addEventListener('pointerup', end, capture);
        this.doc.addEventListener('lostpointercapture', end, capture);
        this.doc.addEventListener('pointercancel', () => this.clear(), capture);
        this.doc.addEventListener('visibilitychange', () => { if (this.doc.hidden) this.suspend(); }, listeners);
        this.target.addEventListener('blur', () => this.suspend(), listeners);
        this.target.addEventListener('pagehide', () => this.suspend(), listeners);
        this.target.addEventListener('resize', () => { this.suspend(); this.resize(); }, listeners);
        this.doc.addEventListener('keydown', event => { if (event.code === 'Escape') this.suspend(); }, listeners);
        this.root.addEventListener('contextmenu', event => event.preventDefault(), listeners);
        this.setActive(this.forced() || !!this.target.matchMedia?.('(pointer: coarse)').matches);
        this.resize();
    }
    private forced(): boolean { return new URLSearchParams(this.target.location.search).get('controls') === 'touch'; }
    private lookScale(): number { return this.sensitivity * 500 / Math.max(320, Math.min(this.target.innerWidth, this.target.innerHeight)); }
    private canAct(): boolean { return this.active && this.playing && this.alive && !this.portrait && !this.board && this.settings.hidden && !this.doc.hidden; }
    private bindSurface(surface: HTMLElement, role: TouchRole): void {
        surface.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || !this.canAct()) return;
            event.preventDefault(); event.stopPropagation();
            if (!this.input.start(event.pointerId, role, event.clientX, event.clientY)) return;
            this.captures.set(event.pointerId, surface);
            try { surface.setPointerCapture(event.pointerId); } catch { this.clear(); return; }
            if (role === 'move') {
                const rect = surface.getBoundingClientRect();
                this.stick.style.left = `${event.clientX - rect.left}px`; this.stick.style.top = `${event.clientY - rect.top}px`;
                this.stick.classList.add('held');
            }
            this.drawActions();
            if (role === 'fire') this.input.tick(performance.now(), this.options.shoot);
        }, {signal: this.events.signal, passive: false});
    }
    private drawActions(): void {
        this.fire.classList.toggle('held', [...this.input.fingers.values()].some(f => f.role === 'fire'));
        this.jump.classList.toggle('held', this.input.movement.jump);
    }
    private drawStick(): void {
        const move = [...this.input.fingers.values()].some(f => f.role === 'move');
        if (!move) { this.stick.classList.remove('held'); this.stick.style.left = ''; this.stick.style.top = ''; }
        this.knob.style.transform = `translate(${this.input.movement.x * 40}px,${-this.input.movement.y * 40}px)`;
    }
    private resize(): void { this.portrait = this.target.innerHeight > this.target.innerWidth; this.refresh(); }
    private refresh(): void {
        this.root.hidden = !this.active;
        this.pad.hidden = !this.playing || this.portrait;
        this.pad.classList.toggle('inactive', !this.alive);
        this.scores.hidden = !this.playing;
        this.rotate.hidden = !this.portrait;
        this.doc.body.classList.toggle('touch-mode', this.active);
    }
    setActive(active: boolean): void {
        if (active !== this.active) { this.suspend(); this.options.clearKeys(); }
        this.active = active; this.refresh();
    }
    setPlaying(playing: boolean): void {
        if (playing !== this.playing) this.suspend();
        this.playing = playing; this.refresh();
    }
    showScores(visible: boolean): void {
        this.clear(); this.board = visible && this.active && this.playing && !this.portrait;
        this.settings.hidden = true; this.settingsButton.setAttribute('aria-expanded', 'false');
        this.scores.textContent = this.board ? 'CLOSE' : 'SCORES'; this.scores.setAttribute('aria-expanded', String(this.board));
        this.options.scores(this.board);
    }
    update(now: number, alive: boolean): void {
        if (alive !== this.alive) { this.clear(); this.alive = alive; this.refresh(); }
        if (this.canAct()) this.input.tick(now, this.options.shoot);
    }
    clear(): void {
        this.input.clear();
        const captures = [...this.captures]; this.captures.clear();
        for (const [id, surface] of captures) { try { if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id); } catch { /* Detached surfaces are already released. */ } }
        this.drawStick(); this.drawActions();
    }
    private suspend(): void { this.clear(); this.showScores(false); this.settings.hidden = true; this.settingsButton.setAttribute('aria-expanded', 'false'); }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.suspend(); this.events.abort(); this.root.remove(); this.doc.body.classList.remove('touch-mode');
    }
}
