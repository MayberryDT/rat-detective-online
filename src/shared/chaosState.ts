import type { PlayerData, QuatData, RatAppearance, Vec3Data } from './networkProtocol';
import type { IncidentId } from './incidentCatalog';
import type { AssignmentState } from './assignments';
import type { WorldFoleyCue } from './foleyEvents';
import type { BuffMap, PickupState } from './pickups';

export const CHAOS_TUNING = {
    pickupRadius: 2.25, formerCarrierDelay: 900,
    caseShotKick: 30, caseShotLift: 10, caseShotMaxSpeed: 48, casePickupMaxSpeed: 18,
    rollMs: 2400, activeMs: 25000, cooldownMs: 16000,
    corpseSpeed: 95, normalCorpseSpeed: 32, corpseMs: 10000, maxCorpses: 16,
    corpseHitMinSpeed: 12, corpseHitCooldownMs: 700, corpseShotKick: 19, deathBurstBalls: 120,
    maxShots: 256, recoverMs: 900, stuckMs: 18000,
} as const;
export const INCIDENT_TUNING = {
    delayedMin: .35, delayedMax: .575,
    cheeseRadii: [0.15, 0.24, 0.36, 0.52, 0.72, 0.96, 1.24, 1.55, 1.9, 2.4] as const,
    caseMissileSpeed: 145, caseShotSpeed: 160, caseMissileLift: 6, caseEjectSpeed: 22,
    caseRicochetMinSpeed: 140, caseBounceLift: 7, caseMaxLift: 10,
    /** Malpractice: a Quick Fix kit hops `hop` units away from a rat within `scare`, at most every
     * `hopMs`, staying within `leash` of home; `explodeChance` of claims blow up instead of healing. */
    malpracticeScare: 7, malpracticeHop: 5, malpracticeHopMs: 650, malpracticeLeash: 12, malpracticeExplodeChance: .35,
    /** Rat Race: cheese flies this much faster. */
    ratRaceShotSpeed: 1.35,
} as const;
/** Planted Evidence: additional hazards, never objectives. Bursts share deathBurstBalls. */
export const COUNTERFEIT_IDS = ['fake-01','fake-02','fake-03','fake-04','fake-05',
    'fake-06','fake-07','fake-08','fake-09','fake-10'] as const;
export const CASE_HOME = { x: -16, y: 1.3, z: -28 };
export const CASE_LOOSE_SCALE = 2;
// Street-level frontages distributed around the city; the simulation verifies
// floor support and clearance against the current world's actual collision boxes.
export const CASE_SPAWNS = [CASE_HOME,
    {x:22,y:1.3,z:-28},{x:82,y:1.3,z:-24},{x:-55,y:1.3,z:25},
    {x:-166,y:1.3,z:35},{x:130,y:1.3,z:-24},{x:15,y:1.3,z:135},
    {x:-75,y:1.3,z:-87},{x:77,y:1.3,z:75},{x:-105,y:1.3,z:120},
    {x:46,y:1.3,z:53},{x:138,y:1.3,z:135},
    {x:-9.8,y:1.3,z:-28},{x:115,y:1.3,z:-22},{x:-110,y:1.3,z:118},
    {x:145,y:1.3,z:128},{x:-150,y:1.3,z:18},
    {x:0,y:-5.7,z:0},{x:-84,y:-5.7,z:0},{x:48,y:-5.7,z:0},
] as const;
export const CASE_SIZE = { x: .82, y: .62, z: .34 };
// Hang from the unused hand, with the broad face running along the rat's side.
export const CASE_HAND = { x: .74, y: .52, z: .02 };
export const CASE_CARRY_ROTATION = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
// Every landmark shares one incident lifecycle; each has its own physical target.
export const DISPATCH_STATIONS = [
    { id:'records', x:-9.8, z:-34.5 }, { id:'icebox', x:115, z:-29 },
    { id:'needleworks', x:-110, z:112.5 }, { id:'pump', x:145, z:140 },
    { id:'gate', x:-150, z:8 },
].map(({id,x,z})=>({id,
    box:{x,y:1.8,z,w:1.8,h:3.6,d:1.05},
    target:{x,y:2.3,z:z+.64,w:.84,h:.84,d:.10},
}));
export const DISPATCH_BOX = DISPATCH_STATIONS[0].box;
export const DISPATCH_TARGET = DISPATCH_STATIONS[0].target;
export type LaunchMachineKind = 'pressure' | 'dumpster' | 'freight' | 'geyser' | 'mousetrap' | 'fan';
export interface LaunchMachine {
    id: string; kind: LaunchMachineKind; label:string;
    pad: { x:number; y:number; z:number; radius:number };
    /** The machine body beside the pad (solid cover), and its big red trigger on top. */
    box: { x:number; y:number; z:number; w:number; h:number; d:number };
    target: { x:number; y:number; z:number; w:number; h:number; d:number };
    /** How long launch events stay in snapshots. */
    eventMs:number;
}
// Each machine stands on its own pad's rim, facing the pad, with open street
// behind it; its big red trigger crowns the machine and is exposed on every side.
export const LAUNCH_MACHINES: readonly LaunchMachine[] = [
    { id:'pressure', kind:'pressure', x:146, z:149, mx:139.1, mz:149 },
    { id:'dumpster', kind:'dumpster', x:-57, z:-29, mx:-57, mz:-35.9 },
    { id:'freight', kind:'freight', x:130, z:-20, mx:134.44, mz:-14.71 },
    { id:'geyser', kind:'geyser', x:-153, z:15, mx:-148.5, mz:19.6 },
    { id:'mousetrap', kind:'mousetrap', x:-106, z:128, mx:-99.34, mz:129.79 },
    { id:'fan', kind:'fan', x:75, z:39, mx:68.52, mz:36.64 },
].map(m=>({id:m.id,kind:m.kind as LaunchMachineKind,
    label:({pressure:'PRESSURE WORKS',dumpster:'TRASH COMPACTOR',freight:'FREIGHT RAM',geyser:'SEWER GEYSER',mousetrap:'RAT TRAP',fan:'WIND TUNNEL'} as Record<string,string>)[m.id],
    pad:{x:m.x,y:0,z:m.z,radius:5},
    box:{x:m.mx,y:1.5,z:m.mz,w:2.4,h:3,d:2.4},
    // A big plain red target: stray cheese from any fight nearby slowly fills it.
    target:{x:m.mx,y:4.8,z:m.mz,w:4,h:3.6,d:4},
    eventMs:1500,
}));
export const PRESSURE_LAUNCH = LAUNCH_MACHINES[0];
/** Pressure, in seconds of one rat standing on the pad: `full` fires it, each
 * cheese ball on the trigger adds `hit`. A full machine hangs `blowMs` (a hit
 * then makes it an overpressure), and after firing waits `cooldownMs` before
 * it can fill again. Pressure never leaks. */
export const PRESSURE_TUNING = { full:10, hit:1, blowMs:500, cooldownMs:1000 } as const;
export const MAX_LAUNCH_EVENTS = 24;
export const MAX_LAUNCH_SPEED = 110;
/** Per machine id: `levels` pressure (seconds, absent is empty); `blowing` the
 * firing time while it hangs full; `fired` its latest firing; `boosts` the
 * firing time of an overpressure (set while blowing, kept after it fires). */
export interface PressureState {
    serial:number; levels:Record<string,number>; blowing?:Record<string,number>; fired?:Record<string,number>;
    boosts?:Record<string,number>; launches:PressureLaunchEvent[]; shoves?:PressureLaunchEvent[];
    /** Pressure Surge street launchers: steam warning until `at`, then they erupt (kept briefly for the eruption). */
    vents?:SurgeVent[];
}
export interface SurgeVent { id:string; x:number; y:number; z:number; at:number; boost?:true }
export interface PressureLaunchEvent { id:string; playerId:string; at:number; velocity:Vec3Data; machineId?:string; boost?:true }
export type DispatchPhase = 'ready' | 'rolling' | 'active' | 'cooldown';
export interface PhysicalPose { p: Vec3Data; q: QuatData; v: Vec3Data; spin: Vec3Data }
export interface CorpseState extends PhysicalPose {
    id: string; victimId: string; owner?: string | null; appearance: RatAppearance; born: number; expires: number;
}
export interface ChaosShot { id: string; owner: string | null; p: Vec3Data; v: Vec3Data; age: number; wallBounced?: boolean; delayed?: boolean; radius?: number; stuckUntil?: number;
    /** Bad Ammunition dud: bounces off rats harmlessly. Authority-only; not on the wire. */
    dud?: true;
    /** Authoritative explosion provenance, retained in storage. Network visual
     * snapshots omit it: clients never decide projectile damage eligibility. */
    explosive?: true;
}
export interface ChaosImpact { p: Vec3Data; n: Vec3Data; surface: boolean; scale?: number; cue?: 'thud'|'buzz'|'case-hit'|'armor-clang'; foley?:WorldFoleyCue; energy?:number; audioOnly?:boolean }
export interface CaseState extends PhysicalPose {
    owner:string|null; previousOwner:string|null; pickupAfter:number; returningUntil:number; missileOwner?:string;
    /** Planted Evidence counterfeits share the briefcase shape but are hazards, not objectives. */
    fake?: boolean;
}
export const EXTRA_CASE_IDS = ['evidence-1','evidence-2','evidence-3','evidence-4','evidence-5','evidence-6','evidence-7'] as const;
export interface ChaosState {
    time: number;
    /** Monotonic simulation identity for time-aligned interactions. Optional only
     * while restoring pre-protocol-15 checkpoints and older test fixtures. */
    epoch?: string;
    tick?: number;
    assignment?: AssignmentState;
    case: CaseState;
    extraCases?: Array<CaseState & {id:string}>;
    /** `wanted`: Most Wanted's current target, the leader in the searchlight. */
    dispatch: { phase: DispatchPhase; started: number; until: number; serial: number; incident?:IncidentId; wanted?:string };
    /** Launchers; `shoves` are landing-shockwave knockbacks, added once to a rat's velocity like a launch. */
    pressure?: PressureState;
    /** Pickup sites currently available to claim; absent entries are active elsewhere or claimed. */
    pickups?: PickupState[];
    /** Living timed effects by player id. */
    buffs?: BuffMap;
    possession: Record<string, number>;
    corpses: CorpseState[];
    shots: ChaosShot[];
    impacts: ChaosImpact[];
    notice: { serial: number; text: string };
}
export type ChaosPlayer = PlayerData;
