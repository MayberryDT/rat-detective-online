import { env, evictDurableObject, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { GameRoom } from '../../src/worker/GameRoom';
import { ASSIGNMENT_IDS, destinationPoint, type AssignmentId, type AssignmentState } from '../../src/shared/assignments';
import { DeliveryDecoder } from '../../src/shared/deliveryWire';
import type { ChaosSimulation } from '../../src/shared/ChaosSimulation';
import type { ChaosState } from '../../src/shared/chaosState';
import { PROTOCOL_VERSION, WIN_DISPLAY_MS, type PlayerData, type RoundState, type ServerMessage } from '../../src/shared/networkProtocol';

type Internals={handleHit:(id:string,hit:{type:'hit';victimId:string;damage:number},incoming?:{x:number;y:number;z:number})=>Promise<void>;players:Map<string,PlayerData>;chaos:ChaosSimulation;chaosTimer:ReturnType<typeof setInterval>|null;
    clock:()=>number;round:RoundState;finishAssignment:()=>void;checkpointGame:()=>void;persistPlayer:(p:PlayerData,force:boolean)=>void};
const sockets:WebSocket[]=[];
const rooms:DurableObjectStub<GameRoom>[]=[];
const appearance={hatType:'fedora',hatColor:1,furColor:2,coatColor:3};
function room(){const name=`graybox-assignment-${crypto.randomUUID()}`,stub=env.GAME_ROOM.getByName(name);rooms.push(stub);return{name,stub};}
function pause(game:Internals){if(game.chaosTimer)clearInterval(game.chaosTimer);game.chaosTimer=null;}
async function open(name:string,compact=false){
    const response=await SELF.fetch(`http://localhost/ws?room=${name}${compact?'&chaos=compact-v2':''}`,{headers:{Upgrade:'websocket',Origin:'http://localhost'}});
    expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();sockets.push(ws);
    const messages:ServerMessage[]=[],invalid:string[]=[],decoder=new DeliveryDecoder();
    ws.addEventListener('message',event=>{
        const decoded=decoder.read(String(event.data));
        if(!decoded){invalid.push(String(event.data));return;}
        if(decoded.ack)try{ws.send(JSON.stringify(decoded.ack));}catch{/* closing */}if(decoded.message)messages.push(decoded.message);
    });
    const wait=async<T extends ServerMessage['type']>(type:T):Promise<Extract<ServerMessage,{type:T}>>=>{
        const end=Date.now()+3000;
        while(Date.now()<end){
            const index=messages.findIndex(m=>m.type===type);
            if(index>=0)return messages.splice(index,1)[0] as Extract<ServerMessage,{type:T}>;
            await new Promise(resolve=>setTimeout(resolve,5));
        }
        throw new Error(`No ${type}; invalid packets: ${invalid.join('\n')}`);
    };
    ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name:compact?'Compact Rat':'Inspector Brie',appearance}));
    const welcome=await wait('welcome');
    return {ws,messages,invalid,wait,welcome};
}
afterEach(async()=>{
    for(const ws of sockets.splice(0))if(ws.readyState!==WebSocket.CLOSED)await new Promise<void>(resolve=>{
        ws.addEventListener('close',()=>resolve(),{once:true});if(ws.readyState===WebSocket.OPEN)ws.close(1000,'complete');
    });
    for(const stub of rooms.splice(0))await runInDurableObject(stub,async(instance,ctx)=>{pause(instance as unknown as Internals);await ctx.storage.deleteAlarm();});
});

describe('shared assignment room lifecycle',()=>{
    it('routes an Improper Disposal self hit through durable damage, death and respawn without awarding points',async()=>{
        const {name,stub}=room();await stub.configureAssignment('excessive-force');
        const first=await open(name),second=await open(name,true);
        await runInDurableObject(stub,async(instance,ctx)=>{
            const game=instance as unknown as Internals;pause(game);
            const sim=game.chaos,a=game.players.get(first.welcome.id)!,b=game.players.get(second.welcome.id)!;
            const now=sim.assignmentState!.liveAt+1;game.clock=()=>now;
            Object.assign(a,{x:-3,y:59,z:0,hp:1,kills:19});Object.assign(b,{x:0,y:59.05,z:0,hp:0});
            (sim as unknown as {dispatch:ChaosState['dispatch']}).dispatch={phase:'active',started:now,until:now+25_000,serial:1,incident:'improper-disposal'};
            sim.step(0,now);sim.death(b,{x:1,y:0,z:0},a.id);
            for(let i=1;i<=20;i++)sim.step(1/120,now+i*1000/120);
            expect(a.hp).toBe(0);expect(a.kills).toBe(19);expect(a.deaths).toBe(1);
            expect(sim.assignmentState!.caseKills).toEqual({});expect(game.round.phase).toBe('playing');
            expect(ctx.storage.sql.exec("SELECT * FROM pending_events WHERE type='respawn' AND player_id=?",a.id).toArray()).toHaveLength(1);
            expect(ctx.storage.sql.exec("SELECT * FROM pending_events WHERE type='reset'").toArray()).toHaveLength(0);
        });
        const died=await first.wait('playerDied');
        expect(died).toMatchObject({victimId:first.welcome.id,killerId:first.welcome.id});
        expect(first.invalid).toEqual([]);expect(second.invalid).toEqual([]);
    });
    it('restricts direct selection to local private rooms and keeps repeated requests stable',async()=>{
        expect((await SELF.fetch('https://rat.test/ws?assignment=closing-time',{headers:{Upgrade:'websocket'}})).status).toBe(400);
        expect((await SELF.fetch('https://rat.test/ws?room=graybox-practice-external&assignment=closing-time',{headers:{Upgrade:'websocket'}})).status).toBe(404);
        for(const url of ['http://localhost/ws?room=graybox-practice-invalid&assignment=unknown',
            'http://localhost/ws?room=graybox-practice-retired&assignment=misfiled-evidence'])
            expect((await SELF.fetch(url,{headers:{Upgrade:'websocket',Origin:'http://localhost'}})).status).toBe(400);
        const name=`graybox-practice-assignment-${crypto.randomUUID()}`,stub=env.GAME_ROOM.getByName(name);rooms.push(stub);
        const response=await SELF.fetch(`http://localhost/ws?room=${name}&assignment=chain-of-custody`,{headers:{Upgrade:'websocket',Origin:'http://localhost'}});
        expect(response.status).toBe(101);const ws=response.webSocket!;ws.accept();sockets.push(ws);
        const client=await open(name);expect(client.welcome.round.assignment?.id).toBe('chain-of-custody');
        expect(await stub.configureAssignment('chain-of-custody')).toBe(true);
        expect(await stub.configureAssignment('closing-time')).toBe(false);
        await runInDurableObject(stub,instance=>pause(instance as unknown as Internals));
    });
    it('delivers the same three physical finishes and two shuffle cycles to ordinary and compact clients',async()=>{
        const {name,stub}=room(),first=await open(name),second=await open(name,true);
        expect(first.welcome.round.assignment?.roundId).toBe(second.welcome.round.assignment?.roundId);
        const sequence:AssignmentId[]=[];
        for(let round=0;round<6;round++){
            const completed=await runInDurableObject(stub,async(instance,ctx)=>{
                const game=instance as unknown as Internals;pause(game);
                const sim=game.chaos,a=game.players.get(first.welcome.id)!,b=game.players.get(second.welcome.id)!;
                const assignment=sim.assignmentState!;let now=Math.max(Date.now(),assignment.liveAt+1);game.clock=()=>Math.round(now);
                Object.assign(a,{x:-90,y:.3,z:-100});Object.assign(b,{x:90,y:.3,z:-100});
                    Object.assign(a,{x:-16.74,y:.3,z:-30.02});sim.caseBody.position.set(-16,1.1,-30);sim.caseBody.velocity.setZero();sim.step(0,now);
                    expect(sim.caseHolderId).toBe(a.id);
                    if(assignment.id==='excessive-force'){
                        for(let i=0;i<10;i++){b.hp=3;await game.handleHit(a.id,{type:'hit',victimId:b.id,damage:3},{x:0,y:0,z:-1});}
                    }else if(assignment.id==='closing-time'){
                        assignment.remainingMs=1;now+=1;sim.step(.001,now);
                    }else for(const id of assignment.destinations){
                        if(sim.assignmentState!.result)break;
                        if(!sim.caseHolderId){const p=sim.caseBody.position;Object.assign(a,{x:p.x,y:p.y-.8,z:p.z});sim.step(0,++now);expect(sim.caseHolderId).toBe(a.id);}
                        const outside=destinationPoint(id),inside=destinationPoint(id,false);
                        Object.assign(a,outside);sim.step(0,++now);
                        Object.assign(a,inside);sim.step(0,++now);
                    }
                expect(sim.assignmentState!.result?.winnerId).toBe(a.id);game.finishAssignment();game.finishAssignment();
                expect(game.round.phase).toBe('won');
                expect(ctx.storage.sql.exec("SELECT * FROM pending_events WHERE type='reset'").toArray()).toHaveLength(1);
                return structuredClone(sim.assignmentState!);
            });
            sequence.push(completed.id);
            const winA=await first.wait('gameWon'),winB=await second.wait('gameWon');
            expect(winA.assignment).toEqual(completed);expect(winB.assignment).toEqual(completed);
            expect(winA.winnerId).toBe(first.welcome.id);expect(winA.kills).toBe(completed.id==='excessive-force'?10:0);
            await runInDurableObject(stub,async(instance)=>{
                const game=instance as unknown as Internals;const now=game.round.resetAt!;game.clock=()=>now;await instance.alarm();pause(game);
                expect(game.chaos.assignmentState!.roundId).not.toBe(completed.roundId);
                expect(game.chaos.assignmentState!.result).toBeUndefined();
            });
            const resetA=await first.wait('gameReset'),resetB=await second.wait('gameReset');
            expect(resetA.round.assignment).toEqual(resetB.round.assignment);
        }
        for(let i=0;i<6;i+=3)expect(new Set(sequence.slice(i,i+3))).toEqual(new Set(ASSIGNMENT_IDS));
        expect(sequence[2]).not.toBe(sequence[3]);expect(first.invalid).toEqual([]);expect(second.invalid).toEqual([]);
        expect(first.messages.filter(m=>m.type==='gameWon')).toEqual([]);
    },20_000);
    it('restores personal deliveries, next destination and case identity for a late join after eviction',async()=>{
        const {name,stub}=room();expect(await stub.configureAssignment('chain-of-custody')).toBe(true);
        const first=await open(name);
        const saved=await runInDurableObject(stub,(instance)=>{
            const game=instance as unknown as Internals;pause(game);const sim=game.chaos,a=game.players.get(first.welcome.id)!;
            const now=sim.assignmentState!.liveAt+1,front=destinationPoint(sim.assignmentState!.destinations[0]),back=destinationPoint(sim.assignmentState!.destinations[0],false);
            Object.assign(a,front);sim.caseBody.position.set(front.x,front.y+.8,front.z);sim.caseBody.velocity.setZero();
            sim.step(0,now);Object.assign(a,back);sim.step(0,now+1);
            expect(sim.assignmentState!.deliverySerial).toBe(1);expect(sim.caseHolderId).toBeNull();game.persistPlayer(a,true);game.checkpointGame();return {assignment:structuredClone(sim.assignmentState!),position:{...sim.snapshot(false).case.p}};
        });
        await evictDurableObject(stub,{webSockets:'hibernate'});
        const late=await open(name,true);expect(late.welcome.round.assignment).toMatchObject({id:saved.assignment.id,roundId:saved.assignment.roundId,deliverySerial:1,deliveries:saved.assignment.deliveries,destinations:saved.assignment.destinations});
        await runInDurableObject(stub,instance=>{const game=instance as unknown as Internals;pause(game);expect(game.chaos.caseHolderId).toBeNull();const p=game.chaos.caseBody.position;expect(Math.hypot(p.x-saved.position.x,p.y-saved.position.y,p.z-saved.position.z)).toBeLessThan(1.5);});
        expect(await stub.configureAssignment('excessive-force')).toBe(false);
        await runInDurableObject(stub,(instance)=>pause(instance as unknown as Internals));
        expect(late.invalid).toEqual([]);
    });
    it('persists personal case kills through eviction and supplies them to a late compact join',async()=>{
        const {name,stub}=room();await stub.configureAssignment('excessive-force');const first=await open(name),second=await open(name,true);
        const saved=await runInDurableObject(stub,async(instance)=>{
            const game=instance as unknown as Internals;pause(game);const sim=game.chaos,a=game.players.get(first.welcome.id)!,b=game.players.get(second.welcome.id)!;
            const now=sim.assignmentState!.liveAt+1;game.clock=()=>now;
            Object.assign(a,{x:-16.74,y:.3,z:-30.02});Object.assign(b,{x:50,z:50});
            sim.caseBody.position.set(-16,1.1,-30);sim.caseBody.velocity.setZero();sim.step(0,now);
            a.kills=19;
            await game.handleHit(a.id,{type:'hit',victimId:b.id,damage:3},{x:0,y:0,z:1});
            expect(a.kills).toBe(20);expect(sim.assignmentState!.caseKills[a.id]).toBe(1);expect(game.round.phase).toBe('playing');
            sim.release(a.id);b.hp=3;await game.handleHit(a.id,{type:'hit',victimId:b.id,damage:3},{x:0,y:0,z:1});
            expect(sim.assignmentState!.caseKills[a.id]).toBe(1);game.checkpointGame();return structuredClone(sim.assignmentState!);
        });
        await evictDurableObject(stub,{webSockets:'hibernate'});const late=await open(name,true);
        expect(late.welcome.round.assignment).toMatchObject({id:'excessive-force',roundId:saved.roundId,caseKills:saved.caseKills});
        expect(late.welcome.players[first.welcome.id].kills).toBe(21);expect(late.invalid).toEqual([]);
        await runInDurableObject(stub,instance=>pause(instance as unknown as Internals));
    });
    it('ignores an obsolete reset deadline while Closing Time still has possession time remaining',async()=>{
        const {name,stub}=room();await stub.configureAssignment('closing-time');await open(name);
        await runInDurableObject(stub,async(instance,ctx)=>{
            const game=instance as unknown as Internals;pause(game);const before=structuredClone(game.chaos.assignmentState!);
            const now=before.liveAt+600_000;game.clock=()=>now;game.round.startedAt=now-600_000;
            ctx.storage.sql.exec("INSERT INTO pending_events (id,type,player_id,due_at) VALUES ('obsolete-timeout','reset',NULL,?)",now);
            await instance.alarm();pause(game);
            expect(game.round.phase).toBe('playing');expect(game.chaos.assignmentState!.roundId).toBe(before.roundId);
            expect(game.chaos.assignmentState!.remainingMs).toBe(before.remainingMs);expect(game.chaos.assignmentState!.result).toBeUndefined();
        });
    });
    it('restores a closed result and its reset deadline without awarding another win',async()=>{
        const {name,stub}=room();await stub.configureAssignment('closing-time');const first=await open(name);
        const result=await runInDurableObject(stub,(instance)=>{
            const game=instance as unknown as Internals;pause(game);const sim=game.chaos,a=game.players.get(first.welcome.id)!;
            const now=sim.assignmentState!.liveAt+1;game.clock=()=>now;
            sim.caseBody.position.set(a.x,a.y+.8,a.z);sim.caseBody.velocity.setZero();sim.step(0,now);
            sim.assignmentState!.remainingMs=1;sim.step(.001,now+1);game.finishAssignment();
            return {assignment:structuredClone(sim.assignmentState!) as AssignmentState,resetAt:now+WIN_DISPLAY_MS};
        });
        await first.wait('gameWon');await evictDurableObject(stub,{webSockets:'hibernate'});
        const late=await open(name,true);expect(late.welcome.round).toMatchObject({phase:'won',resetAt:result.resetAt,assignment:result.assignment});
        await runInDurableObject(stub,(instance)=>{const game=instance as unknown as Internals;pause(game);game.finishAssignment();});
        expect(late.messages.filter(m=>m.type==='gameWon')).toEqual([]);expect(late.invalid).toEqual([]);
    });
});
