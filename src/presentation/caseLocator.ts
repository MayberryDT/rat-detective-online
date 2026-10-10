import { Camera, Vector3 } from 'three';

export interface CaseLocatorPosition {
    x: number;
    y: number;
    edge: boolean;
    behind: boolean;
    angle: number;
    distance: number;
}

const view = new Vector3();
const projected = new Vector3();

/** Project the actual case into the gameplay camera, keeping its label inside the HUD.
 * Behind-camera targets use view-space directions so crossing the camera plane
 * never flips a right-hand target onto the left edge.
 */
export function locateCase(target: Vector3, camera: Camera, width: number, height: number): CaseLocatorPosition {
    camera.updateMatrixWorld();
    view.copy(target).applyMatrix4(camera.matrixWorldInverse);
    const distance = view.length();
    const behind = view.z >= 0;
    projected.copy(target).project(camera);
    const cx = width / 2, cy = height / 2;
    const marginX = Math.min(96, width * .24);
    const marginTop = Math.min(122, height * .3);
    const marginBottom = Math.min(104, height * .26);
    const left = marginX, right = width - marginX;
    const top = marginTop, bottom = height - marginBottom;
    let dx = behind ? view.x * camera.projectionMatrix.elements[0] * cx : projected.x * cx;
    let dy = behind ? -view.y * camera.projectionMatrix.elements[5] * cy : -projected.y * cy;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (behind && Math.abs(dx) + Math.abs(dy) < .001)) {
        dx = 0; dy = 1;
    }
    const edge = behind || cx + dx < left || cx + dx > right || cy + dy < top || cy + dy > bottom;
    if (edge) {
        const sx = Math.abs(dx) < .0001 ? Infinity : (dx > 0 ? right - cx : cx - left) / Math.abs(dx);
        const sy = Math.abs(dy) < .0001 ? Infinity : (dy > 0 ? bottom - cy : cy - top) / Math.abs(dy);
        const scale = Math.min(sx, sy);
        dx *= scale; dy *= scale;
    }
    return { x: cx + dx, y: cy + dy, edge, behind, angle: Math.atan2(dy, dx), distance };
}
