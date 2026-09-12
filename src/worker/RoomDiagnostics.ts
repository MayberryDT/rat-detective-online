import { MAX_SERVER_MESSAGE_BYTES } from '../shared/networkProtocol';
/** Bounded, aggregate counters: no per-shot/player payload retention. */
export type ShotOutcome = 'accepted' | 'rateLimited' | 'dead' | 'roundOver' | 'implausible' | 'duplicate';
const outcomes = (): Record<ShotOutcome, number> => ({ accepted: 0, rateLimited: 0, dead: 0, roundOver: 0, implausible: 0, duplicate: 0 });
export class RoomDiagnostics {
  private traffic: Record<string,{messages:number;bytes:number}> = {};
  private closes: Record<string,number> = {};
  private flow = { inFlight:0,inFlightBytes:0,queued:0,queuedBytes:0,coalesced:0,ackLagMaxMs:0 };
  sent(payload: string, bytes: number): void {
    const types = [...payload.slice(0,256).matchAll(/"type":"([A-Za-z]{1,32})"/g)];
    const kind = types[types.length-1]?.[1] ?? 'other';
    const counter = this.traffic[kind] ??= {messages:0,bytes:0};
    counter.messages++;counter.bytes+=bytes;
  }
  closed(code: number): void { this.closes[String(code)] = (this.closes[String(code)]??0)+1; }
  delivery(sample: typeof this.flow): void {
    for (const key of Object.keys(this.flow) as Array<keyof typeof this.flow>) this.flow[key] = Math.max(this.flow[key],sample[key]);
  }
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
  private netplayCounts: Record<string,number> = {};
  private netplayLatency: Record<string,{samples:number;total:number;max:number}> = {};
  private rewind={samples:0,totalMs:0,maxMs:0,totalDelta:0,maxDelta:0};
  netplay(kind:'shot'|'pickup'|'movement',result:string,elapsedMs:number,detail?:string,measure?:{rewindMs?:number;targetDelta?:number}):void {
    const key=`${kind}:${result}${detail?`:${detail}`:''}`;
    this.netplayCounts[key]=(this.netplayCounts[key]??0)+1;
    const sample=this.netplayLatency[`${kind}:${result}`]??={samples:0,total:0,max:0};
    sample.samples++;sample.total+=Math.max(0,elapsedMs);sample.max=Math.max(sample.max,elapsedMs);
    if(measure?.rewindMs!==undefined){const r=this.rewind;r.samples++;r.totalMs+=measure.rewindMs;r.maxMs=Math.max(r.maxMs,measure.rewindMs);
      r.totalDelta+=measure.targetDelta??0;r.maxDelta=Math.max(r.maxDelta,measure.targetDelta??0);}
  }
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
      traffic: this.traffic, connectionCloses: this.closes, deliveryHighWater: this.flow,
      clockDomain: 'runtime-exposed-source-time',
      sourceNow: now,
      sourceTickGapMaxMs: round(this.maxGap), sourceCheckpointSpanMaxMs: round(this.maxCheckpointSettlement),
      windowMs: now - this.started, ticks: this.ticks, steps: this.steps,
      tickGapAvgMs: round(this.elapsed / this.ticks), tickGapMaxMs: round(this.maxGap),
      tickCostAvgMs: round(this.cost / this.ticks), tickCostMaxMs: round(this.maxCost),
      droppedSimulationMs: round(this.dropped), balls: sample.balls, peakBalls: this.peakBalls,
      snapshotAvgBytes: Math.round(this.snapshotBytes / this.ticks), snapshotMaxBytes: this.maxSnapshotBytes,
      snapshotSentBytes: this.sentBytes, snapshotsOverBudget: this.overBudget, shots: this.shots,
      netplay: {counts:this.netplayCounts,latency:Object.fromEntries(Object.entries(this.netplayLatency).map(([kind,sample])=>[kind,
        {samples:sample.samples,avgMs:round(sample.total/sample.samples),maxMs:round(sample.max)}])),rewind:{samples:this.rewind.samples,
          avgMs:this.rewind.samples?round(this.rewind.totalMs/this.rewind.samples):0,maxMs:round(this.rewind.maxMs),
          targetDeltaAvg:this.rewind.samples?round(this.rewind.totalDelta/this.rewind.samples):0,targetDeltaMax:round(this.rewind.maxDelta)}},
      eventSilenceMaxMs: round(this.maxEventSilence), socketEvents: this.receivedEvents,
      checkpointSettlements: this.checkpointSettlements,
      checkpointSettlementMaxMs: round(this.maxCheckpointSettlement), checkpointFailures: this.checkpointFailures,
      suppressedMovementBroadcasts: this.suppressedMovementCount,
    };
    this.operations={};this.batches={tick:0,event:0,poses:0,maxPoses:0};
    this.traffic={};this.closes={};this.flow={inFlight:0,inFlightBytes:0,queued:0,queuedBytes:0,coalesced:0,ackLagMaxMs:0};
    this.started = now; this.shots = outcomes(); this.ticks = this.steps = this.elapsed = this.maxGap = this.cost = this.maxCost = this.dropped = this.peakBalls = this.snapshotBytes = this.maxSnapshotBytes = this.sentBytes = this.overBudget = 0;
    this.netplayCounts={};this.netplayLatency={};
    this.rewind={samples:0,totalMs:0,maxMs:0,totalDelta:0,maxDelta:0};
    this.maxEventSilence = this.receivedEvents = this.checkpointSettlements = this.maxCheckpointSettlement = this.checkpointFailures = 0;
    this.suppressedMovementCount = 0;
    return result;
  }
}
