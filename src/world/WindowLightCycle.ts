/** A room changing occupancy, not a blinking sign. Each seed owns its own clock. */
export class WindowLightCycle {
    brightness = 1;
    private seed: number;
    private start = -1;
    private duration = 2;
    private from = 1;
    private target = 1;
    private next: number;

    constructor(seed: number) {
        this.seed = seed >>> 0;
        // Mix nearby building coordinates before drawing the first appointment.
        for (let i = 0; i < 5; i++) this.random();
        this.brightness = this.random() < .35 ? .025 : 1;
        this.from = this.target = this.brightness;
        this.next = 5 + this.random() * 10;
    }

    update(time: number): number {
        if (!Number.isFinite(time) || time < 0) return this.brightness;
        if (time >= this.next) {
            this.from = this.brightness;
            this.target = this.target > 0.5 ? 0.025 : 1;
            this.start = time;
            this.duration = 1.2 + this.random() * 0.8;
            this.next = time + this.duration + 12 + this.random() * 23;
        }
        if (this.start >= 0) {
            const t = Math.min(1, Math.max(0, (time - this.start) / this.duration));
            const eased = t * t * (3 - 2 * t);
            this.brightness = this.from + (this.target - this.from) * eased;
        }
        return this.brightness;
    }

    private random(): number {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }
}
