// The city map page (/map, alias /heatmap): Observe, Analyse and Design over one canvas.
// The city is drawn from the same shared layout modules the game builds from, so it always matches.
import './map.css';
import { MapView } from './canvas';
import { Api } from './data';
import { LAYOUT, PLACES } from './city';
import { PlaceLayer } from './placeLayer';
import { observe } from './observe';
import { analyse } from './analyse';
import { design } from './design';
import { el } from './dom';
import type { Context, Mode } from './mode';

const $ = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found;
};
const canvas = document.querySelector('canvas#map');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing canvas#map');
const tip = $('tip'), legend = $('legend'), panel = $('panel'), nav = $('modes');
const params = new URLSearchParams(location.search);
const REFRESH_MS = 60_000;

let current: Mode | undefined, queued = false;
const ctx: Context = {
  api: new Api(params.get('api')), view: new MapView(canvas), places: new PlaceLayer(), params,
  save() { const q = params.toString(); history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}`); },
  redraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (!current) return; ctx.view.begin(); legend.innerHTML = current.draw(); });
  },
  status(text) { $('status').textContent = text; },
};
const modes: Mode[] = [observe(ctx), analyse(ctx), design(ctx)];

$('file').textContent = `Case file · layout ${LAYOUT} · ${PLACES.list.length} places`;
const buttons = modes.map(m => {
  const b = el('button', { text: m.label }); b.type = 'button';
  b.addEventListener('click', () => show(m));
  nav.appendChild(b);
  return b;
});
function show(mode: Mode): void {
  current = mode;
  modes.forEach((m, i) => buttons[i]!.classList.toggle('on', m === mode));
  panel.replaceChildren(mode.panel);
  if (mode.id === 'observe') params.delete('mode'); else params.set('mode', mode.id);
  ctx.save(); ctx.redraw();
  void mode.refresh();
}
show(modes.find(m => m.id === params.get('mode')) ?? modes[0]!);
setInterval(() => { if (current && !document.hidden) void current.refresh(); }, REFRESH_MS);

canvas.addEventListener('mousemove', e => {
  const box = canvas.getBoundingClientRect(), px = e.clientX - box.left, py = e.clientY - box.top, at = ctx.view.world(e.clientX, e.clientY);
  const html = current?.hover(px, py, at.x, at.z);
  if (!html) { tip.hidden = true; return; }
  tip.innerHTML = html; tip.hidden = false;
  tip.style.left = `${Math.min(px + 16, box.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(py + 16, box.height - tip.offsetHeight - 8)}px`;
});
canvas.addEventListener('mouseleave', () => { tip.hidden = true; });
addEventListener('resize', () => ctx.redraw());
void document.fonts.ready.then(() => ctx.redraw());
