const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const ts=require(path.resolve('node_modules/typescript'));
const results={};
let receiver; const listeners=new Set(), callbacks=[];
const native={onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},onDisconnect:{addListener(){}},postMessage(){}};
vm.runInNewContext(fs.readFileSync('omarchy/extension/service-worker.js','utf8'),{
 chrome:{runtime:{connectNative:()=>native,onMessage:{addListener:f=>receiver=f}}},URL,
 setTimeout:()=>1,clearTimeout(){}
});
for(let i=1;i<=2;i++) receiver({channel:'rat-detective-highlights',payload:{messageId:`message-${i}`,type:'hello'}},{origin:'https://ratdetective.online',frameId:0,tab:{id:i}},r=>callbacks.push({request:i,reply:r.messageId}));
for(const f of [...listeners])f({messageId:'message-1',status:'accepted'});
assert.equal(callbacks.length,2);assert.equal(callbacks[1].reply,'message-1');
results.concurrent_native_responses=callbacks;
const cache={}; const sent=[], timers=[]; let onMessage;
const win={addEventListener:(type,f)=>onMessage=f,postMessage:m=>sent.push(m),setInterval:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearInterval(){}};
function load(file){file=path.resolve(file); if(cache[file])return cache[file]; const module={exports:{}};cache[file]=module.exports;
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:p=>load(path.resolve(path.dirname(file),p+'.ts')),window:win,performance:{now:()=>1000},location:{origin:'https://ratdetective.online'},console,Math,Date});return module.exports;
}
const {HighlightBridge}=load('src/highlights/HighlightBridge.ts');
const bridge=new HighlightBridge('https://ratdetective.online');bridge.attach();bridge.setIdentity(true,false);
function reply(value){onMessage({source:win,origin:'https://ratdetective.online',data:{channel:'rat-detective-highlights',type:'capability',available:true,...value}})}
reply({status:'accepted'});reply({status:'rejected',reason:'highlights are off'});
const before=sent.filter(x=>x.payload.type==='session-start').length;
reply({status:'rejected',reason:'stale session',enabled:true,state:'ready'});
for(let i=0;i<3;i++)timers.find(t=>t.delay===2000).fn();
const after=sent.filter(x=>x.payload.type==='session-start').length;
assert.equal(before,1);assert.equal(after,1);assert.equal(bridge.live,true);
results.enable_after_join={session_start_attempts_before_enable:before,session_start_attempts_after_enable_and_three_heartbeats:after,bridge_claims_live:bridge.live,immediate_ping_count:sent.filter(x=>x.payload.type==='ping').length};
bridge.dispose();
const {HighlightDetector}=load('src/highlights/HighlightDetector.ts');
const d=new HighlightDetector();
const welcome={localId:'player-primary',epoch:'epoch-primary',roundId:'round-primary',deliverySerial:0,owner:null,remainingMs:30000,assignmentId:'closing-time'};
d.welcome(welcome);
d.noteLocalLaunch(1000,0);
const launch=d.observePhysical({presentedAtMs:3000,localY:40,localLaunchedAtMs:1000,localLaunchY:0,corpses:[]});
assert.equal(launch.length,0);
const escape=d.onDeath({victimId:'other',killerId:'player-primary',eventKey:'death-primary',presentedAtMs:3100,local:false,localKill:true});
assert.equal(escape.filter(m=>m.kind==='launcher-escape').length,0);
d.reset();
d.onSnapshot({...welcome,epoch:'epoch-next',roundId:'round-next',lastDeliveryPlayerId:'player-primary',launches:[],presentedAtMs:20000,silent:true});
const nextWin=d.onWin('player-primary',25000);
assert.equal(nextWin.length,0);
results.detector={launch_rise_units:40,launch_age_ms:2000,spectacular_launch_markers:launch.length,launcher_escape_markers:escape.filter(m=>m.kind==='launcher-escape').length,win_markers_after_round_reset_and_snapshot:nextWin.length};
console.log(JSON.stringify(results,null,2));
