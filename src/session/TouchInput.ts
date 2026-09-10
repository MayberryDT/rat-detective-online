import {TOUCH_SHOT_INTERVAL_MS} from '../shared/shotTiming';

export type TouchRole = 'move' | 'look' | 'fire' | 'jump';
export interface TouchMovement { x: number; y: number; jump: boolean }
type Finger = { role: TouchRole; x: number; y: number; originX: number; originY: number };

/** Finger ownership and analog input, independent of rendering or browser events. */
export class TouchInput {
    readonly movement: TouchMovement = {x: 0, y: 0, jump: false};
    readonly fingers = new Map<number, Finger>();
    private firing = false;
    private nextShot = -Infinity;
    constructor(private readonly look: (dx: number, dy: number) => void) {}
    start(id: number, role: TouchRole, x: number, y: number): boolean {
        if (!Number.isFinite(id + x + y) || this.fingers.has(id)) return false;
        const aiming = (r: TouchRole) => r === 'look' || r === 'fire';
        if ([...this.fingers.values()].some(f => f.role === role || (aiming(role) && aiming(f.role)))) return false;
        this.fingers.set(id, {role, x, y, originX: x, originY: y});
        if (role === 'jump') this.movement.jump = true;
        if (role === 'fire') this.firing = true;
        return true;
    }
    move(id: number, x: number, y: number): void {
        const finger = this.fingers.get(id);
        if (!finger || !Number.isFinite(x + y)) return;
        if (finger.role === 'move') {
            const dx = x - finger.originX, dy = y - finger.originY, distance = Math.hypot(dx, dy);
            const strength = Math.min(1, Math.max(0, (distance - 8) / 40));
            this.movement.x = distance ? dx / distance * strength : 0;
            this.movement.y = distance ? -dy / distance * strength : 0;
        } else if (finger.role === 'look' || finger.role === 'fire') {
            this.look(x - finger.x, y - finger.y);
        }
        finger.x = x; finger.y = y;
    }
    end(id: number): void {
        const finger = this.fingers.get(id); if (!finger) return;
        this.fingers.delete(id);
        if (finger.role === 'move') { this.movement.x = 0; this.movement.y = 0; }
        if (finger.role === 'jump') this.movement.jump = false;
        if (finger.role === 'fire') this.firing = false;
    }
    tick(now: number, shoot: () => void): void {
        if (this.firing && Number.isFinite(now) && now >= this.nextShot) {
            this.nextShot = now + TOUCH_SHOT_INTERVAL_MS; shoot();
        }
    }
    clear(): void {
        this.fingers.clear(); this.firing = false;
        this.movement.x = 0; this.movement.y = 0; this.movement.jump = false;
    }
}
