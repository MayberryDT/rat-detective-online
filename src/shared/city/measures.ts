import type { Place } from './places';

/** Layer 3 of the city map (docs/city-map.md): rates per exposure, with uncertainty.
 * Humans are the primary signal; bots are measured separately. */
export const MIN_HUMAN_SECONDS = 600;
export const MIN_EVENTS = 20;
export interface Rate { k: number; rate: number; lo: number; hi: number }
export interface PlaceMeasures {
  place: Place;
  humanS: number; botS: number;
  /** Share of human time over share of walkable area; undefined for air and pipes. */
  use?: number;
  /** At least MIN_HUMAN_SECONDS of human play here. */
  enough: boolean;
  dangerHuman?: Rate; danger?: Rate;
  fireHuman?: Rate; fireBot?: Rate;
  accuracyHuman?: Rate; accuracyBot?: Rate;
  /** Share of hits that came off a wall first, by shooter place. */
  bankHuman?: Rate; bankBot?: Rate;
  lethality?: number;
  spawnTrap?: Rate;
  stillHuman?: number;
  raw: Record<string, number>;
}

const Z = 1.96;
/** 95% interval for a Poisson count (Wilson–Hilferty; exact enough for these sizes). */
export function poissonInterval(k: number): [number, number] {
  const lo = k === 0 ? 0 : k * (1 - 1 / (9 * k) - Z / (3 * Math.sqrt(k))) ** 3;
  const k1 = k + 1, hi = k1 * (1 - 1 / (9 * k1) + Z / (3 * Math.sqrt(k1))) ** 3;
  return [Math.max(0, lo), hi];
}
/** 95% Wilson interval for a proportion. */
export function wilson(k: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n, d = 1 + Z * Z / n, c = p + Z * Z / (2 * n), m = Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const rate = (k: number, exposure: number): Rate | undefined => {
  if (exposure <= 0) return undefined;
  const [lo, hi] = poissonInterval(k);
  return { k, rate: k / exposure, lo: lo / exposure, hi: hi / exposure };
};
const proportion = (k: number, n: number): Rate | undefined => {
  if (n <= 0) return undefined;
  const [lo, hi] = wilson(k, n);
  return { k, rate: k / n, lo, hi };
};

/** Jensen–Shannon distance (base 2) between two count distributions: 0 same, 1 disjoint. */
export function divergence(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const ta = Object.values(a).reduce((t, v) => t + v, 0), tb = Object.values(b).reduce((t, v) => t + v, 0);
  if (!ta || !tb) return 1;
  let js = 0;
  for (const k of keys) {
    const p = (a[k] ?? 0) / ta, q = (b[k] ?? 0) / tb, m = (p + q) / 2;
    if (p) js += .5 * p * Math.log2(p / m);
    if (q) js += .5 * q * Math.log2(q / m);
  }
  return Math.sqrt(Math.max(0, js));
}

const walkable = (p: Place) => p.kind !== 'air' && p.kind !== 'outside' && p.kind !== 'water' && !p.id.startsWith('sewer:pipe-');

/** Per-place measures from summed place counts (the `/api/city/v1/places` rows). Rates are per minute. */
export function measurePlaces(places: readonly Place[], counts: Record<string, Record<string, number>>): Map<string, PlaceMeasures> {
  const area = places.filter(walkable).reduce((t, p) => t + p.area, 0);
  const humanTotal = places.filter(walkable).reduce((t, p) => t + (counts[p.id]?.['human-s'] ?? 0), 0);
  const out = new Map<string, PlaceMeasures>();
  for (const place of places) {
    const raw = counts[place.id] ?? {}, n = (k: string) => raw[k] ?? 0;
    const humanS = n('human-s'), botS = n('bot-s'), minutes = (humanS + botS) / 60;
    const kills = n('kills'), deaths = n('deaths');
    out.set(place.id, {
      place, humanS, botS, raw,
      ...(walkable(place) && area > 0 && humanTotal > 0 ? { use: (humanS / humanTotal) / (place.area / area) } : {}),
      enough: humanS >= MIN_HUMAN_SECONDS,
      ...(humanS > 0 ? { dangerHuman: rate(n('deaths-human'), humanS / 60), fireHuman: rate(n('shots-human'), humanS / 60) } : {}),
      ...(minutes > 0 ? { danger: rate(deaths, minutes) } : {}),
      ...(botS > 0 ? { fireBot: rate(n('shots-bot'), botS / 60) } : {}),
      ...(n('shots-human') > 0 ? { accuracyHuman: proportion(n('hits-human'), n('shots-human')) } : {}),
      ...(n('shots-bot') > 0 ? { accuracyBot: proportion(n('hits-bot'), n('shots-bot')) } : {}),
      ...(n('hits-human') > 0 ? { bankHuman: proportion(n('bank-hits-human'), n('hits-human')) } : {}),
      ...(n('hits-bot') > 0 ? { bankBot: proportion(n('bank-hits-bot'), n('hits-bot')) } : {}),
      ...(kills + deaths > 0 ? { lethality: (kills + 1) / (deaths + 1) } : {}),
      ...(n('spawns') > 0 ? { spawnTrap: proportion(n('spawn-deaths-5s'), n('spawns')) } : {}),
      ...(humanS > 0 ? { stillHuman: n('still-human-s') / humanS } : {}),
    });
  }
  return out;
}
