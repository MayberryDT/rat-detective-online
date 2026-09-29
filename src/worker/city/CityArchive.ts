import { CITY_SCHEMA_VERSION } from '../../shared/city/facts';

/** Every fact, as gzipped JSON lines in R2, kept forever (docs/city-map.md). One object per
 * flush: `city/raw/v1/<room>/YYYY/MM/DD/HH-mm-ss-<rand>.jsonl.gz`. A buffer is flushed every
 * five minutes, when it passes 2 MB, and when the city stops; an eviction loses at most the buffer. */
export const ARCHIVE_FLUSH_MS = 5 * 60_000;
export const ARCHIVE_MAX_BYTES = 2 * 1024 * 1024;
export const archiveKey = (room: string, from: number): string => {
  const iso = new Date(from).toISOString();
  return `city/raw/v1/${room}/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(11, 13)}-${iso.slice(14, 16)}-${iso.slice(17, 19)}-${crypto.randomUUID().slice(0, 8)}.jsonl.gz`;
};

export class CityArchive {
  private lines: string[] = [];
  private bytes = 0;
  private from = 0;
  private lastFlush = 0;
  /** Lines dropped because the buffer could not be written (no bucket, or a failed put). */
  dropped = 0;
  private readonly inflight = new Set<Promise<void>>();
  constructor(private readonly room: string, private readonly bucket: R2Bucket | undefined, private readonly waitUntil: (p: Promise<unknown>) => void) {}

  push(fact: object, now: number): void {
    if (!this.bucket) return;
    const line = JSON.stringify(fact);
    if (!this.lines.length) this.from = now;
    this.lines.push(line); this.bytes += line.length + 1;
    if (this.bytes >= ARCHIVE_MAX_BYTES) this.flush(now);
  }

  due(now: number): boolean { return this.lines.length > 0 && now - this.lastFlush >= ARCHIVE_FLUSH_MS; }

  flush(now: number): void {
    this.lastFlush = now;
    if (!this.bucket || !this.lines.length) return;
    const body = this.lines.join('\n') + '\n', count = this.lines.length, from = this.from;
    this.lines = []; this.bytes = 0;
    const bucket = this.bucket;
    const put = (async () => {
      const gz = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      await bucket.put(archiveKey(this.room, from), gz, {
        httpMetadata: { contentType: 'application/gzip' },
        customMetadata: { schema: String(CITY_SCHEMA_VERSION), lines: String(count), from: String(from), to: String(now) },
      });
    })().catch(() => { this.dropped += count; }).finally(() => this.inflight.delete(put));
    this.inflight.add(put); this.waitUntil(put);
  }

  /** Resolves when every started write has finished. */
  async settled(): Promise<void> { await Promise.all([...this.inflight]); }
}
