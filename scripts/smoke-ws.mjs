import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';
import assert from 'node:assert/strict';
import { resolveSmokeWsUrl } from './lib/process.mjs';


const targetUrl = resolveSmokeWsUrl(process.argv[2]);
if (!targetUrl.searchParams.has('room')) {
  targetUrl.searchParams.set('room', `smoke-${crypto.randomUUID()}`);
}
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
  first.send({ type: 'updateMovement', position, rotation, meshRotation: rotation });
  const moved = await second.waitFor('playerMoved');
  assert.equal(moved.player.id, firstWelcome.id);
  assert.deepEqual([moved.player.x, moved.player.y, moved.player.z], [position.x, position.y, position.z]);

  const origin = { x: position.x, y: position.y + 1.45, z: position.z };
  const direction = { x: 1, y: 0, z: 0 };
  const shotId = crypto.randomUUID();
  first.send({ type: 'shoot', shotId, origin, direction });
  const shot = await second.waitFor('playerShot');
  assert.equal(shot.shooterId, firstWelcome.id);
  assert.equal(shot.shotId, shotId);
  assert.deepEqual(shot.origin, origin);
  assert.deepEqual(shot.direction, direction);

  first.send({ type: 'hit', victimId: secondWelcome.id, damage: 3 });
  const damaged = await second.waitFor('playerDamaged');
  assert.equal(damaged.id, secondWelcome.id);
  assert.equal(damaged.hp, 0);
  const died = await first.waitFor('playerDied');
  assert.equal(died.victimId, secondWelcome.id);
  assert.equal(died.killerId, firstWelcome.id);
  const scoreboard = await first.waitFor('scoreboardUpdate', message => message.scores.some(score => score.kills === 1));
  assert.equal(scoreboard.scores.find(score => score.id === firstWelcome.id).kills, 1);
  assert.equal(scoreboard.scores.find(score => score.id === secondWelcome.id).deaths, 1);
  const respawn = await second.waitFor('playerRespawn');
  assert.equal(respawn.id, secondWelcome.id);
  assert.equal(respawn.hp, 3);
  assert.ok([respawn.x, respawn.y, respawn.z].every(Number.isFinite));

  second.socket.close(1000, 'smoke complete');
  assert.equal((await first.waitFor('playerLeft')).id, secondWelcome.id);
  console.log(`WebSocket smoke passed at ${targetUrl}: join v${PROTOCOL_VERSION}, movement, shot, damage, death, scoring, respawn, leave`);
} finally {
  for (const { socket } of clients) socket.close(1000, 'smoke complete');
}
