import type { Vec3Data } from './networkProtocol';
import { createJurisdiction, parseJurisdiction, JURISDICTION_TUNING, type JurisdictionState } from './jurisdiction';
import { LANDMARK_INTERIORS } from './landmarkLayout';

export const ASSIGNMENT_IDS = ['closing-time', 'chain-of-custody', 'excessive-force', 'jurisdiction'] as const;
export type AssignmentId = typeof ASSIGNMENT_IDS[number];
export const ASSIGNMENT_TUNING = { processingMs: 120_000, caseKillTarget: 10, deliveryTarget: 3, briefingMs: 2_400 } as const;
export const ASSIGNMENTS = {
    jurisdiction: {title:'JURISDICTION',rule:'HOLD THE CASE IN THE ZONE. FIRST TO 60 WINS.',flavor:'Your jurisdiction. Their problem.'},
    'closing-time': { title: 'CLOSING TIME', rule: 'HOLD THE CASE AT ZERO. STEAL IT TO STEAL THE WIN.', flavor: 'Whoever signs last gets the commendation.' },
    'chain-of-custody': { title: 'PAPER CHASE', rule: 'Deliver the paperwork. First to three wins.', flavor: 'Previous investigators need not be acknowledged.' },
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
    method: 'held' | 'carried' | 'kills' | 'zone-held';
    posthumous: boolean;
}
export interface AssignmentState {
    roundId: string;
    id: AssignmentId;
    phase: 'briefing' | 'active' | 'suspended' | 'closed';
    revealedAt: number;
    liveAt: number;
    remainingMs: number;
    deliverySerial: number;
    destinations: DestinationId[];
    deliveries: Record<string, number>;
    lastDelivery?: { playerId: string; playerName: string; at: number };
    caseKills: Record<string, number>;
    revision: number;
    result?: AssignmentResult;
    jurisdiction?: JurisdictionState;
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
/** The server shuffles at match start and after exhausting each landmark cycle.
 * Snapshots and storage carry that order; the previous stop cannot repeat. */
export function shuffledChainRoute(random = Math.random, previous?: DestinationId): DestinationId[] {
    const route = [...CHAIN_ROUTE];
    for (let i = route.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
        [route[i], route[j]] = [route[j], route[i]];
    }
    if(route[0]===previous)[route[0],route[1]]=[route[1],route[0]];
    return route;
}
export function createAssignment(id: AssignmentId, now: number, roundId: string = crypto.randomUUID(), random = Math.random): AssignmentState {
    return { roundId, id, phase: 'briefing', revealedAt: now, liveAt: now + ASSIGNMENT_TUNING.briefingMs,
        remainingMs: id === 'closing-time' ? ASSIGNMENT_TUNING.processingMs : 0, deliverySerial: 0, deliveries: {},
        destinations: id === 'chain-of-custody' ? shuffledChainRoute(random) : [],
        caseKills: {}, revision: 0, ...(id==='jurisdiction'?{jurisdiction:createJurisdiction(random)}:{}) };
}
export function activeDestination(state: AssignmentState): DestinationId | undefined {
    return state.id==='chain-of-custody'?state.destinations[state.deliverySerial % state.destinations.length]:undefined;
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
        !Number.isSafeInteger(a.deliverySerial) || Number(a.deliverySerial) < 0 ||
        !Number.isSafeInteger(a.revision) || Number(a.revision) < 0 ||
        !a.caseKills || typeof a.caseKills !== 'object' || Array.isArray(a.caseKills) || !Array.isArray(a.destinations) ||
        !a.deliveries || typeof a.deliveries !== 'object' || Array.isArray(a.deliveries)) return null;
    const expected = a.id === 'chain-of-custody' ? CHAIN_ROUTE : [];
    if (a.destinations.length !== expected.length || new Set(a.destinations).size !== expected.length || a.destinations.some(id => !expected.includes(id)) ||
        (a.id !== 'closing-time' && a.remainingMs !== 0) || (a.id !== 'chain-of-custody' && (a.deliverySerial !== 0 || Object.keys(a.deliveries).length!==0 || a.lastDelivery!==undefined)) ||
        (a.id !== 'excessive-force' && Object.keys(a.caseKills).length !== 0)) return null;
    const entries = Object.entries(a.caseKills);
    if (entries.length > 100 || entries.some(([id, points]) => !str(id, 64) ||
        !Number.isSafeInteger(points) || points < 1 || points > ASSIGNMENT_TUNING.caseKillTarget)) return null;
    const caseKills = Object.fromEntries(entries) as Record<string, number>;
    const deliveriesEntries=Object.entries(a.deliveries);
    if(deliveriesEntries.length>100||deliveriesEntries.some(([id,points])=>!str(id,64)||!Number.isSafeInteger(points)||points<1||points>ASSIGNMENT_TUNING.deliveryTarget))return null;
    const deliveries=Object.fromEntries(deliveriesEntries) as Record<string,number>;
    if(Object.values(deliveries).reduce((sum,n)=>sum+n,0)>Number(a.deliverySerial))return null;
    let lastDelivery:AssignmentState['lastDelivery'];
    if(a.lastDelivery!==undefined){
        if(!a.lastDelivery||typeof a.lastDelivery!=='object'||a.deliverySerial===0)return null;
        const d=a.lastDelivery as Record<string,unknown>;
        if(!str(d.playerId,64)||!str(d.playerName,32)||!number(d.at)||d.at<a.liveAt)return null;
        lastDelivery={playerId:d.playerId,playerName:d.playerName,at:d.at};
    }
    const jurisdiction=a.id==='jurisdiction'?parseJurisdiction(a.jurisdiction):undefined;
    if(a.id==='jurisdiction'?!jurisdiction:a.jurisdiction!==undefined)return null;
    if(jurisdiction&&a.phase!=='active'&&jurisdiction.scorerId!==null)return null;
    let result: AssignmentResult | undefined;
    if (a.result !== undefined) {
        if (!a.result || typeof a.result !== 'object') return null;
        const r = a.result as Record<string, unknown>;
        if (!str(r.winnerId, 64) || !str(r.winnerName, 32) || !number(r.at) || r.at < a.liveAt ||
            !['held', 'carried', 'kills', 'zone-held'].includes(String(r.method)) || typeof r.posthumous !== 'boolean') return null;
        if (a.id === 'closing-time' ? r.method !== 'held' || a.remainingMs !== 0 :
            a.id === 'jurisdiction' ? r.method!=='zone-held'||jurisdiction?.heldMs[r.winnerId]!==JURISDICTION_TUNING.targetMs :
            a.id === 'chain-of-custody' ? r.method !== 'carried' || deliveries[r.winnerId] !== ASSIGNMENT_TUNING.deliveryTarget : r.method !== 'kills' || caseKills[r.winnerId] !== ASSIGNMENT_TUNING.caseKillTarget) return null;
        if (r.posthumous) return null;
        result = { winnerId: r.winnerId, winnerName: r.winnerName, at: r.at, method: r.method as AssignmentResult['method'], posthumous: r.posthumous };
    }
    if(jurisdiction&&Object.entries(jurisdiction.heldMs).some(([id,ms])=>ms===JURISDICTION_TUNING.targetMs&&id!==result?.winnerId))return null;
    if(deliveriesEntries.some(([id,points])=>points===ASSIGNMENT_TUNING.deliveryTarget&&id!==result?.winnerId))return null;
    if ((a.phase === 'closed') !== !!result || entries.some(([id, points]) => points === ASSIGNMENT_TUNING.caseKillTarget && id !== result?.winnerId)) return null;
    return { roundId: a.roundId, id: a.id, phase: a.phase as AssignmentState['phase'], revealedAt: a.revealedAt,
        liveAt: a.liveAt, remainingMs: a.remainingMs, deliverySerial: Number(a.deliverySerial), destinations: [...a.destinations],
        deliveries, ...(jurisdiction?{jurisdiction}:{}), ...(lastDelivery?{lastDelivery}:{}), caseKills, revision: Number(a.revision), ...(result ? { result } : {}) };
}

/** Storage-only upgrade from the superseded private assignment prototype.
 * Shared stamps cannot become personal credit. Old Chain rounds restart;
 * other modes preserve their accumulated progress. Network uses protocol 5. */
export function restoreAssignment(value:unknown, now:number):AssignmentState|null {
    const current=parseAssignment(value);if(current)return current;
    if(!value||typeof value!=='object')return null;
    const old=value as Record<string,unknown>;
    if('stamps' in old&&'caseKills' in old){
        if(old.id==='chain-of-custody')return createAssignment('chain-of-custody',now);
        return parseAssignment({...old,deliverySerial:0,deliveries:{}});
    }
    if(old.id==='chain-of-custody'&&Array.isArray(old.destinations)&&old.destinations.includes('icebox-check'))return createAssignment('chain-of-custody',now);
    if('caseKills' in old||!('claimant' in old))return null;
    if(old.id==='misfiled-evidence')return createAssignment('excessive-force',now);
    if(old.id!=='closing-time'&&old.id!=='chain-of-custody')return null;
    const remaining=old.remainingMs;
    if(typeof remaining!=='number'||!Number.isFinite(remaining)||remaining<0||remaining>45_000)return null;
    return parseAssignment({...old,deliverySerial:0,deliveries:{},caseKills:{},remainingMs:old.id==='closing-time'&&old.phase!=='closed'?remaining+75_000:remaining});
}
