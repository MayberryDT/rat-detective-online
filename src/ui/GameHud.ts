import './roundEnd.css';
import { awardValue } from '../shared/awardUnits';
import type {FoleyPlay} from '../audio/foleyCatalog';
import { ASSIGNMENTS, type AssignmentState } from '../shared/assignments';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import { MunicipalQuips } from './municipalQuips';
import type { Award } from '../shared/networkProtocol';
import { feelState } from '../feel/feelState';
import { FEEL } from '../feel/feelTuning';
import { countUp, leave, measure, reducedMotion, replay, slide, uiMotion } from './motion';

const KILL_FEED_LIMIT = 5;
const KILL_FEED_FADE_MS = 4000;
const RESPAWN_TICK_MS = 250;
const CONNECTION_PANEL_ID = 'connection-status';
/** Telegram inks for names on the tape, picked by name so a rat keeps its colour. */
const NAME_INKS = ['#7a1f2b', '#1f4e6b', '#4b2a6b', '#2f5a36', '#6b4a14', '#5a1f55', '#1d5a5a'];
const TEAR: Keyframe[] = [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateX(70px) rotate(7deg)'}];

/** One kill-feed line. `note` is free text (case-death jokes, connection notices). */
export type FeedEntry =
    | { kind: 'kill'; killer: string | null; victim: string; headshot?: boolean; local?: 'killer' | 'victim' }
    | { kind: 'dispatch'; caller: string; local?: boolean }
    | { kind: 'note'; text: string };

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
    private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();
    private respawnInterval: ReturnType<typeof setInterval> | null = null;
    private disposed = false;
    private connectionVisible = false;
    private respawnVisible = false;
    private victoryVisible = false;
    private readonly quips=new MunicipalQuips();
    private victoryQuip='';
    private hitTimer: ReturnType<typeof setTimeout> | null = null;
    private hitTier = 1;
    private killTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly killConfirmation: HTMLElement;
    private readonly killTitle: HTMLElement;
    private readonly killQuip: HTMLElement;
    private readonly overlayAnimations = new Map<HTMLElement, Animation>();
    private swoop?: HTMLElement;
    private caseFile: {list: HTMLElement; rows: {row: HTMLElement; value: HTMLElement; award: Award}[]; stamped: boolean} | undefined;

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

    /** The title is gone and inert in this call; U2's swoop is a non-interactive copy of the desk. */
    enterPlaying(): void {
        if (this.disposed) return;
        const entering=!this.titleScreen.classList.contains('fade-out');
        if(entering)this.feedback('menu-open');
        this.titleScreen.classList.add('fade-out');
        if(entering&&this.titleScreen.style.display!=='none'&&typeof this.titleScreen.cloneNode==='function'&&uiMotion('titleSwoop')){
            const swoop=this.titleScreen.cloneNode(true) as HTMLElement;
            swoop.classList.add('title-swoop');swoop.inert=true;swoop.setAttribute('aria-hidden','true');swoop.style.display='';
            for(const link of Array.from(swoop.querySelectorAll('a')))link.removeAttribute('href');
            swoop.addEventListener('animationend',event=>{if(event.target===swoop)swoop.remove();});
            this.doc.body.appendChild(swoop);this.swoop=swoop;
            this.schedule(()=>swoop.remove(),1000);
        }
        this.titleScreen.inert=true;
        this.titleScreen.style.display = 'none';
    }

    /** U5: a line of telegraph tape. Names keep their ink; you are highlighted. */
    addKillFeed(line: FeedEntry): void {
        if (this.disposed) return;
        this.feedback('notice');
        const entry = this.doc.createElement('div');
        entry.className = 'kill-entry';
        entry.setAttribute('data-kind', line.kind);
        const part = (className: string, text: string, tag: 'b' | 'span' = 'span') => {
            const node = this.doc.createElement(tag); node.className = className; node.textContent = text; entry.appendChild(node); return node;
        };
        const name = (text: string) => {
            let hash = 0; for (let i = 0; i < text.length; i++) hash = hash * 31 + text.charCodeAt(i) | 0;
            part('feed-name', text, 'b').style.color = NAME_INKS[Math.abs(hash) % NAME_INKS.length]!;
        };
        if (line.kind === 'note') entry.textContent = line.text;
        else if (line.kind === 'kill') {
            if (line.killer === null) { entry.setAttribute('data-killer', 'city'); part('feed-name city', 'The city', 'b'); }
            else name(line.killer);
            part('feed-verb', 'nabbed'); name(line.victim);
            if (line.headshot) { entry.setAttribute('data-headshot', 'true'); part('feed-tag', 'HEADSHOT'); }
            if (line.local) entry.setAttribute('data-local', line.local);
        } else {
            name(line.caller); part('feed-verb', 'called'); part('feed-tag', 'DISPATCH');
            if (line.local) entry.setAttribute('data-local', 'caller');
        }
        if (uiMotion('telegramFeed')) entry.classList.add('typed');
        const before = measure(this.killFeed);
        this.killFeed.appendChild(entry);
        this.schedule(() => leave(entry, 'telegramFeed', TEAR, 320), KILL_FEED_FADE_MS);
        while (this.killFeed.children.length > KILL_FEED_LIMIT) this.killFeed.firstChild?.remove();
        slide(this.killFeed, before, 'telegramFeed', 240, false);
    }

    showVictory(winnerName: string, kills: number, assignment?: AssignmentState, awards?: readonly Award[]): void {
        if (this.disposed) return;
        if(!this.victoryVisible)this.victoryQuip=this.quips.next('victory');
        this.victoryText.replaceChildren();this.caseFile=undefined;
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
        // Polish 19: the round's Case File, from server-counted cosmetic tallies.
        if(awards?.length&&feelState().on('rewards')){
            const file=this.doc.createElement('div');file.className='victory-casefile photo-corners';
            const heading=this.doc.createElement('h3');heading.textContent='CASE FILE';file.appendChild(heading);
            const list=this.doc.createElement('ul');file.appendChild(list);
            const rows=[];
            for(const award of awards){
                const row=this.doc.createElement('li'),title=this.doc.createElement('b'),who=this.doc.createElement('span'),value=this.doc.createElement('strong');
                title.textContent=award.title;who.textContent=award.playerName;value.textContent=awardValue(award);
                row.appendChild(title);row.appendChild(who);row.appendChild(value);list.appendChild(row);
                rows.push({row,value,award});
            }
            this.victoryText.appendChild(file);
            this.caseFile={list,rows,stamped:false};
        }
        if(!this.victoryVisible){if(this.foley)this.foley('victory');else this.feedback('victory');}
        this.victoryVisible=true;this.overlay(this.victoryOverlay,true);
    }

    /** Round end, last beat: the Case File and final standings take the screen; U8 stamps the awards in one at a time. */
    showResults(on: boolean): void {
        if(on)this.doc.body?.classList.add('round-results');else this.doc.body?.classList.remove('round-results');
        const file=this.caseFile;
        if(!on||!file||file.stamped)return;
        file.stamped=true;
        if(!uiMotion('caseFileStamps'))return;
        file.list.classList.add('stamping');
        const gap=FEEL.caseFileStamps.params.gap*1000;
        file.rows.forEach(({row,value,award},i)=>this.schedule(()=>{
            row.classList.add('stamped');this.foley?.('name-stamp',undefined,{rate:.9+i*.05});
            countUp(value,award.value,v=>awardValue({id:award.id,value:v}),'caseFileStamps',Math.max(200,gap*.9));
        },450+i*gap));
    }

    hideVictory(): void {
        if (this.disposed) return;
        this.showResults(false);
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
            this.feedback('death');
            // U7: RAT DOWN waits for the death camera and iris to play first.
            if(feelState().on('deathBeat')&&feelState().on('deathCam'))this.respawnOverlay.classList.add('death-beat');
            else this.respawnOverlay.classList.remove('death-beat');
            replay(this.respawnOverlay,'comic-impact');
            const clock=this.doc.getElementById('respawn-clock');
            if(clock){clock.style.setProperty('--respawn-ms',`${Math.max(0,respawnAt-Date.now())}ms`);replay(clock,'ticking');}
        }
        this.respawnVisible=true;this.clearCombatFeedback();this.overlay(this.respawnOverlay,true);
        const tick = () => {
            const value=String(Math.max(0, Math.ceil((respawnAt-Date.now())/1000)));
            const changed=this.respawnTimer.textContent!==value;
            if(Number(value)>0&&(changed||firstTick))this.foley?.('respawn-tick');firstTick=false;
            if(changed){this.respawnTimer.textContent=value;replay(this.respawnTimer,'count-pop');}
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

    /** U6: the X grows with damage and with hits landing while it still shows. */
    showHitMarker(damage=1): void {
        if(this.disposed)return;
        const reticle=this.doc.getElementById('crosshair');if(!reticle)return;
        // A subsequent ordinary hit must not erase a lethal confirmation.
        if(reticle.classList.contains('kill-confirmed'))return;
        const stacked=this.hitTimer!==null?this.hitTier:0;
        this.clearHitMarker();void reticle.offsetWidth;
        this.hitTier=feelState().on('reactiveCrosshair')?Math.min(3,Math.max(1,damage)+stacked):1;
        reticle.classList.add('hit-confirmed');if(this.hitTier>1)reticle.classList.add(`hit-${this.hitTier}`);
        this.hitTimer=setTimeout(()=>{this.hitTimer=null;this.clearHitMarker();},180);
    }

    showKillConfirmation(victimName:string,headshot=false):void {
        if(this.disposed)return;
        this.clearHitMarker();
        const reticle=this.doc.getElementById('crosshair');
        if(reticle){
            void reticle.offsetWidth;reticle.classList.add('kill-confirmed');if(headshot)reticle.classList.add('headshot');
            this.hitTimer=setTimeout(()=>{this.hitTimer=null;reticle.classList.remove('kill-confirmed');reticle.classList.remove('headshot');},headshot?700:500);
        }
        if(this.killTimer!==null)clearTimeout(this.killTimer);
        this.killTitle.textContent=`${headshot?'HEADSHOT':'RAT DOWN'} · ${victimName}`;
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
        const reticle=this.doc.getElementById('crosshair');if(!reticle)return;
        for(const name of ['hit-confirmed','hit-2','hit-3','kill-confirmed','headshot'])reticle.classList.remove(name);
    }

    private overlay(element:HTMLElement,visible:boolean):void {
        this.overlayAnimations.get(element)?.cancel();this.overlayAnimations.delete(element);
        if(!element.animate||reducedMotion()){element.style.display=visible?'flex':'none';return;}
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
        this.clearCombatFeedback();this.killConfirmation.remove();this.swoop?.remove();
        for(const animation of this.overlayAnimations.values())animation.cancel();
        this.overlayAnimations.clear();
        this.clearRespawnTimer();
        for (const id of this.timeouts) clearTimeout(id);
        this.timeouts.clear();
        this.retryButton.removeEventListener('click', this.handleRetry);
        this.statusPanel.remove();
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
