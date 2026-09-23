import {
    HIGHLIGHTS_CHANNEL, HIGHLIGHTS_PROTOCOL_VERSION, approvedOrigin, encodeMessage, randomId,
    type HighlightMarkerMessage, type BrowserMessageType,
} from './protocol';
import {HighlightDetector, type HighlightMarker} from './HighlightDetector';

interface Capability {
    available: boolean;
    origin: string;
}

const EARLY_MARKER_LIMIT = 8;
const EARLY_MARKER_EXPIRE_MS = 30_000;
const START_RETRY_MS = 5_000;

export class HighlightBridge {
    readonly detector = new HighlightDetector();
    private available = false;
    private helperReady = false;
    private sessionAccepted = false;
    private sessionId = '';
    private documentEpoch = '';
    private sequence = 0;
    private heartbeat: number | null = null;
    private ping: number | null = null;
    private lastHelperNow = 0;
    private enabledProbe = false;
    private joined = false;
    private observing = false;
    private startInFlight = false;
    private startInFlightAt = 0;
    private readonly pendingById = new Map<string, BrowserMessageType>();
    private early: HighlightMarker[] = [];
    private readonly onMessage = (event: MessageEvent) => this.onWindowMessage(event);

    constructor(private readonly origin = typeof location === 'undefined' ? '' : location.origin) {
        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.onMessage);
        }
    }

    get live(): boolean {
        return this.sessionAccepted && this.joined && !this.observing;
    }

    get detectorActive(): boolean {
        return this.live;
    }

    attach(): void {
        this.documentEpoch = randomId();
        this.enabledProbe = true;
        this.post({type: 'hello', presentedAtMs: performance.now()});
        this.post({type: 'ping', presentedAtMs: performance.now()});
    }

    dispose(): void {
        this.endSession();
        this.enabledProbe = false;
        this.available = false;
        this.helperReady = false;
        this.sessionAccepted = false;
        this.early = [];
        this.pendingById.clear();
        if (typeof window !== 'undefined') window.removeEventListener('message', this.onMessage);
        if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
        if (this.ping !== null) window.clearInterval(this.ping);
        this.heartbeat = this.ping = null;
        this.detector.reset();
    }

    setIdentity(joined: boolean, observing: boolean): void {
        this.joined = joined;
        this.observing = observing;
        if (joined && !observing && this.available) this.ensureSession();
        else if (!joined || observing) this.endSession();
    }

    navigationEnded(): void {
        this.endSession();
        this.documentEpoch = randomId();
        this.sequence = 0;
        this.early = [];
        this.detector.reset();
    }

    emit(markers: HighlightMarker[]): void {
        if (!this.sessionAccepted) {
            this.queueEarly(markers);
            return;
        }
        for (const marker of markers) this.postMarker(marker);
    }

    private queueEarly(markers: HighlightMarker[]): void {
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        this.early = this.early.filter(item => now - item.presentedAtMs <= EARLY_MARKER_EXPIRE_MS);
        for (const marker of markers) {
            this.early.push(marker);
            if (this.early.length > EARLY_MARKER_LIMIT) this.early.shift();
        }
    }

    private flushEarly(): void {
        const queued = this.early;
        this.early = [];
        for (const marker of queued) this.postMarker(marker);
    }

    private ensureSession(): void {
        if (!this.available || this.observing || !this.joined) return;
        if (this.sessionAccepted) return;
        this.startSession();
    }

    private startSession(): void {
        if (!this.available || this.observing || !this.joined) return;
        if (this.sessionAccepted) return;
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        if (this.startInFlight && now - this.startInFlightAt < START_RETRY_MS) return;
        if (!this.sessionId) this.sessionId = randomId();
        this.startInFlight = true;
        this.startInFlightAt = now;
        this.post({
            type: 'session-start',
            origin: this.origin,
            joined: true,
            observing: false,
            presentedAtMs: now,
        });
        this.post({type: 'ping', presentedAtMs: now, helperNowMs: this.lastHelperNow || undefined});
        if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
        this.heartbeat = window.setInterval(() => {
            if (!this.sessionAccepted) this.startSession();
            else this.post({type: 'heartbeat', presentedAtMs: performance.now()});
        }, 2_000);
        if (this.ping !== null) window.clearInterval(this.ping);
        this.ping = window.setInterval(() => {
            this.post({type: 'ping', presentedAtMs: performance.now(), helperNowMs: this.lastHelperNow || undefined});
        }, 30_000);
    }

    private endSession(): void {
        if (this.sessionAccepted && this.sessionId) this.post({type: 'session-end', presentedAtMs: performance.now()});
        this.sessionId = '';
        this.sessionAccepted = false;
        this.startInFlight = false;
        if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
        if (this.ping !== null) window.clearInterval(this.ping);
        this.heartbeat = this.ping = null;
    }

    private postMarker(marker: HighlightMarker): void {
        const payload: HighlightMarkerMessage = {
            version: HIGHLIGHTS_PROTOCOL_VERSION,
            messageId: randomId(),
            type: 'marker',
            sessionId: this.sessionId,
            documentEpoch: this.documentEpoch,
            sequence: ++this.sequence,
            id: marker.id,
            roundId: marker.roundId,
            kind: marker.kind,
            titleKey: marker.titleKey,
            score: marker.score,
            preMs: marker.preMs,
            postMs: marker.postMs,
            presentedAtMs: marker.presentedAtMs,
            metadata: marker.metadata,
        };
        this.send(payload);
    }

    private post(partial: {type: BrowserMessageType; presentedAtMs?: number; helperNowMs?: number; origin?: string; joined?: boolean; observing?: boolean}): void {
        this.send({
            version: HIGHLIGHTS_PROTOCOL_VERSION,
            messageId: randomId(),
            type: partial.type,
            sessionId: this.sessionId || undefined,
            documentEpoch: this.documentEpoch || undefined,
            sequence: ++this.sequence,
            presentedAtMs: partial.presentedAtMs,
            helperNowMs: partial.helperNowMs,
            origin: partial.origin,
            joined: partial.joined,
            observing: partial.observing,
        });
    }

    private send(payload: object): void {
        if (typeof window === 'undefined' || !this.enabledProbe && (payload as {type?: string}).type !== 'hello') return;
        const type = (payload as {type?: string}).type as BrowserMessageType | undefined;
        if (!this.available && type !== 'hello' && type !== 'ping') return;
        const messageId = (payload as {messageId?: string}).messageId;
        if (type && messageId) {
            this.pendingById.set(messageId, type);
            if (this.pendingById.size > 64) {
                const first = this.pendingById.keys().next().value;
                if (first) this.pendingById.delete(first);
            }
        }
        try {
            window.postMessage({channel: HIGHLIGHTS_CHANNEL, payload: JSON.parse(encodeMessage(payload))}, this.origin);
        } catch {
            return;
        }
    }

    private onWindowMessage(event: MessageEvent): void {
        if (event.source !== window) return;
        if (event.origin && !approvedOrigin(event.origin) && event.origin !== this.origin) return;
        const data = event.data as {
            channel?: string; type?: string; available?: boolean; helperNowMs?: number;
            status?: string; reason?: string; enabled?: boolean; state?: string; requestType?: string;
            messageId?: string; payload?: unknown;
        } | null;
        if (!data || data.channel !== HIGHLIGHTS_CHANNEL) return;
        // Own outgoing posts are {channel, payload} without a helper type.
        if (data.type !== 'reply' && data.type !== 'capability') return;
        if (typeof data.helperNowMs === 'number') this.lastHelperNow = data.helperNowMs;
        if (data.type === 'capability') {
            if (data.available === true) this.available = true;
            if (data.available === false) {
                this.available = false;
                this.endSession();
            }
        }
        if (data.type === 'reply') this.handleReply(data);
        if ((this.available || this.helperReady) && this.joined && !this.observing) this.ensureSession();
    }

    private handleReply(data: {
        available?: boolean; status?: string; reason?: string; enabled?: boolean; state?: string;
        requestType?: string; messageId?: string;
    }): void {
        if (data.available === true) this.available = true;
        if (data.enabled === true && ['ready', 'starting', 'buffering', 'capturing'].includes(String(data.state || ''))) {
            this.helperReady = true;
        }
        const requestType = (data.messageId && this.pendingById.get(data.messageId)) || data.requestType || '';
        if (data.messageId) this.pendingById.delete(data.messageId);
        if (data.status === 'accepted' && requestType === 'session-start') {
            this.sessionAccepted = true;
            this.startInFlight = false;
            this.flushEarly();
        }
        if (data.status === 'rejected' && requestType === 'session-start') {
            this.sessionAccepted = false;
            this.startInFlight = false;
            this.helperReady = data.enabled === true && String(data.reason || '') !== 'highlights are off';
        }
        if (data.status === 'rejected' && (data.reason === 'stale session' || data.reason === 'stale sequence')) {
            this.sessionAccepted = false;
            this.startInFlight = false;
            this.sessionId = '';
        }
        if (data.status === 'accepted' && requestType === 'heartbeat' && this.sessionId) this.sessionAccepted = true;
    }
}

export function capabilityFromExtension(available: boolean): Capability {
    return {available, origin: typeof location === 'undefined' ? '' : location.origin};
}
