/** What just happened in the game, for the perf reporter (Tyler, 9 October: "we gotta log that stuff so you can figure
 * out what's going on when I'm talking about it"): a stall report names the marks made in and just before it (a welcome,
 * the sewer lamps flipping, a death, a respawn, a claim, a launch, a radio call), so a freeze can be matched to its
 * cause without guessing. A tiny ring of the latest marks; nothing is sent on its own. */
const marks:{at:number;name:string}[]=[];
export function perfMark(name:string):void {marks.push({at:performance.now(),name});if(marks.length>48)marks.shift();}
/** The distinct marks made between `from` and `to` (performance time), oldest first, with how many of each. */
export function perfMarksBetween(from:number,to:number):string|undefined {
    const counts=new Map<string,number>();
    for(const m of marks)if(m.at>=from&&m.at<=to)counts.set(m.name,(counts.get(m.name)??0)+1);
    if(!counts.size)return undefined;
    return [...counts].map(([name,n])=>n>1?`${name}x${n}`:name).join(',').slice(0,120);
}
