// Which WebGL programs a real game compiles during play (Tyler's 9 October 5 s freeze: 36 programs linked mid-play).
// A muted agent browser (`agent=1`) enters a hosted game, plays with scripted keys and mouse (verify-replay's loop:
// run at the nearest rat, turn, fire) and, every half second, names each program first linked since the last look
// by the objects drawing with it, beside the longest frame in that half second. Writes programs-<label>.json.
// usage: node scripts/program-census-live.mjs --url=<game url> --out=<dir> [--label=name] [--play=240]
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'},label:{type:'string',default:'live'},play:{type:'string',default:'240'}}});
if(!values.url||!values.out)throw Error('--url and --out are required');
mkdirSync(values.out,{recursive:true});
const width=1280,height=720,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const HOOK=`(()=>{const d=window.__THREE_DEVTOOLS__=new EventTarget();
d.addEventListener('observe',e=>{const o=e.detail;if(o.render&&o.domElement&&!o.__wrapped){o.__wrapped=1;const r=o.render.bind(o);
 o.render=(s,c)=>{if(c&&c.isPerspectiveCamera&&s.children.length>50){window.__renderer=o;window.__scene=s;}return r(s,c);};}});
 let last=performance.now();window.__longest=0;(function f(t){window.__longest=Math.max(window.__longest,t-last);last=t;requestAnimationFrame(f);})(last);
 window.__seen=new Set();window.__scannerAdds=0;
 addEventListener('DOMContentLoaded',()=>new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes)if(n.classList?.contains('scanner-line'))window.__scannerAdds++;}).observe(document.body,{childList:true,subtree:true}));
 window.__newPrograms=()=>{const R=window.__renderer,S=window.__scene;if(!R)return [];const fresh=(R.info.programs??[]).filter(p=>!window.__seen.has(p.cacheKey));
  if(!fresh.length)return [];const keys=new Set(fresh.map(p=>p.cacheKey));for(const k of keys)window.__seen.add(k);const users=new Map();
  S.traverse(o=>{if(!o.material)return;for(const m of [o.material].flat()){const p=R.properties.get(m)?.currentProgram;if(p&&keys.has(p.cacheKey)){const u=users.get(p.cacheKey)??new Set();u.add((o.name||o.type)+'/'+(m.name||m.type));users.set(p.cacheKey,u);}}});
  return fresh.map(p=>p.name+'#'+p.id+': '+([...(users.get(p.cacheKey)??[])].slice(0,4).join(', ')||'(no live user) '+p.cacheKey.replace(/\\s+/g,' ').slice(0,120)));};
})();`;
const port=9500+Math.floor(Math.random()*300),profile=mkdtempSync(join(tmpdir(),'rat-programs-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,`--window-size=${width},${height}`,
    '--no-first-run','--password-store=basic','--mute-audio','--ignore-gpu-blocklist','--enable-features=Vulkan',`--use-angle=${process.env.ANGLE??'vulkan'}`,'about:blank'],{stdio:'ignore'});
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const report={url:values.url,at:new Date().toISOString(),kind:'hosted game, muted headless agent with scripted keys and mouse; not human acceptance',events:[],errors:[]};
try{
    let tab;for(let i=0;i<100&&!tab;i++){try{tab=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();}catch{await sleep(100);}}
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.exception?.description?.slice(0,300)??m.params.exceptionDetails.text);pending.get(m.id)?.(m);pending.delete(m.id);});
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
    const clicked=Date.now();await ev('window.__longest=0');
    for(let i=0;i<900&&!await ev(`!!performance.getEntriesByName('city-first-play-frame')[0]&&!!window.__ratReplay&&!!window.__renderer`);i++)await sleep(200);
    if(!await ev('!!window.__renderer'))throw Error('never reached play');
    report.entryMs=Date.now()-clicked;report.entryLongestMs=Math.round(await ev('window.__longest'));console.log('entry',report.entryMs,'ms, longest frame',report.entryLongestMs,'ms');
    report.build=await ev('fetch("/health").then(r=>r.json()).then(r=>r.build).catch(()=>null)');
    report.atPlay=await ev('window.__newPrograms().length');
    await sleep(1500);await click();await sleep(400);await ev('window.__longest=0');
    const started=Date.now(),end=started+Number(values.play)*1000;let forward=false,lastPoll=0,yawPerPixel=-.002,lastLights='';
    const poll=async()=>{const fresh=await ev('window.__newPrograms()'),longest=await ev('(()=>{const l=window.__longest;window.__longest=0;return l;})()');
        const state=await ev('(()=>{const r=window.__ratReplay?.rats?.();const me=r?.me;return me?{x:+me.x.toFixed(1),y:+me.y.toFixed(1),z:+me.z.toFixed(1),hp:me.hp}:null;})()');
        // What decides every lit program's variant: visible lights by kind, shadow-casting ones, fog and tone mapping.
        const lights=await ev(`(()=>{const c={};window.__scene.traverseVisible(o=>{if(o.isLight){const k=o.type+(o.castShadow?'*':'');c[k]=(c[k]||0)+1;}});return JSON.stringify(c)+' fog:'+!!window.__scene.fog+' tone:'+window.__renderer.toneMapping+' shadows:'+window.__renderer.shadowMap.enabled;})()`);
        if(lights!==lastLights){report.events.push({s:+((Date.now()-started)/1000).toFixed(1),lights});console.log(`${((Date.now()-started)/1000).toFixed(1)}s lights ${lights}`);lastLights=lights;}
        if(fresh?.length||longest>100){report.events.push({s:+((Date.now()-started)/1000).toFixed(1),longestMs:Math.round(longest),me:state,programs:fresh});
            console.log(`${((Date.now()-started)/1000).toFixed(1)}s longest ${Math.round(longest)} ms, ${fresh?.length??0} new`,JSON.stringify(state));for(const p of fresh??[])console.log('   ',p.slice(0,160));}};
    while(Date.now()<end){
        if(Date.now()-lastPoll>=500){lastPoll=Date.now();await poll();}
        const r=await ev('window.__ratReplay.rats()');const me=r?.me;
        if(!me){if(forward){await key('keyUp','W');forward=false;}await sleep(300);continue;}
        const target=r.others.sort((p,q)=>Math.hypot(p.x-me.x,p.z-me.z)-Math.hypot(q.x-me.x,q.z-me.z))[0];
        if(target){const turn=wrap(Math.atan2(target.x-me.x,target.z-me.z)-(me.yaw??0));await look(turn/yawPerPixel/3);
            const d=Math.hypot(target.x-me.x,target.z-me.z);
            if(d>8&&!forward){await key('keyDown','W');forward=true;}else if(d<=8&&forward){await key('keyUp','W');forward=false;}
            if(d<40)await click();}
        await sleep(120);
    }
    await poll();
    report.totalPrograms=await ev('window.__renderer.info.programs.length');
    report.scannerLines=await ev('window.__scannerAdds');console.log('scanner lines shown',report.scannerLines,'in',values.play,'s');
    writeFileSync(join(values.out,`programs-${values.label}.json`),JSON.stringify(report,null,2)+'\n');
    console.log('total programs',report.totalPrograms,'errors',report.errors.length);
}finally{chrome.kill('SIGTERM');await sleep(500);rmSync(profile,{recursive:true,force:true});}
