/** Keep nearby action clear with a gentler distance fade, capped at cue volume.
 * Include any stricter source range fade before boosting. UI cues bypass this. */
export function worldSoundGain(distance: number, rangeGain = 1): number {
    if (!Number.isFinite(distance) || !Number.isFinite(rangeGain)) return 0;
    const fade = .002 + .998 / (1 + (Math.max(0, distance - 8) / 32) ** 2);
    return Math.min(1, 1.5 * fade * Math.max(0, Math.min(1, rangeGain)));
}
