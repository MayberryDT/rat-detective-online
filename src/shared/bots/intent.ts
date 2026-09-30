import type {Vec3Data} from '../networkProtocol';

/** The bot overhaul's shared contract (docs/bot-overhaul.md): perception feeds a mind, the mind's
 * goal scores pass through the cast, and code turns the chosen goal into a Plan the motor runs every tick.
 * Firing is not a goal: the motor fires whenever it has a shot, within the skill dials. */

/** Raised by every change to the minds, questions, weights or dials; stamped on city facts next to `layoutVersion`. */
export const MIND_VERSION=2;

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
    /** A Jev answer's cost and timing, for the recorder. */
    jev?:{latencyMs:number;tokens:number;/** When its situation was sent. */sentAt:number};
}

/** Answers for one rat from a decision context. A mind that thinks asynchronously (Jev) returns its latest
 * fresh answer, or undefined when it has none; the code mind then answers instead. */
export interface Mind<Context> {
    answer(context:Context):MindAnswer|undefined;
}

/** What the cast chose, for the motor and the recorder's decision fact. */
export interface Decision {
    plan:Plan;
    answer:MindAnswer;
    personality:Personality;
    /** Scores after the personality's weights. */
    weighted:GoalScores;
    /** Why the decision was taken now. */
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
    /** The crosshair's steady wander (one standard deviation, radians) for a still rat at mid range; distance,
     * the target's motion, the rat's own motion and being hit scale it. */
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
export const BASE_SKILL:SkillDials={reactionMs:[240,480],aimWanderRadians:4.8*Math.PI/180,flickError:.2,trackingMs:[130,210],lead:[.2,.75],burstShotMs:[190,280],fireGapMs:200};
