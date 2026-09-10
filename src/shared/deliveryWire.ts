import { MAX_SERVER_MESSAGE_BYTES, type ServerMessage } from './networkProtocol';
import { ChaosDecoder, type ChaosAck } from './chaosWire';

export const MAX_REASSEMBLED_BYTES = 262_144;
export const wireEncoder = new TextEncoder();
export const wireBytes = (text: string): number => wireEncoder.encode(text).byteLength;
export interface DeliveryAck { type: 'deliveryAck'; stream: string; seq: number }
export type DecodedDelivery = { message?: ServerMessage; ack?: ChaosAck | DeliveryAck };

/** All wire frames are bounded, including a large legacy snapshot or welcome.
 * Fragmentation changes representation only; consumers see one atomic message. */
export function fragmentMessage(payload: string, bytes=wireBytes(payload)): Array<{payload:string;bytes:number}> {
  if (bytes > MAX_REASSEMBLED_BYTES) throw new Error('Message budget exceeded');
  if (bytes <= MAX_SERVER_MESSAGE_BYTES - 256) return [{payload,bytes}];
  const parts: string[] = [];
  // At most six UTF-8 bytes per UTF-16 unit after JSON escaping, plus envelope.
  for (let offset = 0; offset < payload.length; offset += 8_000) parts.push(payload.slice(offset, offset + 8_000));
  return parts.map((data, index) => {
    const payload=JSON.stringify({type:'fragment',index,count:parts.length,data});return {payload,bytes:wireBytes(payload)};
  });
}

/** Per-connection ordered reconstruction. Never advance a codec baseline on a
 * partial or invalid message. The caller acknowledges only after application. */
export class DeliveryDecoder {
  lastWireBytes = 0;
  private chaos = new ChaosDecoder();
  private stream = '';
  private seq = 0;
  private partial: { count: number; parts: string[]; bytes: number } | null = null;
  private resyncPending = false;
  read(raw: unknown): DecodedDelivery | null {
    this.lastWireBytes=0;
    if (typeof raw !== 'string' || raw.length > MAX_SERVER_MESSAGE_BYTES) return null;
    this.lastWireBytes=wireBytes(raw);
    if(this.lastWireBytes>MAX_SERVER_MESSAGE_BYTES)return null;
    let frame: any; try { frame = JSON.parse(raw); } catch { return null; }
    // Older previews are readable; protocol validation still controls joining.
    if (frame?.type !== 'delivery') return this.chaos.read(raw);
    const newStream = !!this.stream && frame.stream !== this.stream;
    if (typeof frame.stream !== 'string' || !frame.stream.length || frame.stream.length > 64 ||
        !Number.isSafeInteger(frame.seq) || frame.seq < 1 ||
        (this.stream && !newStream ? frame.seq !== this.seq + 1 : frame.seq !== 1) ||
        !frame.message || typeof frame.message !== 'object') return null;
    const ack: DeliveryAck = { type: 'deliveryAck', stream: frame.stream, seq: frame.seq };
    let value = frame.message;
    if(newStream && value.type!=='welcome' && !(value.type==='fragment' && value.index===0))return null;
    if (value.type === 'fragment') {
      if (!Number.isInteger(value.count) || value.count < 2 || value.count > 33 ||
          !Number.isInteger(value.index) || value.index < 0 || value.index >= value.count ||
          typeof value.data !== 'string' || value.data.length > 8_000) return null;
      const partial = (newStream ? null : this.partial) ?? { count: value.count, parts: [], bytes: 0 };
      if (value.count !== partial.count || value.index !== partial.parts.length ||
          partial.bytes + wireBytes(value.data) > MAX_REASSEMBLED_BYTES) return null;
      const next = { count: partial.count, parts: [...partial.parts, value.data], bytes: partial.bytes + wireBytes(value.data) };
      if (next.parts.length < next.count) {
        this.partial = next; this.stream = frame.stream; this.seq = frame.seq;
        this.resyncPending ||= newStream;
        return { ack };
      }
      try { value = JSON.parse(next.parts.join('')); } catch { return null; }
    } else if (this.partial && !newStream) return null;
    const resync=newStream||this.resyncPending;
    if(resync && value?.type!=='welcome')return null;
    const chaos = resync ? new ChaosDecoder() : this.chaos;
    const decoded = chaos.readValue(value);
    if (!decoded) return null;
    this.chaos = chaos;
    this.resyncPending=false;
    this.partial = null; this.stream = frame.stream; this.seq = frame.seq;
    return { message: decoded.message, ack };
  }
}
