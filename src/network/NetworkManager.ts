import { isResumeToken, SESSION_REPLACED_CLOSE_CODE } from '../shared/reconnect';
import { DEFAULT_ROOM_NAME, PROTOCOL_VERSION, type ClientMessage, type RatAppearance, type ServerMessage } from '../shared/networkProtocol';
import { isSupportedWorldVersion } from '../shared/worldSpec';
import { CHAOS_WIRE_MODE } from '../shared/chaosWire';
import { DeliveryDecoder, type DeliveryAck } from '../shared/deliveryWire';
import { consumePublicInvitation, isPublicRoomName, isRoomInPool, publicRoomLabel, readPublicInvitation } from './publicInvitation';

export type ConnectionState = 'idle' | 'connecting' | 'playing' | 'reconnecting' | 'disconnected' | 'stopped';
export interface TransportOptions {
    url?: string;
    /** Null disables tab-local reload recovery (for synthetic clients). */
    resumeStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
    createSocket?: (url: string) => WebSocket;
    joinTimeoutMs?: number;
    heartbeatMs?: number;
    maxRetries?: number;
    random?: () => number;
    stablePlayingMs?: number;
    /** Local bot sockets share the human's validated world feed. They only
     * consume their own welcome; connection control messages remain validated. */
    receiveMode?: 'all' | 'welcome-only';
    /** Explicit legacy mode supports transport comparisons and old previews. */
    chaosTransport?: 'compact-v1' | 'compact-v2' | 'legacy';
}

export interface NetworkDiagnostics {
    receivedCount: number;
    /** UTF-16 string length, not wire bytes. */
    receivedChars: number;
    parseMs: number;
    parseMaxMs: number;
    invalidCount: number;
    ignoredCount: number;
    lastReceivedAt: number;
    sentCount: number;
    sendFailures: number;
    bufferedAmount: number;
    receivedBytes: number;
    applyMs: number;
    applyMaxMs: number;
    joinMs: number;
    reconnectCount: number;
    lastCloseCode: number;
    rttMs: number;
    rttMinMs: number;
    rttMaxMs: number;
    rttJitterMs: number;
}

const SHARED_UPDATES = new Set<string>([
    'chaos', 'currentPlayers', 'playerJoined', 'playersMoved', 'playerMoved', 'playerCorrected',
    'playerShot', 'playerDamaged', 'playerDied', 'scoreboardUpdate', 'playerRespawn',
    'playerLeft', 'gameWon', 'gameReset',
]);

/** The server serializes its type first. Inspect only the bounded envelope for
 * messages this socket will discard; never expose an unvalidated payload. Other
 * property orders and unknown envelopes take the normal validation path. */
function isDiscardedSharedUpdate(raw: unknown): boolean {
    if (typeof raw !== 'string') return false;
    const type = /^\s*\{\s*"type"\s*:\s*"([A-Za-z]+)"\s*[,}]/.exec(raw.slice(0, 96))?.[1];
    return !!type && SHARED_UPDATES.has(type);
}

export function resolveWebSocketUrl(serverUrl?: string): string {
    const configured = serverUrl || (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;
    const url = new URL(configured || '/ws', window.location.href);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.pathname === '/') url.pathname = '/ws';
    const params = new URLSearchParams(window.location.search);
    for (const key of ['room', 'assignment', 'incidents', 'incident', 'observe']) {
        const value = params.get(key);
        if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    const preferred = params.get('preferred');
    const pool = url.searchParams.get('room') ?? params.get('room') ?? DEFAULT_ROOM_NAME;
    if (!url.searchParams.has('preferred') && pool === DEFAULT_ROOM_NAME && isPublicRoomName(preferred)) {
        url.searchParams.set('preferred', preferred);
    }
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
    private stableTimer: ReturnType<typeof setTimeout> | null = null;
    private ackTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingAck: DeliveryAck | null = null;
    private retries = 0;
    private generation = 0;
    private lastReceived = 0;
    private url: string;
    private resumeToken?: string;
    private readonly resumeScope: string;
    private readonly pool: string;
    private readonly requestedRoom?: string;
    private readonly invitationIntent: boolean;
    private readonly pageInvitation: boolean;
    private invitationReported = false;
    private resumeStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    private prepared: {socket:WebSocket; cleanup:()=>void} | null = null;
    private readonly options: TransportOptions;
    private readonly diagnostics = {
        receivedCount: 0, receivedChars: 0, parseMs: 0, parseMaxMs: 0,
        invalidCount: 0, ignoredCount: 0, sentCount: 0, sendFailures: 0,
        receivedBytes: 0, applyMs: 0, applyMaxMs: 0, joinMs: 0, reconnectCount: 0, lastCloseCode: 0,
        rttMs:0,rttMinMs:0,rttMaxMs:0,rttJitterMs:0,
    };

    constructor(options: TransportOptions = {}) {
        this.options = options;
        const pageTransport=options.url===undefined;
        const url = new URL(options.url ?? resolveWebSocketUrl());
        if(options.receiveMode!=='welcome-only' && options.chaosTransport!=='legacy'){url.searchParams.set('chaos',options.chaosTransport??CHAOS_WIRE_MODE);url.searchParams.set('movement','tuple-v1');}
        if(options.receiveMode==='welcome-only')url.searchParams.set('receive','welcome-only');
        this.pool = url.searchParams.get('room') ?? DEFAULT_ROOM_NAME;
        const initialPreferred = url.searchParams.get('preferred');
        this.requestedRoom = this.pool === DEFAULT_ROOM_NAME && url.searchParams.get('resume') !== '1' && isPublicRoomName(initialPreferred)
            ? initialPreferred : undefined;
        const pageInvitation = options.url === undefined ? readPublicInvitation(window.location.search) : undefined;
        this.invitationIntent = !!this.requestedRoom || !!pageInvitation?.invalid ||
            (initialPreferred !== null && this.pool === DEFAULT_ROOM_NAME && url.searchParams.get('resume') !== '1');
        this.pageInvitation = pageTransport && !!this.requestedRoom;
        if (this.pool === DEFAULT_ROOM_NAME && initialPreferred && !isPublicRoomName(initialPreferred)) url.searchParams.delete('preferred');
        this.url = url.toString();
        this.resumeScope = `${url.origin}${url.pathname}?room=${this.pool}`;
        // A deliberate invitation starts a new public join. Ordinary page
        // returns still restore the tab-local rat and its exact assigned room.
        if (options.receiveMode !== 'welcome-only' && url.searchParams.get('observe')!=='1') try {
            this.resumeStorage = options.resumeStorage === null ? undefined : options.resumeStorage ?? window.sessionStorage;
            if (!this.invitationIntent) {
                const saved = JSON.parse(this.resumeStorage?.getItem('rat-detective-resume') ?? 'null');
                if (saved?.scope === this.resumeScope && isResumeToken(saved.token) &&
                    (saved.room === undefined || isRoomInPool(saved.room, this.pool))) {
                    this.resumeToken = saved.token;
                    if (saved.room) url.searchParams.set('preferred', saved.room);
                    url.searchParams.set('resume', '1'); this.url = url.toString();
                }
            }
        } catch { /* Storage can be disabled; transport retries still recover in memory. */ }
    }

    private rememberResume(token?: string, room?: string): void {
        this.resumeToken = token;
        const url = new URL(this.url);
        if (token) url.searchParams.set('resume', '1');
        else { url.searchParams.delete('resume'); url.searchParams.delete('preferred'); }
        this.url = url.toString();
        try {
            if (token) this.resumeStorage?.setItem('rat-detective-resume', JSON.stringify({scope:this.resumeScope,token,room}));
            else this.resumeStorage?.removeItem('rat-detective-resume');
        } catch { /* Best effort reload recovery. Never log the credential. */ }
    }

    connect(name: string, appearance: RatAppearance): void {
        if (this.state === 'playing' || this.state === 'connecting' || this.state === 'reconnecting') return;
        this.credentials = { name, appearance };
        this.retries = 0;
        this.open();
    }

    /** Complete transport setup on the title without joining or reserving a rat slot. */
    prepare(): void {
        if (this.state !== 'idle' || this.prepared || this.resumeToken) return;
        if (this.requestedRoom && this.requestedRoom !== DEFAULT_ROOM_NAME) return;
        const url=new URL(this.url),room=url.searchParams.get('room');
        if(room && room!==DEFAULT_ROOM_NAME&&!/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(room))return;
        url.searchParams.set('prepare','1');
        let socket:WebSocket;
        try {socket=(this.options.createSocket??(url=>new WebSocket(url)))(url.toString());} catch{return;}
        const events=new AbortController();
        const cleanup=()=>{clearTimeout(timer);events.abort();};
        const discard=()=>{if(this.prepared?.socket===socket)this.prepared=null;cleanup();socket.close();};
        const timer=setTimeout(discard,25_000);
        this.prepared={socket,cleanup};
        for(const event of ['close','error','message'])socket.addEventListener(event,discard,{signal:events.signal});
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
            const prepared=this.prepared;this.prepared=null;prepared?.cleanup();
            socket = prepared && prepared.socket.readyState<=WebSocket.OPEN ? prepared.socket
                : (this.options.createSocket ?? (url => new WebSocket(url)))(this.url);
        } catch {
            this.failed(generation, 'Could not connect to the game.');
            return;
        }
        this.socket = socket;
        const decoder=new DeliveryDecoder();
        const openedAt=performance.now();
        const current = () => generation === this.generation && this.socket === socket;
        this.joinTimer = setTimeout(() => this.failed(generation, 'Joining timed out.'), this.options.joinTimeoutMs ?? 8_000);
        const join = () => {
            if (!current() || !this.credentials) return;
            this.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, ...this.credentials, ...(this.resumeToken ? {resumeToken:this.resumeToken} : {}) });
        };
        socket.addEventListener('open', join, {once:true});
        socket.addEventListener('message', event => {
            if (!current()) return;
            const started = performance.now();
            this.diagnostics.receivedCount++;
            if (typeof event.data === 'string') this.diagnostics.receivedChars += event.data.length;
            const discard = this.options.receiveMode === 'welcome-only' && isDiscardedSharedUpdate(event.data);
            const decoded=discard?null:decoder.read(event.data);
            if(!discard)this.diagnostics.receivedBytes+=decoder.lastWireBytes;
            const message=decoded?.message;
            const elapsed = performance.now() - started;
            this.diagnostics.parseMs += elapsed;
            this.diagnostics.parseMaxMs = Math.max(this.diagnostics.parseMaxMs, elapsed);
            if (discard) {
                this.diagnostics.ignoredCount++;
                this.lastReceived = Date.now();
                return;
            }
            if (!message) {
                if (decoded?.ack) { this.acknowledge(decoded.ack); return; }
                this.diagnostics.invalidCount++;
                this.failed(generation, 'The server sent an incompatible game update.');
                return;
            }
            this.lastReceived = Date.now();
            if(message.type==='pong'){
                const sample=Math.max(0,Date.now()-message.sentAt),previous=this.diagnostics.rttMs;
                if(sample<=120_000){
                    this.diagnostics.rttMs=previous?previous*.8+sample*.2:sample;
                    this.diagnostics.rttMinMs=this.diagnostics.rttMinMs?Math.min(this.diagnostics.rttMinMs,sample):sample;
                    this.diagnostics.rttMaxMs=Math.max(this.diagnostics.rttMaxMs,sample);
                    this.diagnostics.rttJitterMs=previous?this.diagnostics.rttJitterMs*.8+Math.abs(sample-previous)*.2:0;
                }
            }
            if (message.type === 'welcome') {
                if (message.protocolVersion !== PROTOCOL_VERSION || !isSupportedWorldVersion(message.world.version)) {
                    this.cancelConnection();
                    this.setState('disconnected', 'The game has updated. Reload to continue.');
                    return;
                }
                if((message.observing===true)!==(new URL(this.url).searchParams.get('observe')==='1')){
                    this.cancelConnection();this.setState('disconnected','Observation is unavailable on this server.');return;
                }
                const assignedRoom=isRoomInPool(message.matchRoom,this.pool)?message.matchRoom:undefined;
                if (assignedRoom) { const url = new URL(this.url); url.searchParams.set('preferred',assignedRoom); this.url = url.toString(); }
                if (message.resumeToken) this.rememberResume(message.resumeToken, assignedRoom);
                if(this.pageInvitation)consumePublicInvitation(window);
                this.clearJoinTimer();
                this.diagnostics.joinMs=performance.now()-openedAt;
                // Apply the complete snapshot before enabling input.
                try { this.apply(message); } catch (error) {
                    console.error('Could not restore game state', error);
                    this.failed(generation, 'Could not restore the game.');
                    return;
                }
                const actualRoom=assignedRoom??this.pool;
                const routeMessage=!this.invitationReported&&this.requestedRoom
                    ? actualRoom===this.requestedRoom
                        ? `Joined invited ${publicRoomLabel(actualRoom)}.`
                        : `Invited ${publicRoomLabel(this.requestedRoom)} was unavailable. Joined ${publicRoomLabel(actualRoom)}.`
                    : undefined;
                if(this.invitationIntent)this.invitationReported=true;
                this.setState('playing',routeMessage);
                this.startHeartbeat(generation);
                if (this.stableTimer) clearTimeout(this.stableTimer);
                this.stableTimer=setTimeout(()=>{if(current()&&this.state==='playing')this.retries=0;this.stableTimer=null;},this.options.stablePlayingMs??30_000);
                if(decoded?.ack)this.acknowledge(decoded.ack);
                return;
            }
            if (message.type === 'error' && this.state !== 'playing') {
                if (message.code === 'resume-unavailable') this.rememberResume();
                this.failed(generation, message.message);
                return;
            }
            if (this.options.receiveMode === 'welcome-only' && SHARED_UPDATES.has(message.type)) {
                this.diagnostics.ignoredCount++;
            } else {
                try {
                    this.apply(message);
                } catch(error) {
                    console.error('Could not apply game update',error);
                    this.failed(generation,'Could not apply the game update.');return;
                }
            }
            if(decoded?.ack)this.acknowledge(decoded.ack);
        });
        socket.addEventListener('close', event => {
            if (!current()) return;
            this.diagnostics.lastCloseCode=event.code;
            if (event.code===SESSION_REPLACED_CLOSE_CODE) {
                this.cancelConnection();this.rememberResume();
                this.setState('disconnected','Your rat resumed in another connection.');
            } else this.failed(generation, 'Connection lost.');
        });
        socket.addEventListener('error', () => { if (current()) this.failed(generation, 'Connection failed.'); });
        if(socket.readyState===WebSocket.OPEN)join();
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
        const delay = Math.min(500 * 2 ** this.retries++, 8_000) * (0.5 + 0.5 * (this.options.random ?? Math.random)());
        this.diagnostics.reconnectCount++;
        this.setState('reconnecting', message);
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.open(); }, delay);
    }

    send(message: ClientMessage): boolean {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.diagnostics.sendFailures++;
            return false;
        }
        // Movement is replaceable; never keep queuing old positions behind a slow connection.
        if (message.type === 'updateMovement' && this.socket.bufferedAmount > 64 * 1024) {
            this.diagnostics.sendFailures++;
            return false;
        }
        if (this.socket.bufferedAmount > 256 * 1024) {
            this.diagnostics.sendFailures++;
            this.failed(this.generation,'The connection is congested.');
            return false;
        }
        try {
            const ack=this.pendingAck;
            this.socket.send(JSON.stringify(ack&&message.type!=='deliveryAck'?{...message,deliveryAck:{stream:ack.stream,seq:ack.seq}}:message));
            if(ack){this.pendingAck=null;if(this.ackTimer)clearTimeout(this.ackTimer);this.ackTimer=null;}
            this.diagnostics.sentCount++;
            return true;
        } catch {
            this.diagnostics.sendFailures++;
            this.failed(this.generation, 'Sending a game update failed.');
            return false;
        }
    }

    /** Lifetime counters survive reconnects so an export includes the failure. */
    getDiagnostics(): NetworkDiagnostics {
        return { ...this.diagnostics, lastReceivedAt: this.lastReceived, bufferedAmount: this.socket?.bufferedAmount ?? 0 };
    }

    private apply(message: ServerMessage): void {
        const start=performance.now();
        try {
            if(message.type==='playerShot'&&message.movement)this.onMessage?.({type:'playerMoved',...message.movement});
            if(message.type==='playersMoved')for(const sample of message.players)this.onMessage?.({type:'playerMoved',...sample});
            else this.onMessage?.(message);
        } finally {
            const elapsed=performance.now()-start;this.diagnostics.applyMs+=elapsed;this.diagnostics.applyMaxMs=Math.max(this.diagnostics.applyMaxMs,elapsed);
        }
    }

    private acknowledge(ack: NonNullable<ReturnType<DeliveryDecoder['read']>>['ack']): void {
        if (!ack) return;
        if (ack.type==='chaosAck') { this.send(ack);return; }
        this.pendingAck=ack;
        // Cumulative ACKs cover all applied events. This limits uplink traffic
        // during combat bursts without delaying application or interpolation.
        if (!this.ackTimer) this.ackTimer=setTimeout(()=>{
            this.ackTimer=null;const pending=this.pendingAck;this.pendingAck=null;if(pending)this.send(pending);
        },33);
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
        if (this.stableTimer) clearTimeout(this.stableTimer);
        if (this.ackTimer) clearTimeout(this.ackTimer);
        this.stableTimer=null;this.ackTimer=null;this.pendingAck=null;
        this.retryTimer = null;
        this.heartbeat = null;
        const socket = this.socket;
        this.socket = null;
        socket?.close();
    }

    destroy(): void {
        const prepared=this.prepared;this.prepared=null;prepared?.cleanup();prepared?.socket.close();
        this.cancelConnection();
        this.credentials = null;
        this.setState('stopped');
        this.onMessage = null;
        this.onState = null;
    }
}
