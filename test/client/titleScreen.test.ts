import {afterEach,expect,it,vi} from 'vitest';
import {TitleScreen} from '../../src/ui/TitleScreen';

class Node extends EventTarget {
    textContent='';disabled=true;style={};offsetWidth=1;focus=vi.fn();
    private classes=new Set<string>();
    classList={add:(name:string)=>this.classes.add(name),remove:(name:string)=>this.classes.delete(name),contains:(name:string)=>this.classes.has(name)};
    click(){this.dispatchEvent(new Event('click'));}
}
const titles:TitleScreen[]=[];
afterEach(()=>{titles.splice(0).forEach(t=>t.dispose());vi.restoreAllMocks();vi.useRealTimers();});
function setup(){
    vi.useFakeTimers();let draw=0;vi.spyOn(Math,'random').mockImplementation(()=>((draw++*13)%97)/97);
    const nodes=new Map(['enter-city-btn','reroll-name-btn','player-name','title-screen'].map(id=>[id,new Node()]));
    const doc=Object.assign(new EventTarget(),{hidden:false,pointerLockElement:null,body:new Node(),getElementById:(id:string)=>nodes.get(id)??null});
    const target=Object.assign(new EventTarget(),{matchMedia:()=>({matches:false})});
    const title=new TitleScreen(doc as unknown as Document,target as unknown as Window);titles.push(title);
    return {title,doc,enter:nodes.get('enter-city-btn')!,reroll:nodes.get('reroll-name-btn')!,name:nodes.get('player-name')!};
}
it('enables name generation and entry without constructing or waiting for the game',()=>{
    const f=setup();expect(f.enter.disabled).toBe(false);expect(f.name.textContent).not.toBe('');
    const first=f.title.name;f.reroll.click();expect(f.title.name).not.toBe(first);expect(f.name.textContent).not.toBe('');
    vi.advanceTimersByTime(500);expect(f.name.textContent).toBe(f.title.name);
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
