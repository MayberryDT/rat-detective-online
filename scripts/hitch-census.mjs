// Runs test/visual/hitch-census.html (a built visual fixture) in headless Chrome on this machine's GPU and prints
// each step's new WebGL programs and slowest frame: which gameplay moment first compiles what. Not gameplay.
// npm run visual:build && node scripts/hitch-census.mjs --dist=dist-visual [--latent] [--out=census.json]
import {createReadStream,existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';import {spawn} from 'node:child_process';
import {extname,join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{dist:{type:'string',default:'dist-visual'},latent:{type:'boolean',default:false},out:{type:'string'},chrome:{type:'string',default:process.env.CHROME_BIN??'google-chrome'}}});
const dist=resolve(values.dist),MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav','.glb':'model/gltf-binary'};
const server=createServer((q,r)=>{const path=resolve(dist,'.'+decodeURIComponent(new URL(q.url,'http://x').pathname));
    if(!path.startsWith(dist)||!existsSync(path)){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':MIME[extname(path)]??'application/octet-stream'});createReadStream(path).pipe(r);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,port=9300+Math.floor(Math.random()*500),profile=mkdtempSync(join(tmpdir(),'census-'));
const chrome=spawn(values.chrome,['--headless=new','--no-sandbox',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--mute-audio','--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--window-size=1280,720','about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
    let version;for(let i=0;i<60&&!version;i++){try{version=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();}catch{await pause(250);}}
    const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
    const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result?.result?.value;
    await send('Page.navigate',{url:`${origin}/hitch-census.html?agent=1&mute=1${values.latent?'&latent=1':''}`});
    for(let i=0;i<720&&!await evaluate('window.censusDone===true');i++)await pause(500);
    const result=await evaluate('JSON.parse(JSON.stringify(window.censusResult))');
    if(!result)throw Error('census did not finish');
    if(values.out)writeFileSync(values.out,JSON.stringify(result,null,2)+'\n');
    for(const s of result.steps){const worst=Math.max(0,...s.frames);if(!s.programs.length&&!s.latent?.length&&worst<100)continue;
        console.log(`${s.label}: ${s.programs.length} new programs, worst frame ${Math.round(worst)} ms${s.latent?.length?`, ${s.latent.length} latent`:''}`);
        for(const p of s.programs.slice(0,12))console.log('   ',p.slice(0,150));}
    ws.close();
}finally{chrome.kill('SIGTERM');await pause(500);rmSync(profile,{recursive:true,force:true});server.close();}
