import {ASSIGNMENTS, objectiveTarget, type AssignmentId, type AssignmentState} from '../shared/assignments';
import type {ChaosState} from '../shared/chaosState';
import {MAX_HP, type PlayerData, type ReportRat, type RoundReport, type ScoreEntry, type ServerMessage} from '../shared/networkProtocol';
import './matchScoreboard.css';
import type {FeedbackCue} from '../audio/FeedbackAudio';
import {arrange, uiMotion} from './motion';
import {accuracy, caseTime, killsPerMinute, objectivePoints, objectiveUnit, raceScale, raceSvg, raceTime, ratFile, roundTallies} from './roundStats';

type Investigator = ScoreEntry & {hp?: number};
const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
/** The race's inks: the winner in cheese, you in stamp red, everyone else in faded carbon. */
const RACE_INKS = {winner: '#d9b95e', you: '#e65a50', others: ['#9fcfd6', '#b5cfa6', '#cdbfae', '#b9c9ec']};
/** Round end, frozen at the finish: the next round may start underneath while you read. */
interface Final { winnerId?: string; assignment?: AssignmentState; report?: RoundReport; players: Investigator[] }
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
    private readonly dossier: HTMLElement;
    private readonly footer: HTMLElement;
    private readonly hints: {desktop: HTMLElement; touch: HTMLElement};
    /** Results: a rat's whole round, shown while the pointer is on its name, its Case File award or its race line. */
    private readonly card: HTMLElement;
    private cardFor = '';
    private readonly events = new AbortController();
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
    /** Round end: the final standings and report, kept until the reader leaves them (`closeResults`). */
    private final?: Final;
    private reportRats = new Map<string, ReportRat>();
    private drawnRace?: RoundReport;

    constructor(private readonly doc: Document = document, private readonly cue: (cue: FeedbackCue) => void = () => {}) {
        this.root = doc.createElement('section');
        this.root.className = 'match-scoreboard';
        this.root.hidden = true;
        this.root.setAttribute('aria-label', 'Full lobby scoreboard');
        this.root.innerHTML = `<header class="match-scoreboard-heading"><div><small>DEPARTMENT PERSONNEL FILE</small><h2>ROUND STATS</h2></div><p class="match-scoreboard-summary"></p></header><div class="match-scoreboard-mode"><strong></strong><span></span></div><div class="match-scoreboard-scroll"><table aria-label="Every investigator in this round"><thead></thead><tbody></tbody></table><figure class="match-scoreboard-race" hidden></figure><div class="match-scoreboard-dossier" hidden></div></div><footer><span></span><b class="scoreboard-desktop-hint"></b><b class="scoreboard-touch-hint"></b></footer>`;
        const get = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
        this.title = get('h2'); this.summary = get('.match-scoreboard-summary');
        this.mode = get('.match-scoreboard-mode strong'); this.context = get('.match-scoreboard-mode span');
        this.head = get('thead'); this.body = get('tbody'); this.scroller = get('.match-scoreboard-scroll');
        this.race = get('.match-scoreboard-race'); this.dossier = get('.match-scoreboard-dossier'); this.footer = get('footer span');
        this.hints = {desktop: get('.scoreboard-desktop-hint'), touch: get('.scoreboard-touch-hint')};
        this.card = doc.createElement('aside'); this.card.className = 'rat-file-card'; this.card.hidden = true;
        const options = {signal: this.events.signal};
        // The card follows the pointer over any `[data-rat]` on the results (standings names, Case File awards, race legend).
        for (const type of ['pointermove', 'pointerdown'] as const) doc.addEventListener(type, event => this.pointCard(event), options);
        // A wheel anywhere on the results that is not already over the standings scrolls them.
        doc.addEventListener('wheel', event => {
            if (!this.final || this.root.hidden || this.root.contains(event.target as Node | null)) return;
            this.scroll((event.shiftKey ? 0 : event.deltaY) * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? 400 : 1));
        }, {...options, passive: true});
        doc.body.appendChild(this.root); doc.body.appendChild(this.card);
    }

    private get results(): boolean { return !!this.final || !!this.assignment?.result; }
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
                this.final = message.round.phase === 'won' ? {winnerId: message.round.winnerId, assignment: message.round.assignment, players: [...this.players.values()].map(p => ({...p}))} : undefined;
                this.reportRats.clear(); this.setVisible(false); break;
            case 'playerJoined': this.players.set(message.player.id, {...message.player}); break;
            case 'playerLeft': this.players.delete(message.id); break;
            case 'playerDamaged': this.health(message.id, message.hp); break;
            case 'playerDied': this.health(message.victimId, 0); break;
            case 'playerRespawn': this.health(message.id, message.hp); break;
            case 'scoreboardUpdate':
                this.players = new Map(message.scores.map(p => [p.id, {...p, hp: this.players.get(p.id)?.hp}])); break;
            case 'chaos': this.state = message.state; this.assignment = message.state.assignment; break;
            case 'gameWon': {
                this.assignment = message.assignment; this.reportRats = new Map(message.report?.rats.map(rat => [rat.id, rat]));
                // The standings as they finished: the next round may reset the live totals while this sheet is still read.
                const players = [...this.players.values()].map(p => { const line = this.reportRats.get(p.id); return line ? {...p, kills: line.kills, deaths: line.deaths} : {...p}; });
                this.final = {winnerId: message.winnerId, assignment: message.assignment, report: message.report, players};
                break;
            }
            case 'gameReset':
                this.state = undefined; this.assignment = message.round.assignment;
                for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; }
                break;
            default: return;
        }
        if (!this.root.hidden) this.render();
    }
    /** The reader leaves the results: the sheet goes back to the live round. */
    closeResults(): void {
        this.final = undefined; this.reportRats.clear(); this.card.hidden = true; this.cardFor = '';
        if (!this.root.hidden) this.render();
    }
    private health(id: string, hp: PlayerData['hp']): void {
        const p = this.players.get(id); if (p) p.hp = hp;
    }
    private render(): void {
        const final = this.final, assignment = final ? final.assignment : this.assignment, mode = assignment?.id, results = this.results;
        const held = (id: string) => Math.max(0, this.state?.possession[id] ?? 0);
        const points = (id: string) => assignment ? objectivePoints(assignment, id) : 0;
        const winner = assignment?.result?.winnerId ?? final?.winnerId;
        const rows = (final?.players ?? [...this.players.values()]).sort((a, b) => this.byKills ? b.kills - a.kills || a.name.localeCompare(b.name) || a.id.localeCompare(b.id) : Number(b.id === winner) - Number(a.id === winner) ||
            (mode ? points(b.id) - points(a.id) : b.kills - a.kills) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        const totalHeld = rows.reduce((sum, p) => sum + held(p.id), 0);
        const totalKills = rows.reduce((sum, p) => sum + p.kills, 0);
        text(this.title, results ? 'FINAL STANDINGS' : 'ROUND STATS');
        text(this.summary, `${rows.length} INVESTIGATORS · ${totalKills} KILLS`);
        text(this.mode, mode ? ASSIGNMENTS[mode].title : 'DEATHMATCH');
        text(this.context, assignment?.result ? `${assignment.result.winnerName} WINS` : assignment?.phase === 'suspended' ? 'TAMPERING · OBJECTIVE PAUSED' :
            mode ? `FIRST TO ${objectiveTarget(mode)} ${objectiveUnit(mode)}` : 'THIS ROUND');
        const objective = mode ? [objectiveUnit(mode)] : [];
        const columns = results ? ['#', 'INVESTIGATOR', ...objective, 'KILLS', 'DEATHS', 'ASSISTS', 'KILLS / MIN', 'ACCURACY', 'DAMAGE DEALT', 'CASE TIME']
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
            const line = this.reportRats.get(p.id), time = results && line ? caseTime(line.caseSeconds) : this.state ? caseTime(held(p.id)) : '—';
            const goal = mode ? [`${Math.floor(points(p.id))} / ${objectiveTarget(mode)}`] : [];
            const status = p.id === winner ? 'WINNER' : p.hp === 0 ? 'RAT DOWN' : holder ? 'ON THE CASE' : p.hp === undefined ? 'IN THE CITY' : `${p.hp} / ${MAX_HP} HP`;
            const tags = [...(results && p.id === winner ? ['WINNER'] : []), ...(local ? ['YOU'] : [])];
            return {id: p.id, local, holder, winner: results && p.id === winner, down: !results && p.hp === 0, name: p.name, tags,
                cells: results
                    ? [String(i + 1), ...goal, String(p.kills), String(p.deaths), line ? String(line.assists) : '—', line ? killsPerMinute(line) : '—',
                        line ? accuracy(line) : '—', line ? String(line.dealt) : '—', time]
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
                        const name = this.doc.createElement('th'); name.scope = 'row'; name.className = 'investigator-name'; name.dataset.rat = p.id;
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
        const report = results ? final?.report : undefined;
        if (report !== this.drawnRace) { this.drawRace(report, winner, mode, rows); this.drawDossier(report); }
        const rank = rows.findIndex(p => p.id === this.myId) + 1, mine = results ? this.reportRats.get(this.myId) : undefined;
        const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
        text(this.footer, mine ? [`YOU #${rank}`, `${mine.hits} OF ${count(mine.shots, 'SHOT', 'SHOTS')} HIT`, `${mine.dealt} DEALT`, `${mine.damage} TAKEN`].join(' · ')
            : `${rank ? `YOU #${rank} · ` : ''}${caseTime(totalHeld)} TOTAL CASE TIME`);
        text(this.hints.desktop, report ? 'HOVER A NAME FOR ITS FILE · SCROLL FOR MORE' : 'HOLD TAB · SCROLL TO BROWSE');
        text(this.hints.touch, report ? 'TAP A NAME FOR ITS FILE · SWIPE FOR MORE' : 'SWIPE TO BROWSE');
        this.root.dataset.crowded = String(rows.length > 16); this.root.dataset.results = String(results);
    }
    /** The race: the leading rats' objective progress over the round, a line each, with a legend of names
     * (text, never markup) and their final scores. The plot holds only numbers; pointing at it reads every line there. */
    private drawRace(report: RoundReport | undefined, winner: string | undefined, mode: AssignmentId | undefined, rows: readonly Investigator[]): void {
        this.drawnRace = report;
        const race = report?.race;
        this.race.hidden = !race;
        if (!report || !race) { this.race.replaceChildren(); return; }
        const {end, goal} = raceScale(report, mode), count = race.points[0]!.length;
        const nameOf = (id: string) => rows.find(p => p.id === id)?.name ?? this.reportRats.get(id)?.name ?? '—';
        const order = race.ids.map((id, i) => ({id, i, ink: id === winner ? RACE_INKS.winner : id === this.myId ? RACE_INKS.you : RACE_INKS.others[i % RACE_INKS.others.length]!}));
        const caption = this.doc.createElement('figcaption');
        caption.textContent = `THE RACE TO ${goal} ${mode ? objectiveUnit(mode) : 'KILLS'}`;
        const plot = this.doc.createElement('div'); plot.className = 'race-plot';
        // Your line and the winner's are drawn last, on top.
        plot.innerHTML = raceSvg(report, mode, [...order].sort((a, b) => Number(a.id === winner || a.id === this.myId) - Number(b.id === winner || b.id === this.myId))
            .map(({id, i, ink}) => ({i, ink, bold: id === winner || id === this.myId})));
        const cursor = this.doc.createElement('i'), tip = this.doc.createElement('div');
        cursor.className = 'race-cursor'; tip.className = 'race-tip'; cursor.hidden = tip.hidden = true;
        const axis = this.doc.createElement('div'); axis.className = 'race-axis';
        for (const label of ['0:00', caseTime(end)]) { const tick = this.doc.createElement('span'); tick.textContent = label; axis.appendChild(tick); }
        plot.appendChild(cursor); plot.appendChild(tip); plot.appendChild(axis);
        const point = (event: PointerEvent) => {
            const box = plot.querySelector('svg')?.getBoundingClientRect();
            if (!box?.width) return;
            const at = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * end;
            let j = 0;
            for (let k = 1; k < count; k++) if (Math.abs(raceTime(report, k, end) - at) < Math.abs(raceTime(report, j, end) - at)) j = k;
            const x = raceTime(report, j, end) / end;
            cursor.hidden = tip.hidden = false; cursor.style.left = `${x * 100}%`;
            tip.style.left = `${x * 100}%`; tip.classList.toggle('flip', x > .6);
            const time = this.doc.createElement('b'); time.textContent = caseTime(raceTime(report, j, end));
            const lines = order.map(({id, i, ink}) => ({id, ink, value: race.points[i]![j]!})).sort((a, b) => b.value - a.value).map(({id, ink, value}) => {
                const row = this.doc.createElement('span'), swatch = this.doc.createElement('i'), score = this.doc.createElement('em');
                swatch.style.background = ink; score.textContent = String(Math.floor(value));
                row.appendChild(swatch); row.append(nameOf(id)); row.appendChild(score); return row;
            });
            tip.replaceChildren(time, ...lines);
        };
        plot.addEventListener('pointermove', point); plot.addEventListener('pointerdown', point);
        plot.addEventListener('pointerleave', () => { cursor.hidden = tip.hidden = true; });
        const legend = this.doc.createElement('ol'); legend.className = 'race-legend';
        for (const {id, i, ink} of order) {
            const item = this.doc.createElement('li'), swatch = this.doc.createElement('i'), name = this.doc.createElement('span'), score = this.doc.createElement('b');
            const line = race.points[i]!; swatch.style.background = ink; name.textContent = nameOf(id); score.textContent = String(Math.floor(line[line.length - 1]!));
            item.dataset.local = String(id === this.myId); item.dataset.winner = String(id === winner); item.dataset.rat = id;
            item.appendChild(swatch); item.appendChild(name); item.appendChild(score); legend.appendChild(item);
        }
        this.race.replaceChildren(caption, plot, legend);
    }
    /** Below the race: the round's incidents and its kills, deaths and supplies by kind. */
    private drawDossier(report: RoundReport | undefined): void {
        this.dossier.hidden = !report;
        if (!report) { this.dossier.replaceChildren(); return; }
        this.dossier.replaceChildren(...roundTallies(report).map(({title, rows}) => {
            const block = this.doc.createElement('section'), heading = this.doc.createElement('h4'), list = this.doc.createElement('ul');
            heading.textContent = title;
            for (const [label, n] of rows.length ? rows : [['NONE', 0] as [string, number]]) {
                const item = this.doc.createElement('li'), name = this.doc.createElement('span'), value = this.doc.createElement('b');
                name.textContent = label; value.textContent = rows.length ? String(n) : '';
                item.appendChild(name); item.appendChild(value); list.appendChild(item);
            }
            block.appendChild(heading); block.appendChild(list); return block;
        }));
    }
    /** The rat file card: on a `[data-rat]` (a name, an award or a legend line) while the results are up, that rat's whole round. */
    private pointCard(event: PointerEvent): void {
        // Every pointer move in play passes here: nothing to look up unless the results are up.
        const target = this.final ? (event.target as Element | null)?.closest?.<HTMLElement>('[data-rat]') : undefined;
        const line = target ? this.reportRats.get(target.dataset.rat ?? '') : undefined;
        if (!line) { if (!this.card.hidden) { this.card.hidden = true; this.cardFor = ''; } return; }
        if (this.cardFor !== line.id) {
            this.cardFor = line.id;
            const heading = this.doc.createElement('h4'), list = this.doc.createElement('dl');
            heading.textContent = line.name;
            heading.classList.toggle('winner', line.id === this.final?.winnerId || line.id === this.final?.assignment?.result?.winnerId);
            heading.classList.toggle('you', line.id === this.myId);
            for (const [label, value] of ratFile(line)) {
                const term = this.doc.createElement('dt'), detail = this.doc.createElement('dd');
                term.textContent = label; detail.textContent = value; list.appendChild(term); list.appendChild(detail);
            }
            this.card.replaceChildren(heading, list);
        }
        this.card.hidden = false;
        // Beside the pointer, kept on screen.
        const view = this.doc.defaultView, w = this.card.offsetWidth, h = this.card.offsetHeight;
        const x = event.clientX + 18 + w > (view?.innerWidth ?? Infinity) ? event.clientX - 18 - w : event.clientX + 18;
        this.card.style.left = `${Math.max(8, x)}px`; this.card.style.top = `${Math.max(8, Math.min(event.clientY - 12, (view?.innerHeight ?? Infinity) - h - 8))}px`;
    }
    dispose(): void {
        if (this.disposed) return;
        this.setVisible(false); this.exit?.cancel(); this.cancelSettle?.(); this.root.hidden = true; this.disposed = true; this.players.clear(); this.renderedRows.clear(); this.root.remove();
        this.events.abort(); this.card.remove();
    }
}
