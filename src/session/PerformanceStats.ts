import type * as THREE from 'three';

/** Opt-in developer measurements; absent from normal gameplay. */
export class PerformanceStats {
    private readonly panel: HTMLPreElement;
    private readonly frames: number[] = [];
    private lastPublish = 0;
    constructor(private readonly renderer: THREE.WebGLRenderer) {
        this.panel = document.createElement('pre');
        this.panel.id = 'performance-stats';
        this.panel.setAttribute('aria-label', 'Performance measurements');
        Object.assign(this.panel.style, { position: 'fixed', right: '12px', top: '12px', zIndex: '100',
            background: '#000d', color: '#fff', padding: '12px', fontSize: '11px', pointerEvents: 'none' });
        document.body.appendChild(this.panel);
    }
    record(frameMs: number, now: number, world: { seed: number; version: number }): void {
        if (frameMs > 0 && frameMs < 1_000) this.frames.push(frameMs);
        if (this.frames.length > 600) this.frames.shift();
        if (now - this.lastPublish < 1_000) return;
        this.lastPublish = now;
        const sorted = [...this.frames].sort((a, b) => a - b);
        const { render, memory } = this.renderer.info;
        this.panel.textContent = JSON.stringify({ world, samples: sorted.length,
            frameMedianMs: sorted[Math.floor(sorted.length * .5)] ?? 0,
            frameP95Ms: sorted[Math.floor(sorted.length * .95)] ?? 0,
            calls: render.calls, triangles: render.triangles,
            geometries: memory.geometries, textures: memory.textures }, null, 2);
    }
    dispose(): void { this.panel.remove(); this.frames.length = 0; }
}
