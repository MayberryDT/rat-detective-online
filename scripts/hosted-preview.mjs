import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,extname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket,{WebSocketServer} from 'ws';
import {sanitizeDiagnosticReport} from '../src/shared/diagnosticReport.ts';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav',
  '.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf'};
const MAX_PENDING_BYTES=512*1024,MAX_PENDING_MESSAGES=32,MAX_SEND_BYTES=4*1024*1024;
function privateIPv4(host){
  const p=host.split('.').map(Number);
  return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&
    (p[0]===127||p[0]===10||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===100&&p[1]>=64&&p[1]<=127);
}

/** Local static preview plus an authenticated private-worker relay. The injected
 * transport factory is only for focused tests; the executable requires HTTPS. */
export function createHostedPreview({distDir,upstreamOrigin,token,
  browserOrigin,listenAddress='127.0.0.1',
  createUpstream=(url,options)=>new WebSocket(url,options),
  fetchStatus=(url,options)=>fetch(url,options),
  onDiagnostic=report=>console.log(JSON.stringify({event:'client diagnostics',report})),
}) {
  const origin=new URL(upstreamOrigin);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
    throw new Error('RAT_NETWORK_ORIGIN must be an HTTPS origin.');
  if(typeof token!=='string'||!token||/[\r\n]/.test(token))throw new Error('A valid private relay token is required.');
  // Explicit private preview addresses only. Never bind all/public interfaces,
  // accept wildcard origins, or put the upstream credential into a browser URL.
  const browser=browserOrigin?new URL(browserOrigin):undefined;
  if(!privateIPv4(listenAddress))throw new Error('Listen address must be a private IPv4 address.');
  if(browser&&((browser.protocol!=='https:'&&!(browser.protocol==='http:'&&privateIPv4(browser.hostname)))||browser.username||browser.password||browser.pathname!=='/'||browser.search||browser.hash))
    throw new Error('browserOrigin must be an HTTPS origin or a private-IP HTTP origin.');
  if(!listenAddress.startsWith('127.')&&(!browser||browser.hostname!==listenAddress))
    throw new Error('Non-loopback preview requires a matching explicit browser origin.');
  const root=resolve(distDir),rootReady=realpath(root),pairs=new Set();
  let closing=false;
  function localHost(request){
    const port=server.address()?.port;
    return request.headers.host===`${listenAddress}:${port}`||request.headers.host===`localhost:${port}`||!!browser&&request.headers.host===browser.host;
  }
  const server=createServer(async(request,response)=>{
    if(!localHost(request)){response.writeHead(403);response.end();return;}
    if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405,{Allow:'GET, HEAD'});response.end();return;}
    try {
      const url=new URL(request.url,'http://127.0.0.1');
      if(url.pathname==='/health'){
        response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        response.end(request.method==='HEAD'?undefined:JSON.stringify({ok:!closing,mode:'private-hosted-relay',connections:pairs.size}));return;
      }
      if(url.pathname==='/status'){
        const room=url.searchParams.get('room')??'';
        if(!/^graybox-benchmark-match-[a-z0-9-]{1,40}$/.test(room)){response.writeHead(404);response.end();return;}
        const upstreamUrl=new URL('/status',origin);upstreamUrl.searchParams.set('room',room);
        const upstream=await fetchStatus(upstreamUrl,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
        if(!upstream.ok){response.writeHead(502);response.end();return;}
        const data=await upstream.json();
        // Never relay upstream headers or arbitrary content (including credentials).
        if(data.room!==room||!Number.isInteger(data.world?.seed)||data.world.seed<0||data.world.seed>0xffffffff||![1,2].includes(data.world.version)){
          response.writeHead(502);response.end();return;
        }
        response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        response.end(request.method==='HEAD'?undefined:JSON.stringify({room,world:{seed:data.world.seed,version:data.world.version}}));return;
      }
      const pathname=decodeURIComponent(url.pathname),candidate=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
      const rel=relative(root,candidate);
      if(rel.startsWith('..')||isAbsolute(rel)||pathname.includes('\0'))throw new Error('Not a static file');
      const [canonicalRoot,canonicalFile]=await Promise.all([rootReady,realpath(candidate)]);
      const canonicalRelative=relative(canonicalRoot,canonicalFile);
      if(canonicalRelative.startsWith('..')||isAbsolute(canonicalRelative))throw new Error('Not a static file');
      const info=await stat(canonicalFile);if(!info.isFile())throw new Error('Not a static file');
      response.writeHead(200,{'Content-Type':MIME[extname(canonicalFile)]??'application/octet-stream',
        'Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if(request.method==='HEAD'){response.end();return;}
      const stream=createReadStream(canonicalFile);
      stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
    }catch{if(!response.headersSent){response.writeHead(404);response.end('Not found');}else response.destroy();}
  });
  const sockets=new WebSocketServer({noServer:true,maxPayload:64*1024,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    let url;try{url=new URL(request.url,'http://127.0.0.1');}catch{socket.destroy();return;}
    const expectedOrigin=browser&&request.headers.host===browser.host?browser.origin:`http://${request.headers.host}`;
    if(closing||url.pathname!=='/ws'||!localHost(request)||
      (request.headers.origin!==expectedOrigin&&(!browser||request.headers.origin!==browser.origin))){
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;
    }
    sockets.handleUpgrade(request,socket,head,client=>{
      client.on('error',()=>{});
      const upstreamUrl=new URL('/ws',origin);upstreamUrl.protocol='wss:';upstreamUrl.search=url.search;
      let upstream;
      try{upstream=createUpstream(upstreamUrl,{headers:{Authorization:`Bearer ${token}`},
        handshakeTimeout:10000,maxPayload:MAX_SEND_BYTES,perMessageDeflate:false});}
      catch{client.close(1011,'Upstream unavailable');return;}
      const pending=[];let bytes=0,stopped=false,lastDiagnostic=-Infinity;
      const stop=(code=1011,reason='Relay disconnected')=>{
        if(stopped)return;stopped=true;pending.length=0;bytes=0;
        for(const ws of [client,upstream]){
          if(ws.readyState===WebSocket.OPEN)ws.close(code,reason);
          else if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
        }
        const timer=setTimeout(()=>{client.terminate();upstream.terminate();},1000);timer.unref();
        pairs.delete(stop);
      };
      pairs.add(stop);
      function send(destination,data,isBinary){
        if(destination.readyState!==WebSocket.OPEN||destination.bufferedAmount+data.byteLength>MAX_SEND_BYTES){stop(1013,'Relay backpressure');return;}
        destination.send(data,{binary:isBinary},error=>{if(error)stop();});
      }
      client.on('message',(data,isBinary)=>{
        if(stopped)return;
        // The private hosted endpoint deliberately refuses browser diagnostic
        // reports. Keep the same sanitized local log without forwarding them.
        if(!isBinary){
          let message;try{message=JSON.parse(data.toString());}catch{/* GameRoom validates all ordinary traffic. */}
          if(message?.type==='diagnostics'){
            const now=Date.now();
            if(now-lastDiagnostic>=4000){
              const report=sanitizeDiagnosticReport(message.report);
              if(report){lastDiagnostic=now;try{onDiagnostic(report);}catch{/* Diagnostics cannot break play. */}}
            }
            return;
          }
        }
        if(upstream.readyState===WebSocket.CONNECTING){
          if(pending.length>=MAX_PENDING_MESSAGES||bytes+data.byteLength>MAX_PENDING_BYTES){stop(1013,'Relay backpressure');return;}
          pending.push({data,isBinary});bytes+=data.byteLength;
        }else send(upstream,data,isBinary);
      });
      upstream.on('open',()=>{for(const {data,isBinary} of pending){if(stopped)break;send(upstream,data,isBinary);}pending.length=0;bytes=0;});
      upstream.on('message',(data,isBinary)=>{if(!stopped)send(client,data,isBinary);});
      for(const ws of [client,upstream]){ws.on('error',()=>stop());ws.on('close',code=>stop(code===4001?4001:1000,code===4001?'Connected on a new transport':'Peer disconnected')); }
    });
  });
  return {
    server,
    async listen(port=5175){
      await rootReady;
      if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid preview port.');
      await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,listenAddress,()=>{server.off('error',fail);ok();});});
      return `http://${listenAddress}:${server.address().port}`;
    },
    async close(){
      if(closing)return;closing=true;for(const stop of [...pairs])stop(1001,'Preview stopping');
      server.closeIdleConnections();
      await Promise.all([new Promise(ok=>server.close(ok)),new Promise(ok=>sockets.close(ok))]);
    },
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    if(!process.env.RAT_NETWORK_ORIGIN||!process.env.RAT_NETWORK_TOKEN_FILE)throw new Error('Set RAT_NETWORK_ORIGIN and RAT_NETWORK_TOKEN_FILE.');
    let token;
    try{token=JSON.parse(await readFile(process.env.RAT_NETWORK_TOKEN_FILE,'utf8')).NETWORK_TEST_TOKEN;}
    catch{throw new Error('Unable to read the private relay token file.');}
    const preview=createHostedPreview({distDir:resolve('dist'),upstreamOrigin:process.env.RAT_NETWORK_ORIGIN,token});
    const address=await preview.listen(Number(process.env.PORT??5175));
    console.log(`Private hosted preview ready at ${address}`);
    const shutdown=()=>{void preview.close().then(()=>process.exit(0));};
    process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  }catch(error){console.error(error instanceof Error?error.message:'Hosted preview failed.');process.exitCode=1;}
}
