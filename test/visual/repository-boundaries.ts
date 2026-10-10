// Browser integration qualification. Failure modes are recorded before extraction in the implementation receipt:
// claim races/rollback, restock/kind replacement, late join/reconnect cleanup, results reset/CONTINUE and replay lifetime.
// Production simulation, views, DOM and recorder run together. No live service, pointer lock or gameplay automation.
import * as THREE from 'three';
import '../../src/style.css';
import '../../src/presentation/dispatchHud.css';
import {createStage} from '../../src/session/createStage';
import {ChaosSimulation} from '../../src/shared/ChaosSimulation';
import {ChaosView} from '../../src/presentation/ChaosView';
import {RatEntity} from '../../src/entities/RatEntity';
import {createPlayer} from '../../src/worker/gameState';
import {DEFAULT_APPEARANCE} from '../../src/shared/ratAppearance';
import {MAX_HP,PROTOCOL_VERSION,type ServerMessage} from '../../src/shared/networkProtocol';
import {PICKUP_TUNING,RANDOM_SITE_KINDS} from '../../src/shared/pickups';
import {createAssignment} from '../../src/shared/assignments';
import {ResultsCoordinator} from '../../src/session/ResultsCoordinator';
import {ReplayRecorder} from '../../src/replay/ReplayRecorder';
import {ReplayStage} from '../../src/replay/ReplayStage';
import {GameHud} from '../../src/ui/GameHud';
import {MatchScoreboard} from '../../src/ui/MatchScoreboard';
import {FeelDirector} from '../../src/feel/FeelDirector';

const report:{kind:string;checks:string[];passed?:boolean;error?:string}={kind:'real-browser simulation/presentation/DOM integration; no network or human gameplay acceptance',checks:[]};
const check=(name:string,pass:boolean)=>{if(!pass)throw Error(name);report.checks.push(name);};
const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
async function run(){
 const stage=createStage(new THREE.WebGLRenderer({antialias:true}));
 const {scene,world,camera,renderer}=stage;
 document.getElementById('title-screen')!.style.display='none';
 const a=createPlayer('a','Boundary A',DEFAULT_APPEARANCE,{x:0,y:2,z:0}),b=createPlayer('b','Boundary B',DEFAULT_APPEARANCE,{x:0,y:2,z:0});
 const sim=new ChaosSimulation(new Map([[a.id,a],[b.id,b]]),()=>{});
 const now=Date.now();sim.step(0,now);
 const initial=sim.snapshot(false),site=initial.pickups!.find(p=>p.kind!=='quick-fix')!,heal=initial.pickups!.find(p=>p.kind==='quick-fix')!;
 const rat=new RatEntity(scene,world,new THREE.Vector3(site.x,site.y-.7,site.z),a.name,a);rat.isPlayer=true;
 const feedback:string[]=[];
 const makeView=()=>{const view=new ChaosView(scene,id=>id===a.id?rat:undefined,undefined,true,cue=>feedback.push(cue));view.setScores([],a.id);return view;};
 let view=makeView();view.apply(initial);
 camera.position.set(site.x+5,site.y+4,site.z+8);camera.lookAt(site.x,site.y,site.z);
 const point={x:site.x,y:site.y,z:site.z};
 const candidate={target:'pickup' as const,targetId:site.id,generation:site.availableAt??0,pickup:site.kind};
 Object.assign(a,{x:site.x,y:site.y-.7,z:site.z});Object.assign(b,{x:a.x,y:a.y,z:a.z});
 view.anticipateInteraction('claim-a',candidate);
 const won=sim.claimInteraction(a.id,'pickup',site.id,candidate.generation,now);
 const lost=sim.claimInteraction(b.id,'pickup',site.id,candidate.generation,now);
 check('one authoritative winner for competing claims',won.accepted&&!lost.accepted);
 view.resolveInteraction({type:'pickupResult',interactionId:'claim-a',...won,at:now,tick:initial.tick!,epoch:initial.epoch!});
 view.apply(sim.snapshot(false));view.update(1/60,camera);
 check('confirmed claim shows its card',document.querySelectorAll('.pickup-buffs .powerup-'+site.kind).length===1);
 check('claim feedback emitted once',feedback.filter(c=>c==='pickup-'+site.kind).length===1);
 view.anticipateInteraction('denied',candidate);
 view.resolveInteraction({type:'pickupResult',interactionId:'denied',...lost,at:now,tick:initial.tick!,epoch:initial.epoch!});
 view.cancelInteraction('denied');
 check('full-health heal rejected by authority',!sim.claimInteraction(a.id,'pickup',heal.id,heal.availableAt??0,now).accepted);
 check('full-health heal excluded by client sweep',view.interaction(heal,heal,true)?.targetId!==heal.id);
 a.hp=MAX_HP-1;Object.assign(a,{x:heal.x,y:heal.y-.7,z:heal.z});
 check('damaged rat can collect heal',sim.claimInteraction(a.id,'pickup',heal.id,heal.availableAt??0,now).accepted);
 check('heal reaches full health',a.hp===MAX_HP);
 const claimed=sim.snapshot(false).pickups!.find(p=>p.id===site.id)!;
 check('restock deadline authoritative',claimed.availableAt===now+PICKUP_TUNING.respawnMs);
 check('next non-heal kind remains in random pool',RANDOM_SITE_KINDS.includes(claimed.kind as typeof RANDOM_SITE_KINDS[number]));
 // The delayed kind rebuild must survive the claim animation and repeated render frames.
 let clock=performance.now();for(let i=0;i<90;i++){view.update(1/60,camera,clock+i*1000/60);renderer.render(scene,camera);}
 const before=scene.children.length;view.dispose();
 check('dispose removes scene-root supply props',scene.children.length<before);
 check('dispose removes buff bar',document.querySelectorAll('.pickup-buffs').length===0);
 feedback.length=0;view=makeView();view.apply(sim.snapshot(false));view.update(1/60,camera);
 check('late join uses existing buffs without replaying claim',feedback.every(c=>!c.startsWith('pickup-')));
 const count=scene.children.length;view.dispose();view=makeView();view.apply(sim.snapshot(false));
 check('reconnect does not duplicate scene objects',scene.children.length===count);
 view.resetProjectiles();view.apply(sim.snapshot(false));view.update(1/60,camera);view.dispose();
 check('reset/reconnect leave no supply DOM',document.querySelectorAll('.pickup-buffs').length===0);
 // Results are real HUD/standings/exhibits over the real replay recorder and player.
 let serverNow=now;
 const recorder=new ReplayRecorder(()=>serverNow),hud=new GameHud(document),scoreboard=new MatchScoreboard(document),feel=new FeelDirector();
 const replay=new ReplayStage({renderer,scene,listener:stage.listener,flashlight:stage.flashlight,recorder,shared:o=>o instanceof THREE.Light||o===stage.ground});
 const sent:unknown[]=[];let locks=0;
 const results=new ResultsCoordinator(hud,scoreboard,recorder,replay,feel,undefined,()=>a.id,()=>false,()=>0,id=>id===a.id?rat:undefined,m=>sent.push(m),()=>{locks++;});
 const welcome={type:'welcome',id:a.id,player:a,players:{b},world:{seed:1,version:1},round:{phase:'playing'},serverTime:now,protocolVersion:PROTOCOL_VERSION} as Extract<ServerMessage,{type:'welcome'}>;
 recorder.welcome(welcome);recorder.record({type:'chaos',state:sim.snapshot(false)});
 recorder.record({type:'highlight',id:'boundary-highlight',kind:'bank-shot',at:now,actors:[a.id],p:point,score:50,leadMs:0,trailMs:1000});serverNow+=1500;
 const assignment=createAssignment('excessive-force',now);assignment.phase='active';
 const victory={type:'gameWon',winnerId:a.id,winnerName:a.name,kills:10,resetAt:now+30000,assignment} as Extract<ServerMessage,{type:'gameWon'}>;
 results.win(victory);results.presentVictory(performance.now()+6000,true);results.presentResults(performance.now()+6000,true,camera);
 check('results enter reading state',results.reading&&results.shown);
 check('recorder freezes a real exhibit',!!recorder.data('boundary-highlight'));
 check('reset holds unfinished reader',results.reset()&&results.holding&&results.reading);
 recorder.reset();check('frozen exhibit survives next-round reset',!!recorder.data('boundary-highlight'));
 hud.onContinue=()=>results.continueFromResults();document.querySelector<HTMLButtonElement>('.results-continue')!.click();
 check('CONTINUE sends ready and returns control',sent.some(m=>(m as {type:string}).type==='ready')&&locks===1&&!results.reading);
 check('CONTINUE releases old exhibit',!recorder.data('boundary-highlight'));
 results.win(victory);results.presentVictory(performance.now()+6000,true);results.presentResults(performance.now()+6000,true,camera);results.cancel();
 check('welcome cancellation closes results',!results.shown&&!results.reading);
 results.dispose();replay.dispose();hud.dispose();scoreboard.dispose();sim.reset();rat.dispose();
 // Keep a rendered empty scene as the repeatable screenshot artifact.
 renderer.render(scene,camera);await nextFrame();report.passed=true;
}
run().catch(error=>{report.error=String(error);report.passed=false;}).finally(()=>{
 (window as unknown as {repositoryBoundaryReport:typeof report}).repositoryBoundaryReport=report;
 const output=document.createElement('pre');output.id='boundary-receipt';output.style.cssText='position:fixed;inset:12px;z-index:9999;color:#eee;background:#19151c;padding:16px;overflow:auto';output.textContent=JSON.stringify(report,null,2);document.body.appendChild(output);
});
