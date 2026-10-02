// End-to-end exhibits check against a hosted game (muted agent browser): join, let the bots play, end the round with the
// admin key, then check the results board shows exhibits, the frame plays, and SAVE downloads a clip with video and sound.
// Writes <out>/exhibits.json, screenshots and the saved clip; exits 1 on a failed check.
//
// usage: node scripts/exhibits-check.mjs --url=<game url> --out=<dir> [--play=<seconds before ending the round, default 120>]
// env: CHROME_BIN (default google-chrome), ANGLE (default gl-egl); the admin key from ~/.config/rat-detective/admin-token
import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'},play:{type:'string',default:'120'}}});
if(!values.url||!values.out)throw Error('--url and --out are required');
const out=resolve(values.out);mkdirSync(out,{recursive:true});

const port=9800+Math.floor(Math.random()*150),profile=mkdtempSync(join(tmpdir(),'rat-exhibits-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
    '--window-size=1600,900','--no-first-run','--password-store=basic','--mute-audio','--autoplay-policy=no-user-gesture-required',
    '--ignore-gpu-blocklist',`--use-angle=${process.env.ANGLE??'gl-egl'}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(u,init){for(let i=0;i<100;i++){try{return await (await fetch(u,init)).json();}catch{await sleep(100);}}throw Error(u);}
/** Before the page's scripts: the last raw socket messages, to name one the client rejects. */
const HOOK=`(()=>{window.__raw=[];const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);
 this.addEventListener('message',e=>{if(typeof e.data==='string'&&!e.data.startsWith('{"type":"movementFrame"')){__raw.push(/"type":"(gameWon|welcome)"/.test(e.data)?e.data:e.data.slice(0,4000));if(__raw.length>40)__raw.shift();}});}};})();`;
const checks=[],errors=[],markers=[];let board=null,file=null,raw=[];
try{
    const tab=await json(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
        if(m.method==='Runtime.consoleAPICalled'){const text=m.params.args.map(a=>a.value??a.description??'').join(' ');if(/highlight|replay/i.test(text))markers.push(text.slice(0,200));}
        pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
    const screenshot=async name=>writeFileSync(join(out,`${name}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    const waitFor=async(expression,ms)=>{for(const end=Date.now()+ms;Date.now()<end;await sleep(250))if(await evaluate(expression))return true;return false;};
    await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:HOOK});
    await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});
    const target=new URL(values.url);for(const [k,v] of [['agent','1'],['mute','1'],['replay','dev']])target.searchParams.set(k,v);
    await send('Page.navigate',{url:target.toString()});
    await waitFor(`!!document.querySelector('#enter-city-btn')&&!document.querySelector('#enter-city-btn').disabled`,30000);
    await evaluate(`document.querySelector('#enter-city-btn').click()`);
    await sleep(Number(values.play)*1000);
    await screenshot('exhibits-0-play');
    execFileSync('node',['scripts/admin.mjs','end-round',`--base=${new URL(values.url).origin}`],{stdio:'inherit'});
    const shown=await waitFor(`(()=>{const e=document.querySelector('.results-exhibits');return !!e&&!e.hidden&&e.querySelectorAll('.exhibit-card').length>0;})()`,20000);
    checks.push({check:'results board shows exhibits',pass:shown});
    board=await evaluate(`[...document.querySelectorAll('.exhibit-card')].map(c=>({letter:c.dataset.letter,kind:c.dataset.kind,text:c.innerText.replace(/\\s+/g,' ').trim()}))`);
    await sleep(2500);await screenshot('exhibits-1-board');
    const t1=await evaluate(`document.querySelector('.exhibit-rec-time')?.textContent`);await sleep(1500);
    const t2=await evaluate(`document.querySelector('.exhibit-rec-time')?.textContent`);
    checks.push({check:'board stats still readable beside the exhibits',pass:await evaluate(`!!document.querySelector('.match-scoreboard, .results-board, #match-scoreboard')`)});
    checks.push({check:'exhibit frame is playing (tape clock moves)',pass:!!t1&&!!t2,clock:[t1,t2]});
    const before=new Set(readdirSync(out));
    const canSave=await evaluate(`(()=>{const b=document.querySelector('.exhibit-save');return !!b&&!b.hidden;})()`);
    checks.push({check:'save button offered',pass:!!canSave});
    if(canSave){
        await evaluate(`document.querySelector('.exhibit-save').click()`);
        await sleep(1500);await screenshot('exhibits-2-recording');
        for(let i=0;i<120&&!file;i++){await sleep(500);file=readdirSync(out).find(f=>!before.has(f)&&/^rat-detective-.*\.(mp4|webm)$/.test(f))??null;}
        if(file){await sleep(1000);
            const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',join(out,file)]).toString());
            const kinds=probe.streams.map(s=>s.codec_type);
            checks.push({check:'saved clip has video and sound',pass:kinds.includes('video')&&kinds.includes('audio'),file,bytes:statSync(join(out,file)).size,probe});
            // MediaRecorder files may carry no duration: the last video frame's time measures the clip.
            const last=execFileSync('ffprobe',['-v','error','-select_streams','v','-show_entries','packet=pts_time','-of','csv=p=0',join(out,file)]).toString().trim().split('\n').map(Number).filter(Number.isFinite);
            const seconds=Number(probe.format.duration)||Math.max(0,...last);
            checks.push({check:'saved clip runs 3 to 15 seconds',pass:seconds>=3&&seconds<=15,seconds,containerDuration:probe.format.duration??null});
        }else checks.push({check:'saved clip downloaded',pass:false});
        await screenshot('exhibits-3-after-save');
    }
    raw=await evaluate('window.__raw')??[];
    checks.push({check:'no page errors',pass:errors.length===0});
}catch(error){checks.push({check:'run',pass:false,error:String(error)});}
finally{
    chrome.kill();await new Promise(r=>chrome.exitCode===null?chrome.once('exit',r):r());rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    const pass=checks.length>0&&checks.every(c=>c.pass);
    writeFileSync(join(out,'exhibits.json'),JSON.stringify({url:values.url,at:new Date().toISOString(),pass,checks,board,file,markers,errors,raw},null,2));
    console.log(JSON.stringify({pass,checks:checks.map(({check,pass})=>({check,pass})),board,file}));
    process.exitCode=pass?0:1;
}
