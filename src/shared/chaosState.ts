import type { EnvironmentCause, PlayerData, QuatData, RatAppearance, Vec3Data } from './networkProtocol';
import type { IncidentId } from './incidentCatalog';
import type { BadRound } from './shotBallistics';
import type { AssignmentState } from './assignments';
import type { WorldFoleyCue } from './foleyEvents';
import type { BuffMap, PickupKind, PickupState } from './pickups';
import { DOCKS_JOBS } from './city/kit/parts/docks';
import { PRECINCT_JOBS } from './city/kit/parts/precinct';

export const CHAOS_TUNING = {
    pickupRadius: 2.25, formerCarrierDelay: 900,
    /** A shot case's kick, lift and speed cap: 20% under the original 30, 10 and 48 (Tyler, 1 October: everyone shot the
     * case away from everyone else, so nobody could get it). */
    caseShotKick: 24, caseShotLift: 8, caseShotMaxSpeed: 38.4, casePickupMaxSpeed: 18,
    /** Grip (Tyler, 1 October): a carried case is knocked loose by `caseGripHits` enemy balls, each within
     * `caseGripMs` of the last; after `caseGripMs` without a hit the grip is whole again. Killing the carrier still drops it. */
    caseGripHits: 3, caseGripMs: 2000,
    /** The hot case's heartbeat (Tyler, 2 October): a carried case is hidden from rats that cannot see it, except that it
     * pings once when taken and then every `casePingMs` while carried (`CaseState.ping`), the whole carrier flashing red
     * through walls. */
    casePingMs: 4000,
    /** The case carrier's hits deal this many times their damage in every assignment, and any kill it makes heals it to full. */
    carrierDamage: 2,
    /** The quiet stretch between incidents was 21 s until the four-human playtest ("too chaotic"; protocol 28). */
    rollMs: 2400, activeMs: 25000, cooldownMs: 40000,
    corpseSpeed: 95, normalCorpseSpeed: 32, corpseMs: 10000, maxCorpses: 16,
    corpseHitMinSpeed: 12, corpseHitCooldownMs: 700, corpseShotKick: 19, deathBurstBalls: 120,
    maxShots: 256, recoverMs: 900, stuckMs: 18000,
} as const;
export const INCIDENT_TUNING = {
    /** Scattershot: each ball that lands on a rat shoves it `scatterShove` u/s along the shot and `scatterLift` up.
     * A shove (any cause) sums within a step up to `shoveMax` u/s sideways. */
    scatterShove: 22, scatterLift: 9, shoveMax: 60,
    /** Most Wanted: how often (ms) the searchlight looks again for whoever is winning. */
    wantedEveryMs: 1000,
    caseMissileSpeed: 145, caseShotSpeed: 160, caseMissileLift: 6, caseEjectSpeed: 22,
    caseRicochetMinSpeed: 140, caseBounceLift: 7, caseMaxLift: 10,
    /** Code Violation (Tyler, 1 October: "every machine in the city misbehaves", and "no one should die from code
     * violation"). Every supply kit hops `violationHop` units away from a rat within `violationScare`, at most every
     * `violationHopMs`, within `violationLeash` of home; Quick Fix is harder to catch ("a little bit harder"): it scares at
     * `violationFixScare`, hops `violationFixHop` every `violationFixHopMs`, within `violationFixLeash`. Claims of every
     * other kind come out faulty (`FAULTY_KINDS`). Each launch machine fills itself to bursting every `violationMachineMs`
     * (a random span), its blast shoving rats within `violationFling` of the pad. Each `violationClangMs` an alarm pillar
     * near a rat clangs, shoving rats within `violationClang` of it. Shoves: `violationShove` u/s out, `violationLift` up,
     * only where the landing is safe. */
    violationScare: 7, violationHop: 5, violationHopMs: 650, violationLeash: 12,
    violationFixScare: 10, violationFixHop: 7, violationFixHopMs: 480, violationFixLeash: 16,
    violationMachineMs: [3500,7500] as const, violationFling: 11, violationClangMs: [1800,4200] as const, violationClang: 7,
    violationShove: 26, violationLift: 13,
} as const;
/** Crossfire (Tyler, 2 October). Fired like any ball; at its first real world bounce it catches fire all at once
 * ("the player only really sees the first bank off the wall"; three escalating steps to 717 u/s were "too fast … don't
 * make it feel like the laser"): heat `maxHeat` (1), it leaves the wall `speedUp`× as fast (350 u/s) and lives `life`
 * s longer (at most `maxLife`), then keeps its speed off every later wall. It deals ordinary damage (no one-shot kill since 2 October); the
 * kill reports its world bounces (counted to `maxBounces`) and its path: the muzzle, its first `pathPoints` bounces
 * and the hit. */
export const CROSSFIRE = { maxHeat: 1, speedUp: 2, life: .5, maxLife: 2.5, pathPoints: 6, maxBounces: 99 } as const;
export const CASE_HOME = { x: -16, y: 1.3, z: -28 };
export const CASE_LOOSE_SCALE = 2;
// Street-level frontages distributed around the city, and the north's slots from its kit
// parts; the simulation verifies floor support and clearance against the actual collision boxes.
export const CASE_SPAWNS = [CASE_HOME,
    {x:22,y:1.3,z:-28},{x:82,y:1.3,z:-24},{x:-55,y:1.3,z:25},
    {x:-166,y:1.3,z:35},{x:130,y:1.3,z:-24},{x:15,y:1.3,z:135},
    {x:-75,y:1.3,z:-87},{x:77,y:1.3,z:75},{x:-105,y:1.3,z:120},
    {x:46,y:1.3,z:53},{x:138,y:1.3,z:135},
    {x:-9.8,y:1.3,z:-28},{x:115,y:1.3,z:-22},{x:-110,y:1.3,z:118},
    {x:145,y:1.3,z:128},{x:-150,y:1.3,z:17},
    {x:0,y:-5.7,z:0},{x:-84,y:-5.7,z:0},{x:48,y:-5.7,z:0},
    // Gate Lane, south of its zone.
    {x:-137,y:1.3,z:-40},
    ...DOCKS_JOBS.caseSpawns,...PRECINCT_JOBS.caseSpawns,
] as const;
export const CASE_SIZE = { x: .82, y: .62, z: .34 };
// Hang from the unused hand, with the broad face running along the rat's side.
export const CASE_HAND = { x: .74, y: .52, z: .02 };
export const CASE_CARRY_ROTATION = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
/** Street alarm pillars. Every pillar shares the one incident lifecycle. `y` is
 * the ground under it, `bell` the bell's centre height above that ground, `face`
 * the call box's yaw (radians, 0 faces +z). `box` is the iron post and call box;
 * `target` is the bell and its housing, a cube shootable from any side. */
export const DISPATCH_STATIONS = [
    // Street corners at each landmark, the central crossroads, the north avenue and the south
    // avenue, one in the sewer, one on the quay and one upstairs in the precinct's radio room.
    { id:'records', x:-45, z:-28, face:-.98 }, { id:'icebox', x:99, z:-28, face:-.73 },
    { id:'needleworks', x:-121, z:122, face:0 }, { id:'pump', x:97, z:139, face:-.86 },
    { id:'gate', x:-155, z:-7, face:-2.4 }, { id:'crossroads', x:60, z:-27.5, face:.81 },
    { id:'avenue-east', x:79, z:-93, face:-2.36 }, { id:'avenue-west', x:-68, z:-93, face:2.42 },
    { id:'sewer', x:0, y:-7, z:40, bell:4.6, face:-1.57 },
    { id:'south-avenue', x:28, z:126, face:0 },
    DOCKS_JOBS.dispatch, PRECINCT_JOBS.dispatch,
].map(({id,x,y=0,z,bell=5.4,face=0}:{id:string;x:number;y?:number;z:number;bell?:number;face?:number})=>({id,x,y,z,bell,face,
    box:{x,y:y+(bell-1.3)/2,z,w:1.1,h:bell-1.3,d:1.1},
    target:{x,y:y+bell,z,w:2.6,h:2.6,d:2.6},
}));
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
export interface ChaosShot { id: string; owner: string | null; p: Vec3Data; v: Vec3Data; age: number; wallBounced?: boolean;
    /** Seconds this ball lives when Crossfire or Bad Ammunition extended it; absent is the ordinary lifetime. */
    life?: number;
    /** Crossfire: how hot its world bounces made this ball (1 to `CROSSFIRE.maxHeat`); absent while cold. */
    heat?: number;
    /** Bad Ammunition: this ball's personality and the unit aim its path keeps to (`steerQuirk`). A path personality
     * ends at the ball's first contact; a superball keeps bouncing. Authority and local prediction only; not on the wire. */
    quirk?: BadRound; aim?: Vec3Data;
    /** Neutral debris that kills nobody's victim: the environmental cause its deaths report. Authority-only. */
    cause?: EnvironmentCause;
    /** Authoritative explosion provenance, retained in storage. Network visual
     * snapshots omit it: clients never decide projectile damage eligibility. */
    explosive?: true;
}
/** `bounces`: a Crossfire world bounce, this ball's world bounces so far including this one (to `CROSSFIRE.maxBounces`). */
export interface ChaosImpact { p: Vec3Data; n: Vec3Data; surface: boolean; scale?: number; cue?: 'thud'|'buzz'|'case-hit'|'armor-clang'; foley?:WorldFoleyCue; energy?:number; audioOnly?:boolean; bounces?:number }
export interface CaseState extends PhysicalPose {
    owner:string|null; previousOwner:string|null; pickupAfter:number; returningUntil:number; missileOwner?:string;
    /** Hits the carrier's grip has taken (1 or 2; absent when whole). Each is within `caseGripMs` of the last. */
    grip?: number;
    /** The latest heartbeat ping while carried: when (server time) and where the case was. Absent when loose. */
    ping?: { at:number; p:Vec3Data };
}
export const EXTRA_CASE_IDS = ['evidence-1','evidence-2','evidence-3','evidence-4','evidence-5','evidence-6','evidence-7'] as const;
/** A short-thrown Mousetrap (`flight` is current velocity; absent once `landedAt` is set). `shotId` merges prediction.
 * Only landed traps catch rats. A set Mousetrap (`WEAPON_TUNING`): holds any other rat that steps on it in place for `trapHoldMs`. `hp` ball hits
 * left; `at` when set; `snapAt` its latest catch (shut while it holds, it re-arms `trapRearmMs` after letting go); `hitAt`
 * the latest hit it took; `brokenAt` when it was destroyed (inert, kept `trapBrokenMs` so clients can play the break). At most one per rat. */
export interface TrapState { id:string; owner:string; x:number; y:number; z:number; yaw:number; hp:number; at:number; shotId?:string; held?:string; flight?:Vec3Data; flightAge?:number; landedAt?:number; snapAt?:number; hitAt?:number; brokenAt?:number }
export const MAX_TRAPS = 16;
/** What a laser beam struck at a point. */
export const LASER_SURFACES = ['world','armor','rat','head','trap','case','trigger','corpse'] as const;
export type LaserSurface = typeof LASER_SURFACES[number];
/** A laser shot (`id` is its shot id): `points[0]` is the muzzle, then each reflection (`on` 'world' or 'armor')
 * and the end, where `on` names what stopped it (absent: it ran out of range in the air). Kept `laserBeamMs`. */
export interface LaserBeam { id:string; owner:string; at:number; points:Array<Vec3Data&{on?:LaserSurface}> }
export const MAX_BEAMS = 16;
export interface ChaosState {
    time: number;
    /** Monotonic simulation identity for time-aligned interactions. Optional only
     * while restoring pre-protocol-15 checkpoints and older test fixtures. */
    epoch?: string;
    tick?: number;
    assignment?: AssignmentState;
    case: CaseState;
    extraCases?: Array<CaseState & {id:string}>;
    /** `wanted`: Most Wanted's current target, whoever is winning, in the searchlight. `bounty`: the latest
     * Most Wanted takedown (`hunter` took down `target` at `at` and was handed `pickup`). `caller`: the rat whose
     * shot started the current roll; kept through rolling, active and cooldown, cleared at ready. */
    dispatch: { phase: DispatchPhase; started: number; until: number; serial: number; incident?:IncidentId; wanted?:string;
        bounty?:{hunter:string;target:string;at:number;pickup:PickupKind}; caller?:string };
    /** Launchers; `shoves` are knockbacks (landing shockwaves, Scattershot hits, …; `ChaosSimulation.shove`),
     * added once to a rat's velocity. */
    pressure?: PressureState;
    /** Pickup sites currently available to claim; absent entries are active elsewhere or claimed. */
    pickups?: PickupState[];
    /** Living timed effects and held weapons by player id. */
    buffs?: BuffMap;
    /** Set Mousetraps. */
    traps?: TrapState[];
    /** Recent laser beams, newest last. */
    beams?: LaserBeam[];
    possession: Record<string, number>;
    corpses: CorpseState[];
    shots: ChaosShot[];
    impacts: ChaosImpact[];
    notice: { serial: number; text: string };
}
export type ChaosPlayer = PlayerData;
