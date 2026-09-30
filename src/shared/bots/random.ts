/** A seeded stream (mulberry32-style). Each bot part draws from its own, so tuning one never shifts another. */
export function seededRandom(seed: number): () => number {
    let state = (seed + 0xa341316c) >>> 0;
    return () => {
        state=(state+0x6d2b79f5)>>>0;
        let value=Math.imul(state^(state>>>15),1|state);
        value^=value+Math.imul(value^(value>>>7),61|value);
        return ((value^(value>>>14))>>>0)/4294967296;
    };
}
