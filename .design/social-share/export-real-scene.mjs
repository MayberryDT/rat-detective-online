// .design/social-share/export-real-scene.ts
import * as THREE6 from "three";
import * as CANNON2 from "cannon-es";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { writeFile } from "node:fs/promises";

// src/session/lightingTuning.ts
var AUTHORED_LIGHT_GAIN = 1.4;

// src/shared/skyline.ts
var CENTRAL_BUILDINGS = [
  { cx: -40, cz: 9, bw: 20, bd: 16, bh: 122 },
  { cx: -9, cz: 10, bw: 24, bd: 18, bh: 170 },
  { cx: 30, cz: 6, bw: 20, bd: 20, bh: 146 },
  { cx: 49, cz: -46, bw: 22, bd: 32, bh: 132 },
  { cx: -35, cz: 57, bw: 22, bd: 22, bh: 108 },
  { cx: 6, cz: 59, bw: 32, bd: 20, bh: 154 }
];
function isCentralBuilding(b) {
  return CENTRAL_BUILDINGS.some((c) => c.cx === b.cx && c.cz === b.cz && c.bw === b.bw && c.bd === b.bd);
}
function skylineMasses(b) {
  if (!isCentralBuilding(b)) return [{ x: b.cx, y: b.bh / 2, z: b.cz, w: b.bw, h: b.bh, d: b.bd }];
  const fractions = [0.72, 0.18, 0.1], widths = [1, 0.76, 0.48];
  let base = 0;
  return fractions.map((fraction, i) => {
    const h = b.bh * fraction;
    const mass = { x: b.cx, y: base + h / 2, z: b.cz, w: b.bw * widths[i], h, d: b.bd * widths[i] };
    base += h;
    return mass;
  });
}
function neighborhoodHeight(x, z, original, index) {
  if (original <= 16) return original;
  let seed = (Math.imul(Math.round(x * 31), 73856093) ^ Math.imul(Math.round(z * 31), 19349663) ^ Math.imul(index + 1, 83492791)) >>> 0;
  seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
  const varied = seed / 4294967296;
  const central = Math.max(0, 1 - Math.hypot(x + 5, z - 10) / 210);
  return Math.round(24 + original * 0.7 + central * central * (38 + varied * 70) + varied * 24);
}

// src/world/WindowLightCycle.ts
var WindowLightCycle = class {
  brightness = 1;
  seed;
  start = -1;
  duration = 2;
  from = 1;
  target = 1;
  next;
  constructor(seed) {
    this.seed = seed >>> 0;
    for (let i = 0; i < 5; i++) this.random();
    this.brightness = this.random() < 0.35 ? 0.025 : 1;
    this.from = this.target = this.brightness;
    this.next = 5 + this.random() * 10;
  }
  update(time) {
    if (!Number.isFinite(time) || time < 0) return this.brightness;
    if (time >= this.next) {
      this.from = this.brightness;
      this.target = this.target > 0.5 ? 0.025 : 1;
      this.start = time;
      this.duration = 1.2 + this.random() * 0.8;
      this.next = time + this.duration + 12 + this.random() * 23;
    }
    if (this.start >= 0) {
      const t = Math.min(1, Math.max(0, (time - this.start) / this.duration));
      const eased = t * t * (3 - 2 * t);
      this.brightness = this.from + (this.target - this.from) * eased;
    }
    return this.brightness;
  }
  random() {
    this.seed = Math.imul(this.seed, 1664525) + 1013904223 >>> 0;
    return this.seed / 4294967296;
  }
};

// src/world/WindowApertures.ts
function uncoveredWindowApertures(sources, details) {
  const cells = /* @__PURE__ */ new Map();
  return sources.flatMap((s) => {
    const cx = Math.floor(s.x / 32), cz = Math.floor(s.z / 32), key = `${cx},${cz}`;
    let nearby = cells.get(key);
    if (!nearby) {
      nearby = details.filter((b) => b.x + b.w / 2 >= cx * 32 - 4 && b.x - b.w / 2 <= (cx + 1) * 32 + 4 && b.z + b.d / 2 >= cz * 32 - 4 && b.z - b.d / 2 <= (cz + 1) * 32 + 4);
      cells.set(key, nearby);
    }
    let rectangles = [{ left: -(s.width ?? 1) / 2, right: (s.width ?? 1) / 2, bottom: -(s.height ?? 1) / 2, top: (s.height ?? 1) / 2 }];
    for (const b of nearby) {
      const depth = (b.x - s.x) * s.nx + (b.z - s.z) * s.nz, halfDepth = (s.nx ? b.w : b.d) / 2;
      if (depth + halfDepth < -0.01 || depth - halfDepth > 0.6) continue;
      const across = (b.x - s.x) * s.nz - (b.z - s.z) * s.nx, half = (s.nx ? b.d : b.w) / 2;
      const left = across - half - 0.01, right = across + half + 0.01, bottom = b.y - b.h / 2 - s.y - 0.01, top = b.y + b.h / 2 - s.y + 0.01;
      rectangles = rectangles.flatMap((r) => {
        const l = Math.max(left, r.left), rr = Math.min(right, r.right), lo = Math.max(bottom, r.bottom), hi = Math.min(top, r.top);
        if (l >= rr || lo >= hi) return [r];
        return [{ ...r, top: lo }, { ...r, bottom: hi }, { left: r.left, right: l, bottom: lo, top: hi }, { left: rr, right: r.right, bottom: lo, top: hi }].filter((p) => p.right - p.left > 0.08 && p.top - p.bottom > 0.08);
      });
      if (!rectangles.length) break;
    }
    return rectangles.map((r) => ({
      ...s,
      x: s.x + s.nz * (r.left + r.right) / 2,
      z: s.z - s.nx * (r.left + r.right) / 2,
      y: s.y + (r.bottom + r.top) / 2,
      width: r.right - r.left,
      height: r.top - r.bottom,
      powerShare: (s.powerShare ?? 1) * (r.right - r.left) * (r.top - r.bottom) / ((s.width ?? 1) * (s.height ?? 1))
    }));
  });
}
function windowApertures(panes, rooms, mass, buildingHeight) {
  const sources = [];
  for (const pane of panes) for (const room of rooms) {
    const r = room.rect.value, u0 = Math.max(pane.u0, r.x), u1 = Math.min(pane.u1, r.z);
    const v0 = Math.max(pane.v0, r.y, (mass.y - mass.h / 2) / buildingHeight);
    const v1 = Math.min(pane.v1, r.w, (mass.y + mass.h / 2) / buildingHeight);
    if (u1 <= u0 || v1 <= v0) continue;
    const u = (u0 + u1) / 2, y = (v0 + v1) / 2 * buildingHeight;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      sources.push({
        x: nx ? mass.x + nx * (mass.w / 2 + 0.025) : mass.x + nz * (u - 0.5) * mass.w,
        z: nz ? mass.z + nz * (mass.d / 2 + 0.025) : mass.z - nx * (u - 0.5) * mass.d,
        y,
        nx,
        nz,
        kind: "window",
        color: pane.color,
        reach: Math.min(12, Math.max(5, y / 0.85)),
        width: (u1 - u0) * (nx ? mass.d : mass.w),
        height: (v1 - v0) * buildingHeight,
        powerShare: (u1 - u0) * (v1 - v0) / ((pane.u1 - pane.u0) * (pane.v1 - pane.v0)),
        occupancy: room.light
      });
    }
  }
  return sources;
}

// src/shared/cityPlan.ts
var CITY_STREETS = [
  { x: -15, z: -18, w: 362, d: 14 },
  { x: 70, z: -15, w: 14, d: 362 },
  { x: -60, z: -10, w: 12, d: 310 },
  { x: -15, z: -102, w: 362, d: 12 },
  { x: -63, z: 28, w: 266, d: 12 },
  { x: 118, z: 40, w: 96, d: 14 },
  { x: -15, z: 145, w: 362, d: 10 },
  { x: -175, z: -15, w: 12, d: 362 },
  { x: -150, z: -146, w: 10, d: 88 },
  { x: 145, z: -146, w: 10, d: 88 },
  { x: 90, z: 22, w: 12, d: 246 },
  { x: -63, z: 130, w: 266, d: 12 },
  { x: 118, z: 95, w: 96, d: 10 },
  { x: -16, z: -87, w: 86, d: 8 },
  { x: 160, z: -55, w: 8, d: 90 },
  { x: -100, z: -57, w: 10, d: 68 }
];
function landmarkReservation(x, z, w = 0, d = 0) {
  const overlaps = (cx, cz, rw, rd) => Math.abs(x - cx) < (rw + w) / 2 && Math.abs(z - cz) < (rd + d) / 2;
  return overlaps(-16, -59, 78, 58) || overlaps(130, -61, 62, 76) || overlaps(-137, 0, 44, 70) || overlaps(125, 118, 64, 50) || overlaps(-105, 88, 92, 76) || overlaps(-54, 52, 14, 32) || overlaps(0, 124, 16, 36) || overlaps(124, 0, 36, 16) || overlaps(-124, 0, 36, 16);
}
var INFILL = [
  // Short shop/workshop blocks define lanes beside the taller rows and civic buildings.
  { cx: 40, cz: 72, bw: 18, bd: 10, bh: 10 },
  { cx: -38, cz: 119, bw: 20, bd: 8, bh: 12 },
  { cx: 35, cz: 119, bw: 26, bd: 8, bh: 9 },
  { cx: 110, cz: 22, bw: 20, bd: 16, bh: 11 },
  { cx: 140, cz: 22, bw: 24, bd: 16, bh: 14 },
  { cx: 36, cz: -74, bw: 20, bd: 10, bh: 12 },
  { cx: -40, cz: 92, bw: 20, bd: 30, bh: 42 },
  { cx: -20, cz: 92, bw: 20, bd: 30, bh: 35 },
  { cx: 10, cz: 94, bw: 20, bd: 22, bh: 31 },
  { cx: 30, cz: 94, bw: 20, bd: 22, bh: 46 },
  { cx: 46, cz: 94, bw: 12, bd: 22, bh: 38 },
  { cx: 110, cz: 64, bw: 20, bd: 26, bh: 16 },
  { cx: 130, cz: 64, bw: 20, bd: 26, bh: 44 },
  { cx: 148, cz: 64, bw: 16, bd: 26, bh: 12 }
];
var lot = (x, z, w, d, padding = 0) => ({
  x0: x - w / 2 - padding,
  x1: x + w / 2 + padding,
  z0: z - d / 2 - padding,
  z1: z + d / 2 + padding
});
var CITY_SPAWN_CLEARANCES = [
  [-10, -27],
  [22, -28],
  [82, -24],
  [-55, 25],
  [-166, 35],
  [130, -24],
  [15, 135],
  [-75, -87],
  [77, 75],
  [-16, -48],
  [-105, 120],
  [46, 53]
];
var LANDMARK_LOTS = [
  lot(-16, -59, 78, 58),
  lot(130, -61, 62, 76),
  lot(-137, 0, 44, 70),
  lot(125, 118, 64, 50),
  lot(-105, 88, 92, 76),
  // Enclosed ramp wells plus clear sidewalks and their deliberate upper approaches.
  lot(-54, 52, 18, 36),
  lot(0, 124, 20, 40),
  lot(124, 0, 40, 20),
  lot(-124, 0, 40, 20),
  lot(-54, 74, 12, 12),
  lot(0, 150, 12, 12),
  lot(150, 0, 12, 12),
  lot(-150, 0, 12, 12),
  // The two deliberately open forecourts.
  lot(-15.5, -29.5, 31, 13),
  lot(130, -19.5, 32, 21),
  // Existing central blocks retain their models and six-unit service lanes.
  lot(-40, 9, 20, 16, 6),
  lot(-9, 10, 24, 18, 6),
  lot(30, 6, 20, 20, 6),
  lot(49, -46, 22, 32, 6),
  lot(-35, 57, 22, 22, 6),
  lot(6, 59, 32, 20, 6)
];
function subtract(area, cut) {
  const x0 = Math.max(area.x0, cut.x0), x1 = Math.min(area.x1, cut.x1);
  const z0 = Math.max(area.z0, cut.z0), z1 = Math.min(area.z1, cut.z1);
  if (x0 >= x1 || z0 >= z1) return [area];
  return [
    { x0: area.x0, x1: x0, z0: area.z0, z1: area.z1 },
    { x0: x1, x1: area.x1, z0: area.z0, z1: area.z1 },
    { x0, x1, z0: area.z0, z1: z0 },
    { x0, x1, z0: z1, z1: area.z1 }
  ].filter((r) => r.x1 > r.x0 && r.z1 > r.z0);
}
function mergeLots(lots) {
  let joined = true;
  while (joined) {
    joined = false;
    outer: for (let a = 0; a < lots.length; a++) for (let b = a + 1; b < lots.length; b++) {
      const p = lots[a], q = lots[b];
      if (p.x0 === q.x0 && p.x1 === q.x1 && (p.z1 === q.z0 || q.z1 === p.z0) || p.z0 === q.z0 && p.z1 === q.z1 && (p.x1 === q.x0 || q.x1 === p.x0)) {
        lots[a] = { x0: Math.min(p.x0, q.x0), x1: Math.max(p.x1, q.x1), z0: Math.min(p.z0, q.z0), z1: Math.max(p.z1, q.z1) };
        lots.splice(b, 1);
        joined = true;
        break outer;
      }
    }
  }
  return lots;
}
function frontageSpans(min, max, maximum) {
  const count = Math.ceil((max - min + 8) / (maximum + 8));
  const size = (max - min - (count - 1) * 8) / count;
  return Array.from({ length: count }, (_, i) => [min + i * (size + 8), min + i * (size + 8) + size]);
}
function cityStreetBuildings(original) {
  const cuts = [
    ...CITY_STREETS.map((r) => lot(r.x, r.z, r.w, r.d, 1)),
    ...LANDMARK_LOTS,
    ...CITY_SPAWN_CLEARANCES.map(([x, z]) => lot(x, z, 4, 4)),
    ...INFILL.map((b) => lot(b.cx, b.cz, b.bw, b.bd, 6))
  ];
  let available = [{ x0: -189, x1: 159, z0: -189, z1: 159 }];
  for (const cut of cuts) available = available.flatMap((area) => subtract(area, cut));
  available = mergeLots(available);
  const buildings = [...INFILL];
  const heights = [9, 12, 16, 24, 32, 42, 24, 16, 55, 32];
  let frontage = 0;
  for (const area of available) {
    if (area.x1 - area.x0 < 9 || area.z1 - area.z0 < 9) continue;
    for (const [x0, x1] of frontageSpans(area.x0, area.x1, 54)) {
      for (const [z0, z1] of frontageSpans(area.z0, area.z1, 44)) {
        const segments = Math.max(1, Math.round((x1 - x0) / 24));
        const width = (x1 - x0) / segments;
        for (let segment = 0; segment < segments; segment++) {
          const seedHeight = original.length ? Math.floor(original[frontage % original.length].bh) : frontage;
          buildings.push({
            cx: x0 + (segment + 0.5) * width,
            cz: (z0 + z1) / 2,
            bw: width,
            bd: z1 - z0,
            bh: heights[(frontage + seedHeight) % heights.length]
          });
          frontage++;
        }
      }
    }
  }
  return buildings.map((b, i) => ({ ...b, bh: neighborhoodHeight(b.cx, b.cz, b.bh, i) }));
}

// src/shared/sewerLayout.ts
var FLOOR = -7;
var CEILING = -1;
var HALL = 8;
var HALF = HALL / 2;
var WALL = 1;
var RISE = 7;
var RUN = 24;
var WALK = CEILING - FLOOR;
var FLOOR_COLOR = 1975330;
var WALL_COLOR = 2765359;
var CEILING_COLOR = 1711644;
var RAMP_COLOR = 3291702;
var SEWER_MAINTENANCE_FURNISHINGS = [
  { x: 69.45, y: -5.8, z: -37.2, w: 0.9, h: 2.4, d: 5.2, color: 2372156, rx: 0, rz: 0 },
  { x: 66.4, y: -5.3, z: -30.45, w: 3.2, h: 3.4, d: 0.9, color: 2372156, rx: 0, rz: 0 }
];
var SEWER_HALLS = [
  { xmin: -112, xmax: 112, zmin: -HALF, zmax: HALF },
  { xmin: -HALF, xmax: HALF, zmin: -HALF, zmax: 112 },
  { xmin: -6, xmax: 6, zmin: -6, zmax: 6 },
  { xmin: -88, xmax: -80, zmin: -HALF, zmax: 44 },
  { xmin: -88, xmax: -58, zmin: 36, zmax: 44 },
  { xmin: -50, xmax: 4, zmin: 36, zmax: 44 },
  { xmin: -58, xmax: -50, zmin: 36, zmax: 40 },
  { xmin: 44, xmax: 52, zmin: -40, zmax: HALF },
  { xmin: 52, xmax: 68, zmin: -40, zmax: -32 },
  { xmin: 60, xmax: 70, zmin: -42, zmax: -30 }
];
var OPENINGS = [
  { xmin: 112, xmax: 112, zmin: -HALF, zmax: HALF },
  { xmin: -112, xmax: -112, zmin: -HALF, zmax: HALF },
  { xmin: -HALF, xmax: HALF, zmin: 112, zmax: 112 },
  { xmin: -58, xmax: -50, zmin: 40, zmax: 40 }
];
var SEWER_ENTRIES = [
  { x: -138, z: 0, name: "Gate", axis: "x" },
  { x: 138, z: 0, name: "Icebox", axis: "x" },
  { x: 0, z: 138, name: "Alley", axis: "z" },
  { x: -54, z: 66, name: "Needleworks", axis: "z" }
];
var SEWER_MANHOLE = { x: 72, z: 0, halfWidth: 2, shaftBottom: -3, floorY: FLOOR };
var SEWER_PIPE_PORTAL = { mouthX: -142, endX: -112, z: 0, radius: 4.5, springY: 0.65 };
var SEWER_PIPE_ENTRANCES = SEWER_ENTRIES.map((entry) => ({
  ...entry,
  direction: entry.axis === "x" ? Math.sign(entry.x) : 1,
  radius: SEWER_PIPE_PORTAL.radius,
  springY: SEWER_PIPE_PORTAL.springY,
  length: 30
}));
function sewerPipePoint(entry, distance, across = 0) {
  const along = entry[entry.axis] + entry.direction * (4 - distance);
  return {
    x: entry.axis === "x" ? along : entry.x + across,
    z: entry.axis === "z" ? along : entry.z + across,
    floorY: -Math.max(0, Math.min(RUN, distance - 6)) * RISE / RUN
  };
}
function sewerPipeBoxes() {
  const boxes = [];
  const facets = 8;
  const spans = [{ distance: 3, length: 6, drop: 0 }, ...Array.from({ length: 6 }, (_, i) => ({
    distance: 8 + i * 4,
    length: 4,
    drop: 4 * RISE / RUN
  }))];
  for (const entry of SEWER_PIPE_ENTRANCES) {
    const horizontal = entry.axis === "x";
    for (const span of spans) {
      for (let i = 0; i < facets; i++) {
        const angle = (i + 0.5) * Math.PI / facets;
        const p = sewerPipePoint(entry, span.distance, Math.cos(angle) * entry.radius);
        const facet = 2 * entry.radius * Math.tan(Math.PI / (facets * 2)) + span.drop * Math.abs(Math.cos(angle));
        const thickness = 0.36 + span.drop * Math.sin(angle);
        boxes.push({ ...make(
          p.x,
          p.floorY + entry.springY + Math.sin(angle) * entry.radius,
          p.z,
          horizontal ? span.length + 0.12 : facet,
          thickness,
          horizontal ? facet : span.length + 0.12,
          3752505,
          horizontal ? Math.PI / 2 - angle : 0,
          horizontal ? 0 : angle - Math.PI / 2
        ), hidden: true });
      }
      for (const side of [-1, 1]) {
        const p = sewerPipePoint(entry, span.distance, side * entry.radius);
        boxes.push({ ...make(
          p.x,
          p.floorY + 0.25,
          p.z,
          horizontal ? span.length + 0.12 : 0.66,
          1.1 + span.drop,
          horizontal ? 0.66 : span.length + 0.12,
          3752505
        ), hidden: true });
      }
    }
  }
  return boxes;
}
function sewerGroundOpening(x, z) {
  const m = SEWER_MANHOLE;
  return sewerRampOpening(x, z) || Math.abs(x - m.x) < m.halfWidth && Math.abs(z - m.z) < m.halfWidth;
}
function ceilingPieces(r) {
  const m = SEWER_MANHOLE;
  const x0 = Math.max(r.xmin, m.x - m.halfWidth), x1 = Math.min(r.xmax, m.x + m.halfWidth);
  const z0 = Math.max(r.zmin, m.z - m.halfWidth), z1 = Math.min(r.zmax, m.z + m.halfWidth);
  if (x0 >= x1 || z0 >= z1) return [r];
  return [
    { xmin: r.xmin, xmax: x0, zmin: r.zmin, zmax: r.zmax },
    { xmin: x1, xmax: r.xmax, zmin: r.zmin, zmax: r.zmax },
    { xmin: x0, xmax: x1, zmin: r.zmin, zmax: z0 },
    { xmin: x0, xmax: x1, zmin: z1, zmax: r.zmax }
  ].filter((p) => p.xmax > p.xmin && p.zmax > p.zmin);
}
function make(x, y, z, w, h, d, color, rx = 0, rz = 0) {
  return { x, y, z, w, h, d, color, rx, rz };
}
function unique(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function inside(rects, x, z, eps = 1e-4) {
  return rects.some((r) => x >= r.xmin - eps && x <= r.xmax + eps && z >= r.zmin - eps && z <= r.zmax + eps);
}
function onOpening(x, z, eps = 1e-4) {
  return OPENINGS.some((r) => x >= r.xmin - eps && x <= r.xmax + eps && z >= r.zmin - eps && z <= r.zmax + eps);
}
function boundaryWalls() {
  const xs = unique(SEWER_HALLS.flatMap((r) => [r.xmin, r.xmax]));
  const zs = unique(SEWER_HALLS.flatMap((r) => [r.zmin, r.zmax]));
  const walls = [];
  const y = FLOOR + WALK / 2;
  const probe = 1e-3;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], w = x1 - x0, mid = (x0 + x1) / 2;
    if (w < probe) continue;
    for (const z of zs) {
      const neg = inside(SEWER_HALLS, mid, z - probe);
      const pos = inside(SEWER_HALLS, mid, z + probe);
      if (neg === pos || onOpening(mid, z)) continue;
      walls.push(make(mid, y, z + (neg ? 1 : -1) * WALL / 2, w, WALK, WALL, WALL_COLOR));
    }
  }
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j], z1 = zs[j + 1], d = z1 - z0, mid = (z0 + z1) / 2;
    if (d < probe) continue;
    for (const x of xs) {
      const neg = inside(SEWER_HALLS, x - probe, mid);
      const pos = inside(SEWER_HALLS, x + probe, mid);
      if (neg === pos || onOpening(x, mid)) continue;
      walls.push(make(x + (neg ? 1 : -1) * WALL / 2, y, mid, WALL, WALK, d, WALL_COLOR));
    }
  }
  return walls;
}
function ramps() {
  const slope = Math.atan(RISE / RUN);
  const length = Math.hypot(RUN, RISE);
  const y = FLOOR + RISE / 2 - WALL / 2 * Math.cos(slope);
  return [
    make(124, y, 0, length, WALL, HALL, RAMP_COLOR, 0, slope),
    make(-124, y, 0, length, WALL, HALL, RAMP_COLOR, 0, -slope),
    make(0, y, 124, HALL, WALL, length, RAMP_COLOR, -slope, 0),
    make(-54, y, 52, HALL, WALL, length, RAMP_COLOR, -slope, 0)
  ];
}
function landings() {
  const y = CEILING + WALL / 2;
  const along = 4;
  const across = 10;
  return [
    make(138, y, 0, along, WALL, across, FLOOR_COLOR),
    make(-138, y, 0, along, WALL, across, FLOOR_COLOR),
    make(0, y, 138, across, WALL, along, FLOOR_COLOR),
    make(-54, y, 66, across, WALL, along, FLOOR_COLOR)
  ];
}
function sewerBoxes() {
  const boxes = [];
  for (const r of SEWER_HALLS) {
    const x = (r.xmin + r.xmax) / 2, z = (r.zmin + r.zmax) / 2, w = r.xmax - r.xmin, d = r.zmax - r.zmin;
    boxes.push(make(x, FLOOR - WALL / 2, z, w, WALL, d, FLOOR_COLOR));
    for (const c of ceilingPieces(r)) boxes.push(make(
      (c.xmin + c.xmax) / 2,
      CEILING + WALL / 2,
      (c.zmin + c.zmax) / 2,
      c.xmax - c.xmin,
      WALL,
      c.zmax - c.zmin,
      CEILING_COLOR
    ));
  }
  boxes.push(...boundaryWalls(), ...ramps(), ...landings(), ...sewerPipeBoxes(), ...SEWER_MAINTENANCE_FURNISHINGS);
  const m = SEWER_MANHOLE, half = m.halfWidth, depth = -m.shaftBottom;
  for (const side of [-1, 1]) {
    boxes.push({ ...make(m.x + side * (half + 0.15), -depth / 2, m.z, 0.3, depth, half * 2 + 0.6, WALL_COLOR), hidden: true });
    boxes.push({ ...make(m.x, -depth / 2, m.z + side * (half + 0.15), half * 2, depth, 0.3, WALL_COLOR), hidden: true });
  }
  return boxes;
}
function sewerRampOpening(x, z) {
  if (x >= 112 && x <= 140 && Math.abs(z) < 5) return true;
  if (x <= -112 && x >= -140 && Math.abs(z) < 5) return true;
  if (z >= 112 && z <= 140 && Math.abs(x) < 5) return true;
  if (z >= 40 && z <= 68 && Math.abs(x + 54) < 5) return true;
  return false;
}

// src/shared/chaosState.ts
var CASE_SIZE = { x: 0.82, y: 0.62, z: 0.34 };
var DISPATCH_STATIONS = [
  { id: "records", x: -9.8, z: -34.5 },
  { id: "icebox", x: 115, z: -29 },
  { id: "needleworks", x: -110, z: 112.5 },
  { id: "pump", x: 145, z: 140 },
  { id: "gate", x: -150, z: 8 }
].map(({ id, x, z }) => ({
  id,
  box: { x, y: 1.8, z, w: 1.8, h: 3.6, d: 1.05 },
  target: { x, y: 2.3, z: z + 0.64, w: 0.84, h: 0.84, d: 0.1 }
}));
var DISPATCH_BOX = DISPATCH_STATIONS[0].box;
var DISPATCH_TARGET = DISPATCH_STATIONS[0].target;
var LAUNCH_MACHINES = [
  { id: "pressure", kind: "pressure", x: 146, z: 149, tx: 90, tz: 145, velocity: { x: 0, y: 90, z: 0 } },
  { id: "dumpster", kind: "dumpster", x: -57, z: -29, tx: -60, tz: -70, velocity: { x: 0, y: 90, z: 0 } },
  { id: "freight", kind: "freight", x: 130, z: -20, tx: 155, tz: 10, velocity: { x: 0, y: 90, z: 0 } },
  { id: "geyser", kind: "geyser", x: -153, z: 15, tx: -155, tz: -25, velocity: { x: 0, y: 90, z: 0 } },
  { id: "mousetrap", kind: "mousetrap", x: -106, z: 128, tx: -60, tz: 140, velocity: { x: 0, y: 90, z: 0 } },
  { id: "fan", kind: "fan", x: 75, z: 39, tx: 35, tz: 25, velocity: { x: 0, y: 90, z: 0 } }
].map((m) => ({
  id: m.id,
  kind: m.kind,
  label: { pressure: "PRESSURE WORKS", dumpster: "TRASH COMPACTOR", freight: "FREIGHT RAM", geyser: "SEWER GEYSER", mousetrap: "RAT TRAP", fan: "WIND TUNNEL" }[m.id],
  pad: { x: m.x, y: 0, z: m.z, radius: 5 },
  box: { x: m.tx, y: 1.6, z: m.tz, w: 1.7, h: 3.2, d: 1.7 },
  target: { x: m.tx, y: 3.75, z: m.tz, w: 1.4, h: 1.1, d: 1.4 },
  velocity: m.velocity,
  cooldownMs: 5e3,
  eventMs: 1500
}));
var PRESSURE_LAUNCH = LAUNCH_MACHINES[0];

// src/shared/streetLampLayout.ts
var STREET_LAMP_HEIGHT = 9;
var STREET_LAMP_SPACING = 24;
var CURB_OFFSET = 0.6;
function isStreetLampSite(x, z, buildings) {
  if (x < -191 || x > 161 || z < -191 || z > 161) return false;
  if (CITY_STREETS.some((r) => Math.abs(x - r.x) < r.w / 2 + 0.3 && Math.abs(z - r.z) < r.d / 2 + 0.3)) return false;
  if (!CITY_STREETS.some((r) => Math.abs(x - r.x) <= r.w / 2 + 1 && Math.abs(z - r.z) <= r.d / 2 + 1)) return false;
  if (landmarkReservation(x, z)) return false;
  if ([...DISPATCH_STATIONS, ...LAUNCH_MACHINES].some((s) => [s.box, s.target].some((b) => Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1))) return false;
  if (LAUNCH_MACHINES.some(({ pad }) => Math.hypot(x - pad.x, z - pad.z) < pad.radius + 1)) return false;
  if ([...buildings, ...CENTRAL_BUILDINGS].some((b) => Math.abs(x - b.cx) < b.bw / 2 + 0.35 && Math.abs(z - b.cz) < b.bd / 2 + 0.35)) return false;
  if (sewerGroundOpening(x, z) || Math.hypot(x - SEWER_MANHOLE.x, z - SEWER_MANHOLE.z) < 7) return false;
  if (SEWER_ENTRIES.some((entry) => {
    const along = entry.axis === "x" ? x : z, across = entry.axis === "x" ? z : x;
    const direction = entry.axis === "x" ? Math.sign(entry.x) : 1;
    const distance = (along - entry[entry.axis]) * direction;
    return distance > -28 && distance < 16 && Math.abs(across - (entry.axis === "x" ? entry.z : entry.x)) < 9;
  })) return false;
  return true;
}
function generatedStreetLamps(buildings, fixed) {
  return regularStreetLamps(buildings, STREET_LAMP_SPACING, fixed);
}
function regularStreetLamps(buildings, spacing = STREET_LAMP_SPACING, avoid = []) {
  const placed = [];
  for (const road of CITY_STREETS) {
    const horizontal = road.w > road.d, span = horizontal ? road.w : road.d, center = horizontal ? road.x : road.z;
    for (let along = Math.ceil((center - span / 2 + 10) / spacing) * spacing; along < center + span / 2 - 10; along += spacing) {
      for (const side of [-1, 1]) {
        const x = horizontal ? along : road.x + side * (road.w / 2 + CURB_OFFSET);
        const z = horizontal ? road.z + side * (road.d / 2 + CURB_OFFSET) : along;
        if (!isStreetLampSite(x, z, buildings) || [...avoid, ...placed].some(([px, pz]) => Math.hypot(px - x, pz - z) < 10)) continue;
        placed.push([x, z]);
      }
    }
  }
  return placed;
}

// src/shared/streetDebris.ts
function streetDebris(existing, opening) {
  const result = [];
  const buildings = existing.filter((b) => b.building && b.y - b.h / 2 < 0.1 && b.w > 10 && b.d > 10);
  const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 0.15 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + 0.15 && a.y + a.h / 2 > b.y - b.h / 2 + 0.05 && a.y - a.h / 2 < b.y + b.h / 2 - 0.05;
  buildings.forEach((building, i) => {
    for (const side of [-1, 1]) {
      const kind = i % 4 === 0 ? "dumpster" : i % 3 === 0 ? "crate" : "bin";
      const w = kind === "dumpster" ? 2.8 : 1.15, h = kind === "dumpster" ? 1.65 : 1.25, d = kind === "dumpster" ? 1.5 : 1.15;
      const box = { x: building.x + side * (building.w * 0.29), z: building.z + side * (building.d / 2 + 1.25), y: h / 2, w, h, d, color: 3161395, rx: 0, rz: 0, hidden: true, debris: kind };
      if (LAUNCH_MACHINES.some((m) => Math.hypot(box.x - m.pad.x, box.z - m.pad.z) < m.pad.radius + 2 || Math.hypot(box.x - m.box.x, box.z - m.box.z) < 3) || DISPATCH_STATIONS.some((s) => Math.hypot(box.x - s.box.x, box.z - s.box.z) < 3) || opening(box.x, box.z) || existing.some((b) => overlaps(box, b)) || result.some((b) => overlaps(box, b))) continue;
      result.push(box);
    }
  });
  return result;
}

// src/shared/worldSpec.ts
var WORLD_LAYOUT_VERSION = 1;
var DEFAULT_CITY_OPTIONS = {
  gridSize: 12,
  blockSpacing: 30,
  streetWidth: 14,
  minHeight: 18,
  maxHeight: 85,
  buildingWidthMin: 8,
  buildingWidthMax: 14
};
function createSeededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 1831565813;
    let n = Math.imul(t ^ t >>> 15, 1 | t);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function layoutRandom(spec2) {
  return createSeededRandom(spec2.seed ^ Math.imul(spec2.version, 2654435769));
}
function createDecorationRandom(spec2) {
  return createSeededRandom(spec2.seed + 2654435769 ^ Math.imul(spec2.version, 3235823838));
}
function createWorldSpec(seed) {
  const value = seed === void 0 ? crypto.getRandomValues(new Uint32Array(1))[0] : seed >>> 0;
  return { seed: value, version: WORLD_LAYOUT_VERSION };
}
function generateBuildingLayout(spec2, options) {
  if (spec2.version === GRAYBOX_VERSION) {
    return grayboxBoxes({ seed: spec2.seed, version: spec2.version }).filter((box) => box.building).map((box) => ({ cx: box.x, cz: box.z, bw: box.w, bd: box.d, bh: box.h }));
  }
  const { gridSize, blockSpacing, minHeight, maxHeight, buildingWidthMin, buildingWidthMax } = {
    ...DEFAULT_CITY_OPTIONS,
    ...options
  };
  const random = layoutRandom(spec2);
  const half = gridSize / 2;
  const buildings = [];
  for (let gx = -half; gx < half; gx++) {
    for (let gz = -half; gz < half; gz++) {
      buildings.push({
        cx: gx * blockSpacing,
        cz: gz * blockSpacing,
        bw: buildingWidthMin + random() * (buildingWidthMax - buildingWidthMin),
        bd: buildingWidthMin + random() * (buildingWidthMax - buildingWidthMin),
        bh: minHeight + random() * (maxHeight - minHeight)
      });
    }
  }
  return buildings;
}

// src/shared/landmarkLayout.ts
var WALL2 = 1.2;
var FLOOR_H = 0.6;
var RAMP_H = 0.6;
var RISE2 = 8;
var RUN2 = 22;
var STAIR_W = 6;
var DOOR_H = 7;
var ROOF = 24;
var STEP_COUNT = 32;
var TREAD_H = 0.14;
var PLAYABLE = [0, 8, 16];
var STAIR_LIGHT = 15249520;
var LANDMARK_INTERIORS = [
  { id: "records", name: "Records Hall", cx: -16, cz: -59, w: 64, d: 44, levels: [...PLAYABLE] },
  { id: "icebox", name: "Icebox", cx: 130, cz: -61, w: 48, d: 60, levels: [0, 8] },
  { id: "needleworks", name: "Needleworks", cx: -105, cz: 82, w: 76, d: 52, levels: [...PLAYABLE] },
  { id: "pump", name: "Pumping Station", cx: 125, cz: 118, w: 50, d: 38, levels: [0, 8] }
];
var SPECS = [
  {
    id: "records",
    name: "Records Hall",
    xmin: -48,
    xmax: 16,
    zmin: -81,
    zmax: -37,
    wall: 1841188,
    floor: 2367532,
    ramp: 3420216,
    tread: 4866894,
    upper: 2695983,
    openings: [
      { wall: "south", center: -16, width: 10, height: DOOR_H },
      { wall: "north", center: -16, width: 8, height: DOOR_H },
      { wall: "west", center: -59, width: 8, height: DOOR_H }
    ]
  },
  {
    id: "icebox",
    name: "Icebox",
    xmin: 106,
    xmax: 154,
    zmin: -91,
    zmax: -31,
    wall: 1515049,
    floor: 2107958,
    ramp: 2766916,
    tread: 4017752,
    upper: 2107958,
    openings: [
      { wall: "south", center: 130, width: 12, height: DOOR_H },
      { wall: "east", center: -48, width: 10, height: DOOR_H },
      { wall: "north", center: 130, width: 8, height: DOOR_H }
    ]
  },
  {
    id: "needleworks",
    name: "Needleworks",
    xmin: -143,
    xmax: -67,
    zmin: 56,
    zmax: 108,
    wall: 2169381,
    floor: 2760748,
    ramp: 3812665,
    tread: 5127500,
    upper: 2760748,
    openings: [
      { wall: "south", center: -105, width: 12, height: DOOR_H },
      { wall: "east", center: 82, width: 10, height: DOOR_H },
      { wall: "north", center: -105, width: 8, height: DOOR_H }
    ]
  },
  {
    id: "pump",
    name: "Pumping Station",
    xmin: 100,
    xmax: 150,
    zmin: 99,
    zmax: 137,
    wall: 1841956,
    floor: 2630704,
    ramp: 3157047,
    tread: 4143173,
    upper: 2301996,
    openings: [
      { wall: "south", center: 125, width: 10, height: DOOR_H },
      { wall: "north", center: 125, width: 8, height: DOOR_H },
      { wall: "east", center: 118, width: 8, height: DOOR_H }
    ]
  }
];
function make2(x, y, z, w, h, d, color, rx = 0, rz = 0, extra = {}) {
  return { x, y, z, w, h, d, color, rx, rz, ...extra };
}
function subtractRect(r, hole) {
  const ix0 = Math.max(r.xmin, hole.xmin), ix1 = Math.min(r.xmax, hole.xmax);
  const iz0 = Math.max(r.zmin, hole.zmin), iz1 = Math.min(r.zmax, hole.zmax);
  if (ix0 >= ix1 || iz0 >= iz1) return [r];
  const out = [];
  if (r.xmin < ix0) out.push({ xmin: r.xmin, xmax: ix0, zmin: r.zmin, zmax: r.zmax });
  if (ix1 < r.xmax) out.push({ xmin: ix1, xmax: r.xmax, zmin: r.zmin, zmax: r.zmax });
  if (r.zmin < iz0) out.push({ xmin: ix0, xmax: ix1, zmin: r.zmin, zmax: iz0 });
  if (iz1 < r.zmax) out.push({ xmin: ix0, xmax: ix1, zmin: iz1, zmax: r.zmax });
  return out.filter((q) => q.xmax - q.xmin > 0.08 && q.zmax - q.zmin > 0.08);
}
function punch(rects, hole) {
  return rects.flatMap((r) => subtractRect(r, hole));
}
function fromLocal(b, lx, ly, lz) {
  const cx = Math.cos(b.rx), sx = Math.sin(b.rx);
  const cz = Math.cos(b.rz), sz = Math.sin(b.rz);
  const y1 = cx * ly - sx * lz, z1 = sx * ly + cx * lz;
  return { x: b.x + cz * lx - sz * y1, y: b.y + sz * lx + cz * y1, z: b.z + z1 };
}
function addWall(boxes, face, spec2, opening) {
  const { xmin, xmax, zmin, zmax, wall } = spec2;
  const y0 = 0, y1 = ROOF, mid = (y0 + y1) / 2, h = y1 - y0;
  const alongX = face === "north" || face === "south";
  const u = alongX ? face === "south" ? zmax - WALL2 / 2 : zmin + WALL2 / 2 : face === "east" ? xmax - WALL2 / 2 : xmin + WALL2 / 2;
  const v0 = alongX ? xmin : zmin, v1 = alongX ? xmax : zmax;
  const push = (vc, vw, yc, yh) => {
    boxes.push(alongX ? make2(vc, yc, u, vw, yh, WALL2, wall) : make2(u, yc, vc, WALL2, yh, vw, wall));
  };
  if (!opening) {
    push((v0 + v1) / 2, v1 - v0, mid, h);
    return;
  }
  const o0 = opening.center - opening.width / 2, o1 = opening.center + opening.width / 2;
  if (o0 > v0) push((v0 + o0) / 2, o0 - v0, mid, h);
  if (o1 < v1) push((o1 + v1) / 2, v1 - o1, mid, h);
  if (opening.height < h) {
    const ly0 = y0 + opening.height;
    push(opening.center, opening.width, (ly0 + y1) / 2, y1 - ly0);
  }
}
function innerRect(spec2) {
  return { xmin: spec2.xmin + WALL2, xmax: spec2.xmax - WALL2, zmin: spec2.zmin + WALL2, zmax: spec2.zmax - WALL2 };
}
function stairBand(spec2, wall, inset) {
  const innerX0 = spec2.xmin + WALL2, innerX1 = spec2.xmax - WALL2;
  const x = wall === "west" ? innerX0 + inset + STAIR_W / 2 : innerX1 - inset - STAIR_W / 2;
  return { x, xmin: x - STAIR_W / 2, xmax: x + STAIR_W / 2 };
}
function stairRun(spec2, dir) {
  const innerZ0 = spec2.zmin + WALL2, innerZ1 = spec2.zmax - WALL2;
  if (dir === 1) {
    const z0 = innerZ0 + 0.7;
    return { z0, z1: z0 + RUN2, dir };
  }
  const z1 = innerZ1 - 0.7;
  return { z0: z1 - RUN2, z1, dir };
}
function addStair(boxes, treads, spec2, from, wall, inset, dir, run = stairRun(spec2, dir)) {
  const band = stairBand(spec2, wall, inset);
  const slope = Math.atan(RISE2 / RUN2);
  const length = Math.hypot(RUN2, RISE2);
  const lift = RAMP_H / 2 * Math.cos(slope);
  const rx = dir === 1 ? -slope : slope;
  boxes.push(make2(
    band.x,
    from + RISE2 / 2 - lift,
    (run.z0 + run.z1) / 2,
    STAIR_W,
    RAMP_H,
    length,
    spec2.ramp,
    rx,
    0,
    { hidden: true }
  ));
  const stepRun = RUN2 / STEP_COUNT;
  for (let i = 0; i < STEP_COUNT; i++) {
    const t = (i + 0.5) / STEP_COUNT;
    const z = dir === 1 ? run.z0 + t * RUN2 : run.z1 - t * RUN2;
    const yTop = from + t * RISE2;
    treads.push(make2(band.x, yTop + 0.02 - TREAD_H / 2, z, STAIR_W - 0.15, TREAD_H, stepRun + 0.16, spec2.tread));
  }
  return { xmin: band.xmin - 0.35, xmax: band.xmax + 0.35, zmin: run.z0 - 0.25, zmax: run.z1 + 0.25 };
}
function hallCenter(spec2) {
  return { cx: (spec2.xmin + spec2.xmax) / 2, cz: (spec2.zmin + spec2.zmax) / 2 };
}
function addFloorRects(boxes, spec2, level, rects) {
  for (const r of rects) {
    boxes.push(make2((r.xmin + r.xmax) / 2, level - FLOOR_H / 2, (r.zmin + r.zmax) / 2, r.xmax - r.xmin, FLOOR_H, r.zmax - r.zmin, spec2.floor));
  }
}
function addEnclosure(boxes, spec2) {
  const openingAt = (wall) => spec2.openings.find((o) => o.wall === wall);
  addWall(boxes, "south", spec2, openingAt("south"));
  addWall(boxes, "north", spec2, openingAt("north"));
  addWall(boxes, "east", spec2, openingAt("east"));
  addWall(boxes, "west", spec2, openingAt("west"));
  const { cx, cz } = hallCenter(spec2);
  boxes.push(make2(cx, ROOF + FLOOR_H / 2, cz, spec2.xmax - spec2.xmin - 0.2, FLOOR_H, spec2.zmax - spec2.zmin - 0.2, spec2.floor));
  boxes.push(make2(cx, 30 + FLOOR_H / 2, cz, spec2.xmax - spec2.xmin, 12 - FLOOR_H, spec2.zmax - spec2.zmin, spec2.upper, 0, 0, { building: true }));
}
var LANDMARK_FURNISHINGS = [
  { kind: "desk", x: -30, y: 0.8, z: -43, w: 8, h: 1.6, d: 3 },
  { kind: "desk", x: -2, y: 0.8, z: -43, w: 8, h: 1.6, d: 3 },
  ...[0, 8, 16].flatMap((y) => [
    { kind: "archive", x: -44, y: y + 2, z: -70, w: 2, h: 4, d: 7 },
    { kind: "archive", x: 12, y: y + 2, z: -70, w: 2, h: 4, d: 7 },
    { kind: "archive", x: -25, y: y + 2, z: -77, w: 8, h: 4, d: 2 },
    { kind: "archive", x: -7, y: y + 2, z: -77, w: 8, h: 4, d: 2 }
  ]),
  { kind: "cold-rack", x: 149, y: 2.3, z: -75, w: 4, h: 4.6, d: 8 },
  { kind: "cold-rack", x: 149, y: 2.3, z: -58, w: 4, h: 4.6, d: 8 },
  { kind: "cold-rack", x: 116, y: 10, z: -75, w: 3, h: 4, d: 8 },
  { kind: "desk", x: 136, y: 8.8, z: -86, w: 7, h: 1.6, d: 3 },
  ...[0, 8, 16].flatMap((y) => [
    { kind: "workbench", x: -117, y: y + 0.8, z: 62, w: 8, h: 1.6, d: 3 },
    { kind: "workbench", x: -92, y: y + 0.8, z: 102, w: 10, h: 1.6, d: 3 }
  ]),
  { kind: "workbench", x: -118, y: 0.8, z: 92, w: 9, h: 1.6, d: 4 },
  { kind: "workbench", x: -91, y: 8.8, z: 87, w: 9, h: 1.6, d: 4 },
  { kind: "workbench", x: -119, y: 16.8, z: 88, w: 9, h: 1.6, d: 4 },
  { kind: "pump", x: 118, y: 2.3, z: 113, w: 5, h: 4.6, d: 7 },
  { kind: "pump", x: 132, y: 2.3, z: 113, w: 5, h: 4.6, d: 7 },
  { kind: "pump", x: 132, y: 2.3, z: 129, w: 5, h: 4.6, d: 7 },
  { kind: "console", x: 116, y: 1, z: 133, w: 6, h: 2, d: 2 },
  { kind: "console", x: 144, y: 9, z: 126, w: 3, h: 2, d: 6 }
];
function divider(boxes, spec2, level, x, z, w, d) {
  boxes.push(make2(x, level + 3.3, z, w, 6.6, d, spec2.wall));
}
function rail(boxes, spec2, level, x, z, w, d) {
  boxes.push(make2(x, level + 0.55, z, w, 1.1, d, spec2.ramp));
}
function wellRails(boxes, spec2, level, r) {
  rail(boxes, spec2, level, r.xmin - 0.18, (r.zmin + r.zmax) / 2, 0.36, r.zmax - r.zmin);
  rail(boxes, spec2, level, r.xmax + 0.18, (r.zmin + r.zmax) / 2, 0.36, r.zmax - r.zmin);
  rail(boxes, spec2, level, (r.xmin + r.xmax) / 2, r.zmin - 0.18, r.xmax - r.xmin, 0.36);
  rail(boxes, spec2, level, (r.xmin + r.xmax) / 2, r.zmax + 0.18, r.xmax - r.xmin, 0.36);
}
function addRecords(boxes, treads, spec2) {
  addEnclosure(boxes, spec2);
  const rearRun = { z0: -74.5, z1: -52.5, dir: -1 };
  const well0 = addStair(boxes, treads, spec2, 0, "west", 6.8, -1, rearRun);
  const well1 = addStair(boxes, treads, spec2, 8, "east", 5.8, -1, rearRun);
  const readingWell = { xmin: -28, xmax: -4, zmin: -68, zmax: -50 };
  const inner = innerRect(spec2);
  addFloorRects(boxes, spec2, 0, [inner]);
  for (const level of [8, 16]) {
    const rects = punch(punch([inner], readingWell), level === 8 ? well0 : well1);
    addFloorRects(boxes, spec2, level, rects);
    wellRails(boxes, spec2, level, readingWell);
  }
  for (const level of [0, 8, 16]) {
    divider(boxes, spec2, level, -44.4, -48, 4.8, 0.7);
    divider(boxes, spec2, level, -30.9, -48, 4.2, 0.7);
    divider(boxes, spec2, level, -0.6, -48, 5.2, 0.7);
    divider(boxes, spec2, level, 12.4, -48, 4.8, 0.7);
    divider(boxes, spec2, level, -28.5, -66.5, 0.7, 9);
    divider(boxes, spec2, level, -3.5, -66.5, 0.7, 9);
    divider(boxes, spec2, level, -28.5, -52, 0.7, 4);
    divider(boxes, spec2, level, -3.5, -52, 0.7, 4);
  }
}
function addIcebox(boxes, treads, spec2) {
  addEnclosure(boxes, spec2);
  const well = addStair(boxes, treads, spec2, 0, "west", 0.35, -1, { z0: -65, z1: -43, dir: -1 });
  const inner = innerRect(spec2);
  addFloorRects(boxes, spec2, 0, [inner]);
  const west = { xmin: inner.xmin, xmax: 121.2, zmin: inner.zmin, zmax: inner.zmax };
  const rear = { xmin: 121.2, xmax: inner.xmax, zmin: inner.zmin, zmax: -81.8 };
  addFloorRects(boxes, spec2, 8, punch([west, rear], well));
  rail(boxes, spec2, 8, 121.02, -57, 0.36, 49.6);
  rail(boxes, spec2, 8, 137, -81.98, 31.6, 0.36);
  for (const z of [-84, -67, -50]) divider(boxes, spec2, 0, 144.7, z, 16.2, 0.7);
  for (const z of [-82, -69, -65, -52]) divider(boxes, spec2, 0, 136.6, z, 0.7, 4);
}
function addNeedleworks(boxes, treads, spec2) {
  addEnclosure(boxes, spec2);
  const well0 = addStair(boxes, treads, spec2, 0, "east", 2.4, 1, { z0: 59, z1: 81, dir: 1 });
  const well1 = addStair(boxes, treads, spec2, 8, "west", 6.8, -1, { z0: 64, z1: 86, dir: -1 });
  const inner = innerRect(spec2);
  const shaft1 = { xmin: -126, xmax: -108, zmin: 73, zmax: 92 };
  const shaft2 = { xmin: -104, xmax: -84, zmin: 71, zmax: 92 };
  addFloorRects(boxes, spec2, 0, [inner]);
  addFloorRects(boxes, spec2, 8, punch(punch([inner], shaft1), well0));
  addFloorRects(boxes, spec2, 16, punch(punch([inner], shaft2), well1));
  wellRails(boxes, spec2, 8, shaft1);
  wellRails(boxes, spec2, 16, shaft2);
  for (const level of [0, 8, 16]) {
    divider(boxes, spec2, level, -123, 68, 7, 0.7);
    divider(boxes, spec2, level, -112, 68, 4, 0.7);
    divider(boxes, spec2, level, -126.5, 62.6, 0.7, 10.8);
    divider(boxes, spec2, level, -110, 62.6, 0.7, 10.8);
    divider(boxes, spec2, level, -98, 97, 3, 0.7);
    divider(boxes, spec2, level, -84, 97, 13, 0.7);
    divider(boxes, spec2, level, -99.5, 102, 0.7, 9.6);
    divider(boxes, spec2, level, -77.5, 102, 0.7, 9.6);
  }
}
function addPump(boxes, treads, spec2) {
  addEnclosure(boxes, spec2);
  const well = addStair(boxes, treads, spec2, 0, "west", 0.35, 1, { z0: 109, z1: 131, dir: 1 });
  const inner = innerRect(spec2);
  addFloorRects(boxes, spec2, 0, [inner]);
  const west = { xmin: inner.xmin, xmax: 111.8, zmin: inner.zmin, zmax: inner.zmax };
  const east = { xmin: 138.2, xmax: inner.xmax, zmin: inner.zmin, zmax: inner.zmax };
  const rear = { xmin: 111.8, xmax: 138.2, zmin: inner.zmin, zmax: 106.8 };
  addFloorRects(boxes, spec2, 8, punch([west, east, rear], well));
  rail(boxes, spec2, 8, 111.62, 121.3, 0.36, 29);
  rail(boxes, spec2, 8, 138.38, 121.3, 0.36, 29);
  rail(boxes, spec2, 8, 125, 106.62, 26.4, 0.36);
  divider(boxes, spec2, 0, 120.6, 129.5, 0.7, 9);
  divider(boxes, spec2, 0, 112.2, 125, 1, 0.7);
  divider(boxes, spec2, 0, 119.6, 125, 2, 0.7);
}
function lightsOnRamp(ramp) {
  const along = ramp.rx ? ramp.d : ramp.w;
  return [0, 0.5, 1].map((t) => {
    const p = fromLocal(ramp, 0, ramp.h / 2, (t - 0.5) * along);
    return { x: p.x, y: p.y + 0.28, z: p.z, color: STAIR_LIGHT };
  });
}
var cache = null;
function build() {
  const boxes = [];
  const treads = [];
  for (const spec2 of SPECS) {
    if (spec2.id === "records") addRecords(boxes, treads, spec2);
    else if (spec2.id === "icebox") addIcebox(boxes, treads, spec2);
    else if (spec2.id === "needleworks") addNeedleworks(boxes, treads, spec2);
    else addPump(boxes, treads, spec2);
  }
  for (const f of LANDMARK_FURNISHINGS) boxes.push(make2(f.x, f.y, f.z, f.w, f.h, f.d, 3420987, 0, 0, { hidden: true }));
  const lights = boxes.filter((b) => b.hidden && (b.rx || b.rz)).flatMap(lightsOnRamp);
  return { boxes, treads, lights };
}
function assembled() {
  return cache ?? (cache = build());
}
function landmarkBoxes() {
  return assembled().boxes.slice();
}
var LANDMARK_STAIR_LIGHTS = assembled().lights;

// src/shared/vehicleLayout.ts
var VEHICLE_SCALE = 2;
var part = (role, y, z, w, h, d) => ({ role, x: 0, y, z, w, h, d });
function wheels(track, radius, rear, front, width = 0.32) {
  return [-1, 1].flatMap((side) => [rear, front].map((z) => ({ x: side * track, y: radius, z, radius, width })));
}
var VEHICLE_SHAPES = {
  reefer: {
    w: 3.2,
    d: 7.5,
    h: 3.8,
    parts: [part("chassis", 0.66, 0, 2.65, 0.38, 7.3), part("cargo", 2.3, -1.05, 3.2, 3, 5.4), part("cab", 1.72, 2.7, 2.9, 2.15, 2.1)],
    wheels: wheels(1.42, 0.56, -2.55, 2.6, 0.36)
  },
  van: {
    w: 2.8,
    d: 6,
    h: 2.9,
    parts: [part("chassis", 0.59, 0, 2.35, 0.32, 5.85), part("cargo", 1.82, -0.8, 2.7, 2.16, 4.4), part("cab", 1.57, 2.05, 2.65, 1.9, 1.85)],
    wheels: wheels(1.24, 0.48, -1.95, 1.95)
  },
  sedan: {
    w: 2.6,
    d: 5.5,
    h: 1.94,
    parts: [part("chassis", 0.78, 0, 2.5, 0.78, 5.5), part("cab", 1.46, -0.2, 2.15, 0.96, 2.65)],
    wheels: wheels(1.14, 0.43, -1.72, 1.72)
  },
  pickup: {
    w: 2.6,
    d: 5.8,
    h: 2.38,
    parts: [part("chassis", 0.72, 0, 2.4, 0.58, 5.8), part("bed", 1.08, -1.4, 2.5, 0.48, 2.9), part("cab", 1.6, 0.72, 2.4, 1.56, 1.6), part("hood", 1.1, 2.2, 2.35, 0.55, 1.3)],
    wheels: wheels(1.14, 0.49, -1.9, 1.95)
  }
};
var PARKED_VEHICLES = [
  { id: "icebox-loading-reefer", kind: "reefer", x: 126.5, z: -67, heading: 0, color: 5333354 },
  { id: "icebox-cold-room-van", kind: "van", x: 142, z: -75, heading: 0, color: 7436398 },
  { id: "icebox-curb-reefer", kind: "reefer", x: 144, z: -22, heading: 1, color: 5072236 },
  { id: "records-delivery", kind: "van", x: -30, z: -86, heading: 1, color: 4604754 },
  { id: "needleworks-delivery", kind: "van", x: -83, z: 119, heading: 1, color: 6443356 },
  { id: "pump-maintenance", kind: "pickup", x: 155, z: 129, heading: 0, color: 4940372 },
  { id: "avenue-sedan", kind: "sedan", x: 74, z: 50, heading: 0, color: 4928062 },
  { id: "west-curb-sedan", kind: "sedan", x: -178, z: -65, heading: 2, color: 3161674 }
];
function vehicleWorldPart(vehicle, p) {
  const { heading: q } = vehicle;
  const x = q === 0 ? p.x : q === 1 ? p.z : q === 2 ? -p.x : -p.z;
  const z = q === 0 ? p.z : q === 1 ? -p.x : q === 2 ? -p.z : p.x;
  return {
    x: vehicle.x + x * VEHICLE_SCALE,
    y: p.y * VEHICLE_SCALE,
    z: vehicle.z + z * VEHICLE_SCALE,
    w: (q % 2 ? p.d : p.w) * VEHICLE_SCALE,
    h: p.h * VEHICLE_SCALE,
    d: (q % 2 ? p.w : p.d) * VEHICLE_SCALE,
    color: vehicle.color,
    rx: 0,
    rz: 0,
    hidden: true
  };
}
function vehicleBoxes(vehicles = PARKED_VEHICLES) {
  return vehicles.flatMap((vehicle) => {
    const shape = VEHICLE_SHAPES[vehicle.kind];
    return [...shape.parts, ...shape.wheels.map((w) => ({ x: w.x, y: w.y, z: w.z, w: w.width, h: w.radius * 2, d: w.radius * 2 }))].map((p) => vehicleWorldPart(vehicle, p));
  });
}
var vehicleRestSurfaces = PARKED_VEHICLES.flatMap((vehicle) => VEHICLE_SHAPES[vehicle.kind].parts.map((p) => vehicleWorldPart(vehicle, p)));

// src/shared/grayboxLayout.ts
var GRAYBOX_VERSION = 2;
var CITY_BOUNDS = { min: -196, max: 166 };
var CITY_PREVIEW_SEED = 20260907;
var originalCityBuildingAllowed = (x, z) => !landmarkReservation(x, z) && !(Math.abs(x) < 65 && Math.abs(z) < 75);
var BLOCKS = CENTRAL_BUILDINGS.map((b) => [b.cx, b.cz, b.bw, b.bd, b.bh]);
var STREET_LAMPS = regularStreetLamps(cityStreetBuildings([]), 48);
var isRampOpening = sewerGroundOpening;
function grayboxBoxes(spec2 = { seed: CITY_PREVIEW_SEED, version: GRAYBOX_VERSION }) {
  const boxes = [];
  const box = (x, y, z, w, h, d, color = 2630191, rx = 0, rz = 0, building = false) => boxes.push({ x, y, z, w, h, d, color, rx, rz, building });
  for (let z = CITY_BOUNDS.min; z < CITY_BOUNDS.max; z += 2) {
    let start = CITY_BOUNDS.min;
    for (let x = CITY_BOUNDS.min; x <= CITY_BOUNDS.max; x += 2) {
      if (x === CITY_BOUNDS.max || isRampOpening(x + 1, z + 1)) {
        if (x > start) box((start + x) / 2, -0.5, z + 1, x - start, 1, 2, 2433580);
        start = x + 2;
      }
    }
  }
  boxes.push(...sewerBoxes(), ...landmarkBoxes(), ...vehicleBoxes());
  for (const edge of [CITY_BOUNDS.min, CITY_BOUNDS.max]) {
    box(edge, 4, -15, 1, 8, 362, 1643550);
    box(-15, 4, edge, 362, 8, 1, 1643550);
  }
  for (const b of CENTRAL_BUILDINGS) for (const m of skylineMasses(b)) {
    box(m.x, m.y, m.z, m.w, m.h, m.d, 2433326, 0, 0, true);
    boxes[boxes.length - 1].original = true;
  }
  box(-16, 53, -70, 34, 34, 18, 2696497, 0, 0, true);
  box(-16, 81, -70, 24, 22, 16, 3156534, 0, 0, true);
  box(-16, 98, -70, 16, 12, 12, 3748157);
  box(-16, 107, -70, 7, 6, 7, 4339782);
  box(130, 45, -81, 30, 18, 12, 2503227, 0, 0, true);
  for (const x of [114, 146]) {
    box(x, 55, -79, 10, 38, 10, 2570305, 0, 0, true);
    boxes[boxes.length - 1].hidden = true;
    box(x, 79, -79, 13, 10, 13, 3754319);
  }
  box(-74, 65, 100, 12, 58, 12, 3680562, 0, 0, true);
  box(-74, 98, 100, 15, 8, 15, 4665915);
  box(-74, 105, 100, 7, 6, 7, 5587276);
  for (const x of [-133, -125]) {
    box(x, 63, 66, 3.4, 54, 3.4, 3746866);
    boxes[boxes.length - 1].hidden = true;
  }
  box(125, 39, 112, 17, 6, 15, 2636854, 0, 0, true);
  box(125, 49, 112, 20, 14, 20, 3492673);
  boxes[boxes.length - 1].hidden = true;
  box(125, 57, 112, 21, 2, 21, 5004110);
  box(105, 51.5, 105, 5, 31, 5, 2701361, 0, 0, true);
  for (const x of [117, 133]) {
    box(x, 20, 118, 1.2, 1.2, 32, 4282192);
    boxes[boxes.length - 1].hidden = true;
  }
  for (const z of [-22, 22]) {
    box(-137, 10, z, 18, 20, 20, 2631472, 0, 0, true);
    box(-137, 32, z, 16, 24, 18, 3157304, 0, 0, true);
    box(-137, 51, z, 12, 14, 14, 3748670, 0, 0, true);
    box(-137, 60, z, 15, 4, 17, 4800843);
  }
  box(-137, 24, 0, 16, 6, 62, 2696752);
  box(-137, 28, 0, 18, 2, 64, 4472391);
  for (const x of [-40, -29, -3, 8]) {
    box(x, 10, -35.6, 1.7, 20, 1.7, 5326673);
    boxes[boxes.length - 1].hidden = true;
  }
  box(-16, 21, -35.6, 54, 2, 3, 5326673);
  box(130, 7.8, -30, 22, 0.6, 4, 4345946);
  for (const x of [121, 139]) box(x, 3.7, -30.4, 1.1, 7.4, 1.1, 5333098);
  box(-105, 9, 110, 62, 0.6, 5, 4469309);
  for (const x of [-136, -74]) box(x, 4.5, 110, 0.8, 9, 0.8, 5784141);
  for (const x of [118, 132]) box(x, 6, 137.4, 1.4, 12, 1.4, 4871499);
  box(125, 12.4, 137.4, 16, 0.8, 2, 5660751);
  box(-128, 2, 117.5, 8, 4, 1.8, 2433841);
  boxes[boxes.length - 1].hidden = true;
  const buildings = cityStreetBuildings(generateBuildingLayout({ ...spec2, version: 1 }));
  for (const b of buildings) {
    box(b.cx, b.bh / 2, b.cz, b.bw, b.bh, b.bd, 2433326, 0, 0, true);
    boxes[boxes.length - 1].original = true;
  }
  for (const [x, z] of [...STREET_LAMPS, ...generatedStreetLamps(buildings, STREET_LAMPS)]) {
    box(x, STREET_LAMP_HEIGHT / 2, z, 0.16, STREET_LAMP_HEIGHT, 0.16, 1512221);
    boxes[boxes.length - 1].hidden = true;
    box(x, STREET_LAMP_HEIGHT + 0.2, z, 0.65, 0.8, 0.65, 16765063);
    boxes[boxes.length - 1].hidden = true;
  }
  boxes.push(...streetDebris(boxes, isRampOpening));
  return boxes;
}

// src/world/CityGenerator.ts
import * as THREE from "three";
import * as CANNON from "cannon-es";
var LAMP_CELL_SIZE = 90;
var dummy = new THREE.Object3D();
var CityGenerator = class {
  scene;
  world;
  opts;
  spec;
  objects = [];
  bodies = [];
  geometries = /* @__PURE__ */ new Set();
  materials = /* @__PURE__ */ new Set();
  textures = /* @__PURE__ */ new Set();
  generated = false;
  details = /* @__PURE__ */ new Map();
  animationTime = 0;
  windowLights = [];
  facadeOccluders = [];
  steam = [];
  windowStates = [];
  counts = emptyCounts();
  constructor(scene2, world2, opts = DEFAULT_CITY_OPTIONS, spec2) {
    this.scene = scene2;
    this.world = world2;
    this.opts = { ...DEFAULT_CITY_OPTIONS, ...opts };
    this.spec = spec2 ?? createWorldSpec();
  }
  extension = false;
  extensionLayout = [];
  generate(layoutOverride, extension = false) {
    for (const _step of this.generateSteps(layoutOverride, extension)) {
    }
  }
  *generateSteps(layoutOverride, extension = false) {
    this.extension = extension;
    if (this.generated) this.dispose();
    const layout2 = layoutOverride ?? generateBuildingLayout(this.spec, this.opts);
    this.extensionLayout = layout2;
    const decorate = createDecorationRandom(this.spec);
    yield* this.generateBuildings(layout2, decorate);
    this.generateLampProps(decorate);
    this.generateRoadMarkings();
    this.flushDetails();
    this.generated = true;
    this.counts.sceneObjects = this.objects.length;
    this.counts.geometries = this.geometries.size;
    this.counts.materials = this.materials.size;
    this.counts.textures = this.textures.size;
    this.counts.physicsBodies = this.bodies.length;
    this.counts.buildingBodies = this.bodies.length;
  }
  update(dt, camera) {
    if (!this.generated || !Number.isFinite(dt) || dt < 0) return;
    this.animationTime += Math.min(dt, 0.1);
    for (const window of this.windowStates) window.uniform.value = window.cycle.update(this.animationTime);
    for (const puff of this.steam) {
      const phase = (this.animationTime * 0.2 + puff.phase) % 1;
      puff.mesh.position.set(puff.x + Math.sin(phase * 4 + puff.phase) * phase * 0.35, 0.12 + phase * 1.5, puff.z);
      puff.mesh.scale.setScalar(0.3 + phase * 0.8);
      puff.mesh.material.opacity = Math.sin(phase * Math.PI) * 0.09;
      if (camera) camera.getWorldQuaternion(puff.mesh.quaternion);
    }
  }
  getCounts() {
    return { ...this.counts };
  }
  getSpec() {
    return this.spec;
  }
  getBuildingBodies() {
    return this.bodies.slice();
  }
  dispose() {
    for (const object of this.objects) {
      this.scene.remove(object);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
    for (const body of this.bodies) {
      this.world.removeBody(body);
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material2 of this.materials) material2.dispose();
    for (const texture of this.textures) texture.dispose();
    this.details.clear();
    this.windowLights.length = 0;
    this.facadeOccluders.length = 0;
    this.steam = [];
    this.windowStates = [];
    this.animationTime = 0;
    this.objects = [];
    this.bodies = [];
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.generated = false;
    this.counts = emptyCounts();
  }
  trackGeometry(geometry) {
    this.geometries.add(geometry);
    return geometry;
  }
  trackMaterial(material2) {
    this.materials.add(material2);
    return material2;
  }
  addObject(object) {
    this.scene.add(object);
    this.objects.push(object);
  }
  *generateBuildings(layout2, random) {
    this.counts.buildings = layout2.length;
    const rooftopMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 3420223, roughness: 0.75 }));
    const trim = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 4801360, roughness: 0.76 }));
    const dark = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 2436157, roughness: 0.58, metalness: 0.3 }));
    const brass = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 12028503, metalness: 0.55, roughness: 0.4 }));
    const propRandom = createDecorationRandom({ ...this.spec, seed: this.spec.seed ^ 5370206 });
    const bin = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 2702393, roughness: 0.83, metalness: 0.3 }));
    const wood = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 5850161, roughness: 0.95 }));
    bin.userData.streetSurface = wood.userData.streetSurface = "obstacle";
    const canvas = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 4469305, roughness: 1 }));
    for (const building of layout2) {
      yield;
      const windowStart = this.windowLights.length, detailStart = this.facadeOccluders.length;
      const finishWindows = () => {
        const visible = uncoveredWindowApertures(this.windowLights.slice(windowStart), this.facadeOccluders.slice(detailStart));
        this.windowLights.splice(windowStart, this.windowLights.length - windowStart, ...visible);
      };
      this.addBuilding(building, rooftopMat, random);
      const { cx, cz, bw, bd, bh } = building;
      if (isCentralBuilding(building)) {
        this.downtownDetails(building, trim, dark, brass);
        finishWindows();
        continue;
      }
      for (const y of [0.22, 3.4, bh - 0.35]) {
        this.boxDetail(trim, cx, y, cz, bw + 0.22, 0.18, bd + 0.22);
      }
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        this.boxDetail(trim, cx + x * (bw / 2 - 0.08), bh / 2, cz + z * (bd / 2 - 0.08), 0.2, bh, 0.2);
      }
      const style = Math.abs(Math.round(cx * 13 + cz * 7)) % 3;
      if (this.extension && bh <= 16) {
        for (const side of [-1, 1]) {
          this.boxDetail(trim, cx, bh + 0.35, cz + side * (bd / 2 - 0.3), bw, 0.7, 0.6);
          this.boxDetail(trim, cx + side * (bw / 2 - 0.3), bh + 0.35, cz, 0.6, 0.7, bd);
          this.boxDetail(dark, cx, 3.05, cz + side * (bd / 2 + 0.35), Math.min(bw - 2, 12), 0.2, 0.8);
        }
        if (style === 0) {
          this.boxDetail(trim, cx, bh + 1, cz + bd / 2 - 0.35, bw * 0.52, 2, 0.7);
          this.boxDetail(trim, cx, bh + 2.1, cz + bd / 2 - 0.35, bw * 0.55, 0.2, 0.82);
          for (const side of [-1, 1]) {
            this.boxDetail(canvas, cx, 3.32, cz + side * (bd / 2 + 0.66), Math.min(bw - 1, 14), 0.26, 1.35);
            this.boxDetail(trim, cx, 3.12, cz + side * (bd / 2 + 1.3), Math.min(bw - 1, 14), 0.3, 0.1);
            for (let i = -2; i <= 2; i++) this.boxDetail(brass, cx + i * 1.1, 2, cz + side * (bd / 2 + 0.07), 0.06, 1.7, 0.06);
          }
        } else if (style === 1) {
          const strip = bd / 3;
          for (let i = 0; i < 3; i++) {
            const rz = cz - bd / 2 + (i + 0.5) * strip;
            this.boxDetail(dark, cx, bh + 0.9, rz, bw * 0.86, 0.16, strip * 0.94, 0.22);
            this.boxDetail(trim, cx, bh + 1.15, rz + strip * 0.42, bw * 0.86, 0.48, 0.14);
            for (const x of [-0.28, 0, 0.28]) this.boxDetail(dark, cx + bw * x, bh + 1.1, rz, 0.1, 0.16, strip * 0.94, 0.22);
          }
        } else {
          this.boxDetail(dark, cx, bh + 0.85, cz, bw * 0.62, 1.7, Math.min(bd * 0.5, 7));
          this.boxDetail(trim, cx, bh + 1.8, cz, bw * 0.65, 0.18, Math.min(bd * 0.5, 7) + 0.35);
          for (const dx of [-0.3, 0.3]) {
            this.boxDetail(trim, cx + bw * dx, bh + 1.1, cz - bd * 0.25, 0.65, 2.2, 0.65);
            this.boxDetail(dark, cx + bw * dx, bh + 2.25, cz - bd * 0.25, 0.9, 0.16, 0.9);
          }
        }
      }
      const capHeight = bh <= 16 ? 0.48 : 0.32;
      this.boxDetail(trim, cx, bh - 0.65, cz, bw + 0.38, capHeight, bd + 0.38);
      this.boxDetail(dark, cx, bh - 1.05, cz, bw + 0.12, 0.16, bd + 0.12);
      for (const side of [-1, 1]) {
        const faceZ = cz + side * (bd / 2 + 0.06);
        const faceX = cx + side * (bw / 2 + 0.06);
        for (const offset of [-1.02, 1.02]) {
          this.boxDetail(trim, cx + offset, 1.45, faceZ, 0.2, 2.9, 0.18);
          this.boxDetail(brass, cx + offset * 0.25, 1.1, faceZ + side * 0.07, 0.035, 0.32, 0.08);
        }
        this.boxDetail(trim, cx, 2.98, faceZ, 2.24, 0.24, 0.22);
        this.boxDetail(dark, cx, 2.67, faceZ + side * 0.015, 1.82, 0.34, 0.06);
        this.boxDetail(brass, cx, 2.67, faceZ + side * 0.055, 0.035, 0.32, 0.04);
        const bays = Math.max(2, Math.min(5, Math.floor(bw / 5)));
        for (let bay = 0; bay <= bays; bay++) {
          const x = cx - bw / 2 + 0.3 + bay * (bw - 0.6) / bays;
          if (style === 0) {
            this.boxDetail(trim, x, 2, faceZ, 0.22, 3.5, 0.14);
          } else {
            this.boxDetail(
              style === 1 ? trim : dark,
              x,
              (bh + 3.6) / 2,
              faceZ,
              style === 1 ? 0.26 : 0.16,
              Math.max(0.4, bh - 4.8),
              0.13
            );
          }
        }
        for (const offset of [-0.28, 0.28]) {
          this.boxDetail(
            style === 1 ? trim : dark,
            faceX,
            (bh + 3.6) / 2,
            cz + bd * offset,
            0.13,
            Math.max(0.4, bh - 4.8),
            0.25
          );
        }
        if (style === 0 || bh <= 16) {
          this.boxDetail(dark, faceX, 2.2, cz, 0.08, 1.25, Math.min(3, bd * 0.35));
          for (let slat = 0; slat < 4; slat++) this.boxDetail(
            trim,
            faceX + side * 0.045,
            1.75 + slat * 0.27,
            cz,
            0.04,
            0.06,
            Math.min(2.8, bd * 0.32)
          );
          this.boxDetail(trim, cx, Math.min(6.4, bh - 2), faceZ, bw, 0.2, 0.18);
        } else if (style === 2) {
          for (let y = 9; y < bh - 5; y += 12) this.boxDetail(
            trim,
            cx,
            y,
            cz,
            bw + 0.15,
            0.15,
            bd + 0.15
          );
        }
      }
      if (bh > 16) {
        const roofW = Math.min(4.5, bw * 0.4), roofD = Math.min(3, bd * 0.35);
        this.boxDetail(dark, cx, bh + 0.75, cz, roofW, 1.5, roofD);
        this.boxDetail(trim, cx, bh + 1.55, cz, roofW + 0.25, 0.16, roofD + 0.25);
        for (let row = 0; row < 3; row++) this.boxDetail(
          trim,
          cx,
          bh + 0.4 + row * 0.3,
          cz + roofD / 2 + 0.025,
          roofW * 0.8,
          0.06,
          0.04
        );
        for (const offset of [-0.25, 0.25]) {
          this.boxDetail(dark, cx + bw * offset, bh + 0.6, cz - bd * 0.24, 0.35, 1.2, 0.35);
          this.boxDetail(trim, cx + bw * offset, bh + 1.23, cz - bd * 0.24, 0.65, 0.12, 0.65);
        }
      }
      const serviceZ = cz + bd / 2 + 0.45;
      this.boxDetail(bin, cx - bw * 0.32, 0.48, serviceZ, 1.55, 0.88, 0.75);
      this.boxDetail(dark, cx - bw * 0.32, 0.95, serviceZ, 1.68, 0.12, 0.84);
      this.boxDetail(brass, cx - bw * 0.32, 0.63, serviceZ + 0.39, 0.42, 0.055, 0.055);
      this.boxDetail(dark, cx + bw * 0.33, 0.4, serviceZ, 0.55, 0.76, 0.55);
      this.boxDetail(trim, cx + bw * 0.33, 0.82, serviceZ, 0.62, 0.07, 0.62);
      if (propRandom() < 0.35) {
        const crateX = cx - bw * 0.32 + 1.25;
        this.boxDetail(wood, crateX, 0.36, serviceZ, 0.65, 0.65, 0.65);
        for (const offset of [-0.23, 0.23]) this.boxDetail(dark, crateX + offset, 0.36, serviceZ + 0.33, 0.055, 0.67, 0.035);
      }
      if (propRandom() < 0.2) {
        for (let level = 0; level < 3 && 5.3 + level * 3 < bh; level++) {
          const y = 4.5 + level * 3;
          this.boxDetail(dark, cx + bw / 2 + 0.45, y, cz, 0.9, 0.1, 2.4);
          this.boxDetail(dark, cx + bw / 2 + 0.87, y + 0.7, cz, 0.055, 0.055, 2.4);
          for (let post = -1; post <= 1; post++) this.boxDetail(dark, cx + bw / 2 + 0.87, y + 0.35, cz + post, 0.045, 0.7, 0.045);
          for (const side of [-1, 1]) this.boxDetail(dark, cx + bw / 2 + 0.45 + side * 0.3, y - 1.3, cz + 0.85, 0.05, 2.7, 0.055);
          for (let rung = 0; rung < 8; rung++) this.boxDetail(dark, cx + bw / 2 + 0.45, y - rung * 0.36, cz + 0.85, 0.6, 0.04, 0.055);
        }
      }
      for (const side of [-1, 1]) {
        this.boxDetail(dark, cx, 1.2, cz + side * (bd / 2 + 0.015), 1.65, 2.4, 0.06);
        this.boxDetail(brass, cx, 1.2, cz + side * (bd / 2 + 0.055), 0.055, 2.4, 0.035);
        this.boxDetail(dark, cx, 2.65, cz + side * (bd / 2 + 0.25), 2.3, 0.14, 0.65);
      }
      finishWindows();
    }
  }
  addBuilding(building, rooftopMat, random) {
    const { cx, cz, bw, bd, bh } = building;
    const { facade, glow, rooms, panes } = this.createWindowTexture(Math.ceil(bw), Math.ceil(bh), random);
    this.textures.add(facade);
    this.textures.add(glow);
    const mat = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.6 + random() * 0.12, 0.1 + random() * 0.08, 0.065 + random() * 0.025),
      map: facade,
      roughness: 0.8,
      metalness: 0.08,
      emissiveMap: glow,
      emissive: 16777215,
      emissiveIntensity: 1.1 * AUTHORED_LIGHT_GAIN
    }));
    const roomUniforms = rooms.map((room, i) => {
      const seed = this.spec.seed ^ Math.imul(Math.round(cx * 100), 73856093) ^ Math.imul(Math.round(cz * 100), 19349663) ^ Math.imul(i + 1, 83492791);
      const cycle = new WindowLightCycle(seed);
      const uniform = { value: cycle.brightness };
      this.windowStates.push({ cycle, uniform });
      return { rect: { value: room }, light: uniform };
    });
    mat.onBeforeCompile = (shader) => {
      let declarations = "";
      let emission = "#include <emissivemap_fragment>\nfloat occupancy = 1.0;\n";
      roomUniforms.forEach((room, i) => {
        shader.uniforms[`roomRect${i}`] = room.rect;
        shader.uniforms[`roomLight${i}`] = room.light;
        declarations += `uniform vec4 roomRect${i};
uniform float roomLight${i};
`;
        emission += `
#ifdef USE_EMISSIVEMAP
{
                    vec2 insideRoom = step(roomRect${i}.xy, vEmissiveMapUv) * step(vEmissiveMapUv, roomRect${i}.zw);
                    occupancy *= mix(1.0, roomLight${i}, insideRoom.x * insideRoom.y);
                }
#endif
`;
      });
      emission += `
#ifdef USE_EMISSIVEMAP
float roomPixel = step(0.015, max(emissiveColor.r, max(emissiveColor.g, emissiveColor.b)));
diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb, vec3(0.018, 0.024, 0.032)), roomPixel * (1.0 - occupancy));
totalEmissiveRadiance *= occupancy;
#endif
`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + declarations).replace("#include <emissivemap_fragment>", emission);
    };
    mat.customProgramCacheKey = () => `city-room-occupancy-v2-${roomUniforms.length}`;
    for (const mass of skylineMasses(building)) {
      if (this.extension) this.windowLights.push(...windowApertures(panes, roomUniforms, mass, bh));
      const geo = this.trackGeometry(new THREE.BoxGeometry(mass.w, mass.h, mass.d));
      const uv = geo.getAttribute("uv");
      const base = mass.y - mass.h / 2;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (base + uv.getY(i) * mass.h) / bh);
      const indices = geo.getIndex();
      for (const group of geo.groups) if (group.materialIndex === 2 || group.materialIndex === 3) {
        for (let i = group.start; i < group.start + group.count; i++) uv.setXY(indices.getX(i), 0, 0);
      }
      const mesh2 = new THREE.Mesh(geo, mat);
      mesh2.position.set(mass.x, mass.y, mass.z);
      mesh2.castShadow = true;
      mesh2.receiveShadow = true;
      mesh2.userData.aimTarget = true;
      this.addObject(mesh2);
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(mass.w / 2, mass.h / 2, mass.d / 2)));
      body.position.set(mass.x, mass.y, mass.z);
      body.updateAABB();
      this.world.addBody(body);
      this.bodies.push(body);
    }
    if (!isCentralBuilding(building) && random() < 0.4) {
      this.addRooftopDetail(cx, cz, bw, bd, bh, rooftopMat, random);
      this.counts.rooftops += 1;
    }
  }
  /** Deeply articulated downtown towers, built around their real stepped masses. */
  downtownDetails(b, stone, steel, brass) {
    const style = Math.abs(Math.round(b.cx + b.cz)) % 3;
    for (const m of skylineMasses(b)) {
      const bottom = m.y - m.h / 2, top = m.y + m.h / 2;
      this.boxDetail(stone, m.x, top - 0.3, m.z, m.w + 0.38, 0.6, m.d + 0.38);
      this.boxDetail(steel, m.x, top - 1.05, m.z, m.w + 0.15, 0.24, m.d + 0.15);
      for (const side of [-1, 1]) {
        const z = m.z + side * (m.d / 2 + 0.07), x = m.x + side * (m.w / 2 + 0.07);
        for (let i = 0; i <= Math.floor(m.w / 4); i++) {
          const px = m.x - m.w / 2 + 0.22 + i * (m.w - 0.44) / Math.floor(m.w / 4);
          this.boxDetail(style === 2 ? steel : stone, px, m.y, z, 0.28, m.h - 0.65, 0.2);
          if (style === 0) this.boxDetail(brass, px, top - 2.5, z + side * 0.11, 0.085, 3, 0.04);
        }
        for (let i = 0; i <= Math.floor(m.d / 4); i++) {
          const pz = m.z - m.d / 2 + 0.22 + i * (m.d - 0.44) / Math.floor(m.d / 4);
          this.boxDetail(style === 2 ? steel : stone, x, m.y, pz, 0.2, m.h - 0.65, 0.28);
        }
        for (let y = bottom + 6; y < top - 3; y += style === 1 ? 6 : 12) {
          this.boxDetail(style === 1 ? stone : steel, m.x, y, z, m.w, 0.18, 0.18);
          this.boxDetail(style === 1 ? stone : steel, x, y, m.z, 0.18, 0.18, m.d);
        }
      }
    }
    for (const side of [-1, 1]) {
      const z = b.cz + side * (b.bd / 2 + 0.09);
      this.boxDetail(stone, b.cx, 1.2, z, b.bw, 2.4, 0.2);
      this.boxDetail(steel, b.cx, 2, z + side * 0.13, 3.8, 4, 0.08);
      for (const x of [-2.2, 2.2]) this.boxDetail(stone, b.cx + x, 2.2, z + side * 0.16, 0.48, 4.4, 0.36);
      this.boxDetail(brass, b.cx, 4.5, z + side * 0.16, 5.1, 0.16, 0.42);
      this.boxDetail(steel, b.cx, 4.78, z + side * 0.43, 5.8, 0.25, 1.1);
      for (const x of [-0.9, 0, 0.9]) this.boxDetail(brass, b.cx + x, 2, z + side * 0.2, 0.065, 3.8, 0.065);
      for (const x of [-3.2, 3.2]) this.boxDetail(brass, b.cx + x, 3.6, z + side * 0.22, 0.25, 0.75, 0.18);
    }
    const crown = skylineMasses(b)[2];
    this.boxDetail(steel, b.cx, b.bh + 0.7, b.cz, crown.w * 0.62, 1.4, crown.d * 0.62);
    this.boxDetail(stone, b.cx, b.bh + 1.5, b.cz, crown.w * 0.7, 0.2, crown.d * 0.7);
    for (const side of [-1, 1]) this.boxDetail(brass, b.cx + side * crown.w * 0.28, b.bh + 2, b.cz, 0.13, 2.5, 0.13);
  }
  addRooftopDetail(cx, cz, bw, bd, bh, mat, random) {
    const dw = 1.5 + random() * 2;
    const dh = 1 + random() * 2.5;
    const dd = 1.5 + random() * 2;
    const geo = this.trackGeometry(new THREE.BoxGeometry(dw, dh, dd));
    const detail = new THREE.Mesh(geo, mat);
    detail.position.set(
      cx + (random() - 0.5) * bw * 0.4,
      bh + dh / 2,
      cz + (random() - 0.5) * bd * 0.4
    );
    detail.castShadow = true;
    this.addObject(detail);
  }
  boxDetail(material2, x, y, z, sx, sy, sz, slope = 0) {
    if (this.extension && !slope) this.facadeOccluders.push({ x, y, z, w: sx, h: sy, d: sz });
    dummy.position.set(x, y, z);
    dummy.rotation.set(slope, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    const list = this.details.get(material2) ?? [];
    list.push(dummy.matrix.clone());
    this.details.set(material2, list);
  }
  flushDetails() {
    const geometry = this.trackGeometry(new THREE.BoxGeometry(1, 1, 1));
    for (const [material2, matrices] of this.details) {
      const mesh2 = new THREE.InstancedMesh(geometry, material2, matrices.length);
      matrices.forEach((matrix, i) => mesh2.setMatrixAt(i, matrix));
      mesh2.castShadow = false;
      mesh2.receiveShadow = material2.userData.receiveDetailShadow !== false;
      mesh2.computeBoundingSphere();
      this.addObject(mesh2);
    }
    this.details.clear();
  }
  createWindowTexture(widthUnits, heightUnits, random) {
    const panes = [];
    const canvas = document.createElement("canvas"), emission = document.createElement("canvas");
    canvas.width = emission.width = Math.max(64, Math.ceil(widthUnits / 2.4) * 24);
    canvas.height = emission.height = Math.max(64, Math.ceil(heightUnits / 3) * 28);
    const ctx = canvas.getContext("2d"), light = emission.getContext("2d");
    ctx.fillStyle = "#49434f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    light.fillStyle = "#000000";
    light.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 7) {
      ctx.fillStyle = y % 28 === 0 ? "#302b37" : "#403947";
      ctx.fillRect(0, y, canvas.width, 1);
    }
    for (let y = 0; y < canvas.height; y += 7) {
      ctx.fillStyle = "#37323e";
      for (let x = y / 7 % 2 === 0 ? 0 : 12; x < canvas.width; x += 24) ctx.fillRect(x, y, 1, 7);
    }
    ctx.fillStyle = "#332f3a";
    ctx.fillRect(0, canvas.height - 26, canvas.width, 26);
    ctx.fillStyle = "#5a5260";
    ctx.fillRect(0, canvas.height - 28, canvas.width, 2);
    for (let y = 12; y < canvas.height - 28; y += 28) for (let x = 6; x < canvas.width - 10; x += 24) {
      ctx.fillStyle = "#38303e";
      ctx.fillRect(x - 2, y - 2, 16, 20);
      ctx.fillStyle = "#202c3b";
      ctx.fillRect(x, y, 12, 16);
      ctx.fillStyle = "#45394b";
      ctx.fillRect(x - 2, y + 16, 16, 2);
      if (random() < 0.32) {
        const palette = ["#ffd27a", "#ffc04b", "#ffe5a0", "#7fc9e8", "#e37754"];
        const selection = random();
        const color = palette[selection < 0.4 ? 0 : selection < 0.65 ? 1 : selection < 0.8 ? 2 : selection < 0.93 ? 3 : 4];
        ctx.fillStyle = color;
        light.fillStyle = color;
        ctx.fillRect(x, y, 12, 16);
        light.fillRect(x, y, 12, 16);
        light.fillStyle = "#000000";
        ctx.fillStyle = "#484651";
        ctx.fillRect(x + 5, y, 2, 16);
        light.fillRect(x + 5, y, 2, 16);
        ctx.fillRect(x, y + 8, 12, 1);
        light.fillRect(x, y + 8, 12, 1);
        const blind = random() < 0.3;
        if (blind) {
          ctx.fillRect(x, y, 12, 5);
          light.fillRect(x, y, 12, 5);
        }
        panes.push({
          u0: x / canvas.width,
          u1: (x + 12) / canvas.width,
          v0: 1 - (y + 16) / canvas.height,
          v1: 1 - (y + (blind ? 5 : 0)) / canvas.height,
          color: Number.parseInt(color.slice(1), 16)
        });
      }
    }
    const facade = new THREE.CanvasTexture(canvas), glow = new THREE.CanvasTexture(emission);
    facade.colorSpace = glow.colorSpace = THREE.SRGBColorSpace;
    facade.anisotropy = glow.anisotropy = 4;
    const rooms = [];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 2; column++) {
      rooms.push(new THREE.Vector4(column / 2, row / 3, (column + 1) / 2, (row + 1) / 3));
    }
    return { facade, glow, rooms, panes };
  }
  generateLampProps(random) {
    const { gridSize, blockSpacing, streetWidth } = this.opts;
    const half = gridSize / 2;
    const offset = streetWidth / 2 + 1.5;
    const cells = /* @__PURE__ */ new Map();
    if (this.extension) {
      for (const [x, z] of [...STREET_LAMPS, ...generatedStreetLamps(this.extensionLayout, STREET_LAMPS)]) this.pushLamp(cells, x, z);
    } else {
      for (let gx = -half; gx < half; gx++) {
        for (let gz = -half; gz < half; gz++) {
          const ix = (gx + 0.5) * blockSpacing;
          const iz = (gz + 0.5) * blockSpacing;
          if (random() < 0.6) this.pushLamp(cells, ix + offset, iz + offset);
          if (random() < 0.4) this.pushLamp(cells, ix - offset, iz - offset);
        }
      }
    }
    if (cells.size === 0) return;
    const poleGeo = this.trackGeometry(new THREE.LatheGeometry([[0.25, 0], [0.25, 0.18], [0.18, 0.25], [0.12, 0.8], [0.09, 5.7], [0.22, 5.9], [0.22, 6]].map(([r, y]) => new THREE.Vector2(r, y - 3)), 10));
    const poleMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 3420990, roughness: 0.7, metalness: 0.5 }));
    const headGeo = this.trackGeometry(new THREE.CylinderGeometry(0.32, 0.27, 0.65, 8));
    const headMat = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 16768940,
      emissive: 16760162,
      emissiveIntensity: 2.2 * AUTHORED_LIGHT_GAIN,
      roughness: 0.2
    }));
    const coneGeo = this.trackGeometry(new THREE.ConeGeometry(5.7, STREET_LAMP_HEIGHT, 20, 1, true));
    const coneMat = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 16764041,
      transparent: true,
      opacity: 9e-3,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    const glowData = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      const index = (y * 64 + x) * 4;
      glowData[index] = glowData[index + 1] = glowData[index + 2] = 255;
      glowData[index + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 2) * 255);
    }
    const glowTexture = new THREE.DataTexture(glowData, 64, 64);
    glowTexture.needsUpdate = true;
    glowTexture.magFilter = THREE.LinearFilter;
    this.textures.add(glowTexture);
    const steamGeo = this.trackGeometry(new THREE.PlaneGeometry(2, 2));
    for (const [x, z] of [[8.7, 7], [-21.3, 7], [8.7, -23]]) for (let i = 0; i < 2; i++) {
      const material2 = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 9013145, map: glowTexture, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      const mesh2 = new THREE.Mesh(steamGeo, material2);
      mesh2.position.set(x, 0.2, z);
      this.steam.push({ mesh: mesh2, x, z, phase: i * 0.5 });
      this.addObject(mesh2);
    }
    const poolGeo = this.trackGeometry(new THREE.PlaneGeometry(12, 12));
    const poolMat = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 16760694,
      map: glowTexture,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    for (const lamps of cells.values()) {
      const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
      lamps.forEach(({ x, z }, i) => {
        dummy.position.set(x, 0.055, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pools.setMatrixAt(i, dummy.matrix);
        this.boxDetail(poleMat, x, STREET_LAMP_HEIGHT + 0.62, z, 0.95, 0.12, 0.95);
        this.boxDetail(poleMat, x, STREET_LAMP_HEIGHT - 0.15, z, 0.65, 0.1, 0.65);
        for (const side of [-1, 1]) {
          this.boxDetail(poleMat, x + side * 0.24, STREET_LAMP_HEIGHT + 0.2, z, 0.055, 0.65, 0.055);
          this.boxDetail(poleMat, x, STREET_LAMP_HEIGHT + 0.2, z + side * 0.24, 0.055, 0.65, 0.055);
        }
      });
      pools.computeBoundingSphere();
      this.addObject(pools);
    }
    this.counts.lampCells = cells.size;
    for (const lamps of cells.values()) {
      this.addLampCell(lamps, poleGeo, poleMat, headGeo, headMat, coneGeo, coneMat);
    }
  }
  pushLamp(cells, x, z) {
    const key = `${Math.floor((x + 180) / LAMP_CELL_SIZE)},${Math.floor((z + 180) / LAMP_CELL_SIZE)}`;
    const list = cells.get(key);
    const position = new THREE.Vector3(x, 0, z);
    if (list) list.push(position);
    else cells.set(key, [position]);
  }
  addLampCell(lamps, poleGeo, poleMat, headGeo, headMat, coneGeo, coneMat) {
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length);
    poles.castShadow = true;
    heads.castShadow = false;
    poles.frustumCulled = true;
    heads.frustumCulled = true;
    for (let i = 0; i < lamps.length; i++) {
      const { x, z } = lamps[i];
      dummy.position.set(x, STREET_LAMP_HEIGHT / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, STREET_LAMP_HEIGHT / 6, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, STREET_LAMP_HEIGHT + 0.2, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, STREET_LAMP_HEIGHT / 2, z);
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
      this.counts.lampCones += 1;
    }
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    cones.computeBoundingSphere();
    this.addObject(cones);
    poles.computeBoundingSphere();
    heads.computeBoundingSphere();
    this.addObject(poles);
    this.addObject(heads);
    this.counts.lampPoles += lamps.length;
    this.counts.lampHeads += lamps.length;
  }
  generateRoadMarkings() {
    const { gridSize, blockSpacing, streetWidth } = this.opts;
    const half = gridSize / 2;
    const totalLen = gridSize * blockSpacing + blockSpacing;
    const roadCanvas = document.createElement("canvas");
    roadCanvas.width = roadCanvas.height = 128;
    const roadCtx = roadCanvas.getContext("2d");
    const noise = createDecorationRandom(this.spec);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const gray = 55 + Math.floor(noise() * 24);
      roadCtx.fillStyle = `rgb(${gray},${gray + 3},${gray + 9})`;
      roadCtx.fillRect(x, y, 1, 1);
    }
    const roadTexture = new THREE.CanvasTexture(roadCanvas);
    roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping;
    roadTexture.repeat.set(totalLen / 5, streetWidth / 5);
    roadTexture.colorSpace = THREE.SRGBColorSpace;
    roadTexture.anisotropy = 4;
    this.textures.add(roadTexture);
    const asphaltMat = this.trackMaterial(new THREE.MeshStandardMaterial({
      color: 5067361,
      map: roadTexture,
      emissive: 1052700,
      emissiveIntensity: 0.1,
      roughness: 0.68,
      metalness: 0.12
    }));
    asphaltMat.userData.streetSurface = "ground";
    const lineMat = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: 14071671,
      transparent: true,
      opacity: 0.72
    }));
    const horizRoadGeo = this.trackGeometry(new THREE.PlaneGeometry(totalLen, streetWidth));
    const vertRoadGeo = this.trackGeometry(new THREE.PlaneGeometry(streetWidth, totalLen));
    if (this.extension) {
      const segmentGeo = this.trackGeometry(new THREE.PlaneGeometry(2, 2));
      const positions = [];
      for (let x = -195; x < 166; x += 2) for (let z = -195; z < 166; z += 2) {
        if (isRampOpening(x, z)) continue;
        if (CITY_STREETS.some((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2)) positions.push([x, z]);
      }
      this.addDashStrip(segmentGeo, asphaltMat, positions);
    } else {
      for (let gz = -half; gz < half; gz++) {
        const z = (gz + 0.5) * blockSpacing;
        const road = new THREE.Mesh(horizRoadGeo, asphaltMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0.01, z);
        road.receiveShadow = true;
        this.addObject(road);
        this.counts.roadMeshes += 1;
      }
      for (let gx = -half; gx < half; gx++) {
        const x = (gx + 0.5) * blockSpacing;
        const road = new THREE.Mesh(vertRoadGeo, asphaltMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0.012, 0);
        road.receiveShadow = true;
        this.addObject(road);
        this.counts.roadMeshes += 1;
      }
    }
    const paving = document.createElement("canvas");
    paving.width = paving.height = 128;
    const pavingCtx = paving.getContext("2d");
    pavingCtx.fillStyle = "#646778";
    pavingCtx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
      pavingCtx.fillStyle = ["#9a9ba4", "#8c909c", "#a1a0a7"][Math.floor(noise() * 3)];
      pavingCtx.fillRect(x + 1, y + 1, 30, 30);
    }
    const pavingTexture = new THREE.CanvasTexture(paving);
    pavingTexture.wrapS = pavingTexture.wrapT = THREE.RepeatWrapping;
    pavingTexture.repeat.set(4, 4);
    pavingTexture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(pavingTexture);
    const sidewalk = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 4934490, map: pavingTexture, roughness: 0.85 }));
    const curb = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 5591134, roughness: 0.8 }));
    sidewalk.userData.streetSurface = "ground";
    curb.userData.streetSurface = "curb";
    const paint = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 7827823, roughness: 0.9 }));
    paint.userData.receiveDetailShadow = false;
    const drain = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 2108216, roughness: 0.6, metalness: 0.5 }));
    if (this.extension) {
      for (const b of this.extensionLayout) {
        this.boxDetail(sidewalk, b.cx, 0.015, b.cz, b.bw + 2, 0.06, b.bd + 2);
        for (const side of [-1, 1]) {
          this.boxDetail(curb, b.cx + side * (b.bw / 2 + 1), 0.04, b.cz, 0.16, 0.08, b.bd + 2);
          this.boxDetail(curb, b.cx, 0.04, b.cz + side * (b.bd / 2 + 1), b.bw + 2, 0.08, 0.16);
        }
      }
      for (const r of CITY_STREETS) {
        const horizontal = r.w > r.d, span = horizontal ? r.w : r.d;
        for (let t = -span / 2 + 4; t < span / 2 - 4; t += 7) {
          const x = r.x + (horizontal ? t : 0), z = r.z + (horizontal ? 0 : t);
          if (isRampOpening(x, z)) continue;
          if (CITY_STREETS.some((other) => other !== r && Math.abs(x - other.x) < other.w / 2 + 2 && Math.abs(z - other.z) < other.d / 2 + 2)) continue;
          this.boxDetail(paint, x, 0.035, z, horizontal ? 2.5 : 0.12, 0.015, horizontal ? 0.12 : 2.5);
        }
      }
      return;
    }
    const block = blockSpacing - streetWidth;
    for (let gx = -half; gx < half; gx++) for (let gz = -half; gz < half; gz++) {
      const x = gx * blockSpacing, z = gz * blockSpacing;
      if (this.extension && !originalCityBuildingAllowed(x, z)) continue;
      this.boxDetail(sidewalk, x, 5e-3, z, block, 0.05, block);
      for (const side of [-1, 1]) {
        this.boxDetail(curb, x + side * block / 2, 0.025, z, 0.18, 0.08, block);
        this.boxDetail(curb, x, 0.025, z + side * block / 2, block, 0.08, 0.18);
      }
      const ix = x + blockSpacing / 2, iz = z + blockSpacing / 2;
      for (let stripe = -2; stripe <= 2; stripe++) for (const side of [-1, 1]) {
        this.boxDetail(paint, ix + stripe * 1.25, 0.023, iz + side * (streetWidth / 2 - 1.1), 0.65, 0.012, 1.8);
        this.boxDetail(paint, ix + side * (streetWidth / 2 - 1.1), 0.023, iz + stripe * 1.25, 1.8, 0.012, 0.65);
      }
      for (let slat = 0; slat < 5; slat++) {
        this.boxDetail(drain, ix - streetWidth / 2 + 0.5 + slat * 0.14, 0.022, iz - streetWidth / 2 - 1, 0.07, 0.015, 0.75);
      }
    }
    const dashLen = 2.5;
    const gapLen = 2.5;
    const dashW = 0.18;
    const horizDashGeo = this.trackGeometry(new THREE.PlaneGeometry(dashLen, dashW));
    const vertDashGeo = this.trackGeometry(new THREE.PlaneGeometry(dashW, dashLen));
    const vertRoadXs = [];
    for (let gx = -half; gx < half; gx++) vertRoadXs.push((gx + 0.5) * blockSpacing);
    const horizRoadZs = [];
    for (let gz = -half; gz < half; gz++) horizRoadZs.push((gz + 0.5) * blockSpacing);
    const halfSW = streetWidth / 2;
    for (let gz = -half; gz < half; gz++) {
      const z = (gz + 0.5) * blockSpacing;
      const xs = [];
      for (let d = -totalLen / 2; d < totalLen / 2; d += dashLen + gapLen) {
        const cx = d + dashLen / 2;
        if (vertRoadXs.some((vx) => Math.abs(cx - vx) < halfSW)) continue;
        xs.push(cx);
      }
      this.addDashStrip(horizDashGeo, lineMat, xs.map((x) => [x, z]));
    }
    for (let gx = -half; gx < half; gx++) {
      const x = (gx + 0.5) * blockSpacing;
      const zs = [];
      for (let d = -totalLen / 2; d < totalLen / 2; d += dashLen + gapLen) {
        const cz = d + dashLen / 2;
        if (horizRoadZs.some((hz) => Math.abs(cz - hz) < halfSW)) continue;
        zs.push(cz);
      }
      this.addDashStrip(vertDashGeo, lineMat, zs.map((z) => [x, z]));
    }
  }
  addDashStrip(geometry, material2, positions) {
    if (this.extension) positions = positions.filter(([x, z]) => !isRampOpening(x, z));
    if (positions.length === 0) return;
    const mesh2 = new THREE.InstancedMesh(geometry, material2, positions.length);
    mesh2.frustumCulled = true;
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(1, 1, 1);
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i][0], 0.02, positions[i][1]);
      dummy.updateMatrix();
      mesh2.setMatrixAt(i, dummy.matrix);
    }
    mesh2.instanceMatrix.needsUpdate = true;
    mesh2.computeBoundingSphere();
    this.addObject(mesh2);
    this.counts.dashBatches += 1;
    this.counts.dashInstances += positions.length;
  }
};
function emptyCounts() {
  return {
    buildings: 0,
    buildingBodies: 0,
    rooftops: 0,
    roadMeshes: 0,
    dashBatches: 0,
    dashInstances: 0,
    lampCells: 0,
    lampPoles: 0,
    lampHeads: 0,
    lampCones: 0,
    sceneObjects: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    physicsBodies: 0
  };
}

// src/rat/RatModel.ts
import * as THREE4 from "three";

// src/shared/ratAppearance.ts
var CLOTHING_PALETTE = [
  { name: "Blue", color: 3697834 },
  { name: "Green", color: 4424286 },
  { name: "Plum", color: 8936329 },
  { name: "Teal", color: 3771794 },
  { name: "Ochre", color: 12951620 },
  { name: "Orange", color: 13469503 },
  { name: "Brown", color: 9926239 },
  { name: "Slate", color: 8161692 }
];
var HIGHLIGHT_PALETTE = [
  { name: "Ivory", color: 15327177 },
  { name: "Tan", color: 13350294 },
  { name: "Pearl gray", color: 12106184 },
  { name: "Pale gold", color: 14270336 }
];
var FUR_PALETTE = [
  { name: "Golden", color: 15251533 },
  { name: "Taupe", color: 12033411 },
  { name: "Warm gray", color: 11841707 },
  { name: "Ivory", color: 15260352 }
];
var HAT_COLORS = CLOTHING_PALETTE.map((entry) => entry.color);
var COAT_COLORS = CLOTHING_PALETTE.map((entry) => entry.color);
var HIGHLIGHT_COLORS = HIGHLIGHT_PALETTE.map((entry) => entry.color);
var FUR_COLORS = FUR_PALETTE.map((entry) => entry.color);
var APPEARANCE_COUNT = HAT_COLORS.length * COAT_COLORS.length * HIGHLIGHT_COLORS.length * FUR_COLORS.length;
var DEFAULT_APPEARANCE = {
  hatType: "fedora",
  hatColor: HAT_COLORS[6],
  coatColor: COAT_COLORS[0],
  highlightColor: HIGHLIGHT_COLORS[1],
  furColor: FUR_COLORS[0]
};

// src/rat/RatCoatGeometry.ts
import * as THREE2 from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
var COAT_PROFILE = [
  [0, 0],
  [0.485, 0],
  [0.505, 0.025],
  [0.503, 0.07],
  [0.477, 0.65],
  [0.434, 1.15],
  [0.403, 1.285],
  [0.35, 1.34],
  [0, 1.34]
];
function radiusAt(y) {
  for (let i = 3; i < COAT_PROFILE.length - 1; i++) {
    const [r0, y0] = COAT_PROFILE[i - 1], [r1, y1] = COAT_PROFILE[i];
    if (y <= y1) return THREE2.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return 0.35;
}
var frontZ = (x, y) => Math.sqrt(Math.max(0, radiusAt(y) ** 2 - x * x));
function addCoatTailoring(body, coat, highlight, shirt, fasteners) {
  const add = (name, geometry, mat) => {
    const part2 = new THREE2.Mesh(geometry, mat);
    part2.name = name;
    part2.castShadow = true;
    part2.userData.noOutline = true;
    body.add(part2);
    return part2;
  };
  const panel = (name, points, mat, offset, bevel = 5e-3) => {
    const shape = new THREE2.Shape(points.map(([x, y]) => new THREE2.Vector2(x, y)));
    const geometry = new THREE2.ExtrudeGeometry(shape, {
      depth: 9e-3,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: 4e-3,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 2
    });
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i);
      positions.setZ(i, positions.getZ(i) + 0.445 - Math.abs(x) * 0.3 - (y - 1.35) * 0.18 + offset);
    }
    geometry.computeVertexNormals();
    return add(name, geometry, mat);
  };
  panel("rat-shirt-insert", [[-0.11, 1.397], [0.11, 1.397], [0.068, 1.25], [0, 1.205], [-0.068, 1.25]], shirt, -0.014);
  panel("rat-tie", [[0, 1.327], [0.026, 1.288], [0.034, 1.223], [0, 1.185], [-0.034, 1.223], [-0.026, 1.288]], fasteners, 6e-3, 3e-3);
  panel("rat-tie-knot", [[-0.026, 1.344], [0.026, 1.344], [0.022, 1.31], [0, 1.298], [-0.022, 1.31]], fasteners, 0.015, 4e-3);
  for (const side of [-1, 1]) {
    panel(side < 0 ? "rat-lapel-left" : "rat-lapel-right", [
      [0.068, 1.36],
      [0.211, 1.457],
      [0.287, 1.397],
      [0.256, 1.367],
      [0.274, 1.343],
      [0.185, 1.218]
    ].map(([x, y]) => [side * x, y]), highlight, 3e-3, 6e-3);
  }
  const folds = [];
  function strip(points, width, height) {
    const positions = [], indices = [];
    for (const p of points) {
      const back = p.z < 0 ? -1 : 1;
      positions.push(
        p.x - width / 2,
        p.y,
        p.z,
        p.x,
        p.y,
        p.z + back * height,
        p.x + width / 2,
        p.y,
        p.z
      );
    }
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < 2; j++) {
      const a = i * 3 + j, b = a + 3;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE2.BufferGeometry();
    geometry.setAttribute("position", new THREE2.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE2.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    if (points[0].z > 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    folds.push(geometry);
  }
  strip(Array.from({ length: 12 }, (_, i) => {
    const y = 0.065 + i * 0.098;
    return new THREE2.Vector3(0.014, y, frontZ(0.014, y) + 2e-3);
  }), 0.022, 8e-3);
  strip([0.058, 0.07, 0.65, 1.15, 1.285].map((y) => new THREE2.Vector3(0, y, -radiusAt(y) - 4e-3)), 0.022, 7e-3);
  const hem = new THREE2.LatheGeometry([
    new THREE2.Vector2(0.497, 0.023),
    new THREE2.Vector2(0.507, 0.033),
    new THREE2.Vector2(0.507, 0.044),
    new THREE2.Vector2(0.502, 0.055)
  ], 32);
  folds.push(hem);
  const pocketRecesses = [];
  for (const side of [-1, 1]) {
    const shape = new THREE2.Shape();
    shape.moveTo(-0.094, -0.014);
    shape.lineTo(0.094, -0.014);
    shape.lineTo(0.094, 0.014);
    shape.lineTo(-0.094, 0.014);
    shape.closePath();
    const lip = new THREE2.ExtrudeGeometry(shape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSize: 5e-3,
      bevelThickness: 3e-3,
      bevelSegments: 1,
      steps: 1
    });
    const x = side * 0.302, y = 0.5;
    lip.rotateZ(side * 0.47);
    lip.rotateY(side * 0.63);
    lip.translate(x, y, frontZ(x, y) + 9e-3);
    folds.push(lip);
    const recess = new THREE2.PlaneGeometry(0.156, 0.01);
    recess.rotateZ(side * 0.47);
    recess.rotateY(side * 0.63);
    recess.translate(x, y - 0.01, frontZ(x, y) + 0.025);
    pocketRecesses.push(recess);
  }
  const merge = (name, pieces, mat) => {
    const normalized = pieces.map((g) => g.index ? g.toNonIndexed() : g.clone());
    const merged = mergeGeometries(normalized);
    add(name, merged, mat);
    pieces.forEach((g) => g.dispose());
    normalized.forEach((g) => g.dispose());
  };
  merge("rat-coat-tailoring", folds, coat);
  merge("rat-pocket-openings", pocketRecesses, fasteners);
  for (const [index, y] of [1.035, 0.8, 0.565].entries()) {
    const geometry = new THREE2.LatheGeometry([
      [0, -8e-3],
      [0.033, -8e-3],
      [0.043, -2e-3],
      [0.043, 3e-3],
      [0.034, 0.013],
      [0.024, 0.014],
      [0, 8e-3]
    ].map(([r, h]) => new THREE2.Vector2(r, h)), 16);
    const button = add(`rat-button-${index + 1}`, geometry, fasteners);
    button.rotation.x = Math.PI / 2;
    button.position.set(0.072, y, frontZ(0.072, y) + 0.016);
  }
}

// src/rat/RatArmModel.ts
import * as THREE3 from "three";
function createRatArm(coat, highlight) {
  const root2 = new THREE3.Group();
  root2.name = "rat-floating-sleeve";
  const add = (name, profile, material2) => {
    const geometry = new THREE3.LatheGeometry(profile.map(([r, z]) => new THREE3.Vector2(r, z)), 16);
    geometry.rotateX(Math.PI / 2);
    const part2 = new THREE3.Mesh(geometry, material2);
    part2.name = name;
    part2.castShadow = true;
    root2.add(part2);
  };
  add("rat-arm-sleeve", [[0, -0.37], [0.092, -0.37], [0.107, -0.357], [0.108, -0.338], [0.097, -0.16], [0.089, -0.109], [0, -0.109]], coat);
  add("rat-arm-cuff", [[0, -0.117], [0.091, -0.117], [0.098, -0.11], [0.098, -7e-3], [0.104, 1e-3], [0.104, 0.011], [0.095, 0.02], [0, 0.02]], highlight);
  const grip = new THREE3.Object3D();
  grip.name = "rat-sleeve-grip";
  root2.add(grip);
  return root2;
}
var RAT_GUN_SHOULDER = new THREE3.Vector3(-0.49, 1.2, -0.12);
var sleeveTip = new THREE3.Vector3();
var sleeveForward = new THREE3.Vector3(0, 0, 1);
function updateGunSleeve({ shoulder, sleeve, arm, pistol }) {
  arm.updateMatrix();
  pistol.updateMatrix();
  sleeveTip.set(-0.035, -0.065, -0.055).applyMatrix4(pistol.matrix).applyMatrix4(arm.matrix).sub(shoulder.position);
  const reach = Math.max(1e-3, sleeveTip.length());
  shoulder.quaternion.setFromUnitVectors(sleeveForward, sleeveTip.divideScalar(reach));
  sleeve.scale.z = reach / 0.37;
  sleeve.position.set(0, 0, reach);
}

// src/rat/RatModel.ts
function material(color, roughness = 0.78) {
  return new THREE4.MeshStandardMaterial({ color, roughness });
}
function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const part2 = new THREE4.Mesh(geometry, mat);
  part2.position.set(x, y, z);
  part2.castShadow = true;
  parent.add(part2);
  return part2;
}
function pivot(parent, name, x = 0, y = 0, z = 0) {
  const part2 = new THREE4.Group();
  part2.name = name;
  part2.position.set(x, y, z);
  parent.add(part2);
  return part2;
}
function muzzleGeometry() {
  const rings = [
    [-0.26, 0.025, 0.035, 0.06],
    [-0.16, 0.025, 0.26, 0.25],
    [0.02, 0.015, 0.32, 0.265],
    [0.2, -0.025, 0.26, 0.19],
    [0.39, -0.072, 0.145, 0.105],
    [0.54, -0.08, 0.055, 0.06]
  ];
  const positions = [], indices = [];
  const segments = 16;
  for (const [z, cy, rx, ry] of rings) for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    positions.push(Math.cos(angle) * rx, cy + Math.sin(angle) * ry, z);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < segments; i++) {
    const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
    indices.push(a, b, a + segments, b, b + segments, a + segments);
  }
  for (let i = 1; i < segments - 1; i++) {
    indices.push(0, i + 1, i);
    const end = (rings.length - 1) * segments;
    indices.push(end, end + i, end + i + 1);
  }
  const geometry = new THREE4.BufferGeometry();
  geometry.setAttribute("position", new THREE4.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function collarGeometry() {
  const positions = [], indices = [];
  const segments = 24;
  const profiles = [[0.355, 1.255], [0.405, 1.465], [0.382, 1.455], [0.33, 1.27]];
  for (const [radius, y] of profiles) for (let i = 0; i <= segments; i++) {
    const angle = 0.56 + i / segments * (Math.PI * 2 - 1.12);
    positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius * 0.92);
  }
  for (let face = 0; face < 4; face++) for (let i = 0; i < segments; i++) {
    const a = face * (segments + 1) + i, b = (face + 1) % 4 * (segments + 1) + i;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const i of [0, segments]) {
    const a = i, b = 25 + i, c = 50 + i, d = 75 + i;
    if (i === 0) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  }
  const geometry = new THREE4.BufferGeometry();
  geometry.setAttribute("position", new THREE4.Float32BufferAttribute(positions, 3));
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function cheesePistol(parent, coat, highlight) {
  const arm = pivot(parent, "rat-arm", -0.49, 0.91, 0.09);
  arm.rotation.x = 1.28;
  const limb = createRatArm(coat, highlight);
  const shoulder = pivot(parent, "rat-gun-shoulder", RAT_GUN_SHOULDER.x, RAT_GUN_SHOULDER.y, RAT_GUN_SHOULDER.z);
  shoulder.add(limb);
  limb.getObjectByName("rat-arm-cuff").name = "rat-pistol-cuff";
  const pistol = pivot(arm, "rat-pistol");
  const cheese2 = material(15709742, 0.62), dark = material(2697258, 0.65);
  const shape = new THREE4.Shape();
  shape.moveTo(-0.17, 0.02);
  shape.lineTo(0.23, 0.02);
  shape.lineTo(0.25, 0.05);
  shape.lineTo(0.25, 0.17);
  shape.lineTo(0.2, 0.2);
  shape.lineTo(-0.17, 0.17);
  shape.lineTo(-0.2, 0.13);
  shape.closePath();
  for (const [x, y, radius] of [[0.055, 0.105, 0.041], [-0.11, 0.125, 0.025], [-0.055, 0.035, 0.025]]) {
    const hole = new THREE4.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const shell = new THREE4.ExtrudeGeometry(shape, {
    depth: 0.13,
    bevelEnabled: true,
    bevelThickness: 8e-3,
    bevelSize: 8e-3,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 12
  });
  shell.translate(0, 0, -0.065);
  shell.rotateY(-Math.PI / 2);
  mesh(pistol, shell, cheese2);
  const gripShape = new THREE4.Shape();
  gripShape.moveTo(-0.06, 0.035);
  gripShape.lineTo(0.04, 0.035);
  gripShape.lineTo(0.06, -0.17);
  gripShape.lineTo(-0.055, -0.17);
  gripShape.closePath();
  const grip = new THREE4.ExtrudeGeometry(gripShape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.01,
    bevelSegments: 1,
    steps: 1
  });
  grip.translate(0, 0, -0.0375);
  grip.rotateY(-Math.PI / 2);
  mesh(pistol, grip, dark, 0, 0, -0.09);
  const rim = mesh(pistol, new THREE4.TorusGeometry(0.047, 0.012, 6, 16), material(10254111), 0, 0.106, 0.259);
  rim.name = "pistol-barrel";
  mesh(pistol, new THREE4.CircleGeometry(0.039, 16), dark, 0, 0.106, 0.259);
  pivot(pistol, "rat-muzzle", 0, 0.106, 0.28);
  updateGunSleeve({ shoulder, sleeve: limb, arm, pistol });
}
function createRatMesh(options = {}) {
  const root2 = new THREE4.Group();
  const coatColor = options.coatColor ?? DEFAULT_APPEARANCE.coatColor;
  const coat = material(coatColor), fur = material(options.furColor ?? DEFAULT_APPEARANCE.furColor);
  const skin = material(13209737, 0.68);
  coat.name = "rat-coat";
  skin.name = "rat-skin";
  const felt = material(options.hatColor ?? DEFAULT_APPEARANCE.hatColor);
  const highlight = material(options.highlightColor ?? DEFAULT_APPEARANCE.highlightColor);
  highlight.name = "rat-highlight";
  const shirt = material(highlight.color.clone().lerp(new THREE4.Color(16777215), 0.22));
  const darkCoat = material(coat.color.clone().multiplyScalar(0.32));
  shirt.name = "rat-shirt";
  darkCoat.name = "rat-fasteners";
  const body = pivot(root2, "rat-body");
  const coatBody = mesh(body, new THREE4.LatheGeometry(COAT_PROFILE.map(([r, y]) => new THREE4.Vector2(r, y)), 32), coat);
  coatBody.name = "rat-coat-body";
  mesh(body, collarGeometry(), highlight).name = "rat-collar";
  addCoatTailoring(body, coat, highlight, shirt, darkCoat);
  const head = pivot(body, "rat-head", 0, 1.6, 0.015);
  mesh(head, muzzleGeometry(), fur);
  mesh(head, new THREE4.SphereGeometry(0.068, 16, 10), material(3678759, 0.42), 0, -0.08, 0.545);
  const white = material(15656140), pupil = material(1249818, 0.5);
  for (const side of [-1, 1]) {
    const eye = pivot(head, side < 0 ? "rat-eye-left" : "rat-eye-right", side * 0.175, 0.102, 0.268);
    eye.scale.x = 0.93;
    eye.rotation.y = side * 0.55;
    eye.rotation.z = side * 0.09;
    mesh(eye, new THREE4.CircleGeometry(0.101, 20, Math.PI, Math.PI), white);
    mesh(eye, new THREE4.CircleGeometry(0.063, 20, Math.PI, Math.PI), pupil, -side * 0.017, -4e-3, 4e-3);
  }
  const hat = pivot(head, "rat-hat", 0, 0.19, 0);
  hat.rotation.x = 0.06;
  const brimRadius = 0.64;
  const brim = mesh(hat, new THREE4.LatheGeometry([[0, -0.0175], [brimRadius - 0.012, -0.0175], [brimRadius, -8e-3], [brimRadius, 8e-3], [brimRadius - 0.012, 0.0175], [0, 0.0175]].map(([r, y]) => new THREE4.Vector2(r, y)), 40), felt);
  brim.name = "hat-brim";
  brim.scale.z = 0.8;
  const crownHeight = 0.38, crownBottom = 0.35, crownTop = 0.315;
  const crown = new THREE4.CylinderGeometry(crownTop, crownBottom, crownHeight, 24, 3);
  {
    const points = crown.getAttribute("position");
    for (let i = 0; i < points.count; i++) {
      const top = Math.max(0, points.getY(i) / crownHeight * 2);
      const dent = 0.045 * (1 - Math.min(1, Math.abs(points.getX(i)) / 0.24));
      points.setY(i, points.getY(i) - dent * top);
    }
    crown.computeVertexNormals();
  }
  const crownMesh = mesh(hat, crown, felt, 0, crownHeight / 2 + 0.012, 0);
  crownMesh.name = "hat-crown";
  crownMesh.scale.z = 0.86;
  const radiusAt2 = (height) => crownBottom + (crownTop - crownBottom) * ((height - 0.012) / crownHeight) + 8e-3;
  const hatBand = mesh(hat, new THREE4.CylinderGeometry(radiusAt2(0.1025), radiusAt2(0.0275), 0.075, 24), highlight, 0, 0.065, 0);
  hatBand.name = "rat-hatband";
  hatBand.scale.z = 0.86;
  for (const side of [-1, 1]) {
    const ear = pivot(hat, side < 0 ? "rat-ear-left" : "rat-ear-right", side * 0.475, 0.026, 0);
    const outer = mesh(ear, new THREE4.SphereGeometry(0.13, 20, 12), fur, 0, 0.14, 0);
    outer.scale.set(1, 1.075, 0.34);
    outer.userData.noOutline = true;
    const inner = mesh(ear, new THREE4.SphereGeometry(0.095, 20, 12), skin, 0, 0.143, 0.032);
    inner.scale.set(1, 1.07, 0.2);
    inner.userData.noOutline = true;
  }
  const tailCurve = new THREE4.CatmullRomCurve3([
    new THREE4.Vector3(0, 0, 0),
    new THREE4.Vector3(0.02, -0.18, -0.42),
    new THREE4.Vector3(0.17, -0.19, -0.88),
    new THREE4.Vector3(0.2, -0.17, -1.17)
  ]);
  const tail = mesh(root2, new THREE4.TubeGeometry(tailCurve, 24, 0.052, 10, false), skin, 0, 0.25, -0.44);
  tail.name = "rat-tail";
  mesh(tail, new THREE4.SphereGeometry(0.052, 12, 8), skin, 0.2, -0.17, -1.17);
  cheesePistol(body, coat, highlight);
  return root2;
}

// src/presentation/CaseModel.ts
import * as THREE5 from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries as mergeGeometries2 } from "three/addons/utils/BufferGeometryUtils.js";
function addLeatherBriefcase(root2) {
  const firstChild = root2.children.length;
  const leather = new THREE5.MeshStandardMaterial({ color: 6503721, roughness: 0.8, emissive: 6503721, emissiveIntensity: 0.28 });
  const panel = new THREE5.MeshStandardMaterial({ color: 7885114, roughness: 0.87, emissive: 7885114, emissiveIntensity: 0.25 });
  const edge = new THREE5.MeshStandardMaterial({ color: 4007709, roughness: 0.86 });
  const brass = new THREE5.MeshStandardMaterial({ color: 11898194, metalness: 0.65, roughness: 0.45 });
  const paper = new THREE5.MeshStandardMaterial({ color: 15062702, roughness: 0.95 });
  const file = new THREE5.MeshStandardMaterial({ color: 11506019, roughness: 0.95 });
  const part2 = (name, w, h, d, mat, x = 0, y = 0, z = 0, rounded = false) => {
    const geometry = rounded ? new RoundedBoxGeometry(w, h, d, 2, 0.022) : new THREE5.BoxGeometry(w, h, d);
    const mesh2 = new THREE5.Mesh(geometry, mat);
    mesh2.name = name;
    mesh2.position.set(x, y, z);
    root2.add(mesh2);
    return mesh2;
  };
  for (const [expansion, opacity] of [[0.025, 1], [0.055, 0.36], [0.085, 0.14]]) {
    const material2 = new THREE5.MeshBasicMaterial({
      color: 16724004,
      side: THREE5.BackSide,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
      blending: THREE5.AdditiveBlending,
      toneMapped: false
    });
    const shell = new THREE5.Mesh(new RoundedBoxGeometry(
      CASE_SIZE.x + expansion * 2,
      CASE_SIZE.y + expansion * 2,
      CASE_SIZE.z + expansion * 2,
      3,
      0.03
    ), material2);
    shell.name = "case-silhouette-glow";
    shell.raycast = () => {
    };
    root2.add(shell);
  }
  part2("leather-case-shell", CASE_SIZE.x, CASE_SIZE.y, CASE_SIZE.z, leather, 0, 0, 0, true);
  for (const z of [-0.173, 0.173]) {
    part2("leather-inset-panel", 0.72, 0.5, 0.012, panel, 0, -0.015, z, true);
    for (const x of [-0.28, 0.28]) part2("leather-strap", 0.045, 0.58, 0.016, edge, x, 0, z);
    for (const y of [-0.24, 0.23]) part2("stitched-edge", 0.68, 6e-3, 0.016, file, 0, y, z);
    for (const x of [-0.34, 0.34]) part2("stitched-edge", 6e-3, 0.47, 0.016, file, x, -5e-3, z);
  }
  part2("closed-lid-seam", 0.76, 9e-3, 0.014, edge, 0, 0.29, 0);
  for (const x of [-0.28, 0.28]) {
    part2("brass-clasp", 0.075, 0.11, 0.025, brass, x, 0.23, 0.185, true);
    part2("clasp-slot", 0.035, 0.012, 4e-3, edge, x, 0.225, 0.2);
  }
  for (const [index, x] of [-0.32, -0.23, 0.24, 0.33].entries()) {
    const sheet = part2("protruding-documents", 0.16, 0.11 + index % 2 * 0.025, 0.012, paper, x, 0.306, index % 2 ? 0.035 : -0.025);
    sheet.rotation.z = index % 2 ? -0.12 : 0.09;
    part2("document-lines", 0.11, 5e-3, 0.013, file, x, 0.34, index % 2 ? 0.035 : -0.025);
  }
  part2("case-handle-grip", 0.3, 0.07, 0.08, edge, 0, 0.43, 0, true);
  for (const x of [-0.12, 0.12]) {
    part2("case-handle-support", 0.055, 0.13, 0.08, leather, x, 0.36);
    part2("handle-anchor", 0.075, 0.025, 0.1, brass, x, 0.306);
  }
  const groups = /* @__PURE__ */ new Map();
  for (const object of root2.children.slice(firstChild)) {
    const mesh2 = object, material2 = mesh2.material;
    if (!groups.has(material2)) groups.set(material2, []);
    groups.get(material2).push(mesh2);
  }
  for (const [material2, meshes] of groups) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map((mesh2) => {
      mesh2.updateMatrix();
      return (mesh2.geometry.index ? mesh2.geometry.toNonIndexed() : mesh2.geometry.clone()).applyMatrix4(mesh2.matrix);
    });
    const merged = new THREE5.Mesh(mergeGeometries2(pieces), material2);
    merged.name = meshes.some((mesh2) => mesh2.name === "leather-case-shell") ? "leather-case-shell" : "case-detail-" + meshes[0].name;
    pieces.forEach((g) => g.dispose());
    meshes.forEach((mesh2) => {
      mesh2.removeFromParent();
      mesh2.geometry.dispose();
    });
    root2.add(merged);
  }
  const grip = new THREE5.Object3D();
  grip.name = "case-handle-grip";
  grip.position.y = 0.43;
  root2.add(grip);
}

// .design/social-share/export-real-scene.ts
import sharp from "sharp";
var StubCanvas = class {
  w = 1;
  h = 1;
  pixels = new Uint8ClampedArray(4);
  get width() {
    return this.w;
  }
  set width(v) {
    this.w = v;
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height() {
    return this.h;
  }
  set height(v) {
    this.h = v;
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
  }
  context;
  getContext() {
    if (!this.context) {
      const canvas = this;
      this.context = {
        fillStyle: "#000000",
        _flip: false,
        translate() {
        },
        scale(_x, y) {
          this._flip = y < 0;
        },
        fillRect(x, y, w, h) {
          const c = String(this.fillStyle);
          let rgb;
          if (c[0] === "#") {
            const v = c.slice(1);
            rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
          } else rgb = (c.match(/\d+/g) || []).slice(0, 3).map(Number);
          for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(canvas.h, Math.ceil(y + h)); yy++)
            for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(canvas.w, Math.ceil(x + w)); xx++) {
              const i = (yy * canvas.w + xx) * 4;
              canvas.pixels[i] = rgb[0];
              canvas.pixels[i + 1] = rgb[1];
              canvas.pixels[i + 2] = rgb[2];
              canvas.pixels[i + 3] = 255;
            }
        },
        drawImage(image, _x, _y, w, h) {
          for (let y = 0; y < canvas.h; y++) for (let x = 0; x < canvas.w; x++) {
            const sx = Math.min(image.width - 1, Math.floor(x / w * image.width));
            const sy = Math.min(image.height - 1, Math.floor((this._flip ? canvas.h - 1 - y : y) / h * image.height));
            const i = (y * canvas.w + x) * 4, j = (sy * image.width + sx) * 4;
            canvas.pixels.set(image.pixels.subarray(j, j + 4), i);
          }
        }
      };
    }
    return this.context;
  }
  toBlob(callback) {
    sharp(Buffer.from(this.pixels), { raw: { width: this.w, height: this.h, channels: 4 } }).png().toBuffer().then((b) => callback(new Blob([b], { type: "image/png" })));
  }
};
globalThis.document = { createElement: (name) => {
  if (name !== "canvas") throw new Error(name);
  return new StubCanvas();
} };
globalThis.HTMLCanvasElement = StubCanvas;
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
};
var scene = new THREE6.Scene();
var world = new CANNON2.World();
var spec = { seed: 341283204, version: 1 };
var all = [...cityStreetBuildings(generateBuildingLayout(spec)), ...CENTRAL_BUILDINGS];
var layout = all.filter((b) => b.cx > -48 && b.cx < 70 && b.cz > -55 && b.cz < 90);
var city = new CityGenerator(scene, world, void 0, spec);
city.generate(layout, true);
console.log("buildings", layout.length, "scene objects", scene.children.length, "windows", city.windowLights.length);
var root = new THREE6.Group();
root.name = "REAL GAME ASSETS";
var region = (x, z) => x > -45 && x < 65 && z > -40 && z < 55;
for (const obj of [...scene.children]) {
  if (obj instanceof THREE6.InstancedMesh) {
    for (let i = 0; i < obj.count; i++) {
      const m = new THREE6.Matrix4();
      obj.getMatrixAt(i, m);
      const p = new THREE6.Vector3().setFromMatrixPosition(m);
      if (!region(p.x, p.z)) continue;
      const mesh2 = new THREE6.Mesh(obj.geometry, obj.material);
      mesh2.applyMatrix4(m);
      root.add(mesh2);
    }
  } else if (obj instanceof THREE6.Mesh) {
    if (!region(obj.position.x, obj.position.z)) continue;
    root.add(obj);
  }
}
root.traverse((obj) => {
  if (!(obj instanceof THREE6.Mesh)) return;
  for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material])
    for (const key of Object.keys(mat)) if (mat[key]?.isDataTexture) mat[key] = null;
});
var windowColors = /* @__PURE__ */ new Map();
for (const s of city.windowLights) {
  if (s.kind !== "window" || !region(s.x, s.z) || s.y > 38) continue;
  let mat = windowColors.get(s.color);
  if (!mat) {
    mat = new THREE6.MeshBasicMaterial({ color: s.color, side: THREE6.DoubleSide });
    windowColors.set(s.color, mat);
  }
  const pane = new THREE6.Mesh(new THREE6.PlaneGeometry(s.width ?? 1.35, s.height ?? 1.4), mat);
  pane.position.set(s.x + s.nx * 0.04, s.y, s.z + s.nz * 0.04);
  pane.rotation.y = Math.atan2(s.nx, s.nz);
  root.add(pane);
}
var appearances = [
  { coatColor: 2571109, hatColor: 2438227, furColor: 12687996, highlightColor: 14401931 },
  { coatColor: 9120054, hatColor: 7020851, furColor: 12356713, highlightColor: 14789232 },
  { coatColor: 3106127, hatColor: 2708291, furColor: 14002807, highlightColor: 13157524 }
];
for (let i = 0; i < 3; i++) {
  const rat = createRatMesh(appearances[i]);
  rat.name = `game-rat-${i}`;
  root.add(rat);
}
var caseRoot = new THREE6.Group();
caseRoot.name = "game-briefcase";
addLeatherBriefcase(caseRoot);
for (const child of caseRoot.children) if (child.name === "case-silhouette-glow") child.visible = false;
root.add(caseRoot);
var cheese = new THREE6.Group();
cheese.name = "game-cheese-ball";
var ball = new THREE6.Mesh(new THREE6.SphereGeometry(0.21, 20, 14), new THREE6.MeshStandardMaterial({ color: 16042048, roughness: 0.65, emissive: 9127424, emissiveIntensity: 0.18 }));
cheese.add(ball);
for (const [x, y, z, r] of [[0.08, 0.13, 0.17, 0.035], [-0.1, -0.03, 0.17, 0.027], [0.02, -0.09, -0.18, 0.034]]) {
  const pore = new THREE6.Mesh(new THREE6.SphereGeometry(r, 10, 8), new THREE6.MeshStandardMaterial({ color: 12092976, roughness: 1 }));
  pore.position.set(x, y, z);
  cheese.add(pore);
}
root.add(cheese);
var data = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
await writeFile(".design/social-share/real-assets.glb", Buffer.from(data));
console.log("exported glb", Buffer.byteLength(data));
