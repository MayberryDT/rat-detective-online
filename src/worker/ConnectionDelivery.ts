import { fragmentMessage, wireBytes, type DeliveryAck } from '../shared/deliveryWire';
import type { ChaosAck } from '../shared/chaosWire';
import { MAX_SERVER_MESSAGE_BYTES } from '../shared/networkProtocol';

export const MAX_DELIVERY_BYTES = 524_288;
export const MAX_DELIVERY_FRAMES = 256;
export const MAX_PENDING_BYTES = 262_144;
export const DELIVERY_TIMEOUT_MS = 5_000;
type Pending = { payload: string; bytes: number; at: number; replaceKey?: string; chaos?: ChaosAck };

/** Independent socket budget. Reliable events are FIFO barriers; only consecutive
 * replaceable state with the same key can collapse. Overflow resyncs this socket. */
export class ConnectionDelivery {
  readonly stream = crypto.randomUUID();
  private seq = 0;
  private outstanding: Array<{ seq: number; bytes: number; at: number; chaos?: ChaosAck }> = [];
  private pending: Pending[] = [];
  private pendingBytes = 0;
  private flightBytes = 0;
  coalesced = 0;
  ackLagMaxMs = 0;
  private resumeUntil = 0;
  /** A measured room-wide event-loop pause gets one short ACK-drain grace.
   * Byte/frame/backlog budgets remain in force throughout. */
  resumed(now: number): void { this.resumeUntil=now+250; }
  constructor(private readonly send: (payload: string, bytes: number) => void) {}
  get stats() { return { inFlight: this.outstanding.length, inFlightBytes: this.flightBytes, queued: this.pending.length, queuedBytes: this.pendingBytes, coalesced: this.coalesced, ackLagMaxMs: this.ackLagMaxMs }; }
  get ready(): boolean { return !this.pending.length && this.outstanding.length < MAX_DELIVERY_FRAMES && this.flightBytes <= MAX_DELIVERY_BYTES - MAX_SERVER_MESSAGE_BYTES; }
  check(now: number): void {
    if(now<this.resumeUntil)return;
    if ((this.outstanding.length && now - this.outstanding[0].at > DELIVERY_TIMEOUT_MS) ||
        (this.pending.length && now - this.pending[0].at > DELIVERY_TIMEOUT_MS)) throw new Error('Delivery acknowledgement timed out');
  }
  offer(payload: string, now: number, replaceKey?: string, chaos?: ChaosAck, knownBytes?:number): void {
    this.check(now);
    const parts = fragmentMessage(payload,knownBytes);
    for (let index = 0; index < parts.length; index++) {
      let part = parts[index].payload, partBytes=parts[index].bytes;
      const key = parts.length === 1 ? replaceKey : undefined;
      const last = this.pending[this.pending.length - 1];
      if (key && last?.replaceKey === key) {
        if (key === 'movementBatch') {
          const before = JSON.parse(last.payload), after = JSON.parse(part);
          const id = (sample: any) => Array.isArray(sample) ? sample[0] : sample.player.id;
          const samples = new Map(before.players.map((sample: any) => [id(sample),sample]));
          for (const sample of after.players) samples.set(id(sample),sample);
          part = JSON.stringify({...after,players:[...samples.values()]});
          partBytes=wireBytes(part);
        }
        this.pending.pop(); this.pendingBytes -= last.bytes; this.coalesced++;
      }
      const bytes = partBytes;
      this.pending.push({ payload: part, bytes, at: now, replaceKey: key, ...(index === parts.length - 1 ? { chaos } : {}) });
      this.pendingBytes += bytes;
      this.flush(now);
      if (this.pending.length > 512 || this.pendingBytes > MAX_PENDING_BYTES) throw new Error('Reliable delivery backlog exceeded');
    }
  }
  acknowledge(ack: DeliveryAck, now: number): ChaosAck | undefined {
    if (ack.stream !== this.stream) return;
    const index = this.outstanding.findIndex(frame => frame.seq === ack.seq);
    if (index < 0) return;
    let chaos: ChaosAck | undefined;
    for (const frame of this.outstanding.splice(0, index + 1)) {
      this.flightBytes -= frame.bytes;
      this.ackLagMaxMs = Math.max(this.ackLagMaxMs, now - frame.at);
      if (frame.chaos) chaos = frame.chaos;
    }
    this.flush(now);
    return chaos;
  }
  flush(now: number): void {
    this.check(now);
    while (this.pending.length && this.outstanding.length < MAX_DELIVERY_FRAMES) {
      const next = this.pending[0];
      if (this.flightBytes + next.bytes + 160 > MAX_DELIVERY_BYTES) return;
      const seq = this.seq + 1;
      const prefix = '{"type":"delivery","stream":' + JSON.stringify(this.stream) + ',"seq":' + seq + ',"message":';
      const payload = prefix + next.payload + '}';
      // Prefix is ASCII (UUID, decimal sequence, fixed property names).
      const bytes = prefix.length + next.bytes + 1;
      if (bytes > MAX_SERVER_MESSAGE_BYTES) throw new Error('Delivery frame budget exceeded');
      this.send(payload, bytes);
      this.seq = seq; this.pending.shift(); this.pendingBytes -= next.bytes;
      this.flightBytes += bytes; this.outstanding.push({ seq, bytes, at: now, chaos: next.chaos });
    }
  }
}
