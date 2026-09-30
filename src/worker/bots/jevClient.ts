/** TypeSafe's System One endpoint (https://docs.typesafe.ai/api.md), from the Worker only: the key never
 * reaches a browser. Failures back off exponentially for the whole room; the mind answers nothing meanwhile. */
export const JEV_URL='https://api.typesafe.ai/v1/systemone';
/** Pinned: moving to a new release is a deliberate change, replayed first. */
export const JEV_MODEL='jev-1.13.0';
export const JEV_DOLLARS_PER_TOKEN=.042/1e6;
const TIMEOUT_MS=1500,BACKOFF_MS=1000,MAX_BACKOFF_MS=60_000;

export type JevQuestion=
    |{type:'score';instructions:unknown;criteria:readonly string[]}
    |{type:'choice';instructions:unknown;criteria:Record<string,string>}
    |{type:'noul';instructions:unknown};
/** The parts of each answer the mind reads; anything else in a reply is ignored. */
export type JevAnswer={type:'score';score:number}|{type:'choice';choice:string}|{type:'noul';noul:number};
export interface JevReply {answers:Record<string,JevAnswer|undefined>;tokens:number;latencyMs:number}
export type JevFailure='timeout'|'network'|'malformed'|number;
export class JevError extends Error {
    constructor(readonly failure:JevFailure){super(`Jev request failed: ${failure}`);}
}
export interface JevClientOptions {
    /** Read per request, so a missing secret simply means no requests. */
    key:()=>string|undefined;
    model?:string;
    fetch?:typeof fetch;
    clock?:()=>number;
    timeoutMs?:number;
}

export class JevClient {
    /** No request before this time (the room clock). */
    backoffUntil=0;
    private failures=0;
    private readonly clock:()=>number;
    constructor(private readonly options:JevClientOptions){this.clock=options.clock??Date.now;}
    ready(now:number):boolean{return now>=this.backoffUntil;}

    async ask(state:unknown,questions:Record<string,JevQuestion>):Promise<JevReply> {
        const key=this.options.key();
        if(!key)throw new JevError(401);
        const controller=new AbortController(),started=this.clock();
        const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??TIMEOUT_MS);
        try{
            let response:Response;
            try{
                response=await (this.options.fetch??fetch)(JEV_URL,{method:'POST',signal:controller.signal,
                    headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
                    body:JSON.stringify({model:this.options.model??JEV_MODEL,state,questions})});
            }catch{throw this.fail(controller.signal.aborted?'timeout':'network');}
            if(!response.ok)throw this.fail(response.status,retryAfter(response.headers.get('retry-after'),this.clock()));
            let body:unknown;
            // The abort also cuts a body that is still arriving.
            try{body=await response.json();}catch{throw this.fail(controller.signal.aborted?'timeout':'malformed');}
            const reply=parse(body);
            if(!reply)throw this.fail('malformed');
            this.failures=0;
            return {...reply,latencyMs:this.clock()-started};
        }finally{clearTimeout(timer);}
    }

    private fail(failure:JevFailure,retryAfterMs=0):JevError {
        const delay=Math.max(retryAfterMs,Math.min(MAX_BACKOFF_MS,BACKOFF_MS*2**this.failures++));
        this.backoffUntil=Math.max(this.backoffUntil,this.clock()+delay);
        return new JevError(failure);
    }
}

/** `retry-after` as seconds or an HTTP date, in ms from now. */
function retryAfter(header:string|null,now:number):number {
    if(!header)return 0;
    const seconds=Number(header);
    if(Number.isFinite(seconds))return Math.max(0,seconds*1000);
    const at=Date.parse(header);
    return Number.isFinite(at)?Math.max(0,at-now):0;
}

function parse(body:unknown):Omit<JevReply,'latencyMs'>|undefined {
    if(!body||typeof body!=='object'||!('answers' in body)||!('usage' in body))return;
    const {answers,usage}=body;
    if(!answers||typeof answers!=='object'||!usage||typeof usage!=='object'||!('input_tokens' in usage))return;
    const tokens=usage.input_tokens;
    if(typeof tokens!=='number'||!Number.isFinite(tokens)||tokens<0)return;
    const out:Record<string,JevAnswer|undefined>={};
    for(const [id,answer] of Object.entries(answers))out[id]=readAnswer(answer);
    return {answers:out,tokens};
}
function readAnswer(answer:unknown):JevAnswer|undefined {
    if(!answer||typeof answer!=='object'||!('type' in answer))return;
    if(answer.type==='score'&&'score' in answer&&typeof answer.score==='number'&&Number.isFinite(answer.score))return {type:'score',score:answer.score};
    if(answer.type==='choice'&&'choice' in answer&&typeof answer.choice==='string')return {type:'choice',choice:answer.choice};
    if(answer.type==='noul'&&'noul' in answer&&typeof answer.noul==='number'&&Number.isFinite(answer.noul))return {type:'noul',noul:answer.noul};
}
