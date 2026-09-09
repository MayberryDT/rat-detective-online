import { ChaosEncoder } from '../../src/shared/chaosWire';
import type { ChaosState } from '../../src/shared/chaosState';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkManager, type TransportOptions } from '../../src/network/NetworkManager';
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
    const makeNetwork = (options: TransportOptions = {}) => new NetworkManager({
        url: 'ws://localhost/ws', joinTimeoutMs: 100, heartbeatMs: 1_000, maxRetries: 2,
        createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; },
        ...options,
    });
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('WebSocket', FakeSocket);
        sockets = [];
        network = makeNetwork();
    });
    afterEach(() => { network.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('advertises delta snapshots by default and preserves explicit v1 fallback',()=>{
        const urls:string[]=[];
        for(const chaosTransport of [undefined,'compact-v1'] as const){
            const client=makeNetwork({chaosTransport,createSocket:url=>{urls.push(String(url));return new FakeSocket() as unknown as WebSocket;}});
            client.connect('Rat',appearance);client.destroy();
        }
        expect(new URL(urls[0]).searchParams.get('chaos')).toBe('compact-v2');
        expect(new URL(urls[1]).searchParams.get('chaos')).toBe('compact-v1');
    });

    it('expands negotiated movement batches with each source timestamp intact',()=>{
        const receive=vi.fn();network.onMessage=receive;
        network.connect('Rat',appearance);sockets[0].open();sockets[0].receive(welcome());receive.mockClear();
        sockets[0].receive({type:'playersMoved',players:[{at:100,player:{...player,id:'a'}},{at:120,player:{...player,id:'b'}}]});
        expect(receive.mock.calls.map(([m])=>[m.type,m.player.id,m.at])).toEqual([['playerMoved','a',100],['playerMoved','b',120]]);
        expect(network.state).toBe('playing');
    });

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

    it('keeps a 100-player roster connected through scoreboard updates', () => {
        const messages = vi.fn();
        network.onMessage = messages;
        network.connect('Rat', appearance);
        sockets[0].open();
        const players = Object.fromEntries(Array.from({ length: 100 }, (_, index) => {
            const id = index === 0 ? player.id : `rat-${index}`;
            return [id, { ...player, id }];
        }));
        sockets[0].receive({ ...welcome(), players });
        const scores = Object.values(players).map(p => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths }));
        sockets[0].receive({ type: 'scoreboardUpdate', scores });
        expect(network.state).toBe('playing');
        expect(sockets[0].readyState).toBe(FakeSocket.OPEN);
        expect(messages).toHaveBeenLastCalledWith({ type: 'scoreboardUpdate', scores });
        sockets[0].receive({ type: 'scoreboardUpdate', scores: [...scores, { ...scores[0], id: 'overflow' }] });
        expect(network.state).toBe('reconnecting');
    });

    it('applies compact state before acknowledgement and reconnects on invalid compact state', () => {
        network.connect('Rat', appearance);sockets[0].open();sockets[0].receive(welcome());
        const encoder=new ChaosEncoder();
        const state:ChaosState={time:1,case:{owner:null,previousOwner:null,pickupAfter:0,returningUntil:0,p:{x:0,y:1,z:0},q:{x:0,y:0,z:0,w:1},v:{x:0,y:0,z:0},spin:{x:0,y:0,z:0}},dispatch:{phase:'ready',started:0,until:0,serial:0},possession:{},notice:{serial:0,text:''},shots:[],corpses:[],impacts:[]};
        network.onMessage=message=>{
            expect(message.type).toBe('chaos');
            expect(sockets[0].sent.some(raw=>JSON.parse(raw).type==='chaosAck')).toBe(false);
        };
        sockets[0].receive(JSON.parse(encoder.encode(state).payload));
        expect(JSON.parse(sockets[0].sent.at(-1)!)).toMatchObject({type:'chaosAck',seq:1});
        const invalid=JSON.parse(encoder.encode(state).payload);invalid.motion=[[999,0,0,0,0,0,0,0,0]];
        sockets[0].receive(invalid);
        expect(network.state).toBe('reconnecting');
        expect(sockets[0].sent.filter(raw=>JSON.parse(raw).type==='chaosAck')).toHaveLength(1);
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

    it('accepts the supported graybox world before enabling gameplay', () => {
        network.connect('Rat', appearance);
        sockets[0].open();
        sockets[0].receive({ ...welcome(), world: { seed: 1, version: 2 } });
        expect(network.state).toBe('playing');
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

    it('discards duplicate bot world snapshots without parsing their payloads, but keeps the socket live', () => {
        network.destroy();
        let connectedUrl='';
        network = makeNetwork({ receiveMode: 'welcome-only',createSocket:url=>{connectedUrl=url;const socket=new FakeSocket();sockets.push(socket);return socket as unknown as WebSocket;} });
        const messages = vi.fn();
        network.onMessage = messages;
        network.connect('Bot', appearance);
        expect(new URL(connectedUrl).searchParams.get('receive')).toBe('welcome-only');
        sockets[0].open(); sockets[0].receive(welcome());
        // An intentionally invalid, large payload proves there is no JSON parse
        // or deep validation for data this secondary socket never consumes.
        const discarded = '{"type":"chaos","state":' + 'x'.repeat(200_000);
        for (let i = 0; i < 4; i++) {
            vi.advanceTimersByTime(900);
            sockets[0].dispatchEvent(new MessageEvent('message', { data: discarded }));
        }
        expect(network.state).toBe('playing');
        expect(messages).toHaveBeenCalledTimes(1);
        expect(network.getDiagnostics()).toMatchObject({ receivedCount: 5, ignoredCount: 4, invalidCount: 0 });
        expect(network.getDiagnostics().lastReceivedAt).toBe(Date.now());
        sockets[0].receive({ type: 'pong', sentAt: 1, receivedAt: 2 });
        expect(messages).toHaveBeenLastCalledWith({ type: 'pong', sentAt: 1, receivedAt: 2 });
        sockets[0].close(); vi.advanceTimersByTime(500);
        sockets[1].open(); sockets[1].receive(welcome());
        expect(network.state).toBe('playing');
        expect(messages).toHaveBeenCalledTimes(3);
    });

    it('still validates bot welcome, control messages, and unknown message types', () => {
        for (const bad of [{ ...welcome(), player: null }, { type: 'pong', sentAt: 'wrong' }, { type: 'error', message: 4 }, { type: 'unknown' }]) {
            network.destroy();
            network = makeNetwork({ receiveMode: 'welcome-only', maxRetries: 0 });
            const messages = vi.fn(); network.onMessage = messages;
            network.connect('Bot', appearance);
            const socket = sockets.at(-1)!; socket.open(); socket.receive(bad);
            expect(network.state).toBe('disconnected');
            expect(messages).not.toHaveBeenCalled();
            expect(network.getDiagnostics().invalidCount).toBe(1);
        }
    });

    it('retains full world validation on the normal human connection', () => {
        network.connect('Rat', appearance);
        sockets[0].open(); sockets[0].receive(welcome());
        sockets[0].receive({ type: 'chaos', state: { shots: [] } });
        expect(network.state).toBe('reconnecting');
        expect(network.getDiagnostics()).toMatchObject({ invalidCount: 1, ignoredCount: 0 });
    });

    it('reports bounded lifetime network counters without retaining message bodies', () => {
        expect(network.send({ type: 'ping', sentAt: 1 })).toBe(false);
        network.connect('Rat', appearance);
        sockets[0].open();
        const initial = welcome(); sockets[0].receive(initial);
        expect(network.send({ type: 'ping', sentAt: 1 })).toBe(true);
        sockets[0].bufferedAmount = 100_000;
        expect(network.send({ type: 'updateMovement', position: { x: 0, y: 2, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 }, meshRotation: { x: 0, y: 0, z: 0, w: 1 } })).toBe(false);
        const report = network.getDiagnostics();
        expect(report).toMatchObject({ receivedCount: 1, receivedChars: JSON.stringify(initial).length,
            sentCount: 2, sendFailures: 2, bufferedAmount: 100_000, lastReceivedAt: Date.now() });
        expect(report.parseMs).toBeGreaterThanOrEqual(0);
        expect(report.parseMaxMs).toBeLessThanOrEqual(report.parseMs);
        report.sentCount = 999;
        expect(network.getDiagnostics().sentCount).toBe(2);
    });
});
