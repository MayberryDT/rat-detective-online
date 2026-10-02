import type {HighlightKind} from '../shared/highlights';
import type {ReplayClip} from './types';

/** Exhibit captions: noir one-liners per kind, like the case jokes. `{killer}` and `{name}` are the main actor
 * (`actors[0]`), `{victim}` the first rat on the receiving end (the main actor when the moment had only one rat),
 * `{carrier}` whoever held the case. Short enough for one line on an exhibit card. */
export const CAPTIONS: Record<HighlightKind, readonly string[]> = {
    'sent-flying': ['{victim} learns to fly', '{victim} leaves town by air', '{killer} files {victim} under airmail', '{victim} takes the scenic route', '{victim} never did land that job'],
    splashdown: ['{victim} sleeps with the fishes', '{victim} goes off the deep end', 'The docks keep {victim}', '{victim} takes a long swim', 'The harbour closes the case on {victim}'],
    pileup: ['{killer} stacks the evidence', 'Bodies all the way down', '{killer} leaves a crowded scene', 'A pileup on {killer}\'s street', 'Too many rats, one bad corner'],
    squashed: ['{killer} drops in on {victim}', '{victim} is flattened, officially', '{killer} lands the case on {victim}', '{victim} never looked up', 'Death from above, signed {killer}'],
    snapped: ['{victim} was already in a jam', '{killer} shoots a trapped rat', '{victim} walks into the cheese', 'Snapped, then shot: {victim}', '{victim} sticks around too long'],
    'body-blow': ['{killer} uses {victim} as a weapon', '{victim} is hit by a falling witness', 'Corpse at speed, {victim} at fault', '{killer} throws the book, and {victim}', 'Dead rats tell no tales, they hit'],
    'big-cheese': ['{killer} rolls the big one', '{victim} meets the Big Cheese', 'Too much cheese for {victim}', '{killer} lets it ride', 'The Big Cheese runs over {victim}'],
    backfire: ['{name} trusted the wrong supply', 'Code violation: {name}', '{name} reads the fine print too late', 'The supply files charges on {name}', '{name} gets what the city pays for'],
    'so-close': ['{carrier} could smell the paperwork', '{carrier} almost made it home', 'So close, {carrier}. So close', '{killer} stops {carrier} at the door', 'The drop-off waits for {carrier}'],
    'last-meal': ['{victim} enjoys a last meal', '{victim} heals up for nothing', '{killer} skips the dessert course', '{victim} patched up, packed off', 'The Quick Fix was not quick enough'],
    'fresh-spawn': ['{victim} is fresh off the boat', 'Welcome to the city, {victim}', '{killer} greets {victim} at the gate', '{victim} barely unpacked', '{victim} clocks in, clocks out'],
    'from-beyond': ['{killer} files one last report', '{killer} shoots from the grave', 'Dead rats still pull triggers', '{killer} takes {victim} along', 'A late delivery from {killer}'],
    'bank-shot': ['{killer} plays the angles', '{killer} banks it off the city', 'Off the wall and into {victim}', '{killer} calls the corner pocket', 'Geometry closes the case on {victim}'],
    'laser-ricochet': ['{killer} bends the light', '{victim} is hit by a reflection', '{killer} gets the wall to help', 'Bouncing beam, bounced {victim}', 'The city mirrors {killer}'],
    'long-shot': ['{killer} reaches across town', '{victim} never saw it coming', '{killer} takes the long view', 'A long shot, signed {killer}', '{victim} was out of range, nearly'],
    airborne: ['{killer} shoots on the fly', '{victim} gets it in the air', '{killer} works the skies', 'Midair, mid-case, {victim} down', 'Air mail from {killer}'],
    'multi-kill': ['{killer} clears the docket', '{killer} works overtime', '{killer} closes cases in bulk', 'Busy night for {killer}', '{killer} files them all at once'],
    'carrier-down': ['{carrier} drops the case', '{killer} takes the case off {carrier}', '{carrier}\'s case goes cold', 'Evidence lost: {carrier}', '{killer} reopens the case'],
    'steal-score': ['{killer} steals it and runs', '{killer} lifts the case and cashes in', 'Finders keepers, says {killer}', '{killer} scores on borrowed evidence', '{victim} did the work, {killer} took it'],
    delivery: ['{carrier} delivers the goods', '{carrier} gets the papers home', 'Signed, sealed, {carrier}', '{carrier} makes the drop', 'The paperwork clears for {carrier}'],
    'round-winner': ['{killer} closes the case', 'The city belongs to {killer}', '{killer} takes the whole file', 'Case closed by {killer}', '{killer} has the last word'],
};

/** Short labels and one-character glyphs for the exhibit cards (text, not images: no GPU readback). */
export const KIND_LABEL: Record<HighlightKind, string> = {
    'sent-flying': 'SENT FLYING', splashdown: 'SPLASHDOWN', pileup: 'PILEUP', squashed: 'SQUASHED', snapped: 'SNAPPED', 'body-blow': 'BODY BLOW',
    'big-cheese': 'BIG CHEESE', backfire: 'BACKFIRE', 'so-close': 'SO CLOSE', 'last-meal': 'LAST MEAL', 'fresh-spawn': 'FRESH OFF THE BOAT',
    'from-beyond': 'FROM BEYOND', 'bank-shot': 'BANK SHOT', 'laser-ricochet': 'LASER RICOCHET', 'long-shot': 'LONG SHOT', airborne: 'AIRBORNE',
    'multi-kill': 'MULTI-KILL', 'carrier-down': 'CARRIER DOWN', 'steal-score': 'STEAL AND SCORE', delivery: 'DELIVERY', 'round-winner': 'ROUND WINNER',
};
export const KIND_GLYPH: Record<HighlightKind, string> = {
    'sent-flying': '↗', splashdown: '≈', pileup: '☰', squashed: '▼', snapped: '⊓', 'body-blow': '✸', 'big-cheese': '◉', backfire: '⚠',
    'so-close': '⌖', 'last-meal': '✚', 'fresh-spawn': '⚓', 'from-beyond': '✝', 'bank-shot': '⟋', 'laser-ricochet': '⋀', 'long-shot': '⊕',
    airborne: '☁', 'multi-kill': '✕', 'carrier-down': '◆', 'steal-score': '⇄', delivery: '✉', 'round-winner': '★',
};
/** Case moments take the one case red. */
export const CASE_KINDS: Partial<Record<HighlightKind, true>> = {'so-close': true, 'carrier-down': true, 'steal-score': true, delivery: true};

function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** The rats' roles in a clip, by name. */
export function clipNames(clip: Pick<ReplayClip, 'kind' | 'actors' | 'names'>): {killer: string; victim: string; carrier: string; name: string} {
    const named = (id: string | undefined) => (id && clip.names[id]) || 'A rat';
    const killer = named(clip.actors[0]), victim = named(clip.actors[1] ?? clip.actors[0]);
    const carrier = clip.kind === 'carrier-down' || clip.kind === 'so-close' ? victim : killer;
    return {killer, victim, carrier, name: killer};
}

/** The clip's caption: one line per kind, chosen by the clip id so it stays the same for every view of that clip. */
export function caption(clip: Pick<ReplayClip, 'id' | 'kind' | 'actors' | 'names'>): string {
    const lines = CAPTIONS[clip.kind];
    const line = lines[hash(clip.id) % lines.length]!;
    const names = clipNames(clip);
    return line.replace(/\{(killer|victim|carrier|name)\}/g, (_, key: keyof typeof names) => names[key]);
}
