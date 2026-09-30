import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { JEV_LEDGER, JevBudget } from '../../src/worker/bots/jevBudget';

const day = Date.UTC(2026, 8, 29, 12), next = day + 86_400_000;
const ledger = () => env.MATCHMAKER.getByName(JEV_LEDGER);

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
});
