export interface HudRect {left:number;top:number;right:number;bottom:number}

const PAD=8;
/** Candidate centres, reused between calls (placement runs every frame). */
const xs:number[]=[],ys:number[]=[];
/** Area of the label at (cx,cy) over the aim area and the obstacles. */
function overlap(cx:number,cy:number,hw:number,hh:number,vw:number,vh:number,obstacles:readonly HudRect[]):number {
    let sum=0;
    sum+=Math.max(0,Math.min(cx+hw+PAD,vw/2+95)-Math.max(cx-hw-PAD,vw/2-95))*Math.max(0,Math.min(cy+hh+PAD,vh/2+75)-Math.max(cy-hh-PAD,vh/2-75));
    for(let i=0;i<obstacles.length;i++){const r=obstacles[i]!;
        sum+=Math.max(0,Math.min(cx+hw+PAD,r.right)-Math.max(cx-hw-PAD,r.left))*Math.max(0,Math.min(cy+hh+PAD,r.bottom)-Math.max(cy-hh-PAD,r.top));}
    return sum;
}

/** Keep a world label visible without covering the aim area or live HUD cards.
 * Work is bounded by the small number of authored HUD rectangles. Pass plain rectangles, not DOMRects:
 * every DOMRect side read allocates. Writes the centre into `out`. */
export function placeHudLabel(x:number,y:number,width:number,height:number,vw:number,vh:number,obstacles:readonly HudRect[],out={x:0,y:0}){
    const hw=width/2,hh=height/2,minX=hw+PAD,maxX=vw-hw-PAD,minY=hh+PAD,maxY=vh-hh-PAD;
    out.x=Math.max(minX,Math.min(maxX,x));out.y=Math.max(minY,Math.min(maxY,y));
    let penalty=overlap(out.x,out.y,hw,hh,vw,vh,obstacles)*1e6;
    if(!penalty)return out;
    // Candidates: where it is, both viewport edges, then either side of the aim area and each obstacle.
    let n=0;xs[n]=out.x;ys[n++]=out.y;xs[n]=minX;ys[n++]=minY;xs[n]=maxX;ys[n++]=maxY;
    xs[n]=vw/2-95-hw-PAD;ys[n++]=vh/2-75-hh-PAD;xs[n]=vw/2+95+hw+PAD;ys[n++]=vh/2+75+hh+PAD;
    for(let i=0;i<obstacles.length;i++){const r=obstacles[i]!;xs[n]=r.left-hw-PAD;ys[n++]=r.top-hh-PAD;xs[n]=r.right+hw+PAD;ys[n++]=r.bottom+hh+PAD;}
    for(let i=0;i<n;i++){const cx=Math.max(minX,Math.min(maxX,xs[i]!));
        for(let j=0;j<n;j++){const cy=Math.max(minY,Math.min(maxY,ys[j]!));
            const score=overlap(cx,cy,hw,hh,vw,vh,obstacles)*1e6+(cx-x)**2+(cy-y)**2;
            if(score<penalty){penalty=score;out.x=cx;out.y=cy;}
        }
    }
    return out;
}
