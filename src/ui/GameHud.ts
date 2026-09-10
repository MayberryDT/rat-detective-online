import type { ScoreEntry } from '../shared/networkProtocol';
import type { FeedbackCue } from '../audio/FeedbackAudio';

const TITLE_FADE_MS = 1500;
const KILL_FEED_LIMIT = 5;
const KILL_FEED_FADE_MS = 4000;
const KILL_FEED_REMOVE_MS = 500;
const RESPAWN_TICK_MS = 250;

const CONNECTION_STYLE_ID = 'game-hud-connection-style';
const CONNECTION_PANEL_ID = 'connection-status';

const CONNECTION_STYLE = `
#connection-status {
    position: fixed;
    left: 50%;
    bottom: 80px;
    transform: translateX(-50%);
    z-index: 60;
    display: none;
    align-items: center;
    gap: 12px;
    max-width: min(420px, calc(100vw - 32px));
    background: rgba(7, 4, 10, 0.75);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(139, 92, 246, 0.15);
    border-radius: 12px;
    padding: 10px 16px;
    color: #e2e8f0;
    font-family: 'Outfit', sans-serif;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    pointer-events: auto;
    user-select: none;
}
#connection-status .connection-retry {
    padding: 0.4rem 0.9rem;
    background: rgba(139, 92, 246, 0.1);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 50px;
    color: #8b5cf6;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
}
`;

/** Owns title, scoreboard, kill feed, overlays, and connection status. */
export class GameHud {
    private readonly doc: Document;
    private readonly onRetry?: () => void;
    private readonly titleScreen: HTMLElement;
    private readonly scoreboard: HTMLElement;
    private readonly scoreboardList: HTMLElement;
    private readonly playerCard: HTMLElement;
    private readonly scoreboardStack: HTMLElement;
    private readonly scoreRows = new Map<string, HTMLElement>();
    private readonly rankAnimations = new Map<string, Animation>();
    private readonly killFeed: HTMLElement;
    private readonly victoryOverlay: HTMLElement;
    private readonly victoryText: HTMLElement;
    private readonly respawnOverlay: HTMLElement;
    private readonly respawnTimer: HTMLElement;
    private readonly statusPanel: HTMLElement;
    private readonly statusMessage: HTMLElement;
    private readonly retryButton: HTMLButtonElement;
    private readonly styleEl: HTMLStyleElement;
    private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();
    private titleTimer: ReturnType<typeof setTimeout> | null = null;
    private respawnInterval: ReturnType<typeof setInterval> | null = null;
    private disposed = false;
    private connectionVisible = false;
    private respawnVisible = false;
    private victoryVisible = false;
    private hitTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly overlayAnimations = new Map<HTMLElement, Animation>();

    constructor(doc: Document = document, onRetry?: () => void, private readonly feedback:(cue:FeedbackCue)=>void=()=>{}) {
        this.doc = doc;
        this.onRetry = onRetry;
        this.titleScreen = this.require('title-screen');
        this.scoreboard = this.require('scoreboard');
        this.scoreboardList = this.require('scoreboard-list');
        this.playerCard = this.doc.createElement('section');
        this.playerCard.id = 'scoreboard-player';
        this.scoreboardStack = this.doc.createElement('div');
        this.scoreboardStack.id = 'scoreboard-stack';
        this.doc.body.appendChild(this.scoreboardStack);
        this.scoreboardStack.appendChild(this.scoreboard);
        this.scoreboardStack.appendChild(this.playerCard);
        this.killFeed = this.require('kill-feed');
        this.victoryOverlay = this.require('victory-overlay');
        this.victoryText = this.require('victory-text');
        this.respawnOverlay = this.require('respawn-overlay');
        this.respawnTimer = this.require('respawn-timer');
        this.styleEl = this.mountStyle();
        const status = this.mountConnectionStatus();
        this.statusPanel = status.panel;
        this.statusMessage = status.message;
        this.retryButton = status.retry;
        this.retryButton.addEventListener('click', this.handleRetry);
        this.reset();
    }

    setConnection(state: string, message?: string): void {
        if (this.disposed) return;
        const hidden = state === 'playing' || state === 'idle' || state === 'stopped';
        if (hidden) {
            if(this.connectionVisible)this.feedback('menu-close');
            this.connectionVisible=false;this.overlay(this.statusPanel,false);
            this.retryButton.style.display = 'none';
            return;
        }
        const fallback = state === 'connecting'
            ? 'Connecting...'
            : state === 'reconnecting'
                ? 'Reconnecting...'
                : state === 'disconnected'
                    ? 'Disconnected.'
                    : state;
        if(!this.connectionVisible)this.feedback('menu-open');
        this.connectionVisible=true;
        this.statusMessage.textContent = message ?? fallback;
        this.overlay(this.statusPanel,true);
        this.retryButton.style.display = state === 'disconnected' && this.onRetry ? 'inline-flex' : 'none';
    }

    enterPlaying(): void {
        if (this.disposed) return;
        if(!this.titleScreen.classList.contains('fade-out'))this.feedback('menu-open');
        this.titleScreen.classList.add('fade-out');
        this.clearTitleTimer();
        this.titleTimer = setTimeout(() => {
            this.titleTimer = null;
            if (!this.disposed) this.titleScreen.style.display = 'none';
        }, TITLE_FADE_MS);
        this.scoreboard.style.display = 'block';
        this.scoreboardStack.style.display = 'block';
    }

    setScores(scores: readonly ScoreEntry[], myId: string | null): void {
        if (this.disposed) return;
        const top = scores.slice(0, 5);
        const positions = new Map<string, number>();
        for (const [id, row] of this.scoreRows) {
            if (row.getBoundingClientRect) positions.set(id, row.getBoundingClientRect().top);
        }
        for (const animation of this.rankAnimations.values()) animation.cancel();
        this.rankAnimations.clear();
        for (const [id, row] of this.scoreRows) {
            if (!top.some(score => score.id === id)) { row.remove(); this.scoreRows.delete(id); }
        }
        top.forEach((score, index) => {
            let row = this.scoreRows.get(score.id);
            if (!row) {
                row = this.doc.createElement('li');
                for (const className of ['rank', 'name', 'stats']) {
                    const span = this.doc.createElement('span'); span.className = className; row.appendChild(span);
                }
                this.scoreRows.set(score.id, row);
            }
            if (score.id === myId) row.classList.add('you'); else row.classList.remove('you');
            row.children[0].textContent = `#${index + 1}`;
            row.children[1].textContent = score.name;
            row.children[2].textContent = `${score.kills}K / ${score.deaths}D`;
            this.scoreboardList.appendChild(row);
        });
        const reducedMotion = this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!reducedMotion && this.scoreboardStack.style.display !== 'none') {
            for (const [id, row] of this.scoreRows) {
                if (!row.animate || !row.getBoundingClientRect) continue;
                const before = positions.get(id);
                const delta = before === undefined ? 0 : before - row.getBoundingClientRect().top;
                if (before !== undefined && Math.abs(delta) < 1) continue;
                const animation = row.animate(before === undefined
                    ? [{opacity:0, transform:'translateX(-8px)'}, {opacity:1, transform:'translateX(0)'}]
                    : [{transform:`translateY(${delta}px)`}, {transform:'translateY(0)'}],
                    {duration:280, easing:'cubic-bezier(.2,.7,.2,1)'});
                this.rankAnimations.set(id, animation);
                animation.onfinish = () => { if (this.rankAnimations.get(id) === animation) this.rankAnimations.delete(id); };
            }
        }
        this.clearList(this.playerCard);
        const position = scores.findIndex(score => score.id === myId);
        this.playerCard.style.display = position < 0 ? 'none' : 'flex';
        if (position >= 0) {
            const score = scores[position];
            for (const [className, text] of [
                ['rank', `#${position + 1}`], ['name', score.name], ['stats', `${score.kills}K / ${score.deaths}D`],
            ]) {
                const line = this.doc.createElement('span'); line.className = className;
                line.textContent = text; this.playerCard.appendChild(line);
            }
        }
    }

    addKillFeed(msg: string): void {
        if (this.disposed) return;
        this.feedback('notice');
        const entry = this.doc.createElement('div');
        entry.className = 'kill-entry';
        entry.textContent = msg;
        this.killFeed.appendChild(entry);
        this.schedule(() => {
            entry.classList.add('fade-out');
            this.schedule(() => entry.remove(), KILL_FEED_REMOVE_MS);
        }, KILL_FEED_FADE_MS);
        while (this.killFeed.children.length > KILL_FEED_LIMIT) {
            this.killFeed.firstChild?.remove();
        }
    }

    showVictory(winnerName: string, kills: number): void {
        if (this.disposed) return;
        this.victoryText.textContent = `🏆 ${winnerName} wins with ${kills} kills!`;
        if(!this.victoryVisible)this.feedback('victory');
        this.victoryVisible=true;this.overlay(this.victoryOverlay,true);
    }

    hideVictory(): void {
        if (this.disposed) return;
        const wasVisible=this.victoryVisible;this.victoryVisible=false;
        if(wasVisible)this.feedback('menu-close');this.overlay(this.victoryOverlay,false);
    }

    showRespawn(respawnAt: number): void {
        if (this.disposed) return;
        this.clearRespawnTimer();
        if(!this.respawnVisible)this.feedback('death');
        this.respawnVisible=true;this.clearHitMarker();this.overlay(this.respawnOverlay,true);
        const tick = () => {
            this.respawnTimer.textContent = String(Math.max(0, Math.ceil((respawnAt - Date.now()) / 1000)));
        };
        tick();
        this.respawnInterval = setInterval(tick, RESPAWN_TICK_MS);
    }

    hideRespawn(): void {
        if (this.disposed) return;
        this.clearRespawnTimer();
        const wasVisible=this.respawnVisible;this.respawnVisible=false;
        if(wasVisible)this.feedback('respawn');this.overlay(this.respawnOverlay,false);
    }

    showHitMarker(): void {
        if(this.disposed)return;
        const reticle=this.doc.getElementById('crosshair');if(!reticle)return;
        this.clearHitMarker();void reticle.offsetWidth;
        reticle.classList.add('hit-confirmed');
        this.hitTimer=setTimeout(()=>{this.hitTimer=null;reticle.classList.remove('hit-confirmed');},180);
    }

    private clearHitMarker():void {
        if(this.hitTimer!==null)clearTimeout(this.hitTimer);this.hitTimer=null;
        this.doc.getElementById('crosshair')?.classList.remove('hit-confirmed');
    }

    private overlay(element:HTMLElement,visible:boolean):void {
        this.overlayAnimations.get(element)?.cancel();this.overlayAnimations.delete(element);
        const reduce=this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if(!element.animate||reduce){element.style.display=visible?'flex':'none';return;}
        if(!visible&&element.style.display==='none')return;
        element.style.display='flex';
        const animation=element.animate(visible?[{opacity:0},{opacity:1}]:[{opacity:1},{opacity:0}],
            {duration:visible?180:160,easing:'ease-out'});
        this.overlayAnimations.set(element,animation);
        animation.onfinish=()=>{
            if(this.overlayAnimations.get(element)!==animation)return;
            this.overlayAnimations.delete(element);if(!visible)element.style.display='none';
        };
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearHitMarker();
        for(const animation of this.overlayAnimations.values())animation.cancel();
        this.overlayAnimations.clear();
        this.clearTitleTimer();
        this.clearRespawnTimer();
        for (const id of this.timeouts) clearTimeout(id);
        this.timeouts.clear();
        this.retryButton.removeEventListener('click', this.handleRetry);
        this.playerCard.remove();
        this.doc.body.appendChild(this.scoreboard);
        this.scoreboardStack.remove();
        this.statusPanel.remove();
        this.styleEl.remove();
    }

    private handleRetry = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        this.onRetry?.();
    };

    private reset(): void {
        this.titleScreen.classList.remove('fade-out');
        this.titleScreen.style.display = 'flex';
        this.scoreboard.style.display = 'none';
        this.scoreboardStack.style.display = 'none';
        for (const animation of this.rankAnimations.values()) animation.cancel();
        this.rankAnimations.clear();
        this.scoreRows.clear();
        this.victoryOverlay.style.display = 'none';
        this.victoryText.textContent = '';
        this.respawnOverlay.style.display = 'none';
        this.respawnTimer.textContent = '5';
        this.clearList(this.scoreboardList);
        this.clearList(this.killFeed);
        this.clearList(this.playerCard);
        this.playerCard.style.display = 'none';
        this.statusPanel.style.display = 'none';
        this.retryButton.style.display = 'none';
        this.statusMessage.textContent = '';
    }

    private clearList(node: HTMLElement): void {
        while (node.firstChild) node.firstChild.remove();
    }

    private require(id: string): HTMLElement {
        const node = this.doc.getElementById(id);
        if (!node) throw new Error(`GameHud requires #${id}`);
        return node;
    }

    private mountStyle(): HTMLStyleElement {
        const existing = this.doc.getElementById(CONNECTION_STYLE_ID) as HTMLStyleElement | null;
        if (existing?.tagName.toLowerCase() === 'style') return existing;
        const style = this.doc.createElement('style');
        style.id = CONNECTION_STYLE_ID;
        style.textContent = CONNECTION_STYLE;
        (this.doc.head ?? this.doc.body).appendChild(style);
        return style;
    }

    private mountConnectionStatus(): { panel: HTMLElement; message: HTMLElement; retry: HTMLButtonElement } {
        this.doc.getElementById(CONNECTION_PANEL_ID)?.remove();
        const panel = this.doc.createElement('div');
        panel.id = CONNECTION_PANEL_ID;
        panel.setAttribute('role', 'status');
        panel.setAttribute('aria-live', 'polite');
        panel.style.display = 'none';
        const message = this.doc.createElement('span');
        message.className = 'connection-message';
        const retry = this.doc.createElement('button');
        retry.type = 'button';
        retry.className = 'connection-retry';
        retry.textContent = 'Retry';
        retry.style.display = 'none';
        panel.appendChild(message);
        panel.appendChild(retry);
        this.doc.body.appendChild(panel);
        return { panel, message, retry };
    }

    private schedule(fn: () => void, ms: number): void {
        const id = setTimeout(() => {
            this.timeouts.delete(id);
            if (!this.disposed) fn();
        }, ms);
        this.timeouts.add(id);
    }

    private clearTitleTimer(): void {
        if (this.titleTimer) clearTimeout(this.titleTimer);
        this.titleTimer = null;
    }

    private clearRespawnTimer(): void {
        if (this.respawnInterval) clearInterval(this.respawnInterval);
        this.respawnInterval = null;
    }
}
