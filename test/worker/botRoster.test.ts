import { describe, expect, it } from 'vitest';
import { botPersonality, createRoundBotRoster, fillBotRoster, nextRoundBotRoster, PERSISTENT_BOT_IDS } from '../../src/shared/botRoster';
import { PERSONALITIES } from '../../src/shared/bots/intent';
import { NAME_MAX_LENGTH, RAT_SURNAMES, RAT_TITLES } from '../../src/shared/ratNames';

describe('round bot roster', () => {
  it.each([[0, 6], [0.25, 7], [0.5, 8], [0.75, 9], [0.999999, 9]])('samples %s into %s bots', (random, count) => {
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
  it('keeps overlapping names and only names newcomers', () => {
    const first = createRoundBotRoster([], () => 0);
    const grown = nextRoundBotRoster(first, first.map(bot => bot.name), () => 0.999999);
    expect(grown).toHaveLength(9);
    expect(grown.slice(0, 6).map(bot => bot.name)).toEqual(first.map(bot => bot.name));
    expect(grown.slice(6).every(bot => !first.some(previous => previous.name === bot.name))).toBe(true);
    const shrunk = nextRoundBotRoster(grown, grown.map(bot => bot.name), () => 0);
    expect(shrunk).toHaveLength(6);
    expect(shrunk.map(bot => bot.name)).toEqual(grown.slice(0, 6).map(bot => bot.name));
  });
  // Failure modes: a small fresh roll leaves the room short of its rolled count;
  // a refill renames or re-ids a rat that stayed; a newcomer reuses a live name.
  it('refills to the target from free slots even when a fresh roll would be small', () => {
    const seven = nextRoundBotRoster(createRoundBotRoster([], () => 0), [], () => 0.25);
    const filled = fillBotRoster(seven, 9, ['Human Name'], () => 0);
    expect(filled.map(bot => bot.id)).toEqual(PERSISTENT_BOT_IDS.slice(0, 9));
    expect(filled.slice(0, 7)).toEqual(seven);
    expect(new Set([...filled.map(bot => bot.name), 'Human Name']).size).toBe(10);
    const gap = fillBotRoster(seven.filter(bot => bot.id !== 'rd-ai-02'), 7, [], () => 0);
    expect(gap.map(bot => bot.id).sort()).toEqual(PERSISTENT_BOT_IDS.slice(0, 7));
    expect(fillBotRoster(seven, 5)).toEqual(seven);
  });
});

describe('bot archetypes', () => {
  const pool = RAT_TITLES.flatMap(title => RAT_SURNAMES.map(surname => `${title} ${surname}`)).filter(name => name.length <= NAME_MAX_LENGTH);
  it('splits the name pool about evenly into the five archetypes', () => {
    const share = (personality: string) => pool.filter(name => botPersonality(name) === personality).length / pool.length;
    for (const personality of PERSONALITIES) { expect(share(personality)).toBeGreaterThan(.15); expect(share(personality)).toBeLessThan(.25); }
  });
});
