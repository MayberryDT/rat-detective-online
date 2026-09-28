/** Cosmetic annotations only: never participate in damage, motion or scoring. */
export const WORLD_FOLEY_CUES = ['bounce','grow','charge','unstick','corpse-bounce','corpse-hit','corpse-kick','burst','case-bounce','trigger','trigger-busy','launch-landing'] as const;
export type WorldFoleyCue = typeof WORLD_FOLEY_CUES[number];
export const isWorldFoleyCue = (value: unknown): value is WorldFoleyCue => WORLD_FOLEY_CUES.some(cue => cue === value);
