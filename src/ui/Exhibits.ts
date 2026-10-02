import './exhibits.css';
import type {ExhibitAction, ExhibitMessage} from '../shared/highlights';
import type {ReplayClip, ReplayPlayer} from '../replay/types';
import {caption, CASE_KINDS, KIND_GLYPH, KIND_LABEL} from '../replay/captions';
import {canSave, saveClip, type SaveRun} from '../replay/saveClip';
import {caseTime} from './roundStats';

const LETTERS = ['A', 'B', 'C'] as const;
/** GameHud.layoutResults listens for this on the window: the exhibits block appeared, left or changed size. */
export const EXHIBITS_LAYOUT_EVENT = 'results-exhibits';

/** X4: the round's exhibits. Your best moment if you had one, then the best from anyone, one per kind, at most 3,
 * best first (Exhibit A, B, C). */
export function pickExhibits(clips: ReplayClip[], myId: string): ReplayClip[] {
    const ranked = [...clips].sort((a, b) => b.score - a.score);
    const picked: ReplayClip[] = [];
    const yours = ranked.find(clip => clip.actors.includes(myId));
    if (yours) picked.push(yours);
    for (const clip of ranked) {
        if (picked.length >= LETTERS.length) break;
        if (!picked.some(other => other.kind === clip.kind)) picked.push(clip);
    }
    return picked.sort((a, b) => b.score - a.score);
}

type Card = {clip: ReplayClip; button: HTMLButtonElement};

/** The exhibits on the results board: a framed 16:9 screen the replay draws into (the tape look is CSS over it),
 * three text cards, fullscreen and save. GameHud places the block above the Case File. */
export class Exhibits {
    private readonly doc: Document;
    private readonly root: HTMLElement;
    private readonly frame: HTMLElement;
    private readonly time: HTMLElement;
    private readonly exhibitLabel: HTMLElement;
    private readonly captionText: HTMLElement;
    private readonly list: HTMLElement;
    private readonly saveButton: HTMLButtonElement;
    private readonly backButton: HTMLButtonElement;
    private cards: Card[] = [];
    private playing: Card | undefined;
    private mode: 'board' | 'fullscreen' | 'saving' = 'board';
    private saving: SaveRun | undefined;
    private loop = 0;
    private shownTime = '';
    private hole = '';
    /** Exhibit ids already reported as shown: once each. */
    private readonly reported = new Set<string>();

    constructor(private readonly deps: {player: ReplayPlayer; myId: () => string; send: (m: ExhibitMessage) => void; host: HTMLElement}) {
        const doc = this.doc = deps.host.ownerDocument;
        const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text?: string) => {
            const node = doc.createElement(tag);node.className = className;if (text !== undefined) node.textContent = text;parent.appendChild(node);return node;
        };
        this.root = el('section', 'results-exhibits', deps.host);
        this.root.hidden = true;this.root.setAttribute('aria-label', 'Exhibits');
        const screen = el('div', 'exhibit-screen photo-corners', this.root);
        this.frame = el('div', 'exhibit-frame', screen);
        el('div', 'exhibit-tape', this.frame).setAttribute('aria-hidden', 'true');
        const rec = el('div', 'exhibit-rec', this.frame);rec.setAttribute('aria-hidden', 'true');
        el('i', 'exhibit-rec-dot', rec);el('span', 'exhibit-rec-label', rec, 'REC');
        this.time = el('span', 'exhibit-rec-time', rec, '0:00');
        const tools = el('div', 'exhibit-tools', this.frame);
        this.backButton = el('button', 'exhibit-back', this.frame);this.backButton.type = 'button';
        this.backButton.addEventListener('click', () => this.escape());
        const full = el('button', 'exhibit-fullscreen', tools, 'FULLSCREEN');full.type = 'button';
        full.addEventListener('click', () => this.fullscreen());
        this.saveButton = el('button', 'exhibit-save', tools, 'SAVE');this.saveButton.type = 'button';
        this.saveButton.addEventListener('click', () => this.save());
        const bar = el('div', 'exhibit-caption', screen);
        this.exhibitLabel = el('b', 'exhibit-caption-letter', bar);
        this.captionText = el('span', 'exhibit-caption-text', bar);
        this.list = el('ol', 'exhibit-cards', this.root);
    }

    show(): void {
        const myId = this.deps.myId();
        const picked = pickExhibits(this.deps.player.clips(), myId);
        if (!this.root.hidden && picked.length === this.cards.length && picked.every((clip, i) => clip.id === this.cards[i]!.clip.id)) return;
        this.hide();
        if (!picked.length) return;
        this.cards = picked.map((clip, i) => this.card(clip, LETTERS[i]!, myId));
        this.saveButton.hidden = !canSave(this.deps.player);
        this.root.hidden = false;
        this.doc.body.classList.add('exhibits-on');
        for (const type of ['keydown', 'keyup'] as const) this.doc.defaultView?.addEventListener(type, this.onKey, true);
        for (const {clip} of this.cards) if (!this.reported.has(clip.id)) {this.reported.add(clip.id);this.report(clip, 'shown');}
        this.select(this.cards[0]!);
        this.tick();
        this.doc.defaultView?.dispatchEvent(new Event(EXHIBITS_LAYOUT_EVENT));
    }

    hide(): void {
        const wasShown = !this.root.hidden;
        this.saving?.cancel();this.saving = undefined;
        this.setMode('board');
        if (this.playing && this.deps.player.current()?.id === this.playing.clip.id) this.deps.player.stop();
        this.playing = undefined;
        this.doc.defaultView?.cancelAnimationFrame(this.loop);this.loop = 0;
        for (const type of ['keydown', 'keyup'] as const) this.doc.defaultView?.removeEventListener(type, this.onKey, true);
        this.root.hidden = true;this.list.replaceChildren();this.cards = [];
        this.doc.body.classList.remove('exhibits-on');
        for (const name of ['--exhibit-x', '--exhibit-y', '--exhibit-w', '--exhibit-h']) this.doc.body.style.removeProperty(name);
        this.hole = '';this.shownTime = '';
        if (wasShown) this.doc.defaultView?.dispatchEvent(new Event(EXHIBITS_LAYOUT_EVENT));
    }

    dispose(): void {
        this.hide();
        this.root.remove();
    }

    private card(clip: ReplayClip, letter: string, myId: string): Card {
        const item = this.doc.createElement('li');
        const button = this.doc.createElement('button');button.type = 'button';button.className = 'exhibit-card';
        button.dataset.kind = clip.kind;button.dataset.letter = letter;
        if (CASE_KINDS[clip.kind]) button.classList.add('case');
        const part = (tag: string, className: string, text: string) => {const node = this.doc.createElement(tag);node.className = className;node.textContent = text;button.appendChild(node);return node;};
        part('b', 'exhibit-card-letter', letter);
        part('i', 'exhibit-card-glyph', KIND_GLYPH[clip.kind]).title = KIND_LABEL[clip.kind];
        part('span', 'exhibit-card-caption', caption(clip));
        const names = part('small', 'exhibit-card-names', '');
        [...new Set(clip.actors)].slice(0, 3).forEach((id, i) => {
            if (i) names.appendChild(this.doc.createTextNode(' · '));
            const name = this.doc.createElement('span');name.textContent = clip.names[id] ?? 'A rat';
            if (id === myId) name.className = 'you';
            names.appendChild(name);
        });
        button.setAttribute('aria-label', `Exhibit ${letter}: ${KIND_LABEL[clip.kind]}. ${caption(clip)}`);
        const card = {clip, button};
        button.addEventListener('click', () => {
            if (this.mode !== 'board') return;
            this.select(card);this.report(clip, 'played');
        });
        item.appendChild(button);this.list.appendChild(item);
        return card;
    }

    /** Play a card's clip in the framed screen, looping until another is picked. */
    private select(card: Card): void {
        this.playing = card;
        for (const other of this.cards) other.button.setAttribute('aria-pressed', String(other === card));
        const letter = card.button.dataset.letter ?? 'A';
        this.exhibitLabel.textContent = `EXHIBIT ${letter}`;this.captionText.textContent = caption(card.clip);
        this.root.classList.toggle('case', !!CASE_KINDS[card.clip.kind]);
        this.deps.player.play(card.clip, {mode: 'frame', rect: () => this.frame.getBoundingClientRect(), loop: true});
    }

    private fullscreen(): void {
        if (!this.playing || this.mode !== 'board') return;
        this.setMode('fullscreen');
        this.deps.player.play(this.playing.clip, {mode: 'fullscreen', loop: true});
        this.report(this.playing.clip, 'played');
    }

    private save(): void {
        const card = this.playing;
        if (!card || this.mode !== 'board' || !canSave(this.deps.player)) return;
        let run: SaveRun;
        try {run = saveClip(this.deps.player, card.clip, card.button.dataset.letter ?? 'A', this.doc);}
        catch (error) {console.warn('[exhibits] cannot record this exhibit', error);return;}
        this.saving = run;this.setMode('saving');
        void run.done.then(saved => {
            if (this.saving !== run) return;
            this.saving = undefined;
            if (saved) this.report(card.clip, 'saved');
            this.setMode('board');
            if (!this.root.hidden && this.playing) this.select(this.playing);
        });
    }

    /** Esc (or the BACK button): leave fullscreen, or cancel a recording, back to the board. */
    private escape(): void {
        if (this.mode === 'saving') {this.saving?.cancel();return;}
        if (this.mode !== 'fullscreen') return;
        this.setMode('board');
        if (this.playing) this.select(this.playing);
    }

    /** While fullscreen or recording no key reaches the board (its "any key continues"): Esc returns here, the rest are swallowed. */
    private onKey = (event: KeyboardEvent): void => {
        if (this.mode === 'board') return;
        event.preventDefault();event.stopImmediatePropagation();
        if (event.type === 'keydown' && event.code === 'Escape' && !event.repeat) this.escape();
    };

    private setMode(mode: 'board' | 'fullscreen' | 'saving'): void {
        this.mode = mode;
        const body = this.doc.body;
        body.classList.toggle('exhibit-fullscreen', mode !== 'board');
        body.classList.toggle('exhibit-recording', mode === 'saving');
        this.backButton.textContent = mode === 'saving' ? '● RECORDING · ESC TO CANCEL' : '◂ BACK · ESC';
        for (const {button} of this.cards) button.disabled = mode !== 'board';
    }

    /** Each frame while shown: the REC timestamp, and the hole in the board's dim where the replay shows through. */
    private tick = (): void => {
        const view = this.doc.defaultView;
        if (!view || this.root.hidden) return;
        const time = caseTime(this.deps.player.clock().ms / 1000);
        if (time !== this.shownTime) {this.shownTime = time;this.time.textContent = time;}
        const r = this.frame.getBoundingClientRect();
        const hole = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`;
        if (hole !== this.hole) {
            this.hole = hole;
            const style = this.doc.body.style;
            style.setProperty('--exhibit-x', `${Math.round(r.left)}px`);style.setProperty('--exhibit-y', `${Math.round(r.top)}px`);
            style.setProperty('--exhibit-w', `${Math.round(r.width)}px`);style.setProperty('--exhibit-h', `${Math.round(r.height)}px`);
        }
        this.loop = view.requestAnimationFrame(this.tick);
    };

    private report(clip: ReplayClip, action: ExhibitAction): void {
        this.deps.send({type: 'exhibit', id: clip.id, kind: clip.kind, action});
    }
}
