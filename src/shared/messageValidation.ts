import { isResumeToken } from './reconnect';
import {expandMovement} from './movementWire';
import {BALL_SPEED} from './ballTuning';
import {isWorldFoleyCue} from './foleyEvents';
import { sanitizeDiagnosticReport } from './diagnosticReport';
import { parseAssignment } from './assignments';
import { INCIDENTS, incidentInfo, type IncidentId } from './incidentCatalog';
import {
  MAX_HP,
  MAX_SCORE_ENTRIES,
  MAX_MOVEMENT_BATCH,
  MAX_MESSAGE_BYTES,
  MAX_SERVER_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  type ClientMessage,
  type HatTypeName,
  type PlayerData,
  type QuatData,
  type RatAppearance,
  type RoundState,
  type ScoreEntry,
  type ServerMessage,
  type Vec3Data,
  type MovementInput,
  type WorldSpec,
} from './networkProtocol';
import { CHAOS_TUNING, COUNTERFEIT_IDS, EXTRA_CASE_IDS, LAUNCH_MACHINES, MAX_LAUNCH_EVENTS, MAX_LAUNCH_SPEED, type ChaosState } from './chaosState';
import { PICKUP_ANCHORS, isPickupKind } from './pickups';
import { isSupportedWorldVersion } from './worldSpec';

const HAT_TYPES = new Set<HatTypeName>(['fedora', 'trilby', 'porkpie']);

export class ProtocolVersionError extends Error {
  readonly expected = PROTOCOL_VERSION;
  readonly received: number;

  constructor(received: number) {
    super(`Protocol version ${received} does not match ${PROTOCOL_VERSION}`);
    this.name = 'ProtocolVersionError';
    this.received = received;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const number = integer(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function nonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > maxLength) return null;
  return value;
}

function optionalString(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined) return undefined;
  return nonEmptyString(value, maxLength);
}

function parseVec3(value: unknown): Vec3Data | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function parseQuat(value: unknown): QuatData | null {
  if (!isRecord(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  const w = finiteNumber(value.w);
  if (x === null || y === null || z === null || w === null) return null;
  return { x, y, z, w };
}

function parseColor(value: unknown): number | null {
  const number = integer(value);
  if (number === null || number < 0 || number > 0xffffff) return null;
  return number;
}

function parseAppearance(value: unknown): RatAppearance | null {
  if (!isRecord(value)) return null;
  if (!HAT_TYPES.has(value.hatType as HatTypeName)) return null;
  const hatColor = parseColor(value.hatColor);
  const furColor = parseColor(value.furColor);
  const coatColor = parseColor(value.coatColor);
  const highlightColor = value.highlightColor === undefined ? undefined : parseColor(value.highlightColor);
  if (highlightColor === null) return null;
  if (hatColor === null || furColor === null || coatColor === null) return null;
  return {
    hatType: value.hatType as HatTypeName,
    hatColor,
    furColor,
    coatColor,
    ...(highlightColor === undefined ? {} : { highlightColor }),
  };
}

function parseWorld(value: unknown): WorldSpec | null {
  if (!isRecord(value)) return null;
  const seed = integer(value.seed);
  const version = integer(value.version);
  if (seed === null || version === null || seed < 0 || version < 1) return null;
  return { seed, version };
}

function parseRound(value: unknown): RoundState | null {
  if (!isRecord(value)) return null;
  if (value.phase !== 'playing' && value.phase !== 'won') return null;
  const winnerId = optionalString(value.winnerId, 64);
  const winnerName = optionalString(value.winnerName, 32);
  if (winnerId === null || winnerName === null) return null;
  const kills = value.kills === undefined ? undefined : boundedInteger(value.kills, 0, 10_000);
  const resetAt = value.resetAt === undefined ? undefined : integer(value.resetAt);
  const startedAt = value.startedAt === undefined ? undefined : integer(value.startedAt);
  if (kills === null || resetAt === null || startedAt === null) return null;
  if (value.phase === 'won' && (resetAt === undefined || !winnerName)) return null;
  const assignment=value.assignment===undefined?undefined:parseAssignment(value.assignment);
  if(assignment===null || (assignment && (value.phase==='won') !== (assignment.phase==='closed')))return null;
  if(assignment?.result && (assignment.result.winnerId!==winnerId || assignment.result.winnerName!==winnerName))return null;
  return {
    phase: value.phase,
    ...(winnerId !== undefined ? { winnerId } : {}),
    ...(winnerName !== undefined ? { winnerName } : {}),
    ...(kills !== undefined ? { kills } : {}),
    ...(resetAt !== undefined ? { resetAt } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(assignment ? { assignment } : {}),
  };
}

function parsePlayer(value: unknown): PlayerData | null {
  if (!isRecord(value)) return null;
  const appearance = parseAppearance(value);
  const id = nonEmptyString(value.id, 64);
  const name = typeof value.name === 'string' && value.name.length <= 32 ? value.name : null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  const qx = finiteNumber(value.qx);
  const qy = finiteNumber(value.qy);
  const qz = finiteNumber(value.qz);
  const qw = finiteNumber(value.qw);
  const meshQx = finiteNumber(value.meshQx);
  const meshQy = finiteNumber(value.meshQy);
  const meshQz = finiteNumber(value.meshQz);
  const meshQw = finiteNumber(value.meshQw);
  const hp = boundedInteger(value.hp, 0, MAX_HP);
  const kills = boundedInteger(value.kills, 0, 10_000);
  const deaths = boundedInteger(value.deaths, 0, 10_000);
  const respawnAt = value.respawnAt === undefined ? undefined : integer(value.respawnAt);
  if (
    !appearance ||
    !id ||
    name === null ||
    x === null ||
    y === null ||
    z === null ||
    qx === null ||
    qy === null ||
    qz === null ||
    qw === null ||
    meshQx === null ||
    meshQy === null ||
    meshQz === null ||
    meshQw === null ||
    hp === null ||
    kills === null ||
    deaths === null ||
    respawnAt === null
  ) {
    return null;
  }
  return {
    ...appearance,
    id,
    name,
    x,
    y,
    z,
    qx,
    qy,
    qz,
    qw,
    meshQx,
    meshQy,
    meshQz,
    meshQw,
    hp,
    kills,
    deaths,
    ...(respawnAt !== undefined ? { respawnAt } : {}),
  };
}

function parsePlayersRecord(value: unknown): Record<string, PlayerData> | null {
  if (!isRecord(value)) return null;
  const players: Record<string, PlayerData> = {};
  for (const [id, playerValue] of Object.entries(value)) {
    const player = parsePlayer(playerValue);
    if (!player || player.id !== id) return null;
    players[id] = player;
  }
  return players;
}

function parseScores(value: unknown): ScoreEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_SCORE_ENTRIES) return null;
  const scores: ScoreEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const id = nonEmptyString(entry.id, 64);
    const name = typeof entry.name === 'string' && entry.name.length <= 32 ? entry.name : null;
    const kills = boundedInteger(entry.kills, 0, 10_000);
    const deaths = boundedInteger(entry.deaths, 0, 10_000);
    if (!id || name === null || kills === null || deaths === null) return null;
    scores.push({ id, name, kills, deaths });
  }
  return scores;
}

function parseRaw(raw: unknown, maxBytes: number): unknown {
  if (typeof raw !== 'string') return raw;
  if (raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseShotFields(value: Record<string, unknown>): { shotId: string; origin: Vec3Data; direction: Vec3Data } | null {
  const shotId = nonEmptyString(value.shotId, 64);
  const origin = parseVec3(value.origin);
  const direction = parseVec3(value.direction);
  if (!shotId || !origin || !direction) return null;
  return { shotId, origin, direction };
}

function parseMovementInput(value:unknown):MovementInput|null {
  if(!isRecord(value))return null;
  const seq=value.seq===undefined?undefined:integer(value.seq),position=parseVec3(value.position),rotation=parseQuat(value.rotation),meshRotation=parseQuat(value.meshRotation);
  if(seq===null||seq!==undefined&&(seq<1||!Number.isSafeInteger(seq))||!position||!rotation||!meshRotation)return null;
  return{...(seq===undefined?{}:{seq}),position,rotation,meshRotation};
}

function parsePosePlayer(value: unknown): Extract<ServerMessage, { type: 'playerMoved' }>['player'] | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id, 64);
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  const qx = finiteNumber(value.qx);
  const qy = finiteNumber(value.qy);
  const qz = finiteNumber(value.qz);
  const qw = finiteNumber(value.qw);
  const meshQx = finiteNumber(value.meshQx);
  const meshQy = finiteNumber(value.meshQy);
  const meshQz = finiteNumber(value.meshQz);
  const meshQw = finiteNumber(value.meshQw);
  if (
    !id ||
    x === null ||
    y === null ||
    z === null ||
    qx === null ||
    qy === null ||
    qz === null ||
    qw === null ||
    meshQx === null ||
    meshQy === null ||
    meshQz === null ||
    meshQw === null
  ) {
    return null;
  }
  return { id, x, y, z, qx, qy, qz, qw, meshQx, meshQy, meshQz, meshQw };
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (raw instanceof ArrayBuffer) return null;
  if (typeof raw === 'string' && (raw.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES)) return null;

  const parsed = parseRaw(raw, MAX_MESSAGE_BYTES);
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;

  const message=parseClientBody(parsed);
  if(!message)return null;
  if(parsed.deliveryAck!==undefined){
    if(!isRecord(parsed.deliveryAck))return null;
    const stream=nonEmptyString(parsed.deliveryAck.stream,64),seq=integer(parsed.deliveryAck.seq);
    if(!stream||seq===null||seq<1||!Number.isSafeInteger(seq))return null;
    message.deliveryAck={stream,seq};
  }
  return message;
}
function parseClientBody(parsed:Record<string,unknown>):ClientMessage|null {
  if (parsed.type === 'diagnostics') {
    const report = sanitizeDiagnosticReport(parsed.report);
    return report ? { type: 'diagnostics', report } : null;
  }

  if (parsed.type === 'join') {
    const protocolVersion = integer(parsed.protocolVersion);
    const appearance = parseAppearance(parsed.appearance);
    if (protocolVersion === null || !appearance) return null;
    if (parsed.resumeToken !== undefined && !isResumeToken(parsed.resumeToken)) return null;
    if (typeof parsed.name !== 'string' || parsed.name.length > 32) return null;
    return {
      type: 'join',
      protocolVersion,
      name: parsed.name,
      ...(isResumeToken(parsed.resumeToken) ? {resumeToken:parsed.resumeToken} : {}),
      appearance,
    };
  }

  if (parsed.type === 'updateMovement') {
    const movement=parseMovementInput(parsed);
    return movement?{type:'updateMovement',...movement}:null;
  }

  if (parsed.type === 'shoot') {
    const shot = parseShotFields(parsed);
    if (!shot) return null;
    const viewAt=parsed.viewAt===undefined?undefined:finiteNumber(parsed.viewAt);
    const movement=parsed.movement===undefined?undefined:parseMovementInput(parsed.movement);
    if(viewAt===null||movement===null||viewAt!==undefined&&viewAt<0)return null;
    return { type: 'shoot', ...shot, ...(viewAt===undefined?{}:{viewAt}), ...(movement?{movement}:{}) };
  }

  if(parsed.type==='pickupIntent'){
    const interactionId=nonEmptyString(parsed.interactionId,64),targetId=nonEmptyString(parsed.targetId,96);
    const generation=finiteNumber(parsed.generation),movement=parseMovementInput(parsed.movement);
    if(!interactionId||!targetId||generation===null||generation<0||!movement||(parsed.target!=='case'&&parsed.target!=='pickup'))return null;
    return{type:'pickupIntent',interactionId,target:parsed.target,targetId,generation,movement};
  }

  if (parsed.type === 'hit') {
    const victimId = nonEmptyString(parsed.victimId, 64);
    const damage = boundedInteger(parsed.damage, 1, MAX_HP);
    if (!victimId || damage === null) return null;
    return { type: 'hit', victimId, damage };
  }

  if (parsed.type === 'chaosAck' || parsed.type === 'deliveryAck') {
    const stream=nonEmptyString(parsed.stream,64),seq=integer(parsed.seq);
    return stream && seq!==null && Number.isSafeInteger(seq) && seq>0 ? {type:parsed.type,stream,seq}:null;
  }

  if (parsed.type === 'ping') {
    const sentAt = integer(parsed.sentAt);
    if (sentAt === null) return null;
    return { type: 'ping', sentAt };
  }

  return null;
}

function parseChaos(value:unknown):ChaosState|null{
  if(!isRecord(value)||finiteNumber(value.time)===null||!isRecord(value.case)||!isRecord(value.dispatch)||!isRecord(value.possession)||!isRecord(value.notice))return null;
  const assignment=value.assignment===undefined?undefined:parseAssignment(value.assignment);
  if(assignment===null)return null;
  if(value.epoch!==undefined&&!nonEmptyString(value.epoch,64))return null;
  if(value.tick!==undefined&&(integer(value.tick)===null||Number(value.tick)<0))return null;
  const pose=(v:unknown)=>isRecord(v)&&!!parseVec3(v.p)&&!!parseQuat(v.q)&&!!parseVec3(v.v)&&!!parseVec3(v.spin);
  const c=value.case,d=value.dispatch;
  const validCase=(c:unknown)=>isRecord(c)&&pose(c)&&(c.owner===null||nonEmptyString(c.owner,64))&&
    (c.previousOwner===null||nonEmptyString(c.previousOwner,64))&&(c.missileOwner===undefined||nonEmptyString(c.missileOwner,64))&&
    finiteNumber(c.pickupAfter)!==null&&finiteNumber(c.returningUntil)!==null&&(c.fake===undefined||typeof c.fake==='boolean');
  if(!validCase(c))return null;
  if(value.extraCases!==undefined){
    const known=Math.max(EXTRA_CASE_IDS.length,COUNTERFEIT_IDS.length);
    if(!Array.isArray(value.extraCases)||value.extraCases.length>known||
      !value.extraCases.every(c=>isRecord(c)&&(EXTRA_CASE_IDS.some(id=>id===c.id)||COUNTERFEIT_IDS.some(id=>id===c.id))&&validCase(c)))return null;
    if(new Set(value.extraCases.map(c=>c.id)).size!==value.extraCases.length)return null;
    const owners=[c,...value.extraCases].map(c=>c.owner).filter(owner=>owner!==null);
    if(new Set(owners).size!==owners.length)return null;
  }
  if(value.pickups!==undefined){
    if(!Array.isArray(value.pickups)||value.pickups.length>PICKUP_ANCHORS.length||
      !value.pickups.every(p=>isRecord(p)&&PICKUP_ANCHORS.some(a=>a.id===p.id)&&isPickupKind(p.kind)&&
        finiteNumber(p.x)!==null&&finiteNumber(p.y)!==null&&finiteNumber(p.z)!==null&&
        (p.availableAt===undefined||typeof p.availableAt==='number'&&Number.isFinite(p.availableAt)&&p.availableAt>=0&&p.availableAt<=Number.MAX_SAFE_INTEGER)))return null;
    if(new Set(value.pickups.map(p=>p.id)).size!==value.pickups.length)return null;
  }
  if(value.buffs!==undefined){
    if(!isRecord(value.buffs)||Object.keys(value.buffs).length>100)return null;
    for(const entry of Object.values(value.buffs)){
      if(!isRecord(entry))return null;
      if(entry.ironcladUntil!==undefined&&finiteNumber(entry.ironcladUntil)===null)return null;
      if(entry.hustleUntil!==undefined&&finiteNumber(entry.hustleUntil)===null)return null;
      if(Object.keys(entry).some(key=>key!=='ironcladUntil'&&key!=='hustleUntil'))return null;
    }
  }
  if(!['ready','rolling','active','cooldown'].includes(String(d.phase))||finiteNumber(d.started)===null||finiteNumber(d.until)===null||integer(d.serial)===null)return null;
  if(d.incident!==undefined&&d.incident!=='after-hours-collection'&&d.incident!=='kickback'&&d.incident!=='return-to-sender'&&d.incident!=='cheesequake'&&!INCIDENTS.some(incident=>incident.id===d.incident))return null;
  if(Object.keys(value.possession).length>64||Object.values(value.possession).some(v=>finiteNumber(v)===null))return null;
  if(integer(value.notice.serial)===null||typeof value.notice.text!=='string'||value.notice.text.length>256)return null;
  if(!Array.isArray(value.corpses)||value.corpses.length>16||!value.corpses.every(c=>pose(c)&&isRecord(c)&&nonEmptyString(c.id,64)&&nonEmptyString(c.victimId,64)&&(c.owner===undefined||c.owner===null||!!nonEmptyString(c.owner,64))&&parseAppearance(c.appearance)&&finiteNumber(c.born)!==null&&finiteNumber(c.expires)!==null))return null;
  if(!Array.isArray(value.shots)||value.shots.length>CHAOS_TUNING.maxShots||!value.shots.every(s=>isRecord(s)&&nonEmptyString(s.id,64)&&(s.owner===null||nonEmptyString(s.owner,64))&&parseVec3(s.p)&&parseVec3(s.v)&&finiteNumber(s.age)!==null&&(s.wallBounced===undefined||typeof s.wallBounced==='boolean')&&(s.delayed===undefined||typeof s.delayed==='boolean')&&(s.original===undefined||typeof s.original==='boolean')&&(s.radius===undefined||finiteNumber(s.radius)!==null)&&(s.stuckUntil===undefined||finiteNumber(s.stuckUntil)!==null)&&(s.popAt===undefined||finiteNumber(s.popAt)!==null)))return null;
  if(!Array.isArray(value.impacts)||value.impacts.length>64||!value.impacts.every(i=>isRecord(i)&&parseVec3(i.p)&&parseVec3(i.n)&&typeof i.surface==='boolean'&&(i.scale===undefined||finiteNumber(i.scale)!==null)&&(i.cue===undefined||i.cue==='pop'||i.cue==='thud'||i.cue==='buzz'||i.cue==='case-hit'||i.cue==='armor-clang')&&(i.foley===undefined||isWorldFoleyCue(i.foley))&&(i.energy===undefined||(typeof i.energy==='number'&&Number.isFinite(i.energy)&&i.energy>=0&&i.energy<=300))&&(i.audioOnly===undefined||typeof i.audioOnly==='boolean')))return null;
  if(value.pressure!==undefined){
    const p=value.pressure;
    if(!isRecord(p)||integer(p.serial)===null||finiteNumber(p.until)===null||!Array.isArray(p.launches)||p.launches.length>MAX_LAUNCH_EVENTS)return null;
    if(p.cooldowns!==undefined&&(!isRecord(p.cooldowns)||Object.keys(p.cooldowns).length>LAUNCH_MACHINES.length||
      Object.entries(p.cooldowns).some(([id,until])=>!LAUNCH_MACHINES.some(m=>m.id===id)||finiteNumber(until)===null)))return null;
    if(!p.launches.every(e=>isRecord(e)&&nonEmptyString(e.id,128)&&nonEmptyString(e.playerId,64)&&
      finiteNumber(e.at)!==null&&(e.machineId===undefined||LAUNCH_MACHINES.some(m=>m.id===e.machineId))&&parseVec3(e.velocity)&&Object.values(e.velocity as Record<string,unknown>).every(v=>typeof v==='number'&&Math.abs(v)<=MAX_LAUNCH_SPEED)))return null;
  }
  const validated={...value,...(assignment?{assignment}:{})};
  if(d.incident==='after-hours-collection'||d.incident==='kickback'||d.incident==='return-to-sender'||d.incident==='cheesequake')return {...validated,dispatch:{...d,incident:incidentInfo(d.incident).id}} as unknown as ChaosState;
  return validated as unknown as ChaosState;
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (raw instanceof ArrayBuffer) return null;
  if (typeof raw === 'string' && (raw.length > MAX_SERVER_MESSAGE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_SERVER_MESSAGE_BYTES)) return null;

  const parsed = parseRaw(raw, MAX_SERVER_MESSAGE_BYTES);
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;

  switch (parsed.type) {
    case 'chaos': { const state=parseChaos(parsed.state);return state?{type:'chaos',state}:null; }
    case 'welcome': {
      const id = nonEmptyString(parsed.id, 64);
      const player = parsePlayer(parsed.player);
      const players = parsePlayersRecord(parsed.players);
      const round = parseRound(parsed.round);
      const world = parseWorld(parsed.world);
      const protocolVersion = integer(parsed.protocolVersion);
      const serverTime = integer(parsed.serverTime);
      const movementSeq=parsed.movementSeq===undefined?undefined:integer(parsed.movementSeq);
      if (!id || !player || !players || !round || !world || protocolVersion === null || serverTime === null ||
          movementSeq===null || movementSeq!==undefined&&movementSeq<0) {
        return null;
      }
      if (player.id !== id || !players[id]) return null;
      if (parsed.resumeToken !== undefined && !isResumeToken(parsed.resumeToken)) return null;
      const matchRoom = parsed.matchRoom === undefined ? undefined : nonEmptyString(parsed.matchRoom, 160);
      if (matchRoom === null || (matchRoom !== undefined && !/^[a-z0-9-]+$/.test(matchRoom))) return null;
      let incidents: IncidentId[] | undefined;
      if (parsed.incidents !== undefined) {
        if (!Array.isArray(parsed.incidents) || parsed.incidents.length < 1 || parsed.incidents.length > INCIDENTS.length ||
            !parsed.incidents.every(id => INCIDENTS.some(incident => incident.id === id)) ||
            new Set(parsed.incidents).size !== parsed.incidents.length) return null;
        incidents = parsed.incidents as IncidentId[];
      }
      return { type: 'welcome', id, player, players, round, world, protocolVersion, serverTime,
        ...(movementSeq===undefined?{}:{movementSeq}),
        ...(isResumeToken(parsed.resumeToken) ? {resumeToken:parsed.resumeToken} : {}),
        ...(matchRoom ? {matchRoom} : {}), ...(incidents ? {incidents} : {}) };
    }
    case 'currentPlayers': {
      const players = parsePlayersRecord(parsed.players);
      return players ? { type: 'currentPlayers', players } : null;
    }
    case 'playerJoined': {
      const player = parsePlayer(parsed.player);
      return player ? { type: 'playerJoined', player } : null;
    }
    case 'playersMoved': {
      if(!Array.isArray(parsed.players)||parsed.players.length<1||parsed.players.length>MAX_MOVEMENT_BATCH)return null;
      const players:Extract<ServerMessage,{type:'playersMoved'}>['players']=[],ids=new Set<string>();
      for(const sample of parsed.players){
        if(!isRecord(sample))return null;
        const player=parsePosePlayer(sample.player),at=finiteNumber(sample.at);
        if(!player||at===null||at<0||ids.has(player.id))return null;
        ids.add(player.id);players.push({player,at});
      }
      return {type:'playersMoved',players};
    }
    case 'playerMoved': {
      const player = parsePosePlayer(parsed.player);
      const at = parsed.at === undefined ? undefined : finiteNumber(parsed.at);
      if (at === null || (at !== undefined && at < 0)) return null;
      return player ? { type: 'playerMoved', player, ...(at !== undefined ? { at } : {}) } : null;
    }
    case 'playerCorrected': {
      const player = parsePosePlayer(parsed.player);
      const at = parsed.at === undefined ? undefined : finiteNumber(parsed.at);
      if (at === null || (at !== undefined && at < 0)) return null;
      return player ? { type: 'playerCorrected', player, ...(at !== undefined ? { at } : {}) } : null;
    }
    case 'playerShot': {
      const shooterId = nonEmptyString(parsed.shooterId, 64);
      const shot = parseShotFields(parsed);
      if (!shooterId || !shot) return null;
      let launch:Extract<ServerMessage,{type:'playerShot'}>['launch'];
      if(parsed.launch!==undefined){
        if(!isRecord(parsed.launch))return null;
        const at=finiteNumber(parsed.launch.at),balls=parsed.launch.balls;
        if(at===null||at<0||!Array.isArray(balls)||balls.length<1||balls.length>5)return null;
        const resolved:NonNullable<typeof launch>['balls']=[],ids=new Set<string>();
        for(const ball of balls){
          if(!isRecord(ball))return null;
          const id=nonEmptyString(ball.id,64),velocity=parseVec3(ball.velocity);
          if(!id||!velocity||ids.has(id)||Math.abs(Math.hypot(velocity.x,velocity.y,velocity.z)-BALL_SPEED)>.01)return null;
          ids.add(id);resolved.push({id,velocity});
        }
        if(resolved[0].id!==shot.shotId)return null;
        launch={at,balls:resolved};
      }
      let movement: Extract<ServerMessage,{type:'playerShot'}>['movement'];
      if(parsed.move!==undefined||parsed.movement!==undefined){
        const expanded=parsed.move!==undefined?expandMovement({players:[parsed.move]}):{type:'playersMoved',players:[parsed.movement]};
        const moves=parseServerMessage(expanded);
        if(moves?.type!=='playersMoved'||moves.players[0].player.id!==shooterId)return null;
        movement=moves.players[0];
      }
      return { type: 'playerShot', shooterId, ...shot, ...(movement?{movement}:{}), ...(launch?{launch}:{}) };
    }
    case 'shotResult': {
      const shotId=nonEmptyString(parsed.shotId,64),ballId=nonEmptyString(parsed.ballId,64),epoch=nonEmptyString(parsed.epoch,64);
      const at=finiteNumber(parsed.at),tick=integer(parsed.tick),victimId=parsed.victimId===undefined?undefined:optionalString(parsed.victimId,64);
      const outcomes=new Set(['first-step','rat-body','rat-head','ironclad-reflect','case-contact','world-bounce','dispatch-contact','pressure-contact','fake-case','lifetime','capacity','reset','rejected']);
      const damage=parsed.damage===undefined?undefined:boundedInteger(parsed.damage,0,MAX_HP);
      const point=parsed.point===undefined?undefined:parseVec3(parsed.point),normal=parsed.normal===undefined?undefined:parseVec3(parsed.normal);
      const fallback=parsed.fallback===undefined?undefined:optionalString(parsed.fallback,80);
      const rewindMs=parsed.rewindMs===undefined?undefined:finiteNumber(parsed.rewindMs),targetDelta=parsed.targetDelta===undefined?undefined:finiteNumber(parsed.targetDelta);
      if(!shotId||!ballId||!epoch||at===null||at<0||tick===null||tick<0||!outcomes.has(String(parsed.outcome))||victimId===null||damage===null||point===null||normal===null||fallback===null||
        rewindMs===null||targetDelta===null||(rewindMs!==undefined&&rewindMs<0)||(targetDelta!==undefined&&targetDelta<0)||
        (parsed.compensated!==undefined&&typeof parsed.compensated!=='boolean'))return null;
      return{type:'shotResult',shotId,ballId,outcome:parsed.outcome as Extract<ServerMessage,{type:'shotResult'}>['outcome'],at,tick,epoch,
        ...(victimId?{victimId}:{}),...(damage===undefined?{}:{damage}),...(point?{point}:{}),...(normal?{normal}:{}),
        ...(parsed.compensated===true?{compensated:true}:{}),...(fallback?{fallback}:{}),...(rewindMs===undefined?{}:{rewindMs}),...(targetDelta===undefined?{}:{targetDelta})};
    }
    case 'pickupResult': {
      const interactionId=nonEmptyString(parsed.interactionId,64),targetId=nonEmptyString(parsed.targetId,96),epoch=nonEmptyString(parsed.epoch,64),playerId=nonEmptyString(parsed.playerId,64);
      const at=finiteNumber(parsed.at),tick=integer(parsed.tick),effectUntil=parsed.effectUntil===undefined?undefined:finiteNumber(parsed.effectUntil);
      const reasons=new Set(['stale','unavailable','blocked','ineligible','too-far','invalid-target','rate-limited']);
      if(!interactionId||!targetId||!epoch||!playerId||at===null||at<0||tick===null||tick<0||typeof parsed.accepted!=='boolean'||
        (parsed.target!=='case'&&parsed.target!=='pickup')||(parsed.pickup!==undefined&&!isPickupKind(parsed.pickup))||effectUntil===null||
        (parsed.reason!==undefined&&!reasons.has(String(parsed.reason))))return null;
      return{type:'pickupResult',interactionId,target:parsed.target,targetId,accepted:parsed.accepted,at,tick,epoch,playerId,
        ...(parsed.pickup===undefined?{}:{pickup:parsed.pickup}),...(effectUntil===undefined?{}:{effectUntil}),
        ...(parsed.reason===undefined?{}:{reason:parsed.reason as Extract<ServerMessage,{type:'pickupResult'}>['reason']})};
    }
    case 'playerDamaged': {
      const id = nonEmptyString(parsed.id, 64);
      const hp = boundedInteger(parsed.hp, 0, MAX_HP);
      const attackerId = nonEmptyString(parsed.attackerId, 64);
      const environmental=parsed.cause==='evidence-tampering'&&parsed.attackerId===null;
      if (!id || hp === null || (!environmental&&!attackerId) ||
          (parsed.cause!==undefined&&!environmental)) return null;
      return { type: 'playerDamaged', id, hp, attackerId, ...(environmental?{cause:'evidence-tampering' as const}:{}) };
    }
    case 'playerHealed': {
      const id = nonEmptyString(parsed.id, 64);
      const hp = boundedInteger(parsed.hp, 1, MAX_HP);
      if (!id || hp === null || (parsed.cause !== undefined && parsed.cause !== 'pickup')) return null;
      return { type: 'playerHealed', id, hp, ...(parsed.cause === 'pickup' ? {cause:'pickup' as const} : {}) };
    }
    case 'playerDied': {
      const victimId = nonEmptyString(parsed.victimId, 64);
      const killerId = nonEmptyString(parsed.killerId, 64);
      const killerName = typeof parsed.killerName === 'string' && parsed.killerName.length <= 32 ? parsed.killerName : null;
      const victimName = typeof parsed.victimName === 'string' && parsed.victimName.length <= 32 ? parsed.victimName : null;
      const respawnAt = integer(parsed.respawnAt);
      const environmental=parsed.cause==='evidence-tampering'&&parsed.killerId===null&&parsed.killerName===null;
      if (!victimId || (!environmental&&(!killerId||killerName===null)) || victimName === null || respawnAt === null ||
          (parsed.cause!==undefined&&!environmental)) return null;
      const incoming=parsed.incoming===undefined?undefined:parseVec3(parsed.incoming);
      if(incoming===null || (parsed.incident!==undefined&&typeof parsed.incident!=='boolean'))return null;
      return { type: 'playerDied', victimId, killerId, killerName, victimName, respawnAt,
        ...(environmental?{cause:'evidence-tampering' as const}:{}),...(incoming?{incoming,incident:parsed.incident===true}:{}) };
    }
    case 'scoreboardUpdate': {
      const scores = parseScores(parsed.scores);
      return scores ? { type: 'scoreboardUpdate', scores } : null;
    }
    case 'playerRespawn': {
      const id = nonEmptyString(parsed.id, 64);
      const x = finiteNumber(parsed.x);
      const y = finiteNumber(parsed.y);
      const z = finiteNumber(parsed.z);
      const hp = boundedInteger(parsed.hp, 1, MAX_HP);
      if (!id || x === null || y === null || z === null || hp === null) return null;
      return { type: 'playerRespawn', id, x, y, z, hp };
    }
    case 'playerLeft': {
      const id = nonEmptyString(parsed.id, 64);
      return id ? { type: 'playerLeft', id } : null;
    }
    case 'gameWon': {
      const winnerId = nonEmptyString(parsed.winnerId, 64);
      const winnerName = typeof parsed.winnerName === 'string' && parsed.winnerName.length <= 32 ? parsed.winnerName : null;
      const kills = boundedInteger(parsed.kills, 0, 10_000);
      const resetAt = integer(parsed.resetAt);
      if (!winnerId || winnerName === null || kills === null || resetAt === null) return null;
      const assignment=parsed.assignment===undefined?undefined:parseAssignment(parsed.assignment);
      if(assignment===null || assignment && (assignment.result?.winnerId!==winnerId || assignment.result.winnerName!==winnerName))return null;
      return { type: 'gameWon', winnerId, winnerName, kills, resetAt, ...(assignment?{assignment}:{}) };
    }
    case 'gameReset': {
      const round = parseRound(parsed.round);
      return round && round.phase === 'playing' ? { type: 'gameReset', round } : null;
    }
    case 'pong': {
      const sentAt = integer(parsed.sentAt);
      const receivedAt = integer(parsed.receivedAt);
      if (sentAt === null || receivedAt === null) return null;
      return { type: 'pong', sentAt, receivedAt };
    }
    case 'error': {
      const message = typeof parsed.message === 'string' && parsed.message.length > 0 && parsed.message.length <= 256
        ? parsed.message
        : null;
      if (parsed.code !== undefined && parsed.code !== 'resume-unavailable') return null;
      return message ? { type: 'error', message, ...(parsed.code === 'resume-unavailable' ? {code:parsed.code} : {}) } : null;
    }
    default:
      return null;
  }
}

export { PROTOCOL_VERSION, isSupportedWorldVersion };
