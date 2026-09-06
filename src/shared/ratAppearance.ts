import type { HatTypeName, RatAppearance } from './networkProtocol';

export const HAT_COLORS = [0xDC4A3C, 0x3498DB, 0x2ECC71, 0xA855F7, 0xE67E22];
export const FUR_COLORS = [0xE8B84D, 0xC8C8D0, 0xD4A06A, 0xCD6839, 0xF0E0C0];
export const COAT_COLORS = [0xBE4545, 0x3A5F95, 0x45945A, 0xA08050, 0x7E4F99];
export const HAT_TYPES: HatTypeName[] = ['fedora', 'trilby', 'porkpie'];

export const DEFAULT_APPEARANCE: RatAppearance = {
    hatType: HAT_TYPES[0],
    hatColor: HAT_COLORS[0],
    furColor: FUR_COLORS[0],
    coatColor: COAT_COLORS[0],
};

export function generateRandomAppearance(): RatAppearance {
    return {
        hatType: HAT_TYPES[Math.floor(Math.random() * HAT_TYPES.length)],
        hatColor: HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)],
        furColor: FUR_COLORS[Math.floor(Math.random() * FUR_COLORS.length)],
        coatColor: COAT_COLORS[Math.floor(Math.random() * COAT_COLORS.length)],
    };
}
