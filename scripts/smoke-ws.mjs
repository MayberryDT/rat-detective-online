// Bounded protocol smoke, not human gameplay acceptance. Failure modes: failed admission, wrong protocol, lost peer/movement, accepted implausible shot, absent authoritative shot, stale pickup claim accepted, leaked sockets.
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
import assert from 'node:assert/strict';
import { resolveSmokeWsUrl } from './lib/process.mjs';


const targetUrl = resolveSmokeWsUrl(process.argv.slice(2).find(arg=>/^wss?:/.test(arg)));
targetUrl.searchParams.set('agent','1');
const out=resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??process.env.SMOKE_WS_RECEIPT??resolve(tmpdir(),'rat-detective-websocket-smoke.json'));
const report={at:new Date().toISOString(),kind:'bounded protocol fixture; not gameplay acceptance',protocol:PROTOCOL_VERSION,checks:[]};
const appearance = { hatType: 'fedora', hatColor: 0xdc4a3c, furColor: 0xe8b84d, coatColor: 0xbe4545 };
const clients = [];

async function openClient(name) {
  const socket = new WebSocket(targetUrl);
  const messages = [];
  const waiters = new Set();
  socket.addEventListener('message', event => {
    const message = readSocketMessage(socket,event.data);if(!message)return;
    const waiter = [...waiters].find(entry => entry.matches(message));
    if (waiter) waiter.resolve(message);
    else messages.push(message);
  });
  const client = {
    socket,
    send: message => socket.send(JSON.stringify(message)),
    waitFor(type, predicate = () => true, timeoutMs = 8_000) {
      const matches = message => message.type === type && predicate(message);
      const index = messages.findIndex(matches);
      if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {
          matches,
          resolve(message) {
            clearTimeout(timeout);
            waiters.delete(waiter);
            resolve(message);
          },
        };
        const timeout = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`${name}: timed out waiting for ${type}`));
        }, timeoutMs);
        waiters.add(waiter);
      });
    },
  };
  clients.push(client);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out opening ${name}`)), 5_000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`Connection failed: ${name}`)); }, { once: true });
  });
  client.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, name, appearance });
  return client;
}

try {
  const first = await openClient('Smoke Rat 1');
  const firstWelcome = await first.waitFor('welcome');
  assert.equal(firstWelcome.protocolVersion, PROTOCOL_VERSION);
  assert.ok(firstWelcome.player);
  assert.ok(firstWelcome.world);
  assert.ok(firstWelcome.round);

  const second = await openClient('Smoke Rat 2');
  const secondWelcome = await second.waitFor('welcome');
  const secondPlayers = secondWelcome;
  assert.ok(secondPlayers.players[firstWelcome.id]);
  assert.equal((await first.waitFor('playerJoined')).player.id, secondWelcome.id);

  const position = {
    x: firstWelcome.player.x,
    y: firstWelcome.player.y,
    z: firstWelcome.player.z,
  };
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  first.send({ type: 'updateMovement', position, rotation, meshRotation: rotation, seq:1 });
  const moved = await second.waitFor('playerMoved',m=>m.player.id===firstWelcome.id);
  assert.equal(moved.player.id, firstWelcome.id);
  assert.deepEqual([moved.player.x, moved.player.y, moved.player.z], [position.x, position.y, position.z]);

  const origin = { x: position.x, y: position.y + 1.45, z: position.z };
  const direction = { x: 1, y: 0, z: 0 };
  const shotId = crypto.randomUUID();
  first.send({ type: 'shoot', shotId, origin, direction });
  const shot = await second.waitFor('playerShot',m=>m.shotId===shotId);
  assert.equal(shot.shooterId, firstWelcome.id);
  assert.equal(shot.shotId, shotId);
  assert.deepEqual(shot.origin, origin);
  assert.deepEqual(shot.direction, direction);

  // The authority rejects a shot from outside the rat's muzzle envelope.
  const invalidId=crypto.randomUUID();
  first.send({type:'shoot',shotId:invalidId,origin:{x:position.x+1000,y:position.y,z:position.z},direction});
  const rejected=await first.waitFor('shotResult',m=>m.shotId===invalidId);
  assert.equal(rejected.outcome,'rejected');assert.equal(rejected.fallback,'implausible');
  const interactionId=crypto.randomUUID();
  first.send({type:'pickupIntent',interactionId,target:'pickup',targetId:'not-a-site',generation:0,movement:{position,rotation,meshRotation:rotation,seq:2}});
  const claim=await first.waitFor('pickupResult',m=>m.interactionId===interactionId);
  assert.equal(claim.accepted,false);
  report.checks.push('current admission and protocol','two peers join','sequenced movement broadcast','authoritative shot broadcast','implausible shot rejected','unknown supply claim rejected');
  console.log(`WebSocket smoke passed: protocol ${PROTOCOL_VERSION}, joins, movement, shot admission and pickup rejection`);
  report.passed=true;
} finally {
  for (const { socket } of clients) socket.close(1000, 'smoke complete');
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
}
