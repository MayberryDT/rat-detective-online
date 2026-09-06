/** All simulation phases run at the same60Hz reference rate, independently of rendering. */
export class SimulationClock {
    private accumulator = 0;
    readonly stepSeconds = 1 / 60;
    advance(delta: number, tick: (dt: number) => void): void {
        if (!Number.isFinite(delta) || delta <= 0) return;
        this.accumulator += Math.min(delta, 0.05);
        for (let count = 0; count < 3 && this.accumulator + 1e-10 >= this.stepSeconds; count++) {
            this.accumulator = Math.max(0, this.accumulator - this.stepSeconds);
            tick(this.stepSeconds);
        }
    }
    reset(): void { this.accumulator = 0; }
}
