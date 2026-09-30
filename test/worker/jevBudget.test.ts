import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { JEV_LEDGER, JevBudget, utcDay, type JevBudgetStatus, type JevLedger } from '../../src/worker/bots/jevBudget';

const day = Date.UTC(2026, 8, 29, 12), next = day + 86_400_000;
const ledger = () => env.MATCHMAKER.getByName(JEV_LEDGER);
const open = (now: number, total = 0): JevBudgetStatus => ({ day: utcDay(now), total, cap: 25, capped: false });

/** A ledger whose every call waits for the test to answer or fail it. */
function heldLedger() {
  const calls: Array<{ kind: 'spend' | 'read'; dollars?: number; answer(status: JevBudgetStatus): void; fail(): void }> = [];
  const held = (kind: 'spend' | 'read', dollars?: number) => new Promise<JevBudgetStatus>((answer, reject) =>
    calls.push({ kind, ...(dollars === undefined ? {} : { dollars }), answer, fail: () => reject(new Error('ledger down')) }));
  const ledger: JevLedger = { spend: dollars => held('spend', dollars), read: () => held('read') };
  const work: Promise<unknown>[] = [];
  let now = day;
  const budget = new JevBudget(ledger, promise => { work.push(promise); }, () => now);
  return { calls, budget, at(t: number) { now = t; return t; },
    async settle() { await Promise.all(work.splice(0)); } };
}

describe('the Jev budget ledger', () => {
  it('adds up every room\'s spend per UTC day, reports the cap reached, and starts afresh the next day', async () => {
    expect(await ledger().jevSpend('room-a', 10, day)).toMatchObject({ total: 10, capped: false });
    expect(await ledger().jevSpend('room-b', 15, day)).toMatchObject({ total: 25, capped: true });
    expect(await ledger().jevBudget(day)).toMatchObject({ total: 25, capped: true });
    expect(await ledger().jevBudget(next)).toMatchObject({ total: 0, capped: false });
    await ledger().jevSpend('room-a', 1, next);
    // The old day is gone once a new one is written.
    expect(await ledger().jevBudget(day)).toMatchObject({ total: 0 });
  });

  it('stops every room once the day is spent, and lets them start again the next UTC day', async () => {
    const work: Promise<unknown>[] = [], settle = () => Promise.all(work.splice(0));
    const room = (name: string) => new JevBudget({ spend: (dollars, now) => ledger().jevSpend(name, dollars, now), read: now => ledger().jevBudget(now) },
      promise => { work.push(promise); });
    const a = room('a'), b = room('b');
    // Nothing is spent until the ledger has said the day is open.
    expect(a.allows(day)).toBe(false); expect(b.allows(day)).toBe(false);
    await settle();
    expect(a.allows(day)).toBe(true); expect(b.allows(day)).toBe(true);
    // A room stops as soon as its own unreported spend would pass the cap.
    a.add(24.99); expect(a.allows(day)).toBe(true);
    a.add(.02); expect(a.allows(day)).toBe(false);
    a.tick(day + 30_000); await settle();
    // The other room learns at its next report.
    expect(b.allows(day + 30_000)).toBe(true);
    b.add(.001); b.tick(day + 30_000); await settle();
    expect(b.allows(day + 30_000)).toBe(false);
    expect(a.allows(next)).toBe(false); expect(b.allows(next)).toBe(false);
    await settle();
    expect(a.allows(next)).toBe(true); expect(b.allows(next)).toBe(true);
  });

  it('stops the whole room spending when the ledger cannot be reached, and asks again only after a while', async () => {
    const { calls, budget, at, settle } = heldLedger();
    expect(budget.allows(at(day))).toBe(false);
    calls[0]!.answer(open(day)); await settle();
    expect(budget.allows(at(day + 1))).toBe(true);
    budget.add(.5); budget.tick(at(day + 30_000));
    expect(calls[1]).toMatchObject({ kind: 'spend', dollars: .5 });
    calls[1]!.fail(); await settle();
    expect(budget.allows(at(day + 30_001))).toBe(false);
    expect(budget.allows(at(day + 59_000))).toBe(false);
    expect(calls).toHaveLength(2);
    expect(budget.allows(at(day + 61_000))).toBe(false);
    expect(calls[2]).toMatchObject({ kind: 'read' });
    calls[2]!.answer(open(day, .5)); await settle();
    expect(budget.allows(at(day + 61_001))).toBe(true);
  });

  it('does not trust a day\'s total it has not heard again for two report intervals', async () => {
    const { calls, budget, at, settle } = heldLedger();
    budget.allows(at(day)); calls[0]!.answer(open(day)); await settle();
    expect(budget.allows(at(day + 31_000))).toBe(true);
    // The ledger stops answering: the room keeps going on what it knows for a while, then stops.
    expect(calls.slice(1).map(c => c.kind)).toEqual(['read']);
    expect(budget.allows(at(day + 61_000))).toBe(false);
  });

  it('reports a flush asked for while a ledger call is out, once that call ends', async () => {
    const { calls, budget, at, settle } = heldLedger();
    budget.allows(at(day));
    budget.add(.25); budget.tick(at(day + 10), true);
    expect(calls).toHaveLength(1);
    calls[0]!.answer(open(day)); await settle();
    expect(calls[1]).toMatchObject({ kind: 'spend', dollars: .25 });
  });
});
