import type {Vec3Data} from '../networkProtocol';

/** The bot overhaul's shared contract (docs/bot-overhaul.md): perception feeds a mind, the mind's
 * goal scores pass through the cast, and code turns the chosen goal into a Plan the motor runs every tick.
 * Firing is not a goal: the motor fires whenever it has a shot, within the skill dials. */

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
    destination?:Vec3Data;
    /** A rat whose live position the motor follows (the carrier, a hunted rat). */
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
}

/** Motor skill: one tier for every personality ("base bots never outplay Tyler"). */
export interface SkillDials {
    /** Added to the motor's reaction before a new target can be shot, ms. */
    reactionMs:number;
    /** Multiplier on the motor's angular aim error. */
    aimError:number;
    /** Minimum ms between shots. */
    fireIntervalMs:number;
}
