/** How the game runs on a player's machine: a window of about 30 s of play, sent by the client and kept
 * as a `perf` city fact (docs/city-map.md). Frame times in ms, from one rAF timestamp to the next;
 * `cpu*` is the main-thread work inside the frame callback, so a slow frame with little CPU work is GPU- or
 * compositor-bound. No names or IDs: the renderer string names a GPU model, not a person. */
export const PERF_OS = ['windows', 'mac', 'linux', 'android', 'ios', 'chromeos', 'other'] as const;
export const PERF_BROWSERS = ['chrome', 'edge', 'firefox', 'safari', 'opera', 'samsung', 'other'] as const;
export type PerfOs = typeof PERF_OS[number];
export type PerfBrowser = typeof PERF_BROWSERS[number];

export interface PerfReport {
  /** Play time the window covers, and the frames drawn in it. */
  ms: number; frames: number;
  /** Frames a second over the window, and at the median frame (1000 / p50). */
  fps: number; fps50: number;
  p50: number; p95: number; p99: number; worst: number;
  /** Frames longer than 33.4 ms (under 30 fps) and 100 ms (a visible hitch). */
  over33: number; over100: number;
  /** Main-thread work inside the frame callback, median and 95th percentile. */
  cpu50?: number; cpu95?: number;
  /** Used JS heap, where the browser tells (Chromium). */
  heapMb?: number;
  /** Drawing buffer size; the device pixel ratio and the ratio the game renders at. */
  w?: number; h?: number; dpr?: number; pr?: number;
  /** WebGL unmasked renderer and vendor (`WEBGL_debug_renderer_info`): shows ANGLE's backend and the GPU. */
  gpu?: string; gpuVendor?: string;
  os?: PerfOs; browser?: PerfBrowser; browserMajor?: number;
  cores?: number; memGb?: number;
  /** Graphics quality tier and render scale, when the game adapts them. */
  quality?: string; scale?: number;
  /** Round trip to the room (ms, from the 20 s ping): smoothed, its jitter, and the lowest and highest since joining. */
  rtt?: number; rttJitter?: number; rttMin?: number; rttMax?: number;
  /** How far in the past other rats are drawn (ms, the median playback delay), humans and bots apart. */
  viewHuman?: number; viewBot?: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Times to 0.1 ms; ratios (`per` 100) keep Windows' 1.25 and 1.75 scaling exact. */
const num = (v: unknown, min: number, max: number, per = 10) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * per) / per : undefined;
const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[\x20-\x7e]+$/.test(v) ? v : undefined;
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find(x => x === v);

/** The frame counts are the report; without them it is dropped. Every other field is dropped alone when bad. */
export function parsePerfReport(value: unknown): PerfReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const ms = int(v.ms, 1, 600_000), frames = int(v.frames, 1, 200_000);
  const p50 = num(v.p50, 0, 60_000), p95 = num(v.p95, 0, 60_000), p99 = num(v.p99, 0, 60_000), worst = num(v.worst, 0, 600_000);
  if (ms === undefined || frames === undefined || p50 === undefined || p95 === undefined || p99 === undefined || worst === undefined) return null;
  const over33 = int(v.over33, 0, frames), over100 = int(v.over100, 0, frames);
  if (over33 === undefined || over100 === undefined) return null;
  const optional: Omit<PerfReport, 'ms' | 'frames' | 'fps' | 'fps50' | 'p50' | 'p95' | 'p99' | 'worst' | 'over33' | 'over100'> = {
    cpu50: num(v.cpu50, 0, 60_000), cpu95: num(v.cpu95, 0, 60_000), heapMb: num(v.heapMb, 0, 65_536),
    w: int(v.w, 1, 16_384), h: int(v.h, 1, 16_384), dpr: num(v.dpr, .1, 10, 100), pr: num(v.pr, .1, 10, 100),
    gpu: text(v.gpu, 160), gpuVendor: text(v.gpuVendor, 80), os: oneOf(PERF_OS, v.os), browser: oneOf(PERF_BROWSERS, v.browser),
    browserMajor: int(v.browserMajor, 1, 999), cores: int(v.cores, 1, 1024), memGb: num(v.memGb, .1, 1024, 100),
    quality: typeof v.quality === 'string' && /^[a-z0-9-]{1,24}$/.test(v.quality) ? v.quality : undefined, scale: num(v.scale, .05, 4, 100),
    rtt: num(v.rtt, 0, 120_000, 1), rttJitter: num(v.rttJitter, 0, 120_000, 1), rttMin: num(v.rttMin, 0, 120_000, 1), rttMax: num(v.rttMax, 0, 120_000, 1),
    viewHuman: num(v.viewHuman, 0, 10_000, 1), viewBot: num(v.viewBot, 0, 10_000, 1),
  };
  const report: PerfReport = { ms, frames, fps: r1(frames * 1000 / ms), fps50: p50 > 0 ? r1(1000 / p50) : 0, p50, p95, p99, worst, over33, over100 };
  for (const [key, field] of Object.entries(optional)) if (field !== undefined) Object.assign(report, { [key]: field });
  return report;
}
