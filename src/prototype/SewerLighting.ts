import { SEWER_MANHOLE, SEWER_PIPE_ENTRANCES, sewerEntranceFootprint, sewerPipePoint } from '../shared/sewerLayout';

export const SEWER_TUNNEL_LAMP_DISTANCES = [4, 14, 24] as const;

/** Sources stay at the visible utility fixtures. They share the existing eight
 * sewer lights; adding an entrance never adds a live light or shadow map. */
export const SEWER_PORTAL_LIGHTS = SEWER_PIPE_ENTRANCES.flatMap(entry => [
    ...[-1, 1].map(side => {
        const p = sewerPipePoint(entry, -.65, side * 3.15);
        return { x: p.x, y: 3.15, z: p.z, color: 0xffd08a, intensity: 38, distance: 16 };
    }),
    ...SEWER_TUNNEL_LAMP_DISTANCES.map(distance => {
        const p = sewerPipePoint(entry, distance);
        return { x: p.x, y: p.floorY + 4.45, z: p.z, color: 0x9cd5ba, intensity: 42, distance: 17 };
    }),
]).concat([-1, 1].map(side => ({
    x: SEWER_MANHOLE.x + side * 1.65, y: -.9, z: SEWER_MANHOLE.z,
    color: 0x9cd5ba, intensity: 20, distance: 11,
})));

export function sewerLightingActive(p: { x: number; y: number; z: number }): boolean {
    // Ground contact can settle a few millimetres below zero. That is still
    // pavement, not permission to shine sewer lights through the whole street.
    if (p.y < -.5) return true;
    // A shoulder camera can remain above the street while the rat descends.
    // Include the street approach, but exclude upper floors above the entrance.
    return p.y < 4 && (sewerEntranceFootprint(p.x, p.z, 10) ||
        Math.hypot(p.x - SEWER_MANHOLE.x, p.z - SEWER_MANHOLE.z) < 11);
}
