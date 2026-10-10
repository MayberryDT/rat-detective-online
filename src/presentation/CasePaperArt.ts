import * as THREE from 'three';
import {CASE_RED} from './caseRed';
import {drawPaper,paperStock} from './casePaperDrawings';

/** The case papers' shared atlas (P4 repair): a row per document family (statement, form, receipt, photograph), three
 * fronts and a back in each. Every document sits in its cell at its sheet's own proportions, so nothing is stretched. */
export const PAPER_ATLAS={size:1536,cell:384,edge:5} as const;
/** Document size in cell pixels, the same proportions as the sheet in the world (CaseFiles `PAPER_SIZES`). */
export const PAPER_RECTS:readonly {w:number;h:number}[]=[{w:271,h:364},{w:279,h:364},{w:163,h:364},{w:364,h:311}];
export const PAPER_BACK=3;
export function paperRect(family:number):{x:number;y:number;w:number;h:number} {
    const r=PAPER_RECTS[family]!;return {x:(PAPER_ATLAS.cell-r.w)>>1,y:(PAPER_ATLAS.cell-r.h)>>1,w:r.w,h:r.h};
}
/** UV of point (a, b) of a family's document in the top-left cell, b = 1 at the top edge (textures flip Y). */
export function paperUv(family:number,a:number,b:number):{u:number;v:number} {
    const r=paperRect(family),size=PAPER_ATLAS.size;
    return {u:(r.x+a*r.w)/size,v:1-(r.y+(1-b)*r.h)/size};
}
/** UV offset from the top-left cell to the cell of `family`'s `column` (0–2 fronts, 3 the back). */
export function paperCellOffset(family:number,column:number):{u:number;v:number} {
    const step=PAPER_ATLAS.cell/PAPER_ATLAS.size;return {u:column*step,v:-family*step};
}

let shared:{map:THREE.Texture;edge:THREE.Texture}|undefined;
/** The shared map (ink, stock and the thin red line) and the red-only emissive mask, built once per page. Each mip level
 * is drawn by hand: the level below, scaled, then the red line stamped again at one texel or more, so the edge stays
 * about a pixel wide at any distance instead of dissolving into a shimmer. */
export function casePaperArt():{map:THREE.Texture;edge:THREE.Texture} {
    if(shared)return shared;
    const red='#'+new THREE.Color(CASE_RED).getHexString(),size=PAPER_ATLAS.size,cell=PAPER_ATLAS.cell;
    const base=document.createElement('canvas');base.width=base.height=size;
    const ctx=base.getContext('2d')!;
    for(let family=0;family<4;family++)for(let column=0;column<4;column++){
        const r=paperRect(family),x=column*cell+r.x,y=family*cell+r.y;
        // Cell padding repeats the document's own stock, so minified edges never bleed a neighbour's ink.
        ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,r.w,r.h);ctx.clip();
        drawPaper(ctx,family,column,r.w,r.h);ctx.restore();
        ctx.fillStyle=paperStock(family,column);
        ctx.fillRect(column*cell,family*cell,cell,r.y);ctx.fillRect(column*cell,y+r.h,cell,cell-r.y-r.h);
        ctx.fillRect(column*cell,y,r.x,r.h);ctx.fillRect(x+r.w,y,cell-r.x-r.w,r.h);
    }
    const map=chain(base,red,false),mask=document.createElement('canvas');mask.width=mask.height=size/2;
    const m=mask.getContext('2d')!;m.fillStyle='#000';m.fillRect(0,0,mask.width,mask.height);
    const edge=chain(mask,red,true);
    shared={map:texture(map),edge:texture(edge)};
    return shared;
}
function texture(levels:HTMLCanvasElement[]):THREE.Texture {
    const t=new THREE.Texture(levels[0]);
    t.mipmaps=levels as unknown as THREE.Texture['mipmaps'];t.generateMipmaps=false;
    t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
    t.needsUpdate=true;
    return t;
}
/** Level 0 already drawn (`mask`: black); every level gets the red line stamped at its own resolution. */
function chain(level0:HTMLCanvasElement,red:string,mask:boolean):HTMLCanvasElement[] {
    const levels=[level0];
    stamp(level0,red,mask);
    while(levels[levels.length-1]!.width>1){
        const previous=levels[levels.length-1]!,next=document.createElement('canvas');
        next.width=next.height=Math.max(1,previous.width>>1);
        const c=next.getContext('2d')!;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
        c.drawImage(previous,0,0,next.width,next.height);
        stamp(next,red,mask);levels.push(next);
    }
    return levels;
}
function stamp(canvas:HTMLCanvasElement,red:string,mask:boolean):void {
    const k=canvas.width/PAPER_ATLAS.size,c=canvas.getContext('2d')!,cell=PAPER_ATLAS.cell;
    const width=Math.max(1,Math.floor(PAPER_ATLAS.edge*k*(mask?.8:1)+.25));
    c.fillStyle=red;
    for(let family=0;family<4;family++)for(let column=0;column<4;column++){
        const r=paperRect(family);
        const x0=Math.round((column*cell+r.x)*k),y0=Math.round((family*cell+r.y)*k);
        const x1=Math.round((column*cell+r.x+r.w)*k),y1=Math.round((family*cell+r.y+r.h)*k);
        if(x1-x0<3||y1-y0<3){
            // A document a texel or two wide: stock with a hint of red, never a red dot.
            c.globalAlpha=mask?.2:.18;c.fillRect(x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0));c.globalAlpha=1;continue;
        }
        // Once a document is only a few texels across, a full-strength one-texel border would be most of it: far sheets
        // would turn red and glow. The line fades as the document shrinks, keeping a thin edge, not a red speck.
        const across=Math.min(x1-x0,y1-y0);c.globalAlpha=across>=16?1:across>=8?.7:.45;
        c.fillRect(x0,y0,x1-x0,width);c.fillRect(x0,y1-width,x1-x0,width);
        c.fillRect(x0,y0,width,y1-y0);c.fillRect(x1-width,y0,width,y1-y0);c.globalAlpha=1;
    }
}
