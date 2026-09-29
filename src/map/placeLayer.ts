import type { Place, PlaceKind } from '../shared/city/places';
import { CELL_MIN, CELL_SPAN, CITY_CELL } from '../shared/city/frame';
import { PLACES, placeRaster } from './city';
import type { MapView } from './canvas';

export type PlaceFloor = 'all' | 'street' | 'upper' | 'sewer';
const UPPER_KINDS: Partial<Record<PlaceKind, true>> = { 'landmark-floor': true, roof: true, landmark: true, lookout: true, boat: true, yard: true, room: true, chute: true };
/** A chip's letter: R roof, L lookout, C chute, else the floor number or the name's initial. */
const tag = (p: Place) => {
  const level = /:(\d+)$/.exec(p.id);
  return p.id.startsWith('roof:') ? 'R' : p.kind === 'lookout' ? 'L' : p.kind === 'chute' ? 'C' : level ? level[1]! : p.name[0]!;
};

/** Places drawn in plan: street, rooftop and sewer places on their cells; upper floors (which stack in plan) as a row of chips at the building. */
export class PlaceLayer {
  private readonly street = placeRaster(.3);
  private readonly roof = placeRaster(24);
  private readonly sewer = placeRaster(-6.7);
  private readonly stacks: Array<{ x: number; z: number; places: Place[] }> = [];
  private chips: Array<{ x: number; y: number; size: number; place: Place }> = [];
  constructor() {
    const groups = new Map<string, Place[]>();
    for (const p of PLACES.list) {
      if (p.floor !== 'upper' || !UPPER_KINDS[p.kind] || /^roof:[a-z-]+:\d+$/.test(p.id)) continue;
      const key = `${Math.round(p.x / 6)},${Math.round(p.z / 6)}`;
      const group = groups.get(key);
      if (group) group.push(p); else groups.set(key, [p]);
    }
    for (const places of groups.values()) this.stacks.push({ x: places[0]!.x, z: places[0]!.z, places });
  }
  draw(view: MapView, floor: PlaceFloor, color: (p: Place) => string | undefined): void {
    const raster = floor === 'upper' ? this.roof : floor === 'sewer' ? this.sewer : this.street;
    view.cells((ix, iz) => {
      const p = raster[(iz - CELL_MIN) * CELL_SPAN + ix - CELL_MIN];
      return p && (floor !== 'upper' || /^roof:[a-z-]+:\d+$/.test(p.id)) ? color(p) : undefined;
    });
    this.chips = [];
    if (floor !== 'all' && floor !== 'upper') return;
    const g = view.g, size = 13;
    for (const s of this.stacks) {
      const x0 = view.X(s.x) - s.places.length * size / 2, y = view.Z(s.z) + 12;
      s.places.forEach((p, i) => {
        const x = x0 + i * size;
        g.fillStyle = '#05070d'; g.fillRect(x - 1, y - 1, size + 1, size + 1);
        g.fillStyle = color(p) ?? '#1b2440'; g.fillRect(x, y, size - 1, size - 1);
        g.font = '9px "Special Elite", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#05070d';
        g.fillText(tag(p), x + size / 2 - .5, y + size / 2);
        this.chips.push({ x, y, size, place: p });
      });
    }
  }
  /** The place under the pointer: an upper-floor chip first, then the drawn floor's cell. */
  hit(view: MapView, px: number, py: number, floor: PlaceFloor): Place | undefined {
    const chip = this.chips.find(c => px >= c.x && px < c.x + c.size && py >= c.y && py < c.y + c.size);
    if (chip) return chip.place;
    const x = (px - view.ox) / view.s + view.lo, z = (py - view.oy) / view.s + view.lo;
    const raster = floor === 'upper' ? this.roof : floor === 'sewer' ? this.sewer : this.street;
    const ix = Math.floor(x / CITY_CELL) - CELL_MIN, iz = Math.floor(z / CITY_CELL) - CELL_MIN;
    return ix < 0 || iz < 0 || ix >= CELL_SPAN || iz >= CELL_SPAN ? undefined : raster[iz * CELL_SPAN + ix];
  }
}
