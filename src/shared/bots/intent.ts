import type {Vec3Data} from '../networkProtocol';

/** The bot overhaul's shared contract (docs/bot-overhaul.md): perception feeds a mind, the mind's
 * goal scores pass through the cast, and code turns the chosen goal into a Plan the motor runs every tick.
 * Firing is not a goal: the motor fires whenever it has a shot, within the skill dials. */

/** Raised by every change to the minds, questions, weights or dials; stamped on city facts next to `layoutVersion`. */
export const MIND_VERSION=6;

/** When a bot decides (the bot learning plan, L4): on events (spawn, its goal ending or failing, the case changing
 * state, the assignment moving on) and at most `holdMs` after its last decision otherwise; between decisions it
 * holds its goal. A mind that asked for time (`'wait'`) gets up to `waitMs` while the held goal is still possible. */
export const DECIDE={holdMs:10_000,waitMs:1500} as const;

/** What a rat does about rivals on the way: fight them, or keep to the goal and fight only rats that block it or shoot. */
export const STANCES=['fight','focus'] as const;
export type Stance=typeof STANCES[number];

/** Code-only rounds (Tyler, 30 September): about 1 round in 5, picked from the round's id so every part of the room
 * agrees without storing it, the bots use the code mind even with humans playing, to measure what Jev is worth. */
export function codeOnlyRound(roundId:string|undefined):boolean {
    if(!roundId)return false;
    let hash=2166136261;
    for(let i=0;i<roundId.length;i++)hash=Math.imul(hash^roundId.charCodeAt(i),16777619);
    return (hash>>>0)%5===0;
}

/** Where to go and what to do there. Code offers only the goals valid for this rat right now. */
export const GOALS=['take-case','chase-carrier','keep-case','hold-zone','hunt','flee','heal','arm-up','ambush','mischief','roam'] as const;
export type Goal=typeof GOALS[number];

/** Hidden from players. Rolled per roster name (80/10/10) and kept across rounds. */
export const PERSONALITIES=['tryhard','maverick','gremlin'] as const;
export type Personality=typeof PERSONALITIES[number];

/** How the motor approaches a plan; approach, stop and fight rules differ per mode. */
export type MotorMode='case'|'carrier'|'combat'|'dispatch'|'explore'|'delivery'|'evade'|'intercept'|'pickup'|'zone-hold';

/** A goal made concrete by code: what the motor executes until the next decision. */
export interface Plan {
    goal:Goal;
    mode:MotorMode;
    /** Stable identity: a changed key restarts routing; an unchanged key keeps the current route. */
    key:string;
    /** Where to go. For a followed rat this is the rat's own record, so the motor tracks its live position. */
    destination?:Vec3Data;
    /** The rat being followed (the carrier, a hunted rat). */
    follow?:string;
}

/** One candidate place for an open-ended goal (flee, ambush, roam, mischief): code lists, a mind picks. */
export interface PlaceOption {id:string;point:Vec3Data;/** Plain words for Jev: where it is and what it is. */what:string}

/** Each offered goal's worth right now: 0 makes no sense … 4 clearly the best. */
export type GoalScores=Partial<Record<Goal,number>>;

/** What a mind answers for one rat. The code mind fills `scores` only. */
export interface MindAnswer {
    source:'jev'|'code';
    scores:GoalScores;
    /** Chosen PlaceOption id per open-ended goal. Absent: the first option. */
    places?:Partial<Record<Goal,string>>;
    /** Preferred rat to shoot, if visible. Absent: the motor's own choice. */
    target?:string;
    /** 0 safe … 3 about to die. */
    danger?:number;
    /** Probability that a bank shot is the way to reach the target. */
    bank?:number;
    /** Fight rivals on the way, or keep to the goal. Absent: code's stance for the chosen goal. */
    stance?:Stance;
    /** A Jev answer's cost and timing, for the recorder. */
    jev?:{latencyMs:number;tokens:number;/** When its situation was sent. */sentAt:number};
}

/** Answers for one rat at a decision moment. A mind that thinks asynchronously (Jev) returns its answer to this
 * moment, `'wait'` while one is on its way, or undefined when it has none; the code mind then answers instead. */
export interface Mind<Context> {
    answer(context:Context):MindAnswer|'wait'|undefined;
    /** True when this rat should decide now whatever it holds (Jev just came on: a human started playing). */
    due?(id:string):boolean;
}

/** What the cast chose, for the motor and the recorder's decision fact. */
export interface Decision {
    plan:Plan;
    answer:MindAnswer;
    personality:Personality;
    /** Scores after the personality's weights. */
    weighted:GoalScores;
    stance:Stance;
    /** Why the decision was taken now: an event, or `holdMs` passed. */
    trigger:'beat'|'event'|'fallback';
    /** The motor gave up the previous plan since the last decision. */
    failed?:true;
}

/** Motor skill: one tier for every personality ("base bots never outplay Tyler"). A harder tier is only
 * different numbers. Uniform ranges are [min, max]. The crosshair is a physical thing the rat moves: every
 * miss comes from reaction, a flick that lands short or long, lag behind a moving target and wander. */
export interface SkillDials {
    /** Reaction before a newly seen target is engaged, ms. A target off to the side or behind adds more. */
    reactionMs:readonly [number,number];
    /** How far a movement of the crosshair (a flick's end or a correction) lands off where the rat means to aim
     * (one standard deviation, radians) for a still rat at mid range; distance, the target's motion, the rat's own
     * motion and being hit scale it. Between movements the hand holds still. */
    aimWanderRadians:number;
    /** A flick's endpoint error as a share of its size (one standard deviation): overshoot or undershoot. */
    flickError:number;
    /** How far the crosshair trails what the rat sees (the tracking lag's time constant), ms. */
    trackingMs:readonly [number,number];
    /** Share of a moving target's true lead the rat applies, drawn per engagement. */
    lead:readonly [number,number];
    /** Gap between shots within a burst, ms. */
    burstShotMs:readonly [number,number];
    /** Minimum ms after one motor shot (aimed, speculative or banked) before the next. */
    fireGapMs:number;
}
/** The base tier: below the median human's hit rate (docs/bot-overhaul.md, "Motor rewrite"). */
export const BASE_SKILL:SkillDials={reactionMs:[240,480],aimWanderRadians:2.2*Math.PI/180,flickError:.2,trackingMs:[130,210],lead:[.2,.75],burstShotMs:[100,170],fireGapMs:100};
