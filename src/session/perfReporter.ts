import type * as THREE from 'three';
import { perfMarksBetween } from './perfMarks';
import { PERF_STALLS, type ConnectionReport, type PerfBrowser, type PerfOs, type PerfReport, type PerfStall } from '../shared/perfReport';

/** Play time per report; a leaving player sends what it has from this much. */
const REPORT_MS = 30_000, LEAVE_MIN_MS = 5_000;
/** 30 s at 240 Hz; a faster screen reports early. */
const CAPACITY = 8192;
/** A gap this long is a paused tab or a debugger, not a frame (it is still kept as a stall when the tab was visible). */
const PAUSE_MS = 10_000;
/** A frame this long is a stall: recorded with what ran in it (smooth-play plan, F1). */
const STALL_MS = 1_000;
/** Long animation frames are kept this long, to match against a stall. */
const LOAF_KEEP_MS = 30_000;
type LongFrame = { start: number; end: number; script: number; render: number; top?: string; topMs: number };

type Machine = Pick<PerfReport, 'gpu' | 'gpuVendor' | 'os' | 'browser' | 'browserMajor' | 'cores' | 'memGb'>;
type UserAgentData = { platform?: string; brands?: Array<{ brand: string; version: string }> };

/** Measures play frames and sends a `perf` report every 30 s of play and on leave (docs/city-map.md).
 * Recording a frame writes three floats into fixed buffers; the sort and the report happen once a window. */
export class PerfReporter {
  private readonly frames = new Float32Array(CAPACITY);
  private readonly cpu = new Float32Array(CAPACITY);
  private readonly schedule = new Float32Array(CAPACITY);
  private count = 0;
  private ms = 0;
  private skip = false;
  private machine?: Machine;
  private stalls: PerfStall[] = [];
  /** When each recorded stall ended (performance time), for attribution that arrives after it. */
  private readonly stallEnds = new WeakMap<PerfStall, number>();
  private longFrames: LongFrame[] = [];
  private longFrameCount = 0;
  private messages = 0;
  private firstMessageAt?: number;
  private lastHeap?: number;
  private lastPrograms = 0;
  private sampled = 0;
  /** The connection's state, read at a stall. */
  connection?: () => string;
  /** The current graphics quality tier and render scale, once the game adapts them. */
  quality?: () => Pick<PerfReport, 'quality' | 'scale'>;
  /** Ping and how far in the past other rats are drawn, read once a report. */
  network?: () => ConnectionReport & Pick<PerfReport, 'rtt' | 'rttJitter' | 'rttMin' | 'rttMax' | 'viewHuman' | 'viewBot'>;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly send: (report: PerfReport) => void, signal: AbortSignal) {
    // rAF stops in a hidden tab; the first frame back spans the whole absence.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.skip = true; }, { signal });
    // What the browser ran in each long frame (Chromium's long-animation-frame timing; elsewhere stalls carry no attribution).
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
        const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) this.longFrame(entry); });
        observer.observe({ type: 'long-animation-frame', buffered: false });
        signal.addEventListener('abort', () => observer.disconnect(), { once: true });
      }
    } catch { /* Attribution is optional. */ }
  }
  /** A server message was handled (`NetworkManager.observeMessage`): a page that keeps handling them is alive. */
  message(): void { this.messages++; this.firstMessageAt ??= performance.now(); }
  /** The page is leaving: what it has, from 5 s of play. */
  leave(): void { if (this.ms >= LEAVE_MIN_MS) this.flush(); }

  /** One play frame: `frameMs` since the previous rAF, `cpuMs` of work inside this one, `scheduleMs` of delay before entry. */
  frame(frameMs: number, cpuMs: number, scheduleMs = 0): void {
    const now = performance.now(), visible = !this.skip;
    if (visible && frameMs >= STALL_MS && this.stalls.length < PERF_STALLS) this.stall(frameMs, now);
    this.firstMessageAt = undefined; this.messages = 0;
    if (++this.sampled >= 60) { this.sampled = 0; this.lastHeap = heapMb(); this.lastPrograms = this.renderer.info?.programs?.length ?? 0; }
    if (this.skip || !(frameMs > 0) || frameMs >= PAUSE_MS) { this.skip = false; return; }
    this.frames[this.count] = frameMs; this.cpu[this.count] = cpuMs; this.schedule[this.count] = scheduleMs; this.count++; this.ms += frameMs;
    if (this.ms >= REPORT_MS || this.count === CAPACITY) this.flush();
  }

  private flush(): void {
    const n = this.count, frames = this.frames.subarray(0, n).sort(), cpu = this.cpu.subarray(0, n).sort(), schedule = this.schedule.subarray(0, n).sort();
    const at = (a: Float32Array, q: number) => r1(a[Math.min(n - 1, Math.floor(n * q))]!);
    let over33 = 0, over100 = 0;
    for (let i = 0; i < n; i++) { if (frames[i]! > 33.4) over33++; if (frames[i]! > 100) over100++; }
    const gl = this.renderer.getContext(), memory = 'memory' in performance ? performance.memory : undefined;
    const heap = memory && typeof memory === 'object' && 'usedJSHeapSize' in memory && typeof memory.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : undefined;
    this.machine ??= machine(gl);
    const p50 = at(frames, .5);
    const info = this.renderer.info, stalls = this.stalls.length ? this.stalls : undefined;
    this.send({ ...(stalls ? { stalls } : {}), longFrames: this.longFrameCount, ...(info ? { programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries } : {}),
      ms: Math.round(this.ms), frames: n, fps: r1(n * 1000 / this.ms), fps50: p50 > 0 ? r1(1000 / p50) : 0, p50, p95: at(frames, .95), p99: at(frames, .99),
      worst: r1(frames[n - 1]!), over33, over100, cpu50: at(cpu, .5), cpu95: at(cpu, .95), schedule50: at(schedule, .5), schedule95: at(schedule, .95), ...(heap ? { heapMb: r1(heap / 1048576) } : {}),
      w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, dpr: window.devicePixelRatio || 1, pr: this.renderer.getPixelRatio(), ...this.machine, ...this.quality?.(), ...this.network?.() });
    this.count = 0; this.ms = 0; this.stalls = []; this.longFrameCount = 0;
  }

  private stall(frameMs: number, now: number): void {
    const start = now - frameMs, heap = heapMb(), all = this.renderer.info?.programs ?? [], programs = all.length;
    // Which shaders linked: the programs past the last sample, by shader name, with counts.
    const linked = new Map<string, number>();
    for (const p of all.slice(this.lastPrograms)) { const name = String((p as { name?: string }).name ?? '?'); linked.set(name, (linked.get(name) ?? 0) + 1); }
    const shaders = [...linked].map(([name, n]) => n > 1 ? `${name}x${n}` : name).join(',').slice(0, 160), events = perfMarksBetween(start - 1500, now);
    let script = 0, render = 0, top: string | undefined, topMs = 0;
    for (const f of this.longFrames) {
      if (f.end < start || f.start > now) continue;
      script += f.script; render += f.render;
      if (f.top && f.topMs > topMs) { top = f.top; topMs = f.topMs; }
    }
    this.stalls.push({ ms: r1(frameMs), at: Math.round(this.ms), msgs: this.messages, firstMsg: this.firstMessageAt !== undefined ? Math.round(this.firstMessageAt - start) : -1,
      hidden: document.hidden ? 1 : 0, focus: document.hasFocus() ? 1 : 0, ...(this.connection ? { net: this.connection() } : {}),
      ...(script || render ? { script: Math.round(script), render: Math.round(render) } : {}), ...(top ? { top } : {}),
      programs: Math.max(0, programs - this.lastPrograms), ...(shaders ? { shaders } : {}), ...(events ? { events } : {}), ...(this.lastHeap !== undefined ? { heapBefore: this.lastHeap } : {}), ...(heap !== undefined ? { heapAfter: heap } : {}) });
    this.stallEnds.set(this.stalls[this.stalls.length - 1]!, now);
  }

  private longFrame(entry: PerformanceEntry): void {
    const e = entry as PerformanceEntry & { renderStart?: number; scripts?: Array<{ duration: number; sourceURL?: string; sourceFunctionName?: string; invoker?: string }> };
    if (e.duration > 200) this.longFrameCount++;
    let script = 0, top: string | undefined, topMs = 0;
    for (const s of e.scripts ?? []) {
      script += s.duration;
      if (s.duration > topMs) { topMs = s.duration; top = `${(s.sourceURL ?? '').split('/').pop()?.split('?')[0] ?? ''}:${s.sourceFunctionName || s.invoker || ''}`.replace(/[^\x20-\x7e]/g, '?').slice(0, 80); }
    }
    const end = e.startTime + e.duration, render = e.renderStart ? Math.max(0, end - e.renderStart) : 0;
    this.longFrames.push({ start: e.startTime, end, script, render, ...(top ? { top } : {}), topMs });
    // The entry often arrives after the stall it covers was recorded (the observer runs after the frame): attribute it then.
    for (const stall of this.stalls) {
      const stallEnd = this.stallEnds.get(stall);
      if (stall.script !== undefined || stallEnd === undefined || e.startTime > stallEnd || end < stallEnd - stall.ms) continue;
      stall.script = Math.round(script); stall.render = Math.round(render); if (top) stall.top = top;
    }
    const cutoff = end - LOAF_KEEP_MS;
    while (this.longFrames.length && this.longFrames[0]!.end < cutoff) this.longFrames.shift();
    if (this.longFrames.length > 200) this.longFrames.shift();
  }
}

function heapMb(): number | undefined {
  const memory = 'memory' in performance ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory : undefined;
  return typeof memory?.usedJSHeapSize === 'number' ? r1(memory.usedJSHeapSize / 1048576) : undefined;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function machine(gl: WebGLRenderingContext | WebGL2RenderingContext): Machine {
  // The server keeps printable ASCII only; a stray ® must not cost the whole renderer string.
  const info = gl.getExtension('WEBGL_debug_renderer_info'), ascii = (v: unknown, max: number) => String(v ?? '').replace(/[^\x20-\x7e]/g, '?').slice(0, max);
  const gpu = ascii(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), 160);
  const gpuVendor = ascii(gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR), 80);
  const nav = navigator as Navigator & { userAgentData?: UserAgentData; deviceMemory?: number };
  const { browser, browserMajor } = browserOf(nav.userAgent, nav.userAgentData);
  return { ...(gpu ? { gpu } : {}), ...(gpuVendor ? { gpuVendor } : {}), os: osOf(nav.userAgent, nav.userAgentData?.platform), browser,
    ...(browserMajor ? { browserMajor } : {}), ...(nav.hardwareConcurrency ? { cores: nav.hardwareConcurrency } : {}),
    ...(nav.deviceMemory ? { memGb: nav.deviceMemory } : {}) };
}

export function osOf(ua: string, platform?: string): PerfOs {
  const p = (platform || ua).toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('android')) return 'android';
  if (/iphone|ipad|ipod|\bios\b/.test(p)) return 'ios';
  if (/cros|chrom(e|ium) os/.test(p)) return 'chromeos';
  // iPadOS asks for the desktop site and says Macintosh; only it has touch there.
  if (p.includes('mac')) return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 ? 'ios' : 'mac';
  if (p.includes('linux') || p.includes('x11')) return 'linux';
  return 'other';
}

export function browserOf(ua: string, data?: UserAgentData): { browser: PerfBrowser; browserMajor?: number } {
  for (const [browser, brand] of [['edge', 'Microsoft Edge'], ['opera', 'Opera'], ['chrome', 'Google Chrome']] as const) {
    const match = data?.brands?.find(b => b.brand === brand);
    if (match) return { browser, browserMajor: Number.parseInt(match.version, 10) || undefined };
  }
  for (const [browser, pattern] of [['edge', /Edg(?:e|A|iOS)?\/(\d+)/], ['opera', /OPR\/(\d+)/], ['samsung', /SamsungBrowser\/(\d+)/],
    ['firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['chrome', /(?:Chrome|CriOS)\/(\d+)/], ['safari', /Version\/(\d+).*Safari/]] as const) {
    const match = pattern.exec(ua);
    if (match) return { browser, browserMajor: Number(match[1]) };
  }
  return { browser: 'other' };
}
