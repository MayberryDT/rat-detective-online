import { describe, expect, it } from 'vitest';
import { createRoundBotRoster, PERSISTENT_BOT_IDS } from '../../src/shared/botRoster';
import { NAME_MAX_LENGTH, RAT_SURNAMES, RAT_TITLES } from '../../src/shared/ratNames';

describe('round bot roster', () => {
  it.each([[0, 8], [0.25, 9], [0.5, 10], [0.999999, 11]])('samples %s into %s bots', (random, count) => {
    const roster = createRoundBotRoster([], () => random);
    expect(roster).toHaveLength(count);
    expect(roster.map(bot => bot.id)).toEqual(PERSISTENT_BOT_IDS.slice(0, count));
    expect(new Set(roster.map(bot => bot.name)).size).toBe(count);
    for (const bot of roster) {
      const [title, surname] = bot.name.split(' ');
      expect(RAT_TITLES).toContain(title); expect(RAT_SURNAMES).toContain(surname);
      expect(bot.name.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    }
  });
  it('avoids all previous round names even when the random source repeats', () => {
    const first = createRoundBotRoster([], () => 0);
    const next = createRoundBotRoster(first.map(bot => bot.name), () => 0);
    expect(next.every(bot => !first.some(previous => previous.name === bot.name))).toBe(true);
  });
});
