import { observationRoom } from '../shared/observation';
import type { PlayerSettings } from './PlayerSettings';
import { reducedMotion, replay } from './motion';
import { generateRandomName } from '../shared/ratNames';
import { bindGameCredits } from './GameCredits';
import { readPublicInvitation } from '../network/publicInvitation';

/** The title is usable without the renderer, physics, room metadata or audio. */
export class TitleScreen {
    name = '';
    settings?:PlayerSettings;
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
        const invitation = doc.getElementById('invitation-status');
        const route = readPublicInvitation(this.target.location?.search ?? '');
        if (invitation) {
            invitation.textContent = route.requestedRoom
                ? 'INVITED DISPATCH — ENTER TO JOIN'
                : route.invalid ? 'INVITATION UNAVAILABLE — OPEN MATCHMAKING' : '';
            invitation.toggleAttribute('hidden', !route.requestedRoom && !route.invalid);
        }
        const params=new URLSearchParams(this.target.location?.search??'');
        if(observationRoom(params.get('room')??'')){
            const observing=params.get('observe')==='1';
            if(observing){
                const label=doc.getElementById('enter-city-label');if(label)label.textContent='OBSERVE BOTS';
                if(invitation){invitation.hidden=false;invitation.textContent='Normal rat controls. Invisible to the match.';}
            }
            const toggle=doc.createElement('button');toggle.type='button';toggle.className='observation-toggle';
            toggle.textContent=observing?'Play as a rat instead':'Observe bots instead';
            enter.parentNode?.insertBefore(toggle,enter.nextSibling);
            toggle.addEventListener('click',()=>{
                if(!this.available())return;
                const url=new URL(this.target.location.href);
                if(observing)url.searchParams.delete('observe');else url.searchParams.set('observe','1');
                this.target.location.assign(url.toString());
            },options);
        }
        enter.disabled = false;
        enter.addEventListener('click', event => { event.stopPropagation(); this.enter(); }, options);
        reroll.addEventListener('click', event => {
            event.stopPropagation(); if (this.available()) this.roll(true);
        }, options);
        doc.addEventListener('keydown', event => {
            if (this.settings?.isOpen || (event.target as HTMLElement|null)?.tagName==='BUTTON'&&event.target!==enter || (event.key !== 'Enter' && event.code !== 'Enter') || this.credits.isLink(event.target) || !this.available()) return;
            event.preventDefault(); this.enter();
        }, options);
        for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) {
            doc.addEventListener(type, () => this.onGesture(), { ...options, capture: true });
        }
        // Lean the still toward the pointer (a few pixels; the plate transitions the rest).
        const screen = doc.getElementById('title-screen');
        doc.addEventListener('pointermove', event => {
            if (!screen || event.pointerType !== 'mouse' || reducedMotion()) return;
            const width = target.innerWidth || 1, height = target.innerHeight || 1;
            screen.style.setProperty('--lean-x', `${((.5 - event.clientX / width) * 22).toFixed(1)}px`);
            screen.style.setProperty('--lean-y', `${((.5 - event.clientY / height) * 14).toFixed(1)}px`);
        }, options);
        target.addEventListener('focus', () => this.focus(), options);
        doc.addEventListener('visibilitychange', () => { if (!doc.hidden) this.focus(); }, options);
        this.roll(); this.focus();
    }
    private enter(): void {
        if (this.settings?.isOpen || !this.available()) return;
        this.clearRoll(); this.show(this.name); this.onGesture(); this.onEnter(this.name);
    }
    private pick(exclude = ''): string {
        let next = generateRandomName();
        for (let tries = 0; tries < 8 && next === exclude; tries++) next = generateRandomName();
        return next;
    }
    private show(name: string): void {
        const plate = this.doc.getElementById('player-name');
        if (plate) plate.textContent = name;
    }
    /** The die tumbles and clatters while the new name types onto the card, a key every 38 ms. */
    private roll(animate = false): void {
        this.clearRoll(); this.name = this.pick(this.name);
        if (!animate || reducedMotion()) {
            this.show(this.name); if (animate) this.onCue('name-stamp'); return;
        }
        const dice = this.doc.getElementById('reroll-name-btn');
        if (dice) replay(dice, 'rolling');
        this.doc.getElementById('player-name')?.classList.add('typing');
        const name = this.name, card = this.doc.getElementById('player-name')?.parentElement;
        const type = (typed: number) => {
            if (this.disposed) return;
            this.show(name.slice(0, typed));
            if (typed >= name.length) {
                this.onCue('name-stamp'); if (card) replay(card, 'ding');
                this.timer = setTimeout(() => this.clearRoll(), 400); return;
            }
            if (typed % 2) { this.onCue('name-tick'); if (card) replay(card, 'strike'); }
            this.timer = setTimeout(() => type(typed + 1), 38);
        };
        type(1);
    }
    private clearRoll(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.doc.getElementById('player-name')?.classList.remove('typing');
        this.doc.getElementById('reroll-name-btn')?.classList.remove('rolling');
    }
    focus(): void {
        if (!this.settings?.isOpen && this.available()) (this.doc.getElementById('enter-city-btn') as HTMLButtonElement)?.focus({ preventScroll: true });
    }
    dispose(): void {
        this.disposed = true; this.settings?.dispose(); this.clearRoll(); this.events.abort();
        this.onEnter = this.onGesture = this.onCue = () => {};
    }
}
