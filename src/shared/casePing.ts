import type { CaseState } from './chaosState';
import type { Vec3Data } from './networkProtocol';

/** Where a rat may know a case is without seeing it (clarity batch): a loose case where it lies (it glows), a case it
 * carries itself in its paw, and a case someone else carries at its latest ping (null before the first). The same
 * rule for humans and bots; sight of the carrier is the only other source. */
export function caseLastSeen(c: CaseState, viewerId: string | null): Vec3Data | null {
    return !c.owner || c.owner === viewerId ? c.p : c.ping?.p ?? null;
}
