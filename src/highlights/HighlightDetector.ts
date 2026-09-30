import {HIGHLIGHTS_DETECTOR_VERSION, captureRoundId, randomId, type HighlightKind, type TitleKey} from './protocol';

export interface DetectorRule {
    kind: HighlightKind;
    titleKey: TitleKey;
    score: number;
    preMs: number;
    postMs: number;
}

export const HIGHLIGHT_RULES: Record<HighlightKind, DetectorRule> = {
    'round-win': {kind: 'round-win', titleKey: 'round-win', score: 100, preMs: 12_000, postMs: 6_000},
    'triple-kill': {kind: 'triple-kill', titleKey: 'triple-kill', score: 90, preMs: 10_000, postMs: 5_000},
    'double-kill': {kind: 'double-kill', titleKey: 'double-kill', score: 75, preMs: 10_000, postMs: 5_000},
    'paperwork-delivered': {kind: 'paperwork-delivered', titleKey: 'paperwork-delivered', score: 70, preMs: 10_000, postMs: 5_000},
    'launcher-escape': {kind: 'launcher-escape', titleKey: 'launcher-escape', score: 75, preMs: 10_000, postMs: 5_000},
    'spectacular-launch': {kind: 'spectacular-launch', titleKey: 'paperwork-in-orbit', score: 60, preMs: 8_000, postMs: 6_000},
    'local-chaos-death': {kind: 'local-chaos-death', titleKey: 'local-chaos-death', score: 65, preMs: 8_000, postMs: 5_000},
    'visible-pileup': {kind: 'visible-pileup', titleKey: 'visible-pileup', score: 70, preMs: 8_000, postMs: 5_000},
    'manual-save': {kind: 'manual-save', titleKey: 'manual-save', score: 100, preMs: 20_000, postMs: 0},
    'paperwork-in-orbit': {kind: 'paperwork-in-orbit', titleKey: 'paperwork-in-orbit', score: 60, preMs: 8_000, postMs: 6_000},
};

export interface HighlightMarker {
    id: string;
    roundId: string;
    kind: HighlightKind;
    titleKey: TitleKey;
    score: number;
    preMs: number;
    postMs: number;
    presentedAtMs: number;
    detectorVersion: number;
    metadata?: Record<string, string | number | boolean | null>;
}

export interface ConfirmedDeath {
    victimId: string;
    killerId: string | null;
    eventKey: string;
    presentedAtMs: number;
    incident?: boolean;
    local: boolean;
    localKill: boolean;
}

export interface PhysicalObservation {
    presentedAtMs: number;
    localY: number;
    localLaunchedAtMs?: number;
    localLaunchY?: number;
    nearbyEruption?: boolean;
    corpses: Array<{id: string; presentedAtMs: number; x: number; y: number; z: number; onScreen: boolean; visible: boolean}>;
}

const SUPPRESS_MS = 30_000;

export class HighlightDetector {
    private primed = false;
    private epoch = '';
    private roundId = '';
    private localId = '';
    private deliverySerial = 0;
    private owner: string | null = null;
    private kills: Array<{key: string; at: number}> = [];
    private seenDeaths = new Set<string>();
    private launches = new Map<string, {at: number; y: number; playerId: string}>();
    private lastSpectacularAt = 0;
    private lastPileupAt = 0;
    private pending: HighlightMarker[] = [];

    reset(): void {
        this.primed = false;
        this.epoch = this.roundId = this.localId = '';
        this.deliverySerial = 0;
        this.owner = null;
        this.kills = [];
        this.seenDeaths.clear();
        this.launches.clear();
        this.lastSpectacularAt = 0;
        this.lastPileupAt = 0;
        this.pending = [];
    }

    beginRound(input: {epoch: string; roundId: string; deliverySerial: number; owner: string | null}): void {
        this.epoch = input.epoch;
        this.roundId = input.roundId;
        this.deliverySerial = input.deliverySerial;
        this.owner = input.owner;
        this.kills = [];
        this.seenDeaths.clear();
        this.launches.clear();
        this.pending = [];
        if (this.localId) this.primed = true;
    }

    welcome(input: {localId: string; epoch: string; roundId: string; deliverySerial: number; owner: string | null}): void {
        const keepId = input.localId;
        this.reset();
        this.localId = keepId;
        this.beginRound(input);
        this.primed = true;
    }

    drain(): HighlightMarker[] {
        const out = this.pending;
        this.pending = [];
        return out;
    }

    onWin(winnerId: string, presentedAtMs: number): HighlightMarker[] {
        if (!this.primed || winnerId !== this.localId) return this.drain();
        this.emit(HIGHLIGHT_RULES['round-win'], presentedAtMs);
        return this.drain();
    }

    onDeath(death: ConfirmedDeath): HighlightMarker[] {
        if (!this.primed) return [];
        if (this.seenDeaths.has(death.eventKey)) return [];
        this.seenDeaths.add(death.eventKey);
        if (this.seenDeaths.size > 256) this.seenDeaths.delete(this.seenDeaths.values().next().value!);
        if (death.localKill) {
            this.kills.push({key: death.eventKey, at: death.presentedAtMs});
            this.kills = this.kills.filter(item => death.presentedAtMs - item.at <= 8_000);
            const unique = new Set(this.kills.map(item => item.key));
            if (unique.size >= 3) this.emit(HIGHLIGHT_RULES['triple-kill'], death.presentedAtMs);
            else if (unique.size >= 2 && death.presentedAtMs - this.kills[0].at <= 6_000) this.emit(HIGHLIGHT_RULES['double-kill'], death.presentedAtMs);
            const launch = this.localLaunch();
            if (launch && death.presentedAtMs - launch.at <= 6_000) this.emit(HIGHLIGHT_RULES['launcher-escape'], death.presentedAtMs);
        }
        if (death.local && death.incident) {
            this.emit(HIGHLIGHT_RULES['local-chaos-death'], death.presentedAtMs, {incident: true});
        }
        return this.drain();
    }

    onSnapshot(input: {
        epoch: string; roundId: string; deliverySerial: number; owner: string | null;
        lastDeliveryPlayerId?: string;
        launches: Array<{id: string; playerId: string; at: number}>;
        presentedAtMs: number; silent?: boolean;
    }): HighlightMarker[] {
        if (!this.primed) return [];
        if (input.epoch !== this.epoch || input.roundId !== this.roundId) {
            this.beginRound({
                epoch: input.epoch, roundId: input.roundId,
                deliverySerial: input.deliverySerial, owner: input.owner,
            });
            if (input.silent) return [];
        }
        if (input.silent) {
            this.deliverySerial = input.deliverySerial;
            this.owner = input.owner;
            return [];
        }
        if (input.deliverySerial > this.deliverySerial && input.lastDeliveryPlayerId === this.localId) {
            this.emit(HIGHLIGHT_RULES['paperwork-delivered'], input.presentedAtMs, {serial: input.deliverySerial});
        }
        if (input.owner === this.localId) {
            const launch = this.localLaunch();
            if (launch && input.presentedAtMs - launch.at <= 6_000 && this.owner !== this.localId) {
                this.emit(HIGHLIGHT_RULES['launcher-escape'], input.presentedAtMs, {case: true});
            }
        }
        for (const launch of input.launches) {
            if (this.launches.has(launch.id)) continue;
            const record = {at: input.presentedAtMs, y: 0, playerId: launch.playerId};
            this.launches.set(launch.id, record);
            this.launches.set(launch.playerId, record);
            if (launch.playerId === this.localId) this.launches.set(this.localId, record);
        }
        while (this.launches.size > 32) this.launches.delete(this.launches.keys().next().value!);
        this.deliverySerial = input.deliverySerial;
        this.owner = input.owner;
        return this.drain();
    }

    observePhysical(observation: PhysicalObservation): HighlightMarker[] {
        if (!this.primed) return [];
        const launch = this.localLaunch();
        const launchAt = observation.localLaunchedAtMs ?? launch?.at ?? 0;
        const launchY = observation.localLaunchY ?? launch?.y ?? 0;
        if (launchAt && observation.presentedAtMs - launchAt <= 8_000 && observation.localY - launchY >= 25) {
            this.emitUnlessSuppressed('spectacular-launch', observation.presentedAtMs, this.lastSpectacularAt);
        }
        const origin = observation.corpses[0];
        const nearby = observation.corpses.filter(corpse => {
            const age = observation.presentedAtMs - corpse.presentedAtMs;
            if (age < 0 || age > 2_000 || !corpse.onScreen || !corpse.visible) return false;
            if (origin && Math.hypot(corpse.x - origin.x, corpse.z - origin.z) > 20) return false;
            return true;
        });
        if (nearby.length >= 3) this.emitUnlessSuppressed('visible-pileup', observation.presentedAtMs, this.lastPileupAt);
        return this.drain();
    }

    noteLocalLaunch(presentedAtMs: number, y: number): void {
        const record = {at: presentedAtMs, y, playerId: this.localId};
        this.launches.set(`local:${presentedAtMs}`, record);
        if (this.localId) this.launches.set(this.localId, record);
    }

    private localLaunch(): {at: number; y: number; playerId: string} | undefined {
        return this.launches.get(this.localId);
    }

    private emitUnlessSuppressed(kind: HighlightKind, at: number, last: number): void {
        if (kind !== 'round-win' && last && at - last < SUPPRESS_MS) return;
        this.emit(HIGHLIGHT_RULES[kind], at);
        if (kind === 'spectacular-launch') this.lastSpectacularAt = at;
        if (kind === 'visible-pileup') this.lastPileupAt = at;
    }

    private emit(rule: DetectorRule, presentedAtMs: number, metadata?: HighlightMarker['metadata']): void {
        const existing = this.pending.find(item => item.kind === rule.kind && Math.abs(item.presentedAtMs - presentedAtMs) < 250);
        if (existing) {
            if (rule.score > existing.score) {
                existing.score = rule.score;
                existing.titleKey = rule.titleKey;
            }
            return;
        }
        this.pending.push({
            id: randomId(),
            roundId: captureRoundId(this.roundId, this.epoch),
            kind: rule.kind,
            titleKey: rule.titleKey,
            score: rule.score,
            preMs: rule.preMs,
            postMs: rule.postMs,
            presentedAtMs,
            detectorVersion: HIGHLIGHTS_DETECTOR_VERSION,
            metadata,
        });
    }
}
