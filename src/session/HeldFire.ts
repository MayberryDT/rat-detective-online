/** Hold-to-fire for the Tommy Gun, shared by the mouse/key and touch FIRE. The press fires its own first shot;
 * while held, `tick` repeats `shoot` every `intervalMs`. Any other weapon (`intervalMs` undefined) ends the hold,
 * so every other gun stays one shot per press. */
export class HeldFire {
    private held = false;
    private next = 0;
    get active(): boolean { return this.held; }
    /** The first shot of this press was fired at `now`. */
    press(now: number, intervalMs: number | undefined): void {
        this.held = intervalMs !== undefined; this.next = now + (intervalMs ?? 0);
    }
    release(): void { this.held = false; }
    tick(now: number, intervalMs: number | undefined, shoot: () => void): void {
        if (!this.held) return;
        if (intervalMs === undefined || !Number.isFinite(now)) { this.held = false; return; }
        if (now < this.next) return;
        // Keep the cadence across frames; a stall restarts it rather than firing a backlog.
        this.next = now - this.next < intervalMs ? this.next + intervalMs : now + intervalMs;
        shoot();
    }
}
