import {describe, expect, it} from 'vitest';
import {MatchScoreboard} from '../../src/ui/MatchScoreboard';
import {createAssignment, type AssignmentId} from '../../src/shared/assignments';
import {createPlayer} from '../../src/worker/gameState';
import type {ChaosState} from '../../src/shared/chaosState';
import type {ServerMessage} from '../../src/shared/networkProtocol';
import {PROTOCOL_VERSION} from '../../src/shared/networkProtocol';
import {createWorldSpec} from '../../src/shared/worldSpec';

class Element {
    className = ''; hidden = false; innerHTML = ''; textContent = ''; scope = ''; scrollTop = 0; scrollLeft = 0; removed = false;
    dataset: Record<string, string> = {}; children: Element[] = []; selectors = new Map<string, Element>();
    classes = new Set<string>(); classList = {toggle: (name: string, value: boolean) => value ? this.classes.add(name) : this.classes.delete(name)};
    setAttribute() {} appendChild(node: Element) { this.children.push(node); return node; }
    replaceChildren(...children:Element[]) { this.children = children; } remove() { this.removed = true; }
    querySelector(selector: string) { if (!this.selectors.has(selector)) this.selectors.set(selector, new Element()); return this.selectors.get(selector)!; }
}
function fixture(mode: AssignmentId = 'excessive-force', count = 8) {
    const body = new Element(), doc = {body, createElement: () => new Element()};
    const board = new MatchScoreboard(doc as unknown as Document), root = body.children[0];
    const people = Array.from({length: count}, (_, i) => ({...createPlayer(i === 0 ? 'me' : `rd-ai-${i}`, i === 0 ? '<img onerror="bad">' : `Rat ${i}`,
        {hatType: 'fedora', hatColor: 1, coatColor: 2, furColor: 3}, {x: 0, y: 0, z: 0}), kills: i === 0 ? 19 : i, deaths: i === 0 ? 2 : 0}));
    const assignment = createAssignment(mode, 0); assignment.phase = 'active';
    const state = {time: 10_000, assignment, possession: {me: 30.8, 'rd-ai-1': 90.2}, case: {owner: 'rd-ai-1'}} as unknown as ChaosState;
    board.receive({type: 'welcome', id: 'me', player: people[0], players: Object.fromEntries(people.map(p => [p.id, p])), round: {phase: 'playing', assignment}, world: createWorldSpec(1), protocolVersion: PROTOCOL_VERSION, serverTime: 10_000});
    board.receive({type: 'chaos', state}); board.setAvailable(true);
    const rows = () => root.querySelector('tbody').children;
    const row = (id: string) => rows().find(r => r.dataset.player === id)!;
    const cells = (id: string) => row(id).children.map(c => c.textContent);
    return {board, root, body, state, assignment, people, rows, row, cells};
}
describe('full lobby scoreboard', () => {
    it('shows names and stats without AI counts or identity labels',()=>{
        const f=fixture();f.board.setVisible(true);
        const allText=(node:Element):string=>[node.textContent,...node.children.map(allText),...[...node.selectors.values()].map(allText)].join(' ');
        expect(allText(f.root)).not.toMatch(/\bAI\b|\bPLAYER\b/);
        expect(allText(f.row('rd-ai-1'))).toContain('Rat 1');expect(allText(f.row('me'))).toContain('YOU');
        f.board.dispose();
    });
    it('retains unrelated row elements when one rat takes damage',()=>{
        const f=fixture();f.board.setVisible(true);
        const other=f.row('rd-ai-2'),mine=f.row('me');
        f.board.receive({type:'playerDamaged',id:'me',hp:1,attackerId:'rd-ai-1'});
        expect(f.row('rd-ai-2')).toBe(other);expect(f.row('me')).not.toBe(mine);expect(f.cells('me')).toContain('1 / 3 HP');
        f.board.dispose();
    });
    it.each(['closing-time', 'excessive-force', 'chain-of-custody'] as const)('uses authoritative mode scores and all players in %s', mode => {
        const f = fixture(mode);
        if (mode === 'excessive-force') f.assignment.caseKills = {'rd-ai-1': 7, me: 4};
        if (mode === 'chain-of-custody') f.assignment.deliveries = {'rd-ai-1': 2, me: 1};
        f.board.setVisible(true);
        expect(f.rows()).toHaveLength(8); expect(f.rows()[0].dataset.player).toBe('rd-ai-1');
        expect(f.row('me').dataset.local).toBe('true'); expect(f.row('rd-ai-1').dataset.carrier).toBe('true');
        const mine = f.cells('me'); expect(mine).toContain('19'); expect(mine).toContain('2'); expect(mine).toContain('9.50');
        expect(mine).toContain('0:30'); expect(mine).toContain('25%');
        if (mode !== 'closing-time') expect(mine).toContain(mode === 'excessive-force' ? '4 / 10' : '1 / 3');
        expect(f.cells('rd-ai-1')).toContain('∞'); expect(f.cells('rd-ai-1')).toContain('1:30');
        const name = f.row('me').children[1]; expect(name.children[0].textContent).toBe('<img onerror="bad">'); expect(name.children[0].innerHTML).toBe('');
        f.board.dispose();
    });
    it('keeps changing totals current while hidden, renders only on hold, and does not churn unchanged rows', () => {
        const f = fixture(); expect(f.root.hidden).toBe(true); expect(f.rows()).toHaveLength(0);
        f.state.possession.me = 61; f.board.receive({type: 'chaos', state: f.state}); expect(f.rows()).toHaveLength(0);
        f.board.setVisible(true); expect(f.cells('me')).toContain('1:01');
        const row = f.row('me'); f.board.receive({type: 'chaos', state: f.state}); expect(f.row('me')).toBe(row);
        f.board.scroll(160); expect(f.root.querySelector('.match-scoreboard-scroll').scrollTop).toBe(160);
        f.state.possession.me = 62; f.board.receive({type: 'chaos', state: f.state}); expect(f.cells('me')).toContain('1:02');
        expect(f.root.querySelector('.match-scoreboard-scroll').scrollTop).toBe(160);
        f.board.setVisible(false); expect(f.body.classes.has('scoreboard-open')).toBe(false);
        f.board.setAvailable(false); f.board.setVisible(true); expect(f.root.hidden).toBe(true); f.board.dispose();
    });
    it('retains late-join/paused time, updates life status, and honors the actual Closing winner instead of most-held time', () => {
        const f = fixture('closing-time'); f.board.setVisible(true);
        f.board.receive({type: 'playerDamaged', id: 'me', hp: 0} as ServerMessage); expect(f.cells('me')).toContain('RAT DOWN');
        f.board.receive({type: 'playerRespawn', id: 'me', hp: 3, x: 0, y: 0, z: 0}); expect(f.cells('me')).toContain('3 / 3 HP');
        f.assignment.phase = 'suspended'; f.board.receive({type: 'chaos', state: f.state});
        expect(f.cells('me')).toContain('0:30'); expect(f.root.querySelector('.match-scoreboard-mode span').textContent).toContain('PAUSED');
        f.assignment.phase = 'closed'; f.assignment.result = {winnerId: 'me', winnerName: 'You', at: 10_000, method: 'held', posthumous: false};
        f.board.receive({type: 'gameWon', assignment: f.assignment} as ServerMessage);
        expect(f.rows()[0].dataset.player).toBe('me'); expect(f.cells('me')).toContain('WINNER'); f.board.dispose();
    });
    it('reconciles join/leave, resets round totals, replaces a reconnect roster, and cleans up', () => {
        const f = fixture(); f.board.setVisible(true);
        f.board.receive({type: 'playerLeft', id: 'rd-ai-2'}); expect(f.rows()).toHaveLength(7);
        f.board.receive({type: 'playerJoined', player: {...f.people[2], id: 'newcomer'}}); expect(f.rows()).toHaveLength(8);
        f.board.receive({type: 'scoreboardUpdate', scores: [{id: 'me', name: 'You', kills: 20, deaths: 3}]});
        expect(f.rows()).toHaveLength(1); expect(f.cells('me')).toContain('20');
        const assignment = createAssignment('chain-of-custody', 20_000);
        f.board.receive({type: 'gameReset', round: {phase: 'playing', assignment}}); expect(f.root.hidden).toBe(false);
        f.board.setVisible(true); expect(f.cells('me')).toContain('0 / 3'); expect(f.cells('me')).not.toContain('20'); expect(f.cells('me')).not.toContain('0:30');
        f.board.receive({type: 'welcome', id: 'newcomer', player: {...f.people[2], id: 'newcomer'}, players: {newcomer: {...f.people[2], id: 'newcomer'}}, round: {phase: 'playing', assignment}, world: createWorldSpec(1), protocolVersion: PROTOCOL_VERSION, serverTime: 20_000});
        expect(f.root.hidden).toBe(true); f.board.setVisible(true); expect(f.rows()).toHaveLength(1); expect(f.row('newcomer').dataset.local).toBe('true');
        f.board.dispose(); expect(f.root.removed).toBe(true); expect(f.body.classes.has('scoreboard-open')).toBe(false);
    });
    it('does not truncate the supported roster or invent stats for players without possession', () => {
        const f = fixture('excessive-force', 100); f.board.setVisible(true);
        expect(f.rows()).toHaveLength(100); expect(f.cells('rd-ai-99')).toContain('0:00');
        expect(f.root.dataset.crowded).toBe('true'); f.board.dispose();
    });
});
