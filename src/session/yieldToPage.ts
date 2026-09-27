/** Typing on the title must stay smooth: heavy preparation steps wait for a
 * short pause in input, unless the player has already asked to enter. */
const QUIET_MS=350;
let lastInput=Number.NEGATIVE_INFINITY,entering=false,tracking=false;

export function trackTitleInput(signal:AbortSignal):void {
    if(tracking)return;
    tracking=true;
    const mark=()=>{lastInput=performance.now();};
    for(const type of ['keydown','input','pointerdown'])document.addEventListener(type,mark,{capture:true,passive:true,signal});
}
export function entryRequested():void {entering=true;}

/** Yield city construction so name rolls, paint and taps keep getting turns. */
export async function yieldToPage(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new DOMException('Page closed', 'AbortError');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    for(let wait=QUIET_MS-(performance.now()-lastInput);!entering&&wait>0;wait=QUIET_MS-(performance.now()-lastInput)){
        if (signal?.aborted) break;
        await new Promise<void>(resolve => setTimeout(resolve, wait));
    }
    if (signal?.aborted) throw new DOMException('Page closed', 'AbortError');
}
