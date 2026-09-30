import {ASSIGNMENTS, type AssignmentState} from '../shared/assignments';
import type {ChaosState} from '../shared/chaosState';
import {MAX_HP, type PlayerData, type ScoreEntry, type ServerMessage} from '../shared/networkProtocol';
import './matchScoreboard.css';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {arrange, uiMotion} from './motion';

type Investigator = ScoreEntry & {hp?: number};
const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
export function caseTime(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Server totals only: opening the board never starts a local stats clock. */
export class MatchScoreboard {
    private readonly root: HTMLElement;
    private readonly title: HTMLElement;
    private readonly summary: HTMLElement;
    private readonly mode: HTMLElement;
    private readonly context: HTMLElement;
    private readonly head: HTMLElement;
    private readonly body: HTMLElement;
    private readonly scroller: HTMLElement;
    private readonly footer: HTMLElement;
    private players = new Map<string, Investigator>();
    private state?: ChaosState;
    private assignment?: AssignmentState;
    private myId = '';
    private available = false;
    private signature = '';
    private readonly renderedRows = new Map<string,{row:HTMLElement;signature:string}>();
    private columns = '';
    private disposed = false;
    private exit?: Animation;
    /** U8: at round end the rows first line up by kills, then slide into the final order. */
    private byKills = false;
    private cancelSettle?: () => void;

    constructor(private readonly doc: Document = document, private readonly cue: (cue: FeedbackCue) => void = () => {}) {
        this.root = doc.createElement('section');
        this.root.className = 'match-scoreboard';
        this.root.hidden = true;
        this.root.setAttribute('aria-label', 'Full lobby scoreboard');
        this.root.innerHTML = `<header class="match-scoreboard-heading"><div><small>DEPARTMENT PERSONNEL FILE</small><h2>ROUND STATS</h2></div><p class="match-scoreboard-summary"></p></header><div class="match-scoreboard-mode"><strong></strong><span></span></div><div class="match-scoreboard-scroll"><table aria-label="Every investigator in this round"><thead></thead><tbody></tbody></table></div><footer><span></span><b class="scoreboard-desktop-hint">HOLD TAB · SCROLL TO BROWSE</b><b class="scoreboard-touch-hint">SWIPE TO BROWSE</b></footer>`;
        const get = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
        this.title = get('h2'); this.summary = get('.match-scoreboard-summary');
        this.mode = get('.match-scoreboard-mode strong'); this.context = get('.match-scoreboard-mode span');
        this.head = get('thead'); this.body = get('tbody'); this.scroller = get('.match-scoreboard-scroll');
        this.footer = get('footer span');
        doc.body.appendChild(this.root);
    }

    setAvailable(value: boolean): void {
        this.available = value;
        if (!value) this.setVisible(false);
    }
    /** U9: the board slides in like a sheet of paper and whips away on release; the HUD returns at once. */
    setVisible(value: boolean): void {
        if (this.disposed) return;
        const visible = value && this.available, shown = !this.root.hidden && !this.exit;
        this.doc.body.classList.toggle('scoreboard-open', visible);
        if (visible === shown) { if (visible) this.render(); return; }
        this.exit?.cancel(); this.exit = undefined;
        this.cue(visible ? 'menu-open' : 'menu-close');
        if (visible) {
            if (this.root.hidden) this.scroller.scrollTop = 0;
            this.root.hidden = false;
            const results = !!this.assignment?.result && uiMotion('caseFileStamps');
            this.byKills = results; this.render();
            // The entrance runs once per opening (Web Animations survive later row moves; a CSS class would replay).
            if (uiMotion('paperSlide') && typeof this.root.animate === 'function') {
                this.root.animate([{opacity: 0, translate: '0 -46px', rotate: '-1.5deg'}, {opacity: 1, translate: '0 0', rotate: '0deg'}], {duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.25)'});
                Array.from(this.body.children).slice(0, 12).forEach((row, i) => row.animate([{opacity: 0, transform: 'translateX(-18px)'}, {opacity: 1, transform: 'none'}], {duration: 280, delay: i * 25, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards'}));
            }
            if (results) { const id = setTimeout(() => { this.cancelSettle = undefined; this.byKills = false; if (!this.root.hidden) this.render(); }, 650); this.cancelSettle = () => clearTimeout(id); }
            return;
        }
        this.cancelSettle?.(); this.cancelSettle = undefined; this.byKills = false;
        if (!uiMotion('paperSlide') || typeof this.root.animate !== 'function') { this.root.hidden = true; return; }
        const exit = this.root.animate([{opacity: 1, translate: '0 0'}, {opacity: 0, translate: '0 -18px'}], {duration: 110, easing: 'ease-in'});
        this.exit = exit;
        exit.onfinish = () => { if (this.exit !== exit) return; this.exit = undefined; this.root.hidden = true; };
    }
    scroll(deltaY: number, deltaX = 0): void {
        if (!this.root.hidden && Number.isFinite(deltaY) && Number.isFinite(deltaX)) {
            this.scroller.scrollTop += deltaY; this.scroller.scrollLeft += deltaX;
        }
    }
    receive(message: ServerMessage): void {
        if (this.disposed) return;
        switch (message.type) {
            case 'welcome':
                this.myId = message.id; this.state = undefined; this.assignment = message.round.assignment;
                this.players = new Map(Object.values(message.players).map(p => [p.id, {...p}]));
                this.setVisible(false); break;
            case 'playerJoined': this.players.set(message.player.id, {...message.player}); break;
            case 'playerLeft': this.players.delete(message.id); break;
            case 'playerDamaged': this.health(message.id, message.hp); break;
            case 'playerDied': this.health(message.victimId, 0); break;
            case 'playerRespawn': this.health(message.id, message.hp); break;
            case 'scoreboardUpdate':
                this.players = new Map(message.scores.map(p => [p.id, {...p, hp: this.players.get(p.id)?.hp}])); break;
            case 'chaos': this.state = message.state; this.assignment = message.state.assignment; break;
            case 'gameWon': this.assignment = message.assignment; break;
            case 'gameReset':
                this.state = undefined; this.assignment = message.round.assignment;
                for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; }
                break;
            default: return;
        }
        if (!this.root.hidden) this.render();
    }
    private health(id: string, hp: PlayerData['hp']): void {
        const p = this.players.get(id); if (p) p.hp = hp;
    }
    private render(): void {
        const assignment = this.assignment, mode = assignment?.id;
        const held = (id: string) => Math.max(0, this.state?.possession[id] ?? 0);
        const points = (id: string) => mode==='jurisdiction'?(assignment?.jurisdiction?.heldMs[id]??0)/1000:mode === 'chain-of-custody' ? assignment?.deliveries[id] ?? 0 : assignment?.caseKills[id] ?? 0;
        const winner = assignment?.result?.winnerId;
        const rows = [...this.players.values()].sort((a, b) => this.byKills ? b.kills - a.kills || a.name.localeCompare(b.name) || a.id.localeCompare(b.id) : Number(b.id === winner) - Number(a.id === winner) ||
            (mode ? points(b.id) - points(a.id) : b.kills - a.kills) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        const totalHeld = rows.reduce((sum, p) => sum + held(p.id), 0);
        const totalKills = rows.reduce((sum, p) => sum + p.kills, 0);
        text(this.title, assignment?.result ? 'CASE CLOSED' : 'ROUND STATS');
        text(this.summary, `${rows.length} INVESTIGATORS · ${totalKills} KILLS`);
        text(this.mode, mode ? ASSIGNMENTS[mode].title : 'DEATHMATCH');
        text(this.context, assignment?.result ? `${assignment.result.winnerName} WINS` : assignment?.phase === 'suspended' ? 'TAMPERING · OBJECTIVE PAUSED' :
            mode === 'jurisdiction' ? 'FIRST TO 60 ZONE POINTS' : mode === 'chain-of-custody' ? 'FIRST TO 3 DELIVERIES' : mode === 'excessive-force' ? 'FIRST TO 10 CASE KILLS' : 'THIS ROUND');
        const columns = ['#', 'INVESTIGATOR', ...(mode === 'jurisdiction' ? ['ZONE POINTS'] : mode === 'excessive-force' ? ['CASE KILLS'] : mode === 'chain-of-custody' ? ['DELIVERIES'] : []), 'KILLS', 'DEATHS', 'K/D', 'CASE TIME', 'CASE SHARE', 'STATUS'];
        const columnSignature = columns.join('|');
        if (columnSignature !== this.columns) {
            this.columns = columnSignature; this.head.replaceChildren();
            const row = this.doc.createElement('tr');
            columns.forEach((value, i) => {
                const cell = this.doc.createElement('th'); cell.scope = 'col'; cell.textContent = value;
                cell.className = i === 1 ? 'investigator-column' : value === 'STATUS' ? 'status-column' : '';
                row.appendChild(cell);
            });
            this.head.appendChild(row);
        }
        const view = rows.map((p, i) => {
            const local = p.id === this.myId;
            const holder = p.id === this.state?.case.owner;
            const status = p.id === winner ? 'WINNER' : p.hp === 0 ? 'RAT DOWN' : holder ? 'ON THE CASE' : p.hp === undefined ? 'IN THE CITY' : `${p.hp} / ${MAX_HP} HP`;
            return {id: p.id, local, holder, down: p.hp === 0, name: p.name, tag: local ? 'YOU' : '',
                cells: [String(i + 1), ...(mode === 'jurisdiction' ? [`${Math.floor(points(p.id))} / 60`] : mode === 'excessive-force' ? [`${points(p.id)} / 10`] : mode === 'chain-of-custody' ? [`${points(p.id)} / 3`] : []),
                    String(p.kills), String(p.deaths), p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills ? '∞' : '—',
                    this.state ? caseTime(held(p.id)) : '—', this.state && totalHeld ? `${Math.round(held(p.id) / totalHeld * 100)}%` : '—', status]};
        });
        // Stable snapshots must not churn the table or reset its scroll position.
        const signature = JSON.stringify([mode, view]);
        if (signature !== this.signature) {
            this.signature = signature;
            const active = new Set(view.map(p=>p.id));
            for(const id of this.renderedRows.keys())if(!active.has(id))this.renderedRows.delete(id);
            const ordered = view.map(p => {
                const rowSignature=JSON.stringify([mode,p]);
                const cached=this.renderedRows.get(p.id);
                if(cached?.signature===rowSignature)return cached.row;
                // Rows keep their element per rat so a rank change slides (U9) rather than swapping nodes.
                const row = cached?.row ?? this.doc.createElement('tr'), parts: HTMLElement[] = []; row.dataset.player = p.id;
                row.dataset.local = String(p.local); row.dataset.carrier = String(p.holder); row.dataset.down = String(p.down);
                p.cells.forEach((value, i) => {
                    if (i === 1) {
                        const name = this.doc.createElement('th'); name.scope = 'row'; name.className = 'investigator-name';
                        const label = this.doc.createElement('span'); label.textContent = p.name;
                        name.appendChild(label);
                        if(p.tag){const tag=this.doc.createElement('small');tag.textContent=p.tag;name.appendChild(tag);}
                        parts.push(name);
                    }
                    const cell = this.doc.createElement('td'); cell.textContent = value;
                    if (i === p.cells.length - 1) cell.className = 'investigator-status';
                    else if (i === 1 && mode) cell.className = 'investigator-objective';
                    parts.push(cell);
                });
                row.replaceChildren(...parts);
                this.renderedRows.set(p.id,{row,signature:rowSignature});return row;
            });
            arrange(this.body, ordered, 'paperSlide', 340, false);
        }
        const rank = rows.findIndex(p => p.id === this.myId) + 1;
        text(this.footer, `${rank ? `YOU #${rank} · ` : ''}${caseTime(totalHeld)} TOTAL CASE TIME`);
        this.root.dataset.crowded = String(rows.length > 16);
    }
    dispose(): void {
        if (this.disposed) return;
        this.setVisible(false); this.exit?.cancel(); this.cancelSettle?.(); this.root.hidden = true; this.disposed = true; this.players.clear(); this.renderedRows.clear(); this.root.remove();
    }
}
