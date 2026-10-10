/** Cosmetic velocity followers. Exact exponential updates give the same settling
 * at different frame rates. Differences between fast and slow followers produce
 * one start/stop accent, without a spring oscillation or queued performance. */
export class RatLocomotionFollowThrough {
    private moveFast = 0;
    private moveSlow = 0;
    private yawFast = 0;
    private yawSlow = 0;
    tailMovement = 0;
    tailTurn = 0;

    get startStop(): number { return this.moveFast - this.moveSlow; }
    get turn(): number { return this.yawFast - this.yawSlow; }
    get hatTurn(): number { return this.yawSlow; }

    update(dt: number, speed: number, turnRate: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) return;
        const move = Number.isFinite(speed) ? Math.max(0, Math.min(speed / 7, 1)) : 0;
        const yaw = Number.isFinite(turnRate) ? Math.max(-1, Math.min(turnRate / 6, 1)) : 0;
        const fast = 1 - Math.exp(-24 * dt), slow = 1 - Math.exp(-10 * dt);
        this.moveFast += (move - this.moveFast) * fast;
        this.moveSlow += (move - this.moveSlow) * slow;
        this.yawFast += (yaw - this.yawFast) * fast;
        this.yawSlow += (yaw - this.yawSlow) * slow;
        // The tail keeps its existing wave, but follows speed directly. It stops
        // after the hat/ears, without retaining two layers of movement filtering.
        this.tailMovement += (move - this.tailMovement) * (1 - Math.exp(-5 * dt));
        this.tailTurn += (yaw * .3 - this.tailTurn) * (1 - Math.exp(-4 * dt));
    }

    reset(): void {
        this.moveFast = this.moveSlow = this.yawFast = this.yawSlow = 0;
        this.tailMovement = this.tailTurn = 0;
    }
}
