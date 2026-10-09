import type {HighlightKind} from '../shared/highlights';
import type {RoundReport,Vec3Data} from '../shared/networkProtocol';
import {ASSIGNMENT_DESTINATIONS,destinationContains,type DestinationId} from '../shared/assignments';
import {districtAt,type District} from '../shared/city/frame';
import {clipNames} from '../replay/captions';
import type {ReplayClip} from '../replay/types';

/** The Evening Edition (Tyler, 8 October): the round told as a newspaper front page. Its headline is Exhibit A, the
 * round's best moment, where it happened; its deck is the round's numbers in a sentence. The round opens on a case
 * file name (`caseName`) and the paper closes the same case. Words only from what really happened. */

const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;};

const CASE_NAMES=['THE HARBOUR JOB','THE ICEBOX AFFAIR','THE NEEDLEWORKS CAPER','THE CHEDDAR CONSPIRACY','THE BIG SQUEAK',
    'THE SEWER LINE','THE PIER 9 SHAKEDOWN','THE MIDNIGHT LEDGER','THE CRACKED SAFE','THE CORNER OFFICE','THE COLD STORAGE CASE',
    'THE PUMP HOUSE RACKET','THE MISSING MOZZARELLA','THE LONG GOODBYE','THE WHISKER FILE','THE RAT KING\'S RANSOM'] as const;
/** The round's case file: a number and a name, the same on every client (from the round id). */
export function caseName(roundId:string):{number:number;title:string} {
    const h=hash(roundId);
    return {number:1000+h%9000,title:CASE_NAMES[(h>>>13)%CASE_NAMES.length]!};
}

const AT:Record<DestinationId,{at:string;near:string}>={
    icebox:{at:'AT THE ICEBOX',near:'OUTSIDE THE ICEBOX'},maintenance:{at:'IN THE SEWERS',near:'IN THE SEWERS'},
    pump:{at:'AT THE PUMP STATION',near:'BY THE PUMP STATION'},needleworks:{at:'AT THE NEEDLEWORKS',near:'OUTSIDE THE NEEDLEWORKS'},
    sluice:{at:'AT THE WEST SLUICE',near:'BY THE WEST SLUICE'},records:{at:'AT RECORDS',near:'OUTSIDE RECORDS'},
    'harbour-master':{at:'AT PIER 9',near:'ON THE DOCKS'},precinct:{at:'AT THE PRECINCT',near:'OUTSIDE THE PRECINCT'},
};
const DISTRICT:Record<District,string>={'north-west':'ON THE NORTH-WEST SIDE',north:'ON THE NORTH SIDE','north-east':'ON THE NORTH-EAST SIDE',
    west:'ON THE WEST SIDE',centre:'DOWNTOWN',east:'IN THE EAST END','south-west':'ON THE SOUTH-WEST SIDE',south:'ON THE SOUTH SIDE','south-east':'ON THE SOUTH-EAST SIDE'};
/** Where a point is, as a paper says it: inside a landmark, just outside one, in the sewers, or the part of town. */
export function placePhrase(p:Vec3Data):string {
    if(p.y< -2)return 'IN THE SEWERS';
    let near:DestinationId|undefined,best=40;
    for(const id of Object.keys(ASSIGNMENT_DESTINATIONS) as DestinationId[]){
        if(destinationContains(id,p))return AT[id].at;
        const c=ASSIGNMENT_DESTINATIONS[id].center,d=Math.hypot(c.x-p.x,c.z-p.z);
        if(d<best){best=d;near=id;}
    }
    return near?AT[near].near:DISTRICT[districtAt(p.x,p.z)];
}

/** Front-page headlines per moment: `{AT}` is where it happened (some read better without it). */
const HEADLINES:Record<HighlightKind,readonly string[]>={
    'sent-flying':['{VICTIM} SENT FLYING {AT}','{VICTIM} LEAVES TOWN BY AIR','SKY HIGH: {VICTIM} LAUNCHED {AT}'],
    splashdown:['{VICTIM} FISHED OUT OF THE HARBOUR','{VICTIM} SLEEPS WITH THE FISHES'],
    pileup:['PILEUP {AT}','BODIES STACK UP {AT}','{KILLER} LEAVES A CROWDED SCENE {AT}'],
    squashed:['{VICTIM} FLATTENED {AT}','DEATH FROM ABOVE {AT}'],
    snapped:['{VICTIM} CAUGHT IN A TRAP {AT}','SNAP! {VICTIM} STUCK {AT}'],
    'body-blow':['{VICTIM} STRUCK BY A FLYING CORPSE','FALLING WITNESS HITS {VICTIM} {AT}'],
    backfire:['BAD SUPPLY BITES {KILLER} {AT}','{KILLER} FILES A COMPLAINT WITH THE CITY'],
    'so-close':['{CARRIER} STOPPED AT THE DOOR','SO CLOSE: {CARRIER} FALLS {AT}'],
    'last-meal':['{VICTIM} HEALS UP, GOES DOWN','LAST MEAL FOR {VICTIM} {AT}'],
    'fresh-spawn':['{VICTIM} DOWN MINUTES AFTER ARRIVING','NEW IN TOWN, OUT OF TIME: {VICTIM}'],
    'from-beyond':['DEAD RAT SHOOTS BACK {AT}','{KILLER} FIRES FROM THE GRAVE'],
    'bank-shot':['{KILLER} BANKS ONE OFF THE CITY','TRICK SHOT DROPS {VICTIM} {AT}'],
    'laser-ricochet':['LASER BOUNCES INTO {VICTIM} {AT}','{KILLER} BENDS THE LIGHT'],
    'long-shot':['{KILLER} HITS {VICTIM} FROM ACROSS TOWN','LONG SHOT {AT}'],
    airborne:['MIDAIR HIT {AT}','{KILLER} SHOOTS ON THE FLY'],
    'multi-kill':['{KILLER} CLEARS THE STREET {AT}','MASSACRE {AT}: {KILLER} SUSPECTED'],
    'carrier-down':['{CARRIER} LOSES THE CASE {AT}','CASE CHANGES HANDS {AT}'],
    'steal-score':['{KILLER} STEALS THE CASE AND SCORES','HEIST {AT}: {KILLER} WALKS'],
    delivery:['{CARRIER} MAKES THE DROP {AT}','PAPERS DELIVERED {AT}'],
    'round-winner':['{KILLER} CLOSES THE CASE {AT}','CASE CLOSED: {KILLER} TAKES THE CITY'],
};

export interface FrontPage {masthead:string;dateline:string;headline:string;deck:string}

const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const words=['NO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN'];
const count=(n:number)=>n<words.length?words[n]!:String(n);

/** The paper for a finished round. `lead`: Exhibit A, when there is one; `assignment`: its title, if a case was assigned. */
export function frontPage({lead,report,winnerName,roundId,assignment}:{lead?:Pick<ReplayClip,'id'|'kind'|'actors'|'names'|'p'>;report?:RoundReport;winnerName:string;roundId?:string;assignment?:string}):FrontPage {
    const file=roundId?caseName(roundId):undefined;
    let headline=`${winnerName.toUpperCase()} CLOSES THE CASE`;
    if(lead){
        const lines=HEADLINES[lead.kind],names=clipNames(lead),at=placePhrase(lead.p);
        headline=lines[hash(lead.id)%lines.length]!
            .replace(/\{(KILLER|VICTIM|CARRIER)\}/g,(_,key:string)=>names[key.toLowerCase() as 'killer'|'victim'|'carrier'].toUpperCase())
            .replace('{AT}',at).replace(/\s+/g,' ').trim();
    }
    const facts:string[]=[];
    if(report){
        facts.push(`${count(report.kills)} ${report.kills===1?'RAT':'RATS'} DOWN`);
        if(report.handoffs)facts.push(`THE CASE CHANGED HANDS ${report.handoffs===1?'ONCE':`${count(report.handoffs)} TIMES`}`);
        if(report.flights)facts.push(plural(report.flights,'LAUNCH','LAUNCHES'));
        const worst=[...report.rats].sort((a,b)=>b.deaths-a.deaths||a.id.localeCompare(b.id))[0];
        if(worst&&worst.deaths>=3)facts.push(`${worst.name.toUpperCase()} WENT DOWN ${count(worst.deaths)} TIMES`);
    }
    const deck=[`${winnerName.toUpperCase()} TAKES THE FILE.`,facts.length?`${facts.join(', ')}.`:''].filter(Boolean).join(' ');
    return {masthead:'THE EVENING RAT',dateline:['CITY FINAL',file?`CASE #${file.number} · ${file.title}`:assignment??'',assignment&&file?assignment:''].filter(Boolean).join(' · '),headline,deck};
}
