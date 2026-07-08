const targetUrl = process.argv[2] || 'ws://127.0.0.1:8787/ws';

const appearance = {
  hatType: 'fedora',
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

function waitFor(socket, type, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.type !== type) return;

      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      resolve(message);
    }

    socket.addEventListener('message', onMessage);
  });
}

function openClient(name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(targetUrl);
    const timeout = setTimeout(() => reject(new Error(`Timed out opening ${name}`)), 5_000);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      socket.send(JSON.stringify({ type: 'join', name, appearance }));
      resolve(socket);
    }, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

const first = await openClient('Smoke Rat 1');
const firstWelcome = await waitFor(first, 'welcome');
await waitFor(first, 'currentPlayers');

const firstSawSecondPromise = waitFor(first, 'playerJoined');
const second = await openClient('Smoke Rat 2');
const secondWelcome = await waitFor(second, 'welcome');
const secondPlayers = await waitFor(second, 'currentPlayers');
const firstSawSecond = await firstSawSecondPromise;

if (!secondPlayers.players[firstWelcome.id]) {
  throw new Error('Second client did not receive first client in currentPlayers');
}

if (firstSawSecond.player.id !== secondWelcome.id) {
  throw new Error('First client did not receive second client join');
}

first.close(1000, 'smoke complete');
second.close(1000, 'smoke complete');

console.log('WebSocket smoke passed');
