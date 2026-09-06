import { performance } from 'node:perf_hooks';
import * as CANNON from 'cannon-es';

function trial(kind, count = 8) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -25, 0) });
  world.broadphase = kind === 'sap' ? new CANNON.SAPBroadphase(world) : new CANNON.NaiveBroadphase();
  world.defaultContactMaterial.friction = 0;
  world.defaultContactMaterial.restitution = 0.05;
  const ground = new CANNON.Body({ mass: 0 });
  ground.addShape(new CANNON.Plane()); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
  for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(5.5, 25, 5.5)),
      position: new CANNON.Vec3(x * 30, 25, z * 30) });
    world.addBody(body);
  }
  const players = [];
  for (let i = 0; i < count; i++) {
    const body = new CANNON.Body({ mass: 5, fixedRotation: true, position: new CANNON.Vec3(15 + i * 3, 2, 15) });
    body.addShape(new CANNON.Sphere(0.6), new CANNON.Vec3(0, 0.6, 0));
    body.addShape(new CANNON.Sphere(0.45), new CANNON.Vec3(0, 1.3, 0));
    body.addShape(new CANNON.Sphere(0.28), new CANNON.Vec3(0, 1.9, 0));
    world.addBody(body); players.push(body);
  }
  const samples = [];
  for (let tick = 0; tick < 900; tick++) {
    for (const player of players) player.velocity.x += ((tick < 450 ? 18 : -18) - player.velocity.x) * 0.28;
    const start = performance.now(); world.step(1 / 60); const elapsed = performance.now() - start;
    if (tick >= 300) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  return { kind, bodies: world.bodies.length, medianMs: samples[Math.floor(samples.length * .5)],
    p95Ms: samples[Math.floor(samples.length * .95)], positions: players.map(p => p.position.toArray()) };
}
// Warm both implementations before reporting. This is a CPU microbenchmark, not game FPS.
trial('naive'); trial('sap');
const naive = trial('naive'); const sap = trial('sap');
const maxPositionDifference = Math.max(...naive.positions.flatMap((p, i) => p.map((n, j) => Math.abs(n - sap.positions[i][j]))));
console.log(JSON.stringify({ scenario: '144 static buildings, ground, 8 compound rats, 900 simulation ticks',
  naive, sap, maxPositionDifference,
  decision: 'Keep current broadphase until representative browser collision/frame-time comparisons justify changing solver ordering.' }, null, 2));
