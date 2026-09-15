import { playerPreferences } from '../settings/PlayerPreferences';
import type {FoleyPlay} from '../audio/foleyCatalog';
import { ASSIGNMENTS, type AssignmentState } from '../shared/assignments';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import { MunicipalQuips } from './municipalQuips';

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

/** Owns title, kill feed, overlays, and connection status. */
export class GameHud {
    private readonly doc: Document;
    private readonly onRetry?: () => void;
    private readonly titleScreen: HTMLElement;
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
    private respawnInterval: ReturnType<typeof setInterval> | null = null;
    private disposed = false;
    private connectionVisible = false;
    private respawnVisible = false;
    private victoryVisible = false;
    private readonly quips=new MunicipalQuips();
    private victoryQuip='';
    private hitTimer: ReturnType<typeof setTimeout> | null = null;
    private killTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly killConfirmation: HTMLElement;
    private readonly killTitle: HTMLElement;
    private readonly killQuip: HTMLElement;
    private readonly overlayAnimations = new Map<HTMLElement, Animation>();

    constructor(doc: Document = document, onRetry?: () => void, private readonly feedback:(cue:FeedbackCue)=>void=()=>{},private readonly foley?:FoleyPlay) {
        this.doc = doc;
        this.onRetry = onRetry;
        this.titleScreen = this.require('title-screen');
        this.killFeed = this.require('kill-feed');
        this.victoryOverlay = this.require('victory-overlay');
        this.victoryText = this.require('victory-text');
        this.respawnOverlay = this.require('respawn-overlay');
        this.respawnTimer = this.require('respawn-timer');
        this.killConfirmation=this.doc.createElement('div');this.killConfirmation.id='kill-confirmation';
        this.killConfirmation.setAttribute('role','status');this.killConfirmation.setAttribute('aria-live','polite');
        this.killTitle=this.doc.createElement('div');this.killTitle.className='kill-confirmation-title';
        this.killQuip=this.doc.createElement('div');this.killQuip.className='kill-confirmation-quip';
        this.killConfirmation.appendChild(this.killTitle);this.killConfirmation.appendChild(this.killQuip);this.killConfirmation.style.display='none';
        this.doc.body.appendChild(this.killConfirmation);
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
        this.titleScreen.inert=true;
        this.titleScreen.style.display = 'none';
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

    showVictory(winnerName: string, kills: number, assignment?: AssignmentState): void {
        if (this.disposed) return;
        if(!this.victoryVisible)this.victoryQuip=this.quips.next('victory');
        this.victoryText.replaceChildren();
        const lines = [
            ['victory-kicker', assignment ? ASSIGNMENTS[assignment.id].title : 'OUTSTANDING MISCONDUCT'],
            ['victory-headline', 'CASE CLOSED!'],
            ['victory-winner', winnerName],
            ['victory-verdict', assignment?.id==='jurisdiction'?'60 POINTS. JURISDICTION SECURED.':assignment?.id==='closing-time'?'STOLE THE LAST SECOND!':assignment?.id==='chain-of-custody'?'3 DELIVERIES. CASE CLOSED.':assignment?'10 CASE KILLS. ZERO RESTRAINT.':`${kills} KILLS. ZERO RESTRAINT.`],
            ['victory-stamp', this.victoryQuip],
        ];
        for(const [className,text] of lines){
            const line=this.doc.createElement('div');line.className=className;line.textContent=text;this.victoryText.appendChild(line);
        }
        if(!this.victoryVisible){if(this.foley)this.foley('victory');else this.feedback('victory');}
        this.victoryVisible=true;this.overlay(this.victoryOverlay,true);
    }

    hideVictory(): void {
        if (this.disposed) return;
        this.clearCombatFeedback();
        const wasVisible=this.victoryVisible;this.victoryVisible=false;
        if(wasVisible)this.feedback('menu-close');this.overlay(this.victoryOverlay,false);
    }

    showRespawn(respawnAt: number): void {
        if (this.disposed) return;
        this.clearRespawnTimer();
        let firstTick=!this.respawnVisible;
        if(!this.respawnVisible){
            const note=this.doc.getElementById('respawn-note');if(note)note.textContent=this.quips.next('death');
            this.feedback('death');this.respawnOverlay.classList.remove('comic-impact');void this.respawnOverlay.offsetWidth;this.respawnOverlay.classList.add('comic-impact');
        }
        this.respawnVisible=true;this.clearCombatFeedback();this.overlay(this.respawnOverlay,true);
        const tick = () => {
            const value=String(Math.max(0, Math.ceil((respawnAt-Date.now())/1000)));
            const changed=this.respawnTimer.textContent!==value;
            if(Number(value)>0&&(changed||firstTick))this.foley?.('respawn-tick');firstTick=false;
            if(changed){this.respawnTimer.textContent=value;this.respawnTimer.classList.remove('count-pop');void this.respawnTimer.offsetWidth;this.respawnTimer.classList.add('count-pop');}
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
        // A subsequent ordinary hit must not erase a lethal confirmation.
        if(reticle.classList.contains('kill-confirmed'))return;
        this.clearHitMarker();void reticle.offsetWidth;
        reticle.classList.add('hit-confirmed');
        this.hitTimer=setTimeout(()=>{this.hitTimer=null;reticle.classList.remove('hit-confirmed');},180);
    }

    showKillConfirmation(victimName:string):void {
        if(this.disposed)return;
        this.clearHitMarker();
        const reticle=this.doc.getElementById('crosshair');
        if(reticle){
            void reticle.offsetWidth;reticle.classList.add('kill-confirmed');
            this.hitTimer=setTimeout(()=>{this.hitTimer=null;reticle.classList.remove('kill-confirmed');},500);
        }
        if(this.killTimer!==null)clearTimeout(this.killTimer);
        this.killTitle.textContent=`RAT DOWN · ${victimName}`;
        this.killQuip.textContent=this.quips.next('kill');
        // Replace rapid kills in one bounded notice, restarting its full lifetime.
        this.killConfirmation.style.display='none';void this.killConfirmation.offsetWidth;
        this.killConfirmation.style.display='block';
        this.killTimer=setTimeout(()=>{this.killTimer=null;this.killConfirmation.style.display='none';},2400);
    }

    private clearCombatFeedback():void {
        this.clearHitMarker();
        if(this.killTimer!==null)clearTimeout(this.killTimer);this.killTimer=null;
        this.killConfirmation.style.display='none';
    }

    private clearHitMarker():void {
        if(this.hitTimer!==null)clearTimeout(this.hitTimer);this.hitTimer=null;
        this.doc.getElementById('crosshair')?.classList.remove('hit-confirmed');
        this.doc.getElementById('crosshair')?.classList.remove('kill-confirmed');
    }

    private overlay(element:HTMLElement,visible:boolean):void {
        this.overlayAnimations.get(element)?.cancel();this.overlayAnimations.delete(element);
        const reduce=playerPreferences().current.reducedMotion||this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
        this.clearCombatFeedback();this.killConfirmation.remove();
        for(const animation of this.overlayAnimations.values())animation.cancel();
        this.overlayAnimations.clear();
        this.clearRespawnTimer();
        for (const id of this.timeouts) clearTimeout(id);
        this.timeouts.clear();
        this.retryButton.removeEventListener('click', this.handleRetry);
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
        this.titleScreen.inert=false;
        this.titleScreen.style.display = 'flex';
        this.victoryOverlay.style.display = 'none';
        this.victoryText.textContent = '';
        this.respawnOverlay.style.display = 'none';
        this.respawnTimer.textContent = '3';
        this.clearList(this.killFeed);
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

    private clearRespawnTimer(): void {
        if (this.respawnInterval) clearInterval(this.respawnInterval);
        this.respawnInterval = null;
    }
}
