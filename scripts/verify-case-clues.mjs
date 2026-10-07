// Repeatable integration receipt: real authority physics -> two compact receivers -> restore -> bot goals/Jev.
// Failure cases were recorded before implementation in docs/verification/physical-clues-failure-cases.md.
// This is not a human playtest or a substitute for hosted GameRoom smoke.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out=resolve(process.env.P4_OUT??'/home/halla/build/rat-detective/physical-clues-20261007');
await mkdir(out,{recursive:true});
const bundle=resolve(out,'clue-integration.mjs');
await build({stdin:{contents:`
export {ChaosSimulation} from './src/shared/ChaosSimulation';
export {ChaosEncoder,ChaosDecoder,parseServerMessage} from './src/shared/chaosWire';
export {createPlayer} from './src/worker/gameState';
export {DEFAULT_APPEARANCE} from './src/shared/ratAppearance';
export {GRAYBOX_VERSION} from './src/shared/grayboxLayout';
export {CLUES,visibleClues} from './src/shared/caseClues';
export {BotMotor} from './src/shared/bots/motor';
export {BotGoals} from './src/shared/bots/goals';
export {CarrierSight} from './src/shared/bots/motor/carriers';
export {perceive} from './src/worker/bots/perception';
export {Vec3,RaycastResult} from 'cannon-es';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},outfile:bundle,logLevel:'error'});
let seed=7841;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const {ChaosSimulation,ChaosEncoder,ChaosDecoder,parseServerMessage,createPlayer,DEFAULT_APPEARANCE,GRAYBOX_VERSION,CLUES,visibleClues,BotMotor,BotGoals,CarrierSight,perceive,Vec3,RaycastResult}=await import(pathToFileURL(bundle));
const checks=[],frames=[],events=[];
const check=(name,run)=>{run();checks.push(name);};
const players=new Map(),sim=new ChaosSimulation(players,()=>{},undefined,{seed:341283204,version:GRAYBOX_VERSION});
let now=100000;
const encoders=[new ChaosEncoder('receiver-a'),new ChaosEncoder('receiver-b')],decoders=[new ChaosDecoder(),new ChaosDecoder()];
let last;
function receive(){
 const state=sim.snapshot(false),decoded=encoders.map((e,i)=>{const frame=e.encode(state);frames.push({receiver:i,payload:JSON.parse(frame.payload)});const d=decoders[i].read(frame.payload);assert.equal(d?.message.type,'chaos');return d.message.state;});
 assert.deepEqual(decoded[0].clues,decoded[1].clues);
 assert.equal(decoded[0].clues.length,state.clues.length);
 last=decoded[0];return state;
}
function step(n=1){for(let i=0;i<n;i++){now+=1000/60;sim.step(1/60,now,true);events.push(...sim.drainClueEvents());}return receive();}
step(120);
check('stationary loose case leaves a supported spill',()=>assert.ok(last.clues.length>0));
const start=structuredClone(last.clues);
step(1800);
check('stationary spill survives without lying about its age',()=>{assert.equal(last.clues.length,1);assert.equal(last.clues[0].at,start.find(c=>c.anchored).at);});
sim.reset();step(120);
const c=sim.snapshot(false).case,hit=new RaycastResult();
sim.world.raycastClosest(new Vec3(c.p.x,c.p.y+.2,c.p.z),new Vec3(c.p.x,c.p.y-3,c.p.z),{collisionFilterMask:1},hit);
assert.ok(hit.hasHit);
const rat=createPlayer('fixture-human','Fixture',DEFAULT_APPEARANCE,{x:c.p.x,y:hit.hitPointWorld.y,z:c.p.z});
players.set(rat.id,rat);step();
assert.equal(sim.snapshot(false).case.owner,rat.id);
const before=last.clues.map(c=>c.id);
for(let i=0;i<150;i++){rat.x+=.3;step();}
check('carrying makes real supported history without clearing the take scene',()=>{assert.ok(last.clues.length>1);assert.ok(last.clues.some(c=>before.includes(c.id)));});
const ground=rat.y;rat.y=25;step(15);const airborne=last.clues.map(c=>c.id);rat.x+=20;step(15);
check('flight never draws an imaginary ground bridge',()=>assert.deepEqual(last.clues.map(c=>c.id),airborne));
rat.y=ground;step();
check('all emitted pages rest on a real support surface',()=>{for(const clue of last.clues){const h=new RaycastResult();sim.world.raycastClosest(new Vec3(clue.p.x,clue.p.y+.1,clue.p.z),new Vec3(clue.p.x,clue.p.y-.3,clue.p.z),{collisionFilterMask:1},h);assert.ok(h.hasHit);assert.ok(Math.abs(h.hitPointWorld.y-clue.p.y)<.1);}});
const saved=sim.snapshot(false),restored=new ChaosSimulation(players,()=>{},saved,{seed:341283204,version:GRAYBOX_VERSION});
check('checkpoint/late receiver preserves the shared evidence',()=>{const frame=new ChaosEncoder('rejoin').encode(restored.snapshot(false));const result=new ChaosDecoder().read(frame.payload);assert.deepEqual(result.message.state.clues,last.clues);});
check('wire rejects unbounded, duplicate and malformed clues',()=>{for(const clues of [[...saved.clues,...saved.clues],Array.from({length:65},(_,i)=>({id:String(i),at:now,p:{x:0,y:0,z:0}})),[{id:'bad',at:now,p:{x:NaN,y:0,z:0}}]])assert.equal(parseServerMessage(JSON.stringify({type:'chaos',state:{...saved,clues}})),null);});
check('hidden clues cannot consume the three-cluster visible budget',()=>{const samples=Array.from({length:7},(_,i)=>({id:String(i),at:now,p:{x:i+1,y:0,z:0}}));assert.deepEqual(visibleClues(samples,{x:0,y:0,z:0},now,p=>p.x>3).map(c=>c.id),['3','4','5']);});
const nav={route:(_a,b)=>[b],localStep:(_a,b)=>b,explorationTargets:()=>[{x:0,y:0,z:30}]};
const self=createPlayer('reader','Reader',DEFAULT_APPEARANCE,{x:0,y:0,z:0}),motor=new BotMotor(nav,1,()=>.5),goals=new BotGoals(nav,motor,1,()=>.5);
const state={...saved,time:now,case:{...saved.case,owner:null,p:{x:0,y:1,z:15}},clues:[{id:'seen',at:now,p:{x:0,y:.035,z:10}}]};
const input={now,self,state,cases:[{key:'case',value:state.case}],living:[self],carriers:[],carrying:false,ownershipChanged:false,trigger:'beat',clear:()=>false};
check('hidden loose case is not a bot goal or Jev coordinate',()=>{assert.equal(goals.takeable(input),undefined);const ctx=goals.survey(input,undefined),view=perceive(ctx,{hits:[]});assert.match(view.state.case,/not seen where/);assert.equal(ctx.clue,undefined);});
input.clear=()=>true;
check('visible paperwork becomes an ordinary search goal',()=>{const ctx=goals.survey(input,undefined);assert.equal(ctx.clue.id,'seen');const plan=goals.planFor('roam',ctx);assert.equal(plan.key,'clue:seen');assert.deepEqual(plan.destination,state.clues[0].p);});
const sight=new CarrierSight();state.case.owner='hidden';state.case.ping={at:now,p:{x:40,y:0,z:40}};
check('global pings never reveal a carrier to bots',()=>{sight.observe([{key:'case',value:state.case}],self.id);sight.see(self,[],[createPlayer('hidden','Hidden',DEFAULT_APPEARANCE,{x:40,y:0,z:40})],now);assert.equal(sight.known.length,0);assert.equal(sight.caseAt('case',state.case,self.id),undefined);});
sim.reset();step();
check('round relocation clears the old evidence episode',()=>assert.ok(!last.clues.some(c=>saved.clues.some(old=>old.id===c.id))));
check('history and event traffic stay bounded',()=>assert.ok(frames.every(f=>(f.payload.rest.clues?.length??0)<=CLUES.max)));
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts/verify-case-clues.mjs'],{encoding:'utf8'}).trim().split('\n').sort();
const hash=createHash('sha256');for(const path of tracked){hash.update(path);hash.update(await readFile(path));}
await writeFile(resolve(out,'clue-frames.ndjson'),frames.map(f=>JSON.stringify(f)).join('\n'));
await writeFile(resolve(out,'clue-events.json'),JSON.stringify(events,null,2));
const result={passed:true,kind:'authority-wire-restore-perception integration; not human play',seed:7841,base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:hash.digest('hex'),checks,frames:frames.length,events:events.length,maxFrameBytes:Math.max(...frames.map(f=>Buffer.byteLength(JSON.stringify(f.payload))))};
await writeFile(resolve(out,'clue-integration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
