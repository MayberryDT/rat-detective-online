import {expect,it} from 'vitest';
import {RoundAwards} from '../../src/worker/RoundAwards';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
import type {PlayerData} from '../../src/shared/networkProtocol';

// Failure modes, written before the checks:
// 1. A delivery (case leaves the carrier on purpose) is counted as a drop.
// 2. Dead rats keep earning sewer time or altitude.
// 3. Awards name players who have left.
// 4. Trivial tallies (below the floors) produce awards.
// 5. A new round keeps the previous round's tallies.
// 6. Malformed or unknown awards on the wire are accepted; valid ones are dropped.

function rat(id:string,y=0,hp=3):PlayerData {
    const player=createPlayer(id,id.toUpperCase(),{hatType:'fedora',hatColor:1,coatColor:2,furColor:3},{x:0,y,z:0});
    player.hp=hp;return player;
}

it('counts drops but not deliveries, and only living rats earn sewer time and altitude',()=>{
    const awards=new RoundAwards(),a=rat('a',-3),b=rat('b',20,0),players=new Map([['a',a],['b',b]]);
    awards.sample(players.values(),1,'a',0);
    awards.sample(players.values(),1,'b',1); // a delivered: serial advanced
    awards.sample(players.values(),1,null,1); // b dropped it
    for(let i=0;i<5;i++)awards.sample(players.values(),1,null,1);
    const byId=Object.fromEntries(awards.awards(players).map(w=>[w.id,w]));
    expect(byId.butterfingers).toMatchObject({playerId:'b',value:1});
    expect(byId['sewer-dweller']).toMatchObject({playerId:'a',value:8});
    expect(byId['high-flier']).toBeUndefined();
});

it('names only present players, respects the floors and clears on reset',()=>{
    const awards=new RoundAwards(),a=rat('a');
    awards.damage('gone',9);awards.damage('a',2);
    const present=new Map([['a',a]]);
    expect(awards.awards(present).find(w=>w.id==='most-cheesed')).toBeUndefined();
    awards.damage('a',1);
    expect(awards.awards(present).find(w=>w.id==='most-cheesed')).toMatchObject({playerId:'a',value:3});
    awards.reset();
    expect(awards.awards(present)).toEqual([]);
});

it('accepts valid awards on gameWon and rejects malformed ones',()=>{
    const base={type:'gameWon',winnerId:'a',winnerName:'A',kills:3,resetAt:1};
    const award={id:'top-gun',title:'TOP GUN',playerId:'a',playerName:'A',value:3};
    expect(parseServerMessage(JSON.stringify({...base,awards:[award]}))).toMatchObject({awards:[award]});
    expect(parseServerMessage(JSON.stringify(base))).not.toHaveProperty('awards');
    expect(parseServerMessage(JSON.stringify({...base,awards:[{...award,id:'mvp'}]}))).toBeNull();
    expect(parseServerMessage(JSON.stringify({...base,awards:[{...award,value:'3'}]}))).toBeNull();
    expect(parseServerMessage(JSON.stringify({...base,awards:{}}))).toBeNull();
});
