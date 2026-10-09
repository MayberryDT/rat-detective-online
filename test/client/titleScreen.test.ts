import {afterEach,expect,it,vi} from 'vitest';
import {TitleScreen} from '../../src/ui/TitleScreen';

class Node extends EventTarget {
    textContent='';disabled=true;style={};offsetWidth=1;focus=vi.fn();
    hidden=false;toggleAttribute=vi.fn((name:string,force?:boolean)=>{if(name==='hidden')this.hidden=force??!this.hidden;});
    private classes=new Set<string>();
    classList={add:(name:string)=>this.classes.add(name),remove:(name:string)=>this.classes.delete(name),contains:(name:string)=>this.classes.has(name)};
    click(){this.dispatchEvent(new Event('click'));}
}
const titles:TitleScreen[]=[];
afterEach(()=>{titles.splice(0).forEach(t=>t.dispose());vi.restoreAllMocks();vi.useRealTimers();});
function setup(search=''){
    vi.useFakeTimers();let draw=0;vi.spyOn(Math,'random').mockImplementation(()=>((draw++*13)%97)/97);
    const nodes=new Map<string,unknown>(['enter-city-btn','reroll-name-btn','player-name','title-screen','invitation-status'].map(id=>[id,new Node()]));
    const doc=Object.assign(new EventTarget(),{hidden:false,pointerLockElement:null,body:new Node(),getElementById:(id:string)=>nodes.get(id)??null});
    const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:false}),location:{search}});
    const title=new TitleScreen(doc as unknown as Document,target as unknown as Window);titles.push(title);
    const node=(id:string)=>nodes.get(id) as Node;
    return {title,doc,target,enter:node('enter-city-btn'),reroll:node('reroll-name-btn'),name:node('player-name'),invitation:node('invitation-status')};
}
it('enables name generation and entry without constructing or waiting for the game',()=>{
    const f=setup(),cues:string[]=[];f.title.onCue=cue=>cues.push(cue);expect(f.enter.disabled).toBe(false);expect(f.name.textContent).not.toBe('');
    const first=f.title.name;f.reroll.click();expect(f.title.name).not.toBe(first);
    // The new name types onto the card, clattering as it goes, and is stamped once it is whole.
    expect(f.name.textContent).not.toBe('');expect(f.title.name.startsWith(f.name.textContent)).toBe(true);expect(f.name.textContent).not.toBe(f.title.name);
    vi.advanceTimersByTime(1000);expect(f.name.textContent).toBe(f.title.name);
    expect(cues.filter(c=>c==='name-tick').length).toBeGreaterThan(1);expect(cues.at(-1)).toBe('name-stamp');expect(cues.filter(c=>c==='name-stamp')).toHaveLength(1);
    const enter=vi.fn();f.title.onEnter=enter;f.enter.click();expect(enter).toHaveBeenCalledWith(f.title.name);
});
it('enters with the selected name even during a shuffle and preserves it when callbacks attach',()=>{
    const f=setup();f.reroll.click();const selected=f.title.name;
    const enter=vi.fn();f.title.onEnter=enter;f.enter.click();
    expect(f.name.textContent).toBe(selected);expect(enter).toHaveBeenCalledWith(selected);
    vi.advanceTimersByTime(1000);expect(f.title.name).toBe(selected);expect(f.name.textContent).toBe(selected);
});
it('blocks repeated entry while busy and releases title listeners and timers on disposal',()=>{
    const f=setup(),enter=vi.fn();f.title.onEnter=enter;f.title.available=()=>false;
    const name=f.title.name;f.enter.click();f.reroll.click();expect(enter).not.toHaveBeenCalled();expect(f.title.name).toBe(name);
    f.title.available=()=>true;f.reroll.click();f.title.dispose();expect(vi.getTimerCount()).toBe(0);
    f.enter.click();expect(enter).not.toHaveBeenCalled();
});
it('shows valid and rejected public invitation intent before entry',()=>{
    const room='public-live-v3-12345678-1234-4123-8123-123456789abc';
    const invited=setup(`?preferred=${room}`);expect(invited.invitation.textContent).toBe('INVITED DISPATCH — ENTER TO JOIN');expect(invited.invitation.hidden).toBe(false);
    const invalid=setup('?preferred=graybox-practice-secret');expect(invalid.invitation.textContent).toBe('INVITATION UNAVAILABLE — OPEN MATCHMAKING');expect(invalid.invitation.hidden).toBe(false);
});
