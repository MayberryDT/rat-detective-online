// Analyse: what the layout implies before anyone plays (static analyses, docs/city-map.md), and what play
// has measured in each place, with its uncertainty, hiding every place under the doc's minimums.
import { divergence, measurePlaces, MIN_EVENTS, MIN_HUMAN_SECONDS, type PlaceMeasures, type Rate } from '../shared/city/measures';
import {
  chokepoints, coverDensity, islands, jobs, JOB_KINDS, objectiveSources, sightlines, spawnReach, travelField, travelSeconds,
  type CellField, type ChokeScore, type JobKind,
} from '../shared/city/analysis';
import { CELL_MIN, CELL_SPAN, CITY_CELL, DISTRICTS, type District } from '../shared/city/frame';
import type { Place } from '../shared/city/places';
import { BOUNDS, cityGrid, FOOTPRINTS, LAYOUT, PLACES, SLOTS, SPAWNS } from './city';
import { divergeColor, DIVERGE_CSS, drawCity, drawLabels, RAMP_CSS, rampColor } from './canvas';
import { foldCounts, rangeQuery, type PlaceCounts, type RangeChoice } from './data';
import { choices, definitions, duration, el, esc, pct, section } from './dom';
import type { Context, Mode } from './mode';
import type { PlaceFloor } from './placeLayer';

/** A static layer: a field on the 4-unit cells, worked out once from the layout. */
interface StaticLayer { label: string; about: string; unit: (v: number) => string }
const STATIC: Record<string, StaticLayer> = {
  open: { label: 'Ground in view', about: 'The exposure raster: how much open ground a rat standing here can see (32 directions at eye height, up to 180 units). Open squares and long lanes show before anyone dies in them.', unit: v => `${Math.round(v).toLocaleString()} u²` },
  sight: { label: 'Longest sightline', about: 'The longest clear line of sight from each street cell (32 directions at eye height, capped at 180 units).', unit: v => `${Math.round(v)} u` },
  cover: { label: 'Cover density', about: 'Share of the ground within 6 units that shields a rat\'s body. Cell bars let cheese through, so they are not cover.', unit: v => pct(v) },
  reach: { label: 'Seconds to an objective', about: 'Running seconds from each street cell to the nearest objective (case spawn, supply, pillar, zone, Paper Chase stop), street level only.', unit: v => `${v.toFixed(1)} s` },
  islands: { label: 'Cut-off ground', about: 'Street ground a rat cannot walk to from the main street network (stairs, the sewer and launchers aside). Red is cut off.', unit: v => (v ? 'cut off' : 'on the network') },
};
const OTHER_STATIC: Record<string, string> = { choke: 'Chokepoints', jobs: 'Jobs per district' };

/** A measured layer: one value per place, and whether that place has enough play to show it. */
interface Measured {
  label: string; about: string; scale: 'ramp' | 'diverge';
  read(m: PlaceMeasures, all: Totals): { v: number; lo?: number; hi?: number } | undefined;
  ready(m: PlaceMeasures): boolean;
  format(v: number): string;
  /** Diverging layers: map a value to -1..1. */
  tilt?(v: number): number;
}
interface Totals { human: number; bot: number }
const HUMAN_MIN = `${MIN_HUMAN_SECONDS / 60} human rat-minutes`;
const rateOf = (r: Rate | undefined, per = 1) => (r ? { v: r.rate * per, lo: r.lo * per, hi: r.hi * per } : undefined);
const n = (m: PlaceMeasures, k: string) => m.raw[k] ?? 0;
const MEASURED: Record<string, Measured> = {
  use: {
    label: 'Use', scale: 'diverge', about: `Share of human time over share of walkable area. Under 0.3 is a dead zone (blue), over 3 a magnet (red). Needs ${HUMAN_MIN}.`,
    read: m => (m.use === undefined ? undefined : { v: m.use }), ready: m => m.enough, format: v => v.toFixed(2), tilt: v => Math.log(Math.max(v, 1e-3)) / Math.log(3),
  },
  'danger-human': {
    label: 'Danger to humans', scale: 'ramp', about: `Human deaths per human rat-hour here. Needs ${HUMAN_MIN}.`,
    read: m => rateOf(m.dangerHuman, 60), ready: m => m.enough, format: v => `${v.toFixed(1)}/h`,
  },
  danger: {
    label: 'Danger, all rats', scale: 'ramp', about: `Deaths per rat-hour, humans and bots together (mostly bots today). Needs ${MIN_HUMAN_SECONDS / 60} rat-minutes of any kind.`,
    read: m => rateOf(m.danger, 60), ready: m => m.humanS + m.botS >= MIN_HUMAN_SECONDS, format: v => `${v.toFixed(1)}/h`,
  },
  lethality: {
    label: 'Lethality', scale: 'diverge', about: `Kills made from a place over deaths suffered there (with one added to each). Over 1 (red) is a strong position; under 1 (blue) a trap. Needs ${MIN_EVENTS} kills and deaths.`,
    read: m => (m.lethality === undefined ? undefined : { v: m.lethality }), ready: m => n(m, 'kills') + n(m, 'deaths') >= MIN_EVENTS, format: v => v.toFixed(2), tilt: v => Math.log2(v) / 1.5,
  },
  'fire-human': {
    label: 'Human fire rate', scale: 'ramp', about: `Human shots per human rat-minute alive here. Firing is always good (cheese banks); this reads where the fights are. Needs ${HUMAN_MIN}.`,
    read: m => rateOf(m.fireHuman), ready: m => m.enough, format: v => `${v.toFixed(0)}/min`,
  },
  'fire-bot': {
    label: 'Bot fire rate', scale: 'ramp', about: `Bot shots per bot rat-minute here. Needs ${MIN_HUMAN_SECONDS / 60} bot rat-minutes.`,
    read: m => rateOf(m.fireBot), ready: m => m.botS >= MIN_HUMAN_SECONDS, format: v => `${v.toFixed(0)}/min`,
  },
  'bank-human': {
    label: 'Banked hits, humans', scale: 'ramp', about: `Share of human hits from this place that came off a wall first. Needs ${HUMAN_MIN} and ${MIN_EVENTS} hits.`,
    read: m => rateOf(m.bankHuman), ready: m => m.enough && n(m, 'hits-human') >= MIN_EVENTS, format: v => pct(v),
  },
  'bank-bot': {
    label: 'Banked hits, bots', scale: 'ramp', about: `Share of bot hits from this place that came off a wall first. Needs ${MIN_EVENTS} hits.`,
    read: m => rateOf(m.bankBot), ready: m => n(m, 'hits-bot') >= MIN_EVENTS, format: v => pct(v),
  },
  'spawn-trap': {
    label: 'Spawn traps', scale: 'ramp', about: `Share of spawns here that die within 5 s. Needs ${MIN_EVENTS} spawns.`,
    read: m => rateOf(m.spawnTrap), ready: m => n(m, 'spawns') >= MIN_EVENTS, format: v => pct(v),
  },
  divergence: {
    label: 'Bot divergence', scale: 'diverge', about: `Where bots and humans part ways: red where humans spend a bigger share of their time than bots, blue the reverse. Needs ${MIN_HUMAN_SECONDS / 60} rat-minutes of any kind.`,
    read: (m, all) => {
      const h = all.human ? m.humanS / all.human : 0, b = all.bot ? m.botS / all.bot : 0;
      return h + b > 0 ? { v: (h - b) / (h + b) } : undefined;
    },
    ready: m => m.humanS + m.botS >= MIN_HUMAN_SECONDS, format: v => (v > 0 ? `humans +${pct(v)}` : `bots +${pct(-v)}`), tilt: v => v,
  },
};
const JOB_LABEL: Record<JobKind, string> = { case: 'case spawns', supply: 'supplies', pillar: 'pillars', zone: 'zones', destination: 'stops', spawn: 'spawn points' };
const JOB_COLOR: Record<JobKind, string> = { case: '#c8963e', supply: '#3ddc6a', pillar: '#ff7a1f', zone: '#8a5cf6', destination: '#ffd23f', spawn: '#a5b9e155' };

export function analyse(ctx: Context): Mode {
  const p = ctx.params;
  const state = {
    layer: STATIC[p.get('analysis') ?? ''] || OTHER_STATIC[p.get('analysis') ?? ''] || MEASURED[p.get('analysis') ?? ''] ? p.get('analysis')! : 'open',
    floor: (['all', 'upper', 'sewer'] as const).find(f => f === p.get('floor')) ?? 'all',
    range: { when: p.get('days') ?? 'all', from: '', to: '', layout: p.get('layout') ?? '', assignment: '' } satisfies RangeChoice,
  };
  const fields = new Map<string, CellField>();
  let choke: { scores: ChokeScore[]; byId: Map<string, number> } | undefined, reach: Record<District, number | undefined> | undefined;
  let measures: Map<string, PlaceMeasures> | undefined, totals: Totals = { human: 0, bot: 0 }, js: number | undefined, digestText = '', working = '';

  const save = () => {
    if (state.layer === 'open') p.delete('analysis'); else p.set('analysis', state.layer);
    if (state.range.when === 'all') p.delete('days'); else p.set('days', state.range.when);
    if (state.range.layout) p.set('layout', state.range.layout); else p.delete('layout');
    if (state.floor === 'all') p.delete('floor'); else p.set('floor', state.floor);
    ctx.save();
  };
  const pick = (v: string) => { state.layer = v; save(); render(); void prepare(); ctx.redraw(); };

  /** Works out a static layer the first time it is asked for, letting the page paint "working" first. */
  const prepare = async () => {
    const layer = state.layer;
    const needed = STATIC[layer] ? !fields.has(layer) : layer === 'choke' ? !choke : layer === 'jobs' ? !reach : false;
    if (!needed || working) return;
    working = layer; ctx.status(`Working out ${(STATIC[layer]?.label ?? OTHER_STATIC[layer] ?? layer).toLowerCase()} from the layout…`); ctx.redraw();
    await new Promise(r => setTimeout(r, 30));
    const t = performance.now(), grid = cityGrid();
    if (layer === 'sight' || layer === 'open') { const s = sightlines(grid); fields.set('sight', s.longest); fields.set('open', s.open); }
    else if (layer === 'cover') fields.set('cover', coverDensity(grid));
    else if (layer === 'islands') fields.set('islands', islands(grid).field);
    else if (layer === 'reach' || layer === 'jobs') {
      const seconds = travelSeconds(grid, objectiveSources(grid, SLOTS.filter(s => s.kind !== 'spawn')).sources);
      fields.set('reach', travelField(grid, seconds)); reach = spawnReach(grid, SPAWNS, seconds);
    } else if (layer === 'choke') {
      const found = chokepoints(grid, (x, z) => { const pl = PLACES.at(x, .3, z); return pl.id === 'outside' || pl.kind === 'water' ? undefined : pl; });
      choke = { scores: found.scores, byId: new Map(found.scores.map(s => [s.id, s.score])) };
    }
    working = '';
    ctx.status(`Worked out from layout ${LAYOUT} in ${Math.round(performance.now() - t)} ms.`);
    render(); ctx.redraw();
  };

  const about = el('p', { className: 'note' }), detail = el('div'), digest = el('div', { className: 'digest' }), exposure = el('div');
  const staticChoices = choices([...Object.entries(STATIC).map(([k, v]) => [k, v.label] as const), ...Object.entries(OTHER_STATIC)], () => state.layer, pick);
  const measuredChoices = choices(Object.entries(MEASURED).map(([k, v]) => [k, v.label] as const), () => state.layer, pick);
  const floorChoices = choices([['all', 'Street & floors'], ['upper', 'Rooftops'], ['sewer', 'Sewer']], () => state.floor, v => { state.floor = v === 'upper' ? 'upper' : v === 'sewer' ? 'sewer' : 'all'; save(); ctx.redraw(); });
  const reload = () => { save(); void mode.refresh(); };
  const panel = el('div', {},
    el('p', { className: 'note', text: 'What the layout implies before anyone plays, and what play has measured in each place. Every rate carries its 95% interval; places under the minimums stay blank.' }),
    section('From the layout alone', staticChoices),
    section('Measured, per place', measuredChoices,
      el('div', { className: 'dates' }, choices([['7', '7 days'], ['30', '30 days'], ['all', 'All time']], () => state.range.when, v => { state.range.when = v; reload(); }),
        choices([['', 'All layouts'], [String(LAYOUT), `Layout ${LAYOUT}`], [String(LAYOUT - 1), `Layout ${LAYOUT - 1}`]], () => state.range.layout, v => { state.range.layout = v; reload(); })),
      el('div', { className: 'dates' }, floorChoices)),
    section('Reading', about, detail),
    section('Exposure', exposure),
    section('The digest', digest),
  );

  const readyPlaces = (m: Measured) => measures ? [...measures.values()].filter(pm => m.ready(pm) && m.read(pm, totals)) : [];
  const interval = (m: Measured, r: { v: number; lo?: number; hi?: number }) => (r.lo === undefined || r.hi === undefined ? m.format(r.v) : `${m.format(r.v)} (${m.format(r.lo)}–${m.format(r.hi)})`);

  /** The side panel's reading of the chosen layer: what it means, and its table. */
  function render(): void {
    staticChoices.render(); measuredChoices.render(); floorChoices.render();
    const layer = state.layer, m = MEASURED[layer];
    about.textContent = STATIC[layer]?.about ?? m?.about ?? (layer === 'choke'
      ? 'Betweenness of each street place on the graph of places that touch: the share of shortest place-to-place routes that pass through it. The top ten are numbered on the map.'
      : 'Objectives, supplies, pillars and spawn points in each ninth of the city, and the median running seconds from its spawn points to the nearest objective. A district with no objective has no job.');
    if (m) {
      const rows = readyPlaces(m).map(pm => ({ pm, r: m.read(pm, totals)! })).sort((a, b) => b.r.v - a.r.v).slice(0, 12);
      const hidden = measures ? [...measures.values()].filter(pm => !m.ready(pm) && m.read(pm, totals)).length : 0;
      detail.replaceChildren(rows.length
        ? el('table', {}, el('tr', { html: '<th>Place</th><th>Value (95%)</th><th>Rat time</th>' }),
          ...rows.map(({ pm, r }) => el('tr', { html: `<td>${esc(pm.place.name)}</td><td>${esc(interval(m, r))}</td><td>${esc(duration(pm.humanS + pm.botS))}</td>` })))
        : el('p', { className: 'note', text: measures ? 'No place has enough play for this measure yet.' : 'Loading…' }),
        el('p', { className: 'note', text: `${rows.length ? `Top ${rows.length} of ${readyPlaces(m).length} places with enough play. ` : ''}${hidden} more have some data but stay hidden under the minimums.` }));
    } else if (layer === 'choke') {
      detail.replaceChildren(choke
        ? el('table', {}, el('tr', { html: '<th>#</th><th>Place</th><th>Routes through</th>' }),
          ...choke.scores.slice(0, 10).map((s, i) => el('tr', { html: `<td>${i + 1}</td><td>${esc(PLACES.byId.get(s.id)?.name ?? s.id)}</td><td>${pct(s.score)}</td>` })))
        : el('p', { className: 'note', text: 'Working…' }));
    } else if (layer === 'jobs') {
      const { table, idle } = jobs(SLOTS);
      detail.replaceChildren(el('div', { className: 'compass' }, ...DISTRICTS.map(d => {
        const row = table[d], cell = el('div', { className: idle.includes(d) ? 'idle' : '' }, el('b', { text: d.replace('-', ' ') }));
        cell.appendChild(el('span', { text: JOB_KINDS.filter(k => k !== 'spawn' && row[k]).map(k => `${row[k]} ${JOB_LABEL[k]}`).join(', ') || 'no objectives' }));
        const secs = reach?.[d];
        cell.appendChild(el('small', { text: ` · ${row.spawn} spawns${secs === undefined ? '' : `, ${secs.toFixed(0)} s to an objective`}` }));
        return cell;
      })));
    } else {
      const f = fields.get(layer), values = f ? [...f.values].filter(Number.isFinite).sort((a, b) => a - b) : [];
      const q = (t: number) => values[Math.min(values.length - 1, Math.floor(values.length * t))]!;
      const unit = STATIC[layer]!.unit;
      detail.replaceChildren(values.length
        ? definitions(layer === 'islands'
          ? [['Street cells', String(values.length)], ['Cut off', `${values.filter(v => v > 0).length} (${pct(values.filter(v => v > 0).length / values.length)})`]]
          : [['Street cells', String(values.length)], ['Median', unit(q(.5))], ['Top tenth from', unit(q(.9))], ['Most', unit(values[values.length - 1]!)]])
        : el('p', { className: 'note', text: 'Working…' }));
    }
    exposure.replaceChildren(measures
      ? definitions([['Human rat-time', duration(totals.human)], ['Bot rat-time', duration(totals.bot)],
        ['Places with enough human play', `${[...measures.values()].filter(pm => pm.enough).length} of ${PLACES.list.length}`],
        ['Bot divergence, whole city', js === undefined ? '–' : js.toFixed(2)]])
      : el('p', { className: 'note', text: 'Loading…' }));
  }

  /** Continuous layers are shaded by rank, so a city of long streets still shows which cells are the most exposed. */
  const staticColor = (layer: string, f: CellField) => {
    const sorted = [...f.values].filter(Number.isFinite).sort((a, b) => a - b);
    const bound = (v: number, upper: boolean) => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m]! < v || (upper && sorted[m] === v)) lo = m + 1; else hi = m; } return lo; };
    // Ties share their middle rank, so a capped value (every sightline that reaches 180 units) reads as the top band it is.
    const rank = (v: number) => (bound(v, false) + bound(v, true)) / 2 / Math.max(1, sorted.length);
    return (v: number) => layer === 'islands' ? (v ? 'rgba(230,90,80,.9)' : 'rgba(165,185,225,.12)') : rampColor(rank(v));
  };

  const mode: Mode = {
    id: 'analyse', label: 'Analyse', panel,
    async refresh() {
      const query = rangeQuery(state.range);
      void prepare();
      try {
        const [counts, text] = await Promise.all([ctx.api.json<PlaceCounts>(`/api/city/v1/places?${query}`), ctx.api.text(`/api/city/v1/digest?${query}`)]);
        const folded = foldCounts(counts.places).counts;
        measures = measurePlaces(PLACES.list, folded);
        const human: Record<string, number> = {}, bot: Record<string, number> = {};
        for (const [id, row] of Object.entries(folded)) { human[id] = row['human-s'] ?? 0; bot[id] = row['bot-s'] ?? 0; }
        totals = { human: Object.values(human).reduce((t, v) => t + v, 0), bot: Object.values(bot).reduce((t, v) => t + v, 0) };
        js = totals.human && totals.bot ? divergence(human, bot) : undefined;
        digestText = text;
        if (!working) ctx.status(`Measures updated ${new Date().toLocaleTimeString()}; refreshes every minute.`);
      } catch (error) {
        ctx.status(`Could not load the measures (${error instanceof Error ? error.message : 'error'}).`);
      }
      digest.innerHTML = markdown(digestText || 'Loading the digest…');
      render(); ctx.redraw();
    },
    draw() {
      const view = ctx.view, layer = state.layer, m = MEASURED[layer];
      drawCity(view, FOOTPRINTS, { dim: .8 });
      let legend: string;
      if (m) {
        const ready = readyPlaces(m), top = Math.max(1e-6, ...ready.map(pm => m.read(pm, totals)!.v));
        const floor: PlaceFloor = state.floor;
        ctx.places.draw(view, floor, pl => {
          const pm = measures?.get(pl.id);
          if (!pm) return undefined;
          const r = m.read(pm, totals);
          if (!r) return undefined;
          if (!m.ready(pm)) return 'rgba(165,185,225,.10)';
          return m.scale === 'diverge' ? divergeColor(m.tilt!(r.v)) : rampColor(r.v / top);
        });
        legend = `<b>${esc(m.label)}</b><div class="ramp"><span>${m.scale === 'diverge' ? 'blue' : 'less'}</span><i style="background:${m.scale === 'diverge' ? DIVERGE_CSS : RAMP_CSS}"></i><span>${m.scale === 'diverge' ? 'red' : ready.length ? `up to ${esc(m.format(top))}` : 'no place has enough play yet'}</span></div>`
          + `<p>${ready.length} places shaded; faint places have data under the minimums. ${state.range.layout ? `Layout ${esc(state.range.layout)} only.` : 'Every layout, folded onto layout ' + LAYOUT + '.'}</p>`;
      } else if (layer === 'choke') {
        const most = choke?.scores[0]?.score ?? 1;
        ctx.places.draw(view, 'street', pl => { const s = choke?.byId.get(pl.id); return s ? rampColor(Math.sqrt(s / most)) : undefined; });
        choke?.scores.slice(0, 10).forEach((s, i) => { view.dot(s.x, s.z, 10, '#d9b95e', '#05070d', 2); view.label(s.x, s.z + .4, String(i + 1), 13, '#05070d'); });
        legend = `<b>Chokepoints</b><div class="ramp"><span>few routes</span><i style="background:${RAMP_CSS}"></i><span>most routes pass here</span></div><p>Street places only; stairs, sewer and launchers are not routes here.</p>`;
      } else if (layer === 'jobs') {
        const third = (BOUNDS.max - BOUNDS.min) / 3, { idle } = jobs(SLOTS);
        DISTRICTS.forEach((d, i) => {
          const x0 = BOUNDS.min + third * (i % 3), z0 = BOUNDS.min + third * Math.floor(i / 3);
          view.rect(x0, x0 + third, z0, z0 + third, idle.includes(d) ? 'rgba(200,50,42,.18)' : undefined, '#a5b9e155', 1.5, [8, 6]);
        });
        for (const s of SLOTS) if (s.kind === 'spawn') view.dot(s.x, s.z, 1.6, JOB_COLOR.spawn, '');
        for (const s of SLOTS) if (s.kind !== 'spawn') view.dot(s.x, s.z, s.kind === 'zone' || s.kind === 'destination' ? 7 : 5, JOB_COLOR[s.kind], '#05070d', 1.5);
        legend = `<b>Jobs per district</b><p>${JOB_KINDS.map(k => `<span style="color:${JOB_COLOR[k]}">●</span> ${JOB_LABEL[k]}`).join(' &nbsp;')}</p><p>${idle.length ? `No job: ${esc(idle.join(', '))}.` : 'Every district has a job.'}</p>`;
      } else {
        const f = fields.get(layer), info = STATIC[layer]!;
        if (f) {
          const color = staticColor(layer, f);
          view.cells((ix, iz) => { const v = f.values[(iz - f.min) * f.span + ix - f.min]; return v === undefined || !Number.isFinite(v) ? undefined : color(v); });
        }
        const sorted = f ? [...f.values].filter(Number.isFinite).sort((a, b) => a - b) : [];
        const at = (t: number) => info.unit(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * t))] ?? 0);
        legend = `<b>${esc(info.label)}</b>${layer === 'islands' ? '' : `<div class="ramp"><span>${f ? esc(at(0)) : ''}</span><i style="background:${RAMP_CSS}"></i><span>${f ? esc(at(1)) : 'working…'}</span></div>`}`
          + `<p>From layout ${LAYOUT} alone, on 4-unit street cells.${layer === 'islands' || !f ? '' : ` Shaded by rank: median ${esc(at(.5))}, top tenth from ${esc(at(.9))}.`}</p>`;
      }
      drawLabels(view, false);
      return legend;
    },
    hover(px, py, x, z) {
      const layer = state.layer, m = MEASURED[layer], f = fields.get(layer);
      const lines: string[] = [];
      if (f && STATIC[layer]) {
        const ix = Math.floor(x / CITY_CELL), iz = Math.floor(z / CITY_CELL);
        const v = ix >= CELL_MIN && iz >= CELL_MIN && ix < CELL_MIN + CELL_SPAN && iz < CELL_MIN + CELL_SPAN ? f.values[(iz - f.min) * f.span + ix - f.min] : undefined;
        lines.push(v !== undefined && Number.isFinite(v) ? `${STATIC[layer]!.label}: ${STATIC[layer]!.unit(v)}` : 'No street here');
      }
      const floor: PlaceFloor = m ? state.floor : 'street';
      const place = ctx.places.hit(ctx.view, px, py, floor);
      if (!place) return lines.length ? esc(lines.join('\n')) : undefined;
      if (layer === 'choke') lines.push(`Routes through: ${pct(choke?.byId.get(place.id) ?? 0)}`);
      return `<b>${esc(place.name)}</b>\n<code>${esc(place.id)}</code> · ${esc(place.district)}\n${esc([...lines, ...card(place)].join('\n'))}`;
    },
  };

  /** Every measure for one place, with its interval, or why it is hidden. */
  function card(place: Place): string[] {
    const pm = measures?.get(place.id);
    if (!pm) return [];
    const out = [`Rat time: ${duration(pm.humanS)} human, ${duration(pm.botS)} bot`];
    if (!pm.enough) out.push(`Under ${HUMAN_MIN}: human measures hidden`);
    for (const m of Object.values(MEASURED)) {
      const r = m.read(pm, totals);
      if (r && m.ready(pm)) out.push(`${m.label}: ${interval(m, r)}`);
    }
    return out;
  }
  render();
  return mode;
}

/** The digest's Markdown (headings, lists, bold, code handles) as HTML. */
export function markdown(text: string): string {
  const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out: string[] = [];
  let list = false;
  for (const line of text.split('\n')) {
    const item = /^\s*[-*] (.*)$/.exec(line);
    if (item) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(item[1]!)}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const heading = /^(#{1,4}) (.*)$/.exec(line);
    if (heading) out.push(`<h4>${inline(heading[2]!)}</h4>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
