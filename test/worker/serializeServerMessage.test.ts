import { expect, it } from 'vitest';
import { serializeServerMessage } from '../../src/worker/serializeServerMessage';
import { parseServerMessage } from '../../src/shared/messageValidation';
import type { ChaosState } from '../../src/shared/chaosState';

it('encodes initial and periodic chaos with wire precision without changing source state', () => {
    const state: ChaosState = {
        time: 1000, case: { owner: null, previousOwner: null, pickupAfter: 0, returningUntil: 0,
            p: { x: 1.23456789, y: 1, z: -3.456789 }, v: { x: 0, y: 0, z: 0 },
            q: { x: 0, y: 0, z: 0, w: 1 }, spin: { x: 0, y: 0, z: 0 } },
        dispatch: { phase: 'ready', started: 0, until: 0, serial: 0 }, possession: {},
        corpses: [], shots: [], impacts: [], notice: { serial: 0, text: 'Cheese 🧀' },
    };
    const before = JSON.stringify(state);
    const wire = serializeServerMessage({ type: 'chaos', state });
    const parsed = parseServerMessage(wire);
    expect(parsed?.type).toBe('chaos');
    if (parsed?.type !== 'chaos') throw new Error('Expected valid chaos envelope');
    expect(parsed.state.case.p.x).toBe(1.235);
    expect(parsed.state.case.p.z).toBe(-3.457);
    expect(parsed.state.notice.text).toBe(state.notice.text);
    expect(JSON.stringify(state)).toBe(before);
    expect(new TextEncoder().encode(wire).byteLength).toBeLessThan(65536);
});

it('keeps precision unchanged for other message types', () => {
    const message = { type: 'pong' as const, sentAt: 12.3456789, receivedAt: 23.456789 };
    expect(serializeServerMessage(message)).toBe(JSON.stringify(message));
});
