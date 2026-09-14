export interface HudRect {left:number;top:number;right:number;bottom:number}

/** Keep a world label visible without covering the aim area or live HUD cards.
 * Work is bounded by the small number of authored HUD rectangles. */
export function placeHudLabel(x:number,y:number,width:number,height:number,vw:number,vh:number,obstacles:readonly HudRect[]){
    const hw=width/2,hh=height/2,pad=8;
    const clampX=(n:number)=>Math.max(hw+pad,Math.min(vw-hw-pad,n));
    const clampY=(n:number)=>Math.max(hh+pad,Math.min(vh-hh-pad,n));
    const blocks=[{left:vw/2-95,top:vh/2-75,right:vw/2+95,bottom:vh/2+75},...obstacles];
    const overlap=(cx:number,cy:number)=>blocks.reduce((sum,r)=>sum+
        Math.max(0,Math.min(cx+hw+pad,r.right)-Math.max(cx-hw-pad,r.left))*
        Math.max(0,Math.min(cy+hh+pad,r.bottom)-Math.max(cy-hh-pad,r.top)),0);
    let best={x:clampX(x),y:clampY(y)},penalty=overlap(best.x,best.y)*1e6;
    if(!penalty)return best;
    const xs=[best.x,hw+pad,vw-hw-pad,...blocks.flatMap(r=>[r.left-hw-pad,r.right+hw+pad])].map(clampX);
    const ys=[best.y,hh+pad,vh-hh-pad,...blocks.flatMap(r=>[r.top-hh-pad,r.bottom+hh+pad])].map(clampY);
    for(const cx of xs)for(const cy of ys){
        const score=overlap(cx,cy)*1e6+(cx-x)**2+(cy-y)**2;
        if(score<penalty){penalty=score;best={x:cx,y:cy};}
    }
    return best;
}
