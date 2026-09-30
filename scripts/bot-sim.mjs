// Headless seeded bot rooms for motor iterations: the real ServerBotController and ChaosSimulation on the
// staging world, nine server bots cast 80/10/10 from real roster names, 3 s respawns, stuck rescues handled
// as GameRoom.recoverManagedBot does, and the next assignment as soon as one is won. Catches stuck and stall
// regressions and reports the gate's movement and case numbers, and the bots' fight motion measured as the
// humans' is: fight windows kept as CityRecorder keeps them, read by scripts/lib/fight-motion.mjs.
// Not a capacity or balance claim: no humans, no network.
//
// usage: node scripts/bot-sim.mjs [--assignment=all|<id>] [--seeds=3] [--first-seed=1] [--minutes=4] [--jobs=4] [--ref=<git rev>] [--json]
//   --assignment  the assignment each room starts on; later ones follow the room's rotation (default: all four)
//   --seeds       rooms per starting assignment, seeds first..first+N-1 (a second set of seeds is a fresh sample of the
//                 same build: fight measures and guard rails move by chance between sets)
//   --ref         build src/ from that commit instead of the working tree (A/B against older bots)
import {build} from 'esbuild';
import {execFileSync,fork} from 'node:child_process';
import {mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {accumulate,empty,features,merge} from './lib/fight-motion.mjs';

const WORLD=2383011301,BOTS=9,DT=1/60;
/** Distance bands (units) to the nearest other rat when a shot leaves, and between shooter and victim on a hit. */
const BANDS=[6,12,25,50,Infinity],BAND_NAMES=['<6','6-12','12-25','25-50','50+'];
const band=d=>BANDS.findIndex(limit=>d<limit);
/** The city map's shot targets (CityRecorder.shotTargets): the rat in sight (150 units, in front, a clear line) nearest the
 * shot's line, banded as the production accuracy table is; a hit is banded by the shooter's distance at impact. */
const SIGHT=150,EYE=1.5,CHEST=1.3,AIM_BANDS=[5,10,15,20,30,45,70,Infinity],AIM_BAND_NAMES=['0-5','5-10','10-15','15-20','20-30','30-45','45-70','70+'];
const aimBand=d=>AIM_BANDS.findIndex(limit=>d<limit);
/** The humans in production (motor-compare --mind=3 --since=2026-09-30T06:46:00Z, 27.6 fight minutes; flick measures
 * recounted on the same mirror once every flick counted, 30 September), printed beside the bots'. */
const HUMANS={'move.speedMedian':16.5,'move.speedP90':21.9,'move.stopShare':.034,'move.directionChangesPerMovingMin':30.4,
    'jump.jumpsPerFightMin':14.8,'jump.airShare':.271,
    'aim.turnRateMedian':.152,'aim.turnRateP90':1.62,'aim.stillAimShare':.442,'aim.flicksPerFightMin':11.76,'aim.shotErrorMedian':.13,'aim.leadAheadShare':.29,
    'moveAim.decoupledShare':.426,'moveAim.backpedalShare':.218,'moveAim.offAngleMedian':.836,'moveJump.jumpsWhileMovingShare':.99,'moveJump.strafeJumpShare':.57,
    'jumpAim.airShotShare':.286,'jumpAim.airTurnRateMedian':.227,'jumpAim.groundTurnRateMedian':.136,'jumpAim.airShotErrorMedian':.154,'jumpAim.groundShotErrorMedian':.12,
    'all.airborneDecoupledShareOfMovingAir':.478,'all.airborneDecoupledPerFightMin':7.6,
    'inputs.alone.forwardShare':.557,'inputs.alone.backShare':.231,'inputs.alone.strafeShare':.511,'inputs.alone.releasedShare':.049,
    'inputs.alone.strafeHoldMedianMs':314,'inputs.alone.strafeFlipsPerMin':21.8,'inputs.alone.jumpPressesPerMin':20,'inputs.alone.triggerPullsPerMin':261,
    'inputs.alone.mouseStillShare':.442,'inputs.alone.flickSizeMedian':1.08,'inputs.alone.flickSizeP90':2,
    'inputs.pairs.jumpsStrafingShare':.741,'inputs.pairs.pullsNearJumpShare':.104,'inputs.pairs.pullsStrafingShare':.584,'inputs.pairs.pullsAfterFlickShare':.058,
    'inputs.pairs.flickToPullMedianMs':200,'inputs.all.strafeJumpPullsPerMin':27.5,'inputs.all.strafeJumpPullShare':.105,
    blindShotShare:.4,botHitRate:'5%','byAimDistance.0-5':.25,'byAimDistance.5-10':.09,'byAimDistance.10-15':.1,'byAimDistance.15-20':.08,
    'byAimDistance.20-30':.1,'byAimDistance.30-45':.1,'byAimDistance.45-70':.1,'byAimDistance.70+':.05};
const {values}=parseArgs({options:{assignment:{type:'string',default:'all'},seeds:{type:'string',default:'3'},'first-seed':{type:'string',default:'1'},minutes:{type:'string',default:'4'},
    jobs:{type:'string',default:'4'},ref:{type:'string'},json:{type:'boolean',default:false},child:{type:'string'},runtime:{type:'string'}}});
const root=process.cwd();

if(values.child){
    // One room, in its own process: its own seeded Math.random and clock.
    const {seed,assignment,minutes}=JSON.parse(values.child);
    // Exit only once the (large) result has crossed the IPC channel.
    process.send(await room(seed,assignment,minutes,values.runtime),()=>process.exit(0));
    await new Promise(()=>{});
}

const ref=values.ref&&execFileSync('git',['rev-parse',values.ref],{encoding:'utf8'}).trim();
const out=resolve(root,'test-results/bot-sim');await mkdir(out,{recursive:true});
const runtime=resolve(out,`runtime-${ref?ref.slice(0,12):'worktree'}.mjs`);
// An older commit's src/ is exported whole, so files it had and the worktree lacks still resolve.
const tree=ref?resolve(out,`src-${ref.slice(0,12)}`):root;
if(ref){await rm(tree,{recursive:true,force:true});await mkdir(tree,{recursive:true});execFileSync('sh',['-c',`git archive ${ref} src | tar -x -C ${tree}`]);}
await build({stdin:{contents:[
    "export {ServerBotController} from './src/worker/ServerBotController.ts';",
    "export {ChaosSimulation} from './src/shared/ChaosSimulation.ts';",
    "export {createPlayer,spawnForWorld,respawnPlayer,applyHit} from './src/worker/gameState.ts';",
    "export {GRAYBOX_VERSION} from './src/shared/grayboxLayout.ts';",
    "export {createAssignment,nextAssignment,ASSIGNMENT_IDS} from './src/shared/assignments.ts';",
    "export {botPersonality,createRoundBotRoster} from './src/shared/botRoster.ts';",
    "export {cityPlaces} from './src/shared/city/places.ts';",
    "export {SpatialRayQuery} from './src/shared/SpatialRayQuery.ts';",
    "export {Vec3} from 'cannon-es';",
    // The worktree's controls tally, even for an older --ref (whose bots hand no controls, so its input measures are empty).
    `export {ControlTally} from ${JSON.stringify(resolve(root,'src/shared/rat/controlTally.ts'))};`,
].join(''),resolveDir:tree,loader:'ts'},outfile:runtime,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'error',
    define:{'performance.now':'__simClock'}});
const {ASSIGNMENT_IDS}=await import(pathToFileURL(runtime));
const starts=values.assignment==='all'?ASSIGNMENT_IDS:[values.assignment];
if(starts.some(id=>!ASSIGNMENT_IDS.includes(id)))throw Error(`--assignment must be all or one of ${ASSIGNMENT_IDS.join(', ')}`);
const runs=starts.flatMap(assignment=>Array.from({length:Number(values.seeds)},(_,i)=>({seed:Number(values['first-seed'])+i,assignment,minutes:Number(values.minutes)})));
const started=Date.now(),results=[];
await Promise.all(Array.from({length:Math.min(Number(values.jobs),runs.length)},async()=>{
    for(let run;(run=runs.shift());){
        results.push(await new Promise((done,fail)=>{
            const child=fork(fileURLToPath(import.meta.url),[`--child=${JSON.stringify(run)}`,`--runtime=${runtime}`],{stdio:['ignore','inherit','inherit','ipc']});
            child.once('message',done);child.once('exit',code=>code&&fail(Error(`room ${JSON.stringify(run)} exited ${code}`)));
        }));
    }
}));
report(results,(Date.now()-started)/1000);

/** The bots' fight motion, pooled over every room, in motor-compare's measures. */
function fightMotion(rooms){
    const g=rooms.reduce((all,r)=>merge(all,r.fight),empty()),r3=x=>x===null?null:Math.round(x*1000)/1000;
    return {fightMinutes:r3(g.fightS/60),...Object.fromEntries(Object.entries(features(g)).map(([family,measures])=>
        [family,Object.fromEntries(Object.entries(measures).map(([name,v])=>[name,r3(v)]))]))};
}
/** How far the bots are from the humans, as motor-compare scores it (0 the same, 1 nothing alike): the mean gap per
 * fight family, `inputs` the mean of its three parts, `overall` the mean of the families; `accuracy` (not in the
 * overall) is the mean over the blind shot share and the hit rate by aim distance. */
function gaps(summary){
    const gap=(h,b)=>b===null||b===undefined?null:Math.abs(h-b)/Math.max(Math.abs(h),Math.abs(b),1e-9),r3=x=>Math.round(x*1000)/1000;
    const mean=list=>{const kept=list.filter(d=>d!==null);return kept.length?r3(kept.reduce((a,b)=>a+b,0)/kept.length):null;};
    const families={};
    for(const [family,measures] of Object.entries(summary.fight))if(family!=='fightMinutes'){
        const score=mean(Object.entries(measures).filter(([name])=>`${family}.${name}` in HUMANS).map(([name,v])=>gap(HUMANS[`${family}.${name}`],v)));
        if(score!==null)families[family]=score;
    }
    const accuracy=mean([gap(HUMANS.blindShotShare,summary.blindShotShare),
        ...Object.entries(summary.byAimDistance).map(([name,v])=>gap(HUMANS[`byAimDistance.${name}`],v.hitRate))]);
    return {...families,inputs:mean(['inputs.alone','inputs.pairs','inputs.all'].map(k=>families[k]??null)),overall:mean(Object.values(families)),accuracy};
}
function report(rooms,wall){
    const sum=key=>rooms.reduce((a,r)=>a+r[key],0),roomHours=sum('ms')/3600000,botHours=roomHours*BOTS;
    const per=(n,h)=>Math.round(n/h*100)/100;
    const deliveries={},hours={};
    for(const r of rooms)for(const [id,n] of Object.entries(r.deliveries))deliveries[id]=(deliveries[id]??0)+n;
    for(const r of rooms)for(const [id,ms] of Object.entries(r.assignmentMs))hours[id]=(hours[id]??0)+ms/3600000;
    const deathPlaces=new Set(rooms.flatMap(r=>r.deathPlaces)),rescuePlaces={};
    for(const r of rooms)for(const place of r.rescuePlaces)rescuePlaces[place]=(rescuePlaces[place]??0)+1;
    const summary={rooms:rooms.length,roomHours:Math.round(roomHours*1000)/1000,wallSeconds:Math.round(wall),
        rescuesPerBotHour:per(sum('rescues'),botHours),caseChangesPerRoomHour:per(sum('caseChanges'),roomHours),
        completionsPerRoomHour:per(sum('completions'),roomHours),
        deliveriesPerRoomHour:Object.fromEntries(Object.entries(deliveries).map(([id,n])=>[id,per(n,hours[id])])),
        killsPerBotHour:per(sum('kills'),botHours),deaths:sum('deaths'),deathPlaces:deathPlaces.size,
        botShots:sum('shots'),botHitRate:Math.round(sum('hits')/Math.max(1,sum('shots'))*1000)/10+'%',
        // As the production accuracy table: shots with no rat in sight, and hits per shot by the distance to the rat in sight nearest the shot's line.
        blindShotShare:Math.round(sum('blindShots')/Math.max(1,sum('shots'))*1000)/1000,
        byAimDistance:Object.fromEntries(AIM_BAND_NAMES.map((name,i)=>{const shots=rooms.reduce((a,r)=>a+r.aimShots[i],0),hits=rooms.reduce((a,r)=>a+r.aimHits[i],0);
            return [name,{hitRate:Math.round(hits/Math.max(1,shots)*1000)/1000,shots}];})),
        fight:fightMotion(rooms),
        gaps:null,
        // Per band of the nearest rival: share of shots, and hits landing at that range per shot fired there.
        byRange:Object.fromEntries(BAND_NAMES.map((name,i)=>{const shots=rooms.reduce((a,r)=>a+r.shotsByRange[i],0),hits=rooms.reduce((a,r)=>a+r.hitsByRange[i],0);
            return [name,`${Math.round(shots/Math.max(1,sum('shots'))*100)}% of shots, ${Math.round(hits/Math.max(1,shots)*1000)/10}% hit`];})),
        longestStillCaseSeconds:Math.round(Math.max(...rooms.map(r=>r.longestStill))/100)/10,
        longestStillCase:rooms.reduce((a,r)=>r.longestStill>a.longestStill?r:a).stillAt,
        rescuePlaces:Object.entries(rescuePlaces).sort((a,b)=>b[1]-a[1]).slice(0,8)};
    summary.gaps=gaps(summary);
    if(values.json)console.log(JSON.stringify({summary,rooms:rooms.map(({fight,...r})=>r)},null,1));
    else for(const [key,value] of Object.entries(summary)){
        if(key==='byAimDistance'){
            console.log(`${key.padEnd(24)} bot hit rate (shots), then the humans'`);
            for(const [name,v] of Object.entries(value))console.log(`  ${name.padEnd(40)} ${String(v.hitRate).padStart(8)} (${v.shots})  ${HUMANS[`${key}.${name}`]}`);
            continue;
        }
        if(key!=='fight'){console.log(`${key.padEnd(24)} ${typeof value==='object'?JSON.stringify(value):value}${key in HUMANS?`  (humans ${HUMANS[key]})`:''}`);continue;}
        console.log(`${key.padEnd(24)} ${value.fightMinutes} bot fight minutes (bot, then the humans in production)`);
        for(const [family,measures] of Object.entries(value))if(family!=='fightMinutes')for(const [name,v] of Object.entries(measures)){
            const measure=`${family}.${name}`;
            console.log(`  ${measure.padEnd(40)} ${String(v).padStart(8)}${measure in HUMANS?`  ${String(HUMANS[measure]).padStart(8)}`:''}`);
        }
    }
}

/** A room's fight windows, kept as CityRecorder keeps them: 5 Hz `[t, x, y, z, yaw, hp]`, 20 Hz `[t, yaw, pitch]` and 20 Hz
 * controls `[t, f, r, jumps, fx, rx]` rings, windows from 3 s before to 2 s after each hit (merged when they overlap),
 * launcher flights and Hot Pursuit left out. */
function fightRecorder(ids,ControlTally){
    const RING=30,AIM_RING=160,AIM_FRESH_MS=300,CONTROLS_FRESH_MS=1500,KEEP_MS=10_000;
    const r1=v=>Math.round(v*10)/10,r2=v=>Math.round(v*100)/100,r3=v=>Math.round(v*1000)/1000,yaw=p=>2*Math.atan2(p.meshQy,p.meshQw);
    const per=()=>new Map(ids.map(id=>[id,[]]));
    const rings=per(),aimRings=per(),controlRings=per(),shots=per(),skips=per(),looks=new Map(),flights=new Map(),hustle=new Map(),seenLaunches=new Set(),windows=[];
    const tallies=new Map(ids.map(id=>[id,{tally:new ControlTally(),at:-Infinity}]));
    const acc=empty();
    let sampleAt=-Infinity,aimAt=-Infinity;
    return {acc,
        /** The unit look vector a bot sent with its movement, if any. */
        look(id,look,now){if(look)looks.set(id,{x:look.x,y:look.y,z:look.z,at:now});},
        /** The controls a bot pressed this step (CityRecorder.botControls). */
        controls(id,controls,now){const t=tallies.get(id);if(t){t.tally.note(controls);t.at=now;}},
        shot(id,now){shots.get(id)?.push({t:now,sample:1});},
        hit(victim,owner,now){
            if(!rings.has(victim))return;
            const hitIds=[victim,...(owner&&owner!==victim&&rings.has(owner)?[owner]:[])];
            const open=windows.find(w=>hitIds.some(id=>w.ids.has(id))&&now<=w.until);
            if(open){for(const id of hitIds)open.ids.add(id);open.until=now+2000;return;}
            windows.push({ids:new Set(hitIds),from:now-3000,until:now+2000});
        },
        tick(now,players,snap){
            for(const launch of snap.pressure?.launches??[]){
                if(seenLaunches.has(launch.id))continue;
                seenLaunches.add(launch.id);if(seenLaunches.size>256)seenLaunches.delete(seenLaunches.values().next().value);
                if(rings.has(launch.playerId))flights.set(launch.playerId,launch.at);
            }
            for(const id of ids){
                const until=snap.buffs?.[id]?.hustleUntil,open=hustle.get(id);
                if(until>snap.time){if(open)open[1]=until;else{const span=[now,until];skips.get(id).push(span);hustle.set(id,span);}}
                else if(open){open[1]=Math.min(open[1],now);hustle.delete(id);}
            }
            // Float ticks: a hair of slack keeps the cadence at 12 and 3 ticks.
            if(now>=aimAt-1e-6){
                aimAt=now+50;
                for(const [id,p] of players){
                    const t=tallies.get(id);
                    if(p.hp<=0){t?.tally.clear();continue;}
                    const ring=aimRings.get(id),l=looks.get(id),fresh=!!l&&now-l.at<=AIM_FRESH_MS;
                    if(ring.length>=AIM_RING)ring.shift();
                    ring.push([now,r3(fresh?Math.atan2(l.x,l.z):yaw(p)),fresh?r3(Math.asin(Math.max(-1,Math.min(1,l.y)))):null]);
                    if(!t)continue;
                    if(now-t.at<=CONTROLS_FRESH_MS){
                        const pressed=controlRings.get(id),k=t.tally;
                        if(pressed.length>=AIM_RING)pressed.shift();
                        pressed.push([now,k.f,k.r,k.j,k.fx,k.rx]);
                    }
                    t.tally.clear();
                }
            }
            if(now<sampleAt-1e-6)return;
            sampleAt=now+200;
            for(const [id,p] of players){
                const ring=rings.get(id);
                if(ring.length>=RING)ring.shift();
                ring.push([now,r1(p.x),r1(p.y),r1(p.z),r2(yaw(p)),p.hp]);
                // A launched rat has landed once it stops moving up or down, half a second on (CityRecorder.sample).
                const start=flights.get(id);
                if(start!==undefined){
                    const prev=ring[ring.length-2],vy=prev?(p.y-prev[2])/((now-prev[0])/1000):Infinity;
                    if(p.hp<=0||now-start>15_000){skips.get(id).push([start,start+15_000]);flights.delete(id);}
                    else if(now-start>500&&Math.abs(vy)<.4){skips.get(id).push([start,now+300]);flights.delete(id);}
                }
                const s=shots.get(id),k=skips.get(id);
                while(s.length&&s[0].t<now-KEEP_MS)s.shift();
                for(let i=k.length-1;i>=0;i--)if(k[i][1]<now-KEEP_MS&&k[i]!==hustle.get(id))k.splice(i,1);
            }
            for(let i=windows.length-1;i>=0;i--){
                const w=windows[i];
                if(now<w.until)continue;
                windows.splice(i,1);
                const window={from:w.from,samples:{},aim:{},controls:{}};
                for(const id of w.ids){
                    window.samples[id]=rings.get(id).filter(s=>s[0]>=w.from&&s[0]<=w.until).map(([t,...rest])=>[t-w.from,...rest]);
                    window.aim[id]=aimRings.get(id).filter(s=>s[0]>=w.from&&s[0]<=w.until).map(([t,...rest])=>[t-w.from,...rest]);
                    const pressed=controlRings.get(id).filter(s=>s[0]>=w.from&&s[0]<=w.until).map(([t,...rest])=>[t-w.from,...rest]);
                    if(pressed.length)window.controls[id]=pressed;
                }
                // A flight still in the air runs past the window's end.
                for(const id of w.ids)accumulate(acc,window,id,{skips:flights.has(id)?[...skips.get(id),[flights.get(id),Infinity]]:skips.get(id),shots:shots.get(id)});
            }
        }};
}

async function room(seed,start,minutes,runtimePath){
    // Deterministic randomness and clock, installed before the runtime module captures them.
    let s=(seed*2654435761)>>>0;
    Math.random=()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    let clock=1_800_000_000_000,uuid=0;
    globalThis.__simClock=()=>clock;Date.now=()=>clock;
    globalThis.crypto.randomUUID=()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`;
    const m=await import(pathToFileURL(runtimePath));
    const spec={seed:WORLD,version:m.GRAYBOX_VERSION},places=m.cityPlaces();
    // Real roster names in the 80/10/10 mix: seven tryhards, a maverick and a gremlin.
    const want={tryhard:7,maverick:1,gremlin:1},names=[];
    for(let i=0;names.length<BOTS&&i<500;i++)for(const {name} of m.createRoundBotRoster([],Math.random)){
        const p=m.botPersonality(name);if(want[p]>0&&!names.includes(name)){want[p]--;names.push(name);}
    }
    const ids=names.map((_,i)=>`rd-ai-${String(i).padStart(2,'0')}`),personality=new Map(ids.map((id,i)=>[id,m.botPersonality(names[i])]));
    const players=new Map();
    for(const [i,id] of ids.entries())players.set(id,m.createPlayer(id,names[i],{hatType:'fedora',hatColor:1,furColor:2,coatColor:3},m.spawnForWorld(spec,Math.random,players.values())));
    const stats={seed,start,ms:0,rescues:0,rescuePlaces:[],rescueNotes:[],shotsByRange:BANDS.map(()=>0),hitsByRange:BANDS.map(()=>0),caseChanges:0,completions:0,deliveries:{},assignmentMs:{},kills:0,deaths:0,deathPlaces:[],shots:0,hits:0,longestStill:0,
        blindShots:0,aimShots:AIM_BANDS.map(()=>0),aimHits:AIM_BANDS.map(()=>0)};
    const fight=fightRecorder(ids,m.ControlTally);
    let sim;
    const onHit=hit=>{
        const victim=players.get(hit.victim);if(!victim||victim.hp<=0)return;
        const result=m.applyHit(players,hit.owner,hit.victim,hit.damage,!!hit.incoming,hit.owner&&sim.isCaseHolder(hit.owner)?hit.owner:null,!!sim.assignmentState,hit.explosive===true);
        if(!result.killed)return;
        victim.respawnAt=clock+3000;stats.deaths++;stats.deathPlaces.push(places.at(victim.x,victim.y,victim.z).id);
        if(hit.owner&&hit.owner!==victim.id)stats.kills++;
        sim.creditCaseKill(hit.owner);
        if(hit.incoming)sim.death(victim,hit.incoming,hit.owner);
    };
    sim=new m.ChaosSimulation(players,onHit,undefined,spec);
    // GameRoom.lineOfSight: the chaos world's solid bodies, the index refreshed at most once a second.
    const sightQuery=new m.SpatialRayQuery(sim.world),sightFrom=new m.Vec3(),sightTo=new m.Vec3();let sightAt=-Infinity;
    const sight=(a,b)=>{if(clock-sightAt>=1000){sightQuery.refresh();sightAt=clock;}sightFrom.set(a.x,a.y,a.z);sightTo.set(b.x,b.y,b.z);return !sightQuery.blocked(sightFrom,sightTo,1);};
    /** CityRecorder.shotTargets' first target: its distance, or undefined with no rat in sight. */
    const aimTarget=(shooter,dir)=>{
        const ex=shooter.x,ey=shooter.y+EYE,ez=shooter.z,l=Math.hypot(dir.x,dir.y,dir.z)||1,near=[];
        for(const o of players.values()){
            if(o.id===shooter.id||o.hp<=0)continue;
            const dx=o.x-ex,dy=o.y+CHEST-ey,dz=o.z-ez,d=Math.hypot(dx,dy,dz);
            if(d<1||d>SIGHT)continue;
            const cos=(dir.x*dx+dir.y*dy+dir.z*dz)/l/d;if(cos>0)near.push({o,d,cos});
        }
        near.sort((a,b)=>b.cos-a.cos);
        return near.find(({o})=>sight({x:ex,y:ey,z:ez},{x:o.x,y:o.y+1,z:o.z}))?.d;
    };
    const rotation={remaining:[],last:start};
    const begin=id=>sim.setAssignment(m.createAssignment(id,clock));
    const shotTimes=new Map(ids.map(id=>[id,[]]));
    const controller=new m.ServerBotController(spec,ids,{
        move:(id,p,facing,at,look)=>{const player=players.get(id);if(!player)return;player.x=p.x;player.y=p.y;player.z=p.z;player.meshQy=Math.sin(facing/2);player.meshQw=Math.cos(facing/2);fight.look(id,look,clock);},
        shoot:(id,origin,direction)=>{
            // GameRoom's per-rat limit: 12 shots a second.
            const times=shotTimes.get(id);while(times.length&&clock-times[0]>=1000)times.shift();
            if(times.length>=12||players.get(id).hp<=0)return;
            times.push(clock);stats.shots++;fight.shot(id,clock);sim.shoot(id,{type:'shoot',shotId:crypto.randomUUID(),origin,direction});
            const shooter=players.get(id);let nearest=Infinity;
            for(const p of players.values())if(p.id!==id&&p.hp>0)nearest=Math.min(nearest,Math.hypot(p.x-shooter.x,p.z-shooter.z));
            stats.shotsByRange[band(nearest)]++;
            const aimed=aimTarget(shooter,direction);
            if(aimed===undefined)stats.blindShots++;else stats.aimShots[aimBand(aimed)]++;
        },
        recover:id=>{
            const player=players.get(id);if(!player||player.hp<=0)return;
            stats.rescues++;stats.rescuePlaces.push(places.at(player.x,player.y,player.z).id);
            // The bot's plan when rescued (private at type level only), for --json readers chasing a pocket.
            const brain=controller.bots?.get(id)?.brain;
            stats.rescueNotes.push({at:Math.round(stats.ms/1000),assignment:sim.assignmentState?.id,place:places.at(player.x,player.y,player.z).id,
                p:[player.x,player.y,player.z].map(v=>Math.round(v*10)/10),mode:brain?.objective,key:brain?.goalKey,stalled:brain?.navigationStalled});
            sim.recoverCarrierCase(id);
            Object.assign(player,m.spawnForWorld(spec,Math.random,players.values(),id,sim.assignmentState));controller.reset(id,player);
        },
        recoverCase:()=>sim.recoverLooseCase(),
        controls:(id,controls)=>fight.controls(id,controls,clock),
    },id=>personality.get(id));
    begin(start);
    let owner=null,serial=0,stillSince=clock;
    const end=clock+minutes*60000;
    while(clock<end){
        clock+=DT*1000;
        for(const [id,player] of players)if(player.hp<=0&&player.respawnAt<=clock){
            m.respawnPlayer(player,m.spawnForWorld(spec,Math.random,players.values(),id,sim.assignmentState,sim.allUnitsTarget));controller.reset(id,player);
        }
        controller.step(DT,clock,players,sim.snapshot(false),true);
        sim.step(DT,clock);
        for(const event of sim.drainShotEvents()){
            if(event.outcome!=='rat-body'&&event.outcome!=='rat-head')continue;
            stats.hits++;fight.hit(event.victimId,event.owner,clock);
            const shooter=players.get(event.owner),victim=players.get(event.victimId);
            if(shooter&&victim){stats.hitsByRange[band(Math.hypot(victim.x-shooter.x,victim.z-shooter.z))]++;stats.aimHits[aimBand(Math.hypot(victim.x-shooter.x,victim.y-shooter.y,victim.z-shooter.z))]++;}
        }
        const snap=sim.snapshot(false),a=sim.assignmentState;
        fight.tick(clock,players,snap);
        if(a){stats.assignmentMs[a.id]=(stats.assignmentMs[a.id]??0)+DT*1000;}
        const c=snap.case;
        if(c.owner!==owner){if(c.owner)stats.caseChanges++;owner=c.owner;stillSince=clock;}
        if(a?.phase!=='active'||c.owner)stillSince=clock;
        if(clock-stillSince>stats.longestStill){stats.longestStill=clock-stillSince;stats.stillAt=`${a?.id} seed ${seed} at ${places.at(c.p.x,c.p.y,c.p.z).id}`;}
        if(a&&a.deliverySerial!==serial){if(a.deliverySerial>serial)stats.deliveries[a.id]=(stats.deliveries[a.id]??0)+a.deliverySerial-serial;serial=a.deliverySerial;}
        if(a?.result){
            // GameRoom shows the win, then resets the city and starts the next assignment.
            stats.completions++;sim.reset();serial=0;owner=null;
            for(const [id,player] of players){m.respawnPlayer(player,m.spawnForWorld(spec,Math.random,players.values(),id));controller.reset(id,player);}
            begin(m.nextAssignment(rotation,Math.random));
        }
        stats.ms+=DT*1000;
    }
    controller.dispose();
    return {...stats,fight:fight.acc};
}
