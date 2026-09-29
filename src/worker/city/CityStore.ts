import { HeatDay, heatDayKey, validHeatKey } from '../HeatMap';

/** The room's durable city aggregates (docs/city-map.md, layer 2). Counts are added,
 * never overwritten, so a flush after an eviction cannot double count. Aggregates are
 * kept forever; discrete events are kept here for 30 days (the R2 archive keeps them all). */
export const EVENT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
export type Range = { from: string; to: string };
export interface Filter { mode?: string; layout?: number }
const LABEL = /^[a-z0-9:+_.-]{1,120}$/;

export class CityStore {
  constructor(private readonly sql: SqlStorage) {}

  migrate(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS city_cells (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, layer TEXT NOT NULL, cell TEXT NOT NULL, n INTEGER NOT NULL,
        PRIMARY KEY (day, layout, mode, layer, cell)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS city_places (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, place TEXT NOT NULL, measure TEXT NOT NULL, n INTEGER NOT NULL,
        PRIMARY KEY (day, layout, mode, place, measure)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS city_flows (day TEXT NOT NULL, layout INTEGER NOT NULL, mode TEXT NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL,
        PRIMARY KEY (day, layout, mode, src, dst, who)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS city_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, t INTEGER NOT NULL, round TEXT, type TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_city_events_type ON city_events(type, t);
      CREATE INDEX IF NOT EXISTS idx_city_events_round ON city_events(round, t);
    `);
    const tables = new Set(this.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").toArray().map(r => r.name));
    // Heat v1 wrote one JSON row per day, then per-cell rows without mode or layout; fold both in once.
    if (tables.has('heat_days')) {
      for (const row of this.sql.exec<{ day: string; data: string }>('SELECT day, data FROM heat_days').toArray())
        for (const [layer, cell, n] of HeatDay.parse(row.data).entries()) this.addCell(row.day, 2, 'unknown', layer, cell, n);
      this.sql.exec('DROP TABLE heat_days');
    }
    if (tables.has('heat_cells')) {
      for (const row of this.sql.exec<{ day: string; layer: string; cell: string; n: number }>('SELECT day, layer, cell, n FROM heat_cells').toArray())
        this.addCell(row.day, 2, 'unknown', row.layer, row.cell, row.n);
      this.sql.exec('DROP TABLE heat_cells');
    }
  }

  addCell(day: string, layout: number, mode: string, layer: string, cell: string, n: number): void {
    this.sql.exec('INSERT INTO city_cells (day, layout, mode, layer, cell, n) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, layout, mode, layer, cell) DO UPDATE SET n = n + excluded.n',
      day, layout, mode, layer, cell, n);
  }
  addPlace(day: string, layout: number, mode: string, place: string, measure: string, n: number): void {
    this.sql.exec('INSERT INTO city_places (day, layout, mode, place, measure, n) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, layout, mode, place, measure) DO UPDATE SET n = n + excluded.n',
      day, layout, mode, place, measure, n);
  }
  addFlow(day: string, layout: number, mode: string, src: string, dst: string, who: string, n: number): void {
    this.sql.exec('INSERT INTO city_flows (day, layout, mode, src, dst, who, n) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(day, layout, mode, src, dst, who) DO UPDATE SET n = n + excluded.n',
      day, layout, mode, src, dst, who, n);
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
  modes(range: Range): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of this.sql.exec<{ mode: string; n: number }>("SELECT mode, SUM(n) AS n FROM city_places WHERE day BETWEEN ? AND ? AND measure = 'human-s' GROUP BY mode", range.from, range.to)) out[row.mode] = row.n;
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
