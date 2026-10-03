/** Highlight replays (docs/replay/detection.md): the moments the server spots, the marker it broadcasts for each, and
 * what a client tells it about the exhibits it showed. */
export const HIGHLIGHT_KINDS = ['sent-flying','splashdown','pileup','squashed','snapped','body-blow','backfire','so-close','last-meal','fresh-spawn','from-beyond','bank-shot','laser-ricochet','long-shot','airborne','multi-kill','carrier-down','steal-score','delivery','round-winner'] as const;
export type HighlightKind = typeof HIGHLIGHT_KINDS[number];
export const isHighlightKind = (value: unknown): value is HighlightKind => HIGHLIGHT_KINDS.some(kind => kind === value);
/** `at`: server time of the moment (the movement samples' and chaos `serverTime` clock). `actors[0]` is the main actor
 * (the killer or doer); victims follow. `leadMs`/`trailMs`: the clip window around `at`. A multi-kill or pileup that
 * grows after it was sent is sent again with the same `id` and a higher score: the later marker replaces the earlier. */
export type HighlightMarker = { type:'highlight'; id:string; kind:HighlightKind; at:number; actors:string[]; p:{x:number;y:number;z:number}; score:number; leadMs:number; trailMs:number };
export const EXHIBIT_ACTIONS = ['shown', 'played', 'saved'] as const;
export type ExhibitAction = typeof EXHIBIT_ACTIONS[number];
export const isExhibitAction = (value: unknown): value is ExhibitAction => EXHIBIT_ACTIONS.some(action => action === value);
export type ExhibitMessage = { type:'exhibit'; id:string; kind:HighlightKind; action:ExhibitAction };
/** A marker names at most this many rats. */
export const MAX_HIGHLIGHT_ACTORS = 10;

/** Detection weights and thresholds (X6 tunes them from the facts; each change is a new era). Base scores follow the
 * plan's order: funny and chaotic moments first, then multi-kills, scoring and trick shots. */
export const HIGHLIGHT_TUNING = {
  base: {
    'sent-flying': 100, splashdown: 95, pileup: 95, squashed: 90, snapped: 85, 'body-blow': 85, backfire: 75,
    'so-close': 75, 'from-beyond': 75, 'last-meal': 70, 'fresh-spawn': 60,
    'multi-kill': 60, 'round-winner': 60, 'steal-score': 55, 'carrier-down': 45, delivery: 40,
    'bank-shot': 50, airborne: 50, 'laser-ricochet': 45, 'long-shot': 45,
  } satisfies Record<HighlightKind, number>,
  /** A dead rat's body sent this far (straight line from where it fell) or this high, within `sentFlyingMs`. Raised from 22 u
   * and 5 u (Tyler, 2 October, protocol 31: sent flying was half of all moments): every kill throws its body at
   * `normalCorpseSpeed` 32 u/s, so 22 u caught ordinary kills; real launches (incidents, blasts) still clear 40 u. */
  sentFlying: { distance: 40, height: 8 },
  sentFlyingMs: 2_000,
  pileup: { deaths: 3, radius: 18, windowMs: 4_000 },
  /** A carrier killed within this many units of the PAPER CHASE drop-off. */
  soCloseDistance: 12,
  /** A carrier killed in the active Jurisdiction zone with at most this much of its hold left to win. */
  soCloseZoneMs: 15_000,
  lastMealMs: 3_000,
  freshSpawnMs: 3_000,
  /** A headshot from farther than this. */
  longShotDistance: 40,
  bankShotBounces: 2,
  laserReflections: 1,
  /** Kills by one rat, each within `windowMs` of the one before. */
  multiKill: { kills: 2, windowMs: 6_000 },
  /** A multi-kill or pileup is sent after this long without a new kill or death joining it (sent again if one does). */
  burstHoldMs: 2_000,
  /** The case taken within `stealGapMs` of another rat holding it, then scored within `stealScoreMs`. */
  stealGapMs: 5_000,
  stealScoreMs: 15_000,
  /** Score multiplier when any actor is a human (not a bot, not an agent browser). */
  human: 1.5,
  /** Each earlier moment of the same kind this round divides the score by (1 + rarity × seen), down to `rarityMin`. */
  rarity: .15,
  rarityMin: .4,
  /** Each further kind the same hit qualifies for adds this share of its base score. */
  combo: .25,
  /** Moments scoring under this are not sent. */
  floor: 20,
  leadMs: 4_000,
  trailMs: 2_000,
  maxLeadMs: 6_000,
  maxTrailMs: 4_000,
} as const;
