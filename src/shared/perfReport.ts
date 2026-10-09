/** How the game runs on a player's machine: a window of about 30 s of play, sent by the client and kept
 * as a `perf` city fact (docs/city-map.md). Frame times in ms, from one rAF timestamp to the next;
 * `cpu*` is the main-thread work inside the frame callback, while `schedule*` records callback scheduling delay. A slow interval alone does not identify
 * GPU, compositor, browser or game work as its cause. No names or IDs: the renderer string names a GPU model, not a person. */
export const PERF_OS = ['windows', 'mac', 'linux', 'android', 'ios', 'chromeos', 'other'] as const;
export const PERF_BROWSERS = ['chrome', 'edge', 'firefox', 'safari', 'opera', 'samsung', 'other'] as const;
export type PerfOs = typeof PERF_OS[number];
export type PerfBrowser = typeof PERF_BROWSERS[number];

/** Fixed categories only; never retain arbitrary socket reasons or credentials. */
export const CONNECTION_FAILURES = ['close','delivery-timeout','delivery-backlog','socket-error','join-timeout','heartbeat-timeout','invalid-update','apply-error','congestion','send-error','connect-error','server-error','session-replaced'] as const;
export type ConnectionFailure = typeof CONNECTION_FAILURES[number];
export interface ConnectionReport {
  netFailure?: ConnectionFailure;
  netCloseCode?: number; netRetries?: number; netRecoverMs?: number;
  /** Age of the last received message and tab visibility at failure, not at report time. */
  netLastMessageMs?: number; netHidden?: number;
  netInvalid?: number; netSendFailures?: number;
}

/** One frame over a second (smooth-play plan, F1): how long, what the browser says ran in it, and whether the page
 * stayed alive. `script`/`render`: main-thread script and rendering time from long-animation-frame timing that
 * overlaps it (none: the main thread was free, so the stall was in the GPU, compositor or system). `top`: the
 * longest script there, as a short `file:function`. `msgs`: server messages handled during it; `firstMsg`: when the
 * first was handled, from the stall's start (-1 none). `programs`: shader programs linked during it; `shaders`: which
 * (their shader names and counts); `events`: what the game marked in and just before it (`perfMarks`). */
export interface PerfStall {
  ms: number; at: number; script?: number; render?: number; top?: string; msgs: number; firstMsg: number;
  hidden: number; focus: number; net?: string; programs?: number; heapBefore?: number; heapAfter?: number;
  shaders?: string; events?: string;
}
export const PERF_STALLS = 4;

export interface PerfReport extends ConnectionReport {
  /** Play time the window covers, and the frames drawn in it. */
  ms: number; frames: number;
  /** Frames a second over the window, and at the median frame (1000 / p50). */
  fps: number; fps50: number;
  p50: number; p95: number; p99: number; worst: number;
  /** Frames longer than 33.4 ms (under 30 fps) and 100 ms (a visible hitch). */
  over33: number; over100: number;
  /** Main-thread work inside the frame callback, median and 95th percentile. */
  cpu50?: number; cpu95?: number;
  /** Delay from the rAF timestamp to entering the callback; separate from its work. */
  schedule50?: number; schedule95?: number;
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
  /** Frames over a second in the window, at most `PERF_STALLS` (the first ones). */
  stalls?: PerfStall[];
  /** Long animation frames (over 200 ms) the browser reported in the window. */
  longFrames?: number;
  /** Shader programs, textures and geometries the renderer holds at report time. */
  programs?: number; textures?: number; geometries?: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Times to 0.1 ms; ratios (`per` 100) keep Windows' 1.25 and 1.75 scaling exact. */
const num = (v: unknown, min: number, max: number, per = 10) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * per) / per : undefined;
const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[\x20-\x7e]+$/.test(v) ? v : undefined;
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find(x => x === v);

function parseStall(value: unknown): PerfStall | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const ms = num(v.ms, 0, 3_600_000), at = num(v.at, 0, 3_600_000, 1), msgs = int(v.msgs, 0, 1_000_000), firstMsg = num(v.firstMsg, -1, 3_600_000, 1);
  const hidden = int(v.hidden, 0, 1), focus = int(v.focus, 0, 1);
  if (ms === undefined || at === undefined || msgs === undefined || firstMsg === undefined || hidden === undefined || focus === undefined) return null;
  const stall: PerfStall = { ms, at, msgs, firstMsg, hidden, focus };
  const optional = { script: num(v.script, 0, 3_600_000, 1), render: num(v.render, 0, 3_600_000, 1), top: text(v.top, 80),
    net: typeof v.net === 'string' && /^[a-z]{1,16}$/.test(v.net) ? v.net : undefined, programs: int(v.programs, 0, 10_000),
    heapBefore: num(v.heapBefore, 0, 65_536), heapAfter: num(v.heapAfter, 0, 65_536), shaders: text(v.shaders, 160), events: text(v.events, 120) };
  for (const [key, field] of Object.entries(optional)) if (field !== undefined) Object.assign(stall, { [key]: field });
  return stall;
}

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
    schedule50: num(v.schedule50, 0, 60_000), schedule95: num(v.schedule95, 0, 60_000),
    netFailure: oneOf(CONNECTION_FAILURES, v.netFailure), netCloseCode: int(v.netCloseCode, 0, 4999),
    netRetries: int(v.netRetries, 0, 1_000_000), netRecoverMs: num(v.netRecoverMs, 0, 86_400_000, 1),
    netLastMessageMs: num(v.netLastMessageMs, 0, 86_400_000, 1), netHidden: int(v.netHidden, 0, 1),
    netInvalid: int(v.netInvalid, 0, 1_000_000), netSendFailures: int(v.netSendFailures, 0, 1_000_000),
    cpu50: num(v.cpu50, 0, 60_000), cpu95: num(v.cpu95, 0, 60_000), heapMb: num(v.heapMb, 0, 65_536),
    w: int(v.w, 1, 16_384), h: int(v.h, 1, 16_384), dpr: num(v.dpr, .1, 10, 100), pr: num(v.pr, .1, 10, 100),
    gpu: text(v.gpu, 160), gpuVendor: text(v.gpuVendor, 80), os: oneOf(PERF_OS, v.os), browser: oneOf(PERF_BROWSERS, v.browser),
    browserMajor: int(v.browserMajor, 1, 999), cores: int(v.cores, 1, 1024), memGb: num(v.memGb, .1, 1024, 100),
    quality: typeof v.quality === 'string' && /^[a-z0-9-]{1,24}$/.test(v.quality) ? v.quality : undefined, scale: num(v.scale, .05, 4, 100),
    rtt: num(v.rtt, 0, 120_000, 1), rttJitter: num(v.rttJitter, 0, 120_000, 1), rttMin: num(v.rttMin, 0, 120_000, 1), rttMax: num(v.rttMax, 0, 120_000, 1),
    viewHuman: num(v.viewHuman, 0, 10_000, 1), viewBot: num(v.viewBot, 0, 10_000, 1),
    stalls: Array.isArray(v.stalls) ? v.stalls.slice(0, PERF_STALLS).map(parseStall).filter((s): s is PerfStall => !!s) : undefined,
    longFrames: int(v.longFrames, 0, 100_000), programs: int(v.programs, 0, 100_000), textures: int(v.textures, 0, 1_000_000), geometries: int(v.geometries, 0, 1_000_000),
  };
  if (optional.stalls && !optional.stalls.length) optional.stalls = undefined;
  const report: PerfReport = { ms, frames, fps: r1(frames * 1000 / ms), fps50: p50 > 0 ? r1(1000 / p50) : 0, p50, p95, p99, worst, over33, over100 };
  for (const [key, field] of Object.entries(optional)) if (field !== undefined) Object.assign(report, { [key]: field });
  return report;
}
