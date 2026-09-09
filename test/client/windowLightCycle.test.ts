import {describe, expect, it} from 'vitest';
import {WindowLightCycle} from '../../src/world/WindowLightCycle';

describe('city room occupancy lighting', () => {
    it('changes smoothly and spends most time steady, without synchronized buildings', () => {
        const rooms = Array.from({length: 12}, (_, i) => new WindowLightCycle(4281 + i * 73537));
        const firstChanges = rooms.map(() => -1);
        const previous = rooms.map(room => room.brightness);
        const changingFrames = rooms.map(() => 0);
        for (let tick = 0; tick <= 1800; tick++) {
            const time = tick / 10;
            rooms.forEach((room, i) => {
                const value = room.update(time);
                expect(value).toBeGreaterThanOrEqual(0.0249);
                expect(value).toBeLessThanOrEqual(1);
                expect(Math.abs(value - previous[i])).toBeLessThan(0.13);
                if (Math.abs(value - previous[i]) > 0.00001) {
                    changingFrames[i]++;
                    if (firstChanges[i] < 0) firstChanges[i] = time;
                }
                previous[i] = value;
            });
        }
        expect(new Set(firstChanges).size).toBeGreaterThan(9);
        expect(firstChanges.every(time => time > 5 && time < 16)).toBe(true);
        expect(changingFrames.every(frames => frames < 210)).toBe(true);
    });

    it('is deterministic without affecting the world RNG and rejects invalid clocks', () => {
        const a = new WindowLightCycle(42), b = new WindowLightCycle(42);
        for (let tick = 0; tick < 1200; tick++) expect(a.update(tick / 10)).toBe(b.update(tick / 10));
        const before = a.brightness;
        expect(a.update(NaN)).toBe(before);
        expect(a.update(-1)).toBe(before);
    });
});
