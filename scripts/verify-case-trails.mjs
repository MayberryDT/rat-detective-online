// P4 case papers, end to end on the real authority: ChaosSimulation and the production server bots -> compact wire ->
// receivers, a paper follower that uses only what it can see, and the lifecycle (starter boundary, relocation, reset,
// restore). Writes papers-<label>.json (measures and checks) and papers-<label>-trace.jsonl (every sheet's life as a
// receiver saw it). Not human gameplay acceptance: no browser, no hosted Worker.
//
// Failure scenarios, written before the code (docs/verification/noir-papers-v2-2026-10-07.md):
//   F1 a sheet changes its look or place under the same id      F2 an id leaves and comes back
//   F3 a sheet is replaced where it lay (drop + add within 1.2 units and 3 s) outside a case clear
//   F4 a sheet lives under 2 s outside a clear (a blink)        F5 a still observer sees churn from rats it cannot see
//   F6 walking out past the starter and back drops or re-adds the starter
//   F7 a fresh spawn has no supported lead in its view          F8 a follower using only visible papers misses the case
//   F9 a restore drops the papers at once                       F10 a clear leaves a sheet of the old placement
//   F11 a street view holds too many sheets                     F12 wire bytes or step time regress against the baseline
//
// usage: node scripts/verify-case-trails.mjs [--out=<dir>] [--ref=<git rev>] [--minutes=6] [--spawns=62] [--measure]
//   --ref      build src/ from that commit (the baseline); with --measure nothing is asserted, only measured
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,createWriteStream} from 'node:fs';
import {relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{out:{type:'string',default:'/home/halla/build/rat-detective/noir-papers-v2-20261007/authority'},ref:{type:'string'},
    minutes:{type:'string',default:'6'},spawns:{type:'string',default:'62'},measure:{type:'boolean',default:false},only:{type:'string'},debug:{type:'string'},baseline:{type:'string'}}});
const root=process.cwd(),out=resolve(values.out);mkdirSync(out,{recursive:true});
const ref=values.ref&&execFileSync('git',['rev-parse',values.ref],{encoding:'utf8'}).trim();
const label=ref?ref.slice(0,7):'worktree',measureOnly=values.measure;
const outfile=resolve(out,`runtime-${label}.mjs`);
await build({stdin:{contents:"export {ChaosSimulation} from './src/shared/ChaosSimulation.ts';export {prepareChaos,ChaosDecoder} from './src/shared/chaosWire.ts';export {ChaosDelivery} from './src/worker/ChaosDelivery.ts';"+
    "export {ServerBotController} from './src/worker/ServerBotController.ts';export {createPlayer,applyHit,respawnPlayer,spawnForWorld} from './src/worker/gameState.ts';export {createAssignment} from './src/shared/assignments.ts';"+
    "export {worldSpawnPoints} from './src/shared/playerSpawns.ts';export {BotNavigation} from './src/shared/BotNavigation.ts';export {BOT_LAUNCH_LINKS} from './src/shared/BotLaunchRoutes.ts';export {SpatialRayQuery} from './src/shared/SpatialRayQuery.ts';export {GRAYBOX_VERSION} from './src/shared/grayboxLayout.ts';export {DEFAULT_APPEARANCE} from './src/shared/ratAppearance.ts';export {Vec3} from 'cannon-es';",resolveDir:root,loader:'ts'},
    // Bundled whole (the runtime lives in the build directory, beside its artifacts).
    // The authority's clocks run on simulation time (restores read Date.now), from a fixed day in October 2026.
    outfile,bundle:true,platform:'node',format:'esm',logLevel:'error',define:{'performance.now':'__simClock','Date.now':'__simClock'},
    banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},
    plugins:ref?[{name:'ref',setup(b){b.onLoad({filter:/\/src\/.*\.ts$/},args=>({contents:execFileSync('git',['show',`${ref}:${relative(root,args.path)}`],{encoding:'utf8'}),loader:'ts'}));}}]:[]});
let seed=2383011301;Math.random=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const EPOCH=Date.UTC(2026,9,7,12);let simClock=EPOCH,uuid=0;globalThis.__simClock=()=>simClock;
globalThis.crypto.randomUUID=()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`;
const R=await import(pathToFileURL(outfile)+'?'+Date.now());
const {Vec3}=R;
const spec={seed:2383011301,version:R.GRAYBOX_VERSION};
const spawns=R.worldSpawnPoints(spec),nav=new R.BotNavigation(spec);
const report={label,ref:ref??'worktree',measureOnly,kind:'real authority, production server bots, compact wire receivers and a sight-only paper follower; not human gameplay acceptance',
    spec,checks:[],room:{},follower:{},lifecycle:{},routes:{}};
// Every check is recorded and the run finishes (report and trace written) before a failure sets the exit code.
const check=(name,pass,detail)=>{report.checks.push({check:name,pass:!!pass,...(detail===undefined?{}:{detail})});};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),flat=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const stats=a=>{const s=[...a].sort((x,y)=>x-y),q=f=>s.length?s[Math.min(s.length-1,Math.floor(f*s.length))]:null;return {n:s.length,median:q(.5),p90:q(.9),max:s.length?s[s.length-1]:null};};
const look=c=>JSON.stringify({p:c.p,s:c.s,q:c.q,at:c.at,id:c.id});
const trace=createWriteStream(resolve(out,`papers-${label}-trace.jsonl`));

/** A room as GameRoom runs it: 30 Hz ticks of two 60 Hz steps, the production bots, deaths and 3 s respawns, a PAPER
 * CHASE assignment, and one compact receiver decoding every frame like a client. */
function makeRoom(humans,botCount,saved){
    const players=new Map(saved?.players??[]);
    if(!saved){
        for(const id of humans)players.set(id,R.createPlayer(id,id,R.DEFAULT_APPEARANCE,{...R.spawnForWorld(spec,Math.random,players.values(),id),y:0}));
        for(let i=0;i<botCount;i++){const id=`rd-ai-${i}`;players.set(id,R.createPlayer(id,`Rat ${i}`,R.DEFAULT_APPEARANCE,R.spawnForWorld(spec,Math.random,players.values(),id)));}
    }
    const room={players,sim:undefined,bots:undefined,delivery:new R.ChaosDelivery(true),decoder:new R.ChaosDecoder(),state:undefined,now:saved?.now??simClock,events:[],stepMs:[],clueBytes:[]};
    const onHit=hit=>{
        const victim=players.get(hit.victim);if(!victim||victim.hp<=0)return;
        const result=R.applyHit(players,hit.owner,hit.victim,hit.damage,!!hit.incoming,hit.owner&&room.sim.isCaseHolder(hit.owner)?hit.owner:null,!!room.sim.assignmentState,hit.explosive===true);
        if(!result.applied||!result.killed)return;
        victim.respawnAt=room.now+3000;room.sim.creditCaseKill(hit.owner);if(hit.incoming)room.sim.death(victim,hit.incoming,hit.owner);
    };
    room.sim=new R.ChaosSimulation(players,onHit,saved?.state,spec);
    // The paper system's own time per step (its `guide`), apart from the physics around it: F12 compares this.
    room.guideMs=[];const clues=room.sim.clues,guide=clues.guide.bind(clues);
    clues.guide=(...a)=>{const t=process.hrtime.bigint();try{return guide(...a);}finally{room.guideMs.push(Number(process.hrtime.bigint()-t)/1e6);}};
    if(!saved)room.sim.setAssignment(R.createAssignment('chain-of-custody',room.now));
    const ids=[...players.keys()].filter(id=>id.startsWith('rd-ai-'));
    if(ids.length)room.bots=new R.ServerBotController(spec,ids,{
        move:(id,p,facing)=>{const player=players.get(id);if(!player||player.hp<=0)return;Object.assign(player,p);player.meshQx=0;player.meshQz=0;player.meshQy=Math.sin(facing/2);player.meshQw=Math.cos(facing/2);},
        shoot:(id,origin,direction)=>{const player=players.get(id);if(!player||player.hp<=0)return;room.sim.shoot(id,{shotId:crypto.randomUUID(),origin,direction});},
        decide:()=>{},
    });
    room.state=room.sim.snapshot();
    return room;
}
/** One 30 Hz tick; returns the clues the receiver decoded. `move(now)` places the scripted humans first. */
function tick(room,move){
    room.now+=1000/30;simClock=room.now;
    for(const [id,p] of room.players)if(p.hp<=0&&p.respawnAt<=room.now){R.respawnPlayer(p,R.spawnForWorld(spec,Math.random,room.players.values(),id,room.sim.assignmentState));room.bots?.reset(id,{x:p.x,y:p.y,z:p.z});}
    if(room.sim.assignmentState?.result){room.sim.reset();room.sim.setAssignment(R.createAssignment('chain-of-custody',room.now));}
    for(let s=0;s<2;s++){
        const at=room.now-(1-s)*1000/60;move?.(at);
        room.bots?.step(1/60,at,room.players,room.state,true);
        const t=process.hrtime.bigint();room.sim.step(1/60,at,true);room.stepMs.push(Number(process.hrtime.bigint()-t)/1e6);
        room.sim.drainShotEvents?.();room.sim.drainPickupEvents?.();room.sim.drainIncidentEvents?.();
        room.events.push(...room.sim.drainClueEvents().map(e=>({...e,t:room.now})));
    }
    room.state=room.sim.snapshot();
    const payload=room.delivery.offer(room.state,room.now);
    if(payload){room.delivery.acknowledge({type:'chaosAck',stream:room.delivery.lastFrame.ack.stream,seq:room.delivery.lastFrame.seq});
        const f=JSON.parse(payload);room.clueBytes.push(JSON.stringify(f.rest?.clues??null).length);
        const d=room.decoder.read(payload);assert.ok(d?.message?.type==='chaos','frame decodes');room.received=d.message.state.clues??[];}
    return room.received??[];
}
/** What a receiver saw: every sheet's life, look changes, comebacks, replacements in place and blinks. */
class Ledger {
    constructor(){this.live=new Map();this.gone=new Map();this.lives=[];this.violations={look:[],comeback:[],replaced:[],blink:[]};this.adds=[];this.drops=[];}
    see(clues,t,clearAt){
        const now=new Map(clues.map(c=>[c.id,c]));
        for(const [id,c] of now){
            const known=this.live.get(id);
            if(known){if(look(known.c)!==look(c))this.violations.look.push({id,t,was:known.c,now:c});continue;}
            if(this.gone.has(id))this.violations.comeback.push({id,t});
            this.live.set(id,{c,born:t});this.adds.push({id,t,p:c.p});trace.write(JSON.stringify({t,add:c})+'\n');
        }
        for(const [id,known] of this.live)if(!now.has(id)){
            const cleared=clearAt.some(at=>Math.abs(at-t)<100);
            this.live.delete(id);this.gone.set(id,t);this.lives.push({id,ms:t-known.born,cleared});
            this.drops.push({id,t,p:known.c.p,cleared});trace.write(JSON.stringify({t,drop:id,cleared})+'\n');
            if(!cleared&&t-known.born<2000)this.violations.blink.push({id,ms:t-known.born});
        }
    }
    /** Drops and adds within 3 s and 1.2 units of each other, outside a clear: one sheet swapped for another in place. */
    replacements(){
        const out=[];
        for(const d of this.drops){if(d.cleared)continue;
            const a=this.adds.find(a=>a.id!==d.id&&Math.abs(a.t-d.t)<=3000&&flat(a.p,d.p)<1.2&&Math.abs(a.p.y-d.p.y)<1);
            if(a)out.push({dropped:d.id,added:a.id,t:d.t});}
        return out;
    }
}
const sight=world=>{const q=new R.SpatialRayQuery(world);let at=-Infinity;
    return (a,b)=>{if(simClock-at>=1000){q.refresh();at=simClock;}const from=new Vec3(a.x,a.y,a.z),to=new Vec3(b.x,b.y,b.z);return !(q.blocked?q.blocked(from,to,1):q.closest(from,to,1).hasHit);};};
// A player looks from the shoulder camera, never lower than its pivot (ShoulderCamera SHOULDER.pivotY) behind the rat.
const eye=p=>({x:p.x,y:p.y+3.5,z:p.z});
const visibleFrom=(see,p,clues,range=65)=>clues.filter(c=>dist(p,c.p)<=range&&see(eye(p),{...c.p,y:c.p.y+.15}));
/** On screen: the shoulder camera about 5.7 behind and 5.4 above the rat along its facing, a sheet within 45° of the
 * view axis (the game's 60° vertical field at 16:9), within 65 of the rat and in the camera's sight. */
/** The shoulder camera for a rat facing `f`: its pivot 3.5 above the feet, the boom 5.7 back and 1.85 up, pulled in
 * before anything it would pass through (ShoulderCamera does the same with its blockers). */
const camera=(see,p,f)=>{const pivot={x:p.x,y:p.y+3.5,z:p.z};
    for(let t=1;t>.1;t-=.05){const c={x:pivot.x-f.x*5.7*t,y:pivot.y+1.85*t,z:pivot.z-f.z*5.7*t};if(see(pivot,c))return c;}return pivot;};
const onScreen=(see,p,clues)=>{const yaw=2*Math.atan2(p.meshQy??0,p.meshQw??1),f={x:Math.sin(yaw),z:Math.cos(yaw)},cam=camera(see,p,f);
    return clues.filter(c=>{const d=flat(cam,c.p);return dist(p,c.p)<=65&&d>.5&&((c.p.x-cam.x)*f.x+(c.p.z-cam.z)*f.z)/d>Math.cos(Math.PI/4)&&see(cam,{...c.p,y:c.p.y+.15});});};

// ---- A: a populated room, ten rats (a still observer, a walker crossing its starter's edge, eight bots) ----
if(values.only===undefined){
    const minutes=Number(values.minutes),room=makeRoom(['human-still','human-walker'],8);
    const ledger=new Ledger(),see=sight(room.sim.world),still=room.players.get('human-still'),walker=room.players.get('human-walker');
    // --debug=<id,id>: log the authority's retirements and new sheets near those ids (candidate only).
    if(values.debug&&room.sim.clues?.constructor){const watch=new Set(values.debug.split(',')),P=room.sim.clues.constructor.prototype,retire=P.retire,groupAt=P.groupAt;
        const clear=P.clear;P.clear=function(...a){if(this.vacated?.length||this.items.length)console.error('CLEAR',simClock,JSON.stringify({items:this.items.length,vacated:this.vacated?.length,args:a.length}),new Error().stack.split('\n')[2].trim());return clear.apply(this,a);};
        P.retire=function(g,now){if(g.ids.some(id=>watch.has(id)))console.error('RETIRE',now,JSON.stringify({g:g.id,ids:g.ids,anchor:g.anchor,vacated:this.vacated?.length}));return retire.call(this,g,now);};
        P.groupAt=function(A,kind,now,...rest){const before=this.nextSheet,r=groupAt.call(this,A,kind,now,...rest);
            for(let n=before;n<this.nextSheet;n++){const id='c'+n.toString(36);if(watch.has(id)){const c=this.items.find(c=>c.id===id);console.error('CREATE',now,id,kind,JSON.stringify({A,p:c?.p,vacated:this.vacated?.map(v=>[+(now-v.at).toFixed(0),+Math.hypot(v.p.x-c.p.x,v.p.z-c.p.z).toFixed(2)]).filter(v=>v[1]<3)}));}}
            return r;};}
    // The walker paces 14 units out along its first walkable heading and back, over and over.
    const home={x:walker.x,y:walker.y,z:walker.z};let away;
    for(let a=0;a<16&&!away;a++){const t={x:home.x+Math.cos(a*Math.PI/8)*14,y:home.y,z:home.z+Math.sin(a*Math.PI/8)*14};const r=nav.paperRouteSteps(home,t);let s;do{s=r.next();}while(!s.done);if(s.value.length>3&&flat(s.value.at(-1),t)<3)away=s.value;}
    const pace=t=>{if(!away||walker.hp<=0)return;const u=(t/1000%12)/12,leg=u<.5?u*2:2-u*2,i=Math.min(away.length-1,Math.floor(leg*(away.length-1)));Object.assign(walker,{x:away[i].x,y:away[i].y,z:away[i].z});};
    const counts={published:[],stillSees:[],stillNear:[],walkerSees:[],ratSees:[],ratScreen:[]},stillChurn={near:0,minutes},dense=[];
    let clearAt=[];const ticks=minutes*60*30;
    for(let k=0;k<ticks;k++){
        const clues=tick(room,pace);clearAt=room.events.filter(e=>e.what==='clear').map(e=>e.t);
        const before=new Map([...ledger.live].map(([id,v])=>[id,v.c]));ledger.see(clues,room.now,clearAt);
        if(k%30===0){
            counts.published.push(clues.length);
            if(still.hp>0){const v=visibleFrom(see,still,clues);counts.stillSees.push(v.length);counts.stillNear.push(v.filter(c=>dist(still,c.p)<30).length);}
            if(walker.hp>0)counts.walkerSees.push(visibleFrom(see,walker,clues).length);
            // An ordinary street view: what every living rat (bots included) has in sight within 65, each second.
            for(const p of room.players.values())if(p.hp>0){const v=visibleFrom(see,p,clues);counts.ratSees.push(v.length);counts.ratScreen.push(onScreen(see,p,clues).length);
                if(v.length>=14&&dense.length<40){const groups=new Set(v.map(c=>[...(room.sim.clues?.groups?.values?.()??[])].find(g=>g.ids?.includes(c.id))?.id));
                    dense.push({rat:p.id,n:v.length,groups:groups.size,toCase:+dist(p,room.state.case.p).toFixed(0),ratsWithin30:[...room.players.values()].filter(o=>o!==p&&o.hp>0&&dist(o,p)<30).length,
                        near:v.filter(c=>dist(p,c.p)<25).length,kinds:[...groups].map(id=>room.sim.clues?.groups?.get?.(id)?.how).filter(Boolean)});}}
        }
        // Churn a still observer could see: sheets within 40 units in its sight that came or went (clears aside).
        if(still.hp>0&&!clearAt.some(at=>Math.abs(at-room.now)<100)){
            const near=c=>dist(still,c.p)<40&&see(eye(still),{...c.p,y:c.p.y+.15}),now=new Set(clues.map(c=>c.id));
            for(const c of clues)if(!before.has(c.id)&&near(c))stillChurn.near++;
            for(const [id,c] of before)if(!now.has(id)&&near(c))stillChurn.near++;
        }
    }
    // Guidance after every clear: how soon each living rat has a sheet within 25 units in its sight.
    const recover=[];
    for(const e of room.events.filter(e=>e.what==='clear'))recover.push(e.t);
    const replaced=ledger.replacements(),stepMs=stats(room.stepMs);
    report.room={minutes,rats:room.players.size,frames:ticks,published:stats(counts.published),stillSeesInRange:stats(counts.stillSees),stillSeesWithin30:stats(counts.stillNear),
        walkerSeesInRange:stats(counts.walkerSees),everyRatSeesInRange:stats(counts.ratSees),everyRatOnScreen:stats(counts.ratScreen),denseViews:dense.slice(0,12),sheetLives:stats(ledger.lives.filter(l=>!l.cleared).map(l=>l.ms)),sheetsSeen:ledger.lives.length+ledger.live.size,
        adds:ledger.adds.length,drops:ledger.drops.length,clears:recover.length,stillChurnPerMinute:+(stillChurn.near/minutes).toFixed(1),
        violations:{look:ledger.violations.look.length,comeback:ledger.violations.comeback.length,replaced:replaced.length,blink:ledger.violations.blink.length},
        examples:{look:ledger.violations.look.slice(0,3),comeback:ledger.violations.comeback.slice(0,3),replaced:replaced.slice(0,5),blink:ledger.violations.blink.slice(0,5)},
        clueBytesPerFrame:stats(room.clueBytes),stepMs:{median:stepMs.median,p90:stepMs.p90,max:stepMs.max},
        guideMs:(()=>{const g=stats(room.guideMs);return {median:g.median,p90:g.p90,p99:[...room.guideMs].sort((a,b)=>a-b)[Math.floor(room.guideMs.length*.99)],max:g.max,total:+room.guideMs.reduce((t,m)=>t+m,0).toFixed(1)};})(),
        events:Object.fromEntries(['lead','route','clear','shed'].map(w=>[w,room.events.filter(e=>e.what===w).length]))};
    // F5: what a still player sees come and go near it (40 units, in sight), clears aside. The old trail: about 40 a minute.
    check('F5 a still observer sees at most 15 sheets come or go a minute near it',report.room.stillChurnPerMinute<=15,report.room.stillChurnPerMinute);
    // F12: against the baseline run of the same harness (--baseline=<papers-REF.json>), when given.
    report.room.clueBytesPerSecond=Math.round(room.clueBytes.reduce((t,b)=>t+(b>4?b:0),0)/(minutes*60));
    if(values.baseline){const base=JSON.parse(readFileSync(values.baseline,'utf8')).room,bytes=base.clueBytesPerSecond??null;
        report.room.baseline={clueBytesPerSecond:bytes,stepMsMedian:base.stepMs?.median,stepMsP90:base.stepMs?.p90,guideMs:base.guideMs};
        // The paper system's own work (whole-step times on a shared machine vary 20% run to run; they are reported).
        const g=report.room.guideMs,bg=base.guideMs;
        check('F12 paper bytes and the paper system\'s time per step no worse than the baseline (total, p99)',
            (bytes===null||report.room.clueBytesPerSecond<=bytes)&&!!bg&&g.total<=bg.total&&g.p99<=bg.p99*1.25,{candidate:{bytes:report.room.clueBytesPerSecond,guide:g},baseline:report.room.baseline});}
    check('F1 no sheet changes look or place under its id',ledger.violations.look.length===0,ledger.violations.look.slice(0,2));
    check('F2 no id comes back',ledger.violations.comeback.length===0,ledger.violations.comeback.slice(0,2));
    check('F3 no sheet replaced in place outside a clear',replaced.length===0,replaced.slice(0,3));
    check('F4 no sheet blinks (lives under 2 s) outside a clear',ledger.violations.blink.length===0,ledger.violations.blink.slice(0,3));
    check('F11 a street view stays sparse (every rat each second, the shoulder camera\'s view: median ≤ 4, p90 ≤ 8 sheets)',
        (report.room.everyRatOnScreen.median??0)<=4&&(report.room.everyRatOnScreen.p90??0)<=8,report.room.everyRatOnScreen);
    // F9: restore keeps the papers while the routes reclaim them.
    const saved=JSON.parse(JSON.stringify(room.sim.snapshot(false))),before=new Set(saved.clues?.map(c=>c.id)??[]);
    const restored=makeRoom([],0,{players:[...room.players].map(([id,p])=>[id,structuredClone(p)]),state:saved,now:room.now});
    const kept=[];
    for(let k=0;k<300;k++){const clues=tick(restored);if([1,30,150,299].includes(k))kept.push({afterMs:Math.round((k+1)*1000/30),kept:clues.filter(c=>before.has(c.id)).length,of:before.size});}
    report.lifecycle.restore=kept;
    check('F9 a restore keeps its sheets through the first second',before.size===0||kept[1].kept>=before.size*.9,kept);
    // F10: a reset retires every sheet of the old placement (the ones live just before it).
    const live=new Set(tick(restored).map(c=>c.id));restored.sim.reset();const after=tick(restored);
    report.lifecycle.reset={liveBefore:live.size,survivors:after.filter(c=>live.has(c.id)).length,after:after.length};
    check('F10 a reset leaves none of the old placement',live.size>0&&after.every(c=>!live.has(c.id)),report.lifecycle.reset);
    room.bots?.dispose();restored.bots?.dispose();
}

// ---- B: a paper follower from sampled spawns to the real case, using only papers it can see ----
{
    const stride=Math.max(1,Math.floor(spawns.length/Number(values.spawns))),runs=[],how={};let room,see;
    const SPEED=14/60;
    const walk=(f,route,until)=>{ // along `route` at running speed, one simulation step at a time; true when `until()` holds
        for(let i=1;i<route.length;i++){
            const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(dist(a,b)/SPEED));
            for(let s=1;s<=n;s++){const u=s/n,yaw=Math.atan2(b.x-a.x,b.z-a.z);
                Object.assign(f,{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,meshQx:0,meshQz:0,meshQy:Math.sin(yaw/2),meshQw:Math.cos(yaw/2)});
                if(s%2===0){room.clues=tick(room);if(until())return true;}}
        }return false;
    };
    const routeTo=(from,to)=>{const r=nav.paperRouteSteps(from,to);let s;do{s=r.next();}while(!s.done);return s.value;};
    for(let n=0,i=0;i<spawns.length;i+=stride,n++){
        if(values.only!==undefined&&i!==Number(values.only))continue;
        // Each sample in its own room on its own random stream and clock, so `--only` reproduces one exactly.
        seed=(2383011301+i*7919)|0;simClock=EPOCH+i*3600000;
        room=makeRoom([],0);see=sight(room.sim.world);
        room.sim.reset();
        const spawn={...spawns[i],y:0},yaw=n%2?0:((n*2.399)%(2*Math.PI)),id=`follower-${n}`;
        // The authority spawns a rat facing +z; the client's own facing arrives one way later (about 200 ms here).
        const f=R.createPlayer(id,id,R.DEFAULT_APPEARANCE,spawn);room.players.set(id,f);
        for(let k=0;k<15;k++){if(k===6)Object.assign(f,{meshQy:Math.sin(yaw/2),meshQw:Math.cos(yaw/2)});room.clues=tick(room);}
        // In the opening view: the shoulder camera sits about 5.7 behind and 5.4 above the rat (SHOULDER); a sheet within
        // 40° of its view axis, within 14 units of the rat and in the camera's sight.
        const facing={x:Math.sin(yaw),z:Math.cos(yaw)},cam=camera(see,f,facing);
        const inView=room.clues.filter(c=>{const d=flat(cam,c.p);return flat(f,c.p)<14&&((c.p.x-cam.x)*facing.x+(c.p.z-cam.z)*facing.z)/d>Math.cos(40*Math.PI/180)&&see(cam,{...c.p,y:c.p.y+.15});});
        const run={spawn:i,yaw:+yaw.toFixed(2),firstLead:inView.length?+Math.min(...inView.map(c=>flat(f,c.p))).toFixed(1):null,followed:0,seconds:0,ok:false};
        if(!inView.length)run.noLead={f:{x:f.x,y:f.y,z:f.z},near:room.clues.filter(c=>flat(f,c.p)<20).map(c=>({p:c.p,d:+flat(f,c.p).toFixed(1),seen:see(eye(f),{...c.p,y:c.p.y+.15}),ahead:+(((c.p.x-f.x)*facing.x+(c.p.z-f.z)*facing.z)/Math.max(.01,flat(f,c.p))).toFixed(2)})),events:room.events.slice(-4)};
        const start=room.now,visited=new Set(),read=[],caseAt=()=>room.state.case;
        const got=()=>caseAt().owner===id;
        while(room.now-start<150000&&!got()){
            const c=caseAt();
            // The case in plain sight: a player simply runs to it.
            if(!c.owner&&dist(f,c.p)<30&&see(eye(f),c.p)){const r=routeTo(f,c.p);if(!r.length){run.noRoute=true;break;}walk(f,r,got);for(let k=0;k<30&&!got();k++)room.clues=tick(room);break;}
            for(const c of room.clues)if(dist(f,c.p)<3&&!visited.has(c.id)){visited.add(c.id);read.push(c.p);}
            let next;
            const fresh=()=>visibleFrom(see,f,room.clues).filter(c=>!visited.has(c.id)).sort((a,b)=>dist(f,a.p)-dist(f,b.p))[0];
            // Nothing new in sight: a player looks round a moment (papers may still be blowing in), then steps back onto
            // the papers just read and looks again from each.
            for(let wait=0;wait<12&&!next;wait++){next=fresh();if(!next){for(let k=0;k<8;k++)room.clues=tick(room);run.waited=(run.waited??0)+.25;}}
            // The front of the trail where it first stopped reading (diagnostics for a failure).
            if(!next&&!run.stuck){const path=room.sim.clues?.paths?.get?.(id);run.stuck={f:{x:+f.x.toFixed(1),y:+f.y.toFixed(1),z:+f.z.toFixed(1)},t:+((room.now-start)/1000).toFixed(1),
                ahead:room.clues.filter(c=>!visited.has(c.id)&&dist(f,c.p)<70).map(c=>({id:c.id,d:+dist(f,c.p).toFixed(1),p:c.p,from:room.clues.filter(v=>visited.has(v.id)&&dist(v.p,c.p)<65&&see(eye(v.p),{...c.p,y:c.p.y+.15})).map(v=>v.id),
                    group:(()=>{const g=[...(room.sim.clues?.groups?.values?.()??[])].find(g=>g.ids?.includes(c.id));return g&&{id:g.id,anchor:g.anchor,how:g.how};})()})),
                last:read.slice(-3),path:path?.anchors&&{progress:path.progress,here:path.dist[path.progress],anchors:path.anchors.filter(a=>Math.abs(path.dist[a.i]-path.dist[path.progress])<90).map(a=>({kind:a.kind,d:+path.dist[a.i].toFixed(1),group:a.group,at:path.points[a.i]}))}};}
            // Back over the papers read last, in the order read, looking again from each.
            let back=0;
            for(let k=read.length-1;k>=0&&!next&&back<60;k--){const r=routeTo(f,read[k]);if(!r.length)continue;back+=dist(f,read[k]);walk(f,[...r,{x:read[k].x,y:read[k].y-.018,z:read[k].z}],()=>false);next=fresh();run.stepped=(run.stepped??0)+1;}
            if(!next){
                run.lost=true;
                // Where and why: the follower, the case, the sheets around it and the authority's reading of its route.
                const path=room.sim.clues?.paths?.get?.(id),here=path?.dist?.[path.progress];
                run.where={f:{x:+f.x.toFixed(1),y:+f.y.toFixed(1),z:+f.z.toFixed(1)},case:room.state.case.p,published:room.clues.length,
                    near:room.clues.filter(c=>dist(f,c.p)<60).map(c=>({id:c.id,d:+dist(f,c.p).toFixed(1),seen:see(eye(f),{...c.p,y:c.p.y+.15}),visited:visited.has(c.id),p:c.p,
                        from:visited.has(c.id)?undefined:room.clues.filter(v=>visited.has(v.id)&&dist(v.p,c.p)<65&&see(eye(v.p),{...c.p,y:c.p.y+.15})).map(v=>v.id),
                        group:values.only===undefined?undefined:(()=>{const g=[...(room.sim.clues?.groups?.values?.()??[])].find(g=>g.ids?.includes(c.id));return g&&{id:g.id,anchor:g.anchor,ids:g.ids,how:g.how};})()})),
                    path:path?.anchors&&{points:path.points.length,progress:path.progress,here,total:path.dist.at(-1),scan:path.scan,
                        anchors:path.anchors.filter(a=>Math.abs(path.dist[a.i]-here)<80).map(a=>({i:a.i,kind:a.kind,d:+path.dist[a.i].toFixed(1),group:a.group,at:path.points[a.i]}))}};
                break;
            }
            const r=routeTo(f,next.p);if(!r.length){visited.add(next.id);continue;}
            // Up to the paper, as a player reading it would.
            (run.leadDistances??=[]).push(+dist(f,next.p).toFixed(1));
            run.followed++;walk(f,[...r,{x:next.p.x,y:next.p.y-.018,z:next.p.z}],()=>got()||flat(f,next.p)<.3);if(!visited.has(next.id)){visited.add(next.id);read.push({...next.p});}
        }
        run.ok=got();run.seconds=+((room.now-start)/1000).toFixed(1);runs.push(run);
        for(const g of room.sim.clues?.groups?.values?.()??[])if(g.how){const k=g.how.replace(/[+-]\d+$/,'');how[k]=(how[k]??0)+1;}
    }
    const ok=runs.filter(r=>r.ok);
    report.follower={placement:how,runs:runs.length,reachedCase:ok.length,firstLeadInView:runs.filter(r=>r.firstLead!==null).length,firstLead:stats(runs.filter(r=>r.firstLead!==null).map(r=>r.firstLead)),
        seconds:stats(ok.map(r=>r.seconds)),leadDistance:stats(runs.flatMap(r=>r.leadDistances??[])),sheetsFollowed:stats(ok.map(r=>r.followed)),failures:runs.filter(r=>!r.ok).slice(0,12),withoutLead:runs.filter(r=>r.noLead).map(r=>({spawn:r.spawn,yaw:r.yaw,...r.noLead}))};
    check('F7 every sampled spawn shows a lead in its view within 14 units',report.follower.firstLeadInView===runs.length,runs.filter(r=>r.firstLead===null).map(r=>r.spawn));
    check('F8 the papers followed are near reads: median next paper within 25 units',(report.follower.leadDistance.median??99)<=25,report.follower.leadDistance);
    check('F8 a sight-only follower reaches the real case from ≥ 95% of sampled spawns',ok.length>=runs.length*.95,{reached:ok.length,of:runs.length});
}

// ---- C: walking out past the starter and back (one rat alone) ----
if(values.only===undefined){
    const room=makeRoom(['human-pacer'],0),f=room.players.get('human-pacer'),ledger=new Ledger(),home={x:f.x,y:f.y,z:f.z};
    for(let k=0;k<30;k++)ledger.see(tick(room),room.now,[]);
    const starters=new Set([...ledger.live.values()].filter(({c})=>flat(c.p,home)<8).map(({c})=>c.id));
    let away;for(let a=0;a<16&&!away;a++){const t={x:home.x+Math.cos(a*Math.PI/8)*13,y:home.y,z:home.z+Math.sin(a*Math.PI/8)*13};const r=nav.paperRouteSteps(home,t);let s;do{s=r.next();}while(!s.done);if(s.value.length>3&&flat(s.value.at(-1),t)<3)away=s.value;}
    let starterDrops=0;const dropped=[];
    for(let lap=0;lap<3&&away;lap++)for(const leg of [away,[...away].reverse()])for(const p of leg)for(let k=0;k<4;k++){
        Object.assign(f,{x:p.x,y:p.y,z:p.z});const before=new Set(ledger.live.keys());ledger.see(tick(room),room.now,[]);
        for(const id of starters)if(before.has(id)&&!ledger.live.has(id)){starterDrops++;dropped.push({id,t:room.now,f:{x:f.x,z:f.z},hp:f.hp,case:room.state.case.owner??'loose',events:room.events.filter(e=>Math.abs(e.t-room.now)<200).map(e=>e.what)});}
    }
    report.lifecycle.starterBoundary={starters:starters.size,laps:away?3:0,outTo:away?+flat(away.at(-1),home).toFixed(1):null,starterDrops,dropped,comebacks:ledger.violations.comeback.length,replaced:ledger.replacements().length};
    check('F6 pacing 13 units out and back keeps the starter (no drop, no comeback)',!!away&&starters.size>0&&starterDrops===0&&ledger.violations.comeback.length===0,report.lifecycle.starterBoundary);
    // Then out past the release distance (22) and back after the grace: the starter goes once and is never laid again.
    let far;for(let a=0;a<16&&!far;a++){const t={x:home.x+Math.cos(a*Math.PI/8)*32,y:home.y,z:home.z+Math.sin(a*Math.PI/8)*32};const r=nav.paperRouteSteps(home,t);let s;do{s=r.next();}while(!s.done);if(s.value.length>3&&flat(s.value.at(-1),home)>26)far=s.value;}
    let reached=0;
    if(far){for(const p of far)for(let k=0;k<4;k++){Object.assign(f,{x:p.x,y:p.y,z:p.z});reached=Math.max(reached,flat(f,home));ledger.see(tick(room),room.now,[]);}
        for(let k=0;k<30*13;k++)ledger.see(tick(room),room.now,[]);
        for(const p of [...far].reverse())for(let k=0;k<4;k++){Object.assign(f,{x:p.x,y:p.y,z:p.z});ledger.see(tick(room),room.now,[]);}
        for(let k=0;k<60;k++)ledger.see(tick(room),room.now,[]);}
    const back=[...ledger.live.values()].filter(({c})=>flat(c.p,home)<8&&!starters.has(c.id)).length;
    report.lifecycle.starterRelease={reached:+reached.toFixed(1),startersLeft:[...starters].filter(id=>ledger.live.has(id)).length,comebacks:ledger.violations.comeback.length,newSpillAtHome:back,events:room.events.filter(e=>e.what==='lead').length};
    check('F6 walking past the release distance retires the starter once; it never comes back or is laid again',
        !!far&&reached>22&&report.lifecycle.starterRelease.startersLeft===0&&ledger.violations.comeback.length===0&&report.lifecycle.starterRelease.events===1,report.lifecycle.starterRelease);
}

// ---- Routes: street to sewer both ways, launcher roofs, and every spawn's supported starter with real sight ----
if(values.only===undefined){
    const world=makeRoom([],0).sim.world,see=sight(world),clear=(a,b)=>see({x:a.x,y:a.y+.8,z:a.z},{x:b.x,y:b.y+.8,z:b.z});
    const sewer=[];
    for(const [from,to] of [[{x:90,y:0,z:-150},{x:-4.277,y:-7,z:-3.52}],[{x:-4,y:-7,z:-4},{x:90,y:0,z:-150}]]){
        const r=nav.paperRouteSteps(from,to);let s;do{s=r.next();}while(!s.done);sewer.push({from,to,points:s.value.length});
        const bad=s.value.slice(1).filter((b,i)=>!(nav.walkable(s.value[i],b)||s.value[i].launch||s.value[i].drop)).length;
        check('street/sewer route exists, every segment walkable',s.value.length>0&&bad===0,{from,to,bad});
    }
    const roofs=R.BOT_LAUNCH_LINKS.map(link=>{const r=nav.paperRouteSteps({...spawns[10],y:0},link.landing);let s;do{s=r.next();}while(!s.done);
        const invented=s.value.slice(1).filter((b,i)=>flat(s.value[i],b)>4&&!s.value[i].launch&&!s.value[i].drop).length;return {machine:link.machine.id,points:s.value.length,invented};});
    check('every launcher roof has a route, with no invented segment',roofs.every(r=>r.points>0&&!r.invented),roofs.filter(r=>!r.points||r.invented));
    const facings=[{x:0,y:0,z:1},{x:1,y:0,z:0},{x:0,y:0,z:-1},{x:-1,y:0,z:0}];
    const missing=spawns.flatMap(p=>facings.filter(f=>!nav.paperLead({...p,y:0},f,clear).length).map(f=>({...p,f})));
    report.routes={sewer,roofs,spawns:spawns.length,spawnsWithoutStarter:missing.length,examples:missing.slice(0,5)};
    check('every spawn has a supported starter in its facing sector at four facings (real sight)',missing.length===0,{missing:missing.length,examples:missing.slice(0,5)});
}

await new Promise(r=>trace.end(r));
report.passed=report.checks.every(c=>c.pass);
if(!measureOnly&&!report.passed)process.exitCode=1;
writeFileSync(resolve(out,`papers-${label}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({label,passed:report.passed,checks:report.checks.map(c=>`${c.pass?'PASS':'FAIL'} ${c.check}`),room:report.room,follower:{...report.follower,failures:undefined}},null,2));
