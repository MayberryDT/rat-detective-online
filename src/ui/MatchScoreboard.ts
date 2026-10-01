import {ASSIGNMENTS, objectiveTarget, type AssignmentId, type AssignmentState} from '../shared/assignments';
import type {ChaosState} from '../shared/chaosState';
import {KILLS_TO_WIN, MAX_HP, type PlayerData, type ReportRat, type RoundReport, type ScoreEntry, type ServerMessage} from '../shared/networkProtocol';
import './matchScoreboard.css';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {arrange, uiMotion} from './motion';

type Investigator = ScoreEntry & {hp?: number};
const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
export function caseTime(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
/** The race's inks: the winner in cheese, you in stamp red, everyone else in faded carbon. */
const RACE_INKS = {winner: '#d9b95e', you: '#e65a50', others: ['#9fcfd6', '#b5cfa6', '#cdbfae', '#b9c9ec']};
const objectiveUnit = (mode: AssignmentId) => mode === 'jurisdiction' ? 'ZONE POINTS' : mode === 'chain-of-custody' ? 'DELIVERIES' : 'CASE KILLS';

/** Server totals only: opening the board never starts a local stats clock. At round end the
 * same sheet becomes the results standings: the report's columns and the race. */
export class MatchScoreboard {
    private readonly root: HTMLElement;
    private readonly title: HTMLElement;
    private readonly summary: HTMLElement;
    private readonly mode: HTMLElement;
    private readonly context: HTMLElement;
    private readonly head: HTMLElement;
    private readonly body: HTMLElement;
    private readonly scroller: HTMLElement;
    private readonly race: HTMLElement;
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
    /** Round end: the round is won (with or without an assignment) and its report, by rat. */
    private won = false;
    private report?: RoundReport;
    private winnerId?: string;
    private reportRats = new Map<string, ReportRat>();
    private drawnRace?: RoundReport;

    constructor(private readonly doc: Document = document, private readonly cue: (cue: FeedbackCue) => void = () => {}) {
        this.root = doc.createElement('section');
        this.root.className = 'match-scoreboard';
        this.root.hidden = true;
        this.root.setAttribute('aria-label', 'Full lobby scoreboard');
        this.root.innerHTML = `<header class="match-scoreboard-heading"><div><small>DEPARTMENT PERSONNEL FILE</small><h2>ROUND STATS</h2></div><p class="match-scoreboard-summary"></p></header><div class="match-scoreboard-mode"><strong></strong><span></span></div><div class="match-scoreboard-scroll"><table aria-label="Every investigator in this round"><thead></thead><tbody></tbody></table></div><figure class="match-scoreboard-race" hidden></figure><footer><span></span><b class="scoreboard-desktop-hint">HOLD TAB · SCROLL TO BROWSE</b><b class="scoreboard-touch-hint">SWIPE TO BROWSE</b></footer>`;
        const get = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
        this.title = get('h2'); this.summary = get('.match-scoreboard-summary');
        this.mode = get('.match-scoreboard-mode strong'); this.context = get('.match-scoreboard-mode span');
        this.head = get('thead'); this.body = get('tbody'); this.scroller = get('.match-scoreboard-scroll');
        this.race = get('.match-scoreboard-race'); this.footer = get('footer span');
        doc.body.appendChild(this.root);
    }

    private get results(): boolean { return this.won || !!this.assignment?.result; }
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
            const settle = this.results && uiMotion('caseFileStamps');
            this.byKills = settle; this.render();
            // The entrance runs once per opening (Web Animations survive later row moves; a CSS class would replay).
            if (uiMotion('paperSlide') && typeof this.root.animate === 'function') {
                this.root.animate([{opacity: 0, translate: '0 -46px', rotate: '-1.5deg'}, {opacity: 1, translate: '0 0', rotate: '0deg'}], {duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.25)'});
                Array.from(this.body.children).slice(0, 12).forEach((row, i) => row.animate([{opacity: 0, transform: 'translateX(-18px)'}, {opacity: 1, transform: 'none'}], {duration: 280, delay: i * 25, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards'}));
            }
            if (settle) { const id = setTimeout(() => { this.cancelSettle = undefined; this.byKills = false; if (!this.root.hidden) this.render(); }, 650); this.cancelSettle = () => clearTimeout(id); }
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
                this.setReport(message.round.phase === 'won', undefined, message.round.winnerId);
                this.setVisible(false); break;
            case 'playerJoined': this.players.set(message.player.id, {...message.player}); break;
            case 'playerLeft': this.players.delete(message.id); break;
            case 'playerDamaged': this.health(message.id, message.hp); break;
            case 'playerDied': this.health(message.victimId, 0); break;
            case 'playerRespawn': this.health(message.id, message.hp); break;
            case 'scoreboardUpdate':
                this.players = new Map(message.scores.map(p => [p.id, {...p, hp: this.players.get(p.id)?.hp}])); break;
            case 'chaos': this.state = message.state; this.assignment = message.state.assignment; break;
            case 'gameWon': this.assignment = message.assignment; this.setReport(true, message.report, message.winnerId); break;
            case 'gameReset':
                this.state = undefined; this.assignment = message.round.assignment; this.setReport(false);
                for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; }
                break;
            default: return;
        }
        if (!this.root.hidden) this.render();
    }
    private setReport(won: boolean, report?: RoundReport, winnerId?: string): void {
        this.won = won; this.report = report; this.winnerId = winnerId;
        this.reportRats = new Map(report?.rats.map(rat => [rat.id, rat]));
    }
    private health(id: string, hp: PlayerData['hp']): void {
        const p = this.players.get(id); if (p) p.hp = hp;
    }
    private render(): void {
        const assignment = this.assignment, mode = assignment?.id, results = this.results;
        const held = (id: string) => Math.max(0, this.state?.possession[id] ?? 0);
        const points = (id: string) => mode==='jurisdiction'?(assignment?.jurisdiction?.heldMs[id]??0)/1000:mode === 'chain-of-custody' ? assignment?.deliveries[id] ?? 0 : assignment?.caseKills[id] ?? 0;
        const winner = assignment?.result?.winnerId ?? (this.won ? this.winnerId : undefined);
        const rows = [...this.players.values()].sort((a, b) => this.byKills ? b.kills - a.kills || a.name.localeCompare(b.name) || a.id.localeCompare(b.id) : Number(b.id === winner) - Number(a.id === winner) ||
            (mode ? points(b.id) - points(a.id) : b.kills - a.kills) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        const totalHeld = rows.reduce((sum, p) => sum + held(p.id), 0);
        const totalKills = rows.reduce((sum, p) => sum + p.kills, 0);
        text(this.title, results ? 'FINAL STANDINGS' : 'ROUND STATS');
        text(this.summary, `${rows.length} INVESTIGATORS · ${totalKills} KILLS`);
        text(this.mode, mode ? ASSIGNMENTS[mode].title : 'DEATHMATCH');
        text(this.context, assignment?.result ? `${assignment.result.winnerName} WINS` : assignment?.phase === 'suspended' ? 'TAMPERING · OBJECTIVE PAUSED' :
            mode ? `FIRST TO ${objectiveTarget(mode)} ${objectiveUnit(mode)}` : 'THIS ROUND');
        const objective = mode ? [objectiveUnit(mode)] : [];
        const columns = results ? ['#', 'INVESTIGATOR', ...objective, 'KILLS', 'DEATHS', 'ACCURACY', 'HEADSHOTS', 'BEST STREAK', 'CASE TIME']
            : ['#', 'INVESTIGATOR', ...objective, 'KILLS', 'DEATHS', 'K/D', 'CASE TIME', 'CASE SHARE', 'STATUS'];
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
            const holder = !results && p.id === this.state?.case.owner;
            const line = this.reportRats.get(p.id), time = this.state ? caseTime(held(p.id)) : line ? caseTime(line.caseSeconds) : '—';
            const goal = mode ? [`${Math.floor(points(p.id))} / ${objectiveTarget(mode)}`] : [];
            const status = p.id === winner ? 'WINNER' : p.hp === 0 ? 'RAT DOWN' : holder ? 'ON THE CASE' : p.hp === undefined ? 'IN THE CITY' : `${p.hp} / ${MAX_HP} HP`;
            const tags = [...(results && p.id === winner ? ['WINNER'] : []), ...(local ? ['YOU'] : [])];
            return {id: p.id, local, holder, winner: results && p.id === winner, down: !results && p.hp === 0, name: p.name, tags,
                cells: results
                    ? [String(i + 1), ...goal, String(p.kills), String(p.deaths), line?.shots ? `${Math.round(line.hits / line.shots * 100)}%` : '—',
                        line ? String(line.headshots) : '—', line ? String(line.streak) : '—', time]
                    : [String(i + 1), ...goal, String(p.kills), String(p.deaths), p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills ? '∞' : '—',
                        time, this.state && totalHeld ? `${Math.round(held(p.id) / totalHeld * 100)}%` : '—', status]};
        });
        // Stable snapshots must not churn the table or reset its scroll position.
        const signature = JSON.stringify([mode, results, view]);
        if (signature !== this.signature) {
            this.signature = signature;
            const active = new Set(view.map(p=>p.id));
            for(const id of this.renderedRows.keys())if(!active.has(id))this.renderedRows.delete(id);
            const ordered = view.map(p => {
                const rowSignature=JSON.stringify([mode,results,p]);
                const cached=this.renderedRows.get(p.id);
                if(cached?.signature===rowSignature)return cached.row;
                // Rows keep their element per rat so a rank change slides (U9) rather than swapping nodes.
                const row = cached?.row ?? this.doc.createElement('tr'), parts: HTMLElement[] = []; row.dataset.player = p.id;
                row.dataset.local = String(p.local); row.dataset.carrier = String(p.holder); row.dataset.down = String(p.down); row.dataset.winner = String(p.winner);
                p.cells.forEach((value, i) => {
                    if (i === 1) {
                        const name = this.doc.createElement('th'); name.scope = 'row'; name.className = 'investigator-name';
                        const label = this.doc.createElement('span'); label.textContent = p.name;
                        name.appendChild(label);
                        for(const tag of p.tags){const small=this.doc.createElement('small');small.textContent=tag;name.appendChild(small);}
                        parts.push(name);
                    }
                    const cell = this.doc.createElement('td'); cell.textContent = value;
                    if (!results && i === p.cells.length - 1) cell.className = 'investigator-status';
                    else if (i === 1 && mode) cell.className = 'investigator-objective';
                    parts.push(cell);
                });
                row.replaceChildren(...parts);
                this.renderedRows.set(p.id,{row,signature:rowSignature});return row;
            });
            arrange(this.body, ordered, 'paperSlide', 340, false);
        }
        if (results ? this.report !== this.drawnRace : this.drawnRace) this.drawRace(results ? this.report : undefined, winner);
        const rank = rows.findIndex(p => p.id === this.myId) + 1, mine = results ? this.reportRats.get(this.myId) : undefined;
        const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
        text(this.footer, mine ? [`YOU #${rank}`, `${mine.hits} OF ${count(mine.shots, 'SHOT', 'SHOTS')} HIT`, ...(mine.longest ? [`LONGEST KILL ${mine.longest} M`] : []),
            count(mine.supplies, 'SUPPLY', 'SUPPLIES'), count(mine.flights, 'FLIGHT', 'FLIGHTS'), `${mine.damage} DAMAGE TAKEN`].join(' · ')
            : `${rank ? `YOU #${rank} · ` : ''}${caseTime(totalHeld)} TOTAL CASE TIME`);
        this.root.dataset.crowded = String(rows.length > 16); this.root.dataset.results = String(results);
    }
    /** The race: the leading rats' objective progress over the round, a line each, with a legend of names
     * (text, never markup) and their final scores. The plot holds only numbers. */
    private drawRace(report: RoundReport | undefined, winner: string | undefined): void {
        this.drawnRace = report;
        const race = report?.race, mode = this.assignment?.id;
        this.race.hidden = !race;
        if (!report || !race) { this.race.replaceChildren(); return; }
        const count = race.points[0]!.length, end = Math.max(report.seconds, (count - 2) * race.step, 1);
        const goal = mode ? objectiveTarget(mode) : KILLS_TO_WIN, top = Math.max(goal, ...race.points.flat());
        const W = 600, H = 100, x = (i: number) => (i === count - 1 ? end : Math.min(end, i * race.step)) / end * W, y = (v: number) => H - v / top * H;
        const order = race.ids.map((id, i) => ({id, i, ink: id === winner ? RACE_INKS.winner : id === this.myId ? RACE_INKS.you : RACE_INKS.others[i % RACE_INKS.others.length]!}));
        // Your line and the winner's are drawn last, on top.
        const lines = [...order].sort((a, b) => Number(a.id === winner || a.id === this.myId) - Number(b.id === winner || b.id === this.myId)).map(({id, i, ink}) =>
            `<polyline fill="none" stroke="${ink}" stroke-width="${id === winner || id === this.myId ? 3 : 2}" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${race.points[i]!.map((v, j) => `${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`);
        const caption = this.doc.createElement('figcaption');
        caption.textContent = `THE RACE TO ${goal} ${mode ? objectiveUnit(mode) : 'KILLS'}`;
        const plot = this.doc.createElement('div'); plot.className = 'race-plot';
        plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" class="race-goal" vector-effect="non-scaling-stroke"/><line x1="0" x2="${W}" y1="${H}" y2="${H}" class="race-floor" vector-effect="non-scaling-stroke"/>${lines.join('')}</svg>`;
        const axis = this.doc.createElement('div'); axis.className = 'race-axis';
        for (const label of ['0:00', caseTime(end)]) { const tick = this.doc.createElement('span'); tick.textContent = label; axis.appendChild(tick); }
        plot.appendChild(axis);
        const legend = this.doc.createElement('ol'); legend.className = 'race-legend';
        for (const {id, i, ink} of order) {
            const item = this.doc.createElement('li'), swatch = this.doc.createElement('i'), name = this.doc.createElement('span'), score = this.doc.createElement('b');
            const line = race.points[i]!; swatch.style.background = ink; name.textContent = this.players.get(id)?.name ?? '—'; score.textContent = String(Math.floor(line[line.length - 1]!));
            item.dataset.local = String(id === this.myId); item.dataset.winner = String(id === winner);
            item.appendChild(swatch); item.appendChild(name); item.appendChild(score); legend.appendChild(item);
        }
        this.race.replaceChildren(caption, plot, legend);
    }
    dispose(): void {
        if (this.disposed) return;
        this.setVisible(false); this.exit?.cancel(); this.cancelSettle?.(); this.root.hidden = true; this.disposed = true; this.players.clear(); this.renderedRows.clear(); this.root.remove();
    }
}
