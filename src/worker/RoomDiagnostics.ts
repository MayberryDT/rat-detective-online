import { MAX_SERVER_MESSAGE_BYTES } from '../shared/networkProtocol';
/** Bounded, aggregate counters: no per-shot/player payload retention. */
export type ShotOutcome = 'accepted' | 'rateLimited' | 'dead' | 'roundOver' | 'implausible' | 'duplicate';
const outcomes = (): Record<ShotOutcome, number> => ({ accepted: 0, rateLimited: 0, dead: 0, roundOver: 0, implausible: 0, duplicate: 0 });
export class RoomDiagnostics {
  private operations: Record<string, number> = {};
  count(kind: 'playerWrite'|'roomWrite'|'alarmRead'|'alarmSet'|'alarmDelete'|'movementOverwrite'|'snapshotOffer'|'snapshotAccepted', amount = 1): void {
    this.operations[kind] = (this.operations[kind] ?? 0) + amount;
  }
  private batches = { tick: 0, event: 0, poses: 0, maxPoses: 0 };
  movementBatch(reason: 'tick'|'event', poses: number): void {
    this.batches[reason]++;this.batches.poses+=poses;this.batches.maxPoses=Math.max(this.batches.maxPoses,poses);
  }
  private started = 0;
  private shots = outcomes();
  private ticks = 0;
  private steps = 0;
  private elapsed = 0;
  private maxGap = 0;
  private cost = 0;
  private maxCost = 0;
  private dropped = 0;
  private peakBalls = 0;
  private snapshotBytes = 0;
  private maxSnapshotBytes = 0;
  private sentBytes = 0;
  private overBudget = 0;
  private lastEventAt: number | null = null;
  private maxEventSilence = 0;
  private receivedEvents = 0;
  private checkpointSettlements = 0;
  private maxCheckpointSettlement = 0;
  private checkpointFailures = 0;
  private suppressedMovementCount = 0;
  suppressedMovement(): void { this.suppressedMovementCount++; }
  /** Source-clock entry gaps only; scheduled timer clamping can conceal lateness. */
  event(now: number, socket = false): void {
    if (this.lastEventAt !== null) this.maxEventSilence = Math.max(this.maxEventSilence, now - this.lastEventAt);
    this.lastEventAt = now;
    if (socket) this.receivedEvents++;
  }
  /** Exposed source-clock span; not independent wall time or disk latency. */
  checkpointSettled(elapsedMs: number, failed = false): void {
    this.checkpointSettlements++;
    this.maxCheckpointSettlement = Math.max(this.maxCheckpointSettlement, elapsedMs);
    if (failed) this.checkpointFailures++;
  }
  shot(outcome: ShotOutcome): void { this.shots[outcome]++; }
  tick(now: number, sample: { gapMs: number; costMs: number; steps: number; balls: number; snapshotBytes: number; maxSnapshotBytes?: number; sentBytes?: number; recipients: number }) {
    if (!this.started) this.started = now;
    this.ticks++; this.steps += sample.steps; this.elapsed += sample.gapMs;
    this.maxGap = Math.max(this.maxGap, sample.gapMs);
    this.cost += sample.costMs; this.maxCost = Math.max(this.maxCost, sample.costMs);
    this.dropped += Math.max(0, sample.gapMs - 200);
    this.peakBalls = Math.max(this.peakBalls, sample.balls);
    this.snapshotBytes += sample.snapshotBytes;
    this.maxSnapshotBytes = Math.max(this.maxSnapshotBytes, sample.maxSnapshotBytes??sample.snapshotBytes);
    this.sentBytes += sample.sentBytes??sample.snapshotBytes * sample.recipients;
    if ((sample.maxSnapshotBytes??sample.snapshotBytes) > MAX_SERVER_MESSAGE_BYTES) this.overBudget++;
    if (now - this.started < 5_000) return null;
    const round = (n: number) => Math.round(n * 100) / 100;
    const result = {
      operations: this.operations, movementBatches: this.batches,
      clockDomain: 'runtime-exposed-source-time',
      sourceNow: now,
      sourceTickGapMaxMs: round(this.maxGap), sourceCheckpointSpanMaxMs: round(this.maxCheckpointSettlement),
      windowMs: now - this.started, ticks: this.ticks, steps: this.steps,
      tickGapAvgMs: round(this.elapsed / this.ticks), tickGapMaxMs: round(this.maxGap),
      tickCostAvgMs: round(this.cost / this.ticks), tickCostMaxMs: round(this.maxCost),
      droppedSimulationMs: round(this.dropped), balls: sample.balls, peakBalls: this.peakBalls,
      snapshotAvgBytes: Math.round(this.snapshotBytes / this.ticks), snapshotMaxBytes: this.maxSnapshotBytes,
      snapshotSentBytes: this.sentBytes, snapshotsOverBudget: this.overBudget, shots: this.shots,
      eventSilenceMaxMs: round(this.maxEventSilence), socketEvents: this.receivedEvents,
      checkpointSettlements: this.checkpointSettlements,
      checkpointSettlementMaxMs: round(this.maxCheckpointSettlement), checkpointFailures: this.checkpointFailures,
      suppressedMovementBroadcasts: this.suppressedMovementCount,
    };
    this.operations={};this.batches={tick:0,event:0,poses:0,maxPoses:0};
    this.started = now; this.shots = outcomes(); this.ticks = this.steps = this.elapsed = this.maxGap = this.cost = this.maxCost = this.dropped = this.peakBalls = this.snapshotBytes = this.maxSnapshotBytes = this.sentBytes = this.overBudget = 0;
    this.maxEventSilence = this.receivedEvents = this.checkpointSettlements = this.maxCheckpointSettlement = this.checkpointFailures = 0;
    this.suppressedMovementCount = 0;
    return result;
  }
}
