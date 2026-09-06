import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameHud } from '../../src/ui/GameHud';

type FakeNode = {
    id: string;
    tagName: string;
    className: string;
    type?: string;
    textContent: string;
    style: Record<string, string>;
    classList: { add(name: string): void; remove(name: string): void; contains(name: string): boolean };
    children: FakeNode[];
    parent: FakeNode | null;
    firstChild: FakeNode | null;
    append(...nodes: FakeNode[]): void;
    appendChild(node: FakeNode): FakeNode;
    replaceChildren(...nodes: FakeNode[]): void;
    remove(): void;
    addEventListener(type: string, fn: (event: Event) => void): void;
    removeEventListener(type: string, fn: (event: Event) => void): void;
    dispatchEvent(event: Event): boolean;
    setAttribute(name: string, value: string): void;
    click(): void;
};

function createHudDocument() {
    const byId = new Map<string, FakeNode>();

    const createNode = (tag: string): FakeNode => {
        const listeners = new Map<string, Set<(event: Event) => void>>();
        const classes = new Set<string>();
        const node: FakeNode = {
            id: '',
            tagName: tag.toUpperCase(),
            className: '',
            textContent: '',
            style: {},
            classList: {
                add(name: string) {
                    classes.add(name);
                    node.className = [...classes].join(' ');
                },
                remove(name: string) {
                    classes.delete(name);
                    node.className = [...classes].join(' ');
                },
                contains(name: string) {
                    return classes.has(name);
                },
            },
            children: [],
            parent: null,
            get firstChild() {
                return node.children[0] ?? null;
            },
            append(...nodes: FakeNode[]) {
                for (const child of nodes) node.appendChild(child);
            },
            appendChild(child: FakeNode) {
                child.parent = node;
                node.children.push(child);
                if (child.id) byId.set(child.id, child);
                return child;
            },
            replaceChildren(...nodes: FakeNode[]) {
                for (const child of node.children) child.parent = null;
                node.children = [];
                node.append(...nodes);
            },
            remove() {
                const parent = node.parent;
                if (!parent) return;
                parent.children = parent.children.filter(child => child !== node);
                node.parent = null;
                if (node.id) byId.delete(node.id);
            },
            addEventListener(type, fn) {
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type)!.add(fn);
            },
            removeEventListener(type, fn) {
                listeners.get(type)?.delete(fn);
            },
            dispatchEvent(event) {
                listeners.get(event.type)?.forEach(fn => fn(event));
                return true;
            },
            setAttribute(name, value) {
                if (name === 'id') {
                    if (node.id) byId.delete(node.id);
                    node.id = value;
                    byId.set(value, node);
                }
            },
            click() {
                node.dispatchEvent(new Event('click'));
            },
        };
        Object.defineProperty(node, 'id', {
            get() { return this._id ?? ''; },
            set(value: string) {
                if (this._id) byId.delete(this._id);
                this._id = value;
                if (value) byId.set(value, node);
            },
        });
        return node;
    };

    const body = createNode('body');
    const head = createNode('head');
    const add = (id: string, tag = 'div', parent: FakeNode = body) => {
        const node = createNode(tag);
        node.id = id;
        parent.appendChild(node);
        return node;
    };

    add('title-screen');
    add('scoreboard').style.display = 'none';
    add('scoreboard-list', 'ul');
    add('kill-feed');
    add('victory-overlay').style.display = 'none';
    add('victory-text');
    add('respawn-overlay').style.display = 'none';
    add('respawn-timer').textContent = '5';

    const doc = {
        body,
        head,
        createElement: (tag: string) => createNode(tag),
        getElementById: (id: string) => byId.get(id) ?? null,
    };

    return { doc: doc as unknown as Document, byId };
}

describe('GameHud', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('hides the title, shows the scoreboard, and keeps connection status off while playing', () => {
        const { doc, byId } = createHudDocument();
        const hud = new GameHud(doc);
        hud.enterPlaying();
        expect(byId.get('title-screen')!.classList.contains('fade-out')).toBe(true);
        expect(byId.get('scoreboard')!.style.display).toBe('block');
        vi.advanceTimersByTime(1500);
        expect(byId.get('title-screen')!.style.display).toBe('none');
        hud.setConnection('playing');
        expect(byId.get('connection-status')!.style.display).toBe('none');
        hud.dispose();
    });

    it('renders scores with textContent and marks the local player', () => {
        const { doc, byId } = createHudDocument();
        const hud = new GameHud(doc);
        hud.setScores([
            { id: 'a', name: '<Rat & Co>', kills: 3, deaths: 1 },
            { id: 'b', name: 'You', kills: 1, deaths: 0 },
        ], 'b');
        const rows = byId.get('scoreboard-list')!.children;
        expect(rows).toHaveLength(2);
        expect(rows[0].classList.contains('you')).toBe(false);
        expect(rows[1].classList.contains('you')).toBe(true);
        expect(rows[0].children[0].textContent).toBe('#1');
        expect(rows[0].children[1].textContent).toBe('<Rat & Co>');
        expect(rows[0].children[2].textContent).toBe('3K / 1D');
        hud.dispose();
    });

    it('shows a retryable disconnected status and hides it again while playing', () => {
        const { doc, byId } = createHudDocument();
        const onRetry = vi.fn();
        const hud = new GameHud(doc, onRetry);
        const panel = byId.get('connection-status')!;
        const retry = panel.children[1];
        hud.setConnection('connecting');
        expect(panel.style.display).toBe('flex');
        expect(panel.children[0].textContent).toBe('Connecting...');
        expect(retry.style.display).toBe('none');
        hud.setConnection('disconnected', 'Connection lost. <b>retry</b>');
        expect(panel.children[0].textContent).toBe('Connection lost. <b>retry</b>');
        expect(retry.style.display).toBe('inline-flex');
        retry.click();
        expect(onRetry).toHaveBeenCalledTimes(1);
        hud.setConnection('playing');
        expect(panel.style.display).toBe('none');
        hud.dispose();
    });

    it('caps the kill feed and cancels fade timers on dispose', () => {
        const { doc, byId } = createHudDocument();
        const hud = new GameHud(doc);
        for (let i = 1; i <= 6; i++) hud.addKillFeed(`kill ${i}`);
        const feed = byId.get('kill-feed')!;
        expect(feed.children.map(child => child.textContent)).toEqual([
            'kill 2', 'kill 3', 'kill 4', 'kill 5', 'kill 6',
        ]);
        hud.dispose();
        vi.advanceTimersByTime(5000);
        expect(feed.children).toHaveLength(5);
        expect(feed.children.every(child => !child.classList.contains('fade-out'))).toBe(true);
    });

    it('keeps the respawn overlay up after the deadline until hideRespawn', () => {
        const { doc, byId } = createHudDocument();
        const hud = new GameHud(doc);
        hud.showRespawn(Date.now() + 2500);
        const overlay = byId.get('respawn-overlay')!;
        const timer = byId.get('respawn-timer')!;
        expect(overlay.style.display).toBe('flex');
        expect(timer.textContent).toBe('3');
        vi.advanceTimersByTime(1000);
        expect(timer.textContent).toBe('2');
        vi.advanceTimersByTime(2000);
        expect(timer.textContent).toBe('0');
        expect(overlay.style.display).toBe('flex');
        hud.hideRespawn();
        expect(overlay.style.display).toBe('none');
        hud.showVictory('<Rat & Co>', 20);
        expect(byId.get('victory-overlay')!.style.display).toBe('flex');
        expect(byId.get('victory-text')!.textContent).toBe('🏆 <Rat & Co> wins with 20 kills!');
        hud.hideVictory();
        expect(byId.get('victory-overlay')!.style.display).toBe('none');
        hud.dispose();
    });

    it('cancels the title fade and respawn interval on dispose', () => {
        const { doc, byId } = createHudDocument();
        const hud = new GameHud(doc);
        hud.enterPlaying();
        hud.showRespawn(Date.now() + 5000);
        hud.dispose();
        expect(byId.get('connection-status')).toBeUndefined();
        vi.advanceTimersByTime(1500);
        expect(byId.get('title-screen')!.style.display).not.toBe('none');
        vi.advanceTimersByTime(5000);
        expect(byId.get('respawn-timer')!.textContent).toBe('5');
    });

    it('resets leftover HUD DOM so a new session starts on the title screen', () => {
        const { doc, byId } = createHudDocument();
        const first = new GameHud(doc);
        first.enterPlaying();
        first.setScores([{ id: 'a', name: '<Rat & Co>', kills: 2, deaths: 1 }], 'a');
        first.addKillFeed('A eliminated B');
        first.showVictory('<Rat & Co>', 20);
        first.showRespawn(Date.now() + 4000);
        first.setConnection('disconnected', 'Connection lost.');
        first.dispose();
        const second = new GameHud(doc);
        expect(byId.get('title-screen')!.classList.contains('fade-out')).toBe(false);
        expect(byId.get('title-screen')!.style.display).toBe('flex');
        expect(byId.get('scoreboard')!.style.display).toBe('none');
        expect(byId.get('scoreboard-list')!.children).toHaveLength(0);
        expect(byId.get('kill-feed')!.children).toHaveLength(0);
        expect(byId.get('victory-overlay')!.style.display).toBe('none');
        expect(byId.get('victory-text')!.textContent).toBe('');
        expect(byId.get('respawn-overlay')!.style.display).toBe('none');
        expect(byId.get('connection-status')!.style.display).toBe('none');
        second.setConnection('notice', 'Room is full.');
        expect(byId.get('connection-status')!.style.display).toBe('flex');
        expect(byId.get('connection-status')!.children[0].textContent).toBe('Room is full.');
        expect(byId.get('connection-status')!.children[1].style.display).toBe('none');
        second.setConnection('playing');
        expect(byId.get('connection-status')!.style.display).toBe('none');
        second.dispose();
    });
});
