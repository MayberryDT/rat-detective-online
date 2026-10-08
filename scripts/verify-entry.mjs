// Entering the city, end to end on a hosted game (smooth-play plan, part 1): how long from pressing Enter City to the
// first frame you can play, and that the faster entry keeps the room rules. Muted headless Chrome with `agent=1`, plus
// plain sockets for the protocol checks. Writes entry-<label>.json. Not human acceptance.
//
// Failure modes, written before the code (docs/plans/smooth-play-2026-10.md):
//   EN1 clicking at once on a cold room, the room's wake waits for the browser's load (welcome more than 1.5 s after
//       the client is ready)        EN2 a cold entry, clicked after load, slower than the target
//   EN3 waiting on the title loses the prepared room (a click after 45 s is as slow as a first visit)
//   EN4 a held join gets its welcome (and a rat in play) before the client asks for it
//   EN5 the real join after a held one is slow (more than 600 ms to the welcome)
//   EN6 a held join abandoned (tab closed) leaves the room running   EN7 a held join never completed holds its seat
//       past its lease or keeps the room running                     EN8 an entry ends in an error or no playable frame
//   EN9 a warm room slower than its target
//
// usage: node scripts/verify-entry.mjs --url=<game url> --out=<dir> [--label=name] [--runs=2] [--target-cold=4000]
//   [--target-warm=2000] [--skip-browser] [--skip-socket]
// env: CHROME_BIN (google-chrome), ANGLE (Halla: gl-egl)
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import WebSocket from 'ws';
import {readSocketMessage,PROTOCOL_VERSION} from './lib/network-codec.mjs';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'},label:{type:'string',default:'entry'},runs:{type:'string',default:'2'},
    'target-cold':{type:'string',default:'4000'},'target-warm':{type:'string',default:'2000'},'skip-browser':{type:'boolean',default:false},'skip-socket':{type:'boolean',default:false}}});
if(!values.url||!values.out)throw Error('--url and --out are required');
mkdirSync(values.out,{recursive:true});
const origin=new URL(values.url).origin,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={url:values.url,label:values.label,at:new Date().toISOString(),protocol:PROTOCOL_VERSION,kind:'hosted game, muted headless Chrome agent seats and plain sockets; not human acceptance',
    targets:{coldMs:Number(values['target-cold']),warmMs:Number(values['target-warm'])},checks:[],browser:[],socket:{}};
const check=(name,pass,detail)=>report.checks.push({check:name,pass:!!pass,...(detail===undefined?{}:{detail})});
const status=async()=>{try{const j=await (await fetch(origin+'/status',{cache:'no-store'})).json();return {players:j.players,bots:j.bots};}catch(e){return {error:String(e)};}};
/** Wait until the public room is empty (no players, no bots), then a little longer so it is really asleep. */
async function cold(){for(let i=0;i<120;i++){const s=await status();if(s.players===0&&s.bots===0)break;await sleep(1000);}await sleep(8000);}
report.build=await (await fetch(origin+'/health',{cache:'no-store'})).json().then(j=>j.build).catch(()=>null);

// ---- Plain sockets ----
const appearance={hatType:'fedora',hatColor:1,furColor:2,coatColor:3};
function socket(prepare){
    const url=new URL(origin.replace(/^http/,'ws')+'/ws');url.searchParams.set('agent','1');url.searchParams.set('chaos','compact-v2');url.searchParams.set('movement','tuple-v1');
    if(prepare)url.searchParams.set('prepare','1');
    const ws=new WebSocket(url,{headers:{Origin:origin}}),t0=performance.now(),log=[];
    ws.on('message',raw=>{let m;try{m=readSocketMessage(ws,raw);}catch{return;}if(m)log.push({type:m.type,at:performance.now()-t0,...(m.type==='error'?{message:m.message}:{})});});
    const closed=new Promise(r=>ws.on('close',(code,reason)=>r({code,reason:String(reason),at:performance.now()-t0})));
    return {ws,log,closed,t0,open:new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);}),
        join:(hold)=>ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:'Entry Check',appearance,...(hold?{hold:true}:{})})),
        welcome:()=>log.find(m=>m.type==='welcome'),now:()=>performance.now()-t0};
}
if(!values['skip-socket']){
    await cold();
    // EN4, EN5: a held join wakes the room but gets no welcome until the real join; then the welcome is quick.
    {const s=socket(true);await s.open;const heldAt=s.now();s.join(true);await sleep(3500);
     const early=s.welcome(),during=await status();const joinAt=s.now();s.join(false);
     for(let i=0;i<100&&!s.welcome();i++)await sleep(50);const w=s.welcome();
     report.socket.held={earlyWelcome:!!early,statusWhileHeld:during,welcomeAfterJoinMs:w?+(w.at-joinAt).toFixed(0):null,heldAt:+heldAt.toFixed(0),errors:s.log.filter(m=>m.type==='error')};
     check('EN4 a held join gets no welcome until the real join',!early&&!!w,report.socket.held);
     check('EN5 the real join after a held one is welcomed within 600 ms',w&&w.at-joinAt<=600,report.socket.held.welcomeAfterJoinMs);
     s.ws.close(1000,'entry check');await s.closed;}
    // EN6: a held join whose tab closes: the room is empty again soon after (reconnect grace aside: no rat was made).
    await cold();
    {const s=socket(true);await s.open;s.join(true);await sleep(2500);const during=await status();s.ws.close(1000,'abandoned');await s.closed;
     let after,at=performance.now();for(let i=0;i<40;i++){after=await status();if(after.players===0&&after.bots===0)break;await sleep(1000);}
     report.socket.abandoned={statusWhileHeld:during,after,emptyAfterMs:+(performance.now()-at).toFixed(0)};
     check('EN6 an abandoned held join leaves the room empty within 15 s',after.players===0&&after.bots===0&&performance.now()-at<=15000,report.socket.abandoned);}
    // EN7: a held join never completed: the server ends it at its lease and the room empties.
    await cold();
    {const s=socket(true);await s.open;s.join(true);const closed=await Promise.race([s.closed,sleep(40000).then(()=>null)]);
     let after;for(let i=0;i<20;i++){after=await status();if(after.players===0&&after.bots===0)break;await sleep(1000);}
     report.socket.neverCompleted={closed,after,welcome:!!s.welcome()};
     if(!closed)s.ws.close(1000,'entry check');
     check('EN7 a held join never completed is closed within 30 s and the room empties',!!closed&&closed.at<=30000&&!s.welcome()&&after.players===0&&after.bots===0,report.socket.neverCompleted);}
}

// ---- Browser: click to the first playable frame ----
const HOOK=`(()=>{const N=WebSocket;const log=window.__ws=[];window.WebSocket=function(url,p){const u=new URL(url);const kind=u.searchParams.get('prepare')?'prepare':u.searchParams.get('resume')?'resume':'join';
const s=p===undefined?new N(url):new N(url,p);const e={kind,created:performance.now()};log.push(e);
s.addEventListener('open',()=>{e.open=performance.now();});s.addEventListener('close',ev=>{e.closed=performance.now();e.code=ev.code;});
const send=s.send.bind(s);s.send=d=>{if(typeof d==='string'&&d.includes('"join"')){(e.joins??=[]).push(performance.now());}return send(d);};
s.addEventListener('message',ev=>{if(!e.welcome&&typeof ev.data==='string'&&/"welcome"/.test(ev.data))e.welcome=performance.now();});return s;};
window.WebSocket.prototype=N.prototype;Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});})();`;
async function enter(label,click,{warmSeat=false}={}){
    const port=9300+Math.floor(Math.random()*400),profile=mkdtempSync(join(tmpdir(),'rat-entry-'));
    const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--window-size=1280,720','--no-first-run',
        '--password-store=basic','--mute-audio','--ignore-gpu-blocklist',`--use-angle=${process.env.ANGLE??'gl-egl'}`,'about:blank'],{stdio:'ignore'});
    const r={label,click,warmSeat};let seat;
    try{
        if(warmSeat){seat=socket(false);await seat.open;seat.join(false);for(let i=0;i<200&&!seat.welcome();i++)await sleep(50);await sleep(2000);}
        let tab;for(let i=0;i<100&&!tab;i++){try{tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();}catch{await sleep(100);}}
        const cdp=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(res=>cdp.once('open',res));
        let id=0;const pending=new Map(),errors=[];
        cdp.on('message',d=>{const m=JSON.parse(d);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description?.slice(0,200));pending.get(m.id)?.(m);pending.delete(m.id);});
        const send=(method,params={})=>new Promise(res=>{const n=++id;pending.set(n,res);cdp.send(JSON.stringify({id:n,method,params}));});
        const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.result?.value;
        await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:HOOK});
        const url=new URL(values.url);url.searchParams.set('agent','1');url.searchParams.set('mute','1');
        await send('Page.navigate',{url:url.toString()});
        const mark=n=>`(performance.getEntriesByName(${JSON.stringify(n)})[0]?.startTime??null)`;
        for(let i=0;i<600&&!await ev(`!!document.querySelector('#enter-city-btn')&&!document.querySelector('#enter-city-btn').disabled`);i++)await sleep(50);
        if(click==='ready'){for(let i=0;i<1200&&!await ev(mark('city-render-ready'));i++)await sleep(50);await sleep(300);}
        else if(click.startsWith('delay:'))await sleep(Number(click.slice(6)));
        r.clickAt=await ev(`(()=>{const t=performance.now();document.querySelector('#enter-city-btn').click();return t;})()`);
        for(let i=0;i<1200&&!await ev(mark('city-first-play-frame'));i++)await sleep(50);
        const marks=await ev(`Object.fromEntries(performance.getEntriesByType('mark').map(m=>[m.name,+m.startTime.toFixed(0)]))`);
        const ws=await ev(`window.__ws.map(e=>Object.fromEntries(Object.entries(e).map(([k,v])=>[k,typeof v==='number'?+v.toFixed(0):Array.isArray(v)?v.map(x=>+x.toFixed(0)):v])))`);
        const c=r.clickAt,welcomed=ws.find(e=>e.welcome),ready=marks['city-entry-ready']??marks['city-render-ready'];
        Object.assign(r,{marks,ws,errors,clickToWelcomeMs:welcomed?welcomed.welcome-c:null,clickToPlayMs:marks['city-first-play-frame']!=null?marks['city-first-play-frame']-c:null,
            clientReadyAfterClickMs:ready!=null?Math.max(0,ready-c):null,welcomeAfterReadyMs:welcomed&&ready!=null?welcomed.welcome-Math.max(ready,c):null,
            prepareAgeAtClickMs:(()=>{const p=ws.filter(e=>e.kind==='prepare'&&e.created<=c).at(-1);return p?c-p.created:null;})()});
        await send('Page.navigate',{url:'about:blank'});await sleep(500);
    }finally{chrome.kill('SIGTERM');await sleep(400);rmSync(profile,{recursive:true,force:true});seat?.ws.close(1000,'entry check');}
    const {marks,ws,...brief}=r;console.log(JSON.stringify(brief));
    return r;
}
if(!values['skip-browser']){
    for(let n=0;n<Number(values.runs);n++){
        await cold();report.browser.push(await enter('cold, click at once','early'));
        await cold();report.browser.push(await enter('cold, click after load','ready'));
        await cold();report.browser.push(await enter('warm room, click after load','ready',{warmSeat:true}));
    }
    await cold();report.browser.push(await enter('cold, click after 45 s on the title','delay:45000'));
    const of=l=>report.browser.filter(r=>r.label===l),med=a=>{const s=a.filter(x=>x!=null).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;};
    const early=of('cold, click at once'),ready=of('cold, click after load'),warm=of('warm room, click after load'),title=of('cold, click after 45 s on the title');
    report.summary={coldEarly:{clickToPlayMs:med(early.map(r=>r.clickToPlayMs)),welcomeAfterReadyMs:med(early.map(r=>r.welcomeAfterReadyMs))},
        coldReady:{clickToPlayMs:med(ready.map(r=>r.clickToPlayMs)),clickToWelcomeMs:med(ready.map(r=>r.clickToWelcomeMs))},
        warm:{clickToPlayMs:med(warm.map(r=>r.clickToPlayMs))},titleWait:{clickToPlayMs:title[0]?.clickToPlayMs,clickToWelcomeMs:title[0]?.clickToWelcomeMs,prepareAgeAtClickMs:title[0]?.prepareAgeAtClickMs}};
    check('EN1 clicking at once, the welcome comes within 1.5 s of the client being ready',early.every(r=>r.welcomeAfterReadyMs!=null&&r.welcomeAfterReadyMs<=1500),early.map(r=>r.welcomeAfterReadyMs));
    check(`EN2 a cold room, clicked after load, plays within ${report.targets.coldMs} ms`,ready.every(r=>r.clickToPlayMs!=null&&r.clickToPlayMs<=report.targets.coldMs),ready.map(r=>r.clickToPlayMs));
    check('EN3 after 45 s on the title the prepared room is still fresh (prepared under 25 s before the click) and the entry no slower than a click after load',
        title[0]&&title[0].prepareAgeAtClickMs!=null&&title[0].prepareAgeAtClickMs<25000&&title[0].clickToPlayMs!=null&&title[0].clickToPlayMs<=(report.summary.coldReady.clickToPlayMs??0)+750,report.summary.titleWait);
    check('EN8 every entry reaches a playable frame with no page errors',report.browser.every(r=>r.clickToPlayMs!=null&&!r.errors.length),report.browser.map(r=>({label:r.label,play:r.clickToPlayMs,errors:r.errors})));
    check(`EN9 a warm room, clicked after load, plays within ${report.targets.warmMs} ms`,warm.every(r=>r.clickToPlayMs!=null&&r.clickToPlayMs<=report.targets.warmMs),warm.map(r=>r.clickToPlayMs));
}
report.after=await status();
report.passed=report.checks.every(c=>c.pass);
writeFileSync(join(values.out,`entry-${values.label}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({label:values.label,build:report.build,passed:report.passed,summary:report.summary,checks:report.checks.map(c=>`${c.pass?'PASS':'FAIL'} ${c.check}`)},null,2));
process.exitCode=report.passed?0:1;
