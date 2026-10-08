// Static experimental art proof; no human gameplay claim. Uses a temporary clean browser profile.
import {existsSync,mkdirSync,writeFileSync,rmSync,mkdtempSync,createReadStream} from 'node:fs';
import {createServer} from 'node:http';import {spawn,spawnSync} from 'node:child_process';
import {extname,join,resolve} from 'node:path';import {tmpdir} from 'node:os';import net from 'node:net';
const OUT=resolve(process.env.P4_OUT??'/home/halla/build/rat-detective/noir-papers-v2-20261007/candidate');
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
const chrome=spawn(chromePath,['--headless=new','--no-sandbox',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--mute-audio','--use-angle='+(process.env.ANGLE??'vulkan'),'--enable-features=Vulkan','--ignore-gpu-blocklist','about:blank'],{stdio:'ignore'});
let cdp;const report={kind:'static art and motion fixture with scripted wind time; not gameplay, not human acceptance',angle:process.env.ANGLE??'vulkan',captures:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await waitForJson(`http://127.0.0.1:${port}/json/version`);
 const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();cdp=makeCdpClient(tab.webSocketDebuggerUrl);await cdp.ready;
 const {send}=cdp;await send('Runtime.enable');await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"(()=>{const d=window.__THREE_DEVTOOLS__=new EventTarget();window.__paperPerf=[];d.addEventListener('observe',e=>{const o=e.detail;if(o.render&&o.domElement&&!o.__paperHook){o.__paperHook=true;const render=o.render.bind(o);o.render=(...a)=>{const start=performance.now();const result=render(...a);window.__paperRenderer=o;__paperPerf.push(performance.now()-start);if(__paperPerf.length>180)__paperPerf.shift();return result;};}});})()"});
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:proof});
 for(const [label,width,height,low] of [['desktop',1280,720,false],['mobile-low',844,390,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:origin+'/case-clues.html?agent=1&mute=1'+(low?'&low=1':'')});
  let ready=false;for(let i=0;i<120;i++){const r=await send('Runtime.evaluate',{expression:"!!window.clueFixture",returnByValue:true});if(r.result?.result.value){ready=true;break;}await pause(250);}if(!ready)throw Error('fixture did not load');
  for(const view of ['street','corner','sewer','blackout','gallery','wind']){
   await send('Runtime.evaluate',{expression:`window.clueFixture.setView('${view}')`});await pause(400);
   const seen=await send('Runtime.evaluate',{expression:'window.clueFixture.visible()',returnByValue:true});
   const shot=await send('Page.captureScreenshot',{format:'png'});const name=label+'-'+view+'.png';writeFileSync(join(proof,name),Buffer.from(shot.result.data,'base64'));
   const metrics=await send('Runtime.evaluate',{expression:'window.clueFixture.metrics?.()',returnByValue:true});
   report.captures.push({label,view,width,height,visible:seen.result.result.value,metrics:metrics.result?.result?.value,render:await (async()=>{const p=await send('Runtime.evaluate',{expression:'({samples:window.__paperPerf,render:window.__paperRenderer?.info.render,memory:window.__paperRenderer?.info.memory})',returnByValue:true});return p.result?.result?.value;})(),file:name});
  }
  // Clips: the street walk (a sheet blows in, one blows away, a ball lands by them) and the wind over a still view.
  for(const view of ['street','wind']){
   const clip=`physical-files-${view}.webm`;rmSync(join(proof,clip),{force:true});
   await send('Runtime.evaluate',{expression:`window.clueFixture.setView('${view}');document.getElementById('record').click()`});
   const traced=[];for(let i=0;i<180&&!existsSync(join(proof,clip));i++){await pause(250);if(i%2===0){const t=await send('Runtime.evaluate',{expression:'window.clueFixture.trace()',returnByValue:true});traced.push(t.result?.result?.value);}}
   if(!existsSync(join(proof,clip)))throw Error('motion clip not saved');
   writeFileSync(join(proof,`${label}-${view}-motion.webm`),await import('node:fs/promises').then(fs=>fs.readFile(join(proof,clip))));
   report.captures.push({label,view,clip:`${label}-${view}-motion.webm`,trace:traced});
  }
 }
 await send('Runtime.evaluate',{expression:"window.clueFixture.setView('street');window.clueFixture.close?.()"});
 const close=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(proof,'paper-close.png'),Buffer.from(close.result.data,'base64'));
 const atlas=await send('Runtime.evaluate',{expression:'window.clueFixture.atlas?.()',returnByValue:true});
 if(atlas.result?.result?.value)writeFileSync(join(proof,'paper-atlas.png'),Buffer.from(atlas.result.result.value.split(',')[1],'base64'));
 rmSync(join(proof,'physical-files-street.webm'),{force:true});
 await send('Runtime.evaluate',{expression:"window.clueFixture.setView('street');document.getElementById('record').click()"});
 for(let i=0;i<120&&!existsSync(join(proof,'physical-files-street.webm'));i++)await pause(250);
 if(!existsSync(join(proof,'physical-files-street.webm')))throw Error('clip not saved');report.clip='physical-files-street.webm';
 writeFileSync(join(proof,'capture.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{cdp?.socket.close();chrome.kill('SIGTERM');await pause(500);rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});await new Promise(r=>server.close(r));}
