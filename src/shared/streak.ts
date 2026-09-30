/** Kill streak titles: the lowest streak of each (ARMED, DANGEROUS, PUBLIC ENEMY). The nameplate
 * stamps them and the authority hands out a random supply as each is reached. */
export const STREAK_TIERS = [3, 5, 8] as const;

/** 0 below a 3-kill streak, then 1 (3–4), 2 (5–7) and 3 (8 or more). */
export function streakTier(streak: number): number {
    let tier = 0;
    for (const floor of STREAK_TIERS) if (streak >= floor) tier++;
    return tier;
}

/** True on the kill that earns a new title. */
export function newStreakTitle(streak: number): boolean {
    return (STREAK_TIERS as readonly number[]).includes(streak);
}
