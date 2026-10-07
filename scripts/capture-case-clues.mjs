// Static experimental art proof; no human gameplay claim. Uses a temporary clean browser profile.
import {existsSync,mkdirSync,writeFileSync,rmSync,mkdtempSync,createReadStream} from 'node:fs';
import {createServer} from 'node:http';import {spawn,spawnSync} from 'node:child_process';
import {extname,join,resolve} from 'node:path';import {tmpdir} from 'node:os';import net from 'node:net';
const OUT=resolve(process.env.P4_OUT??'/home/halla/build/rat-detective/physical-clues-20261007');
const DIST=join(OUT,'visual'),proof=join(DIST,'proof');mkdirSync(proof,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webm':'video/webm'};
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    const path = result.stdout.trim();
    if (path) return path;
  }
  return null;
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
    server.on('error', reject);
  });
}

function serveDist(directory) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/visual-fixture.html';
    const filePath = resolve(directory, `.${pathname}`);
    if (!filePath.startsWith(directory) || !existsSync(filePath)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise(resolveServer => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function makeCdpClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  function send(method, params = {}) {
    return new Promise(resolve => {
      const callId = ++id;
      pending.set(callId, resolve);
      socket.send(JSON.stringify({ id: callId, method, params }));
    });
  }
  return { socket, ready, send };
}


const chromePath=findChrome();if(!chromePath)throw Error('Chrome required');
const {server,origin}=await serveDist(DIST),port=await getFreePort();
const profile=mkdtempSync(join(tmpdir(),'p4-visual-'));
const chrome=spawn(chromePath,['--headless=new','--no-sandbox',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore'});
let cdp;const report={kind:'static fixture, software rendering; not human play',captures:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await waitForJson(`http://127.0.0.1:${port}/json/version`);
 const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();cdp=makeCdpClient(tab.webSocketDebuggerUrl);await cdp.ready;
 const {send}=cdp;await send('Runtime.enable');await send('Page.enable');
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:proof});
 for(const [label,width,height,low] of [['desktop',1280,720,false],['mobile-low',844,390,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/case-clues.html?agent=1&muted=1'+(low?'&low=1':'')});
  let ready=false;for(let i=0;i<120;i++){const r=await send('Runtime.evaluate',{expression:"!!window.clueFixture",returnByValue:true});if(r.result?.result.value){ready=true;break;}await pause(250);}if(!ready)throw Error('fixture did not load');
  for(const view of ['street','corner','sewer','blackout']){
   await send('Runtime.evaluate',{expression:`window.clueFixture.setView('${view}')`});await pause(400);
   const seen=await send('Runtime.evaluate',{expression:'window.clueFixture.visible()',returnByValue:true});
   const shot=await send('Page.captureScreenshot',{format:'png'});const name=label+'-'+view+'.png';writeFileSync(join(proof,name),Buffer.from(shot.result.data,'base64'));
   report.captures.push({label,view,width,height,visible:seen.result.result.value,file:name});
  }
 }
 await send('Runtime.evaluate',{expression:"window.clueFixture.setView('sewer');document.getElementById('record').click()"});
 for(let i=0;i<120&&!existsSync(join(proof,'physical-files-sewer.webm'));i++)await pause(250);
 if(!existsSync(join(proof,'physical-files-sewer.webm')))throw Error('clip not saved');report.clip='physical-files-sewer.webm';
 writeFileSync(join(proof,'capture.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{cdp?.socket.close();chrome.kill('SIGTERM');await pause(500);rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});await new Promise(r=>server.close(r));}
