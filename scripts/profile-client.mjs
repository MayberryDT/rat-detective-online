// Headless Chrome CPU and allocation profile of a game page, muted, 1280x720 at DPR 1.
// Used for the optimization baseline: the synthetic render fixture and hosted
// observation rooms. No gameplay input is sent; `--click` only presses a button
// such as the title's Enter.
//
// usage: node scripts/profile-client.mjs --url=<url> --out=<dir> [--label=name]
//        [--warmup=15000] [--seconds=20] [--click=#enter-city-btn]
//        [--result=<js expression read after profiling>] [--sourcemaps=dist]
//   --sourcemaps  attribute minified frames through a `vite build --sourcemap` output
//   --analyze     re-summarize an existing <out>/<label>.cpuprofile/.heapprofile; no browser
// env: CHROME_BIN (default google-chrome), ANGLE (default gl-egl)
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'},label:{type:'string',default:'client'},
    warmup:{type:'string',default:'15000'},sourcemaps:{type:'string'},analyze:{type:'boolean',default:false},seconds:{type:'string',default:'20'},click:{type:'string'},result:{type:'string'}}});
if(!values.out||!values.url&&!values.analyze)throw Error('--out and --url (or --analyze) are required');
mkdirSync(values.out,{recursive:true});
const maps=new Map(),frameKey=await frameNamer(values.sourcemaps);
if(values.analyze){
    const {readFileSync}=await import('node:fs');
    const file=ext=>JSON.parse(readFileSync(join(values.out,`${values.label}.${ext}`),'utf8'));
    const previous=file('summary.json'),cpu=file('cpuprofile');
    Object.assign(previous,{cpuSelf:cpuSelf(cpu),gameInclusive:gameInclusive(cpu),allocations:heapSelf(file('heapprofile'))});
    writeFileSync(join(values.out,`${values.label}.summary.json`),JSON.stringify(previous,null,2));
    console.log(JSON.stringify({label:values.label,reanalyzed:true}));process.exit(0);
}
const port=9800+Math.floor(Math.random()*150),profile=mkdtempSync(join(tmpdir(),'rat-profile-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
    '--window-size=1280,720','--no-first-run','--mute-audio','--autoplay-policy=no-user-gesture-required','--ignore-gpu-blocklist',
    `--use-angle=${process.env.ANGLE??'gl-egl'}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(u,init){for(let i=0;i<100;i++){try{return await (await fetch(u,init)).json();}catch{await sleep(100);}}throw Error(u);}
const errors=[];
try{
    const tab=await json(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
        pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:values.url});
    if(values.click){
        for(let i=0;i<300&&!await evaluate(`!!document.querySelector(${JSON.stringify(values.click)})&&!document.querySelector(${JSON.stringify(values.click)}).disabled`);i++)await sleep(100);
        await evaluate(`document.querySelector(${JSON.stringify(values.click)}).click()`);
    }
    await sleep(Number(values.warmup));
    await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:200});
    await send('HeapProfiler.enable');
    await send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
    const frames=await evaluate('(()=>{const f=window.__profileFrames={count:0,start:performance.now()};const tick=()=>{f.count++;requestAnimationFrame(tick);};requestAnimationFrame(tick);return true;})()');
    await send('Profiler.start');
    await sleep(Number(values.seconds)*1000);
    const cpu=(await send('Profiler.stop')).result.profile;
    const heap=(await send('HeapProfiler.stopSampling')).result.profile;
    const fps=await evaluate('(()=>{const f=window.__profileFrames;return f?f.count/((performance.now()-f.start)/1000):null;})()');
    const result=values.result?await evaluate(values.result):undefined;
    const gpu=await evaluate('(()=>{const g=document.createElement("canvas").getContext("webgl2");const d=g?.getExtension("WEBGL_debug_renderer_info");return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):null;})()');
    writeFileSync(join(values.out,`${values.label}.cpuprofile`),JSON.stringify(cpu));
    writeFileSync(join(values.out,`${values.label}.heapprofile`),JSON.stringify(heap));
    const summary={label:values.label,url:values.url,gpu,frames:!!frames,fps:fps&&+fps.toFixed(1),seconds:Number(values.seconds),result,cpuSelf:cpuSelf(cpu),gameInclusive:gameInclusive(cpu),allocations:heapSelf(heap),errors};
    writeFileSync(join(values.out,`${values.label}.summary.json`),JSON.stringify(summary,null,2));
    console.log(JSON.stringify({label:summary.label,fps:summary.fps,gpu,busyMs:summary.cpuSelf.busyMs,idleMs:summary.cpuSelf.idleMs,allocatedMB:summary.allocations.sampledMB,errors:errors.length}));
    socket.close();
}finally{
    chrome.kill('SIGTERM');await sleep(300);rmSync(profile,{recursive:true,force:true});
}

/** Main-thread self time per function; idle and program time reported apart from JS. */
function cpuSelf(profile){
    const byId=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();let total=0,idle=0;
    profile.samples.forEach((sample,i)=>{const f=byId.get(sample).callFrame,dt=(profile.timeDeltas[i+1]??0)/1000;
        if(f.functionName==='(idle)'){idle+=dt;return;}
        const key=frameKey(f);self.set(key,(self.get(key)??0)+dt);total+=dt;});
    return {busyMs:+total.toFixed(1),idleMs:+idle.toFixed(1),top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,60).map(([fn,t])=>({fn,ms:+t.toFixed(1),share:+(t/total).toFixed(3)}))};
}
/** Busy time attributed to the nearest game-source frame (`src/`) on each stack:
 * what our code costs including the library work it asks for. */
function gameInclusive(profile){
    const byId=new Map(profile.nodes.map(n=>[n.id,n])),parent=new Map(),owner=new Map(),self=new Map();let total=0;
    for(const n of profile.nodes)for(const c of n.children??[])parent.set(c,n.id);
    const find=id=>{
        if(owner.has(id))return owner.get(id);
        const key=frameKey(byId.get(id).callFrame),up=parent.get(id);
        const result=/ src\//.test(key)?key:up===undefined?'(outside game source)':find(up);
        owner.set(id,result);return result;
    };
    profile.samples.forEach((sample,i)=>{if(byId.get(sample).callFrame.functionName==='(idle)')return;const dt=(profile.timeDeltas[i+1]??0)/1000;
        const key=find(sample);self.set(key,(self.get(key)??0)+dt);total+=dt;});
    return {busyMs:+total.toFixed(1),top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([fn,t])=>({fn,ms:+t.toFixed(1),share:+(t/total).toFixed(3)}))};
}
/** Sampled allocation bytes per allocating function (including collected objects). */
function heapSelf(profile){
    const self=new Map();let total=0;
    const walk=n=>{const key=frameKey(n.callFrame);
        if(n.selfSize){self.set(key,(self.get(key)??0)+n.selfSize);total+=n.selfSize;}for(const c of n.children)walk(c);};
    walk(profile.head);
    return {sampledMB:+(total/1048576).toFixed(1),top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([fn,b])=>({fn,MB:+(b/1048576).toFixed(2),share:+(b/total).toFixed(3)}))};
}
/** `name file:line:col`, through source maps for bundled assets when available. */
async function frameNamer(dir){
    const {TraceMap,originalPositionFor}=dir?await import('@jridgewell/trace-mapping'):{};
    const {readFileSync,existsSync}=await import('node:fs');
    return f=>{
        // Dev servers serve sources as /src/… or /@fs/<abs>/src/…; keep the repo-relative part.
        const path=(/^https?:/.test(f.url)?new URL(f.url).pathname.slice(1):f.url).replace(/^.*?\/(?=(src|node_modules)\/)/,''),file=path.split('/').pop();
        const fallback=`${f.functionName||'(anonymous)'} ${path}:${f.lineNumber+1}:${f.columnNumber+1}`;
        if(!dir||!file.endsWith('.js'))return fallback;
        if(!maps.has(file)){const path=join(dir,'assets',`${file}.map`);maps.set(file,existsSync(path)?new TraceMap(readFileSync(path,'utf8')):null);}
        const map=maps.get(file);if(!map)return fallback;
        const o=originalPositionFor(map,{line:f.lineNumber+1,column:f.columnNumber});
        if(!o.source)return fallback;
        return `${o.name??f.functionName??'(anonymous)'} ${o.source.replace(/^(\.\.\/)+/,'').replace(/^node_modules\//,'')}:${o.line}`;
    };
}
