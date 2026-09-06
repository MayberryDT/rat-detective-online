import { PROTOCOL_VERSION, type ClientMessage, type RatAppearance, type ServerMessage } from '../shared/networkProtocol';
import { WORLD_LAYOUT_VERSION } from '../shared/worldSpec';
import { parseServerMessage } from '../shared/messageValidation';

export type ConnectionState = 'idle' | 'connecting' | 'playing' | 'reconnecting' | 'disconnected' | 'stopped';
export interface TransportOptions {
    url?: string;
    createSocket?: (url: string) => WebSocket;
    joinTimeoutMs?: number;
    heartbeatMs?: number;
    maxRetries?: number;
}

export function resolveWebSocketUrl(serverUrl?: string): string {
    const configured = serverUrl || (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;
    const url = new URL(configured || '/ws', window.location.href);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.pathname === '/') url.pathname = '/ws';
    const room = new URLSearchParams(window.location.search).get('room');
    if (room && !url.searchParams.has('room')) url.searchParams.set('room', room);
    return url.toString();
}

/** Owns the connection only. Session code applies validated messages to the game. */
export class NetworkManager {
    public state: ConnectionState = 'idle';
    public onState: ((state: ConnectionState, message?: string) => void) | null = null;
    public onMessage: ((message: ServerMessage) => void) | null = null;
    private socket: WebSocket | null = null;
    private credentials: { name: string; appearance: RatAppearance } | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private joinTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private retries = 0;
    private generation = 0;
    private lastReceived = 0;
    private readonly url: string;
    private readonly options: TransportOptions;

    constructor(options: TransportOptions = {}) {
        this.options = options;
        this.url = options.url ?? resolveWebSocketUrl();
    }

    connect(name: string, appearance: RatAppearance): void {
        if (this.state === 'playing' || this.state === 'connecting' || this.state === 'reconnecting') return;
        this.credentials = { name, appearance };
        this.retries = 0;
        this.open();
    }

    retry(): void {
        if (!this.credentials || this.state === 'stopped') return;
        this.cancelConnection();
        this.retries = 0;
        this.open();
    }

    private setState(state: ConnectionState, message?: string): void {
        this.state = state;
        this.onState?.(state, message);
    }

    private open(): void {
        if (!this.credentials) return;
        const generation = ++this.generation;
        this.setState(this.retries ? 'reconnecting' : 'connecting');
        let socket: WebSocket;
        try {
            socket = (this.options.createSocket ?? (url => new WebSocket(url)))(this.url);
        } catch {
            this.failed(generation, 'Could not connect to the game.');
            return;
        }
        this.socket = socket;
        const current = () => generation === this.generation && this.socket === socket;
        this.joinTimer = setTimeout(() => this.failed(generation, 'Joining timed out.'), this.options.joinTimeoutMs ?? 8_000);
        socket.addEventListener('open', () => {
            if (!current() || !this.credentials) return;
            this.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, ...this.credentials });
        });
        socket.addEventListener('message', event => {
            if (!current()) return;
            const message = parseServerMessage(event.data);
            if (!message) {
                this.failed(generation, 'The server sent an incompatible game update.');
                return;
            }
            this.lastReceived = Date.now();
            if (message.type === 'welcome') {
                if (message.protocolVersion !== PROTOCOL_VERSION || message.world.version !== WORLD_LAYOUT_VERSION) {
                    this.cancelConnection();
                    this.setState('disconnected', 'The game has updated. Reload to continue.');
                    return;
                }
                this.clearJoinTimer();
                this.retries = 0;
                // Apply the complete snapshot before enabling input.
                try { this.onMessage?.(message); } catch (error) {
                    console.error('Could not restore game state', error);
                    this.failed(generation, 'Could not restore the game.');
                    return;
                }
                this.setState('playing');
                this.startHeartbeat(generation);
                return;
            }
            if (message.type === 'error' && this.state !== 'playing') {
                this.failed(generation, message.message);
                return;
            }
            this.onMessage?.(message);
        });
        socket.addEventListener('close', () => { if (current()) this.failed(generation, 'Connection lost.'); });
        socket.addEventListener('error', () => { if (current()) this.failed(generation, 'Connection failed.'); });
    }

    private startHeartbeat(generation: number): void {
        if (this.heartbeat) clearInterval(this.heartbeat);
        const interval = this.options.heartbeatMs ?? 20_000;
        this.heartbeat = setInterval(() => {
            if (generation !== this.generation) return;
            if (Date.now() - this.lastReceived > interval * 3) {
                this.failed(generation, 'The connection stopped responding.');
                return;
            }
            this.send({ type: 'ping', sentAt: Date.now() });
        }, interval);
    }

    private failed(generation: number, message: string): void {
        if (generation !== this.generation || this.state === 'stopped') return;
        this.cancelConnection();
        if (this.retries >= (this.options.maxRetries ?? 5)) {
            this.setState('disconnected', `${message} Retry when ready.`);
            return;
        }
        const delay = Math.min(500 * 2 ** this.retries++, 8_000);
        this.setState('reconnecting', message);
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.open(); }, delay);
    }

    send(message: ClientMessage): boolean {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        // Movement is replaceable; never keep queuing old positions behind a slow connection.
        if (message.type === 'updateMovement' && this.socket.bufferedAmount > 64 * 1024) return false;
        try {
            this.socket.send(JSON.stringify(message));
            return true;
        } catch {
            this.failed(this.generation, 'Sending a game update failed.');
            return false;
        }
    }

    private clearJoinTimer(): void {
        if (this.joinTimer) clearTimeout(this.joinTimer);
        this.joinTimer = null;
    }

    private cancelConnection(): void {
        ++this.generation;
        this.clearJoinTimer();
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.retryTimer = null;
        this.heartbeat = null;
        const socket = this.socket;
        this.socket = null;
        socket?.close();
    }

    destroy(): void {
        this.cancelConnection();
        this.credentials = null;
        this.setState('stopped');
        this.onMessage = null;
        this.onState = null;
    }
}
