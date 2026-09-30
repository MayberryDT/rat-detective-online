// Fight motion from recorder windows (docs/bot-overhaul.md, "Motor rewrite"): how a rat moves, jumps and aims in a fight,
// and which controls it presses. One measure for humans and bots alike: scripts/motor-compare.mjs feeds it city.db windows,
// scripts/bot-sim.mjs feeds it windows its headless rooms record the same way (CityRecorder: 5 Hz `[t, x, y, z, yaw, hp]`,
// 20 Hz `[t, yaw, pitch]`, 20 Hz controls `[t, f, r, jumps, fx, rx]`).

/** Moving: faster than a walk. A jump: a 5 Hz height peak at least 1 unit above both samples 0.4 s either side
 * (a jump rises about 5 units and lasts about 1.1 s; stairs never peak), and under 8 (launches). */
const MOVING = 3, JUMP_RISE = 1, JUMP_MAX = 8, AIR_MS = 550;
/** A flick: the aim turns more than 0.6 rad within 150 ms. Still aim: turning under 0.1 rad/s. */
const FLICK = .6, FLICK_MS = 150, STILL = .1;
/** Decoupled: moving more than 60° away from where the rat looks (strafing, back-pedalling). */
const DECOUPLED = Math.PI / 3, BACK = Math.PI * 3 / 4;
/** Controls (src/shared/rat/controlTally.ts): a 20 Hz slot is 50 ms; a press is placed mid-slot. Pairs: a strafe key and a
 * jump within 100 ms, a jump and a trigger pull within 150 ms, a pull within 200 ms after a flick ends, all three within
 * 200 ms. A strafe direction flip crosses at most 250 ms with no strafe key. */
const SLOT = 50, STRAFE_JUMP_MS = 100, JUMP_FIRE_MS = 150, FLICK_FIRE_MS = 200, ALL_MS = 200, FLIP_GAP_MS = 250;

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** `axisKey` in src/shared/rat/controlTally.ts: the key held on the `along` axis, the nearest of the eight key directions. */
const KEY = Math.sin(Math.PI / 8);
const axisKey = (along, across) => { const l = Math.hypot(along, across); return l < .05 ? 0 : along > KEY * l ? 1 : along < -KEY * l ? -1 : 0; };

/** An empty accumulator: sums and sample lists, pooled over any number of windows and rats. */
export const empty = () => ({ fightS: 0, skippedS: 0, moveS: 0, speeds: [], stops: 0, samples: 0, turns: 0, jumps: 0, jumpsMoving: 0, strafeJumps: 0, airS: 0,
  turnRates: [], airTurnRates: [], groundTurnRates: [], still: 0, aimSamples: 0, flicks: 0, offAngles: [], decoupled: 0, back: 0, movingAim: 0,
  shots: 0, airShots: 0, errs: [], airErrs: [], groundErrs: [], leads: [], airDecoupledS: 0, airMovingS: 0,
  flickSizes: [], flickShots: 0, flickShotDelays: [],
  controlS: 0, controlSlots: 0, forwardSlots: 0, backSlots: 0, strafeSlots: 0, releasedSlots: 0, strafeHolds: [], strafeFlips: 0, jumpPresses: 0,
  controlShots: 0, strafeJumpPresses: 0, jumpShots: 0, strafeShots: 0, allShots: 0 });

/** Pools `from` into `into` (sums add, sample lists concatenate); returns `into`. */
export const merge = (into, from) => {
  for (const [k, v] of Object.entries(from)) if (Array.isArray(v)) for (const x of v) into[k].push(x); else into[k] += v;
  return into;
};

/**
 * Adds one rat's part of one fight window to `g`.
 * `w`: `{ from, samples: { [actor]: [t, x, y, z, yaw, hp][] }, aim?: { [actor]: [t, yaw, pitch | null][] },
 *   controls?: { [actor]: [t, f, r, jumps, fx, rx][] } }`, t in ms after `from`.
 * `skips`: `[from, to]` wall-clock stretches left out (launcher flights, Hot Pursuit).
 * `shots`: the rat's shots, `{ t, sample?, targets?: [{ e, lat, lead }] }` with wall-clock t; `sample` is how many shots one stands for.
 */
export function accumulate(g, w, a, { skips = [], shots = [] } = {}) {
  const pos = w.samples?.[a];
  if (!pos) return;
  const skipped = (ms) => skips.some(([s, e]) => w.from + ms >= s && w.from + ms <= e);
  const living = pos.filter(s => s[5] > 0), alive = living.filter(s => !skipped(s[0]));
  g.skippedS += (living.length - alive.length) * .2;
  if (alive.length < 3) return;
  const aim = (w.aim?.[a] ?? []).filter(s => !skipped(s[0]));
  const yawAt = (ms) => { let best; for (const s of aim) if (!best || Math.abs(s[0] - ms) < Math.abs(best[0] - ms)) best = s; return best && Math.abs(best[0] - ms) <= 100 ? best[1] : undefined; };
  // Jumps and the time spent in the air.
  const air = [];
  for (let i = 2; i < alive.length - 2; i++) {
    const y = alive[i][2], before = y - alive[i - 2][2], after = y - alive[i + 2][2];
    if (before >= JUMP_RISE && after >= JUMP_RISE && before < JUMP_MAX && y >= alive[i - 1][2] && y >= alive[i + 1][2]) air.push([alive[i][0] - AIR_MS, alive[i][0] + AIR_MS]);
  }
  const inAir = (ms) => air.some(([s, e]) => ms >= s && ms <= e);
  // Fight time: the kept stretches only (a gap over 0.5 s is a skipped flight or buff).
  let span = 0;
  for (let i = 1; i < alive.length; i++) { const dt = (alive[i][0] - alive[i - 1][0]) / 1000; if (dt > 0 && dt <= .5) span += dt; }
  g.fightS += span; g.jumps += air.length;
  // Movement, and how it relates to jumping and to where the rat looks.
  let lastHeading;
  for (let i = 1; i < alive.length; i++) {
    const [t0, x0, , z0] = alive[i - 1], [t1, x1, , z1] = alive[i], dt = (t1 - t0) / 1000;
    if (dt <= 0 || dt > .5) { lastHeading = undefined; continue; }
    const speed = Math.hypot(x1 - x0, z1 - z0) / dt, heading = Math.atan2(x1 - x0, z1 - z0), airborne = inAir(t1);
    g.samples++; g.speeds.push(speed); if (speed < 1) g.stops++;
    if (airborne) g.airS += dt;
    if (speed <= MOVING) { lastHeading = undefined; continue; }
    g.moveS += dt;
    if (lastHeading !== undefined && Math.abs(wrap(heading - lastHeading)) > Math.PI / 3) g.turns++;
    lastHeading = heading;
    const yaw = yawAt(t1);
    if (yaw === undefined) continue;
    const off = Math.abs(wrap(heading - yaw));
    g.movingAim++; g.offAngles.push(off); if (off > DECOUPLED) g.decoupled++; if (off > BACK) g.back++;
    if (airborne) { g.airMovingS += dt; if (off > DECOUPLED) g.airDecoupledS += dt; }
  }
  for (const [start] of air) {
    const i = alive.findIndex(s => s[0] >= start);
    const s0 = alive[Math.max(0, i - 1)], s1 = alive[Math.min(alive.length - 1, i + 1)], dt = (s1[0] - s0[0]) / 1000;
    if (dt <= 0) continue;
    const speed = Math.hypot(s1[1] - s0[1], s1[3] - s0[3]) / dt;
    if (speed > MOVING) { g.jumpsMoving++; const yaw = yawAt(start + AIR_MS); if (yaw !== undefined && Math.abs(wrap(Math.atan2(s1[1] - s0[1], s1[3] - s0[3]) - yaw)) > DECOUPLED) g.strafeJumps++; }
  }
  // Aim: turn rates in the air and on the ground, still aim, flicks.
  for (let i = 1; i < aim.length; i++) {
    const dt = (aim[i][0] - aim[i - 1][0]) / 1000;
    if (dt <= 0 || dt > .2) continue;
    const rate = Math.abs(wrap(aim[i][1] - aim[i - 1][1])) / dt;
    g.aimSamples++; g.turnRates.push(rate); if (rate < STILL) g.still++;
    (inAir(aim[i][0]) ? g.airTurnRates : g.groundTurnRates).push(rate);
  }
  // Flicks: how far each turned (the largest turn within 300 ms of its start) and when it got there.
  const flicks = [];
  for (let i = 0, j = 0; i < aim.length; i++) {
    while (j < aim.length && aim[j][0] - aim[i][0] <= FLICK_MS) j++;
    if (j - 1 > i && Math.abs(wrap(aim[j - 1][1] - aim[i][1])) > FLICK) {
      g.flicks++;
      let size = 0, end = aim[i][0];
      for (let k = i + 1; k < aim.length && aim[k][0] - aim[i][0] <= 2 * FLICK_MS; k++) { const turn = Math.abs(wrap(aim[k][1] - aim[i][1])); if (turn > size) { size = turn; end = aim[k][0]; } }
      g.flickSizes.push(size); flicks.push([aim[i][0], end]);
      // The next flick may start 300 ms after this one did.
      for (const start = aim[i][0]; i + 1 < aim.length && aim[i + 1][0] - start < 2 * FLICK_MS;) i++;
    }
  }
  // Shots in this window: accuracy and lead, in the air and on the ground; pulls during or just after a flick.
  const pulls = [];
  for (const s of shots) {
    const ms = s.t - w.from;
    if (ms < alive[0][0] || ms > alive.at(-1)[0] || skipped(ms)) continue;
    const weight = s.sample ?? 1, airborne = inAir(ms), target = s.targets?.[0];
    g.shots += weight; if (airborne) g.airShots += weight;
    pulls.push([ms, weight]);
    // A pull during a flick or within 200 ms after it lands; the delay runs from the flick's start.
    const flick = flicks.findLast(([start]) => start <= ms);
    if (flick && ms - flick[1] <= FLICK_FIRE_MS) { g.flickShots += weight; g.flickShotDelays.push(ms - flick[0]); }
    if (!target) continue;
    g.errs.push(target.e); (airborne ? g.airErrs : g.groundErrs).push(target.e);
    if (target.lat >= 2 && target.lead !== undefined) g.leads.push(target.lead > 0 ? 1 : 0);
  }
  controls(g, (w.controls?.[a] ?? []).filter(s => s[0] >= alive[0][0] && s[0] <= alive.at(-1)[0] && !skipped(s[0])), pulls);
}

/** The controls part of a window: `ctl` its 20 Hz slots `[t, f, r, jumps, fx, rx]` (each covers the 50 ms up to t: keys
 * held at t, presses within), `pulls` its trigger pulls `[t, weight]`. */
function controls(g, ctl, pulls) {
  if (ctl.length < 2) return;
  const forward = ctl.map(s => axisKey(s[1], s[2])), right = ctl.map(s => axisKey(s[2], s[1]));
  // A strafe key down at the slot's end, or pressed or let go within it.
  const strafing = i => right[i] !== 0 || ctl[i][5] > 0;
  const near = (t, within, test) => ctl.some((s, i) => Math.abs(s[0] - t) <= within && test(i));
  let run = -1, lastDir = 0, lastDirAt = -Infinity;
  for (let i = 0; i < ctl.length; i++) {
    const [t, , , jumps, fx, rx] = ctl[i], joined = i > 0 && t - ctl[i - 1][0] <= 3 * SLOT;
    if (i > 0 && joined) g.controlS += (t - ctl[i - 1][0]) / 1000;
    g.controlSlots++;
    if (forward[i] > 0) g.forwardSlots++; else if (forward[i] < 0) g.backSlots++;
    if (right[i]) g.strafeSlots++;
    if (!forward[i] && !right[i] && !jumps && !fx && !rx) g.releasedSlots++;
    // Strafe holds: runs of one direction with a different key (or none) on both sides; taps within one slot, as half a slot.
    if (!joined) { run = -1; lastDir = 0; }
    else if (right[i] !== right[i - 1]) {
      if (run >= 0) g.strafeHolds.push(ctl[i - 1][0] - ctl[run][0] + SLOT);
      run = right[i] ? i : -1;
    } else if (!right[i] && rx >= 2) for (let n = 0; n < Math.floor(rx / 2); n++) g.strafeHolds.push(SLOT / 2);
    if (right[i]) {
      if (lastDir && right[i] !== lastDir && t - lastDirAt - SLOT <= FLIP_GAP_MS) g.strafeFlips++;
      lastDir = right[i]; lastDirAt = t;
    }
    // Jumps, and whether a strafe key was down around them.
    if (jumps) { g.jumpPresses += jumps; if (near(t, STRAFE_JUMP_MS, strafing)) g.strafeJumpPresses += jumps; }
  }
  // Trigger pulls against the keys: strafing at the pull, a jump just before or after, and all three together.
  for (const [t, weight] of pulls) {
    if (t < ctl[0][0] - SLOT || t > ctl.at(-1)[0]) continue;
    g.controlShots += weight;
    const slot = ctl.findIndex(s => s[0] >= t);
    if (slot >= 0 && strafing(slot)) g.strafeShots += weight;
    if (near(t + SLOT / 2, JUMP_FIRE_MS, i => ctl[i][3] > 0)) g.jumpShots += weight;
    if (ctl.some(s => s[3] > 0 && Math.abs(s[0] - SLOT / 2 - t) <= ALL_MS && near(t, ALL_MS, i => strafing(i) && Math.abs(ctl[i][0] - s[0]) <= ALL_MS))) g.allShots += weight;
  }
}

const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const share = (n, d) => d ? n / d : null;
const perMin = (n, s) => s ? n / (s / 60) : null;
/** The measures, by family; null where the sample has nothing to measure. */
export const features = (g) => ({
  move: { speedMedian: q(g.speeds, .5), speedP90: q(g.speeds, .9), stopShare: share(g.stops, g.samples), directionChangesPerMovingMin: perMin(g.turns, g.moveS) },
  jump: { jumpsPerFightMin: perMin(g.jumps, g.fightS), airShare: share(g.airS, g.fightS) },
  aim: { turnRateMedian: q(g.turnRates, .5), turnRateP90: q(g.turnRates, .9), stillAimShare: share(g.still, g.aimSamples), flicksPerFightMin: perMin(g.flicks, g.fightS),
    shotErrorMedian: q(g.errs, .5), leadAheadShare: share(g.leads.reduce((a, b) => a + b, 0), g.leads.length) },
  moveAim: { decoupledShare: share(g.decoupled, g.movingAim), backpedalShare: share(g.back, g.movingAim), offAngleMedian: q(g.offAngles, .5) },
  moveJump: { jumpsWhileMovingShare: share(g.jumpsMoving, g.jumps), strafeJumpShare: share(g.strafeJumps, g.jumps) },
  jumpAim: { airShotShare: share(g.airShots, g.shots), airTurnRateMedian: q(g.airTurnRates, .5), groundTurnRateMedian: q(g.groundTurnRates, .5),
    airShotErrorMedian: q(g.airErrs, .5), groundShotErrorMedian: q(g.groundErrs, .5) },
  all: { airborneDecoupledShareOfMovingAir: share(g.airDecoupledS, g.airMovingS), airborneDecoupledPerFightMin: perMin(g.airDecoupledS, g.fightS) },
  // The controls pressed (humans since their client sent controls; bots in every window). Shares of slots, of jump
  // presses or of trigger pulls; pulls are shot facts (bots' sampled one in ten, weighted), flicks come from the aim.
  'inputs.alone': { forwardShare: share(g.forwardSlots, g.controlSlots), backShare: share(g.backSlots, g.controlSlots), strafeShare: share(g.strafeSlots, g.controlSlots),
    releasedShare: share(g.releasedSlots, g.controlSlots), strafeHoldMedianMs: q(g.strafeHolds, .5), strafeFlipsPerMin: perMin(g.strafeFlips, g.controlS),
    jumpPressesPerMin: perMin(g.jumpPresses, g.controlS), triggerPullsPerMin: perMin(g.shots, g.fightS), mouseStillShare: share(g.still, g.aimSamples),
    flickSizeMedian: q(g.flickSizes, .5), flickSizeP90: q(g.flickSizes, .9) },
  'inputs.pairs': { jumpsStrafingShare: share(g.strafeJumpPresses, g.jumpPresses), pullsNearJumpShare: share(g.jumpShots, g.controlShots),
    pullsStrafingShare: share(g.strafeShots, g.controlShots), pullsAfterFlickShare: share(g.flickShots, g.shots), flickToPullMedianMs: q(g.flickShotDelays, .5) },
  'inputs.all': { strafeJumpPullsPerMin: perMin(g.allShots, g.controlS), strafeJumpPullShare: share(g.allShots, g.controlShots) },
});
