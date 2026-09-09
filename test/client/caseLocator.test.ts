import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { locateCase } from '../../src/prototype/caseLocator';

function camera() {
    const camera = new PerspectiveCamera(60, 16 / 9, .1, 1000);
    camera.updateMatrixWorld();
    return camera;
}

describe('Hot Case HUD projection', () => {
    it('pins an unobstructed world direction at its actual screen location', () => {
        const view = camera();
        const target = new Vector3(3, 1, -20);
        const projected = target.clone().project(view);
        const marker = locateCase(target, view, 1280, 720);
        expect(marker.edge).toBe(false);
        expect(marker.x).toBeCloseTo((projected.x + 1) * 640);
        expect(marker.y).toBeCloseTo((1 - projected.y) * 360);
        expect(marker.distance).toBeCloseTo(target.length());
    });

    it('keeps offscreen labels inside HUD bounds, including small viewports', () => {
        for (const [width, height] of [[1280, 720], [390, 400], [780, 424]]) {
            for (const target of [new Vector3(500, 0, -1), new Vector3(-500, 0, -1), new Vector3(0, 500, -1), new Vector3(0, -500, -1)]) {
                const marker = locateCase(target, camera(), width, height);
                expect(marker.edge).toBe(true);
                expect(marker.x).toBeGreaterThanOrEqual(Math.min(96, width * .24) - .001);
                expect(marker.x).toBeLessThanOrEqual(width - Math.min(96, width * .24) + .001);
                expect(marker.y).toBeGreaterThanOrEqual(Math.min(122, height * .3) - .001);
                expect(marker.y).toBeLessThanOrEqual(height - Math.min(104, height * .26) + .001);
            }
        }
    });

    it('keeps a right-hand case on the right when it passes behind the camera', () => {
        const view = camera();
        for (const z of [-.1, 0, .1, 50]) {
            const marker = locateCase(new Vector3(10, 0, z), view, 1280, 720);
            expect(marker.edge).toBe(true);
            expect(marker.x).toBeGreaterThan(640);
            expect(marker.angle).toBeCloseTo(0);
        }
    });

    it('gives directly-behind cases a finite turn-around direction', () => {
        const marker = locateCase(new Vector3(0, 0, 20), camera(), 1280, 720);
        expect(marker.behind).toBe(true);
        expect(marker.edge).toBe(true);
        expect(marker.x).toBe(640);
        expect(marker.y).toBeGreaterThan(360);
        expect(marker.angle).toBeCloseTo(Math.PI / 2);
    });

    it('uses the latest gameplay camera position and rotation', () => {
        const view = camera();
        view.position.set(100, 6, -75);
        const target = new Vector3(-16, 1, -28);
        view.lookAt(target);
        // Deliberately leave matrix updates to locateCase, as callers do before rendering.
        const marker = locateCase(target, view, 1280, 720);
        expect(marker.edge).toBe(false);
        expect(marker.x).toBeCloseTo(640);
        expect(marker.y).toBeCloseTo(360);
    });
});
