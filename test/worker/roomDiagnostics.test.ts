import { describe, expect, it } from 'vitest';
import { RoomDiagnostics } from '../../src/worker/RoomDiagnostics';

describe('bounded room diagnostics', () => {
  it('separates room silence and pending checkpoint settlement from tick cost', () => {
    const diagnostics = new RoomDiagnostics();
    const sample = { gapMs: 33, costMs: 2, steps: 2, balls: 1, snapshotBytes: 100, recipients: 1 };
    diagnostics.event(1_000);
    diagnostics.tick(1_000, sample);
    diagnostics.event(1_020, true);
    diagnostics.event(3_520, true);
    diagnostics.checkpointSettled(2_700);
    diagnostics.checkpointSettled(4, true);
    expect(diagnostics.tick(6_000, sample)).toMatchObject({
      eventSilenceMaxMs: 2_500, socketEvents: 2, checkpointSettlements: 2,
      checkpointSettlementMaxMs: 2_700, checkpointFailures: 1, tickCostMaxMs: 2,
    });
    // Preserve the last event across reporting windows, but reset window maxima.
    diagnostics.event(3_540, true);
    expect(diagnostics.tick(11_000, sample)).toMatchObject({
      eventSilenceMaxMs: 20, socketEvents: 1, checkpointSettlements: 0,
      checkpointSettlementMaxMs: 0, checkpointFailures: 0,
    });
  });
  it('aggregates shots, lag and outbound payloads once per five-second window', () => {
    const diagnostics = new RoomDiagnostics();
    const sample = { gapMs: 33, costMs: 2, steps: 2, balls: 100, snapshotBytes: 30_000, recipients: 12 };
    diagnostics.shot('accepted'); diagnostics.shot('implausible');
    diagnostics.count('playerWrite',2);diagnostics.movementBatch('event',7);
    expect(diagnostics.tick(1_000, sample)).toBeNull();
    expect(diagnostics.tick(5_999, sample)).toBeNull();
    const report = diagnostics.tick(6_000, { ...sample, gapMs: 350, costMs: 50, steps: 12, balls: 256, snapshotBytes: 60_000 });
    expect(report).toMatchObject({ ticks: 3, steps: 16, tickGapMaxMs: 350, tickCostMaxMs: 50,
      clockDomain:'runtime-exposed-source-time',operations:{playerWrite:2},movementBatches:{event:1,poses:7,maxPoses:7},
      droppedSimulationMs: 150, peakBalls: 256, snapshotMaxBytes: 60_000, snapshotSentBytes: 1_440_000,
      shots: { accepted: 1, implausible: 1, rateLimited: 0 } });
    const next = diagnostics.tick(11_000, sample);
    expect(next).toMatchObject({ operations:{},movementBatches:{event:0,poses:0,maxPoses:0},ticks: 1, steps: 2, droppedSimulationMs: 0, peakBalls: 100,
      shots: { accepted: 0, implausible: 0 } });
    expect(report!.shots.accepted).toBe(1);
  });
});
