// Heat map page (/heatmap): the live city's recorded heat over the current layout.
// The layout comes from the same shared modules the game builds from, so it always matches.
import './heatmap.css';
import { grayboxBoxes, GRAYBOX_VERSION, CITY_BOUNDS, CITY_PREVIEW_SEED } from '../shared/grayboxLayout';
import { CITY_STREETS } from '../shared/cityPlan';
import { LANDMARK_INTERIORS } from '../shared/landmarkLayout';
import { SEWER_HALLS, SEWER_ENTRIES, SEWER_MANHOLE } from '../shared/sewerLayout';
import { CASE_SPAWNS, DISPATCH_STATIONS, LAUNCH_MACHINES } from '../shared/chaosState';
import { PICKUP_ANCHORS, type PickupKind } from '../shared/pickups';
import { JURISDICTION_ZONES } from '../shared/jurisdictionZones';
import { ASSIGNMENT_DESTINATIONS } from '../shared/assignments';

type Layer = 'humans' | 'bots' | 'deaths' | 'kills';
type Floor = 'all' | 'street' | 'upper' | 'sewer' | 'air';
interface Heat { from: string; to: string; days: string[]; allDays: string[]; cell: number; layers: Record<Layer, Record<string, number>> }

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T; // Ids are fixed in heatmap.html.
};
const canvas = $<HTMLCanvasElement>('map'), tip = $('tip'), status = $('status');
const g = canvas.getContext('2d')!;

// ---- Static city (footprints only; building heights shade the blocks) ----
const buildings = grayboxBoxes({ seed: CITY_PREVIEW_SEED, version: GRAYBOX_VERSION })
  .filter(b => !b.hidden && b.y + b.h / 2 > 0.5 && b.y - b.h / 2 > -2 && b.w * b.d > 1.5)
  .map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, top: b.y + b.h / 2 }))
  .sort((a, b) => a.top - b.top);
const landmarks = [...LANDMARK_INTERIORS.map(l => ({ name: l.name, x: l.cx, z: l.cz, w: l.w, d: l.d })), { name: 'Gate', x: -137, z: 0, w: 18, d: 64 }];
const lo = CITY_BOUNDS.min - 6, hi = CITY_BOUNDS.max + 6;

// ---- Controls ----
const state = { layer: 'humans' as Layer, floor: 'all' as Floor, when: 'all', smooth: true, heat: null as Heat | null };
const overlays: Record<string, [string, string, boolean]> = {
  landmarks: ['Landmarks', '#f3d9a0', true], sewer: ['Sewer tunnels', '#2f8f9d', false], entries: ['Sewer entrances', '#2fd3e6', true],
  pickups: ['Pickups', '#3ddc6a', true], cases: ['Case spawns', '#c8963e', false], launchers: ['Launchers', '#e2352b', true],
  pillars: ['Dispatch pillars', '#ff7a1f', false], zones: ['Jurisdiction zones', '#8a5cf6', false], dest: ['Paper Chase stops', '#ffd23f', false],
};
const shown = new Map(Object.entries(overlays).map(([k, [, , on]]) => [k, on]));

function choices(id: string, options: [string, string][], current: () => string, pick: (v: string) => void): void {
  const box = $(id);
  const render = () => { for (const b of box.querySelectorAll('button')) b.classList.toggle('on', b.dataset.value === current()); };
  for (const [value, label] of options) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.value = value; b.textContent = label;
    b.addEventListener('click', () => { pick(value); render(); });
    box.appendChild(b);
  }
  render();
}
choices('layer', [['humans', 'Human players'], ['bots', 'Bots'], ['deaths', 'Deaths'], ['kills', 'Killer spots']], () => state.layer, v => { state.layer = v as Layer; draw(); });
choices('floor', [['all', 'All floors'], ['street', 'Street'], ['upper', 'Upstairs & roofs'], ['sewer', 'Sewer'], ['air', 'In the air']], () => state.floor, v => { state.floor = v as Floor; draw(); });
choices('when', [['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All time']], () => state.when, v => { state.when = v; void load(); });
const fromInput = $<HTMLInputElement>('from'), toInput = $<HTMLInputElement>('to');
for (const input of [fromInput, toInput]) input.addEventListener('change', () => {
  if (!fromInput.value || !toInput.value) return;
  state.when = 'custom'; for (const b of $('when').querySelectorAll('button')) b.classList.remove('on');
  void load();
});
const overlayBox = $('overlays');
for (const [key, [name, color]] of Object.entries(overlays)) {
  const l = document.createElement('label'); l.className = 'toggle';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = shown.get(key)!;
  input.addEventListener('change', () => { shown.set(key, input.checked); draw(); });
  const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = color;
  l.appendChild(input); l.appendChild(swatch); l.appendChild(document.createTextNode(name)); overlayBox.appendChild(l);
}
const smoothInput = $<HTMLInputElement>('smooth');
smoothInput.addEventListener('change', () => { state.smooth = smoothInput.checked; draw(); });

// ---- Data ----
async function load(): Promise<void> {
  const query = state.when === 'custom' ? `from=${fromInput.value}&to=${toInput.value}` : `days=${state.when}`;
  status.textContent = 'Loading…';
  try {
    const response = await fetch(`/api/heat/v1?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status}`);
    state.heat = await response.json() as Heat;
    const first = state.heat.allDays[0], last = state.heat.allDays[state.heat.allDays.length - 1];
    for (const input of [fromInput, toInput]) { if (first) input.min = first; if (last) input.max = last; }
    if (state.when !== 'custom') { fromInput.value = state.heat.days[0] ?? ''; toInput.value = state.heat.days[state.heat.days.length - 1] ?? ''; }
    status.textContent = `Updated ${new Date().toLocaleTimeString()}. Refreshes every minute. Recording since ${first ?? 'today'}.`;
  } catch (error) {
    status.textContent = `Could not load the heat map (${error instanceof Error ? error.message : 'error'}).`;
  }
  totals(); draw();
}
setInterval(() => { if (!document.hidden) void load(); }, 60_000);

/** Counts for the chosen layer and floor, summed per ground cell. */
function cells(layer: Layer): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, n] of Object.entries(state.heat?.layers[layer] ?? {})) {
    const split = key.indexOf(':');
    if (state.floor !== 'all' && key.slice(0, split) !== state.floor) continue;
    const ground = key.slice(split + 1);
    out.set(ground, (out.get(ground) ?? 0) + n);
  }
  return out;
}
const sum = (layer: Layer) => { let t = 0; for (const n of cells(layer).values()) t += n; return t; };
const duration = (s: number) => s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`;
function totals(): void {
  const rows: [string, string][] = [
    ['Human time', duration(sum('humans'))], ['Bot time', duration(sum('bots'))],
    ['Deaths', String(sum('deaths'))], ['Kills', String(sum('kills'))],
    ['Days', state.heat ? `${state.heat.days.length} of ${state.heat.allDays.length}` : '–'],
  ];
  $('totals').replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
}

// ---- Drawing ----
let s = 1, ox = 0, oy = 0;
const X = (x: number) => ox + (x - lo) * s, Z = (z: number) => oy + (z - lo) * s;
function rect(x0: number, x1: number, z0: number, z1: number, fill?: string, stroke?: string, width = 1, dash: number[] = []): void {
  const r: [number, number, number, number] = [X(Math.min(x0, x1)), Z(Math.min(z0, z1)), Math.abs(x1 - x0) * s, Math.abs(z1 - z0) * s];
  if (fill) { g.fillStyle = fill; g.fillRect(...r); }
  if (stroke) { g.setLineDash(dash); g.lineWidth = width; g.strokeStyle = stroke; g.strokeRect(...r); g.setLineDash([]); }
}
function dot(x: number, z: number, r: number, fill: string, stroke = '#000', width = 2): void {
  g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = width; g.strokeStyle = stroke; g.stroke(); }
}
function label(x: number, z: number, text: string, size = 14): void {
  g.font = `700 ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#000';
  g.strokeText(text, X(x), Z(z)); g.fillStyle = '#fff3d6'; g.fillText(text, X(x), Z(z));
}
// Cool to hot; low counts stay faint so hot spots read at a glance.
const RAMP = [[29, 43, 107], [47, 143, 216], [242, 209, 75], [240, 123, 42], [255, 45, 45]];
function heatColor(t: number): string {
  const f = Math.min(.999, t) * (RAMP.length - 1), i = Math.floor(f), k = f - i, a = RAMP[i]!, b = RAMP[i + 1]!;
  return `rgba(${a.map((v, j) => Math.round(v + (b[j]! - v) * k)).join(',')},${(.35 + .6 * t).toFixed(2)})`;
}
const heatLayer = document.createElement('canvas');
let hot = new Map<string, number>(), hottest = 0;
function draw(): void {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  s = Math.min(W, H) / (hi - lo) * .97; ox = (W - (hi - lo) * s) / 2; oy = (H - (hi - lo) * s) / 2;
  g.fillStyle = '#0b0c10'; g.fillRect(0, 0, W, H); rect(lo, hi, lo, hi, '#17191f');
  for (const r of CITY_STREETS) rect(r.x - r.w / 2, r.x + r.w / 2, r.z - r.d / 2, r.z + r.d / 2, '#2c2f37');
  for (const b of buildings) { const v = Math.round(52 + Math.min(1, b.top / 40) * 60); rect(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, `rgb(${v},${v - 4},${v - 10})`); }
  if (shown.get('sewer')) for (const h of SEWER_HALLS) rect(h.xmin, h.xmax, h.zmin, h.zmax, 'rgba(47,143,157,.2)', '#2f8f9d', 1, [6, 5]);
  // Heat, drawn on its own layer so it can be softened without blurring the city.
  hot = cells(state.layer); hottest = Math.max(0, ...hot.values());
  const cell = state.heat?.cell ?? 4;
  heatLayer.width = canvas.width; heatLayer.height = canvas.height;
  const hg = heatLayer.getContext('2d')!; hg.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const [key, n] of hot) {
    const [ix, iz] = key.split(':').map(Number) as [number, number];
    hg.fillStyle = heatColor(Math.log1p(n) / Math.log1p(hottest));
    hg.fillRect(X(ix * cell), Z(iz * cell), cell * s + .5, cell * s + .5);
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (state.smooth) g.filter = `blur(${Math.max(1, cell * s * dpr * .35)}px)`;
  g.drawImage(heatLayer, 0, 0); g.restore();
  // Overlays.
  if (shown.get('zones')) for (const z of Object.values(JURISDICTION_ZONES)) for (const a of z.areas) rect(a.xmin, a.xmax, a.zmin, a.zmax, 'rgba(138,92,246,.18)', '#b79bff', 2);
  if (shown.get('dest')) for (const d of Object.values(ASSIGNMENT_DESTINATIONS)) rect(d.bounds.xmin, d.bounds.xmax, d.bounds.zmin, d.bounds.zmax, undefined, '#ffd23f', 2, [8, 4]);
  if (shown.get('landmarks')) for (const l of landmarks) rect(l.x - l.w / 2, l.x + l.w / 2, l.z - l.d / 2, l.z + l.d / 2, undefined, '#f3d9a0', 2);
  if (shown.get('entries')) for (const e of [...SEWER_ENTRIES, SEWER_MANHOLE]) dot(e.x, e.z, 8, 'transparent', '#2fd3e6', 3);
  if (shown.get('cases')) for (const c of CASE_SPAWNS) { g.fillStyle = '#c8963e'; g.fillRect(X(c.x) - 6, Z(c.z) - 4, 12, 8); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.strokeRect(X(c.x) - 6, Z(c.z) - 4, 12, 8); }
  if (shown.get('launchers')) for (const m of LAUNCH_MACHINES) dot(m.pad.x, m.pad.z, 8, '#e2352b');
  if (shown.get('pillars')) for (const p of DISPATCH_STATIONS) { g.beginPath(); g.moveTo(X(p.x), Z(p.z) - 10); g.lineTo(X(p.x) + 8, Z(p.z) + 6); g.lineTo(X(p.x) - 8, Z(p.z) + 6); g.closePath(); g.fillStyle = p.y < 0 ? '#ff9a3c' : '#ff5a1f'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); }
  const pickupColor: Record<PickupKind, string> = { ironclad: '#d9dde3', hustle: '#ff3b3b', 'quick-fix': '#3ddc6a' };
  if (shown.get('pickups')) for (const p of PICKUP_ANCHORS) dot(p.x, p.z, 6, pickupColor[p.kind]);
  if (shown.get('landmarks')) for (const l of landmarks) label(l.x, l.z, l.name.toUpperCase());
  label(hi - 14, lo + 12, 'N ↑', 13);
  $('scale').innerHTML = hottest ? `<span>less</span><i></i><span>${state.layer === 'humans' || state.layer === 'bots' ? duration(hottest) : hottest} in the hottest spot</span>` : '<span>No heat recorded for this choice yet.</span>';
}
canvas.addEventListener('mousemove', e => {
  const box = canvas.getBoundingClientRect(), x = (e.clientX - box.left - ox) / s + lo, z = (e.clientY - box.top - oy) / s + lo;
  const cell = state.heat?.cell ?? 4, n = hot.get(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`) ?? 0;
  const place = landmarks.find(l => Math.abs(x - l.x) <= l.w / 2 && Math.abs(z - l.z) <= l.d / 2)?.name;
  const value = state.layer === 'humans' || state.layer === 'bots' ? duration(n) : `${n} ${state.layer === 'deaths' ? 'deaths' : 'kills'}`;
  tip.textContent = `${place ? place + ' · ' : ''}x ${x.toFixed(0)}, z ${z.toFixed(0)}\n${value}`;
  tip.hidden = false; tip.style.left = `${e.clientX - box.left + 14}px`; tip.style.top = `${e.clientY - box.top + 14}px`;
});
canvas.addEventListener('mouseleave', () => { tip.hidden = true; });
addEventListener('resize', draw);
void load();
