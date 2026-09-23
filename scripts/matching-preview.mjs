#!/usr/bin/env node
/** Serve a frozen matching client on 127.0.0.1:5174 and relay /ws+/status to production.
 *  Not a production deploy. Production Play still uses https://ratdetective.online/.
 */
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, relative, extname, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket, {WebSocketServer} from 'ws';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};
const UPSTREAM = process.env.RAT_DETECTIVE_MATCHING_UPSTREAM || 'https://ratdetective.online';
const LISTEN = '127.0.0.1';
const PORT = Number(process.env.PORT || 5174);
const distDir = resolve(process.env.RAT_DETECTIVE_DIST || resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist'));

const rootReady = realpath(distDir);
const server = createServer(async (request, response) => {
  const host = request.headers.host || '';
  if (host !== `${LISTEN}:${PORT}` && host !== `localhost:${PORT}`) {
    response.writeHead(403); response.end(); return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {Allow: 'GET, HEAD'}); response.end(); return;
  }
  try {
    const url = new URL(request.url, `http://${LISTEN}`);
    if (url.pathname === '/health') {
      response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ok: true, mode: 'matching-preview', dist: distDir}));
      return;
    }
    if (url.pathname === '/status') {
      const upstreamUrl = new URL('/status' + url.search, UPSTREAM);
      const upstream = await fetch(upstreamUrl, {redirect: 'error', signal: AbortSignal.timeout(5000)});
      const body = Buffer.from(await upstream.arrayBuffer());
      response.writeHead(upstream.status, {'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const candidate = resolve(distDir, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rel = relative(distDir, candidate);
    if (rel.startsWith('..') || isAbsolute(rel) || pathname.includes('\0')) throw new Error('Not a static file');
    const [canonicalRoot, canonicalFile] = await Promise.all([rootReady, realpath(candidate)]);
    if (relative(canonicalRoot, canonicalFile).startsWith('..')) throw new Error('Not a static file');
    const info = await stat(canonicalFile);
    if (!info.isFile()) throw new Error('Not a static file');
    response.writeHead(200, {
      'Content-Type': MIME[extname(canonicalFile)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(canonicalFile);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch {
    if (!response.headersSent) { response.writeHead(404); response.end('Not found'); }
    else response.destroy();
  }
});

const sockets = new WebSocketServer({noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false});
server.on('upgrade', (request, socket, head) => {
  let url;
  try { url = new URL(request.url, `http://${LISTEN}`); } catch { socket.destroy(); return; }
  const origin = request.headers.origin;
  const expected = `http://${request.headers.host}`;
  if (url.pathname !== '/ws' || (origin && origin !== expected && origin !== `http://localhost:${PORT}`)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  sockets.handleUpgrade(request, socket, head, client => {
    const upstreamUrl = new URL('/ws' + url.search, UPSTREAM);
    upstreamUrl.protocol = 'wss:';
    const upstream = new WebSocket(upstreamUrl, {handshakeTimeout: 10000, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false});
    const stop = () => {
      for (const ws of [client, upstream]) {
        if (ws.readyState === WebSocket.OPEN) ws.close(1000);
        else if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
      }
    };
    client.on('message', (data, isBinary) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data, {binary: isBinary}); });
    upstream.on('message', (data, isBinary) => { if (client.readyState === WebSocket.OPEN) client.send(data, {binary: isBinary}); });
    upstream.on('open', () => {});
    for (const ws of [client, upstream]) { ws.on('error', stop); ws.on('close', stop); }
  });
});

await rootReady;
await new Promise((ok, fail) => { server.once('error', fail); server.listen(PORT, LISTEN, () => { server.off('error', fail); ok(); }); });
console.log(JSON.stringify({ok: true, url: `http://${LISTEN}:${PORT}/`, dist: distDir, upstream: UPSTREAM}));
