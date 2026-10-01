// End-to-end reconnect check against a hosted game (muted agent browser): join, look backwards (past ±90°,
// where a restored heading used to mirror the rat's turn), drop the socket, let the client resume its rat, then
// check that the supply sites were not duplicated, the view kept its direction and the rat still turns with the
// camera. Writes <out>/reconnect.json and screenshots; exits 1 on a failed check.
//
// usage: node scripts/reconnect-check.mjs --url=<game url> --out=<dir>
// env: CHROME_BIN (default google-chrome), ANGLE (default gl-egl)
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{url:{type:'string'},out:{type:'string'}}});
if(!values.url||!values.out)throw Error('--url and --out are required');
mkdirSync(values.out,{recursive:true});

/** Before the page's scripts: three's devtools hook hands over the scene and renderer; sockets are kept to drop. */
const HOOK=`(()=>{const d=window.__THREE_DEVTOOLS__=new EventTarget();window.__ws=[];
d.addEventListener('observe',e=>{const o=e.detail;if(o.render&&o.domElement&&!o.__wrapped){o.__wrapped=1;const r=o.render.bind(o);
 o.render=(s,c)=>{if(c&&c.isPerspectiveCamera&&s.children.length>50){window.__cam=c;window.__scene=s;}return r(s,c);};}});
const W=window.WebSocket;window.WebSocket=class extends W{constructor(...a){super(...a);__ws.push(this);}};})();`;
/** The camera's yaw, the nearest rat's (yours: the camera trails it) and the supply sites in the scene. */
const PROBE=`(()=>{const s=window.__scene,c=window.__cam;if(!s||!c)return null;const V=c.position.constructor,d=new V();c.getWorldDirection(d);
const rat=s.children.filter(o=>o.visible&&o.getObjectByName&&o.getObjectByName('rat-body')).sort((a,b)=>a.position.distanceTo(c.position)-b.position.distanceTo(c.position))[0];
const f=new V(0,0,1).applyQuaternion(rat.quaternion);
return {camera:Math.atan2(d.x,d.z),rat:Math.atan2(f.x,f.z),pickups:s.children.filter(o=>/^pickup-/.test(o.name)).length,open:__ws.filter(w=>w.readyState===1).length};})()`;

const port=9800+Math.floor(Math.random()*150),profile=mkdtempSync(join(tmpdir(),'rat-reconnect-'));
const chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
    '--window-size=1600,720','--no-first-run','--password-store=basic','--mute-audio','--ignore-gpu-blocklist',`--use-angle=${process.env.ANGLE??'gl-egl'}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(u,init){for(let i=0;i<100;i++){try{return await (await fetch(u,init)).json();}catch{await sleep(100);}}throw Error(u);}
const turn=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const steps=[],checks=[],errors=[];
try{
    const tab=await json(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});
    const socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map();
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);
        if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
        pending.get(m.id)?.(m);pending.delete(m.id);});
    const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);socket.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.result?.value;
    const probe=async label=>{const p=await evaluate(PROBE);steps.push({label,...p});return p;};
    const screenshot=async name=>writeFileSync(join(values.out,`${name}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
    const click=async x=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y:360,button:'left',clickCount:1});};
    // Under pointer lock the look follows the cursor's travel: 0.002 rad a pixel.
    let x=1500;const moveTo=async to=>{for(let i=1;i<=20;i++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+(to-x)*i/20,y:360});await sleep(16);}x=to;};
    await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:HOOK});
    const target=new URL(values.url);target.searchParams.set('agent','1');target.searchParams.set('mute','1');
    await send('Page.navigate',{url:target.toString()});
    for(let i=0;i<300&&!await evaluate(`!!document.querySelector('#enter-city-btn')&&!document.querySelector('#enter-city-btn').disabled`);i++)await sleep(100);
    await evaluate(`document.querySelector('#enter-city-btn').click()`);
    await sleep(12000);await click(x);await sleep(500);
    await moveTo(0);await sleep(1500);
    const before=await probe('facing-back');await screenshot('reconnect-before');
    await evaluate('__ws.filter(w=>w.readyState===1).forEach(w=>w.close())');
    await sleep(500);
    for(let i=0;i<80&&!(await evaluate('__ws.some(w=>w.readyState===1)'));i++)await sleep(250);
    await sleep(3000);
    const resumed=await probe('resumed');
    await click(x);await sleep(300);await moveTo(300);await sleep(1500);
    const turned=await probe('resumed-turned');await screenshot('reconnect-after');
    checks.push({check:'rat faced past 90 degrees before the drop',pass:Math.abs(before.rat)>Math.PI/2});
    checks.push({check:'socket reconnected',pass:resumed.open===1});
    checks.push({check:'supply sites not duplicated',pass:resumed.pickups===before.pickups,before:before.pickups,after:resumed.pickups});
    checks.push({check:'view kept its direction',pass:turn(resumed.camera,before.camera)<.2});
    checks.push({check:'rat turns with the camera',pass:turn(turned.rat,turned.camera)<.3&&turn(turned.camera,resumed.camera)>.3});
}catch(error){checks.push({check:'run',pass:false,error:String(error)});}
finally{
    chrome.kill();await new Promise(r=>chrome.exitCode===null?chrome.once('exit',r):r());rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    const pass=checks.length>0&&checks.every(c=>c.pass);
    writeFileSync(join(values.out,'reconnect.json'),JSON.stringify({url:values.url,at:new Date().toISOString(),pass,checks,steps,errors},null,2));
    console.log(JSON.stringify({pass,checks}));
    process.exitCode=pass?0:1;
}
