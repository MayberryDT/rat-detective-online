import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkManager } from '../../src/network/NetworkManager';
import { PROTOCOL_VERSION } from '../../src/shared/networkProtocol';

class FakeSocket extends EventTarget {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    sent: string[] = [];
    send(message: string) { this.sent.push(message); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
    receive(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}
const appearance = { hatType: 'fedora' as const, hatColor: 1, furColor: 2, coatColor: 3 };
const player = { id: 'one', name: 'Rat', ...appearance, x: 15, y: 2, z: 15,
    qx: 0, qy: 0, qz: 0, qw: 1, meshQx: 0, meshQy: 0, meshQz: 0, meshQw: 1, hp: 3, kills: 0, deaths: 0 };
const welcome = () => ({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, id: player.id,
    player, players: { one: player }, world: { seed: 1, version: 1 }, round: { phase: 'playing' }, serverTime: Date.now() });

describe('network session transport', () => {
    let sockets: FakeSocket[];
    let network: NetworkManager;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('WebSocket', FakeSocket);
        sockets = [];
        network = new NetworkManager({ url: 'ws://localhost/ws', joinTimeoutMs: 100, heartbeatMs: 1_000, maxRetries: 2,
            createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; } });
    });
    afterEach(() => { network.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('joins once and applies the snapshot before enabling gameplay', () => {
        const order: string[] = [];
        network.onMessage = () => order.push('snapshot');
        network.onState = state => order.push(state);
        network.connect('Rat', appearance);
        network.connect('Rat', appearance);
        expect(sockets).toHaveLength(1);
        sockets[0].open();
        expect(JSON.parse(sockets[0].sent[0])).toEqual({ type: 'join', protocolVersion: PROTOCOL_VERSION, name: 'Rat', appearance });
        sockets[0].receive(welcome());
        expect(order).toEqual(['connecting', 'snapshot', 'playing']);
    });

    it('keeps incompatible protocol versions out of gameplay', () => {
        const messages = vi.fn();
        network.onMessage = messages;
        network.connect('Rat', appearance);
        sockets[0].open();
        sockets[0].receive({ ...welcome(), protocolVersion: PROTOCOL_VERSION + 1 });
        expect(network.state).toBe('disconnected');
        expect(messages).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('requires a reload for an unsupported world layout version', () => {
        network.connect('Rat', appearance);
        sockets[0].open();
        sockets[0].receive({ ...welcome(), world: { seed: 1, version: 999 } });
        expect(network.state).toBe('disconnected');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('bounds failed joins and supports an explicit retry', () => {
        network.connect('Rat', appearance);
        vi.advanceTimersByTime(100);
        expect(network.state).toBe('reconnecting');
        vi.advanceTimersByTime(500 + 100 + 1_000 + 100);
        expect(network.state).toBe('disconnected');
        expect(sockets).toHaveLength(3);
        network.retry();
        expect(sockets).toHaveLength(4);
        expect(network.state).toBe('connecting');
    });

    it('ignores stale socket messages and reconciles from a fresh welcome', () => {
        const messages = vi.fn();
        network.onMessage = messages;
        network.connect('Rat', appearance);
        sockets[0].open(); sockets[0].receive(welcome());
        sockets[0].close();
        vi.advanceTimersByTime(500);
        sockets[0].receive(welcome());
        expect(messages).toHaveBeenCalledTimes(1);
        sockets[1].open(); sockets[1].receive(welcome());
        expect(messages).toHaveBeenCalledTimes(2);
        expect(network.state).toBe('playing');
    });

    it('detects an unresponsive connection and drops replaceable movement under backpressure', () => {
        network.connect('Rat', appearance);
        sockets[0].open(); sockets[0].receive(welcome());
        sockets[0].bufferedAmount = 100_000;
        expect(network.send({ type: 'updateMovement', position: { x: 0, y: 2, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 }, meshRotation: { x: 0, y: 0, z: 0, w: 1 } })).toBe(false);
        vi.advanceTimersByTime(4_000);
        expect(network.state).toBe('reconnecting');
    });

    it('cleans up every scheduled retry and heartbeat on destruction', () => {
        network.connect('Rat', appearance);
        sockets[0].open(); sockets[0].receive(welcome());
        network.destroy();
        vi.advanceTimersByTime(100_000);
        expect(sockets).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
        expect(network.state).toBe('stopped');
    });
});
