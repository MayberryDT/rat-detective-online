import { NetworkManager } from '../network/NetworkManager';
import { loadTitleWorld } from './titleWorld';
import type { TitleScreen } from '../ui/TitleScreen';
import type { TitleMusic } from '../ui/TitleMusic';
import { unlockEffectsAudio } from '../audio/effectsAudio';
import { generateRandomAppearance } from '../shared/ratAppearance';

/** `requested`: Enter City was pressed already. From the press on, the join goes out held so the room wakes while
 * the game finishes loading (`NetworkManager.hold`); the session sends the real join when it is ready. */
export async function prepareGame(title:TitleScreen,music:TitleMusic,signal:AbortSignal,requested:()=>boolean=()=>false) {
    const transport=new NetworkManager();
    signal.addEventListener('abort',()=>transport.destroy(),{once:true});
    title.onGesture=()=>{void music.unlock();unlockEffectsAudio();transport.prepare();};
    transport.prepare();
    const hold=()=>transport.hold(title.name,generateRandomAppearance());
    if(requested())hold();
    const entered=title.onEnter;
    title.onEnter=name=>{entered(name);hold();};
    const [world,engine]=await Promise.all([loadTitleWorld(signal),import('./createGame')]);
    if(signal.aborted)return;
    return engine.createGame(title,music,transport,world,signal);
}
