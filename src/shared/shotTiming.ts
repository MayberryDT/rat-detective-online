import {INCIDENT_TUNING} from './chaosState';
import type {IncidentId} from './incidentCatalog';

/** Shared admission ceiling; neither input device changes the server's rate. */
export const SHOOT_RATE = { limit: 12, windowMs: 1_000 };
// Bound rapid taps without queuing a delayed shot. Holding never repeats fire.
export const TOUCH_SHOT_INTERVAL_MS = Math.ceil(SHOOT_RATE.windowMs / SHOOT_RATE.limit) + 1;
/** The least time between one rat's shots under the active incident (0: only `SHOOT_RATE`).
 * The same for every rat, human or bot. */
export const shotIntervalMs = (incident?: IncidentId): number => incident === 'big-cheese' ? INCIDENT_TUNING.cheeseShotIntervalMs : 0;

/** Each rat's last admitted shot. `allow` admits a shot at least the incident's interval (less
 * `slackMs`) after that rat's previous one and records it; a refused shot records nothing. */
export class ShotSpacing {
    private readonly last = new Map<string, number>();
    allow(id: string, incident: IncidentId | undefined, now: number, slackMs = 0): boolean {
        const last = this.last.get(id);
        if (last !== undefined && now - last < shotIntervalMs(incident) - slackMs) return false;
        this.last.delete(id); this.last.set(id, now);
        // Rats come and go; keep only the recent shooters.
        if (this.last.size > 64) this.last.delete(this.last.keys().next().value!);
        return true;
    }
}
