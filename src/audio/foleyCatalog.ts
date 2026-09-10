/** Each new sound names a visible action. World accents are close and sparse;
 * the accepted gun/rat/feedback mix remains in its existing audio systems. */
const cue=(volume:number,cooldown:number,range=0,priority=1)=>({volume,cooldown,range,priority});
export const FOLEY = {
    jump:cue(.13,240,16), 'land-heavy':cue(.22,450,18), 'wall-bonk':cue(.28,500,18),
    'corpse-bounce':cue(.20,550,18), 'corpse-kick':cue(.18,400,18), 'corpse-hit':cue(.25,500,22),
    'case-floor':cue(.19,650,16), 'case-wall':cue(.19,650,16),
    'name-tick':cue(.25,45,0,3), 'name-stamp':cue(.45,400,0,3),
    'hit-confirm':cue(.12,100,0,3),
    'respawn-tick':cue(.30,800,0,3), victory:cue(.43,5000,0,4),
} as const;
export type FoleyCue=keyof typeof FOLEY;
export type FoleyPlay=(cue:FoleyCue,origin?:{x:number;y:number;z:number},options?:{key?:string;gain?:number;rate?:number})=>void;
