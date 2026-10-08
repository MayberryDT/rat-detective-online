import type { MovementSample, ServerMessage } from './networkProtocol';
export const POSE_FIELDS = ['x','y','z','qx','qy','qz','qw','meshQx','meshQy','meshQz','meshQw'] as const;
/** Exact JSON numbers: no quantization or timestamp changes. */
/** A row: id, time, the pose fields, then the look's yaw and pitch (to 0.001 rad) when the rat has one. Movement frames
 * and a shot's own pose (`move`) both use it. */
export function movementRow({player,at}:MovementSample):unknown[] {
  return [player.id,at,...POSE_FIELDS.map(key=>player[key]),
    ...(player.lookYaw!==undefined&&player.lookPitch!==undefined?[Math.round(player.lookYaw*1000)/1000,Math.round(player.lookPitch*1000)/1000]:[])];
}
export function serializeMovement(message: Extract<ServerMessage,{type:'playersMoved'}>): string {
  return JSON.stringify({type:'movementFrame',players:message.players.map(movementRow)});
}
export function expandMovement(value: Record<string,unknown>): unknown {
  if (!Array.isArray(value.players) || !value.players.length || value.players.length > 100) return null;
  const players: MovementSample[]=[];
  for (const row of value.players) {
    if (!Array.isArray(row) || (row.length !== 13 && row.length !== 15) || typeof row[0] !== 'string' || row.slice(1).some(n=>typeof n!=='number'||!Number.isFinite(n))) return null;
    const player={id:row[0]} as MovementSample['player'];
    POSE_FIELDS.forEach((key,i)=>{player[key]=row[i+2];});
    if (row.length === 15) { player.lookYaw = row[13]; player.lookPitch = row[14]; }
    players.push({player,at:row[1]});
  }
  return {type:'playersMoved',players};
}
