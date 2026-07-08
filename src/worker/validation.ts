import type { ClientMessage, HatTypeName, QuatData, RatAppearance, Vec3Data } from '../shared/networkProtocol';

const HAT_TYPES = new Set<HatTypeName>(['fedora', 'trilby', 'porkpie']);
const MAX_MESSAGE_BYTES = 8_192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorOr(value: unknown, fallback: number): number {
  const number = numberOr(value, fallback);
  return Math.max(0x000000, Math.min(0xffffff, Math.trunc(number)));
}

function vec3(value: unknown): Vec3Data | null {
  if (!isRecord(value)) return null;
  return {
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    z: numberOr(value.z, 0),
  };
}

function quat(value: unknown): QuatData | null {
  if (!isRecord(value)) return null;
  return {
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    z: numberOr(value.z, 0),
    w: numberOr(value.w, 1),
  };
}

function appearance(value: unknown): RatAppearance | null {
  if (!isRecord(value)) return null;
  const hatType = HAT_TYPES.has(value.hatType as HatTypeName) ? (value.hatType as HatTypeName) : 'fedora';
  return {
    hatType,
    hatColor: colorOr(value.hatColor, 0xdc4a3c),
    furColor: colorOr(value.furColor, 0xe8b84d),
    coatColor: colorOr(value.coatColor, 0xbe4545),
  };
}

export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (raw instanceof ArrayBuffer) return null;
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;

  if (parsed.type === 'join') {
    const parsedAppearance = appearance(parsed.appearance);
    if (!parsedAppearance) return null;
    return {
      type: 'join',
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 32) : 'Anonymous Rat',
      appearance: parsedAppearance,
    };
  }

  if (parsed.type === 'updateMovement') {
    const position = vec3(parsed.position);
    const rotation = quat(parsed.rotation);
    const meshRotation = quat(parsed.meshRotation);
    if (!position || !rotation || !meshRotation) return null;
    return { type: 'updateMovement', position, rotation, meshRotation };
  }

  if (parsed.type === 'shoot') {
    const origin = vec3(parsed.origin);
    const target = vec3(parsed.target);
    if (!origin || !target) return null;
    return { type: 'shoot', origin, target };
  }

  if (parsed.type === 'hit') {
    return {
      type: 'hit',
      victimId: typeof parsed.victimId === 'string' ? parsed.victimId : '',
      damage: numberOr(parsed.damage, 0),
    };
  }

  if (parsed.type === 'ping') {
    return { type: 'ping', sentAt: numberOr(parsed.sentAt, Date.now()) };
  }

  return null;
}
