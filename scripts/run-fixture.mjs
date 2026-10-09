// Opens a built visual fixture page in headless Chrome on this machine's GPU, waits for `window[<result>]` and prints it.
// npm run visual:build && node scripts/run-fixture.mjs --page=lamp-cost.html --result=lampCost [--dist=dist-visual]
import {createReadStream,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';import {spawn} from 'node:child_process';
import {extname,join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{dist:{type:'string',default:'dist-visual'},page:{type:'string'},result:{type:'string'},timeout:{type:'string',default:'300'}}});
if(!values.page||!values.result)throw Error('--page and --result are required');
const dist=resolve(values.dist),MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
const server=createServer((q,r)=>{const path=resolve(dist,'.'+decodeURIComponent(new URL(q.url,'http://x').pathname));
    if(!path.startsWith(dist)||!existsSync(path)){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':MIME[extname(path)]??'application/octet-stream'});createReadStream(path).pipe(r);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=9800+Math.floor(Math.random()*150),profile=mkdtempSync(join(tmpdir(),'fixture-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new','--no-sandbox',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--mute-audio','--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--window-size=1280,720','about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
    let tab;for(let i=0;i<100&&!tab;i++){try{tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();}catch{await pause(100);}}
    const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${values.page}?agent=1&mute=1`});
    let value;for(let i=0;i<Number(values.timeout)*2&&value===undefined;i++){await pause(500);value=(await send('Runtime.evaluate',{expression:`JSON.parse(JSON.stringify(window[${JSON.stringify(values.result)}]??null))`,returnByValue:true})).result?.result?.value??undefined;}
    console.log(JSON.stringify(value??'timed out'));ws.close();
}finally{chrome.kill('SIGTERM');await pause(500);rmSync(profile,{recursive:true,force:true});server.close();}
