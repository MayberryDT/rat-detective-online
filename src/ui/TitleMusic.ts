import { previewMuted } from '../audio/previewMuted';

/** Streaming background music needs no 3D engine or decoded whole-song buffer. */
export class TitleMusic {
    private readonly audio = new Audio('/music/main-theme.mp3');
    private disposed = false;
    constructor() { this.audio.loop = true; this.audio.volume = .4; this.audio.muted = previewMuted(); this.audio.preload = 'none'; }
    start(): void { void this.unlock(); }
    async unlock(): Promise<void> {
        if (this.disposed || !this.audio.paused) return;
        try { await this.audio.play(); } catch { /* First permitted gesture retries autoplay. */ }
    }
    dispose(): void {
        this.disposed = true; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    }
}
