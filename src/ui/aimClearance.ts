/** World labels may move up, but never cover the crosshair or its aiming space.
 * x/y are label centers; sizes include a little room for crooked paper edges. */
export function clearAimLabel(x:number,y:number,width:number,height:number,viewportWidth:number,viewportHeight:number){
    const cx=viewportWidth/2,cy=viewportHeight/2;
    if(Math.abs(x-cx)<width/2+100&&Math.abs(y-cy)<height/2+80)y=cy-90-height/2;
    return {x,y:Math.max(height/2+8,Math.min(viewportHeight-height/2-12,y))};
}
