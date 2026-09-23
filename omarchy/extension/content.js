const CHANNEL = 'rat-detective-highlights';
const MAX_BYTES = 16 * 1024;
const PRODUCTION = 'https://ratdetective.online';
const DEV = new Set(['http://127.0.0.1:5174', 'http://127.0.0.1:5175', 'http://127.0.0.1:5193', 'http://localhost:5174']);

function approved(origin) {
  return origin === PRODUCTION || DEV.has(origin);
}

window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (!approved(event.origin)) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL || !data.payload) return;
  const payload = {...data.payload};
  if (payload.type === 'session-start' || payload.type === 'heartbeat') {
    const mode = document.querySelector('.assignment-ledger[data-mode]')?.dataset.mode;
    payload.gameMode = ['chain-of-custody', 'closing-time', 'excessive-force', 'jurisdiction'].includes(mode) ? mode : null;
  }
  const raw = JSON.stringify(payload);
  if (raw.length > MAX_BYTES) return;
  try {
    chrome.runtime.sendMessage({channel: CHANNEL, payload, origin: event.origin}, reply => {
      if (chrome.runtime.lastError) {
        window.postMessage({channel: CHANNEL, type: 'capability', available: false}, event.origin);
        return;
      }
      window.postMessage({
        channel: CHANNEL,
        type: 'reply',
        requestType: data.payload && data.payload.type,
        available: true,
        ...(reply || {}),
      }, event.origin);
    });
  } catch {
    window.postMessage({channel: CHANNEL, type: 'capability', available: false}, event.origin);
  }
});

window.postMessage({channel: CHANNEL, type: 'capability', available: true}, window.location.origin);
