import { HeatDay, heatDayKey, validHeatKey } from '../HeatMap';

/** The room's durable city aggregates (docs/city-map.md, layer 2), keyed by UTC day, build, layout and assignment.
 * Counts are added, never overwritten, so a flush after an eviction cannot double count. Aggregates are
 * kept forever; discrete events are kept here for 30 days (the R2 archive keeps them all).
 *
 * Since the data-cost work (docs/plans/data-cost-2026-10.md) a flush writes each aggregate bucket (kind, day, build,
 * layout, mode, and the layer for cells) as one packed row of `key → n` in `city_packs`, not one row per key:
 * Cloudflare bills SQLite by row. Packs of a bucket are merged in one transaction once enough pile up, so a bucket
 * holds a few rows whatever its play. The per-key tables keep every count written before packing and are read
 * beside the packs; nothing moves out of them. */
export const EVENT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
export type Range = { from: string; to: string };
export interface Filter { mode?: string; layout?: number; build?: string }
const LABEL = /^[a-z0-9:+_.-]{1,120}$/;
/** A release name (`FactContext.build`): what `BUILD` may hold and `build=` may ask for. */
export const BUILD_NAME = /^[A-Za-z0-9._-]{1,80}$/;
/** The build the room records under: the deploy-time `BUILD`, or `dev` when unset or malformed. */
export const buildName = (value: string | undefined): string => value && BUILD_NAME.test(value) ? value : 'dev';
/** Rows written before builds were recorded. */
export const UNKNOWN_BUILD = 'unknown';
/** Each aggregate table's own columns and key, after the shared (day, build, layout, mode). */
const AGGREGATES = [
  ['city_cells', 'layer TEXT NOT NULL, cell TEXT NOT NULL', 'layer, cell'],
  ['city_places', 'place TEXT NOT NULL, measure TEXT NOT NULL', 'place, measure'],
  ['city_flows', 'src TEXT NOT NULL, dst TEXT NOT NULL, who TEXT NOT NULL', 'src, dst, who'],
  ['city_minds', 'measure TEXT NOT NULL', 'measure'],
] as const;
const createAggregate = ([name, columns, key]: typeof AGGREGATES[number]) =>
  `CREATE TABLE IF NOT EXISTS ${name} (day TEXT NOT NULL, build TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, ${columns}, n INTEGER NOT NULL,
    PRIMARY KEY (day, build, layout, mode, ${key})) WITHOUT ROWID;`;

type PackKind = 'cells' | 'places' | 'flows' | 'minds';
/** A pack's bucket. `layer` is the cell layer for cells and empty for the other kinds. */
type Bucket = { kind: PackKind; day: string; build: string; layout: number; mode: string; layer: string };
/** Joins a pack key's parts (place|measure, src|dst|who); no label, build, mode or place id holds a `|`. */
const SEP = '|';
/** A pack row holds at most this much JSON, well inside SQLite's 2 MB row limit on a busy day. */
export const PACK_BYTES = 256 * 1024;
/** Packs at least this big are left alone; smaller ones of a bucket are merged. */
export const PACK_FULL = 128 * 1024;
/** A bucket's small packs are merged once this many pile up (a minute's flush adds one). */
export const PACK_MERGE_AT = 16;
const PACK_MERGE_ROWS = 64;
const BUCKET_WHERE = 'kind = ? AND day = ? AND build = ? AND layout = ? AND mode = ? AND layer = ?';
const bucketArgs = (b: Bucket) => [b.kind, b.day, b.build, b.layout, b.mode, b.layer] as const;

/** Counts as JSON objects of at most PACK_BYTES each. */
function* packChunks(counts: Iterable<[string, number]>): Generator<string> {
  let parts: string[] = [], bytes = 2;
  for (const [key, n] of counts) {
    const part = `${JSON.stringify(key)}:${JSON.stringify(n)}`;
    if (parts.length && bytes + part.length + 1 > PACK_BYTES) { yield `{${parts.join(',')}}`; parts = []; bytes = 2; }
    parts.push(part); bytes += part.length + 1;
  }
  if (parts.length) yield `{${parts.join(',')}}`;
}
const unpack = (data: string): Array<[string, number]> => Object.entries(JSON.parse(data) as Record<string, number>);
const splitKey = (key: string): string[] => key.split(SEP);

/** The per-key upserts the four aggregate tables have always taken (rows mode and unpack). */
const ROW_UPSERT: Record<PackKind, string> = {
  cells: 'INSERT INTO city_cells (day, build, layout, mode, layer, cell, n) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, layer, cell) DO UPDATE SET n = n + excluded.n',
  places: 'INSERT INTO city_places (day, build, layout, mode, place, measure, n) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, place, measure) DO UPDATE SET n = n + excluded.n',
  flows: 'INSERT INTO city_flows (day, build, layout, mode, src, dst, who, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, src, dst, who) DO UPDATE SET n = n + excluded.n',
  minds: 'INSERT INTO city_minds (day, build, layout, mode, measure, n) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, measure) DO UPDATE SET n = n + excluded.n',
};

/** Where a flush writes aggregates. `packs` is the default. `rows` writes one row per key into the four per-key
 * tables, which every release reads: the rollback mode (docs/live-service.md, "Rolling back past packed aggregates"),
 * where `unpackBatch` also moves every pack into those tables so a release from before packing sees all the counts. */
export type AggregateMode = 'packs' | 'rows';
/** The room's mode from the `CITY_AGGREGATES` var: `rows`, or packs for anything else. */
export const aggregateMode = (value: string | undefined): AggregateMode => value === 'rows' ? 'rows' : 'packs';
/** One `unpackBatch`: packs moved, counts moved, packs left. */
export interface UnpackResult { packs: number; counts: number; left: number }

export class CityStore {
  /** Counts (by bucket) and events added since the last commit. */
  private readonly pending = new Map<string, { bucket: Bucket; counts: Map<string, number> }>();
  private pendingEvents: Array<[day: string, t: number, round: string | null, type: string, data: string]> = [];
  private lastPackId: number | undefined;
  /** The retention cut-off last applied by this instance: events are pruned once a day, not every flush. */
  private prunedBefore: string | undefined;

  /** `transaction` runs a synchronous block atomically (the room passes `transactionSync`). */
  constructor(private readonly sql: SqlStorage, private readonly transaction: (fn: () => void) => void = fn => fn(),
    readonly mode: AggregateMode = 'packs') {}

  migrate(): void {
    // Tables from before builds were recorded are rebuilt with the build in the key; their rows read as `unknown`.
    // The room's storage commits one synchronous block at once, so a rebuild cannot half happen.
    for (const table of AGGREGATES) {
      const [name, , key] = table, columns = this.sql.exec<{ name: string }>(`PRAGMA table_info(${name})`).toArray().map(r => r.name);
      if (!columns.length || columns.includes('build')) continue;
      this.sql.exec(`ALTER TABLE ${name} RENAME TO ${name}_v1`);
      this.sql.exec(createAggregate(table));
      this.sql.exec(`INSERT INTO ${name} (day, build, layout, mode, ${key}, n) SELECT day, ?, layout, mode, ${key}, n FROM ${name}_v1`, UNKNOWN_BUILD);
      this.sql.exec(`DROP TABLE ${name}_v1`);
    }
    this.sql.exec(`
      ${AGGREGATES.map(createAggregate).join('\n')}
      CREATE TABLE IF NOT EXISTS city_packs (kind TEXT NOT NULL, day TEXT NOT NULL, build TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL,
        layer TEXT NOT NULL, id INTEGER NOT NULL, bytes INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (kind, day, build, layout, mode, layer, id)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS city_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, t INTEGER NOT NULL, round TEXT, type TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_city_events_type ON city_events(type, t);
      CREATE INDEX IF NOT EXISTS idx_city_events_round ON city_events(round, t);
    `);
    const tables = new Set(this.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map(r => r.name));
    // Heat v1 wrote one JSON row per day, then per-cell rows without mode or layout; fold both in once.
    if (tables.has('heat_days')) {
      for (const row of this.sql.exec<{ day: string; data: string }>('SELECT day, data FROM heat_days').toArray())
        for (const [layer, cell, n] of HeatDay.parse(row.data).entries()) this.addCell(row.day, UNKNOWN_BUILD, 2, 'unknown', layer, cell, n);
      this.commit();
      this.sql.exec('DROP TABLE heat_days');
    }
    if (tables.has('heat_cells')) {
      for (const row of this.sql.exec<{ day: string; layer: string; cell: string; n: number }>('SELECT day, layer, cell, n FROM heat_cells').toArray())
        this.addCell(row.day, UNKNOWN_BUILD, 2, 'unknown', row.layer, row.cell, row.n);
      this.commit();
      this.sql.exec('DROP TABLE heat_cells');
    }
  }

  addCell(day: string, build: string, layout: number, mode: string, layer: string, cell: string, n: number): void {
    this.add({ kind: 'cells', day, build, layout, mode, layer }, cell, n);
  }
  addPlace(day: string, build: string, layout: number, mode: string, place: string, measure: string, n: number): void {
    this.add({ kind: 'places', day, build, layout, mode, layer: '' }, place + SEP + measure, n);
  }
  addFlow(day: string, build: string, layout: number, mode: string, src: string, dst: string, who: string, n: number): void {
    this.add({ kind: 'flows', day, build, layout, mode, layer: '' }, src + SEP + dst + SEP + who, n);
  }
  /** The Jev mind's room-wide measures (`src/shared/city/minds.ts`). */
  addMind(day: string, build: string, layout: number, mode: string, measure: string, n: number): void {
    this.add({ kind: 'minds', day, build, layout, mode, layer: '' }, measure, n);
  }
  private add(bucket: Bucket, key: string, n: number): void {
    const id = bucketArgs(bucket).join(SEP);
    let entry = this.pending.get(id);
    if (!entry) this.pending.set(id, entry = { bucket, counts: new Map() });
    entry.counts.set(key, (entry.counts.get(key) ?? 0) + n);
  }

  /** Writes the events and counts added since the last commit, the counts as packs, and merges buckets whose small
   * packs piled up, in one transaction: a failure writes nothing, and the pending data is dropped so the caller,
   * which still holds it, can add it again without counting twice. */
  commit(): void {
    if (!this.pending.size && !this.pendingEvents.length) return;
    try {
      this.transaction(() => {
        for (const event of this.pendingEvents) this.sql.exec('INSERT INTO city_events (day, t, round, type, data) VALUES (?, ?, ?, ?, ?)', ...event);
        for (const { bucket, counts } of this.pending.values()) {
          if (this.mode === 'rows') { for (const [key, n] of counts) this.addRow(bucket, key, n); continue; }
          for (const data of packChunks(counts)) this.insertPack(bucket, data);
          this.mergeIfDue(bucket);
        }
      });
    } finally {
      this.pending.clear(); this.pendingEvents = [];
    }
  }
  private insertPack(bucket: Bucket, data: string): void {
    this.lastPackId ??= this.sql.exec<{ id: number | null }>('SELECT MAX(id) AS id FROM city_packs').one().id ?? 0;
    this.sql.exec('INSERT INTO city_packs (kind, day, build, layout, mode, layer, id, bytes, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ...bucketArgs(bucket), ++this.lastPackId, data.length, data);
  }
  /** Replaces a bucket's oldest small packs with their sums once PACK_MERGE_AT of them pile up. The rows merged are
   * exactly the small ones from the first to the last id read, so the delete takes nothing that was not summed. */
  private mergeIfDue(bucket: Bucket): void {
    const small = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM city_packs WHERE ${BUCKET_WHERE} AND bytes < ?`, ...bucketArgs(bucket), PACK_FULL).one().n;
    if (small < PACK_MERGE_AT) return;
    const rows = this.sql.exec<{ id: number; data: string }>(`SELECT id, data FROM city_packs WHERE ${BUCKET_WHERE} AND bytes < ? ORDER BY id LIMIT ?`,
      ...bucketArgs(bucket), PACK_FULL, PACK_MERGE_ROWS).toArray();
    const sums = new Map<string, number>();
    for (const row of rows) for (const [key, n] of unpack(row.data)) sums.set(key, (sums.get(key) ?? 0) + n);
    this.sql.exec(`DELETE FROM city_packs WHERE ${BUCKET_WHERE} AND bytes < ? AND id BETWEEN ? AND ?`, ...bucketArgs(bucket), PACK_FULL, rows[0]!.id, rows[rows.length - 1]!.id);
    for (const data of packChunks(sums)) this.insertPack(bucket, data);
  }
  private addRow(bucket: Bucket, key: string, n: number): void {
    const keyParts = bucket.kind === 'cells' ? [bucket.layer, key] : splitKey(key);
    this.sql.exec(ROW_UPSERT[bucket.kind], bucket.day, bucket.build, bucket.layout, bucket.mode, ...keyParts, n);
  }
  /** Moves the oldest packs, whole, into the per-key tables until about `maxBytes` of them moved (at least one), in one
   * transaction: each pack's counts are added to its rows and the pack deleted together, so a count is never in both
   * places or in neither. Rows mode only, so no new pack can arrive behind the move. */
  unpackBatch(maxBytes: number): UnpackResult {
    if (this.mode !== 'rows') throw new Error('Packs are moved into rows only with CITY_AGGREGATES=rows');
    let packs = 0, counts = 0;
    this.transaction(() => {
      let bytes = 0;
      const keys = this.sql.exec<Bucket & { id: number; bytes: number }>(
        'SELECT kind, day, build, layout, mode, layer, id, bytes FROM city_packs ORDER BY kind, day, build, layout, mode, layer, id LIMIT 256').toArray();
      for (const key of keys) {
        if (packs && bytes + key.bytes > maxBytes) break;
        const pk = [...bucketArgs(key), key.id] as const;
        const { data } = this.sql.exec<{ data: string }>(`SELECT data FROM city_packs WHERE ${BUCKET_WHERE} AND id = ?`, ...pk).one();
        for (const [k, n] of unpack(data)) { this.addRow(key, k, n); counts++; }
        this.sql.exec(`DELETE FROM city_packs WHERE ${BUCKET_WHERE} AND id = ?`, ...pk);
        packs++; bytes += key.bytes;
      }
    });
    return { packs, counts, left: this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM city_packs').one().n };
  }

  addEvent(t: number, round: string | undefined, type: string, data: string): void {
    this.pendingEvents.push([heatDayKey(t), t, round ?? null, type, data]);
  }
  /** Drops events older than the retention window. The delete reads the whole table, so it runs when the cut-off
   * day moves (and once per instance), not on every flush; the rows it removes are the same. */
  pruneEvents(now: number): void {
    const before = heatDayKey(now - (EVENT_RETENTION_DAYS - 1) * DAY_MS);
    if (before === this.prunedBefore) return;
    this.sql.exec('DELETE FROM city_events WHERE day < ?', before);
    this.prunedBefore = before;
  }

  private where(range: Range, filter: Filter): [string, unknown[]] {
    const clauses = ['day BETWEEN ? AND ?'], args: unknown[] = [range.from, range.to];
    if (filter.mode) { clauses.push('mode = ?'); args.push(filter.mode); }
    if (filter.layout !== undefined) { clauses.push('layout = ?'); args.push(filter.layout); }
    if (filter.build) { clauses.push('build = ?'); args.push(filter.build); }
    return [clauses.join(' AND '), args];
  }
  /** Every pack of a kind in the range and filter, unpacked. */
  private *packs(kind: PackKind, range: Range, filter: Filter): Generator<{ layer: string; build: string; mode: string; counts: Array<[string, number]> }> {
    const [where, args] = this.where(range, filter);
    for (const row of this.sql.exec<{ layer: string; build: string; mode: string; data: string }>(
      `SELECT layer, build, mode, data FROM city_packs WHERE kind = ? AND ${where}`, kind, ...args).toArray())
      yield { layer: row.layer, build: row.build, mode: row.mode, counts: unpack(row.data) };
  }
  days(range: Range): { days: string[]; allDays: string[] } {
    const days = new Set(this.sql.exec<{ day: string }>('SELECT DISTINCT day FROM city_cells').toArray().map(r => r.day));
    for (const row of this.sql.exec<{ day: string }>("SELECT DISTINCT day FROM city_packs WHERE kind = 'cells'")) days.add(row.day);
    const allDays = [...days].sort();
    return { days: allDays.filter(d => d >= range.from && d <= range.to), allDays };
  }
  cells(range: Range, filter: Filter = {}): Record<string, Record<string, number>> {
    const [where, args] = this.where(range, filter), layers: Record<string, Record<string, number>> = {};
    const add = (layer: string, cell: string, n: number) => {
      if (!LABEL.test(layer) || !validHeatKey(cell)) return;
      const counts = layers[layer] ??= {};
      counts[cell] = (counts[cell] ?? 0) + n;
    };
    for (const row of this.sql.exec<{ layer: string; cell: string; n: number }>(`SELECT layer, cell, SUM(n) AS n FROM city_cells WHERE ${where} GROUP BY layer, cell`, ...args))
      add(row.layer, row.cell, row.n);
    for (const pack of this.packs('cells', range, filter)) for (const [cell, n] of pack.counts) add(pack.layer, cell, n);
    return layers;
  }
  places(range: Range, filter: Filter = {}): Record<string, Record<string, number>> {
    const [where, args] = this.where(range, filter), out: Record<string, Record<string, number>> = {};
    const add = (place: string, measure: string, n: number) => { const m = out[place] ??= {}; m[measure] = (m[measure] ?? 0) + n; };
    for (const row of this.sql.exec<{ place: string; measure: string; n: number }>(`SELECT place, measure, SUM(n) AS n FROM city_places WHERE ${where} GROUP BY place, measure`, ...args))
      add(row.place, row.measure, row.n);
    for (const pack of this.packs('places', range, filter)) for (const [key, n] of pack.counts) { const [place, measure] = splitKey(key); add(place!, measure!, n); }
    return out;
  }
  flows(range: Range, filter: Filter = {}): Array<{ src: string; dst: string; who: string; n: number }> {
    const [where, args] = this.where(range, filter), sums = new Map<string, number>();
    for (const row of this.sql.exec<{ src: string; dst: string; who: string; n: number }>(`SELECT src, dst, who, SUM(n) AS n FROM city_flows WHERE ${where} GROUP BY src, dst, who`, ...args)) {
      const key = row.src + SEP + row.dst + SEP + row.who;
      sums.set(key, (sums.get(key) ?? 0) + row.n);
    }
    for (const pack of this.packs('flows', range, filter)) for (const [key, n] of pack.counts) sums.set(key, (sums.get(key) ?? 0) + n);
    return [...sums].map(([key, n]) => { const [src, dst, who] = splitKey(key); return { src: src!, dst: dst!, who: who!, n }; }).sort((a, b) => b.n - a.n);
  }
  minds(range: Range, filter: Filter = {}): Record<string, number> {
    const [where, args] = this.where(range, filter), out: Record<string, number> = {};
    for (const row of this.sql.exec<{ measure: string; n: number }>(`SELECT measure, SUM(n) AS n FROM city_minds WHERE ${where} GROUP BY measure`, ...args))
      out[row.measure] = (out[row.measure] ?? 0) + row.n;
    for (const pack of this.packs('minds', range, filter)) for (const [measure, n] of pack.counts) out[measure] = (out[measure] ?? 0) + n;
    return out;
  }
  modes(range: Range, filter: Filter = {}): Record<string, number> {
    const [where, args] = this.where(range, filter), out: Record<string, number> = {};
    for (const row of this.sql.exec<{ mode: string; n: number }>(`SELECT mode, SUM(n) AS n FROM city_places WHERE ${where} AND measure = 'human-s' GROUP BY mode`, ...args))
      out[row.mode] = (out[row.mode] ?? 0) + row.n;
    for (const pack of this.packs('places', range, filter))
      for (const [key, n] of pack.counts) if (splitKey(key)[1] === 'human-s') out[pack.mode] = (out[pack.mode] ?? 0) + n;
    return out;
  }
  /** Rat-seconds per build over the range (`human-s`, `bot-s`, `agent-s`), whatever the filter: the builds there are to choose from. */
  builds(range: Range): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    const add = (build: string, measure: string, n: number) => { const m = out[build] ??= {}; m[measure] = (m[measure] ?? 0) + n; };
    for (const row of this.sql.exec<{ build: string; measure: string; n: number }>(
      "SELECT build, measure, SUM(n) AS n FROM city_places WHERE day BETWEEN ? AND ? AND measure IN ('human-s', 'bot-s', 'agent-s') GROUP BY build, measure", range.from, range.to))
      add(row.build, row.measure, row.n);
    for (const pack of this.packs('places', range, {}))
      for (const [key, n] of pack.counts) { const measure = splitKey(key)[1]!; if (measure === 'human-s' || measure === 'bot-s' || measure === 'agent-s') add(pack.build, measure, n); }
    return out;
  }
  events(filter: { type?: string; round?: string; since?: number; limit: number }): Array<{ seq: number; t: number; round: string | null; type: string; data: string }> {
    const clauses = ['t >= ?'], args: unknown[] = [filter.since ?? 0];
    if (filter.type) { clauses.push('type = ?'); args.push(filter.type); }
    if (filter.round) { clauses.push('round = ?'); args.push(filter.round); }
    return this.sql.exec<{ seq: number; t: number; round: string | null; type: string; data: string }>(
      `SELECT seq, t, round, type, data FROM city_events WHERE ${clauses.join(' AND ')} ORDER BY t, seq LIMIT ?`, ...args, filter.limit).toArray();
  }
}
