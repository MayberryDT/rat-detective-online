import { HeatDay, heatDayKey, validHeatKey } from '../HeatMap';

/** The room's durable city aggregates (docs/city-map.md, layer 2), keyed by UTC day, build, layout and assignment.
 * Counts are added, never overwritten, so a flush after an eviction cannot double count. Aggregates are
 * kept forever; discrete events are kept here for 30 days (the R2 archive keeps them all). */
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

export class CityStore {
  constructor(private readonly sql: SqlStorage) {}

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
      CREATE TABLE IF NOT EXISTS city_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, t INTEGER NOT NULL, round TEXT, type TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_city_events_type ON city_events(type, t);
      CREATE INDEX IF NOT EXISTS idx_city_events_round ON city_events(round, t);
    `);
    const tables = new Set(this.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map(r => r.name));
    // Heat v1 wrote one JSON row per day, then per-cell rows without mode or layout; fold both in once.
    if (tables.has('heat_days')) {
      for (const row of this.sql.exec<{ day: string; data: string }>('SELECT day, data FROM heat_days').toArray())
        for (const [layer, cell, n] of HeatDay.parse(row.data).entries()) this.addCell(row.day, UNKNOWN_BUILD, 2, 'unknown', layer, cell, n);
      this.sql.exec('DROP TABLE heat_days');
    }
    if (tables.has('heat_cells')) {
      for (const row of this.sql.exec<{ day: string; layer: string; cell: string; n: number }>('SELECT day, layer, cell, n FROM heat_cells').toArray())
        this.addCell(row.day, UNKNOWN_BUILD, 2, 'unknown', row.layer, row.cell, row.n);
      this.sql.exec('DROP TABLE heat_cells');
    }
  }

  addCell(day: string, build: string, layout: number, mode: string, layer: string, cell: string, n: number): void {
    this.sql.exec('INSERT INTO city_cells (day, build, layout, mode, layer, cell, n) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, layer, cell) DO UPDATE SET n = n + excluded.n',
      day, build, layout, mode, layer, cell, n);
  }
  addPlace(day: string, build: string, layout: number, mode: string, place: string, measure: string, n: number): void {
    this.sql.exec('INSERT INTO city_places (day, build, layout, mode, place, measure, n) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, place, measure) DO UPDATE SET n = n + excluded.n',
      day, build, layout, mode, place, measure, n);
  }
  addFlow(day: string, build: string, layout: number, mode: string, src: string, dst: string, who: string, n: number): void {
    this.sql.exec('INSERT INTO city_flows (day, build, layout, mode, src, dst, who, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, src, dst, who) DO UPDATE SET n = n + excluded.n',
      day, build, layout, mode, src, dst, who, n);
  }
  /** The Jev mind's room-wide measures (`src/shared/city/minds.ts`). */
  addMind(day: string, build: string, layout: number, mode: string, measure: string, n: number): void {
    this.sql.exec('INSERT INTO city_minds (day, build, layout, mode, measure, n) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, build, layout, mode, measure) DO UPDATE SET n = n + excluded.n',
      day, build, layout, mode, measure, n);
  }
  addEvent(t: number, round: string | undefined, type: string, data: string): void {
    this.sql.exec('INSERT INTO city_events (day, t, round, type, data) VALUES (?, ?, ?, ?, ?)', heatDayKey(t), t, round ?? null, type, data);
  }
  pruneEvents(now: number): void {
    this.sql.exec('DELETE FROM city_events WHERE day < ?', heatDayKey(now - (EVENT_RETENTION_DAYS - 1) * DAY_MS));
  }

  private where(range: Range, filter: Filter): [string, unknown[]] {
    const clauses = ['day BETWEEN ? AND ?'], args: unknown[] = [range.from, range.to];
    if (filter.mode) { clauses.push('mode = ?'); args.push(filter.mode); }
    if (filter.layout !== undefined) { clauses.push('layout = ?'); args.push(filter.layout); }
    if (filter.build) { clauses.push('build = ?'); args.push(filter.build); }
    return [clauses.join(' AND '), args];
  }
  days(range: Range): { days: string[]; allDays: string[] } {
    const allDays = this.sql.exec<{ day: string }>('SELECT DISTINCT day FROM city_cells ORDER BY day').toArray().map(r => r.day);
    return { days: allDays.filter(d => d >= range.from && d <= range.to), allDays };
  }
  cells(range: Range, filter: Filter = {}): Record<string, Record<string, number>> {
    const [where, args] = this.where(range, filter), layers: Record<string, Record<string, number>> = {};
    for (const row of this.sql.exec<{ layer: string; cell: string; n: number }>(`SELECT layer, cell, SUM(n) AS n FROM city_cells WHERE ${where} GROUP BY layer, cell`, ...args)) {
      if (!LABEL.test(row.layer) || !validHeatKey(row.cell)) continue;
      (layers[row.layer] ??= {})[row.cell] = row.n;
    }
    return layers;
  }
  places(range: Range, filter: Filter = {}): Record<string, Record<string, number>> {
    const [where, args] = this.where(range, filter), out: Record<string, Record<string, number>> = {};
    for (const row of this.sql.exec<{ place: string; measure: string; n: number }>(`SELECT place, measure, SUM(n) AS n FROM city_places WHERE ${where} GROUP BY place, measure`, ...args))
      (out[row.place] ??= {})[row.measure] = row.n;
    return out;
  }
  flows(range: Range, filter: Filter = {}): Array<{ src: string; dst: string; who: string; n: number }> {
    const [where, args] = this.where(range, filter);
    return this.sql.exec<{ src: string; dst: string; who: string; n: number }>(`SELECT src, dst, who, SUM(n) AS n FROM city_flows WHERE ${where} GROUP BY src, dst, who ORDER BY n DESC`, ...args).toArray();
  }
  minds(range: Range, filter: Filter = {}): Record<string, number> {
    const [where, args] = this.where(range, filter), out: Record<string, number> = {};
    for (const row of this.sql.exec<{ measure: string; n: number }>(`SELECT measure, SUM(n) AS n FROM city_minds WHERE ${where} GROUP BY measure`, ...args)) out[row.measure] = row.n;
    return out;
  }
  modes(range: Range, filter: Filter = {}): Record<string, number> {
    const [where, args] = this.where(range, filter), out: Record<string, number> = {};
    for (const row of this.sql.exec<{ mode: string; n: number }>(`SELECT mode, SUM(n) AS n FROM city_places WHERE ${where} AND measure = 'human-s' GROUP BY mode`, ...args)) out[row.mode] = row.n;
    return out;
  }
  /** Rat-seconds per build over the range (`human-s`, `bot-s`, `agent-s`), whatever the filter: the builds there are to choose from. */
  builds(range: Range): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const row of this.sql.exec<{ build: string; measure: string; n: number }>(
      "SELECT build, measure, SUM(n) AS n FROM city_places WHERE day BETWEEN ? AND ? AND measure IN ('human-s', 'bot-s', 'agent-s') GROUP BY build, measure", range.from, range.to))
      (out[row.build] ??= {})[row.measure] = row.n;
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
