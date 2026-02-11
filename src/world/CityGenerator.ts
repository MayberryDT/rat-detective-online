import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface CityOptions {
    gridSize: number;
    blockSpacing: number;
    streetWidth: number;
    minHeight: number;
    maxHeight: number;
    buildingWidthMin: number;
    buildingWidthMax: number;
}

/**
 * Procedural noir city using emissive materials for window glow.
 * Buildings use a lighter base color (#222222) to catch moonlight.
 */
export class CityGenerator {
    private scene: THREE.Scene;
    private world: CANNON.World;
    private opts: CityOptions;

    constructor(scene: THREE.Scene, world: CANNON.World, opts: CityOptions) {
        this.scene = scene;
        this.world = world;
        this.opts = opts;
    }

    generate(): void {
        this.generateBuildings();
        this.generateLampProps();
        this.generateRoadMarkings();
    }

    // ─── BUILDINGS ────────────────────────────────────────────────────
    private generateBuildings(): void {
        const { gridSize, blockSpacing, minHeight, maxHeight, buildingWidthMin, buildingWidthMax } = this.opts;
        const half = gridSize / 2;

        for (let gx = -half; gx < half; gx++) {
            for (let gz = -half; gz < half; gz++) {
                const bw = buildingWidthMin + Math.random() * (buildingWidthMax - buildingWidthMin);
                const bd = buildingWidthMin + Math.random() * (buildingWidthMax - buildingWidthMin);
                const bh = minHeight + Math.random() * (maxHeight - minHeight);
                const cx = gx * blockSpacing;
                const cz = gz * blockSpacing;

                this.addBuilding(cx, cz, bw, bd, bh);
            }
        }
    }

    private addBuilding(cx: number, cz: number, bw: number, bd: number, bh: number): void {
        const windowTex = this.createWindowTexture(Math.ceil(bw), Math.ceil(bh));

        const mat = new THREE.MeshStandardMaterial({
            color: 0x222222,             // dark grey — light enough to catch moonlight
            roughness: 0.85,
            metalness: 0.08,
            emissiveMap: windowTex,
            emissive: 0xffdd44,          // yellow-orange window glow
            emissiveIntensity: 2.0,
        });

        const geo = new THREE.BoxGeometry(bw, bh, bd);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, bh / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Rooftop detail (40% chance)
        if (Math.random() < 0.4) {
            this.addRooftopDetail(cx, cz, bw, bd, bh);
        }

        // Physics collider (static)
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
        body.addShape(new CANNON.Box(new CANNON.Vec3(bw / 2, bh / 2, bd / 2)));
        body.position.set(cx, bh / 2, cz);
        this.world.addBody(body);
    }

    private addRooftopDetail(cx: number, cz: number, bw: number, bd: number, bh: number): void {
        const dw = 1.5 + Math.random() * 2;
        const dh = 1 + Math.random() * 2.5;
        const dd = 1.5 + Math.random() * 2;
        const mat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.85 });
        const geo = new THREE.BoxGeometry(dw, dh, dd);
        const detail = new THREE.Mesh(geo, mat);
        detail.position.set(
            cx + (Math.random() - 0.5) * bw * 0.4,
            bh + dh / 2,
            cz + (Math.random() - 0.5) * bd * 0.4
        );
        detail.castShadow = true;
        this.scene.add(detail);
    }

    // ─── WINDOW TEXTURE ───────────────────────────────────────────────
    private createWindowTexture(widthUnits: number, heightUnits: number): THREE.CanvasTexture {
        const pxPerUnit = 4;
        const canvas = document.createElement('canvas');
        canvas.width = widthUnits * pxPerUnit;
        canvas.height = heightUnits * pxPerUnit;
        const ctx = canvas.getContext('2d')!;

        // Black base = no emission where no windows
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const spacingX = 4;
        const spacingY = 4;
        const winW = 2;
        const winH = 2;
        const cols = Math.floor(canvas.width / spacingX);
        const rows = Math.floor(canvas.height / spacingY);

        for (let r = 1; r < rows; r++) {
            for (let c = 1; c < cols; c++) {
                if (Math.random() > 0.32) continue;

                const style = Math.random();
                if (style < 0.6) {
                    // Warm yellow/orange
                    const brightness = 200 + Math.floor(Math.random() * 55);
                    ctx.fillStyle = `rgb(${brightness}, ${Math.floor(brightness * 0.72)}, ${Math.floor(brightness * 0.15)})`;
                } else if (style < 0.82) {
                    // Cool blue-white
                    const b = 160 + Math.floor(Math.random() * 60);
                    ctx.fillStyle = `rgb(${Math.floor(b * 0.72)}, ${Math.floor(b * 0.82)}, ${b})`;
                } else {
                    // Neon red/pink
                    ctx.fillStyle = `rgb(${210 + Math.floor(Math.random() * 45)}, ${50 + Math.floor(Math.random() * 40)}, ${30})`;
                }
                ctx.fillRect(c * spacingX, r * spacingY, winW, winH);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }

    // ─── LAMP PROPS (visual only — no lights) ─────────────────────────
    // Lamps at the four corners of each road intersection
    private generateLampProps(): void {
        const { gridSize, blockSpacing, streetWidth } = this.opts;
        const half = gridSize / 2;
        const offset = streetWidth / 2 + 1.5; // just outside the road edge

        // Intersections are where horiz road gz crosses vert road gx
        for (let gx = -half; gx < half; gx++) {
            for (let gz = -half; gz < half; gz++) {
                const ix = (gx + 0.5) * blockSpacing; // intersection center X
                const iz = (gz + 0.5) * blockSpacing; // intersection center Z

                // Place a lamp on 1-2 random corners of this intersection
                if (Math.random() < 0.6) {
                    this.addLampProp(ix + offset, iz + offset);
                }
                if (Math.random() < 0.4) {
                    this.addLampProp(ix - offset, iz - offset);
                }
            }
        }
    }

    private addLampProp(x: number, z: number): void {
        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7, metalness: 0.5 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 3, z);
        pole.castShadow = true;
        this.scene.add(pole);

        // Lamp head — bright emissive, no runtime light
        const headGeo = new THREE.CylinderGeometry(0.7, 0.35, 0.45, 8);
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xf0d060,
            emissive: 0xf0d060,
            emissiveIntensity: 3.5,
            roughness: 0.2,
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(x, 6.2, z);
        this.scene.add(head);

        // Fake volumetric cone
        const coneGeo = new THREE.ConeGeometry(2.5, 6, 8, 1, true);
        const coneMat = new THREE.MeshBasicMaterial({
            color: 0xf0d060,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(x, 3, z);
        this.scene.add(cone);
    }

    // ─── ROADS ─────────────────────────────────────────────────────────
    // Roads run BETWEEN buildings at (g + 0.5) * blockSpacing
    private generateRoadMarkings(): void {
        const { gridSize, blockSpacing, streetWidth } = this.opts;
        const half = gridSize / 2;
        const totalLen = gridSize * blockSpacing + blockSpacing;

        // ── Shared materials ──
        const asphaltMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.95,
            metalness: 0.0,
        });
        const curbMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.8,
        });
        const lineMat = new THREE.MeshBasicMaterial({
            color: 0xccaa22,
            transparent: true,
            opacity: 0.6,
        });

        // ── Road surface strips — offset by half blockSpacing ──
        // Horizontal roads (along X, between building rows)
        for (let gz = -half; gz < half; gz++) {
            const z = (gz + 0.5) * blockSpacing;
            const roadGeo = new THREE.PlaneGeometry(totalLen, streetWidth);
            const road = new THREE.Mesh(roadGeo, asphaltMat);
            road.rotation.x = -Math.PI / 2;
            road.position.set(0, 0.01, z);
            road.receiveShadow = true;
            this.scene.add(road);
        }

        // Vertical roads (along Z, between building columns)
        for (let gx = -half; gx < half; gx++) {
            const x = (gx + 0.5) * blockSpacing;
            const roadGeo = new THREE.PlaneGeometry(streetWidth, totalLen);
            const road = new THREE.Mesh(roadGeo, asphaltMat);
            road.rotation.x = -Math.PI / 2;
            road.position.set(x, 0.01, 0);
            road.receiveShadow = true;
            this.scene.add(road);
        }

        // ── Dashed yellow center lines ──
        const dashLen = 2.5;
        const gapLen = 2.5;
        const dashW = 0.18;

        // Collect perpendicular road positions for intersection skipping
        const vertRoadXs: number[] = [];
        for (let gx = -half; gx < half; gx++) vertRoadXs.push((gx + 0.5) * blockSpacing);
        const horizRoadZs: number[] = [];
        for (let gz = -half; gz < half; gz++) horizRoadZs.push((gz + 0.5) * blockSpacing);

        const halfSW = streetWidth / 2;

        // Horizontal center lines — skip where vertical roads cross
        for (let gz = -half; gz < half; gz++) {
            const z = (gz + 0.5) * blockSpacing;
            for (let d = -totalLen / 2; d < totalLen / 2; d += dashLen + gapLen) {
                const cx = d + dashLen / 2;
                // Skip if this dash is inside a vertical road
                const inIntersection = vertRoadXs.some(vx => Math.abs(cx - vx) < halfSW);
                if (inIntersection) continue;

                const dashGeo = new THREE.PlaneGeometry(dashLen, dashW);
                const dash = new THREE.Mesh(dashGeo, lineMat);
                dash.rotation.x = -Math.PI / 2;
                dash.position.set(cx, 0.02, z);
                this.scene.add(dash);
            }
        }

        // Vertical center lines — skip where horizontal roads cross
        for (let gx = -half; gx < half; gx++) {
            const x = (gx + 0.5) * blockSpacing;
            for (let d = -totalLen / 2; d < totalLen / 2; d += dashLen + gapLen) {
                const cz = d + dashLen / 2;
                const inIntersection = horizRoadZs.some(hz => Math.abs(cz - hz) < halfSW);
                if (inIntersection) continue;

                const dashGeo = new THREE.PlaneGeometry(dashW, dashLen);
                const dash = new THREE.Mesh(dashGeo, lineMat);
                dash.rotation.x = -Math.PI / 2;
                dash.position.set(x, 0.02, cz);
                this.scene.add(dash);
            }
        }
    }
}
