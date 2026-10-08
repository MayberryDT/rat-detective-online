import * as THREE from 'three';
import {CASE_RED} from './caseRed';

/** Original precinct paperwork. Shared atlas: ink, stock and edge occupy one surface. */
export function casePaperArt():{map:THREE.CanvasTexture;edge:THREE.CanvasTexture} {
    const canvas=document.createElement('canvas'),mask=document.createElement('canvas');
    canvas.width=canvas.height=mask.width=mask.height=1024;
    const ctx=canvas.getContext('2d')!,red=mask.getContext('2d')!;
    const color='#'+new THREE.Color(CASE_RED).getHexString();
    red.fillStyle='#000';red.fillRect(0,0,1024,1024);
    for(let family=0;family<4;family++){
        const x=(family%2)*512,y=Math.floor(family/2)*512;
        ctx.save();red.save();ctx.translate(x,y);red.translate(x,y);
        // Tile padding duplicates stock; mesh UVs stop inside it to protect minified edges.
        ctx.fillStyle=['#d2cfc3','#bfc2bc','#d4cbb7','#d3d2ca'][family];ctx.fillRect(0,0,512,512);
        ctx.strokeStyle=color;ctx.lineWidth=7;ctx.strokeRect(19.5,19.5,473,473);
        red.strokeStyle=color;red.lineWidth=7;red.strokeRect(19.5,19.5,473,473);
        ctx.fillStyle='#383a37';ctx.font='bold 19px monospace';ctx.fillText('PRECINCT / EVIDENCE',40,58);
        ctx.font='12px monospace';ctx.fillText('FILE  /  RD-0047',40,79);
        ctx.fillStyle='#55574f';ctx.fillRect(40,91,432,2);
        if(family===0){
            ctx.font='bold 23px monospace';ctx.fillText('WITNESS STATEMENT',40,129);
            const lines=['The transfer was unsigned.','I saw the file at the docks.','The clerk left before closing.','','Statement amended by witness.','Original retained in evidence.'];
            ctx.font='16px monospace';lines.forEach((t,i)=>ctx.fillText(t,40+(i===4?5:0),172+i*28));
            ctx.fillRect(40,404,249,1);ctx.font='italic 18px serif';ctx.fillText('J. Marlow',60,400);
            ctx.font='11px monospace';ctx.fillText('SIGNATURE                 COPY 01',40,424);
        }else if(family===1){
            ctx.font='bold 23px monospace';ctx.fillText('PROPERTY REGISTER',40,129);
            ctx.font='12px monospace';ctx.fillText('ITEM   DESCRIPTION          REF.',44,165);
            ctx.strokeStyle='#767a72';ctx.lineWidth=1.6;
            for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(40,180+i*33);ctx.lineTo(471,180+i*33);ctx.stroke();}
            for(const at of [40,94,400,471]){ctx.beginPath();ctx.moveTo(at,145);ctx.lineTo(at,378);ctx.stroke();}
            ctx.font='15px monospace';['Case file','Statement','Dock receipt','Photograph'].forEach((t,i)=>{ctx.fillText('0'+(i+1),48,202+i*33);ctx.fillText(t,105,202+i*33);});
            ctx.font='bold 22px monospace';ctx.save();ctx.translate(290,428);ctx.rotate(-.08);ctx.fillText('RETAIN',0,0);ctx.restore();
        }else if(family===2){
            ctx.textAlign='center';ctx.font='bold 29px monospace';ctx.fillText('PIER 9',256,144);
            ctx.font='18px monospace';ctx.fillText('HARBOUR OFFICE',256,174);
            ctx.font='16px monospace';
            ['RECEIPT  0714','--------------------','STORAGE       12.00','TRANSFER       4.00','--------------------','TOTAL         16.00'].forEach((t,i)=>ctx.fillText(t,256,220+i*28));
            ctx.font='italic 18px serif';ctx.fillText('Payment outstanding',256,433);
        }else{
            // Original stylized evidence photograph: warehouse, quay and reflected windows.
            ctx.fillStyle='#303937';ctx.fillRect(43,112,426,274);
            ctx.fillStyle='#69706b';ctx.fillRect(43,112,426,104);
            ctx.fillStyle='#252d2e';ctx.fillRect(95,154,245,158);ctx.fillRect(353,187,116,125);
            ctx.fillStyle='#929387';for(let r=0;r<3;r++)for(let c=0;c<5;c++)ctx.fillRect(116+c*43,173+r*39,15,22);
            ctx.fillStyle='#151e20';ctx.fillRect(43,312,426,74);
            ctx.fillStyle='#59655f';for(let i=0;i<8;i++)ctx.fillRect(74+i*48,329+(i%3)*11,31,3);
            ctx.font='italic 22px serif';ctx.fillStyle='#343833';ctx.fillText('Loading door — after closing',44,424);
        }
        // One understated handling fold, not random dirt applied to every pixel.
        ctx.strokeStyle='rgba(57,51,42,.075)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(family===1?255:436,24);ctx.lineTo(family===1?257:456,488);ctx.stroke();
        ctx.restore();red.restore();
    }
    const texture=(source:HTMLCanvasElement)=>{
        const t=new THREE.CanvasTexture(source);t.colorSpace=THREE.SRGBColorSpace;
        t.anisotropy=4;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
        return t;
    };
    return {map:texture(canvas),edge:texture(mask)};
}
