import {MAX_PLAYERS} from './networkProtocol';
import { NAME_MAX_LENGTH, RAT_SURNAMES, RAT_TITLES } from './ratNames';
import { APPEARANCE_COUNT, appearanceAt } from './ratAppearance';

const names = ['Constable Trap', 'Inspector Nibbles', 'Sergeant Stilton', 'Detective Crumbs',
  'Officer Whiskers', 'Captain Cheddar', 'Deputy Squeaks', 'Inspector Gouda',
  'Constable Alley', 'Detective Rind', 'Sergeant Scurry'];

/** Legacy roster retained until the next round; identities leave one human slot in non-matchmade legacy rooms. */
export const PERSISTENT_BOT_ROSTER = names.slice(0,MAX_PLAYERS-1).map((name, i) => ({
  id: `rd-ai-${String(i).padStart(2, '0')}`, name,
  appearance: appearanceAt(i * 149),
}));
export const PERSISTENT_BOT_IDS = PERSISTENT_BOT_ROSTER.map(bot => bot.id);

export const MIN_PERSISTENT_BOTS = 6;
export const MAX_PERSISTENT_BOTS = PERSISTENT_BOT_IDS.length;
export type PersistentBot = typeof PERSISTENT_BOT_ROSTER[number];

function rollBotCount(random: () => number): number {
  return MIN_PERSISTENT_BOTS + Math.floor(random() * (MAX_PERSISTENT_BOTS - MIN_PERSISTENT_BOTS + 1));
}

function availableNames(excluded: Iterable<string>): string[] {
  const skip = new Set(excluded);
  return RAT_TITLES.flatMap(title => RAT_SURNAMES.map(surname => `${title} ${surname}`))
    .filter(name => name.length <= NAME_MAX_LENGTH && !skip.has(name));
}

function assignBots(entries: readonly PersistentBot[], excludedNames: Iterable<string>, random: () => number): PersistentBot[] {
  const available = availableNames(excludedNames);
  const appearances = Array.from({ length: APPEARANCE_COUNT }, (_, index) => index);
  return entries.map(entry => {
    const index = Math.floor(random() * available.length);
    const [name] = available.splice(index, 1);
    const [appearanceIndex] = appearances.splice(Math.floor(random() * appearances.length), 1);
    return { ...entry, name, appearance: appearanceAt(appearanceIndex) };
  });
}

/** Sample without replacement, so even a constant RNG cannot repeat names. */
export function createRoundBotRoster(previousNames: Iterable<string> = [], random = Math.random): PersistentBot[] {
  return assignBots(PERSISTENT_BOT_ROSTER.slice(0, rollBotCount(random)), previousNames, random);
}

/** Keep overlapping rats and their names; only newcomers get fresh names. */
export function nextRoundBotRoster(
  previous: readonly PersistentBot[] = [],
  reservedNames: Iterable<string> = [],
  random = Math.random,
): PersistentBot[] {
  const count = rollBotCount(random);
  const keep = previous.slice(0, Math.min(previous.length, count)).map(bot => ({ ...bot }));
  if (keep.length === count) return keep;
  return keep.concat(assignBots(PERSISTENT_BOT_ROSTER.slice(keep.length, count), [...reservedNames, ...keep.map(bot => bot.name)], random));
}

/** Top a roster up to `target` from the free slots; existing rats keep their ids and names. */
export function fillBotRoster(
  roster: readonly PersistentBot[],
  target: number,
  reservedNames: Iterable<string> = [],
  random = Math.random,
): PersistentBot[] {
  const used = new Set(roster.map(bot => bot.id));
  const free = PERSISTENT_BOT_ROSTER.filter(bot => !used.has(bot.id)).slice(0, Math.max(0, target - roster.length));
  return roster.concat(assignBots(free, [...reservedNames, ...roster.map(bot => bot.name)], random));
}
