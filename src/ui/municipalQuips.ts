import type {IncidentId} from '../shared/incidentCatalog';

export const MUNICIPAL_QUIPS = {
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

/** Flavor for incident broadcasts; the title, countdown and objective status
 * carry the actionable information without a recurring tutorial paragraph. */
export const INCIDENT_QUIPS:Record<IncidentId,string>={
    'improper-disposal':'THE DECEASED HAVE PLACES TO BE.',
    'bad-ammunition':'BALLISTICS HAS DECLINED TO COMMENT.',
    'pressure-surge':'THE CITY DENIES LIFTING YOU.',
    'evidence-tampering':'THE EVIDENCE IS FLEEING THE SCENE.',
    crossfire:'THE WALLS ARE ACCOMPLICES.',
    scattershot:'ONE COMPLAINT. FIVE COPIES.',
    'delayed-reaction':'THE WALL WOULD LIKE A WORD.',
    'big-cheese':'THE CHEDDAR BUDGET WAS APPROVED.',
    'ricochet-racket':'THE WITNESS STATEMENT HAS MULTIPLIED.',
    'popcorn-panic':'THE EVIDENCE IS GETTING SALTY.',
};
/** Local flavor only. Every phrase appears before reuse, with no boundary repeat. */
export class MunicipalQuips {
    private readonly bags=new Map<keyof typeof MUNICIPAL_QUIPS,string[]>();
    private readonly last=new Map<keyof typeof MUNICIPAL_QUIPS,string>();
    constructor(private readonly random= Math.random){}
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
