import './roundEnd.css';
import { awardValue } from '../shared/awardUnits';
import type {FoleyPlay} from '../audio/foleyCatalog';
import { ASSIGNMENTS, objectiveTarget, type AssignmentState } from '../shared/assignments';
import { JURISDICTION_TUNING } from '../shared/jurisdiction';
import type { FeedbackCue } from '../audio/FeedbackAudio';
import { MunicipalQuips } from './municipalQuips';
import type { Award, RoundReport } from '../shared/networkProtocol';
import { caseTime, downloadRoundStats, type RoundStats } from './roundStats';
import { feelState } from '../feel/feelState';
import { FEEL } from '../feel/feelTuning';
import { countUp, leave, measure, reducedMotion, replay, scrawl, slide, uiMotion } from './motion';

const KILL_FEED_LIMIT = 5;
const KILL_FEED_FADE_MS = 4000;
const RESPAWN_TICK_MS = 250;
const CONNECTION_PANEL_ID = 'connection-status';
/** Faded carbon inks for names in the feed, picked by name so a rat keeps its colour. Stamp red is kept for you. */
const NAME_INKS = ['#b9c9ecd9', '#9fcfd6d9', '#b5cfa6d9', '#cdbfaed9', '#c3c9d9d9', '#a3bdf0d9', '#c9c2b4d9'];
const TEAR: Keyframe[] = [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateX(70px) rotate(7deg)'}];

/** One kill-feed line. `note` is free text (case-death jokes, connection notices). */
export type FeedEntry =
    | { kind: 'kill'; killer: string | null; victim: string; headshot?: boolean; local?: 'killer' | 'victim' }
    | { kind: 'dispatch'; caller: string; local?: boolean }
    | { kind: 'note'; text: string };
/** What the round-end screens show beyond the winner: all optional, from the `gameWon` frame. */
export interface RoundEnd { assignment?: AssignmentState; awards?: readonly Award[]; report?: RoundReport; localId?: string; winnerId?: string }
/** CONTINUE on the results board: off (nothing to wait for), reading (the button), ready (continued before the next round,
 * which starts at `until`), or held (the next round is under way without you; the server brings you in by `until`). */
export type ContinueState = { kind: 'off' } | { kind: 'reading' } | { kind: 'ready'; until: number } | { kind: 'held'; until: number };

/** Owns title, kill feed, overlays, and connection status. */
/** Matches roundEnd.css: below this the results use their own stacked and phone layouts. */
const SMALL_RESULTS='(max-width:1100px),(max-height:640px)';

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
    /** The results board's strip of the round's big numbers. */
    private headline?: HTMLElement;
    /** The results' CONTINUE and DOWNLOAD STATS bar, and the round it would save. */
    private readonly actions: HTMLElement;
    private readonly continueButton: HTMLButtonElement;
    private readonly continueNote: HTMLElement;
    private continueState: ContinueState = { kind: 'off' };
    private continueTimer: ReturnType<typeof setInterval> | null = null;
    private roundStats?: RoundStats;
    /** The reader chose to leave the results (CONTINUE). */
    onContinue?: () => void;
    private feedLines = 0;

    constructor(doc: Document = document, onRetry?: () => void, private readonly feedback:(cue:FeedbackCue)=>void=()=>{},private readonly foley?:FoleyPlay) {
        this.doc = doc;
        this.onRetry = onRetry;
        this.titleScreen = this.require('title-screen');
        this.killFeed = this.require('kill-feed');
        this.victoryOverlay = this.require('victory-overlay');
        this.victoryText = this.require('victory-text');
        this.respawnOverlay = this.require('respawn-overlay');
        this.respawnTimer = this.require('respawn-timer');
        const label = this.respawnOverlay.querySelector?.<HTMLElement>('.respawn-label');
        if (label) scrawl(label, label.textContent ?? '');
        this.killConfirmation=this.doc.createElement('div');this.killConfirmation.id='kill-confirmation';
        this.killConfirmation.setAttribute('role','status');this.killConfirmation.setAttribute('aria-live','polite');
        this.killTitle=this.doc.createElement('div');this.killTitle.className='kill-confirmation-title';
        this.killQuip=this.doc.createElement('div');this.killQuip.className='kill-confirmation-quip';
        this.killConfirmation.appendChild(this.killTitle);this.killConfirmation.appendChild(this.killQuip);this.killConfirmation.style.display='none';
        this.doc.body.appendChild(this.killConfirmation);
        this.actions=this.doc.createElement('div');this.actions.className='results-actions';
        this.continueNote=this.doc.createElement('p');this.continueNote.className='results-continue-note';
        const download=this.doc.createElement('button');download.type='button';download.className='results-download';download.textContent='DOWNLOAD STATS';
        download.addEventListener('click',()=>{if(this.roundStats)downloadRoundStats(this.doc,this.roundStats);});
        this.continueButton=this.doc.createElement('button');this.continueButton.type='button';this.continueButton.className='results-continue';this.continueButton.textContent='CONTINUE ▸';
        this.continueButton.addEventListener('click',()=>this.onContinue?.());
        this.actions.appendChild(this.continueNote);this.actions.appendChild(download);this.actions.appendChild(this.continueButton);
        this.victoryOverlay.appendChild(this.actions);
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

    /** The title is gone and inert in this call; the swoop is a non-interactive copy of the office that
     * pushes in on the case poster while an iris opens from Tyler's mark onto the city. */
    enterPlaying(): void {
        if (this.disposed) return;
        const entering=!this.titleScreen.classList.contains('fade-out');
        if(entering)this.feedback('menu-open');
        this.titleScreen.classList.add('fade-out');
        if(entering&&this.titleScreen.style.display!=='none'&&typeof this.titleScreen.cloneNode==='function'&&uiMotion('titleSwoop')){
            const swoop=this.titleScreen.cloneNode(true) as HTMLElement;
            swoop.classList.add('title-swoop');swoop.inert=true;swoop.setAttribute('aria-hidden','true');swoop.style.display='';
            const logo=this.titleScreen.querySelector('.poster-logo')?.getBoundingClientRect();
            if(logo?.width){swoop.style.setProperty('--iris-x',`${logo.x+logo.width/2}px`);swoop.style.setProperty('--iris-y',`${logo.y+logo.height/2}px`);}
            for(const link of Array.from(swoop.querySelectorAll('a')))link.removeAttribute('href');
            swoop.addEventListener('animationend',event=>{if(event.target===swoop)swoop.remove();});
            this.doc.body.appendChild(swoop);this.swoop=swoop;
            this.schedule(()=>swoop.remove(),1000);
        }
        this.titleScreen.inert=true;
        this.titleScreen.style.display = 'none';
    }

    /** U5: a crooked carbon line. Names keep their ink and jitter; you are stamped red. */
    addKillFeed(line: FeedEntry): void {
        if (this.disposed) return;
        this.feedback('notice');
        const entry = this.doc.createElement('div');
        entry.className = this.feedLines++ % 2 ? 'kill-entry crooked' : 'kill-entry';
        entry.setAttribute('data-kind', line.kind);
        const part = (className: string, text: string, tag: 'b' | 'span' = 'span') => {
            const node = this.doc.createElement(tag); node.className = className; node.textContent = text; entry.appendChild(node); return node;
        };
        const name = (text: string, you = false) => {
            const node = part(you ? 'feed-name you' : 'feed-name', '', 'b');
            if (!you) { let hash = 0; for (let i = 0; i < text.length; i++) hash = hash * 31 + text.charCodeAt(i) | 0; node.style.color = NAME_INKS[Math.abs(hash) % NAME_INKS.length]!; }
            scrawl(node, text);
        };
        if (line.kind === 'note') entry.textContent = line.text;
        else if (line.kind === 'kill') {
            if (line.killer === null) { entry.setAttribute('data-killer', 'city'); part('feed-name city', 'The city', 'b'); }
            else name(line.killer, line.local === 'killer');
            part('feed-verb', 'nabbed'); name(line.victim, line.local === 'victim');
            if (line.headshot) { entry.setAttribute('data-headshot', 'true'); part('feed-tag', 'HEADSHOT'); }
            if (line.local) entry.setAttribute('data-local', line.local);
        } else {
            name(line.caller, !!line.local); part('feed-verb', 'called'); part('feed-tag', 'DISPATCH');
            if (line.local) entry.setAttribute('data-local', 'caller');
        }
        if (uiMotion('telegramFeed')) entry.classList.add('typed');
        const before = measure(this.killFeed);
        this.killFeed.appendChild(entry);
        this.schedule(() => leave(entry, 'telegramFeed', TEAR, 320), KILL_FEED_FADE_MS);
        while (this.killFeed.children.length > KILL_FEED_LIMIT) this.killFeed.firstChild?.remove();
        slide(this.killFeed, before, 'telegramFeed', 240, false);
    }

    showVictory(winnerName: string, kills: number, {assignment, awards, report, localId, winnerId}: RoundEnd = {}): void {
        if (this.disposed) return;
        if(!this.victoryVisible)this.victoryQuip=this.quips.next('victory');
        this.caseFile?.list.parentElement?.remove();this.victoryText.replaceChildren();this.caseFile=undefined;
        this.headline?.remove();this.headline=report&&this.headlineStrip(report,assignment,localId);
        this.roundStats=report&&{winnerId:winnerId??'',winnerName,kills,...(assignment?{assignment}:{}),...(awards?{awards}:{}),report,...(localId?{localId}:{})};
        const lines = [
            ['victory-kicker', assignment ? ASSIGNMENTS[assignment.id].title : 'OUTSTANDING MISCONDUCT'],
            ['victory-headline', 'CASE CLOSED!'],
            ['victory-winner', winnerName],
            ['victory-verdict', !assignment?`${kills} KILLS. ZERO RESTRAINT.`:`${objectiveTarget(assignment.id)} ${assignment.id==='jurisdiction'?'POINTS. JURISDICTION SECURED.':assignment.id==='chain-of-custody'?'DELIVERIES. CASE CLOSED.':'CASE KILLS. ZERO RESTRAINT.'}`],
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
                if(award.playerId===localId)row.classList.add('you');
                row.dataset.rat=award.playerId;
                row.appendChild(title);row.appendChild(who);row.appendChild(value);list.appendChild(row);
                rows.push({row,value,award});
            }
            this.victoryText.appendChild(file);
            this.caseFile={list,rows,stamped:false};
        }
        if(!this.victoryVisible){if(this.foley)this.foley('victory');else this.feedback('victory');}
        this.victoryVisible=true;this.overlay(this.victoryOverlay,true);
        this.layoutResults();
    }

    /** The round's big numbers: length, the mode's objective, kills, case hand-offs, the longest carry, then supplies, flights and calls. */
    private headlineStrip(report: RoundReport, assignment: AssignmentState | undefined, localId: string | undefined): HTMLElement {
        const strip=this.doc.createElement('dl');strip.className='results-headline';
        const cell=(value:string,label:string,className:string,who?:string)=>{
            const item=this.doc.createElement('div'),term=this.doc.createElement('dt'),detail=this.doc.createElement('dd');
            item.className=className;term.textContent=label;detail.textContent=value;item.appendChild(term);item.appendChild(detail);
            if(who!==undefined){const name=this.doc.createElement('small');name.textContent=who;item.appendChild(name);}
            strip.appendChild(item);return item;
        };
        cell(caseTime(report.seconds),'ROUND LENGTH','headline-major');
        if(assignment){
            const sum=(table:Record<string,number>)=>Object.values(table).reduce((total,n)=>total+n,0);
            const [value,label]=assignment.id==='chain-of-custody'?[assignment.deliverySerial,'DELIVERIES']:assignment.id==='jurisdiction'
                ?[Math.floor(sum(assignment.jurisdiction?.heldMs??{})/JURISDICTION_TUNING.zoneMs),'ZONES EMPTIED']:[sum(assignment.caseKills),'CASE KILLS'];
            cell(String(value),label,'headline-major headline-objective');
        }
        cell(String(report.kills),'KILLS','headline-major');
        cell(String(report.handoffs),'CASE HAND-OFFS','headline-major');
        if(report.carry)cell(caseTime(report.carry.seconds),'LONGEST CARRY','headline-major headline-carry',report.carry.playerName).classList.toggle('you',report.carry.playerId===localId);
        cell(String(report.supplies),'SUPPLIES','headline-minor');
        cell(String(report.flights),'FLIGHTS','headline-minor');
        cell(String(report.calls),'DISPATCH CALLS','headline-minor');
        this.victoryOverlay.appendChild(strip);
        return strip;
    }

    /** Round end, last beat: the Case File and final standings take the screen; U8 stamps the awards in one at a time. */
    showResults(on: boolean): void {
        const view=this.doc.defaultView;
        if(on){
            this.doc.body?.classList.add('round-results');
            this.actions.classList.toggle('no-report',!this.roundStats);
            // Out of the banner, whose rotate would otherwise become the fixed panel's containing block.
            const fileElement=this.caseFile?.list.parentElement;if(fileElement)this.victoryOverlay.appendChild(fileElement);
            // Again next frame (the standings are shown just after this call), and once fonts first used there have loaded.
            this.layoutResults();view?.addEventListener('resize',this.layoutResults);
            view?.requestAnimationFrame(()=>{this.layoutResults();void this.doc.fonts?.ready.then(this.layoutResults);});
        }else{
            this.doc.body?.classList.remove('round-results');view?.removeEventListener('resize',this.layoutResults);
            this.setContinue({kind:'off'});
        }
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

    /** The results' CONTINUE: the button while reading, then a countdown to the round you join (ready), or to the
     * server's latest moment to bring you into the round already under way (held). */
    setContinue(state: ContinueState): void {
        clearInterval(this.continueTimer??undefined);this.continueTimer=null;
        this.continueState=state;
        this.actions.dataset.continue=state.kind;
        this.continueButton.hidden=state.kind==='off'||state.kind==='ready';
        const note=()=>{
            const s=this.continueState,left='until' in s?caseTime(Math.ceil(Math.max(0,s.until-Date.now())/1000)):'';
            this.continueNote.textContent=s.kind==='reading'?'TAKE YOUR TIME · CONTINUE OR PRESS ANY KEY':s.kind==='ready'?`READY · NEXT CASE IN ${left}`
                :s.kind==='held'?`THE NEXT CASE IS UNDER WAY WITHOUT YOU · CONTINUE TO JOIN (AUTOMATIC IN ${left})`:'';
        };
        note();
        if('until' in state)this.continueTimer=setInterval(note,RESPAWN_TICK_MS);
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
        this.doc.defaultView?.removeEventListener('resize',this.layoutResults);
        clearInterval(this.continueTimer??undefined);this.actions.remove();
        this.statusPanel.remove();
    }

    /** Results board: the strip of big numbers, then the standings and the Case File side by side,
     * as one centred group just under the winner banner, above the CONTINUE bar, all inside the screen.
     * The banner's height varies with the winner's name, so it is measured; the standings scroll for
     * whatever does not fit. Small screens keep roundEnd.css's own placement below the banner and strip. */
    private layoutResults = (): void => {
        const view=this.doc.defaultView, body=this.doc.body;
        if(!view||!body?.classList.contains('round-results'))return;
        const small=view.matchMedia(SMALL_RESULTS).matches;
        const banner=[...this.victoryText.children].filter(el=>el.getBoundingClientRect().height>0);
        const bannerBottom=Math.max(0,...banner.map(el=>el.getBoundingClientRect().bottom));
        const w=view.innerWidth,h=view.innerHeight,margin=small?8:Math.max(16,Math.min(40,w*.025)),gap=small?10:Math.max(18,Math.min(32,w*.018));
        const group=Math.min(1480,w-margin*2),fileWidth=this.caseFile?Math.max(360,Math.min(540,group*.36)):0;
        const board=this.caseFile?group-fileWidth-gap:Math.min(1100,group),width=board+(fileWidth?fileWidth+gap:0),left=(w-width)/2;
        const stripTop=Math.round(bannerBottom+gap*.6);
        body.style.setProperty('--results-strip-top',`${stripTop}px`);
        body.style.setProperty('--results-strip-left',`${left}px`);body.style.setProperty('--results-strip-w',`${width}px`);
        const actions=this.actions.getBoundingClientRect().height;
        body.style.setProperty('--results-actions-h',`${Math.ceil(actions)}px`);
        const strip=this.headline?.getBoundingClientRect().height??0;
        const top=strip?Math.round(stripTop+strip+gap*.6):Math.round(bannerBottom+gap),available=Math.max(120,h-top-margin-(actions?actions+gap*.5:0));
        const vars:Record<string,string>={'--results-top':`${top}px`,'--results-h':`${available}px`,
            '--results-board-left':`${left}px`,'--results-board-w':`${board}px`,'--results-file-left':`${left+board+gap}px`,'--results-file-w':`${fileWidth}px`};
        for(const [key,value] of Object.entries(vars))body.style.setProperty(key,value);
        body.style.removeProperty('--results-panel-h');
        const standings=this.doc.querySelector<HTMLElement>('.match-scoreboard:not([hidden])');
        const file=this.caseFile?.list.parentElement;
        if(small){if(file)this.fitCaseFile(file,file.clientHeight);return;}
        // The pair should read as one spread: fit the Case File within the standings' height
        // when it can (always within the screen), then give both the taller height.
        const standingsHeight=standings?.getBoundingClientRect().height??0;
        // A little taller than the standings beats shrinking the type another step.
        if(file)this.fitCaseFile(file,standingsHeight>0?Math.min(standingsHeight*1.12,available):available);
        const tallest=Math.max(standingsHeight,file?.getBoundingClientRect().height??0);
        if(!tallest)return;
        body.style.setProperty('--results-panel-h',`${Math.ceil(tallest)}px`);
        // Ease the whole spread down into spare room rather than leaving it all below.
        const ease=Math.round(Math.min(60,Math.max(0,available-tallest)/3));
        body.style.setProperty('--results-top',`${top+ease}px`);body.style.setProperty('--results-strip-top',`${stripTop+ease}px`);
    };

    /** Awards never run off the screen: two columns for a long list, then smaller type, then three columns. */
    private fitCaseFile(file: HTMLElement, target: number): void {
        file.classList.remove('fit-2','fit-compact','fit-3');
        // A long list reads better as two short columns than one tall one.
        if(this.caseFile!.rows.length>6)file.classList.add('fit-2');
        for(const step of ['fit-2','fit-compact','fit-3']){
            if(file.scrollHeight<=target+1)break;
            file.classList.add(step);
        }
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
