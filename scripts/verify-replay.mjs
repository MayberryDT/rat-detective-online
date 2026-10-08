// Round-end replays, end to end on a hosted game (smooth-play plan, part 3): a muted agent browser (`agent=1`,
// `?replay=dev`) plays with scripted keys and mouse (running, turning, firing at the nearest rat) so the round makes
// highlights, then plays each kept clip fullscreen, once and into a loop. Every rendered camera is recorded, live and in
// the replay, and the replay's camera is checked against the clip's recorded data and, for your own moments, against
// the camera this client actually rendered. Writes replay-<label>.json and the session's WebM. Not human acceptance.
//
// Failure modes, written before the code (docs/plans/smooth-play-2026-10.md):
//   RP1 the replay camera looks somewhere the rat did not (camera forward over 5° from the rat's recorded look, more
//       than 5% of living frames)          RP2 a clip's subject has no look track (the camera would have to guess)
//   RP3 your own moment's replay camera leaves the camera you saw (over 0.5 units or 5°)
//   RP4 a rat stands frozen before it falls (a death stamped more than 150 ms after the victim's last pose, median
//       over 50 ms)                         RP5 a frame over 100 ms while a replay plays, at its start or on a loop
//   RP6 slow motion (the clip's clock runs under 0.9 or over 1.1 of real time)
//
// usage: node scripts/verify-replay.mjs --url=<game url> --out=<dir> [--label=name] [--play=150] [--size=1280x720]
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'},label:{type:'string',default:'replay'},play:{type:'string',default:'150'},size:{type:'string',default:'1280x720'}}});
if(!values.url||!values.out)throw Error('--url and --out are required');
mkdirSync(values.out,{recursive:true});
const [width,height]=values.size.split('x').map(Number),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={url:values.url,label:values.label,at:new Date().toISOString(),kind:'hosted game, muted headless agent with scripted keys and mouse; not human acceptance',checks:[],clips:[]};
const check=(name,pass,detail)=>report.checks.push({check:name,pass:!!pass,...(detail===undefined?{}:{detail})});

/** Every perspective render: when, which camera, where it was and where it looked; the server clock estimate with it. */
const HOOK=`(()=>{const d=window.__THREE_DEVTOOLS__=new EventTarget();window.__cams=[];window.__recordCams=false;
d.addEventListener('observe',e=>{const o=e.detail;if(o.render&&o.domElement&&!o.__wrapped){o.__wrapped=1;const r=o.render.bind(o);
 o.render=(s,c)=>{if(c&&c.isPerspectiveCamera&&s.children.length>50){window.__renderer=o;if(window.__recordCams){c.updateMatrixWorld();const m=c.matrixWorld.elements;
  window.__cams.push([performance.now(),c.uuid,m[12],m[13],m[14],-m[8],-m[9],-m[10],window.__ratReplay?.serverNow()??0]);}}return r(s,c);};}});})();`;

const port=9500+Math.floor(Math.random()*300),profile=mkdtempSync(join(tmpdir(),'rat-replay-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,`--window-size=${width},${height}`,
    '--no-first-run','--password-store=basic','--mute-audio','--ignore-gpu-blocklist','--enable-features=Vulkan',`--use-angle=${process.env.ANGLE??'vulkan'}`,'about:blank'],{stdio:'ignore'});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),angle=(a,b)=>{const d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2],l=Math.hypot(...a)*Math.hypot(...b)||1;return Math.acos(Math.max(-1,Math.min(1,d/l)))*180/Math.PI;};
const lookDir=(yaw,pitch)=>[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
const errors=[];
try{
    let tab;for(let i=0;i<100&&!tab;i++){try{tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();}catch{await sleep(100);}}
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description?.slice(0,300)??m.params.exceptionDetails.text);pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}));});
    const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.result?.value;
    const key=(type,k)=>send('Input.dispatchKeyEvent',{type,key:k.toLowerCase(),code:'Key'+k,windowsVirtualKeyCode:k.charCodeAt(0)});
    let mouseX=width/2;const look=async dx=>{mouseX+=dx;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:Math.round(mouseX),y:Math.round(height/2)});};
    const click=async()=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:width/2,y:height/2,button:'left',clickCount:1});};
    await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:HOOK});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const url=new URL(values.url);url.searchParams.set('agent','1');url.searchParams.set('mute','1');url.searchParams.set('replay','dev');
    await send('Page.navigate',{url:url.toString()});
    for(let i=0;i<400&&!await ev(`!!document.querySelector('#enter-city-btn')&&!document.querySelector('#enter-city-btn').disabled`);i++)await sleep(100);
    await ev(`document.querySelector('#enter-city-btn').click()`);
    for(let i=0;i<300&&!await ev(`!!performance.getEntriesByName('city-first-play-frame')[0]&&!!window.__ratReplay`);i++)await sleep(200);
    report.build=await ev('fetch("/health").then(r=>r.json()).then(r=>r.build).catch(()=>null)');
    await sleep(1500);await click();await sleep(400);
    await ev(`window.__ratReplay&&(window.__recordCams=true)`);
    await ev("window.__movie=new Promise(resolve=>{const stream=__renderer.domElement.captureStream(30),chunks=[];const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6e6});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};rec.start(1000);window.__stopMovie=()=>rec.stop();});void 0");
    // Which way the mouse turns the view, measured.
    const yawNow=async()=>ev(`(()=>{const c=window.__cams.at(-1);return c?Math.atan2(c[5],c[7]):0;})()`);
    const a=await yawNow();for(let i=0;i<10;i++){await look(10);await sleep(16);}await sleep(250);const perPixel=wrap((await yawNow())-a)/100||-.002;
    // Live play: run at the nearest rat, turn onto it and fire.
    const liveCamera=await ev(`window.__cams.at(-1)?.[1]`);
    const end=Date.now()+Number(values.play)*1000;let forward=false,shots=0;
    while(Date.now()<end){
        const r=await ev('window.__ratReplay.rats()');const me=r?.me;
        if(!me){if(forward){await key('keyUp','W');forward=false;}await sleep(300);continue;}
        const target=r.others.sort((p,q)=>Math.hypot(p.x-me.x,p.z-me.z)-Math.hypot(q.x-me.x,q.z-me.z))[0];
        if(target){const turn=wrap(Math.atan2(target.x-me.x,target.z-me.z)-await yawNow());for(let i=0;i<3;i++){await look(turn/perPixel/3);await sleep(10);}
            const d=Math.hypot(target.x-me.x,target.z-me.z);
            if(d>8&&!forward){await key('keyDown','W');forward=true;}else if(d<=8&&forward){await key('keyUp','W');forward=false;}
            if(Math.abs(turn)<.25&&d<40){await click();shots++;}}
        await sleep(120);
    }
    if(forward)await key('keyUp','W');
    report.shots=shots;
    // The replays: each kept clip (up to three, best first) fullscreen, once through and three seconds into a loop.
    const clips=(await ev('window.__ratReplay.clips()'))??[];report.keptClips=clips.length;
    const myId=await ev('window.__ratReplay.myId()');report.myId=myId;
    for(const clip of clips.slice(0,3)){
        const data=await ev(`window.__ratReplay.data(${JSON.stringify(clip.id)})`);
        const camsBefore=await ev('window.__cams.length');
        await ev(`window.__replayStates=[];const tok=window.__replayToken=(window.__replayToken||0)+1;window.__ratReplay.play(${JSON.stringify(clip.id)},true);(function s(){if(window.__replayToken!==tok)return;const st=window.__ratReplay.state();window.__replayStates.push([performance.now(),st.t,st.pov??null,st.clip??null]);if(window.__replayStates.length<20000)requestAnimationFrame(s);})();void 0`);
        await sleep(clip.endAt-clip.startAt+3500);
        await ev('window.__ratReplay.stop()');
        const states=await ev('window.__replayStates.splice(0)'),cams=await ev(`window.__cams.slice(${camsBefore})`);
        report.clips.push({clip,data,states,cams});
    }
    await ev('window.__recordCams=false;window.__stopMovie()');
    const movie=await ev('window.__movie');
    if(typeof movie==='string'&&movie.startsWith('data:video/'))writeFileSync(join(values.out,`replay-${values.label}.webm`),Buffer.from(movie.split(',')[1],'base64'));
    report.live=(await ev(`window.__cams.filter(c=>c[1]===${JSON.stringify(liveCamera)})`))??[];
    report.liveCamera=liveCamera;
}catch(error){report.error=String(error);}
finally{chrome.kill();await new Promise(r=>chrome.exitCode===null?chrome.once('exit',r):r());rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}

// ---- Analysis ----
const VIEW_DELAY=100;
const interp=(rows,t,cols)=>{if(!rows?.length)return null;let lo=0,hi=rows.length-1;if(t<=rows[0][0])return cols.map(c=>rows[0][c]);if(t>=rows[hi][0])return cols.map(c=>rows[hi][c]);
    while(hi-lo>1){const m=(lo+hi)>>1;if(rows[m][0]<=t)lo=m;else hi=m;}const k=(t-rows[lo][0])/((rows[hi][0]-rows[lo][0])||1);return cols.map(c=>rows[lo][c]+(rows[hi][c]-rows[lo][c])*k);};
const lookAt=(rows,t)=>{const r=interp(rows,t,[4,5]);if(!r||!Number.isFinite(r[0])||!Number.isFinite(r[1]))return null;
    // Yaw interpolates the short way round.
    let lo=0;for(let i=0;i<rows.length;i++)if(rows[i][0]<=t)lo=i;const hi=Math.min(rows.length-1,lo+1),k=Math.max(0,Math.min(1,(t-rows[lo][0])/((rows[hi][0]-rows[lo][0])||1)));
    const yaw=rows[lo][4]+wrap(rows[hi][4]-rows[lo][4])*k;return lookDir(yaw,r[1]);};
let lookFrames=0,lookBad=0,noTrack=[],own=[],deaths=[],speeds=[],worstFrame=0,frameGaps=[];
for(const {clip,data,states,cams} of report.clips){
    if(!data||!states?.length)continue;
    const replayCams=cams.filter(c=>c[1]!==report.liveCamera);
    const pov=states.find(s=>s[2])?.[2];
    // RP6: clip clock against real time over the first pass.
    const first=states.findIndex(s=>s[1]>clip.startAt),loopAt=states.findIndex((s,i)=>i>0&&s[1]<states[i-1][1]);
    const pass=states.slice(Math.max(0,first),loopAt>0?loopAt:undefined);
    if(pass.length>2)speeds.push((pass.at(-1)[1]-pass[0][1])/(pass.at(-1)[0]-pass[0][0]));
    // RP5: frame gaps while playing (rendered replay frames).
    for(let i=1;i<replayCams.length;i++){const g=replayCams[i][0]-replayCams[i-1][0];frameGaps.push(g);worstFrame=Math.max(worstFrame,g);}
    // RP2: the subject's look track.
    const ownPov=pov===report.myId,rows=ownPov?null:data.moves[pov];
    if(!ownPov&&!(rows?.some(r=>Number.isFinite(r[4]))))noTrack.push({clip:clip.id,pov});
    const died=data.deaths.find(([,v])=>v===pov)?.[0]??Infinity;
    // RP1 / RP3: each replay frame's camera against the subject's recorded look at the replay's clock (less the view delay).
    for(const c of replayCams){
        const s=states.reduce((best,x)=>Math.abs(x[0]-c[0])<Math.abs(best[0]-c[0])?x:best,states[0]);
        const t=s[1]-VIEW_DELAY;if(!pov||t>=died)continue;
        const dir=[c[5],c[6],c[7]];
        if(ownPov){
            const live=report.live.reduce((best,x)=>Math.abs(x[8]-t)<Math.abs(best[8]-t)?x:best,report.live[0]);
            if(live&&Math.abs(live[8]-t)<50)own.push({pos:Math.hypot(c[2]-live[2],c[3]-live[3],c[4]-live[4]),deg:angle(dir,[live[5],live[6],live[7]])});
            const aim=interp(data.poses,t,[4,5,6]);if(aim){lookFrames++;if(angle(dir,aim)>5)lookBad++;}
        }else{const want=rows&&lookAt(rows,t);if(want){lookFrames++;if(angle(dir,want)>5)lookBad++;}}
    }
    // RP4: deaths against the victim's last pose before them.
    for(const [at,victim] of data.deaths){const m=(data.moves[victim]??[]).filter(r=>r[0]<=at);if(m.length)deaths.push(at-m.at(-1)[0]);}
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;};
report.summary={clips:report.clips.length,lookFrames,lookBadShare:lookFrames?+(lookBad/lookFrames).toFixed(3):null,noTrack,own:{frames:own.length,maxPos:own.length?+Math.max(...own.map(o=>o.pos)).toFixed(2):null,maxDeg:own.length?+Math.max(...own.map(o=>o.deg)).toFixed(1):null},
    deaths:{n:deaths.length,median:med(deaths),max:deaths.length?Math.max(...deaths):null},speeds:speeds.map(s=>+s.toFixed(3)),worstFrameMs:+worstFrame.toFixed(0),framesOver100:frameGaps.filter(g=>g>100).length,errors};
const S=report.summary;
check('RP1 the replay camera looks where the subject looked (over 5° in at most 5% of living frames)',S.lookFrames>0&&S.lookBadShare<=.05,{frames:S.lookFrames,share:S.lookBadShare});
check('RP2 every clip\'s subject has a look track',S.clips>0&&!S.noTrack.length,S.noTrack);
if(S.own.frames)check('RP3 your own moment replays the camera you saw (within 0.5 units and 5°)',S.own.maxPos<=.5&&S.own.maxDeg<=5,S.own);
check('RP4 deaths land with the victim\'s last pose (median ≤ 50 ms, max ≤ 150 ms)',S.deaths.n>0&&S.deaths.median<=50&&S.deaths.max<=150,S.deaths);
check('RP5 no frame over 100 ms while a replay plays, at its start or on a loop',S.clips>0&&S.framesOver100===0,{worst:S.worstFrameMs,over100:S.framesOver100});
check('RP6 no slow motion: the clip clock runs at real time (0.9–1.1)',S.speeds.length>0&&S.speeds.every(s=>s>=.9&&s<=1.1),S.speeds);
check('the session ran with no page errors',!errors.length&&!report.error,{errors,error:report.error});
report.passed=report.checks.every(c=>c.pass);
const {clips:raw,live,...light}=report;
writeFileSync(join(values.out,`replay-${values.label}.json`),JSON.stringify({...light,clips:raw.map(c=>({clip:c.clip,frames:c.cams.length,states:c.states.length}))},null,1));
writeFileSync(join(values.out,`replay-${values.label}-raw.json`),JSON.stringify({clips:raw,live}));
console.log(JSON.stringify({label:values.label,build:report.build,passed:report.passed,summary:S,checks:report.checks.map(c=>`${c.pass?'PASS':'FAIL'} ${c.check}`)},null,1));
process.exitCode=report.passed?0:1;
