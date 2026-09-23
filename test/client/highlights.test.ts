import {describe, expect, it, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {HighlightDetector, HIGHLIGHT_RULES} from '../../src/highlights/HighlightDetector';
import {HighlightBridge} from '../../src/highlights/HighlightBridge';
import {
    approvedOrigin, captureRoundId, encodeMessage, HIGHLIGHTS_CHANNEL, HIGHLIGHTS_ID_RE,
    HIGHLIGHTS_PROTOCOL_VERSION, TITLE_KEYS,
} from '../../src/highlights/protocol';

const VALID_ROUND = '11111111-2222-3333-4444-555555555555';
const VALID_EPOCH = '99999999-8888-7777-6666-555555555555';

function detector() {
    const d = new HighlightDetector();
    d.welcome({localId: 'me', epoch: VALID_EPOCH, roundId: VALID_ROUND, deliverySerial: 0, owner: null, remainingMs: 20_000, assignmentId: 'chain-of-custody'});
    return d;
}

describe('highlight detector', () => {
    it('emits a local round win and ignores someone else', () => {
        const d = detector();
        expect(d.onWin('other', 1000)).toEqual([]);
        const markers = d.onWin('me', 1000);
        expect(markers).toHaveLength(1);
        expect(markers[0].kind).toBe('round-win');
        expect(markers[0].score).toBe(100);
    });

    it('counts distinct local kills for double and triple', () => {
        const d = detector();
        expect(d.onDeath({victimId: 'a', killerId: 'me', eventKey: 'k1', presentedAtMs: 1000, local: false, localKill: true})).toEqual([]);
        const double = d.onDeath({victimId: 'b', killerId: 'me', eventKey: 'k2', presentedAtMs: 2500, local: false, localKill: true});
        expect(double.map(m => m.kind)).toContain('double-kill');
        const triple = d.onDeath({victimId: 'c', killerId: 'me', eventKey: 'k3', presentedAtMs: 4000, local: false, localKill: true});
        expect(triple.map(m => m.kind)).toContain('triple-kill');
    });

    it('does not count the same death twice', () => {
        const d = detector();
        d.onDeath({victimId: 'a', killerId: 'me', eventKey: 'k1', presentedAtMs: 1000, local: false, localKill: true});
        expect(d.onDeath({victimId: 'a', killerId: 'me', eventKey: 'k1', presentedAtMs: 1100, local: false, localKill: true})).toEqual([]);
    });

    it('attributes a fresh delivery serial and ignores silent welcome', () => {
        const d = detector();
        expect(d.onSnapshot({
            epoch: VALID_EPOCH, roundId: VALID_ROUND, deliverySerial: 2, owner: 'me', remainingMs: null,
            assignmentId: 'chain-of-custody', lastDeliveryPlayerId: 'me', launches: [], presentedAtMs: 50, silent: true,
        })).toEqual([]);
        const markers = d.onSnapshot({
            epoch: VALID_EPOCH, roundId: VALID_ROUND, deliverySerial: 3, owner: 'me', remainingMs: null,
            assignmentId: 'chain-of-custody', lastDeliveryPlayerId: 'me', launches: [], presentedAtMs: 80,
        });
        expect(markers.map(m => m.kind)).toContain('paperwork-delivered');
    });

    it('emits a last-second steal only inside Closing Time', () => {
        const d = new HighlightDetector();
        d.welcome({localId: 'me', epoch: VALID_EPOCH, roundId: VALID_ROUND, deliverySerial: 0, owner: 'them', remainingMs: 4000, assignmentId: 'closing-time'});
        const markers = d.onSnapshot({
            epoch: VALID_EPOCH, roundId: VALID_ROUND, deliverySerial: 0, owner: 'me', remainingMs: 3000,
            assignmentId: 'closing-time', launches: [], presentedAtMs: 20,
        });
        expect(markers.map(m => m.kind)).toContain('last-second-steal');
    });

    it('resets on epoch change instead of replaying history', () => {
        const d = detector();
        d.onSnapshot({
            epoch: VALID_EPOCH, roundId: VALID_ROUND, deliverySerial: 1, owner: 'me', remainingMs: null,
            assignmentId: 'chain-of-custody', lastDeliveryPlayerId: 'me', launches: [], presentedAtMs: 40,
        });
        const markers = d.onSnapshot({
            epoch: 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', roundId: 'r2r2r2r2-r2r2-r2r2-r2r2-r2r2r2r2r2r2', deliverySerial: 9, owner: 'me', remainingMs: null,
            assignmentId: 'chain-of-custody', lastDeliveryPlayerId: 'me', launches: [], presentedAtMs: 50,
        });
        expect(markers).toEqual([]);
    });

    it('suppresses ordinary pile-ups for 30 seconds', () => {
        const d = detector();
        const corpses = [
            {id: 'a', presentedAtMs: 1000, x: 0, y: 0, z: 0, onScreen: true, visible: true},
            {id: 'b', presentedAtMs: 1100, x: 1, y: 0, z: 0, onScreen: true, visible: true},
            {id: 'c', presentedAtMs: 1200, x: 2, y: 0, z: 0, onScreen: true, visible: true},
        ];
        expect(d.observePhysical({presentedAtMs: 1200, localY: 1, corpses}).map(m => m.kind)).toContain('visible-pileup');
        expect(d.observePhysical({presentedAtMs: 5000, localY: 1, corpses})).toEqual([]);
    });

    it('does not work when the helper was never welcomed', () => {
        const d = new HighlightDetector();
        expect(d.onWin('me', 1)).toEqual([]);
        expect(d.onDeath({victimId: 'a', killerId: 'me', eventKey: 'k', presentedAtMs: 1, local: false, localKill: true})).toEqual([]);
    });

    it('keeps identity across a round reset and emits launch rise and escape', () => {
        const d = detector();
        d.noteLocalLaunch(1000, 0);
        expect(d.observePhysical({presentedAtMs: 3000, localY: 40, localLaunchedAtMs: 1000, localLaunchY: 0, corpses: []}).map(m => m.kind)).toContain('spectacular-launch');
        expect(d.onDeath({victimId: 'other', killerId: 'me', eventKey: 'death-1', presentedAtMs: 3100, local: false, localKill: true}).map(m => m.kind)).toContain('launcher-escape');
        d.beginRound({epoch: 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', roundId: 'r2r2r2r2-r2r2-r2r2-r2r2-r2r2r2r2r2r2', deliverySerial: 0, owner: null, remainingMs: 20000, assignmentId: 'chain-of-custody'});
        expect(d.onWin('me', 25000).map(m => m.kind)).toContain('round-win');
    });

    it('does not treat old on-screen corpses as a fresh pile-up', () => {
        const d = detector();
        const corpses = [
            {id: 'a', presentedAtMs: 1000, x: 0, y: 0, z: 0, onScreen: true, visible: true},
            {id: 'b', presentedAtMs: 1000, x: 1, y: 0, z: 0, onScreen: true, visible: true},
            {id: 'c', presentedAtMs: 1000, x: 2, y: 0, z: 0, onScreen: true, visible: true},
        ];
        expect(d.observePhysical({presentedAtMs: 8000, localY: 1, corpses})).toEqual([]);
    });
});

describe('highlight protocol', () => {
    it('pins production origin and known title keys', () => {
        expect(approvedOrigin('https://ratdetective.online')).toBe(true);
        expect(approvedOrigin('https://example.com')).toBe(false);
        expect(TITLE_KEYS).toContain('round-win');
        expect(HIGHLIGHTS_PROTOCOL_VERSION).toBe(1);
        expect(HIGHLIGHT_RULES['double-kill'].preMs).toBe(10_000);
    });

    it('is a no-op bridge without a connector', () => {
        const bridge = new HighlightBridge('https://ratdetective.online');
        expect(bridge.live).toBe(false);
        bridge.emit([{id: 'x', roundId: VALID_ROUND, kind: 'round-win', titleKey: 'round-win', score: 100, preMs: 1, postMs: 1, presentedAtMs: 1, detectorVersion: 1}]);
        bridge.dispose();
    });

    it('emits a helper-valid round id for real assignment UUIDs and capture-scoped fallbacks', () => {
        expect(HIGHLIGHTS_ID_RE.test(VALID_ROUND)).toBe(true);
        expect(captureRoundId(VALID_ROUND, VALID_EPOCH)).toBe(VALID_ROUND);
        expect(HIGHLIGHTS_ID_RE.test(captureRoundId('round', VALID_EPOCH))).toBe(true);
        expect(HIGHLIGHTS_ID_RE.test(captureRoundId('r1', ''))).toBe(true);
        const d = detector();
        expect(HIGHLIGHTS_ID_RE.test(d.onWin('me', 1000)[0].roundId)).toBe(true);
        const empty = new HighlightDetector();
        empty.welcome({localId: 'me', epoch: '', roundId: '', deliverySerial: 0, owner: null, remainingMs: null, assignmentId: ''});
        expect(HIGHLIGHTS_ID_RE.test(empty.onWin('me', 1)[0].roundId)).toBe(true);
    });
});

describe('highlight detector spacing', () => {
    it('does not emit a multikill from ten spaced local kills, then emits an independent local win', () => {
        const d = detector();
        const kinds: string[] = [];
        for (let i = 0; i < 10; i++) {
            kinds.push(...d.onDeath({
                victimId: `v${i}`, killerId: 'me', eventKey: `k${i}`, presentedAtMs: 1_000 + i * 10_000,
                local: false, localKill: true,
            }).map(m => m.kind));
        }
        expect(kinds).toEqual([]);
        expect(d.onWin('me', 120_000).map(m => m.kind)).toEqual(['round-win']);
        expect(d.onWin('other', 130_000)).toEqual([]);
    });
});

describe('highlight bridge lifecycle', () => {
    function installWindow() {
        const listeners: Array<(event: MessageEvent) => void> = [];
        const posted: Array<{channel?: string; payload?: {type?: string; roundId?: string; sequence?: number}}> = [];
        const win = {
            addEventListener(_type: string, fn: (event: MessageEvent) => void) { listeners.push(fn); },
            removeEventListener(_type: string, fn: (event: MessageEvent) => void) {
                const index = listeners.indexOf(fn);
                if (index >= 0) listeners.splice(index, 1);
            },
            postMessage(data: object) { posted.push(data as typeof posted[number]); },
            setInterval() { return 1; },
            clearInterval() {},
            deliver(data: object, origin = 'https://ratdetective.online') {
                for (const fn of listeners) {
                    fn({source: win, origin, data} as unknown as MessageEvent);
                }
            },
        };
        vi.stubGlobal('window', win);
        vi.stubGlobal('performance', {now: () => 1_000});
        return {win, posted};
    }

    it('filters own outgoing messages and replays early markers after session acceptance', () => {
        const {win, posted} = installWindow();
        const bridge = new HighlightBridge('https://ratdetective.online');
        bridge.attach();
        win.deliver({channel: HIGHLIGHTS_CHANNEL, type: 'capability', available: true});
        bridge.setIdentity(true, false);
        const startsBefore = posted.filter(item => item.payload?.type === 'session-start').length;
        expect(startsBefore).toBe(1);
        const snapshot = [...posted];
        for (const item of snapshot) win.deliver(item);
        expect(posted.filter(item => item.payload?.type === 'session-start').length).toBe(startsBefore);
        const d = detector();
        const early = d.onWin('me', 2_000);
        bridge.emit(early);
        expect(posted.filter(item => item.payload?.type === 'marker')).toHaveLength(0);
        win.deliver({
            channel: HIGHLIGHTS_CHANNEL, type: 'reply', requestType: 'session-start', status: 'accepted',
            available: true, enabled: true, state: 'capturing',
        });
        const markers = posted.filter(item => item.payload?.type === 'marker');
        expect(markers).toHaveLength(1);
        expect(HIGHLIGHTS_ID_RE.test(String(markers[0].payload?.roundId))).toBe(true);
        win.deliver({
            channel: HIGHLIGHTS_CHANNEL, type: 'reply', requestType: 'heartbeat', status: 'rejected',
            reason: 'stale session',
        });
        expect(bridge.live).toBe(false);
        bridge.dispose();
        vi.unstubAllGlobals();
    });

    it('serializes a real detector marker that the python validator accepts', () => {
        const d = detector();
        const marker = d.onWin('me', 12_000)[0];
        const envelope = {
            version: HIGHLIGHTS_PROTOCOL_VERSION,
            messageId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            type: 'marker',
            sessionId: VALID_ROUND,
            documentEpoch: VALID_EPOCH,
            sequence: 4,
            id: marker.id,
            roundId: marker.roundId,
            kind: marker.kind,
            titleKey: marker.titleKey,
            score: marker.score,
            preMs: marker.preMs,
            postMs: marker.postMs,
            presentedAtMs: marker.presentedAtMs,
        };
        const raw = encodeMessage(envelope);
        const result = spawnSync('python3', ['-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.resolve('omarchy/plugin/scripts'))})
from highlights.protocol import validate_browser_envelope
print(validate_browser_envelope(json.loads(sys.argv[1]))["roundId"])
`, raw], {encoding: 'utf8'});
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(marker.roundId);
    });
});
