// Real staged-browser regression: retained objective, no retired case echo on load or reconnect.
// Emits case-visuals.json and a view of the world origin where the phantom used to sit.
// --url=<game URL> --out=<artifact directory>; ANGLE=vulkan uses Halla's GPU.
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'}}});
values.url??=process.env.BROWSER_SMOKE_URL;
if(!values.url||!values.out)throw Error('--url and --out are required');
mkdirSync(values.out,{recursive:true});

/** Before the page's scripts: three's devtools hook hands over the scene and renderer; sockets are kept to drop. */
const HOOK=`(()=>{const d=window.__THREE_DEVTOOLS__=new EventTarget();window.__ws=[];
d.addEventListener('observe',e=>{const o=e.detail;if(o.render&&o.domElement&&!o.__wrapped){o.__wrapped=1;const r=o.render.bind(o);
 o.render=(s,c)=>{if(c&&c.isPerspectiveCamera&&s.children.length>50){window.__cam=c;window.__scene=s;window.__renderer=o;}return r(s,c);};}});
const raf=window.requestAnimationFrame;window.requestAnimationFrame=cb=>raf.call(window,t=>{if(!window.__pauseProbe)cb(t);});const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);__ws.push(this);}};})();`;
const port=9800+Math.floor(Math.random()*150),profile=mkdtempSync(join(tmpdir(),'rat-reconnect-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
    '--window-size=1600,720','--enable-features=Vulkan','--no-first-run','--password-store=basic','--mute-audio','--ignore-gpu-blocklist',`--use-angle=${process.env.ANGLE??'gl-egl'}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(u,init){for(let i=0;i<100;i++){try{return await (await fetch(u,init)).json();}catch{await sleep(100);}}throw Error(u);}
const steps=[],checks=[],errors=[];let assets=[],build;
try{
    const tab=await json(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
        pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
    const screenshot=async name=>writeFileSync(join(values.out,`${name}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:HOOK});
    const target=new URL(values.url);target.searchParams.set('agent','1');target.searchParams.set('mute','1');
    await send('Page.navigate',{url:target.toString()});
    for(let i=0;i<300&&!await evaluate(`!!document.querySelector('#enter-city-btn')&&!document.querySelector('#enter-city-btn').disabled`);i++)await sleep(100);
    await evaluate(`document.querySelector('#enter-city-btn').click()`);
    for(let i=0;i<180&&!await evaluate("!!window.__scene?.getObjectByName('hot-case')");i++)await sleep(1000);
    for(let i=0;i<10;i++){
      if(i===5){await evaluate('__ws.filter(w=>w.readyState===1).forEach(w=>w.close())');await sleep(6000);}
      steps.push(await evaluate(`(()=>{const s=window.__scene,c=window.__cam;if(!s||!c)return {missing:true,text:document.body.innerText.slice(-500)};const pos=o=>({name:o.name,uuid:o.uuid,p:o.position.toArray(),world:o.matrixWorld.elements.slice(12,15),visible:o.visible,auto:o.matrixAutoUpdate,count:o.count});const papers=s.getObjectByName('physical-case-files')?.children.flatMap(m=>Array.from({length:m.count??0},(_,i)=>{const mat=m.matrixWorld.clone();m.getMatrixAt(i,mat);const p=c.position.clone().setFromMatrixPosition(mat);return {kind:m.name,p:p.toArray(),screen:p.clone().project(c).toArray(),distance:p.distanceTo(c.position)};})).sort((a,b)=>a.distance-b.distance).slice(0,8);return {papers,camera:pos(c),cases:s.children.filter(o=>o.name==='hot-case'||o.name.startsWith('hot-case-')).map(pos),ghosts:s.children.filter(o=>o.visible&&o.children.some(m=>m.visible&&m.renderOrder===1999&&m.material?.isShaderMaterial&&m.material.fragmentShader.includes('uniform float strength'))).map(pos),files:s.getObjectByName('physical-case-files')?.children.map(pos)};})()`));
      if(i===1)await screenshot('first-spawn-papers');
      if(i===9)await screenshot('reconnected-papers');
      await sleep(1000);
    }
    checks.push({check:'nearby paper projects into initial view',pass:steps[1]?.papers?.some(p=>p.distance<14&&Math.abs(p.screen[0])<.9&&Math.abs(p.screen[1])<.9&&p.screen[2]>-1&&p.screen[2]<1)===true});
    checks.push({check:'paper instances at initial spawn and reconnect',pass:[steps[1],steps[9]].every(s=>s.files?.reduce((n,f)=>n+(f.count??0),0)>0)});
    await evaluate("window.__paperMovie=new Promise(resolve=>{\n const stream=__renderer.domElement.captureStream(30),chunks=[];\n const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});\n recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};\n recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};\n recorder.start();setTimeout(()=>recorder.stop(),20000);\n});void 0");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    await sleep(2500);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    const movie=await evaluate('window.__paperMovie');
    if(typeof movie!=='string'||!movie.startsWith('data:video/'))throw Error('live motion recording missing');
    writeFileSync(join(values.out,'live-motion.webm'),Buffer.from(movie.split(',')[1],'base64'));
    assets=await evaluate('performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("/assets/")&&n.endsWith(".js"))');
    build=await evaluate('fetch("/health").then(r=>r.json()).then(r=>r.build)');
    await evaluate('window.__pauseProbe=true');await sleep(300);
    await evaluate('if(window.__renderer&&window.__scene&&window.__cam){__cam.position.set(4,4,9);__cam.lookAt(0,.2,0);__cam.updateMatrixWorld();__renderer.render(__scene,__cam);}');
    await screenshot('world-origin');checks.push({check:'real case rendered',pass:steps.length===10&&steps.every(s=>s.cases?.some(c=>c.name==='hot-case'))},{check:'no orphan case echo',pass:steps.every(s=>s.ghosts?.length===0)},{check:'reconnect rebuilds the real case',pass:steps[0]?.cases?.find(c=>c.name==='hot-case')?.uuid!==steps[9]?.cases?.find(c=>c.name==='hot-case')?.uuid},{check:'no runtime exceptions',pass:errors.length===0});
}catch(error){checks.push({check:'run',pass:false,error:String(error)});}
finally{
    chrome.kill();await new Promise(r=>chrome.exitCode===null?chrome.once('exit',r):r());rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    const pass=checks.length>0&&checks.every(c=>c.pass);
    writeFileSync(join(values.out,'case-visuals.json'),JSON.stringify({url:values.url,at:new Date().toISOString(),pass,build,assets,checks,steps,errors},null,2));
    console.log(JSON.stringify({pass,checks}));
    process.exitCode=pass?0:1;
}
