import type { AssignmentId } from './assignments';
import type { IncidentId } from './incidentCatalog';
import type { DispatchPhase } from './chaosState';

/** Tyler's admin controls (docs/live-service.md, "Admin controls"). The same commands arrive over HTTP
 * (`/api/admin/v1/<command>`, bearer `ADMIN_TOKEN`) and from an authenticated game socket (`admin` message);
 * every one but `status` is recorded as an `admin` city fact. Parsed in messageValidation.ts. */
export const ADMIN_COMMANDS = ['status', 'end-round', 'next-mode', 'incident', 'end-incident', 'reset-case'] as const;
export type AdminCommandName = typeof ADMIN_COMMANDS[number];
export type AdminCommand =
  | { command: 'status' | 'end-round' | 'end-incident' | 'reset-case' }
  | { command: 'next-mode'; mode: AssignmentId }
  /** Roll an incident now: `incident` when given, otherwise the ordinary no-repeat draw. */
  | { command: 'incident'; incident?: IncidentId };
/** Where a command came from: the HTTP endpoint (the CLI) or an admin's game socket. */
export type AdminVia = 'http' | 'game';

export interface AdminStatus {
  room: string;
  phase: 'playing' | 'won';
  mode?: AssignmentId;
  /** The mode the next round deals; absent when the next one is still a shuffle. */
  nextMode?: AssignmentId;
  /** The rat that would win if the round ended now. */
  leader?: string;
  incident: { phase: DispatchPhase; id?: IncidentId; leftMs?: number };
  /** The incidents this room can roll. */
  incidents: IncidentId[];
  humans: number;
  bots: number;
}
export interface AdminResult { ok: boolean; message: string; status?: AdminStatus }

/** Admin keys are long random strings; anything longer is refused unread. */
export const ADMIN_TOKEN_MAX = 256;
