import { ASSIGNMENT_TUNING, type AssignmentState } from '../assignments';
import { JURISDICTION_TUNING } from '../jurisdiction';
import { KILLS_TO_WIN } from '../networkProtocol';
import type { Kda, Standing } from './facts';

/** Damage this recent before a kill earns an assist (docs/city-map.md, "Situation"). */
export const ASSIST_WINDOW_MS = 10_000;
const zero = (): Kda => ({ k: 0, d: 0, a: 0, streak: 0, dmgOut: 0, dmgIn: 0, hs: 0, shots: 0, hits: 0 });

/** Running K/D/A for one round, keyed by player ID. */
export class RoundLedger {
  private readonly rows = new Map<string, Kda>();
  /** Victim -> attacker -> time of that attacker's latest damage. */
  private readonly recent = new Map<string, Map<string, number>>();
  reset(): void { this.rows.clear(); this.recent.clear(); }
  kda(id: string): Kda { return { ...(this.rows.get(id) ?? zero()) }; }
  private row(id: string): Kda { let r = this.rows.get(id); if (!r) { r = zero(); this.rows.set(id, r); } return r; }
  shot(id: string): void { this.row(id).shots++; }
  hit(id: string, head: boolean): void { const r = this.row(id); r.hits++; if (head) r.hs++; }
  damage(attacker: string | null, victim: string, dmg: number, at: number): void {
    this.row(victim).dmgIn += dmg;
    if (!attacker || attacker === victim) return;
    this.row(attacker).dmgOut += dmg;
    let by = this.recent.get(victim);
    if (!by) { by = new Map(); this.recent.set(victim, by); }
    by.set(attacker, at);
  }
  /** Records the death and returns who assisted. */
  death(killer: string | null, victim: string, at: number): string[] {
    const v = this.row(victim); v.d++; v.streak = 0;
    if (killer && killer !== victim) { const k = this.row(killer); k.k++; k.streak++; }
    const assists = [...(this.recent.get(victim) ?? [])]
      .filter(([id, t]) => id !== killer && id !== victim && at - t <= ASSIST_WINDOW_MS).map(([id]) => id);
    for (const id of assists) this.row(id).a++;
    this.recent.delete(victim);
    return assists;
  }
}

/** Each rat's share of the win in the current mode, its rank (ties broken by kills) and its
 * lead over the nearest rival (negative when behind the leader). */
export function standings(ids: readonly string[], context: { assignment?: AssignmentState; kills?: Record<string, number> }): Map<string, Standing> {
  const a = context.assignment, kills = context.kills ?? {};
  const raw = (id: string): number => {
    if (!a) return kills[id] ?? 0;
    switch (a.id) {
      case 'chain-of-custody': return a.deliveries[id] ?? 0;
      case 'jurisdiction': return a.jurisdiction?.heldMs[id] ?? 0;
      case 'excessive-force': return a.caseKills[id] ?? 0;
    }
  };
  const target = !a ? KILLS_TO_WIN : a.id === 'chain-of-custody' ? ASSIGNMENT_TUNING.deliveryTarget
    : a.id === 'jurisdiction' ? JURISDICTION_TUNING.targetMs : ASSIGNMENT_TUNING.caseKillTarget;
  const progress = (id: string) => target > 0 ? Math.min(1, raw(id) / target) : 0;
  const order = [...ids].sort((x, y) => raw(y) - raw(x) || (kills[y] ?? 0) - (kills[x] ?? 0));
  const out = new Map<string, Standing>();
  order.forEach((id, i) => {
    const rival = i === 0 ? order[1] : order[0];
    out.set(id, { progress: progress(id), rank: i + 1, lead: rival === undefined ? progress(id) : progress(id) - progress(rival), raw: raw(id) });
  });
  return out;
}
