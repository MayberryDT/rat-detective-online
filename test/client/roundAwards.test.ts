import {expect,it} from 'vitest';
import {RoundAwards} from '../../src/worker/RoundAwards';
import {parseServerMessage} from '../../src/shared/messageValidation';
import {createPlayer} from '../../src/worker/gameState';
import {createAssignment} from '../../src/shared/assignments';
import {MAX_SCORE_ENTRIES,RACE_LIMIT,type PlayerData,type RoundReport} from '../../src/shared/networkProtocol';

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
    awards.damage('gone',null,9,0);awards.damage('a',null,2,0);
    const present=new Map([['a',a]]);
    expect(awards.awards(present).find(w=>w.id==='most-cheesed')).toBeUndefined();
    awards.damage('a',null,1,0);
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

// Juice T5 failure modes, written before the checks:
// 7. A respawn or launcher teleport counts as legwork.
// 8. One scattershot trigger that hits with several balls, or an eruption ball it set off, counts as extra hits (accuracy over 100%).
// 9. A handful of lucky shots wins Sharpshooter.
// 10. A launch event still listed on the next tick counts as a second flight.
// 11. The lineup drops the winner behind better-scoring rats, or grows past five.
// 12. A lineup with too many or blank ids is accepted on the wire.

it('counts legwork without teleports, one hit per trigger, a minimum of shots and each flight once',()=>{
    const awards=new RoundAwards(),a=rat('a'),players=new Map([['a',a]]);
    for(let i=0;i<30;i++){a.x+=10;awards.sample(players.values(),.1,null,0);}
    a.x+=500;awards.sample(players.values(),.1,null,0);
    const launch=[{id:'launch-1-a',playerId:'a'}];
    awards.sample(players.values(),.1,null,0,launch);awards.sample(players.values(),.1,null,0,launch);
    for(let i=0;i<5;i++)awards.shot('a',`s${i}`);
    awards.hit('a','s1');awards.hit('a','s1');awards.hit('a','s2');awards.hit('a','burst-ball');
    let byId=Object.fromEntries(awards.awards(players).map(w=>[w.id,w]));
    expect(byId.legwork).toMatchObject({value:290});
    expect(byId['frequent-flier']).toBeUndefined();
    expect(byId.sharpshooter).toBeUndefined();
    for(let i=5;i<10;i++)awards.shot('a',`s${i}`);
    awards.sample(players.values(),.1,null,0,[...launch,{id:'launch-2-a',playerId:'a'}]);
    byId=Object.fromEntries(awards.awards(players).map(w=>[w.id,w]));
    expect(byId.sharpshooter).toMatchObject({value:20});
    expect(byId['frequent-flier']).toMatchObject({value:2});
});

it('puts the winner first in a lineup of at most five and validates it on the wire',()=>{
    const awards=new RoundAwards(),players=new Map(['a','b','c','d','e','f','g'].map((id,i)=>{const p=rat(id);p.kills=i;return [id,p];}));
    expect(awards.lineup(players,'a')).toEqual(['a','g','f','e','d']);
    const base={type:'gameWon',winnerId:'a',winnerName:'A',kills:3,resetAt:1};
    expect(parseServerMessage(JSON.stringify({...base,lineup:['a','b']}))).toMatchObject({lineup:['a','b']});
    expect(parseServerMessage(JSON.stringify({...base,lineup:['a','b','c','d','e','f']}))).toBeNull();
    expect(parseServerMessage(JSON.stringify({...base,lineup:['a','']}))).toBeNull();
});

// Dispatch pillars failure modes, written before the checks:
// 13. One call, still showing its caller on later ticks (rolling, active, LINE BUSY), counts again every tick.
// 14. A round with no calls still names a Dispatcher, or the rat with fewer calls wins.
it('counts each Dispatch call once and names the rat with the most calls',()=>{
    const awards=new RoundAwards(),a=rat('a'),b=rat('b'),players=new Map([['a',a],['b',b]]);
    const dispatch=(serial:number,caller?:string)=>({phase:caller?'rolling' as const:'ready' as const,started:0,until:0,serial,...(caller?{caller}:{})});
    awards.sample(players.values(),1,null,0,[],dispatch(0));
    expect(awards.awards(players).find(w=>w.id==='dispatcher')).toBeUndefined();
    for(let tick=0;tick<30;tick++)awards.sample(players.values(),1,null,0,[],dispatch(1,'a'));
    awards.sample(players.values(),1,null,0,[],dispatch(2));
    for(const serial of [3,4])for(let tick=0;tick<5;tick++)awards.sample(players.values(),1,null,0,[],dispatch(serial,'b'));
    expect(awards.awards(players).find(w=>w.id==='dispatcher')).toMatchObject({title:'DISPATCHER',playerId:'b',value:2});
    expect(parseServerMessage(JSON.stringify({type:'gameWon',winnerId:'b',winnerName:'B',kills:3,resetAt:1,awards:awards.awards(players)}))).not.toBeNull();
    awards.reset();
    expect(awards.awards(players).find(w=>w.id==='dispatcher')).toBeUndefined();
});

// Round report failure modes, written before the checks:
// (see below)
// 15. Taking the case back after dropping it counts as a hand-off; a carry still running at the finish is lost.
// 16. A long round grows the race past its wire bound, or the race stops ending on the final score.
// 17. An oversized, out-of-range or inconsistent report is accepted on the wire.
it('counts hand-offs between rats and the longest carry, including one running at the finish',()=>{
    const awards=new RoundAwards(),a=rat('a'),b=rat('b'),players=new Map([['a',a],['b',b]]);
    for(const [owner,seconds] of [['a',5],[null,2],['a',3],['b',12]] as const)for(let i=0;i<seconds;i++)awards.sample(players.values(),1,owner,0);
    const report=awards.report(players,22);
    expect(report.handoffs).toBe(2);
    expect(report.carry).toEqual({playerId:'b',playerName:'B',seconds:12});
});
it('keeps a long round\'s race within its bound, ending on each leader\'s final progress',()=>{
    const awards=new RoundAwards(),assignment=createAssignment('chain-of-custody',0);
    const players=new Map(Array.from({length:8},(_,i)=>[`r${i}`,rat(`r${i}`)] as const));
    for(let t=0;t<4000;t++){
        if(t%300===0)for(const id of players.keys())assignment.deliveries[id]=(assignment.deliveries[id]??0)+Number(id.slice(1))%3;
        awards.sample(players.values(),1,null,0,[],undefined,assignment);
    }
    assignment.deliveries.r2=99;
    const report=awards.report(players,4000,assignment),race=report.race!;
    expect(race.ids).toHaveLength(RACE_LIMIT.rats);expect(race.ids[0]).toBe('r2');
    expect(race.points.every(line=>line.length===race.points[0]!.length&&line.length<=RACE_LIMIT.points)).toBe(true);
    expect((race.points[0]!.length-2)*race.step).toBeLessThanOrEqual(4000);expect((race.points[0]!.length-1)*race.step).toBeGreaterThan(4000-race.step*2);
    const leader=race.points[0]!;expect(leader[leader.length-1]).toBe(99);
    expect(parseServerMessage(JSON.stringify({type:'gameWon',winnerId:'r2',winnerName:'R2',kills:0,resetAt:1,report}))).toMatchObject({report:{race:{ids:race.ids}}});
});
it('rejects oversized, out-of-range or inconsistent round reports',()=>{
    const line={id:'a',name:'A',kills:3,deaths:2,assists:1,shots:10,hits:4,headshots:1,longest:30,caseSeconds:12,takes:2,carry:9,streak:2,supplies:3,flights:1,
        damage:6,dealt:8,alive:540,weapons:{cheese:2,laser:1},kinds:{hustle:2,'tommy-gun':1},deathsBy:{shot:1,drowned:1}};
    const report:RoundReport={seconds:600,kills:9,handoffs:4,supplies:3,flights:1,calls:0,incidents:{'pressure-surge':2},rats:[line],race:{step:10,ids:['a'],points:[[0,1,2]]}};
    const won=(r:unknown)=>parseServerMessage(JSON.stringify({type:'gameWon',winnerId:'a',winnerName:'A',kills:3,resetAt:1,report:r}));
    expect(won(report)).toMatchObject({report});
    expect(won({...report,rats:Array.from({length:MAX_SCORE_ENTRIES+1},(_,i)=>({...line,id:`r${i}`}))})).toBeNull();
    expect(won({...report,rats:[{...line,hits:11}]})).toBeNull();
    expect(won({...report,seconds:-1})).toBeNull();
    expect(won({...report,kills:Number.NaN})).toBeNull();
    expect(won({...report,race:{step:10,ids:['a','b','c','d','e','f'],points:Array.from({length:6},()=>[1])}})).toBeNull();
    expect(won({...report,race:{step:10,ids:['a','b'],points:[[0,1],[0]]}})).toBeNull();
    expect(won({...report,race:{step:10,ids:['a'],points:[Array.from({length:RACE_LIMIT.points+1},()=>0)]}})).toBeNull();
    expect(won({...report,race:{step:0,ids:['a'],points:[[1]]}})).toBeNull();
    expect(won({...report,incidents:{'no-such-incident':1}})).toBeNull();
    expect(won({...report,rats:[{...line,weapons:{bazooka:1}}]})).toBeNull();
    expect(won({...report,rats:[{...line,deathsBy:{shot:-1}}]})).toBeNull();
});
// 18. The killer also earns an assist, stale damage earns one, or a kill's weapon and the victim's cause are misfiled.
it('credits assists within the window only, and files kills by weapon and deaths by cause',()=>{
    const awards=new RoundAwards(),a=rat('a'),b=rat('b'),c=rat('c'),v=rat('v'),players=new Map([['a',a],['b',b],['c',c],['v',v]]);
    awards.damage('v','c',1,0);awards.damage('v','b',1,15_000);awards.damage('v','a',2,20_000);
    awards.death(v,a,{headshot:false,explosive:false,weapon:'laser'},20_000);
    awards.death(a,undefined,{headshot:false,explosive:false,environment:'drowned'},21_000);
    const lines=Object.fromEntries(awards.report(players,30).rats.map(r=>[r.id,r]));
    expect([lines.a!.assists,lines.b!.assists,lines.c!.assists]).toEqual([0,1,0]);
    expect(lines.a!.dealt).toBe(2);expect(lines.a!.weapons).toEqual({laser:1});
    expect(lines.v!.deathsBy).toEqual({shot:1});expect(lines.a!.deathsBy).toEqual({drowned:1});
});
