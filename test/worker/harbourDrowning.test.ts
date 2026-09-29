import { readSocketMessage } from './socketMessages';
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_HP, PROTOCOL_VERSION, type PlayerData, type ServerMessage } from '../../src/shared/networkProtocol';
import { DROWN_Y } from '../../src/shared/city/kit/northPlan';
import { PIERS, PIER_END } from '../../src/shared/city/kit/parts/docks';
import { SHIP, SHIP_Z } from '../../src/shared/city/kit/parts/docksShip';
import { createMovementAllowance, type MovementAllowance } from '../../src/worker/validation';
import type { GameRoom } from '../../src/worker/GameRoom';

const appearance={hatType:'fedora' as const,hatColor:0xdc4a3c,furColor:0xe8b84d,coatColor:0xbe4545};
const sockets=new Set<WebSocket>();
afterEach(()=>{for(const ws of sockets)if(ws.readyState===WebSocket.OPEN)ws.close(1000,'test cleanup');sockets.clear();});

/** Join a room and resolve with the rat's id once the welcome arrives. */
async function join(room:string,name:string):Promise<string> {
    const response=await SELF.fetch(`http://localhost/ws?room=${room}`,{headers:{Upgrade:'websocket',Origin:'http://localhost'}});
    const ws=response.webSocket!;ws.accept();sockets.add(ws);
    // The test lib targets ES2023, which has no Promise.withResolvers.
    return new Promise<string>(resolve=>{
        ws.addEventListener('message',event=>{const message=readSocketMessage(ws,event.data);if(message?.type==='welcome')resolve(message.id);});
        ws.send(JSON.stringify({type:'join',protocolVersion:PROTOCOL_VERSION,name,appearance}));
    });
}

/** The room internals the test drives: a rat reporting where its feet are, and what the room tells everyone. */
interface RoomInternals {
    players:Map<string,PlayerData>;
    movementAllowances:Map<string,MovementAllowance>;
    lastActiveAt:Map<string,number>;
    lastMovementSequence:Map<string,number>;
    broadcast(message:ServerMessage,exceptPlayerId?:string):void;
    handleMovement(id:string,message:{type:'updateMovement';seq:number;position:{x:number;y:number;z:number};rotation:{x:number;y:number;z:number;w:number};meshRotation:{x:number;y:number;z:number;w:number}},at:number):boolean;
}
const still={rotation:{x:0,y:0,z:0,w:1},meshRotation:{x:0,y:0,z:0,w:1}};
type Point={x:number;y:number;z:number};

/** Put the rat at `from`, report a short step to `to`; returns every player and the broadcasts. */
function step(room:string,id:string,from:Point,to:Point):Promise<{players:PlayerData[];sent:ServerMessage[]}> {
    return runInDurableObject(env.GAME_ROOM.getByName(room),(instance:GameRoom)=>{
        const game=instance as unknown as RoomInternals,player=game.players.get(id)!,start=Date.now(),sent:ServerMessage[]=[];
        const broadcast=game.broadcast.bind(game);
        game.broadcast=(message,except)=>{sent.push(message);broadcast(message,except);};
        try{
            Object.assign(player,from);game.lastActiveAt.set(id,start);game.movementAllowances.set(id,createMovementAllowance(start));
            game.lastMovementSequence.delete(id);
            game.handleMovement(id,{type:'updateMovement',seq:1,position:to,...still},start+100);
        }finally{game.broadcast=broadcast;}
        return {players:[...game.players.values()].map(p=>({...p})),sent};
    });
}

describe('drowning in the harbour',()=>{
    it('kills a rat whose feet sink below the line, credits nobody and says so in the feed',async()=>{
        const room=`graybox-drown-${crypto.randomUUID()}`;
        const victim=await join(room,'Wet Rat'),witness=await join(room,'Dry Rat');
        const {players,sent}=await step(room,victim,{x:-100,y:-1,z:-185},{x:-100,y:DROWN_Y-.3,z:-185});
        const drowned=players.find(p=>p.id===victim)!,dry=players.find(p=>p.id===witness)!;
        expect(drowned.hp).toBe(0);
        expect(drowned.deaths).toBe(1);
        expect(dry.kills).toBe(0);
        expect(sent).toContainEqual(expect.objectContaining({type:'playerDied',victimId:victim,killerId:null,killerName:null,cause:'drowned'}));
    });

    it.each([
        {name:'a pier deck',from:{x:PIERS[0],y:0,z:PIER_END+4},to:{x:PIERS[0],y:0,z:PIER_END+3}},
        {name:'the Marlowe\'s deck',from:{x:118,y:SHIP.deck,z:SHIP_Z},to:{x:117,y:SHIP.deck,z:SHIP_Z}},
        {name:'a leap between decks, still above the line',from:{x:PIERS[1],y:0,z:-180},to:{x:PIERS[1]+5,y:DROWN_Y+.2,z:-180}},
    ])('leaves a rat on $name alive',async({from,to})=>{
        const room=`graybox-deck-${crypto.randomUUID()}`,rat=await join(room,'Deck Rat');
        const {players,sent}=await step(room,rat,from,to);
        const after=players.find(p=>p.id===rat)!;
        expect(after.hp).toBe(MAX_HP);
        expect(after.deaths).toBe(0);
        expect(sent.some(m=>m.type==='playerDied')).toBe(false);
    });
});
