export const HIGHLIGHTS_PROTOCOL_VERSION = 1;
export const HIGHLIGHTS_DETECTOR_VERSION = 1;
export const HIGHLIGHTS_CHANNEL = 'rat-detective-highlights';
export const PRODUCTION_ORIGIN = 'https://ratdetective.online';
export const MESSAGE_BYTES = 16 * 1024;
/** Shared with the helper's protocol.ID_RE. Game assignment UUIDs match; short fallbacks do not. */
export const HIGHLIGHTS_ID_RE = /^[A-Za-z0-9._:-]{8,80}$/;

export const TITLE_KEYS = [
    'round-win', 'triple-kill', 'double-kill', 'paperwork-delivered',
    'launcher-escape', 'spectacular-launch', 'local-chaos-death', 'visible-pileup',
    'manual-save', 'paperwork-in-orbit',
] as const;
export type TitleKey = typeof TITLE_KEYS[number];
export type HighlightKind = TitleKey;
export type BrowserMessageType = 'hello' | 'session-start' | 'heartbeat' | 'marker' | 'session-end' | 'ping';

export interface HighlightsEnvelope {
    version: number;
    messageId: string;
    type: BrowserMessageType;
    sessionId?: string;
    documentEpoch?: string;
    sequence: number;
    presentedAtMs?: number;
    helperNowMs?: number;
}

export interface HighlightMarkerMessage extends HighlightsEnvelope {
    type: 'marker';
    id: string;
    roundId: string;
    kind: HighlightKind;
    titleKey: TitleKey;
    score: number;
    preMs: number;
    postMs: number;
    metadata?: Record<string, string | number | boolean | null>;
}

export const DEV_ORIGINS = [
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5193',
    'http://localhost:5174',
] as const;

export function approvedOrigin(origin: string): boolean {
    return origin === PRODUCTION_ORIGIN || (DEV_ORIGINS as readonly string[]).includes(origin);
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function randomId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `h${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

/** Prefer the game round id when it already satisfies the helper contract; otherwise a capture-scoped id. */
export function captureRoundId(roundId: string, epoch = ''): string {
    if (HIGHLIGHTS_ID_RE.test(roundId)) return roundId;
    if (HIGHLIGHTS_ID_RE.test(epoch)) return `capture:${epoch}`.slice(0, 80);
    return `capture:${randomId()}`.slice(0, 80);
}

export function encodeMessage(payload: object): string {
    const raw = JSON.stringify(payload);
    if (raw.length > MESSAGE_BYTES) throw new Error('highlights message too large');
    return raw;
}
