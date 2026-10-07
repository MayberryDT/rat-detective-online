// Authority -> supported walk graph -> paper windows -> compact receivers -> restore.
// Failure scenarios were recorded before implementation in physical-clues-failure-cases.md.
import assert from 'node:assert/strict';import {build} from 'esbuild';import {writeFileSync} from 'node:fs';
const out='/home/halla/build/rat-detective/physical-clues-20261007';
await build({stdin:{contents:`export {ChaosSimulation} from './src/shared/ChaosSimulation';export {ChaosEncoder,ChaosDecoder} from './src/shared/chaosWire';export {createPlayer} from './src/worker/gameState';export {DEFAULT_APPEARANCE} from './src/shared/ratAppearance';export {worldSpawnPoints} from './src/shared/playerSpawns';export {BotNavigation} from './src/shared/BotNavigation';export {CLUES} from './src/shared/caseClues';export {BOT_LAUNCH_LINKS} from './src/shared/BotLaunchRoutes';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},outfile:out+'/trail-integration.mjs'});
const {ChaosSimulation,ChaosEncoder,ChaosDecoder,createPlayer,DEFAULT_APPEARANCE,worldSpawnPoints,BotNavigation,CLUES,BOT_LAUNCH_LINKS}=await import(out+'/trail-integration.mjs');
let seed=7841;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const spec={seed:2383011301,version:7},players=new Map(),sim=new ChaosSimulation(players,()=>{},undefined,spec),spawns=worldSpawnPoints(spec);let now=100000,maxStepMs=0;
const rows=[],enc=new ChaosEncoder('trail-proof'),dec=new ChaosDecoder();let frames=0,maxBytes=0;
function step(){now+=1000/60;const t=performance.now();sim.step(1/60,now,true);maxStepMs=Math.max(maxStepMs,performance.now()-t);const s=sim.snapshot(false),f=enc.encode(s),d=dec.read(f.payload);assert.ok(d?.message?.type==='chaos');assert.equal(d.message.state.clues.length,s.clues.length);assert.ok(s.clues.length<=CLUES.max);frames++;maxBytes=Math.max(maxBytes,f.payload.length);return s;}
for(let i=0;i<120;i++)step();
for(let i=0;i<10;i++){const p=spawns[(i*97)%spawns.length];players.set('human-'+i,createPlayer('human-'+i,'Spawn '+i,DEFAULT_APPEARANCE,{...p,y:0}));}
let s;for(let i=0;i<240;i++)s=step();
for(const p of players.values()){const near=Math.min(...s.clues.map(c=>Math.hypot(c.p.x-p.x,c.p.y-p.y,c.p.z-p.z)));rows.push({id:p.id,firstPaperDistance:near});assert.ok(near<5,'spawn has nearby paper: '+p.id);}
const restored=new ChaosSimulation(players,()=>{},s,spec);assert.deepEqual(restored.snapshot(false).clues,s.clues);
// Follow a supported route to the actual loose case and let authority claim it.
const walker=players.get('human-0');for(const [id] of players)if(id!==walker.id)players.delete(id);
const nav=new BotNavigation(spec),search=nav.paperRouteSteps(walker,s.case.p);let result;do{result=search.next();}while(!result.done);assert.ok(result.value.length);
for(const point of result.value){Object.assign(walker,{x:point.x,y:point.y,z:point.z});s=step();if(s.case.owner===walker.id)break;}
assert.equal(s.case.owner,walker.id,'walk route ends in authoritative case pickup');
// A moving carrier must cause the follower's visible route to be rebuilt, not retain the old destination.
const chaser=createPlayer('follower','Follower',DEFAULT_APPEARANCE,{...spawns[30],y:0});players.set(chaser.id,chaser);
const escape=nav.paperRouteSteps(walker,{...spawns[700],y:0});let run;do{run=escape.next();}while(!run.done);
for(const point of run.value.slice(0,40)){Object.assign(walker,{x:point.x,y:point.y,z:point.z});for(let j=0;j<7;j++)s=step();}
for(let i=0;i<180;i++)s=step();
assert.ok(s.clues.some(c=>Math.hypot(c.p.x-chaser.x,c.p.z-chaser.z)<5),'follower retains an obvious start');
const follow=sim.clues.paths.get(chaser.id);assert.ok(follow?.points.length);assert.ok(Math.hypot(follow.target.x-walker.x,follow.target.z-walker.z)<8,'route destination follows moved carrier');
const before=s.clues.map(c=>c.id);sim.reset();s=step();assert.ok(!s.clues.some(c=>before.includes(c.id)),'relocation clears obsolete route papers');
// Exact staging failure: distant street spawn with an underground case, and the reverse.
const sewerRoutes=[];
for(const [from,to] of [[{x:90,y:0,z:-150},{x:-4.277,y:-7,z:-3.52}],[{x:-4,y:-7,z:-4},{x:90,y:0,z:-150}],...spawns.filter((_,i)=>i%97===0).map(p=>[{...p,y:0},{x:-4,y:-7,z:-4}])]){
 const search=nav.paperRouteSteps(from,to);let r,slices=0;do{r=search.next();slices++;}while(!r.done);
 assert.ok(r.value.length,'street/sewer route exists');
 for(let i=1;i<r.value.length;i++)assert.ok(nav.walkable(r.value[i-1],r.value[i])||r.value[i-1].launch||r.value[i-1].drop,'supported sewer route');
 sewerRoutes.push({from,to,slices,points:r.value.length});
}
const roofRoutes=[];
for(const link of BOT_LAUNCH_LINKS){
 const search=nav.paperRouteSteps({...spawns[10],y:0},link.landing);let r;do{r=search.next();}while(!r.done);
 assert.ok(r.value.length,'reachable launcher landing');
 for(let i=1;i<r.value.length;i++){const a=r.value[i-1],b=r.value[i];if(Math.hypot(a.x-b.x,a.z-b.z)>4)assert.ok(a.launch||a.drop,'no invented unsupported route segment');}
 roofRoutes.push({machine:link.machine.id,points:r.value.length});
}
const receipt={passed:true,kind:'real authority/walk-route/wire integration; not human gameplay acceptance',spawns:rows,sewerRoutes,roofRoutes,frames,maxBytes,maxStepMs,checks:['ten separated spawns each get papers','bounded compact frames decode','restore retains shared papers','supported route reaches real case pickup','launcher roofs have explicit supported routes','route follows moving carrier','relocation removes old routes']};writeFileSync(out+'/trail-integration.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
