import { CITY_STREETS } from '../shared/cityPlan';
import { LANDMARK_INTERIORS } from '../shared/landmarkLayout';
import { CELL_MIN, CELL_SPAN, CITY_CELL } from '../shared/city/frame';
import { BOUNDS, DECKS, LABELS, WATER, type Footprint } from './city';

/** Night ink: harbour teal to bright teal, then cheese, then the red of the stamp; the low end stays readable over the blue city. */
const RAMP = [[40, 118, 150], [64, 196, 206], [217, 185, 94], [255, 140, 60], [255, 72, 60]];
export const RAMP_CSS = 'linear-gradient(90deg,#287696,#40c4ce,#d9b95e,#ff8c3c,#ff483c)';
export function rampColor(t: number, alpha = true): string {
  const v = Math.max(0, Math.min(.999, t)), f = v * (RAMP.length - 1), i = Math.floor(f), k = f - i, a = RAMP[i]!, b = RAMP[i + 1]!;
  return `rgba(${a.map((c, j) => Math.round(c + (b[j]! - c) * k)).join(',')},${alpha ? (.5 + .45 * v).toFixed(2) : '0.92'})`;
}
/** Bots over-represented (blue) to humans over-represented (red), for a value in -1..1. */
export const DIVERGE_CSS = 'linear-gradient(90deg,#3a7bff,#1b2440,#ff594b)';
export function divergeColor(t: number): string {
  const v = Math.max(-1, Math.min(1, t)), a = Math.abs(v);
  return v < 0 ? `rgba(58,123,255,${(.25 + .7 * a).toFixed(2)})` : `rgba(255,89,75,${(.25 + .7 * a).toFixed(2)})`;
}

export class MapView {
  readonly g: CanvasRenderingContext2D;
  s = 1; ox = 0; oy = 0; W = 0; H = 0; dpr = 1;
  readonly lo = BOUNDS.min - 8; readonly hi = BOUNDS.max + 8;
  private readonly layer = document.createElement('canvas');
  constructor(readonly canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('No 2D canvas');
    this.g = g;
  }
  X(x: number): number { return this.ox + (x - this.lo) * this.s; }
  Z(z: number): number { return this.oy + (z - this.lo) * this.s; }
  world(clientX: number, clientY: number): { x: number; z: number } {
    const box = this.canvas.getBoundingClientRect();
    return { x: (clientX - box.left - this.ox) / this.s + this.lo, z: (clientY - box.top - this.oy) / this.s + this.lo };
  }
  begin(): void {
    const dpr = this.dpr = devicePixelRatio || 1, W = this.W = this.canvas.clientWidth, H = this.H = this.canvas.clientHeight;
    this.canvas.width = W * dpr; this.canvas.height = H * dpr; this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.s = Math.min(W, H) / (this.hi - this.lo) * .98; this.ox = (W - (this.hi - this.lo) * this.s) / 2; this.oy = (H - (this.hi - this.lo) * this.s) / 2;
    this.g.fillStyle = '#05070d'; this.g.fillRect(0, 0, W, H);
  }
  rect(x0: number, x1: number, z0: number, z1: number, fill?: string, stroke?: string, width = 1, dash: number[] = []): void {
    const r: [number, number, number, number] = [this.X(Math.min(x0, x1)), this.Z(Math.min(z0, z1)), Math.abs(x1 - x0) * this.s, Math.abs(z1 - z0) * this.s];
    if (fill) { this.g.fillStyle = fill; this.g.fillRect(...r); }
    if (stroke) { this.g.setLineDash(dash); this.g.lineWidth = width; this.g.strokeStyle = stroke; this.g.strokeRect(...r); this.g.setLineDash([]); }
  }
  /** A (possibly yawed) footprint; yaw turns +x toward -z, as in the layout. */
  quad(f: { x: number; z: number; w: number; d: number; ry?: number }, fill?: string, stroke?: string, width = 1, dash: number[] = []): void {
    const g = this.g, c = Math.cos(f.ry ?? 0), sn = Math.sin(f.ry ?? 0), hw = f.w / 2, hd = f.d / 2;
    g.beginPath();
    for (const [u, v] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const) g.lineTo(this.X(f.x + u * c + v * sn), this.Z(f.z - u * sn + v * c));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.setLineDash(dash); g.lineWidth = width; g.strokeStyle = stroke; g.stroke(); g.setLineDash([]); }
  }
  dot(x: number, z: number, r: number, fill: string, stroke = '#000', width = 1.5): void {
    const g = this.g;
    g.beginPath(); g.arc(this.X(x), this.Z(z), r, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
    if (stroke) { g.lineWidth = width; g.strokeStyle = stroke; g.stroke(); }
  }
  label(x: number, z: number, text: string, size = 14, color = '#dfe7fb'): void {
    const g = this.g;
    g.font = `${size}px Bangers, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 4; g.strokeStyle = '#05070de6'; g.strokeText(text.toUpperCase(), this.X(x), this.Z(z));
    g.fillStyle = color; g.fillText(text.toUpperCase(), this.X(x), this.Z(z));
  }
  /** Values on the 4-unit map cells, drawn on their own layer (optionally softened) so the city stays crisp. */
  cells(value: (ix: number, iz: number) => string | undefined, soften = false): void {
    const { layer, dpr } = this;
    layer.width = this.canvas.width; layer.height = this.canvas.height;
    const lg = layer.getContext('2d')!;
    lg.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let iz = 0; iz < CELL_SPAN; iz++) for (let ix = 0; ix < CELL_SPAN; ix++) {
      const color = value(ix + CELL_MIN, iz + CELL_MIN);
      if (!color) continue;
      lg.fillStyle = color;
      lg.fillRect(this.X((ix + CELL_MIN) * CITY_CELL), this.Z((iz + CELL_MIN) * CITY_CELL), CITY_CELL * this.s + .6, CITY_CELL * this.s + .6);
    }
    const g = this.g;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    if (soften) g.filter = `blur(${Math.max(1, CITY_CELL * this.s * dpr * .35)}px)`;
    g.drawImage(layer, 0, 0); g.restore();
  }
  arrow(x0: number, z0: number, x1: number, z1: number, width: number, color: string): void {
    const g = this.g, ax = this.X(x0), az = this.Z(z0), bx = this.X(x1), bz = this.Z(z1), len = Math.hypot(bx - ax, bz - az);
    if (len < 4) return;
    // Bowed to the left of travel, so the two directions between a pair of places stay apart.
    const mx = (ax + bx) / 2 - (bz - az) / len * len * .18, mz = (az + bz) / 2 + (bx - ax) / len * len * .18;
    g.beginPath(); g.moveTo(ax, az); g.quadraticCurveTo(mx, mz, bx, bz);
    g.lineWidth = width; g.strokeStyle = color; g.lineCap = 'round'; g.stroke();
    const t = Math.atan2(bz - mz, bx - mx), h = 5 + width * 1.4;
    g.beginPath(); g.moveTo(bx, bz); g.lineTo(bx - h * Math.cos(t - .45), bz - h * Math.sin(t - .45)); g.lineTo(bx - h * Math.cos(t + .45), bz - h * Math.sin(t + .45)); g.closePath();
    g.fillStyle = color; g.fill();
  }
}

/** The city at night: ground, harbour, streets, piers and every standing footprint, shaded by height. `today: false` leaves out today's harbour, streets and piers (to draw an older layout). */
export function drawCity(view: MapView, footprints: readonly Footprint[], opts: { dim?: number; today?: boolean } = {}): void {
  const g = view.g, dim = opts.dim ?? 1;
  view.rect(BOUNDS.min, BOUNDS.max, BOUNDS.min, BOUNDS.max, '#0a1020');
  // A case-file grid every 50 units, with coordinates on the edges.
  g.font = '10px "Special Elite", monospace'; g.fillStyle = '#a5b9e166'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = Math.ceil(BOUNDS.min / 50) * 50; v <= BOUNDS.max; v += 50) {
    g.strokeStyle = '#a5b9e10f'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(view.X(v), view.Z(BOUNDS.min)); g.lineTo(view.X(v), view.Z(BOUNDS.max)); g.moveTo(view.X(BOUNDS.min), view.Z(v)); g.lineTo(view.X(BOUNDS.max), view.Z(v)); g.stroke();
    g.fillText(String(v), view.X(v), view.Z(BOUNDS.max) + 9); g.save(); g.translate(view.X(BOUNDS.min) - 10, view.Z(v)); g.rotate(-Math.PI / 2); g.fillText(String(v), 0, 0); g.restore();
  }
  if (opts.today !== false) for (const w of WATER) {
    view.rect(w.xmin, w.xmax, w.zmin, w.zmax, '#040b16');
    g.save(); g.beginPath(); g.rect(view.X(w.xmin), view.Z(w.zmin), (w.xmax - w.xmin) * view.s, (w.zmax - w.zmin) * view.s); g.clip();
    g.strokeStyle = '#2f8f9d22'; g.lineWidth = 1;
    for (let z = w.zmin + 2; z < w.zmax; z += 3.2) { g.beginPath(); for (let x = w.xmin; x <= w.xmax; x += 4) g.lineTo(view.X(x), view.Z(z + Math.sin(x * .19 + z) * .5)); g.stroke(); }
    g.restore();
  }
  if (opts.today !== false) {
    for (const r of CITY_STREETS) view.rect(r.x - r.w / 2, r.x + r.w / 2, r.z - r.d / 2, r.z + r.d / 2, '#141c32');
    for (const d of DECKS) view.quad(d, '#3d3128', '#6b5540', 1);
  }
  for (const f of footprints) {
    const t = Math.min(1, f.top / 40), v = (a: number, b: number) => Math.round((a + (b - a) * t) * dim);
    view.quad(f, `rgb(${v(22, 52)},${v(30, 68)},${v(54, 108)})`, f.w * f.d > 30 ? '#a5b9e11a' : undefined);
  }
}

/** Landmark outlines and every place label, plus the compass. */
export function drawLabels(view: MapView, outlines = true): void {
  if (outlines) for (const l of LANDMARK_INTERIORS) view.rect(l.cx - l.w / 2, l.cx + l.w / 2, l.cz - l.d / 2, l.cz + l.d / 2, undefined, '#d9b95e70', 1.5, [6, 4]);
  for (const l of LABELS) view.label(l.x, l.z, l.text, l.size);
  view.label(BOUNDS.max - 6, BOUNDS.min + 10, 'N ↑', 16, '#d9b95e');
}
