import type { PlayerData, QuatData, RatAppearance, Vec3Data } from './networkProtocol';
import type { IncidentId } from './incidentCatalog';

export const CHAOS_TUNING = {
    pickupRadius: 1.6, formerCarrierDelay: 900,
    rollMs: 2400, activeMs: 25000, cooldownMs: 16000,
    corpseSpeed: 95, normalCorpseSpeed: 32, corpseMs: 10000, maxCorpses: 16,
    corpseHitMinSpeed: 12, corpseHitCooldownMs: 700, corpseShotKick: 19, deathBurstBalls: 120,
    maxShots: 256, recoverMs: 900, stuckMs: 18000,
} as const;
export const CASE_HOME = { x: -16, y: 1.3, z: -28 };
export const CASE_LOOSE_SCALE = 2;
// Street-level frontages distributed around the city; the simulation verifies
// floor support and clearance against the current world's actual collision boxes.
export const CASE_SPAWNS = [CASE_HOME,
    {x:22,y:1.3,z:-28},{x:82,y:1.3,z:-24},{x:-55,y:1.3,z:25},
    {x:-166,y:1.3,z:35},{x:130,y:1.3,z:-24},{x:15,y:1.3,z:135},
    {x:-75,y:1.3,z:-87},{x:77,y:1.3,z:75},{x:-105,y:1.3,z:120},
    {x:46,y:1.3,z:53},{x:138,y:1.3,z:135},
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
    box: { x:number; y:number; z:number; w:number; h:number; d:number };
    target: { x:number; y:number; z:number; w:number; h:number; d:number };
    velocity: Vec3Data; cooldownMs:number; eventMs:number;
}
// Each public street trigger is the nearest trigger to its own launcher, while
// remaining separated from the pad and other controls. The red crown is exposed on every side.
export const LAUNCH_MACHINES: readonly LaunchMachine[] = [
    { id:'pressure', kind:'pressure', x:146, z:149, tx:90, tz:145, velocity:{x:-35,y:52,z:-28} },
    { id:'dumpster', kind:'dumpster', x:-57, z:-29, tx:-60, tz:-70, velocity:{x:48,y:35,z:28} },
    { id:'freight', kind:'freight', x:130, z:-20, tx:155, tz:10, velocity:{x:-72,y:24,z:4} },
    { id:'geyser', kind:'geyser', x:-153, z:15, tx:-155, tz:-25, velocity:{x:9,y:68,z:5} },
    { id:'mousetrap', kind:'mousetrap', x:-106, z:128, tx:-60, tz:140, velocity:{x:38,y:56,z:-34} },
    { id:'fan', kind:'fan', x:75, z:39, tx:35, tz:25, velocity:{x:-68,y:32,z:-24} },
].map(m=>({id:m.id,kind:m.kind as LaunchMachineKind,
    label:({pressure:'PRESSURE WORKS',dumpster:'TRASH COMPACTOR',freight:'FREIGHT RAM',geyser:'SEWER GEYSER',mousetrap:'RAT TRAP',fan:'WIND TUNNEL'} as Record<string,string>)[m.id],
    pad:{x:m.x,y:0,z:m.z,radius:5},
    box:{x:m.tx,y:1.6,z:m.tz,w:1.7,h:3.2,d:1.7},
    target:{x:m.tx,y:3.75,z:m.tz,w:1.4,h:1.1,d:1.4},
    velocity:m.velocity,cooldownMs:5000,eventMs:1500,
}));
// Preserve the existing preview bookmark and legacy snapshot field.
export const PRESSURE_LAUNCH = LAUNCH_MACHINES[0];
export const MAX_LAUNCH_EVENTS = 24;
export const MAX_LAUNCH_SPEED = 80;
export interface PressureLaunchEvent { id:string; playerId:string; at:number; velocity:Vec3Data; machineId?:string }
export type DispatchPhase = 'ready' | 'rolling' | 'active' | 'cooldown';
export interface PhysicalPose { p: Vec3Data; q: QuatData; v: Vec3Data; spin: Vec3Data }
export interface CorpseState extends PhysicalPose {
    id: string; victimId: string; owner?: string; appearance: RatAppearance; born: number; expires: number;
}
export interface ChaosShot { id: string; owner: string; p: Vec3Data; v: Vec3Data; age: number; wallBounced?: boolean; returned?: boolean }
export interface ChaosImpact { p: Vec3Data; n: Vec3Data; surface: boolean }
export interface CaseState extends PhysicalPose {
    owner:string|null; previousOwner:string|null; pickupAfter:number; returningUntil:number; missileOwner?:string;
}
export const EXTRA_CASE_IDS = ['evidence-1','evidence-2','evidence-3'] as const;
export interface ChaosState {
    time: number;
    case: CaseState;
    extraCases?: Array<CaseState & {id:string}>;
    dispatch: { phase: DispatchPhase; started: number; until: number; serial: number; incident?:IncidentId };
    pressure?: { serial:number; until:number; cooldowns?:Record<string,number>; launches:PressureLaunchEvent[] };
    possession: Record<string, number>;
    corpses: CorpseState[];
    shots: ChaosShot[];
    impacts: ChaosImpact[];
    notice: { serial: number; text: string };
}
export type ChaosPlayer = PlayerData;
