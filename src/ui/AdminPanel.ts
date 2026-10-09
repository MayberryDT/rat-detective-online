import { ASSIGNMENT_IDS, ASSIGNMENTS } from '../shared/assignments';
import { PICKUP_COPY, PICKUP_KINDS } from '../shared/pickups';
import { incidentInfo, type IncidentId } from '../shared/incidentCatalog';
import type { AdminCommand, AdminResult, AdminStatus } from '../shared/admin';
import type { ClientMessage } from '../shared/networkProtocol';
import { ADMIN_OPEN_EVENT, storedAdminKey } from './adminKey';
import './adminPanel.css';

const PHASE: Record<AdminStatus['incident']['phase'], string> = { ready: 'none', rolling: 'rolling', active: 'active', cooldown: 'cooling down' };

/** F10 in a match, with a saved admin key: a small dark panel of the room's admin commands. The sheet is built on the
 * first F10, so a browser without a key never builds it. Nothing here touches the admin's own rat. */
export class AdminPanel {
    private sheet?: AdminSheet;
    private readonly events = new AbortController();
    constructor(private readonly doc: Document, private readonly send: (message: ClientMessage) => boolean,
        private readonly available: () => boolean, private readonly toggled: (open: boolean) => void) {
        doc.addEventListener('keydown', event => {
            if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
            // F10, or ` (backquote) where the OS, a laptop's Fn row or the browser takes F10.
            if ((event.code === 'F10' || event.code === 'Backquote') && (this.isOpen || storedAdminKey() && this.available())) { event.preventDefault(); this.setOpen(!this.isOpen); }
            else if (event.code === 'Escape' && this.isOpen) { event.preventDefault(); this.setOpen(false); }
        }, { signal: this.events.signal, capture: true });
        // Settings' OPEN ADMIN PANEL (after Settings has closed itself).
        doc.addEventListener(ADMIN_OPEN_EVENT, () => { if (!this.isOpen && storedAdminKey() && this.available()) this.setOpen(true); }, { signal: this.events.signal });
    }
    get isOpen(): boolean { return !!this.sheet?.isOpen; }
    setOpen(open: boolean): void { (this.sheet ??= new AdminSheet(this.doc, this.send, this.toggled)).setOpen(open); }
    /** A new connection (the panel stays as it is): the room has to see the key again. */
    reset(): void { this.sheet?.reset(); }
    receive(result: AdminResult): void { this.sheet?.receive(result); }
    dispose(): void { this.events.abort(); this.sheet?.dispose(); }
}

/** The panel itself. The socket sends the key with its commands until the room answers with a status (then the room
 * knows it is an admin), and again after a reconnect. */
class AdminSheet {
    readonly root: HTMLElement;
    private readonly lines: HTMLElement;
    private readonly note: HTMLElement;
    private readonly modes: HTMLSelectElement;
    private readonly incidents: HTMLSelectElement;
    private readonly end: HTMLButtonElement;
    private authed = false;
    private armedUntil = 0;
    private refresh = 0;
    private status?: AdminStatus;
    private readonly events = new AbortController();

    constructor(private readonly doc: Document, private readonly send: (message: ClientMessage) => boolean,
        private readonly toggled: (open: boolean) => void) {
        const signal = this.events.signal;
        this.root = doc.createElement('section'); this.root.className = 'admin-panel'; this.root.hidden = true;
        this.root.setAttribute('aria-label', 'Admin controls');
        const heading = doc.createElement('h3'); heading.textContent = 'ADMIN'; this.root.appendChild(heading);
        this.lines = doc.createElement('dl'); this.root.appendChild(this.lines);
        const button = (parent: HTMLElement, label: string, run: () => void) => {
            const b = doc.createElement('button'); b.type = 'button'; b.textContent = label;
            b.addEventListener('click', run, { signal }); parent.appendChild(b); return b;
        };
        const row = () => { const r = doc.createElement('div'); r.className = 'admin-row'; this.root.appendChild(r); return r; };
        this.end = button(row(), 'End round · leader wins', () => this.endRound());
        const modeRow = row();
        this.modes = doc.createElement('select'); this.modes.setAttribute('aria-label', 'Next mode'); modeRow.appendChild(this.modes);
        for (const id of ASSIGNMENT_IDS) { const o = doc.createElement('option'); o.value = id; o.textContent = ASSIGNMENTS[id].title; this.modes.appendChild(o); }
        button(modeRow, 'Set next mode', () => { const mode = ASSIGNMENT_IDS.find(id => id === this.modes.value); if (mode) this.command({ command: 'next-mode', mode }); });
        const incidentRow = row();
        this.incidents = doc.createElement('select'); this.incidents.setAttribute('aria-label', 'Incident'); incidentRow.appendChild(this.incidents);
        button(incidentRow, 'Roll', () => {
            const id = this.status?.incidents.find(incident => incident === this.incidents.value);
            this.command(id ? { command: 'incident', incident: id } : { command: 'incident' });
        });
        button(incidentRow, 'End incident', () => this.command({ command: 'end-incident' }));
        button(row(), 'Reset case', () => this.command({ command: 'reset-case' }));
        const giveRow = row(), give = doc.createElement('select'); give.setAttribute('aria-label', 'Pickup'); giveRow.appendChild(give);
        for (const kind of PICKUP_KINDS) { const o = doc.createElement('option'); o.value = kind; o.textContent = PICKUP_COPY[kind].title; give.appendChild(o); }
        button(giveRow, 'Give me', () => { const kind = PICKUP_KINDS.find(k => k === give.value); if (kind) this.command({ command: 'give', kind }); });
        this.note = doc.createElement('p'); this.note.className = 'admin-note'; this.note.setAttribute('role', 'status'); this.root.appendChild(this.note);
        const hint = doc.createElement('small'); hint.textContent = 'F10, ` or Esc closes'; this.root.appendChild(hint);
        doc.body.appendChild(this.root);
        this.fillIncidents([]);
    }
    get isOpen(): boolean { return !this.root.hidden; }
    setOpen(open: boolean): void {
        if (open === this.isOpen) return;
        this.root.hidden = !open;
        clearInterval(this.refresh);
        if (open) {
            this.note.textContent = '';
            this.command({ command: 'status' });
            this.refresh = window.setInterval(() => this.command({ command: 'status' }), 5_000);
        }
        this.toggled(open);
    }
    reset(): void { this.authed = false; }
    receive(result: AdminResult): void {
        // Only an admin socket gets a status back.
        if (result.status) { this.authed = true; this.show(result.status); }
        if (result.message !== 'Status.' || !result.ok) this.note.textContent = result.message;
        this.note.dataset.ok = String(result.ok);
    }
    private command(command: AdminCommand): void {
        const token = storedAdminKey();
        if (!token) { this.note.textContent = 'No admin key on this browser.'; return; }
        if (!this.send({ type: 'admin', ...(this.authed ? {} : { token }), command })) this.note.textContent = 'Not connected.';
    }
    /** Ending a round for everyone takes a second press within three seconds. */
    private endRound(): void {
        const now = performance.now();
        if (now > this.armedUntil) { this.armedUntil = now + 3_000; this.end.textContent = 'Press again to end the round'; return; }
        this.armedUntil = 0; this.end.textContent = 'End round · leader wins';
        this.command({ command: 'end-round' });
    }
    private fillIncidents(ids: readonly IncidentId[]): void {
        this.incidents.replaceChildren();
        const random = this.doc.createElement('option'); random.value = ''; random.textContent = 'Random incident'; this.incidents.appendChild(random);
        for (const id of ids) { const o = this.doc.createElement('option'); o.value = id; o.textContent = incidentInfo(id).title; this.incidents.appendChild(o); }
    }
    private show(status: AdminStatus): void {
        if (performance.now() > this.armedUntil) this.end.textContent = 'End round · leader wins';
        const before = this.status?.incidents.join();
        this.status = status;
        if (status.incidents.join() !== before) { const chosen = this.incidents.value; this.fillIncidents(status.incidents); this.incidents.value = chosen; }
        const incident = status.incident.id && status.incident.phase !== 'ready' ? `${incidentInfo(status.incident.id).title} · ${PHASE[status.incident.phase]}${status.incident.leftMs ? ` · ${Math.ceil(status.incident.leftMs / 1000)} s` : ''}` : PHASE[status.incident.phase];
        const rows: Array<[string, string]> = [
            ['Room', status.room], ['Round', status.phase === 'won' ? 'results' : status.mode ? ASSIGNMENTS[status.mode].title : 'starting'],
            ['Next', status.nextMode ? ASSIGNMENTS[status.nextMode].title : 'shuffle'], ['Leader', status.leader ?? 'nobody'],
            ['Incident', incident], ['Rats', `${status.humans} human · ${status.bots} bot`],
        ];
        this.lines.replaceChildren();
        for (const [term, value] of rows) {
            const dt = this.doc.createElement('dt'); dt.textContent = term;
            const dd = this.doc.createElement('dd'); dd.textContent = value;
            this.lines.appendChild(dt); this.lines.appendChild(dd);
        }
    }
    dispose(): void { clearInterval(this.refresh); this.events.abort(); this.root.remove(); }
}
