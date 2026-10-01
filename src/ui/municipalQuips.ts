import type {IncidentId} from '../shared/incidentCatalog';
import type {EnvironmentCause} from '../shared/networkProtocol';

export const MUNICIPAL_QUIPS = {
    kill: [
        'FILED UNDER: SWISS CHEESED.', 'ONE LESS RAT. MORE PAPERWORK.',
        'THE ALIBI HAD HOLES.', 'PERMANENTLY OUT OF OFFICE.',
        'CHEESE SERVED. JUSTICE PENDING.', 'THAT LEAD WENT COLD.',
        'THE SUSPECT HAS STOPPED COOPERATING.', 'PROMOTED TO FLOOR INSPECTOR.',
        'AN OPEN-AND-SHUT CASKET.', 'THE LONG PAW OF THE LAW.',
        'CROSS-EXAMINED WITH CHEDDAR.', 'PLEASE HOLD FOR THE CORONER.',
        'THE PAPER TRAIL ENDS HERE.', 'ONE WAY TO BEAT THE RAT RACE.',
        'THEY CRUMBLED UNDER QUESTIONING.', 'NO FURTHER SQUEAKS.',
        'A BRIEF CAREER IN ORGANIZED GRIME.', 'THEIR ALIBI EXPIRED FIRST.',
        'TRANSFERRED TO COLD STORAGE.', 'A SHARP CHEDDAR REBUTTAL.',
        'THE HAT IS NOW A WITNESS.', 'ANOTHER HOLE IN THE TESTIMONY.',
        'INTERNAL AFFAIRS WILL BE THRILLED.', 'RETURN TO SENDER. EXTRA HOLES.',
    ],
    caseDeath: [
        'The case closed {name}.',
        '{name} was filed under FLATTENED.',
        'The paperwork was too much for {name}.',
        '{name} received a crushing performance review.',
        'The case rested. On {name}.',
        '{name} became supporting documentation.',
        'The evidence found {name} guilty of standing there.',
        '{name} was hit with the full weight of bureaucracy.',
        '{name} forgot to duck the paperwork.',
        'The briefcase made {name} redundant.',
        '{name} has been moved to dead storage.',
        '{name} tried to handle the case. The case handled {name}.',
        '{name} was stamped RETURN TO FLOOR.',
        'The paper trail ran over {name}.',
        '{name} lost an argument with the luggage.',
        '{name} is now an attachment.',
        'The case knocked the qualifications out of {name}.',
        '{name} was caught between a case and a hard place.',
        'The evidence has a solid alibi. {name} does not.',
        '{name} requested fewer forms. Request denied.',
        'The briefcase took {name} off the case.',
        '{name} met the department\'s impact assessment.',
        '{name} has been professionally compressed.',
        'The case promoted {name} to floor manager.',
    ],
    drowned: [
        '{name} went to sleep with the fishes.',
        'The harbour took {name}\'s statement. Permanently.',
        '{name} is helping the Port Authority with its inquiries. Underwater.',
        '{name} found the bottom of the case. And the harbour.',
        'The tide rolled in. {name} did not roll out.',
        '{name} was last seen doing the backstroke into eternity.',
        'The water was cold. So is the case on {name}.',
        '{name} tried to walk on water. The water objected.',
        '{name} was filed under WET WORK.',
        'The harbour master logged {name} as cargo, lost at sea.',
    ],
    meteor: [
        'The sky fell on {name}. It was cheese.',
        '{name} got caught in the Cheddar Shower. Heavy at times.',
        'A meteor of aged cheddar flattened {name}. Vintage.',
        '{name} looked up. That was the mistake.',
        'The clouds sent {name} a cheese wheel. Express.',
        '{name} is now a crater with a hat.',
        'The forecast said cheese. {name} did not bring an umbrella.',
        '{name} was in the wrong shadow at the wrong time.',
        'Scattered cheese, heavy at times. Mostly on {name}.',
        '{name} has been filed under WEATHER. Case closed.',
        'A passing cloud dropped a wheel of brie on {name}.',
        '{name} was pressed into a fine cheese.',
    ],
    death: ['A MINOR CAREER SETBACK.', 'TEMPORARILY OUT OF OFFICE.', 'YOUR PENSION IS UNDER REVIEW.', 'UNSCHEDULED FLOOR INSPECTION.', 'PLEASE RESUBMIT YOURSELF.', 'ANOTHER WORKPLACE INCIDENT.', 'HORIZONTAL. STILL EMPLOYED.', 'THE REPORT WILL BE UNFLATTERING.', 'PAID LEAVE DENIED.', 'YOUR HAT HAS FILED A COMPLAINT.', 'CURRENTLY BETWEEN HEARTBEATS.', 'OFFICER DOWN. MORALE UNCLEAR.'],
    victory: ['PROMOTED?!', 'MANAGEMENT HAS QUESTIONS.', 'EMPLOYEE OF THE INCIDENT.', 'A RAISE IS NOT GUARANTEED.', 'YOUR METHODS WERE NOTED.', 'SOMEHOW, THIS COUNTS.', 'CORNER OFFICE. NO WINDOWS.', 'OUTSTANDING QUESTIONABLE CONDUCT.', 'THE MAYOR DENIES INVOLVEMENT.', 'PLEASE TRAIN YOUR REPLACEMENT.', 'A MODEL OF MUNICIPAL EFFICIENCY.', 'THE PAPERWORK CHECKS OUT.'],
    casePickup: [
        'FINALLY. A CASE WITH HANDLES.', 'THE LEADS SMELL LIKE CHEDDAR.',
        'MY ALIBI HAS A CARRY HANDLE.', 'SMELLS LIKE A PROMOTION.',
        'ONE PAW AHEAD OF THE LAW.', 'THIS IS GOING IN MY BURROW.',
        'NEW BAG. NO RECEIPT.', 'I CALL DIBS ON THE EVIDENCE.',
        'THE EVIDENCE IS MOSTLY CRUMBS.', 'AN OPEN-AND-SHUT BRIEFCASE.',
        'EVERYBODY WANTS MY BAGGAGE.', 'I CAN EXPLAIN THE PAW PRINTS.',
        'CHAIN OF CUSTODY? NEVER MET HIM.', 'THE HANDLE CHECKS OUT.',
        'MY PARTNER IS NOW A BRIEFCASE.', 'I WAS TOLD THERE WOULD BE CHEESE.',
    ],
    caseLost: [
        'IT WAS JUST HERE, OFFICER.', 'MY ALIBI WALKED OFF.',
        'THEY STOLE MY WHOLE AFTERNOON.', 'MY PROMOTION LEFT WITHOUT ME.',
        'THE PAPER TRAIL GREW LEGS.', 'NO WITNESSES. EXCEPT EVERYONE.',
        'SMALL PAWS. BIG MISTAKE.', 'THE BAG SLIPPED. I SWEAR.',
        'THAT WAS MY GOOD BRIEFCASE.', 'THE CAPTAIN WILL NEVER NOTICE.',
        'I BLAME THE GLOVES.', 'THE UNION WILL HEAR ABOUT THIS.',
        'I WAS JUST HOLDING IT FOR A FRIEND.', 'MY CAREER HAS BEEN MISPLACED.',
        'THE SUSPECT HAS MY LUNCH.', 'PLEASE IGNORE THAT PART OF THE REPORT.',
    ],
    caseTaken: [
        'THE USUAL SUSPECT. NEW LUGGAGE.', 'THAT RAT LOOKS VERY EMPLOYED.',
        'ANOTHER RAT. SAME DIRTY LAUNDRY.', 'THAT IS A LOT OF BAGGAGE.',
        'SUSPICIOUSLY QUALIFIED.', 'THEY HAVE CHEESE TO HIDE.',
        'THE BRIEFCASE PICKED A SIDE.', 'NEW MANAGEMENT. SAME SMELL.',
        'MY INFORMANT IS CARRYING IT.', 'PROMOTED TO MOVING TARGET.',
        'THAT TAIL LOOKS FAMILIAR.', 'THEY DID NOT SIGN FOR THAT.',
        'ALL DRESSED UP. SOMETHING TO HIDE.', 'A VERY PORTABLE MOTIVE.',
        'THE CAPTAIN LIKES THEM BETTER.', 'SOMEONE HAS BEEN SNIFFING MY LEADS.',
    ],
    caseLoose: [
        'THE PLOT HAS BEEN DROPPED.', 'THAT BAG KNOWS TOO MUCH.',
        'THE FLOOR IS NOW A SUSPECT.', 'IT IS FULL OF LOOSE ENDS.',
        'FOUND: ONE CAREER OPPORTUNITY.', 'OPEN-AND-SHUT. MOSTLY SHUT.',
        'DO NOT FEED THE EVIDENCE.', 'A COLD CASE. WARM CHEESE.',
        'THE BRIEFCASE HAS NO COMMENT.', 'THE EVIDENCE PLEADS THE FIFTH.',
        'EVERY CRIME NEEDS A HANDLE.', 'THAT IS SOMEBODY ELSE\'S PAW PRINT.',
        'LOST PROPERTY. FOUND MOTIVE.', 'THE BAG HAS LAWYERED UP.',
        'NOBODY SAW WHO DROPPED IT.', 'SMELLS LIKE UNSOLVED BUSINESS.',
    ],
} as const;
/** Which joke bag tells a death nobody is credited with. */
const ENVIRONMENT_QUIPS:Record<EnvironmentCause,keyof typeof MUNICIPAL_QUIPS>={'evidence-tampering':'caseDeath',drowned:'drowned',meteor:'meteor'};

/** Flavor for incident broadcasts; the title, countdown and objective status
 * carry the actionable information without a recurring tutorial paragraph. */
export const INCIDENT_QUIPS:Record<IncidentId,string>={
    'improper-disposal':'THE DECEASED HAVE PLACES TO BE.',
    'bad-ammunition':'EVERY ROUND HAS A PERSONALITY. NONE OF THEM ARE GOOD.',
    'pressure-surge':'THE CITY DENIES LIFTING YOU.',
    'evidence-tampering':'THE EVIDENCE IS FLEEING THE SCENE.',
    crossfire:'THE WALLS ARE ACCOMPLICES.',
    scattershot:'EVERY COMPLAINT NOW ARRIVES WITH FORCE.',
    'big-cheese':'THE CHEDDAR BUDGET WAS APPROVED.',
    'planted-evidence':'SOMEBODY HAS BEEN VERY THOROUGH.',
    blackout:'THE POWER COMPANY IS INVESTIGATING ITSELF.',
    'code-violation':'THE CITY HAS FAILED ITS SAFETY INSPECTION. EVERYTHING IS OUT OF ORDER.',
    'most-wanted':'THE CITY WOULD LIKE A WORD WITH WHOEVER IS WINNING.',
    'all-units':'DEATH IS NO EXCUSE FOR MISSING THE ACTION.',
    bobbleheads:'THE COMMISSIONER ORDERED BIGGER HEADS. NOBODY ASKED WHY.',
    'cheddar-shower':'THE FORECAST IS CHEESE. FIND A ROOF.',
};
/** Local flavor only. Every phrase appears before reuse, with no boundary repeat. */
export class MunicipalQuips {
    private readonly bags=new Map<keyof typeof MUNICIPAL_QUIPS,string[]>();
    private readonly last=new Map<keyof typeof MUNICIPAL_QUIPS,string>();
    constructor(private readonly random= Math.random){}
    /** A death nobody is credited with, in words for its cause. */
    environmental(cause:EnvironmentCause,name:string):string{return this.next(ENVIRONMENT_QUIPS[cause]).replace(/\{name\}/g,()=>name);}
    next(kind:keyof typeof MUNICIPAL_QUIPS):string {
        let bag=this.bags.get(kind);
        if(!bag?.length){
            bag=[...MUNICIPAL_QUIPS[kind]];
            for(let i=bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
            if(bag[0]===this.last.get(kind))[bag[0],bag[1]]=[bag[1],bag[0]];
            this.bags.set(kind,bag);
        }
        const phrase=bag.shift()!;this.last.set(kind,phrase);return phrase;
    }
}
