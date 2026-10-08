// P4 gameplay review recording on a hosted game (Tyler allowed scripted movement for this review, 7 October): a muted
// agent browser joins, stands at its spawn, then follows the case papers it can see on screen (keys and the mouse, as a
// player) toward the case. Writes a continuous WebM of the game canvas, screenshots, and papers.json: the build, a
// per-frame trace of every sheet this client drew (id, look, state, place) and the client-side continuity checks
// (a sheet never changes look under its id, never jumps while it lies still, never comes back). Not human acceptance.
//
// usage: node scripts/record-case-papers.mjs --url=<game url> --out=<dir> [--seconds=80] [--size=1600x900] [--label=desktop]
// env: CHROME_BIN (default google-chrome), ANGLE (default vulkan on Halla)
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'},seconds:{type:'string',default:'80'},size:{type:'string',default:'1600x900'},label:{type:'string',default:'desktop'}}});
if(!values.url||!values.out)throw Error('--url and --out are required');
mkdirSync(values.out,{recursive:true});
const [width,height]=values.size.split('x').map(Number),seconds=Number(values.seconds),label=values.label;

/** Before the page's scripts: the scene, camera and renderer from three's devtools hook, and a frame trace of the papers. */
const HOOK=`(()=>{const d=window.__THREE_DEVTOOLS__=new EventTarget();
d.addEventListener('observe',e=>{const o=e.detail;if(o.render&&o.domElement&&!o.__wrapped){o.__wrapped=1;const r=o.render.bind(o);
 o.render=(s,c)=>{if(c&&c.isPerspectiveCamera&&s.children.length>50){window.__cam=c;window.__scene=s;window.__renderer=o;}return r(s,c);};}});
window.__trace=[];window.__tracing=false;
const frame=()=>{requestAnimationFrame(frame);if(!window.__tracing||!window.__scene)return;
 const files=window.__scene.getObjectByName('physical-case-files')?.userData.caseFiles,rat=window.__me?.();
 if(!files)return;const shown=files.trace().filter(s=>s.shown||s.state==='leaving'||s.state==='arriving');
 window.__trace.push({t:Math.round(performance.now()),rat:rat&&[+rat.x.toFixed(2),+rat.y.toFixed(2),+rat.z.toFixed(2)],
  sheets:shown.map(s=>[s.id,s.s,s.state,+s.x.toFixed(3),+s.y.toFixed(3),+s.z.toFixed(3),+s.yaw.toFixed(3)])});};
requestAnimationFrame(frame);})();`;
/** The local rat (the camera trails it), the camera's yaw, the case and the papers on screen. */
const PROBE=`(()=>{const s=window.__scene,c=window.__cam;if(!s||!c)return null;const V=c.position.constructor,d=new V();c.getWorldDirection(d);
window.__me=()=>s.children.find(o=>o.userData?.localRat&&o.visible)?.position;
const me=window.__me(),hot=s.getObjectByName('hot-case'),p=new V();hot?.getWorldPosition(p);
const files=s.getObjectByName('physical-case-files')?.userData.caseFiles;
// On screen means drawn and in the camera's clear sight (the static city, the same check blown sheets use).
const cam={x:c.position.x,y:c.position.y,z:c.position.z},seen=t=>files.clearPath(cam,{x:t.x,y:t.y+.15,z:t.z});
const caseSeen=hot&&hot.visible&&files&&files.clearPath(cam,{x:p.x,y:p.y,z:p.z});
return {camera:Math.atan2(d.x,d.z),me:me&&{x:me.x,y:me.y,z:me.z},case:caseSeen?{x:p.x,y:p.y,z:p.z}:undefined,stats:files&&{...files.stats},
 sheets:(files?.trace()??[]).filter(t=>t.shown&&(t.state==='p'||t.state==='q')&&seen(t)).map(t=>({id:t.id,x:t.x,y:t.y,z:t.z}))};})()`;

const port=9600+Math.floor(Math.random()*150),profile=mkdtempSync(join(tmpdir(),'rat-papers-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,'--no-first-run','--password-store=basic','--mute-audio','--ignore-gpu-blocklist','--enable-features=Vulkan',
    `--use-angle=${process.env.ANGLE??'vulkan'}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(u,init){for(let i=0;i<100;i++){try{return await (await fetch(u,init)).json();}catch{await sleep(100);}}throw Error(u);}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const checks=[],errors=[],route=[];let build,assets=[];
try{
    const tab=await json(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
        pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
    const screenshot=async name=>writeFileSync(join(values.out,`${label}-${name}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    const key=(type,k)=>send('Input.dispatchKeyEvent',{type,key:k.toLowerCase(),code:'Key'+k,windowsVirtualKeyCode:k.charCodeAt(0)});
    let mouseX=width/2;const look=async dx=>{mouseX+=dx;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:Math.round(mouseX),y:Math.round(height/2)});};
    await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:HOOK});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const target=new URL(values.url);target.searchParams.set('agent','1');target.searchParams.set('mute','1');
    await send('Page.navigate',{url:target.toString()});
    for(let i=0;i<300&&!await evaluate(`!!document.querySelector('#enter-city-btn')&&!document.querySelector('#enter-city-btn').disabled`);i++)await sleep(100);
    await evaluate(`document.querySelector('#enter-city-btn').click()`);
    for(let i=0;i<180&&!await evaluate("!!window.__scene?.getObjectByName('hot-case')&&!!window.__scene?.getObjectByName('physical-case-files')");i++)await sleep(1000);
    build=await evaluate('fetch("/health").then(r=>r.json()).then(r=>r.build).catch(()=>null)');
    await sleep(2500);
    // Pointer lock: a click on the canvas, then the look follows the cursor's travel (about 0.002 rad a pixel).
    for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:width/2,y:height/2,button:'left',clickCount:1});
    await sleep(400);
    // Which way the mouse turns the view, measured rather than assumed.
    const a=(await evaluate(PROBE))?.camera??0;for(let i=0;i<10;i++){await look(10);await sleep(16);}await sleep(250);
    const b=(await evaluate(PROBE))?.camera??0;const perPixel=wrap(b-a)/100||-.002;
    for(let i=0;i<10;i++){await look(-10);await sleep(16);}
    await evaluate("window.__tracing=true;window.__paperMovie=new Promise(resolve=>{const stream=__renderer.domElement.captureStream(30),chunks=[];"+
        "const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8e6});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};"+
        "recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};"+
        `recorder.start(1000);window.__stopMovie=()=>recorder.stop();});void 0`);
    // 1. The spawn view, still: the first lead should be in it.
    await sleep(1500);await screenshot('spawn');const spawnView=await evaluate(PROBE);
    checks.push({check:'papers on screen in the spawn view',pass:(spawnView?.sheets?.length??0)>0,shown:spawnView?.sheets?.length??0});
    await sleep(3000);
    // 2. Follow what is on screen: the nearest unread paper, else turn to look; the case itself once it is in view.
    const read=new Set(),start=Date.now();let forward=false,shots=0,turns=0;
    while(Date.now()-start<(seconds-6)*1000){
        const p=await evaluate(PROBE);if(!p?.me){await sleep(150);continue;}
        for(const s of p.sheets)if(Math.hypot(s.x-p.me.x,s.z-p.me.z)<2.2)read.add(s.id);
        const c=p.case&&Math.hypot(p.case.x-p.me.x,p.case.z-p.me.z)<25?p.case:undefined;
        const next=c??p.sheets.filter(s=>!read.has(s.id)).sort((x,y)=>Math.hypot(x.x-p.me.x,x.z-p.me.z)-Math.hypot(y.x-p.me.x,y.z-p.me.z))[0];
        route.push({t:Date.now()-start,me:p.me,target:next?{x:next.x,z:next.z,id:next.id??'case'}:null});
        if(!next){if(forward){await key('keyUp','W');forward=false;}await look(.5/perPixel/12);turns++;await sleep(60);continue;}
        const turn=wrap(Math.atan2(next.x-p.me.x,next.z-p.me.z)-p.camera);
        for(let i=0;i<4;i++){await look(turn/perPixel/4);await sleep(8);}
        const go=Math.abs(turn)<.7;
        if(go&&!forward){await key('keyDown','W');forward=true;}else if(!go&&forward){await key('keyUp','W');forward=false;}
        if(Date.now()-start>shots*15000+7000){await screenshot('follow-'+shots);shots++;}
        await sleep(90);
    }
    if(forward)await key('keyUp','W');
    await sleep(1500);await screenshot('end');
    await evaluate('window.__tracing=false;window.__stopMovie()');
    const movie=await evaluate('window.__paperMovie');
    if(typeof movie!=='string'||!movie.startsWith('data:video/'))throw Error('recording missing');
    writeFileSync(join(values.out,`${label}-papers.webm`),Buffer.from(movie.split(',')[1],'base64'));
    const trace=await evaluate('window.__trace');
    assets=await evaluate('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/")&&n.endsWith(".js"))');
    // Client-side continuity from the trace: one look per id, no jump while lying still, no comeback after leaving.
    const looks=new Map(),last=new Map(),gone=new Set(),seen=new Set(),bad={look:[],jump:[],comeback:[]};let maxShown=0,arrivals=0,departures=0;
    for(const f of trace){
        const now=new Set();maxShown=Math.max(maxShown,f.sheets.filter(s=>s[2]==='p'||s[2]==='q').length);
        for(const [sid,s,state,x,y,z,yaw] of f.sheets){
            now.add(sid);if(gone.has(sid))bad.comeback.push({id:sid,t:f.t});
            if(looks.has(sid)&&looks.get(sid)!==s)bad.look.push({id:sid,t:f.t});looks.set(sid,s);
            const prev=last.get(sid);
            if(prev&&prev.state===state&&(state==='p'||state==='q')&&Math.hypot(prev.x-x,prev.y-y,prev.z-z)>.001)bad.jump.push({id:sid,t:f.t,state});
            if(state==='arriving'&&prev?.state!=='arriving')arrivals++;if(state==='leaving'&&prev?.state!=='leaving')departures++;
            last.set(sid,{state,x,y,z});seen.add(sid);
        }
        for(const sid of last.keys())if(!now.has(sid)&&last.get(sid).state==='leaving')gone.add(sid);
    }
    // What this client actually did, from CaseFiles' own counters over the recording: a sheet the budget dropped while in
    // range and in view, or a sheet that vanished on screen without blowing away, is a blink. The trace adds comebacks.
    const before=spawnView?.stats??{evicted:0,popped:0,arrivals:0,departures:0},after=(await evaluate(PROBE))?.stats??before;
    const counted=Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-(before[k]??0)]));
    checks.push({check:'no sheet dropped from view by the budget while in range and in view',pass:counted.evicted===0,counted});
    checks.push({check:'no sheet vanished on screen without blowing away',pass:counted.popped===0,counted});
    checks.push({check:'no sheet comes back after blowing away',pass:bad.comeback.length===0,examples:bad.comeback.slice(0,3)});
    checks.push({check:'the follower read papers and moved',pass:read.size>0&&route.length>1&&Math.hypot(route.at(-1).me.x-route[0].me.x,route.at(-1).me.z-route[0].me.z)>10,read:read.size});
    checks.push({check:'no runtime exceptions',pass:errors.length===0});
    writeFileSync(join(values.out,`${label}-papers.json`),JSON.stringify({url:values.url,label,size:values.size,build,assets,at:new Date().toISOString(),
        kind:'hosted game, muted agent browser, scripted keys and mouse following on-screen papers; not human acceptance',
        frames:trace.length,sheets:seen.size,maxShownAtOnce:maxShown,arrivals,departures,read:read.size,turnsLooking:turns,checks,errors,route,trace},null,1));
}catch(error){checks.push({check:'run',pass:false,error:String(error)});}
finally{
    chrome.kill();await new Promise(r=>chrome.exitCode===null?chrome.once('exit',r):r());rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    const pass=checks.length>0&&checks.every(c=>c.pass);
    console.log(JSON.stringify({label,build,pass,checks:checks.map(c=>({check:c.check,pass:c.pass}))}));
    process.exitCode=pass?0:1;
}
