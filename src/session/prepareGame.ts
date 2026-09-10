import { NetworkManager } from '../network/NetworkManager';
import { loadTitleWorld } from './titleWorld';
import type { TitleScreen } from '../ui/TitleScreen';
import type { TitleMusic } from '../ui/TitleMusic';

export async function prepareGame(title:TitleScreen,music:TitleMusic,signal:AbortSignal) {
    const transport=new NetworkManager();
    signal.addEventListener('abort',()=>transport.destroy(),{once:true});
    title.onGesture=()=>{void music.unlock();transport.prepare();};
    transport.prepare();
    const [world,engine]=await Promise.all([loadTitleWorld(signal),import('./createGame')]);
    if(signal.aborted)return;
    return engine.createGame(title,music,transport,world,signal);
}
