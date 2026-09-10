/** Deliberately global comedy mix: nearby 100%, across the city at least 80%. */
export function worldSoundGain(distance: number): number {
    if (!Number.isFinite(distance)) return 0;
    return 1 - .2 * Math.min(1, Math.max(0, distance - 10) / 240);
}
