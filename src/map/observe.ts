// Observe: what happened, where. Any recorded layer as cells or as place shading, flows between places, and place cards.
import { ASSIGNMENTS, ASSIGNMENT_IDS, ASSIGNMENT_DESTINATIONS } from '../shared/assignments';
import { CASE_SPAWNS, DISPATCH_STATIONS, LAUNCH_MACHINES } from '../shared/chaosState';
import { PICKUP_ANCHORS, type PickupKind } from '../shared/pickups';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import { SEWER_ENTRIES, SEWER_HALLS, SEWER_MANHOLE } from '../shared/sewerLayout';
import { cellIndex } from '../shared/city/frame';
import type { Place } from '../shared/city/places';
import { FOOTPRINTS, LAYOUT, PLACES } from './city';
import { drawCity, drawLabels, RAMP_CSS, rampColor, type MapView } from './canvas';
import { foldCounts, rangeQuery, type FoldedCounts, type Flows, type Heat, type PlaceCounts, type RangeChoice } from './data';
import { choices, definitions, duration, el, esc, section, toggle } from './dom';
import type { Context, Mode } from './mode';
import type { PlaceFloor } from './placeLayer';

type Floor = 'all' | 'street' | 'upper' | 'sewer' | 'air';
/** A recorded layer: its heat cells, and the place counts that measure the same thing (none for ball ends). */
const LAYERS: Record<string, { label: string; cells: string[]; place?: string[]; seconds?: true }> = {
  humans: { label: 'Human time', cells: ['humans'], place: ['human-s'], seconds: true },
  bots: { label: 'Bot time', cells: ['bots'], place: ['bot-s'], seconds: true },
  deaths: { label: 'Deaths', cells: ['deaths'], place: ['deaths'] },
  kills: { label: 'Killer spots', cells: ['kills'], place: ['kills'] },
  'shots-human': { label: 'Human shots', cells: ['shots-human'], place: ['shots-human'] },
  'shots-bot': { label: 'Bot shots', cells: ['shots-bot'], place: ['shots-bot'] },
  bounces: { label: 'Cheese bounces', cells: ['ball-world-bounce'] },
  'ball-hits': { label: 'Cheese hits', cells: ['ball-rat-body', 'ball-rat-head'] },
  expired: { label: 'Cheese run out', cells: ['ball-lifetime'] },
  pickups: { label: 'Pickups taken', cells: ['pickups'], place: ['pickup:ironclad', 'pickup:hustle', 'pickup:quick-fix'] },
  landings: { label: 'Launch landings', cells: ['landings'], place: ['landings'] },
  spawns: { label: 'Spawns', cells: ['spawns'], place: ['spawns'] },
  anomalies: { label: 'Faults', cells: ['anomalies'] },
};
const OVERLAYS: Record<string, [string, string, boolean]> = {
  entries: ['Sewer entrances', '#2fd3e6', true], sewer: ['Sewer tunnels', '#2f8f9d', false], pickups: ['Supplies', '#3ddc6a', true],
  cases: ['Case spawns', '#c8963e', false], launchers: ['Launchers', '#e2352b', true], pillars: ['Dispatch pillars', '#ff7a1f', false],
  zones: ['Jurisdiction zones', '#8a5cf6', false], dest: ['Paper Chase stops', '#ffd23f', false],
};
const PICKUP_COLOR: Record<PickupKind, string> = { ironclad: '#d9dde3', hustle: '#ff3b3b', 'quick-fix': '#3ddc6a' };
const COUNT_ROWS: Array<[string, string, boolean?]> = [
  ['human-s', 'Human time', true], ['bot-s', 'Bot time', true], ['deaths-human', 'Human deaths'], ['deaths-bot', 'Bot deaths'], ['kills', 'Kills made here'],
  ['shots-human', 'Human shots'], ['hits-human', 'Human hits'], ['bank-hits-human', '…banked off a wall'], ['shots-bot', 'Bot shots'],
  ['spawns', 'Spawns'], ['landings', 'Landings'], ['case-take', 'Case taken'], ['deliveries', 'Deliveries'],
];

export function observe(ctx: Context): Mode {
  const p = ctx.params;
  const state = {
    layer: LAYERS[p.get('layer') ?? ''] ? p.get('layer')! : 'humans',
    floor: (['all', 'street', 'upper', 'sewer', 'air'] as const).find(f => f === p.get('floor')) ?? 'all' as Floor,
    show: p.get('show') === 'places' ? 'places' : 'cells',
    flows: p.get('flows') === '1', smooth: p.get('smooth') !== '0',
    range: { when: p.get('days') ?? 'all', from: p.get('from') ?? '', to: p.get('to') ?? '', layout: p.get('layout') ?? '', assignment: p.get('assign') ?? '' } as RangeChoice,
  };
  if (state.range.from && state.range.to) state.range.when = 'custom';
  const shown = new Map(Object.entries(OVERLAYS).map(([k, [, , on]]) => [k, on]));
  let heat: Heat | undefined, folded: FoldedCounts | undefined, flows: Flows | undefined;

  const save = () => {
    const set = (k: string, v: string, fallback: string) => { if (v === fallback) p.delete(k); else p.set(k, v); };
    set('layer', state.layer, 'humans'); set('floor', state.floor, 'all'); set('show', state.show, 'cells'); set('flows', state.flows ? '1' : '0', '0'); set('smooth', state.smooth ? '1' : '0', '1');
    set('days', state.range.when === 'custom' ? 'all' : state.range.when, 'all'); set('from', state.range.when === 'custom' ? state.range.from : '', ''); set('to', state.range.when === 'custom' ? state.range.to : '', '');
    set('layout', state.range.layout, ''); set('assign', state.range.assignment, '');
    ctx.save();
  };
  const change = () => { save(); ctx.redraw(); };
  const reload = () => { save(); void mode.refresh(); };

  const fromInput = el('input'), toInput = el('input');
  for (const input of [fromInput, toInput]) {
    input.type = 'date';
    input.addEventListener('change', () => {
      if (!fromInput.value || !toInput.value) return;
      Object.assign(state.range, { when: 'custom', from: fromInput.value, to: toInput.value }); when.render(); reload();
    });
  }
  const when = choices([['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All time']], () => state.range.when, v => { state.range.when = v; reload(); });
  const totals = el('div');
  const showAs = choices([['cells', '4-unit cells'], ['places', 'Places']], () => state.show, v => { state.show = v; change(); }, v => v === 'places' && !LAYERS[state.layer]!.place);
  const overlayBox = el('div', {}, ...Object.entries(OVERLAYS).map(([k, [name, color]]) => toggle(name, shown.get(k)!, on => { shown.set(k, on); ctx.redraw(); }, color)));
  const panel = el('div', {},
    el('p', { className: 'note', text: 'Where rats spend their time in the live city, where they die, where the killers stood and where the cheese goes, drawn over today\'s layout. Hover for a place card.' }),
    section('Show', choices(Object.entries(LAYERS).map(([k, v]) => [k, v.label] as const), () => state.layer, v => { state.layer = v; if (!LAYERS[v]!.place) state.show = 'cells'; showAs.render(); change(); })),
    section('As', showAs),
    section('Floor', choices([['all', 'All floors'], ['street', 'Street'], ['upper', 'Upstairs & roofs'], ['sewer', 'Sewer'], ['air', 'In the air']], () => state.floor, v => { state.floor = v as Floor; change(); })),
    section('When', when, el('div', { className: 'dates' }, el('label', {}, 'From', fromInput), el('label', {}, 'To', toInput))),
    section('Layout and assignment',
      choices([['', 'All layouts'], [String(LAYOUT), `Layout ${LAYOUT} (now)`], [String(LAYOUT - 1), `Layout ${LAYOUT - 1}`]], () => state.range.layout, v => { state.range.layout = v; reload(); }),
      (() => {
        const select = el('select');
        for (const [v, label] of [['', 'Every assignment'], ...ASSIGNMENT_IDS.map(id => [id, ASSIGNMENTS[id].title] as const)]) { const o = el('option', { text: label }); o.value = v; select.appendChild(o); }
        select.value = state.range.assignment;
        select.addEventListener('change', () => { state.range.assignment = select.value; reload(); });
        return el('div', { className: 'choices' }, select);
      })()),
    section('Totals', totals),
    section('On the map', toggle('Flow arrows between places (busiest 40)', state.flows, on => { state.flows = on; change(); }), toggle('Smooth heat', state.smooth, on => { state.smooth = on; change(); }), overlayBox),
  );

  /** The chosen layer's counts per ground cell, over the chosen floor. */
  const heatCells = (): Map<string, number> => {
    const out = new Map<string, number>();
    for (const layer of LAYERS[state.layer]!.cells) for (const [key, n] of Object.entries(heat?.layers[layer] ?? {})) {
      const split = key.indexOf(':');
      if (state.floor !== 'all' && key.slice(0, split) !== state.floor) continue;
      const ground = key.slice(split + 1);
      out.set(ground, (out.get(ground) ?? 0) + n);
    }
    return out;
  };
  const placeValue = (place: Place) => (LAYERS[state.layer]!.place ?? []).reduce((t, k) => t + (folded?.counts[place.id]?.[k] ?? 0), 0);
  const show = (n: number) => LAYERS[state.layer]!.seconds ? duration(n) : String(Math.round(n));
  let hot = new Map<string, number>(), hottest = 0;

  const mode: Mode = {
    id: 'observe', label: 'Observe', panel,
    async refresh() {
      const query = rangeQuery(state.range);
      ctx.status('Loading the live city…');
      try {
        let counts: PlaceCounts;
        [heat, counts, flows] = await Promise.all([
          ctx.api.json<Heat>(`/api/heat/v1?${query}`), ctx.api.json<PlaceCounts>(`/api/city/v1/places?${query}`), ctx.api.json<Flows>(`/api/city/v1/flows?${query}`),
        ]);
        folded = foldCounts(counts.places);
        const first = heat.allDays[0], last = heat.allDays[heat.allDays.length - 1];
        for (const input of [fromInput, toInput]) { if (first) input.min = first; if (last) input.max = last; }
        if (state.range.when !== 'custom') { fromInput.value = heat.days[0] ?? ''; toInput.value = heat.days[heat.days.length - 1] ?? ''; }
        ctx.status(`Updated ${new Date().toLocaleTimeString()}; refreshes every minute. Recording since ${first ?? 'today'}.`);
      } catch (error) {
        ctx.status(`Could not load the city (${error instanceof Error ? error.message : 'error'}).`);
      }
      const sum = (layer: string) => Object.values(heat?.layers[layer] ?? {}).reduce((t, n) => t + n, 0);
      totals.replaceChildren(definitions([
        ['Human time', duration(sum('humans'))], ['Bot time', duration(sum('bots'))],
        ['Deaths', String(sum('deaths'))], ['Human shots', String(sum('shots-human'))], ['Bot shots', String(sum('shots-bot'))],
        ['Cheese hits', String(sum('ball-rat-body') + sum('ball-rat-head'))],
        ['Days', heat ? `${heat.days.length} of ${heat.allDays.length}` : '–'],
        ...(folded?.unplaced ? [['Place IDs not on this layout', String(folded.unplaced)] as const] : []),
      ]));
      ctx.redraw();
    },
    draw() {
      const view: MapView = ctx.view, layer = LAYERS[state.layer]!;
      drawCity(view, FOOTPRINTS);
      if (shown.get('sewer')) for (const h of SEWER_HALLS) view.rect(h.xmin, h.xmax, h.zmin, h.zmax, 'rgba(47,143,157,.16)', '#2f8f9d', 1, [6, 5]);
      let scale: string;
      if (state.show === 'places' && layer.place) {
        const floor: PlaceFloor = state.floor === 'air' ? 'all' : state.floor;
        const values = PLACES.list.map(pl => placeValue(pl) / Math.max(16, pl.area));
        const top = Math.max(0, ...values);
        ctx.places.draw(view, floor, pl => { const v = placeValue(pl) / Math.max(16, pl.area); return v > 0 ? rampColor(Math.sqrt(v / top)) : undefined; });
        scale = top ? `per 100 u²: up to ${show(top * 100)}` : 'Nothing recorded for this choice yet.';
      } else {
        hot = heatCells(); hottest = Math.max(0, ...hot.values());
        view.cells((ix, iz) => { const n = hot.get(`${ix}:${iz}`); return n ? rampColor(Math.log1p(n) / Math.log1p(hottest)) : undefined; }, state.smooth);
        scale = hottest ? `${show(hottest)} in the hottest 4-unit cell` : 'Nothing recorded for this choice yet.';
      }
      if (state.flows && flows) {
        const who = state.layer === 'bots' || state.layer === 'shots-bot' ? 'bot' : 'human', top = flows.flows.filter(f => f.who === who).slice(0, 40), most = top[0]?.n ?? 1;
        for (const f of top) {
          const a = PLACES.successor(f.src), b = PLACES.successor(f.dst);
          if (a && b && a !== b) view.arrow(a.x, a.z, b.x, b.z, 1 + 5 * f.n / most, who === 'bot' ? '#6f9dffcc' : '#ffd76acc');
        }
      }
      if (shown.get('zones')) for (const z of Object.values(JURISDICTION_ZONES)) for (const a of z.areas) view.rect(a.xmin, a.xmax, a.zmin, a.zmax, 'rgba(138,92,246,.16)', '#b79bff', 2);
      if (shown.get('dest')) for (const d of Object.values(ASSIGNMENT_DESTINATIONS)) view.rect(d.bounds.xmin, d.bounds.xmax, d.bounds.zmin, d.bounds.zmax, undefined, '#ffd23f', 2, [8, 4]);
      drawLabels(view);
      if (shown.get('entries')) for (const e of [...SEWER_ENTRIES, SEWER_MANHOLE]) view.dot(e.x, e.z, 7, 'transparent', '#2fd3e6', 2.5);
      if (shown.get('cases')) for (const c of CASE_SPAWNS) view.quad({ x: c.x, z: c.z, w: 5, d: 3.4 }, '#c8963e', '#000', 1.2);
      if (shown.get('launchers')) for (const m of LAUNCH_MACHINES) view.dot(m.pad.x, m.pad.z, 7, '#e2352b');
      if (shown.get('pillars')) for (const s of DISPATCH_STATIONS) {
        const g = view.g; g.beginPath(); g.moveTo(view.X(s.x), view.Z(s.z) - 9); g.lineTo(view.X(s.x) + 7, view.Z(s.z) + 5); g.lineTo(view.X(s.x) - 7, view.Z(s.z) + 5); g.closePath();
        g.fillStyle = s.y < 0 ? '#ff9a3c' : '#ff5a1f'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.2; g.stroke();
      }
      if (shown.get('pickups')) for (const s of PICKUP_ANCHORS) view.dot(s.x, s.z, 5, PICKUP_COLOR[s.kind]);
      return `<b>${esc(layer.label)}${state.show === 'places' ? ', by place' : ''}</b><div class="ramp"><span>less</span><i style="background:${RAMP_CSS}"></i><span>${esc(scale)}</span></div>`
        + `<p>${state.range.layout ? `Layout ${esc(state.range.layout)} only` : 'Every layout'}; ${state.floor === 'all' ? 'every floor' : esc(state.floor)}. ${state.show === 'places' ? 'Shaded by count per area of each place; upper floors and rooms are the chips (8, 16, R = roof, L = lookout, C = chute).' : 'Log scale.'}</p>`;
    },
    hover(px, py, x, z) {
      const floor: PlaceFloor = state.floor === 'air' || state.floor === 'all' ? (state.show === 'places' ? 'all' : 'street') : state.floor;
      const place = ctx.places.hit(ctx.view, px, py, floor), cellN = hot.get(`${cellIndex(x)}:${cellIndex(z)}`) ?? 0;
      const lines = [`x ${x.toFixed(0)}, z ${z.toFixed(0)}${state.show === 'cells' ? ` · this cell: ${show(cellN)}` : ''}`];
      if (!place) return lines.join('\n');
      const row = folded?.counts[place.id] ?? {};
      for (const [k, label, seconds] of COUNT_ROWS) if (row[k]) lines.push(`${label}: ${seconds ? duration(row[k]!) : row[k]}`);
      const supplies = Object.entries(row).filter(([k]) => k.startsWith('pickup:')).map(([k, n]) => `${k.slice(7)} ${n}`).join(', ');
      if (supplies) lines.push(`Supplies taken: ${supplies}`);
      return `<b>${esc(place.name)}</b>\n<code>${esc(place.id)}</code> · ${esc(place.district)} · ${place.area} u²\n${esc(lines.join('\n'))}`;
    },
  };
  return mode;
}
