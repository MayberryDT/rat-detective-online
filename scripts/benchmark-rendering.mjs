import {createServer} from 'node:http';
import {createReadStream,existsSync,mkdirSync,writeFileSync,mkdtempSync,rmSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,extname} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import net from 'node:net';

const root=resolve(import.meta.dirname,'..'),label=process.argv[2]??'current';
const seconds=Number(process.argv[3]??120),runs=Number(process.argv[4]??3);
if(!/^[a-z0-9-]{1,60}$/.test(label)||!Number.isInteger(seconds)||seconds<5||seconds>180||!Number.isInteger(runs)||runs<1||runs>3)throw Error('Usage: label [5–180 seconds] [1–3 runs]');
const dist=resolve(root,'dist-visual'),out=resolve(root,'output/optimization-rendering',label);mkdirSync(out,{recursive:true});
let chrome=process.env.CHROME_BIN;
for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser'])if(!chrome)try{chrome=execFileSync('which',[name],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
if(!chrome)throw Error('Chrome/Chromium unavailable');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server=createServer((req,res)=>{
 const path=resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!path.startsWith(dist+'/')||!existsSync(path)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream'});createReadStream(path).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const free=net.createServer();await new Promise(r=>free.listen(0,'127.0.0.1',r));const port=free.address().port;await new Promise(r=>free.close(r));
const profile=mkdtempSync(resolve(tmpdir(),'rat-optimization-browser-'));
const args=['--headless=new','--enable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--window-size=1280,720','--no-first-run','--no-default-browser-check','about:blank'];
const processHandle=spawn(chrome,args,{stdio:['ignore','ignore','pipe']});let stderr='';processHandle.stderr.on('data',b=>{stderr=(stderr+b).slice(-12000);});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
/** The visual bundle decides what was measured; without hashing it a later
 * rebuild silently re-labels a different artifact as this run. */
function hashTree(dir){
 const files=[];
 const walk=rel=>{for(const entry of readdirSync(resolve(dir,rel),{withFileTypes:true})){const next=rel?rel+'/'+entry.name:entry.name;if(entry.isDirectory())walk(next);else files.push(next);}};
 walk('');
 files.sort();
 const hash=createHash('sha256');
 for(const file of files){hash.update(file);hash.update(readFileSync(resolve(dir,file)));}
 return {sha256:hash.digest('hex'),files:files.length,bytes:files.reduce((n,f)=>n+statSync(resolve(dir,f)).size,0)};
}
async function fetchReady(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return r.json();}catch{}await pause(100);}throw Error('Browser startup failed: '+stderr);}
const results=[];let socket;
const cancel=()=>{socket?.close();processHandle.kill('SIGTERM');server.close();process.exitCode=130;};
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
 const version=await fetchReady(`http://127.0.0.1:${port}/json/version`);
 const browserSocket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{browserSocket.onopen=r;browserSocket.onerror=j;});
 function client(ws){let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}};return(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject,timer:setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},15000)});ws.send(JSON.stringify({id:n,method,params}));});}
 const browserSend=client(browserSocket);const system=await browserSend('SystemInfo.getInfo');browserSocket.close();
 const dirty=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()!=='';
 writeFileSync(resolve(out,'environment.json'),JSON.stringify({version,system,args,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty,bundle:hashTree(dist)},null,2));
 for(let run=1;run<=runs;run++){
  const url=`http://127.0.0.1:${server.address().port}/optimization-render.html?seconds=${seconds}`;
  const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});const send=client(socket);
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  console.log(JSON.stringify({event:'run-start',run,url,seconds}));await send('Page.navigate',{url});
  const deadline=Date.now()+(seconds+100)*1000;let result;
  while(Date.now()<deadline){
   const value=await send('Runtime.evaluate',{expression:'window.optimizationRenderResult',returnByValue:true});result=value.result?.value;if(result)break;await pause(1000);
  }
  if(!result)throw Error('Rendering fixture did not finish');
  writeFileSync(resolve(out,`run-${run}.json`),JSON.stringify(result,null,2));
  await send('Runtime.evaluate',{expression:"document.getElementById('result').style.display='none'"});
  const capture=await send('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,`run-${run}.png`),Buffer.from(capture.data,'base64'));
  const {raw,gpuSamples,...summary}=result;results.push(summary);console.log(JSON.stringify({event:'run-complete',run,...summary}));
  socket.close();socket=undefined;await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`);
 }
 writeFileSync(resolve(out,'summary.json'),JSON.stringify({label,results},null,2));
}finally{
 socket?.close();processHandle.kill('SIGTERM');server.close();await pause(500);if(processHandle.exitCode===null)processHandle.kill('SIGKILL');rmSync(profile,{recursive:true,force:true});
}
