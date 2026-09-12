import type { HatTypeName, RatAppearance } from './networkProtocol';

/** Approved September 12 pool: same clothing colors, independently assigned. */
export const CLOTHING_PALETTE = [
    { name: 'Blue', color: 0x386caa }, { name: 'Green', color: 0x43825e },
    { name: 'Plum', color: 0x885b89 }, { name: 'Teal', color: 0x398d92 },
    { name: 'Ochre', color: 0xc5a044 }, { name: 'Orange', color: 0xcd873f },
    { name: 'Brown', color: 0x97765f }, { name: 'Slate', color: 0x7c899c },
] as const;
export const HIGHLIGHT_PALETTE = [
    { name: 'Ivory', color: 0xe9dfc9 }, { name: 'Tan', color: 0xcbb596 },
    { name: 'Pearl gray', color: 0xb8b9c8 }, { name: 'Pale gold', color: 0xd9bf80 },
] as const;
export const FUR_PALETTE = [
    { name: 'Golden', color: 0xe8b84d }, { name: 'Taupe', color: 0xb79d83 },
    { name: 'Warm gray', color: 0xb4b0ab }, { name: 'Ivory', color: 0xe8dac0 },
] as const;
export const HAT_COLORS = CLOTHING_PALETTE.map(entry => entry.color);
export const COAT_COLORS = CLOTHING_PALETTE.map(entry => entry.color);
export const HIGHLIGHT_COLORS = HIGHLIGHT_PALETTE.map(entry => entry.color);
export const FUR_COLORS = FUR_PALETTE.map(entry => entry.color);
export const HAT_TYPES: HatTypeName[] = ['fedora'];
export const APPEARANCE_COUNT = HAT_COLORS.length * COAT_COLORS.length * HIGHLIGHT_COLORS.length * FUR_COLORS.length;

export const DEFAULT_APPEARANCE: RatAppearance = {
    hatType: 'fedora', hatColor: HAT_COLORS[6], coatColor: COAT_COLORS[0],
    highlightColor: HIGHLIGHT_COLORS[1], furColor: FUR_COLORS[0],
};

/** Mixed-radix index visits every one of the 1,024 assignments exactly once. */
export function appearanceAt(index: number): RatAppearance {
    let remaining = ((Math.floor(index) % APPEARANCE_COUNT) + APPEARANCE_COUNT) % APPEARANCE_COUNT;
    const take = (colors: readonly number[]) => {
        const color = colors[remaining % colors.length];
        remaining = Math.floor(remaining / colors.length);
        return color;
    };
    return { hatType: 'fedora', furColor: take(FUR_COLORS), highlightColor: take(HIGHLIGHT_COLORS),
        hatColor: take(HAT_COLORS), coatColor: take(COAT_COLORS) };
}

export function generateRandomAppearance(random = Math.random): RatAppearance {
    return appearanceAt(Math.floor(random() * APPEARANCE_COUNT));
}
