const HOST = 'co.animasai.rat_detective_highlights';
const CHANNEL = 'rat-detective-highlights';
const PRODUCTION = 'https://ratdetective.online';
const DEV = new Set(['http://127.0.0.1:5174', 'http://127.0.0.1:5175', 'http://127.0.0.1:5193']);
const MAX_BYTES = 16 * 1024;

let port = null;
const pending = new Map();
const PENDING_LIMIT = 128;

function approvedOrigin(origin) {
  return origin === PRODUCTION || DEV.has(origin);
}

function nativePort() {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch {
    port = null;
    return null;
  }
  port.onDisconnect.addListener(() => { port = null; pending.clear(); });
  port.onMessage.addListener(reply => {
    const id = reply && reply.messageId;
    const job = id ? pending.get(id) : undefined;
    if (!job) return;
    pending.delete(id);
    clearTimeout(job.timer);
    job.send(reply);
  });
  return port;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.channel !== CHANNEL) return false;
  const origin = sender.origin || sender.url && new URL(sender.url).origin;
  if (!approvedOrigin(origin || '')) {
    sendResponse({status: 'rejected', reason: 'wrong origin'});
    return false;
  }
  if (sender.frameId && sender.frameId !== 0) {
    sendResponse({status: 'rejected', reason: 'nested frame'});
    return false;
  }
  const raw = JSON.stringify(message.payload || {});
  if (raw.length > MAX_BYTES) {
    sendResponse({status: 'rejected', reason: 'message too large'});
    return false;
  }
  const native = nativePort();
  if (!native) {
    sendResponse({status: 'rejected', reason: 'native host unavailable'});
    return false;
  }
  const messageId = message.payload && message.payload.messageId;
  if (!messageId) {
    sendResponse({status: 'rejected', reason: 'missing messageId'});
    return false;
  }
  if (pending.size >= PENDING_LIMIT) {
    sendResponse({status: 'rejected', reason: 'queue full'});
    return false;
  }
  const timer = setTimeout(() => {
    const job = pending.get(messageId);
    if (!job) return;
    pending.delete(messageId);
    job.send({status: 'rejected', reason: 'helper timeout', messageId});
  }, 4000);
  pending.set(messageId, {send: sendResponse, timer});
  native.postMessage({...message.payload, origin, tabId: sender.tab && sender.tab.id, documentId: sender.documentId});
  return true;
});
