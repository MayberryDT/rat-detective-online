/// <reference types="vite/client" />
// Design: proposals (design/city/proposals/*.json), the footprint change each one draws, the static
// analyses before and after, and each prediction's verdict once both layouts have enough human play.
import { judge, parseProposal, VERDICT_HUMAN_SECONDS, type Counts, type Outcome, type Proposal, type Reading } from '../shared/city/verdict';
import { coverDensity, islands, sightlines, type StreetGrid } from '../shared/city/analysis';
import { CITY_BOUNDS } from '../shared/grayboxLayout';
import { cityGrid, FOOTPRINTS, footprintKey, LAYOUT, layoutSnapshot, PLACES, SUPPLIES, type Footprint, type LayoutSnapshot, type SnapshotSupply } from './city';
import { drawCity, drawLabels } from './canvas';
import type { PlaceCounts } from './data';
import { choices, definitions, duration, el, esc, pct, section } from './dom';
import type { Context, Mode } from './mode';

const FILES = import.meta.glob('../../design/city/proposals/*.json', { eager: true, import: 'default' });
/** Every proposal file, parsed; a malformed file shows as its error instead of breaking the page. */
const PROPOSALS: Array<{ file: string; proposal?: Proposal; error?: string }> = Object.entries(FILES).map(([path, json]) => {
  const file = path.replace(/^(\.\.\/)+/, '');
  try { return { file, proposal: parseProposal(json) }; } catch (error) { return { file, error: error instanceof Error ? error.message : String(error) }; }
});
const STAMP: Record<Outcome, string> = { waiting: 'Waiting for play', met: 'Met', missed: 'Missed', unclear: 'Too close to call' };
const ADDED = ['rgba(217,185,94,.55)', '#d9b95e'] as const, REMOVED = ['rgba(200,50,42,.5)', '#e65a50'] as const, KEPT = '#8a8f98';

/** What a layout implies before play, summarised for the before/after table. */
interface StaticSummary { walk: number; north: number; cutOff: number; sight: number; cover: number }
function summarise(grid: StreetGrid): StaticSummary {
  const third = CITY_BOUNDS.min + (CITY_BOUNDS.max - CITY_BOUNDS.min) / 3;
  let walk = 0, north = 0;
  for (let i = 0; i < grid.walk.length; i++) if (grid.walk[i] === 1) { walk++; if (Math.floor(i / grid.n) + grid.bounds.min < third) north++; }
  const median = (values: Float32Array) => { const v = [...values].filter(Number.isFinite).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 0; };
  const cut = islands(grid);
  return { walk, north, cutOff: cut.total ? cut.cutOff / cut.total : 0, sight: median(sightlines(grid).longest.values), cover: median(coverDensity(grid).values) };
}

interface Diff<T> { added: T[]; removed: T[]; kept: T[] }
function diff<T>(before: readonly T[], after: readonly T[], key: (t: T) => string): Diff<T> {
  const old = new Set(before.map(key)), now = new Set(after.map(key));
  return { added: after.filter(f => !old.has(key(f))), removed: before.filter(f => !now.has(key(f))), kept: after.filter(f => old.has(key(f))) };
}
/** A supply that keeps its ID but moves counts as removed and added. */
const supplyKey = (s: SnapshotSupply) => `${s.id}@${s.x},${s.y},${s.z}`;

export function design(ctx: Context): Mode {
  const p = ctx.params;
  const valid = PROPOSALS.flatMap(f => (f.proposal ? [f.proposal] : []));
  const state = {
    id: valid.find(q => q.id === p.get('proposal'))?.id ?? valid[0]?.id ?? '',
    show: p.get('show') === 'before' ? 'before' : p.get('show') === 'after' ? 'after' : 'diff',
  };
  const counts = new Map<number, Counts>(), summaries = new Map<number, StaticSummary>();
  // The layout after: its snapshot when the proposal is older than today's layout, else today's city.
  let snapshot: LayoutSnapshot | undefined, later: LayoutSnapshot | undefined, snapshotFor = '', error = '';
  let changes: Diff<Footprint> | undefined, supplies: Diff<SnapshotSupply> | undefined;

  const selected = () => valid.find(q => q.id === state.id);
  const save = () => {
    if (state.id === valid[0]?.id) p.delete('proposal'); else p.set('proposal', state.id);
    if (state.show === 'diff') p.delete('show'); else p.set('show', state.show);
    ctx.save();
  };

  const list = el('div'), body = el('div');
  const views = choices([['diff', 'What changed'], ['before', 'Before'], ['after', 'After']], () => state.show, v => { state.show = v; save(); ctx.redraw(); });
  const panel = el('div', {},
    el('p', { className: 'note', text: 'A proposal states goals and predicted measure changes. Once the new layout ships and both layouts have enough human play, each prediction gets its verdict.' }),
    section('Proposals', list),
    section('The map shows', views),
    body,
  );

  /** A reading, as the page prints it: the value and its 95% interval. */
  const show = (r: Reading | undefined) => {
    if (!r) return 'no data';
    const f = (v: number) => (r.unit === 'share' ? pct(v) : `${v.toFixed(1)}/h`);
    return `${f(r.value)} (${f(r.lo)}–${f(r.hi)})${r.enough ? '' : ' · too little play'}`;
  };
  const verdicts = (q: Proposal) => q.predictions.map(pr => ({ pr, ...judge(pr, counts.get(q.fromLayout) ?? {}, counts.get(q.toLayout) ?? {}, PLACES) }));
  const overall = (q: Proposal): Outcome => {
    const outcomes = verdicts(q).map(v => v.outcome);
    return outcomes.every(o => o === 'waiting') ? 'waiting' : outcomes.includes('missed') ? 'missed' : outcomes.every(o => o === 'met') ? 'met' : 'unclear';
  };
  const exposure = (layout: number) => Object.values(counts.get(layout) ?? {}).reduce((t, row) => t + (row['human-s'] ?? 0), 0);

  function render(): void {
    views.render();
    list.replaceChildren(...PROPOSALS.map(f => {
      if (!f.proposal) return el('div', { className: 'card' }, el('b', { text: f.file }), el('small', { text: f.error ?? '' }));
      const q = f.proposal, o = overall(q);
      const card = el('div', { className: `card${q.id === state.id ? ' on' : ''}` },
        el('h3', { text: q.title }), el('small', { text: `${q.id} · layout ${q.fromLayout} → ${q.toLayout} · ${q.status}` }),
        el('span', { className: `stamp ${o}`, text: STAMP[o] }));
      card.addEventListener('click', () => { state.id = q.id; save(); render(); void mode.refresh(); });
      return card;
    }));
    const q = selected();
    if (!q) { body.replaceChildren(el('p', { className: 'note', text: 'No proposals in design/city/proposals/ yet.' })); return; }
    const before = summaries.get(q.fromLayout), after = summaries.get(q.toLayout);
    const staticRow = (label: string, f: (s: StaticSummary) => string) => el('tr', { html: `<td>${esc(label)}</td><td>${before ? esc(f(before)) : '…'}</td><td>${after ? esc(f(after)) : '…'}</td>` });
    body.replaceChildren(
      section('Predictions and verdicts',
        ...verdicts(q).map(({ pr, before: b, after: a, outcome }) => el('div', { className: 'prediction', title: `${pr.id}: expect ${pr.expect}` },
          el('span', { className: `stamp ${outcome}`, text: STAMP[outcome] }), el('p', { text: pr.says }),
          definitions([[`Layout ${q.fromLayout}`, show(b)], [`Layout ${q.toLayout}`, show(a)]]))),
        el('p', { className: 'note', text: `Human play so far: layout ${q.fromLayout} ${duration(exposure(q.fromLayout))}, layout ${q.toLayout} ${duration(exposure(q.toLayout))}. A verdict needs ${duration(VERDICT_HUMAN_SECONDS)} a side and 95% intervals that do not overlap.` }),
      ),
      section('From the layout alone, before and after',
        el('table', {}, el('tr', { html: `<th>Street level</th><th>Layout ${q.fromLayout}</th><th>Layout ${q.toLayout}</th>` }),
          staticRow('Walkable ground', s => `${s.walk.toLocaleString()} u²`),
          staticRow('…in the north third', s => `${s.north.toLocaleString()} u² (${pct(s.north / s.walk)})`),
          staticRow('Cut-off ground', s => pct(s.cutOff)),
          staticRow('Median longest sightline', s => `${Math.round(s.sight)} u`),
          staticRow('Median cover density', s => pct(s.cover))),
        changes ? el('p', { className: 'note', text: `Footprints: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.kept.length} kept.` }) : null,
        supplies ? el('p', { className: 'note', text: `Supply sites: ${supplies.added.length} added, ${supplies.removed.length} removed or moved, ${supplies.kept.length} kept.` }) : null,
        error ? el('p', { className: 'note', text: error }) : null),
      section('The case', el('p', { text: q.summary }), el('ul', { className: 'goals' }, ...q.goals.map(g => el('li', { text: g })))),
    );
  }

  const mode: Mode = {
    id: 'design', label: 'Design', panel,
    async refresh() {
      const q = selected();
      render();
      if (!q) return;
      try {
        const [b, a] = await Promise.all([q.fromLayout, q.toLayout].map(v => ctx.api.json<PlaceCounts>(`/api/city/v1/places?days=all&layout=${v}`)));
        counts.set(q.fromLayout, b!.places); counts.set(q.toLayout, a!.places);
        ctx.status(`Verdicts updated ${new Date().toLocaleTimeString()}; refreshes every minute.`);
      } catch (e) {
        ctx.status(`Could not load the place counts (${e instanceof Error ? e.message : 'error'}).`);
      }
      render(); ctx.redraw();
      const pair = `${q.baseline}→${q.toLayout}`;
      if (q.baseline && snapshotFor !== pair) {
        const loading = layoutSnapshot(q.baseline);
        snapshotFor = pair;
        if (!loading) { error = `The baseline ${q.baseline} is not in design/city/layouts/.`; render(); return; }
        [snapshot, later] = await Promise.all([loading, q.toLayout === LAYOUT ? undefined : layoutSnapshot(`design/city/layouts/layout-${q.toLayout}.json`)]);
        changes = diff(snapshot.footprints, later?.footprints ?? FOOTPRINTS, footprintKey);
        const after = later ? later.supplies : SUPPLIES;
        supplies = snapshot.supplies && after ? diff(snapshot.supplies, after, supplyKey) : undefined;
        render(); ctx.redraw();
      }
      if (snapshot && !(summaries.has(q.fromLayout) && summaries.has(q.toLayout))) {
        ctx.status('Working out the static analyses of both layouts…');
        await new Promise(r => setTimeout(r, 30));
        summaries.set(snapshot.layoutVersion, summarise(snapshot.grid));
        summaries.set(q.toLayout, summarise(later?.grid ?? cityGrid()));
        ctx.status(`Static analyses of layouts ${snapshot.layoutVersion} and ${q.toLayout} done; verdicts refresh every minute.`);
        render();
      }
    },
    draw() {
      const view = ctx.view, q = selected();
      const dots = (list: readonly SnapshotSupply[] | undefined, fill: string, stroke = '#000') => { for (const s of list ?? []) view.dot(s.x, s.z, 5, fill, stroke, 2); };
      if (state.show === 'before' && snapshot) {
        drawCity(view, snapshot.footprints, { today: false });
        dots(snapshot.supplies, KEPT);
      } else if (state.show === 'diff' && changes) {
        drawCity(view, changes.kept, { dim: .55 });
        for (const f of changes.removed) view.quad(f, REMOVED[0], REMOVED[1], 1);
        for (const f of changes.added) view.quad(f, ADDED[0], ADDED[1], .8);
        dots(supplies?.kept, KEPT); dots(supplies?.removed, 'transparent', REMOVED[1]); dots(supplies?.added, ADDED[1]);
      } else if (later) {
        drawCity(view, later.footprints, { today: false });
        dots(later.supplies, KEPT);
      } else { drawCity(view, FOOTPRINTS); dots(SUPPLIES, KEPT); }
      drawLabels(view, false);
      if (!q) return '<b>No proposal</b>';
      const which = state.show === 'before' ? `Layout ${q.fromLayout}, before` : state.show === 'after' ? `Layout ${q.toLayout}, after` : `Layout ${q.fromLayout} → ${q.toLayout}`;
      return `<b>${esc(q.title)}: ${esc(which)}</b>` + (state.show === 'diff'
        ? `<p><span style="color:${ADDED[1]}">■</span> added (${changes?.added.length ?? '…'}) &nbsp; <span style="color:${REMOVED[1]}">■</span> removed (${changes?.removed.length ?? '…'}) &nbsp; dim: unchanged.${supplies ? ` Supply sites as dots: <span style="color:${ADDED[1]}">●</span> added, <span style="color:${REMOVED[1]}">○</span> removed or moved, <span style="color:${KEPT}">●</span> kept.` : ''} Streets, piers and harbour as built.</p>`
        : state.show === 'before' ? `<p>${snapshot ? 'Standing footprints as shipped; streets are not in the snapshot.' : 'Loading the snapshot…'}</p>` : `<p>${later ? `Layout ${later.layoutVersion} as shipped, from its snapshot.` : 'The city as built today.'}</p>`);
    },
    hover(px, py, x, z) {
      const hit = (fs: readonly Footprint[] | undefined) => fs?.find(f => {
        const c = Math.cos(f.ry), s = Math.sin(f.ry), dx = x - f.x, dz = z - f.z;
        return Math.abs(dx * c - dz * s) <= f.w / 2 && Math.abs(dx * s + dz * c) <= f.d / 2;
      });
      const place = ctx.places.hit(ctx.view, px, py, 'street');
      const added = state.show === 'diff' ? hit(changes?.added) : undefined, removed = state.show === 'diff' ? hit(changes?.removed) : undefined;
      const lines = [`x ${x.toFixed(0)}, z ${z.toFixed(0)}`];
      if (added) lines.push(`Added: ${added.w} × ${added.d}, ${added.top} tall`);
      if (removed) lines.push(`Removed: ${removed.w} × ${removed.d}, ${removed.top} tall`);
      return `${place ? `<b>${esc(place.name)}</b>\n` : ''}${esc(lines.join('\n'))}`;
    },
  };
  render();
  return mode;
}
