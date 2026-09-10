import type { Vec3Data } from './networkProtocol';
import { LANDMARK_INTERIORS } from './landmarkLayout';

export const ASSIGNMENT_IDS = ['closing-time', 'chain-of-custody', 'excessive-force'] as const;
export type AssignmentId = typeof ASSIGNMENT_IDS[number];
export const ASSIGNMENT_TUNING = { processingMs: 120_000, caseKillTarget: 10, briefingMs: 2_400 } as const;
export const ASSIGNMENTS = {
    'closing-time': { title: 'CLOSING TIME', rule: 'HOLD THE CASE AT ZERO. STEAL IT TO STEAL THE WIN.', flavor: 'Whoever signs last gets the commendation.' },
    'chain-of-custody': { title: 'CHAIN OF CUSTODY', rule: 'TAKE THE CASE INSIDE THE YELLOW LANDMARK. VISIT ALL SIX TO WIN.', flavor: 'Previous investigators need not be acknowledged.' },
    'excessive-force': { title: 'EXCESSIVE FORCE', rule: 'HOLD THE CASE. GET 10 KILLS.', flavor: 'Disproportionate response. Impeccable paperwork.' },
} satisfies Record<AssignmentId, { title: string; rule: string; flavor: string }>;

/** Entire playable interiors are checkpoints. Approach points only help bots
 * navigate existing openings; they never narrow where human entry counts. */
const interior=(id:string)=>LANDMARK_INTERIORS.find(h=>h.id===id)!;
function building(id:string,label:string,approach:Vec3Data,arrival:Vec3Data){
    const h=interior(id);
    return {label,short:label,center:{x:h.cx,y:12,z:h.cz},
        bounds:{xmin:h.cx-h.w/2,xmax:h.cx+h.w/2,ymin:-.5,ymax:24,zmin:h.cz-h.d/2,zmax:h.cz+h.d/2},approach,arrival};
}
export const ASSIGNMENT_DESTINATIONS = {
    icebox:building('icebox','ICEBOX',{x:130,y:.3,z:-26},{x:130,y:.3,z:-35}),
    maintenance:{label:'SEWER MAINTENANCE',short:'MAINTENANCE',center:{x:65,y:-4,z:-36},
        bounds:{xmin:60,xmax:70,ymin:-7.5,ymax:-1,zmin:-42,zmax:-30},approach:{x:55,y:-6.7,z:-36},arrival:{x:64,y:-6.7,z:-36}},
    pump:building('pump','PUMP STATION',{x:125,y:.3,z:142},{x:125,y:.3,z:133}),
    needleworks:building('needleworks','NEEDLEWORKS',{x:-105,y:.3,z:113},{x:-105,y:.3,z:104}),
    sluice:{label:'WEST SLUICE',short:'WEST SLUICE',center:{x:-137,y:12,z:0},
        bounds:{xmin:-146,xmax:-128,ymin:-.5,ymax:24,zmin:-32,zmax:32},approach:{x:-123,y:.3,z:8},arrival:{x:-133,y:.3,z:8}},
    records:building('records','RECORDS BUREAU',{x:-16,y:.3,z:-32},{x:-16,y:.3,z:-41}),
} as const;
export type DestinationId = keyof typeof ASSIGNMENT_DESTINATIONS;
export type AssignmentDestination = typeof ASSIGNMENT_DESTINATIONS[DestinationId];
/** Eligible landmark inventory; the actual match route is shuffled and stored. */
export const CHAIN_ROUTE: readonly DestinationId[] = ['icebox','maintenance','pump','needleworks','sluice','records'];

export function destinationContains(id:DestinationId,p:Vec3Data):boolean {
    const b=ASSIGNMENT_DESTINATIONS[id].bounds;
    return [p.x,p.y,p.z].every(Number.isFinite)&&p.x>b.xmin&&p.x<b.xmax&&p.y>=b.ymin&&p.y<b.ymax&&p.z>b.zmin&&p.z<b.zmax;
}

export interface AssignmentResult {
    winnerId: string;
    winnerName: string;
    at: number;
    method: 'held' | 'carried' | 'kills';
    posthumous: boolean;
}
export interface AssignmentState {
    roundId: string;
    id: AssignmentId;
    phase: 'briefing' | 'active' | 'suspended' | 'closed';
    revealedAt: number;
    liveAt: number;
    remainingMs: number;
    stamps: number;
    destinations: DestinationId[];
    caseKills: Record<string, number>;
    revision: number;
    result?: AssignmentResult;
}
export interface AssignmentRotation {
    remaining: AssignmentId[];
    last?: AssignmentId;
    forced?: AssignmentId;
}
export const isAssignmentId = (id: unknown): id is AssignmentId => ASSIGNMENT_IDS.some(value => value === id);

/** A revealed assignment is consumed immediately, including abandoned matches. */
export function nextAssignment(rotation: AssignmentRotation, random = Math.random): AssignmentId {
    if (rotation.forced) { rotation.last = rotation.forced; return rotation.forced; }
    if (!rotation.remaining.length) {
        const bag: AssignmentId[] = [...ASSIGNMENT_IDS];
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.min(i, Math.floor(random() * (i + 1)));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (bag[0] === rotation.last) [bag[0], bag[1]] = [bag[1], bag[0]];
        rotation.remaining = bag;
    }
    const id = rotation.remaining.shift()!;
    rotation.last = id;
    return id;
}
/** Fisher–Yates runs only when the server creates a match. Snapshots and storage
 * carry the resulting order unchanged, including the randomly selected last stop. */
export function shuffledChainRoute(random = Math.random): DestinationId[] {
    const route = [...CHAIN_ROUTE];
    for (let i = route.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
        [route[i], route[j]] = [route[j], route[i]];
    }
    return route;
}
export function createAssignment(id: AssignmentId, now: number, roundId: string = crypto.randomUUID(), random = Math.random): AssignmentState {
    return { roundId, id, phase: 'briefing', revealedAt: now, liveAt: now + ASSIGNMENT_TUNING.briefingMs,
        remainingMs: id === 'closing-time' ? ASSIGNMENT_TUNING.processingMs : 0, stamps: 0,
        destinations: id === 'chain-of-custody' ? shuffledChainRoute(random) : [],
        caseKills: {}, revision: 0 };
}
export function activeDestination(state: AssignmentState): DestinationId | undefined {
    return state.destinations[state.id === 'chain-of-custody' ? state.stamps : 0];
}
export function destinationPoint(id:DestinationId,outside=true):Vec3Data {
    return {...(outside?ASSIGNMENT_DESTINATIONS[id].approach:ASSIGNMENT_DESTINATIONS[id].arrival)};
}

/** Strict shared decoding also protects persisted objective state. */
export function parseAssignment(value: unknown): AssignmentState | null {
    if (!value || typeof value !== 'object') return null;
    const a = value as Record<string, unknown>;
    const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
    const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    if (!str(a.roundId, 64) || !isAssignmentId(a.id) || !['briefing', 'active', 'suspended', 'closed'].includes(String(a.phase)) ||
        !number(a.revealedAt) || !number(a.liveAt) || a.liveAt < a.revealedAt ||
        !number(a.remainingMs) || a.remainingMs > ASSIGNMENT_TUNING.processingMs ||
        !Number.isSafeInteger(a.stamps) || Number(a.stamps) < 0 || Number(a.stamps) > CHAIN_ROUTE.length ||
        !Number.isSafeInteger(a.revision) || Number(a.revision) < 0 ||
        !a.caseKills || typeof a.caseKills !== 'object' || Array.isArray(a.caseKills) || !Array.isArray(a.destinations)) return null;
    const expected = a.id === 'chain-of-custody' ? CHAIN_ROUTE : [];
    if (a.destinations.length !== expected.length || new Set(a.destinations).size !== expected.length || a.destinations.some(id => !expected.includes(id)) ||
        (a.id !== 'closing-time' && a.remainingMs !== 0) || (a.id !== 'chain-of-custody' && a.stamps !== 0) ||
        (a.id !== 'excessive-force' && Object.keys(a.caseKills).length !== 0)) return null;
    const entries = Object.entries(a.caseKills);
    if (entries.length > 100 || entries.some(([id, points]) => !str(id, 64) ||
        !Number.isSafeInteger(points) || points < 1 || points > ASSIGNMENT_TUNING.caseKillTarget)) return null;
    const caseKills = Object.fromEntries(entries) as Record<string, number>;
    let result: AssignmentResult | undefined;
    if (a.result !== undefined) {
        if (!a.result || typeof a.result !== 'object') return null;
        const r = a.result as Record<string, unknown>;
        if (!str(r.winnerId, 64) || !str(r.winnerName, 32) || !number(r.at) || r.at < a.liveAt ||
            !['held', 'carried', 'kills'].includes(String(r.method)) || typeof r.posthumous !== 'boolean') return null;
        if (a.id === 'closing-time' ? r.method !== 'held' || a.remainingMs !== 0 :
            a.id === 'chain-of-custody' ? r.method !== 'carried' || a.stamps !== CHAIN_ROUTE.length : r.method !== 'kills' || caseKills[r.winnerId] !== ASSIGNMENT_TUNING.caseKillTarget) return null;
        if (r.posthumous) return null;
        result = { winnerId: r.winnerId, winnerName: r.winnerName, at: r.at, method: r.method as AssignmentResult['method'], posthumous: r.posthumous };
    }
    if (a.id==='chain-of-custody'&&a.stamps===CHAIN_ROUTE.length&&!result)return null;
    if ((a.phase === 'closed') !== !!result || entries.some(([id, points]) => points === ASSIGNMENT_TUNING.caseKillTarget && id !== result?.winnerId)) return null;
    return { roundId: a.roundId, id: a.id, phase: a.phase as AssignmentState['phase'], revealedAt: a.revealedAt,
        liveAt: a.liveAt, remainingMs: a.remainingMs, stamps: Number(a.stamps), destinations: [...a.destinations],
        caseKills, revision: Number(a.revision), ...(result ? { result } : {}) };
}

/** Storage-only upgrade from the superseded private assignment prototype.
 * Network decoding stays strict: old clients must reconnect with protocol 4. */
export function restoreAssignment(value:unknown, now:number):AssignmentState|null {
    const current=parseAssignment(value);if(current)return current;
    if(!value||typeof value!=='object')return null;
    const old=value as Record<string,unknown>;
    if(old.id==='chain-of-custody'&&Array.isArray(old.destinations)&&old.destinations.includes('icebox-check'))return createAssignment('chain-of-custody',now);
    if('caseKills' in old||!('claimant' in old))return null;
    if(old.id==='misfiled-evidence')return createAssignment('excessive-force',now);
    if(old.id!=='closing-time'&&old.id!=='chain-of-custody')return null;
    const remaining=old.remainingMs;
    if(typeof remaining!=='number'||!Number.isFinite(remaining)||remaining<0||remaining>45_000)return null;
    return parseAssignment({...old,caseKills:{},remainingMs:old.id==='closing-time'&&old.phase!=='closed'?remaining+75_000:remaining});
}
