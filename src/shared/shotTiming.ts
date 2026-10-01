import {INCIDENT_TUNING} from './chaosState';
import type {IncidentId} from './incidentCatalog';
import type {WeaponKind} from './pickups';

/** Shared admission ceiling; neither input device changes the server's rate. */
export const SHOOT_RATE = { limit: 12, windowMs: 1_000 };
// Bound rapid taps without queuing a delayed shot. Holding repeats fire only with the Tommy Gun.
export const TOUCH_SHOT_INTERVAL_MS = Math.ceil(SHOOT_RATE.windowMs / SHOOT_RATE.limit) + 1;
/** The least time between one rat's shots (0: only `SHOOT_RATE`). A held special weapon replaces the incident's
 * rule: the Laser fires once per Big Cheese interval, the Tommy Gun and Mousetrap only under `SHOOT_RATE`.
 * The same for every rat, human or bot. */
export const shotIntervalMs = (incident?: IncidentId, weapon?: WeaponKind): number =>
    weapon ? weapon === 'laser' ? INCIDENT_TUNING.cheeseShotIntervalMs : 0 : incident === 'big-cheese' ? INCIDENT_TUNING.cheeseShotIntervalMs : 0;

/** Each rat's last admitted shot. `allow` admits a shot at least the interval (less `slackMs`) after that rat's
 * previous one and records it; a refused shot records nothing. */
export class ShotSpacing {
    private readonly last = new Map<string, number>();
    allow(id: string, incident: IncidentId | undefined, now: number, slackMs = 0, weapon?: WeaponKind): boolean {
        const last = this.last.get(id);
        if (last !== undefined && now - last < shotIntervalMs(incident, weapon) - slackMs) return false;
        this.last.delete(id); this.last.set(id, now);
        // Rats come and go; keep only the recent shooters.
        if (this.last.size > 64) this.last.delete(this.last.keys().next().value!);
        return true;
    }
}
