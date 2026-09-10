import type { MovementSample, ServerMessage } from './networkProtocol';
export const POSE_FIELDS = ['x','y','z','qx','qy','qz','qw','meshQx','meshQy','meshQz','meshQw'] as const;
/** Exact JSON numbers: no quantization or timestamp changes. */
export function serializeMovement(message: Extract<ServerMessage,{type:'playersMoved'}>): string {
  return JSON.stringify({type:'movementFrame',players:message.players.map(({player,at})=>[player.id,at,...POSE_FIELDS.map(key=>player[key])])});
}
export function expandMovement(value: Record<string,unknown>): unknown {
  if (!Array.isArray(value.players) || !value.players.length || value.players.length > 100) return null;
  const players: MovementSample[]=[];
  for (const row of value.players) {
    if (!Array.isArray(row) || row.length !== 13 || typeof row[0] !== 'string' || row.slice(1).some(n=>typeof n!=='number'||!Number.isFinite(n))) return null;
    const player={id:row[0]} as MovementSample['player'];
    POSE_FIELDS.forEach((key,i)=>{player[key]=row[i+2];});
    players.push({player,at:row[1]});
  }
  return {type:'playersMoved',players};
}
