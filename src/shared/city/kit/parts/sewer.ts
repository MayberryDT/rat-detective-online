import type { KitBuilder } from '../kit';
import { SEWER_PIPE_ENTRANCES, sewerPipePoint } from '../../../sewerLayout';

/** A wall or hanging enamel sign; `ry` faces the reader (0 = +z). */
type Plate = {lines:string[]; x:number; y:number; z:number; w:number; ry:number; hang?:true};

const ENAMEL = {bg:'#18221d', fg:'#d7c894'} as const;

/** Enamel way-signs for the north branches: over each street mouth, and at the turns below. */
export function sewer(k:KitBuilder):void {
    if(!k.visuals)return;
    for(const entry of SEWER_PIPE_ENTRANCES){
        if(!entry.sign)continue;
        // A lit enamel plate on an iron backboard, bolted to the crown of the pipe mouth.
        const face=sewerPipePoint(entry,-.34),back=sewerPipePoint(entry,-.22),horizontal=entry.axis==='x';
        const ry=horizontal?entry.direction*Math.PI/2:entry.direction>0?0:Math.PI;
        const w=7.4,y=entry.springY+entry.radius+1.05;
        k.piece('iron',back.x,y,back.z,horizontal?.14:w+.4,1.5,horizontal?w+.4:.14);
        for(const side of [-1,1]){
            const strut=sewerPipePoint(entry,-.22,side*2.9);
            const foot=entry.springY+Math.sqrt(entry.radius**2-2.9**2);
            k.piece('iron',strut.x,(foot+y)/2,strut.z,.14,y-foot,.14);
        }
        k.sign({lines:[entry.sign,'CITY SEWER · NO LOITERING'],x:face.x,y,z:face.z,w,h:1.2,ry,
            bg:entry.name==='Precinct'?'#0f1a2c':'#1d1a14',fg:entry.name==='Precinct'?'#b9cdf2':'#e3c98f',glow:true});
    }
    // Hanging signs come in back-to-back pairs; the +z face carries the rods.
    const plates:Plate[]=[
        // Precinct branch: from the trunk, and at the turn to the ramp.
        {lines:['PRECINCT SALLY PORT ↑'],x:-60,y:-1.75,z:-4.35,w:6.4,ry:0,hang:true},
        {lines:['MAIN TRUNK ↓'],x:-60,y:-1.75,z:-4.45,w:6.4,ry:Math.PI,hang:true},
        {lines:['← PRECINCT SALLY PORT'],x:-62,y:-3.1,z:-117.92,w:6.8,ry:0},
        // Docks branch: out of Maintenance's north opening, and at the turn to the ramp.
        {lines:['DOCKSIDE OUTFALL ↑'],x:68,y:-1.75,z:-41.9,w:3.8,ry:0,hang:true},
        {lines:['MAINTENANCE ↓'],x:68,y:-1.75,z:-42,w:3.8,ry:Math.PI,hang:true},
        {lines:['← DOCKSIDE OUTFALL'],x:65,y:-3.1,z:-117.92,w:6.8,ry:0},
    ];
    for(const p of plates){
        const h=.8;
        if(!p.hang)k.piece('iron',p.x,p.y,p.z-Math.cos(p.ry)*.05,p.w+.3,h+.3,.06);
        else if(p.ry===0)for(const side of [-1,1])k.piece('iron',p.x+side*(p.w/2-.4),(-1+p.y+h/2)/2,p.z-.05,.07,-1-p.y-h/2,.07);
        k.sign({lines:p.lines,x:p.x,y:p.y,z:p.z,w:p.w,h,ry:p.ry,...ENAMEL});
    }
}
