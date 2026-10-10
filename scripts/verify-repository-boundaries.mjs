// Browser integration for supply/results ownership. Builds must already exist. No gameplay input or live service.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {getFreePort,stopProcess} from './lib/process.mjs';
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!out)throw Error('Pass --out=/absolute/path/artifacts');
const root=resolve(import.meta.dirname,'../dist-visual'),profile=await mkdtemp(join(tmpdir(),'rat-boundaries-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+'/'))throw Error('path');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=await getFreePort(),chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--mute-audio',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
chrome.on('error',error=>{console.error(error.message);});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;const errors=[];
try{
 let tabs;for(let n=0;n<100&&!tabs;n++){try{tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{await pause(100);}}
 if(!tabs)throw Error('Chrome did not start; set CHROME_BIN');
 socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let id=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}});
 const send=(method,params={})=>new Promise((r,j)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);j(Error('CDP timeout: '+method));},120000);pending.set(n,m=>{clearTimeout(timer);m.error?j(Error(JSON.stringify(m.error))):r(m);});socket.send(JSON.stringify({id:n,method,params}));});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/repository-boundaries.html?agent=1&mute=1`});
 let report;for(let n=0;n<120&&!report;n++){const m=await send('Runtime.evaluate',{expression:'window.repositoryBoundaryReport',returnByValue:true});report=m.result?.result?.value;if(!report)await pause(500);}
 await mkdir(out,{recursive:true});await writeFile(join(out,'browser-boundaries.json'),JSON.stringify({report,errors},null,2)+'\n');
 const png=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'browser-boundaries.png'),Buffer.from(png.result.data,'base64'));
 assert.ok(report,'Browser never produced receipt');assert.equal(errors.length,0,errors.join('\n'));assert.equal(report.passed,true,report.error);console.log(`${report.checks.length} browser boundary checks passed; receipt and screenshot in ${out}`);
}finally{socket?.close();await stopProcess(chrome);await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true});}
