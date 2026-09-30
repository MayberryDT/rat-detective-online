import type * as THREE from 'three';
import type { PerfBrowser, PerfOs, PerfReport } from '../shared/perfReport';

/** Play time per report; a leaving player sends what it has from this much. */
const REPORT_MS = 30_000, LEAVE_MIN_MS = 5_000;
/** 30 s at 240 Hz; a faster screen reports early. */
const CAPACITY = 8192;
/** A gap this long is a paused tab or a debugger, not a frame. */
const PAUSE_MS = 10_000;

type Machine = Pick<PerfReport, 'gpu' | 'gpuVendor' | 'os' | 'browser' | 'browserMajor' | 'cores' | 'memGb'>;
type UserAgentData = { platform?: string; brands?: Array<{ brand: string; version: string }> };

/** Measures play frames and sends a `perf` report every 30 s of play and on leave (docs/city-map.md).
 * Recording a frame writes two floats into fixed buffers; the sort and the report happen once a window. */
export class PerfReporter {
  private readonly frames = new Float32Array(CAPACITY);
  private readonly cpu = new Float32Array(CAPACITY);
  private count = 0;
  private ms = 0;
  private skip = false;
  private machine?: Machine;
  /** The current graphics quality tier and render scale, once the game adapts them. */
  quality?: () => Pick<PerfReport, 'quality' | 'scale'>;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly send: (report: PerfReport) => void, signal: AbortSignal) {
    // rAF stops in a hidden tab; the first frame back spans the whole absence.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.skip = true; }, { signal });
  }

  /** One play frame: `frameMs` since the previous rAF, `cpuMs` of work inside this one. */
  frame(frameMs: number, cpuMs: number): void {
    if (this.skip || !(frameMs > 0) || frameMs >= PAUSE_MS) { this.skip = false; return; }
    this.frames[this.count] = frameMs; this.cpu[this.count] = cpuMs; this.count++; this.ms += frameMs;
    if (this.ms >= REPORT_MS || this.count === CAPACITY) this.flush();
  }
  leave(): void { if (this.ms >= LEAVE_MIN_MS) this.flush(); }

  private flush(): void {
    const n = this.count, frames = this.frames.subarray(0, n).sort(), cpu = this.cpu.subarray(0, n).sort();
    const at = (a: Float32Array, q: number) => r1(a[Math.min(n - 1, Math.floor(n * q))]!);
    let over33 = 0, over100 = 0;
    for (let i = 0; i < n; i++) { if (frames[i]! > 33.4) over33++; if (frames[i]! > 100) over100++; }
    const gl = this.renderer.getContext(), memory = 'memory' in performance ? performance.memory : undefined;
    const heap = memory && typeof memory === 'object' && 'usedJSHeapSize' in memory && typeof memory.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : undefined;
    this.machine ??= machine(gl);
    const p50 = at(frames, .5);
    this.send({ ms: Math.round(this.ms), frames: n, fps: r1(n * 1000 / this.ms), fps50: p50 > 0 ? r1(1000 / p50) : 0, p50, p95: at(frames, .95), p99: at(frames, .99),
      worst: r1(frames[n - 1]!), over33, over100, cpu50: at(cpu, .5), cpu95: at(cpu, .95), ...(heap ? { heapMb: r1(heap / 1048576) } : {}),
      w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, dpr: window.devicePixelRatio || 1, pr: this.renderer.getPixelRatio(), ...this.machine, ...this.quality?.() });
    this.count = 0; this.ms = 0;
  }
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
