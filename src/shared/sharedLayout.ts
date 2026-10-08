import { grayboxBoxes, type GrayboxBox } from './grayboxLayout';
import { GRAYBOX_VERSION } from './layoutVersion';

const shared=new Map<string,readonly GrayboxBox[]>();
/** The layout's boxes, built once per world and shared (frozen): the authority's simulation, navigation, bots, spawns
 * and city places all read the same list, and a room waking in a warm isolate does not rebuild it (smooth-play plan,
 * E2). Only the shipped layout (`GRAYBOX_VERSION`) is shared: a test that builds its own world under another version
 * (or mocks `grayboxBoxes`, which is why this lives apart from `grayboxLayout`) always gets its boxes fresh. */
export function sharedGrayboxBoxes(spec?:{seed:number;version:number}):readonly GrayboxBox[] {
    if(!spec||spec.version!==GRAYBOX_VERSION)return grayboxBoxes(spec);
    const key=`${spec.version}:${spec.seed}`;
    let boxes=shared.get(key);
    if(!boxes){boxes=Object.freeze(grayboxBoxes(spec).map(b=>Object.freeze(b)));shared.set(key,boxes);}
    return boxes;
}
