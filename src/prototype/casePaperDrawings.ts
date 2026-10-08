/** The case papers' drawings: one noir case file (RD-0047) as twelve documents and four backs. Canvas2D shapes and
 * generic fonts only, deterministic (no Math.random). Every sheet has its own silhouette at a glance: block structure,
 * heading placement, density and one or two handling marks. No red anywhere: the red perimeter is the caller's. */
type C=CanvasRenderingContext2D;type R=()=>number;type Draw=(c:C,W:number,H:number,r:R,stock:string)=>void;

/** Nominal design size per family (the atlas sizes); drawPaper scales it to the caller's rectangle. */
const SIZE:readonly (readonly [number,number])[]=[[271,364],[279,364],[163,364],[364,311]];
const STOCK=[['#d2cfc3','#d8d5c9','#c9ccc4','#d0cdc1'],['#c6c8c1','#cdd0c3','#dcd8cc','#cacbc3'],
    ['#d4cbb7','#c9cfc3','#cbc4ad','#d2cab7'],['#dcd8cc','#d6d4cb','#d9d5c8','#d9d6cd']];
const INK='#2f312e',INK2='#3a3c38',PENCIL='#4b4f52',GREY='#686b65',FAINT='#80847d',STAMP='#4b5a6c',LIGHT='#dcdad0';
const MONO='monospace',SERIF='serif',SANS='sans-serif';

/** Draw one document onto `ctx` in local pixels (0,0)-(w,h), front (variant 0..2) or back (variant 3).
 * `family`: 0 witness statement / report page, 1 inventory / log form, 2 receipt / ticket strip, 3 photograph.
 * Do NOT draw the red perimeter: the caller draws it. Leave ~4% margin of plain stock at every edge for it. */
/** The plain stock colour of a document (its padding in the atlas). */
export function paperStock(family:number,variant:number):string {return STOCK[Math.max(0,Math.min(3,family|0))]![Math.max(0,Math.min(3,variant|0))]!;}

export function drawPaper(ctx:CanvasRenderingContext2D,family:number,variant:number,w:number,h:number):void {
    const f=Math.max(0,Math.min(3,family|0)),v=Math.max(0,Math.min(3,variant|0)),[W,H]=SIZE[f]!,stock=STOCK[f]![v]!;
    ctx.save();ctx.scale(w/W,h/H);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.setLineDash([]);ctx.lineCap='butt';ctx.lineJoin='miter';
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.fillStyle=stock;ctx.fillRect(0,0,W,H);
    (v===3?BACK[f]!:FRONT[f]![v]!)(ctx,W,H,rng(f*131+v*17+7),stock);
    ctx.restore();
}

const rng=(seed:number):R=>{let s=seed>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^s>>>15,1|s);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
function ln(c:C,x1:number,y1:number,x2:number,y2:number,col:string,lw=1){c.strokeStyle=col;c.lineWidth=lw;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function box(c:C,x:number,y:number,w:number,h:number,col:string,lw=1){c.strokeStyle=col;c.lineWidth=lw;c.strokeRect(x,y,w,h);}
function rect(c:C,x:number,y:number,w:number,h:number,col:string|CanvasGradient){c.fillStyle=col;c.fillRect(x,y,w,h);}
function poly(c:C,pts:readonly number[],col:string|CanvasGradient){c.fillStyle=col;c.beginPath();c.moveTo(pts[0]!,pts[1]!);
    for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i]!,pts[i+1]!);c.closePath();c.fill();}
function disc(c:C,x:number,y:number,rad:number,col:string){c.fillStyle=col;c.beginPath();c.arc(x,y,rad,0,Math.PI*2);c.fill();}
function tx(c:C,t:string,x:number,y:number,font:string,col=INK,align:CanvasTextAlign='left',max=0){
    c.font=font;c.fillStyle=col;c.textAlign=align;if(max)c.fillText(t,x,y,max);else c.fillText(t,x,y);c.textAlign='left';}
/** Typewriter line: each strike a little uneven in weight and height. Returns the character advance. */
function typed(c:C,t:string,x:number,y:number,size:number,r:R,col=INK,bold=false):number {
    c.font=`${bold?'bold ':''}${size}px ${MONO}`;c.fillStyle=col;const adv=c.measureText('M').width;
    for(let i=0;i<t.length;i++){if(t[i]===' ')continue;c.globalAlpha=.74+r()*.26;c.fillText(t[i]!,x+i*adv,y+(r()-.5)*.7);}
    c.globalAlpha=1;return adv;
}
/** Handwriting: slanted italic words that wander off the baseline; squeezed to `max`. Returns the drawn width. */
function hand(c:C,t:string,x:number,y:number,size:number,col:string,r:R,max=999,rot=0,weight='500 '):number {
    c.save();c.translate(x,y);c.rotate(rot);c.font=`italic ${weight}${size}px ${SERIF}`;c.fillStyle=col;
    const words=t.split(' '),sp=c.measureText(' ').width*1.15,widths=words.map(w=>c.measureText(w).width);
    const total=widths.reduce((a,b)=>a+b,0)+sp*(words.length-1),k=Math.min(1,max/total);let at=0;
    words.forEach((w,i)=>{c.save();c.translate(at*k,(r()-.5)*size*.16);c.rotate((r()-.5)*.06);c.transform(k,0,-.2,1,0,0);
        c.fillText(w,0,0);c.restore();at+=widths[i]!+sp;});
    c.restore();return total*k;
}
/** A single pressed fold: a soft valley shadow on one side, a lit ridge on the other. */
function crease(c:C,x1:number,y1:number,x2:number,y2:number,depth=9,strength=1){
    const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy),nx=-dy/l,ny=dx/l;
    const g=c.createLinearGradient(x1,y1,x1+nx*depth,y1+ny*depth);
    g.addColorStop(0,`rgba(46,42,34,${.11*strength})`);g.addColorStop(1,'rgba(46,42,34,0)');
    poly(c,[x1,y1,x2,y2,x2+nx*depth,y2+ny*depth,x1+nx*depth,y1+ny*depth],g);
    ln(c,x1,y1,x2,y2,`rgba(52,48,40,${.26*strength})`,.9);
    ln(c,x1-nx*1.2,y1-ny*1.2,x2-nx*1.2,y2-ny*1.2,`rgba(255,255,248,${.4*strength})`,1.1);
}
/** A cup set down twice: a broken tide-line ring and a faint second arc. */
function coffeeRing(c:C,x:number,y:number,rad:number,r:R){
    disc(c,x,y,rad,'rgba(110,90,64,.07)');c.lineCap='round';
    for(let i=0;i<12;i++){const a=.9+i*.43+r()*.15,b=a+.34+r()*.16;c.strokeStyle=`rgba(92,70,46,${.28+r()*.26})`;
        c.lineWidth=1.4+r()*2.6;c.beginPath();c.arc(x+(r()-.5)*.8,y+(r()-.5)*.8,rad+(r()-.5)*1.6,a,b);c.stroke();}
    c.strokeStyle='rgba(96,74,50,.13)';c.lineWidth=1.2;c.beginPath();c.arc(x+10,y-7,rad*.96,2.3,5.4);c.stroke();c.lineCap='butt';
}
function thumbprint(c:C,x:number,y:number,rad:number,rot:number,alpha=.1){
    c.save();c.translate(x,y);c.rotate(rot);c.scale(1,1.3);c.strokeStyle=`rgba(50,50,46,${alpha})`;c.lineWidth=.9;
    for(let k=2;k<rad;k+=2.3){c.beginPath();c.arc(0,0,k,.4+k*.12,5.8+k*.04);c.stroke();}c.restore();
}
function grease(c:C,x:number,y:number,rad:number,r:R){
    for(let i=0;i<5;i++){const px=x+(r()-.5)*rad*.8,py=y+(r()-.5)*rad*.6,pr=rad*(.45+r()*.45);
        const g=c.createRadialGradient(px,py,0,px,py,pr);g.addColorStop(0,'rgba(128,122,88,.15)');g.addColorStop(.75,'rgba(128,122,88,.08)');
        g.addColorStop(1,'rgba(128,122,88,0)');c.fillStyle=g;c.beginPath();c.arc(px,py,pr,0,Math.PI*2);c.fill();}
}
/** Rubber stamp, double frame, worn with flecks of the paper showing through. */
function stamp(c:C,x:number,y:number,rot:number,w:number,h:number,a:string,fa:string,ya:number,b:string,fb:string,yb:number,col:string,stock:string,r:R){
    c.save();c.translate(x,y);c.rotate(rot);c.globalAlpha=.86;
    box(c,-w/2,-h/2,w,h,col,2.6);box(c,-w/2+4,-h/2+4,w-8,h-8,col,1);
    c.textAlign='center';c.fillStyle=col;c.font=fa;c.fillText(a,0,ya,w-16);c.font=fb;c.fillText(b,0,yb,w-16);
    c.textAlign='left';c.fillStyle=stock;
    for(let i=0;i<60;i++){c.globalAlpha=.3+r()*.55;c.beginPath();c.arc((r()-.5)*w,(r()-.5)*h,.3+r()*1.1,0,Math.PI*2);c.fill();}
    c.restore();
}
/** The precinct's small evidence label, stuck on the documents that did not start as police paper. */
function tag(c:C,x:number,y:number,rot:number,w:number,r:R){
    c.save();c.translate(x,y);c.rotate(rot);rect(c,1.5,2,w,21,'rgba(0,0,0,.13)');rect(c,0,0,w,21,'#e3e1d8');
    box(c,.5,.5,w-1,20,'#7b7e77',1);c.strokeStyle='#7b7e77';c.beginPath();c.arc(7,10.5,2.4,0,Math.PI*2);c.stroke();
    tx(c,'EVIDENCE',14,8,`bold 5.5px ${SANS}`,GREY);typed(c,'RD-0047',14,18,8,r,INK,true);c.restore();
}
function paperClip(c:C,x:number,y:number){
    const wire=(dx:number,dy:number,col:string,lw:number)=>{const X=(v:number)=>x+dx+v,Y=(v:number)=>y+dy+v;
        c.strokeStyle=col;c.lineWidth=lw;c.lineCap='round';c.beginPath();
        c.moveTo(X(9),Y(20));c.lineTo(X(9),Y(46));c.arc(X(6.75),Y(46),2.25,0,Math.PI);
        c.lineTo(X(4.5),Y(7));c.arc(X(9.25),Y(7),4.75,Math.PI,0);
        c.lineTo(X(14),Y(52));c.arc(X(7),Y(52),7,0,Math.PI);c.lineTo(X(0),Y(22));c.stroke();c.lineCap='butt';};
    wire(2.6,3.2,'rgba(28,30,26,.24)',2.6);wire(0,0,'#646862',2);wire(-.5,-.5,'rgba(226,228,220,.75)',.7);
}
function punchHole(c:C,x:number,y:number){
    disc(c,x+.7,y+.9,8,'rgba(60,58,50,.10)');disc(c,x,y,6.2,'#2c2e2b');
    c.strokeStyle='rgba(128,126,116,.85)';c.lineWidth=1.3;c.beginPath();c.arc(x,y,5.5,.25,2.9);c.stroke();
}
function anchor(c:C,x:number,y:number,s:number,col:string){
    c.save();c.translate(x,y);c.scale(s,s);c.strokeStyle=col;c.lineWidth=1.7;c.beginPath();c.arc(0,-9,2.3,0,Math.PI*2);
    c.moveTo(0,-6.7);c.lineTo(0,9.5);c.moveTo(-5.5,-3.5);c.lineTo(5.5,-3.5);
    c.moveTo(-8.5,2.5);c.quadraticCurveTo(-7,9.5,0,9.5);c.quadraticCurveTo(7,9.5,8.5,2.5);
    c.moveTo(-8.5,2.5);c.lineTo(-10,5);c.moveTo(8.5,2.5);c.lineTo(10,5);c.stroke();c.restore();
}
function dashes(c:C,x1:number,x2:number,y:number,col:string,lw=1){c.setLineDash([3,2.5]);ln(c,x1,y,x2,y,col,lw);c.setLineDash([]);}
/** Rows of mirrored word blocks: ink bleeding faintly through from the other side. */
function bleed(c:C,x:number,y:number,width:number,lines:number,step:number,r:R,alpha:number,skip:readonly number[]=[]){
    for(let i=0;i<lines;i++){if(skip.includes(i))continue;const end=x+width*(.55+r()*.45);let at=x+(r()<.25?16:0);
        while(at<end){const word=6+r()*24;c.fillStyle=`rgba(40,42,38,${alpha*(.7+r()*.3)})`;c.fillRect(at,y+i*step-4,Math.min(word,end-at),4.2);at+=word+4.5;}}
}
/** A rat standing upright in coat and fedora, snout to the left, feet at (x, y); about 40 px tall at s = 1. */
function ratSilhouette(c:C,x:number,y:number,s:number,col:string){
    c.save();c.translate(x,y);c.scale(s,s);c.fillStyle=col;c.strokeStyle=col;c.lineCap='round';
    c.lineWidth=1.8;c.beginPath();c.moveTo(5,-9);c.quadraticCurveTo(14,-8,17,-2);c.quadraticCurveTo(19,1,24,0);c.stroke();
    c.fillRect(-4.5,-9,3,9);c.fillRect(1,-9,3,9);c.fillRect(-6.5,-1.2,5,1.6);c.fillRect(1,-1.2,5,1.6);
    poly(c,[-8,-8,8,-8,5.5,-27,-5.5,-27],col);
    c.beginPath();c.ellipse(-.5,-30.5,5.2,4.6,0,0,Math.PI*2);c.fill();
    poly(c,[-4,-32,-12,-29,-11.5,-28,-4,-27],col);disc(c,-12,-28.6,1.1,col);
    disc(c,3.6,-34,2.6,col);
    c.beginPath();c.ellipse(-.5,-34.4,8.5,1.7,0,0,Math.PI*2);c.fill();
    c.beginPath();c.moveTo(-5,-34.5);c.lineTo(-4.5,-40);c.quadraticCurveTo(-.5,-42,3.5,-40);c.lineTo(4,-34.5);c.fill();
    c.lineCap='butt';c.restore();
}

// ---- family 0: statement / report pages (271 x 364) ----

const statement:Draw=(c,W,_H,r)=>{
    seal(c,W/2,44,18);
    tx(c,'CITY POLICE',22,40,`bold 7.5px ${MONO}`,INK2);tx(c,'DETECTIVE BUREAU',22,50,`7px ${MONO}`,INK2);
    tx(c,'FILE',W-22,40,`7px ${MONO}`,INK2,'right');tx(c,'RD-0047',W-22,50,`bold 7.5px ${MONO}`,INK2,'right');
    tx(c,'WITNESS STATEMENT',W/2,82,`bold 17px ${MONO}`,INK,'center',W-44);rect(c,22,88,W-44,2.6,INK);ln(c,22,92.5,W-22,92.5,INK,.7);
    const field=(l:string,v:string,x:number,y:number)=>{tx(c,l,x,y,`6.5px ${MONO}`,GREY);typed(c,v,x+c.measureText(l).width+4,y,8.5,r);};
    field('NAME','J. MARLOW',22,106);field('AGE','41',160,106);field('ADDRESS','12 QUAY ROAD, FLAT 3',22,118);
    field('TAKEN BY','DET. SGT. O. HOLLIS',22,130);field('TIME','23:55',192,130);ln(c,22,136,W-22,136,FAINT,.7);
    const body=['I was at Pier 9 a little after eleven.','The harbour office light was still on.','A clerk carried a brown case out by the',
        'loading door and set it down on a crate.','He did not sign the transfer book.','','   A rat in a grey hat came up the quay',
        'steps. They talked. The clerk went back','inside; the case went with the hat, up','Canal Street toward the all-night diner.',
        'A car stood at the curb. The plate was','wet and I could not read it.','   I make this statement freely.'];
    let adv=0;body.forEach((t,i)=>{adv=typed(c,t,22,153+i*11.6,9,r);});
    ln(c,22+16*adv,150,22+37*adv,149.5,INK,1.1);hand(c,'11.40 pm',22+22*adv,143.5,10,INK,r,60,-.03,'600 ');
    tx(c,'WITNESSED  O. HOLLIS',22,322,`6.5px ${MONO}`,INK2);tx(c,'PAGE 1 OF 2',22,332,`6.5px ${MONO}`,GREY);
    hand(c,'J. Marlow',146,316,20,INK,r,100,-.05,'600 ');ln(c,138,322,W-22,322,INK2,.9);
    tx(c,'SIGNATURE OF WITNESS',138,331,`6px ${MONO}`,GREY);
    crease(c,13,212,W-13,215,8);
};
/** Precinct seal: a seven-point star inside a double ring. */
function seal(c:C,x:number,y:number,rad:number){
    c.strokeStyle=INK;c.lineWidth=1.8;c.beginPath();c.arc(x,y,rad,0,Math.PI*2);c.stroke();c.lineWidth=.8;c.beginPath();c.arc(x,y,rad-3.5,0,Math.PI*2);c.stroke();
    const pts:number[]=[];for(let i=0;i<14;i++){const a=-Math.PI/2+i*Math.PI/7,k=i%2?rad*.36:rad*.74;pts.push(x+Math.cos(a)*k,y+Math.sin(a)*k);}
    poly(c,pts,INK);disc(c,x,y,rad*.22,LIGHT);disc(c,x,y,rad*.12,INK);
}

const continuation:Draw=(c,W,H,r)=>{
    for(let y=52;y<=H-24;y+=17)ln(c,13,y,W-13,y,'rgba(98,116,128,.36)',.8);
    ln(c,42,17,42,H-17,'rgba(98,110,118,.42)',.9);
    hand(c,"Statement — cont'd",48,40,16,INK,r,150,-.02,'600 ');
    c.strokeStyle=INK;c.lineWidth=1.1;c.beginPath();c.moveTo(48,45);c.quadraticCurveTo(110,43,176,46);c.stroke();
    hand(c,'p. 2',W-44,39,13,PENCIL,r,30,-.04);
    c.save();c.translate(31,250);c.rotate(-Math.PI/2);hand(c,'file RD-0047',0,0,9.5,PENCIL,r,80);c.restore();
    const lines=['...and the second rat took the case','without a word. Went north up Canal.','I kept back, as far as the diner. He',
        'sat by the window. Coffee, then pie.','Paid cash. Left a ticket on the counter,','','','','He kept looking up at the alley.',
        'Somebody was watching from up there,','on the fire escape. I am sure of it.'];
    const at=(i:number)=>52+17*(i+1)-3,rot=(i:number)=>-.012-i*.0009,x=(i:number)=>48+(i%3)*1.5;
    lines.forEach((t,i)=>{if(t)hand(c,t,x(i),at(i),13.5,PENCIL,r,W-x(i)-18,rot(i),'600 ');});
    const a=hand(c,'a pawn ticket I think. No.',x(5),at(5),13,PENCIL,r,160,rot(5),'600 ');
    const b=hand(c,'3318?',x(5)+a+6,at(5)-1,13,INK,r,60,rot(5),'700 ');
    c.strokeStyle=INK;c.lineWidth=1.1;c.beginPath();c.ellipse(x(5)+a+6+b/2,at(5)-5,b/2+7,10,-.05,.3,6.9);c.stroke();
    const u=hand(c,'The clerk is called Voss.',x(7),at(7),13,PENCIL,r,180,rot(7),'600 '),v=hand(c,'Vass?',x(7)+u+9,at(7)-2,13,PENCIL,r,60,rot(7),'600 ');
    ln(c,x(7)+u+7,at(7)-6,x(7)+u+11+v,at(7)-7.5,PENCIL,1.3);
    hand(c,'— J. M.',W-92,at(12),14,INK,r,70,-.03,'600 ');
    coffeeRing(c,190,252,36,r);
};

const report:Draw=(c,W,_H,r,stock)=>{
    const L=16,Rt=W-16;
    rect(c,L,22,Rt-L,28,INK);tx(c,'INCIDENT REPORT',L+8,41,`bold 14px ${MONO}`,LIGHT,'left',150);
    tx(c,'FORM 7-B',Rt-6,40,`7px ${MONO}`,'#a6a79f','right');
    tx(c,'CITY POLICE DEPARTMENT · 4TH PRECINCT',L,61,`6.5px ${MONO}`,INK2);
    const cell=(x:number,y:number,w:number,h:number,label:string,value='',size=9.5)=>{box(c,x,y,w,h,INK2,1);
        tx(c,label,x+3,y+7.5,`bold 5.5px ${SANS}`,GREY);if(value)typed(c,value,x+4,y+h-6,size,r);};
    let y=66;
    cell(L,y,92,24,'REPORT No.','RD-0047');cell(L+92,y,78,24,'DATE','6 OCT');cell(L+170,y,Rt-L-170,24,'TIME','23:40');y+=24;
    cell(L,y,Rt-L,24,'LOCATION','PIER 9, QUAY ROAD');y+=24;
    cell(L,y,150,24,'OFFENCE','THEFT: ATTACHE CASE');cell(L+150,y,Rt-L-150,24,'VALUE','UNKNOWN',8);y+=24;
    box(c,L,y,Rt-L,22,INK2,1);
    ['ARREST','INCIDENT','FOLLOW-UP'].forEach((t,i)=>{const x=L+8+i*78;box(c,x,y+7,8,8,INK,1.1);
        if(i===1)tx(c,'X',x+1.3,y+14.6,`bold 9px ${MONO}`,INK);tx(c,t,x+12,y+14.5,`7px ${MONO}`,INK2);});y+=22;
    cell(L,y,150,24,'COMPLAINANT','E. VOSS, HARBOUR OFF.',8.5);cell(L+150,y,Rt-L-150,24,'PHONE','KL 5-0147',8.5);y+=24;
    cell(L,y,Rt-L,24,'SUSPECT','RAT, GREY FEDORA, LONG COAT');y+=24;
    box(c,L,y,Rt-L,90,INK2,1);tx(c,'NARRATIVE',L+3,y+7.5,`bold 5.5px ${SANS}`,GREY);
    ['Case removed by loading door after','closing. Transfer book not signed.','Clerk states he was sent off the pier.',
        'Witness statement attached (2 pp.).','Photographs 1-3 to follow. See log.'].forEach((t,i)=>{
        ln(c,L+4,y+27+i*14,Rt-4,y+27+i*14,'rgba(80,84,78,.22)',.6);typed(c,t,L+5,y+24+i*14,8.5,r);});y+=90;
    cell(L,y,160,32,'REPORTING OFFICER');hand(c,'O. Hollis',L+14,y+26,16,INK,r,120,-.03,'600 ');cell(L+160,y,Rt-L-160,32,'BADGE','212');
    stamp(c,182,262,-.2,106,48,'FILED',`bold 24px ${MONO}`,5,'7 OCT · RECORDS',`bold 7px ${MONO}`,16,STAMP,stock,r);
    ln(c,19.5,18.5,32.5,29.5,'rgba(20,20,18,.45)',2.4);ln(c,18,17,31,28,'#a9ada6',1.8);
};

// ---- family 1: forms (279 x 364) ----

const register:Draw=(c,W,H,r)=>{
    const L=18,Rt=W-18;
    ln(c,L,26,Rt,26,INK,1.6);ln(c,L,29,Rt,29,INK,.7);
    tx(c,'PROPERTY REGISTER',W/2,46,`bold 15px ${MONO}`,INK,'center',Rt-L);
    ln(c,L,53,Rt,53,INK,.7);ln(c,L,56,Rt,56,INK,1.6);
    tx(c,'4TH PRECINCT · PROPERTY ROOM',L,68,`6.5px ${MONO}`,INK2);tx(c,'BOOK 12 · P.47',Rt,68,`6.5px ${MONO}`,INK2,'right');
    const top=76,row=18,rows=13,cols=[L,46,176,222,Rt],bot=top+16+rows*row;
    rect(c,L,top,Rt-L,16,INK2);
    ['No.','DESCRIPTION','RECEIVED','REF.'].forEach((t,i)=>tx(c,t,cols[i]!+4,top+11,`bold 7px ${MONO}`,LIGHT));
    for(let i=1;i<=rows;i++)ln(c,L,top+16+i*row,Rt,top+16+i*row,'#7a7e76',i===rows?1.4:.8);
    cols.forEach((x,i)=>ln(c,x,top,x,bot,'#6f736b',i===0||i===4?1.4:.9));
    const items=[['Transfer book, Pier 9','06/10','A-1'],['Statement, J. Marlow','06/10','A-2'],['Receipt No. 0714','07/10','A-3'],
        ['Photographs (3)','07/10','A-4'],['Guest check 4471','07/10','A-5'],['Pawn ticket 3318','07/10','A-6'],['Attache case, brown','','']];
    for(let i=0;i<rows;i++){const y=top+16+i*row+12.5,it=items[i];typed(c,String(i+1).padStart(2,'0'),cols[0]!+6,y,8,r,INK2);
        if(it){typed(c,it[0]!,cols[1]!+4,y,8,r);typed(c,it[1]!,cols[2]!+4,y,8,r);typed(c,it[2]!,cols[3]!+6,y,8,r);}}
    const miss=top+16+6*row+13.5;hand(c,'MISSING',cols[2]!+6,miss,12,PENCIL,r,76,-.05,'700 ');ln(c,cols[2]!+5,miss+2.5,cols[2]!+74,miss-1.2,PENCIL,1);
    tx(c,'CLERK',L,343,`6.5px ${MONO}`,GREY);ln(c,L+26,344,L+110,344,INK2,.8);hand(c,'R. Kane',L+34,341,13,INK,r,70,-.03,'600 ');
    c.save();c.translate(204,344);c.rotate(-.08);tx(c,'RETAIN',0,0,`bold 15px ${MONO}`,INK);c.restore();
    crease(c,W*.5,15,W*.5+1.5,H-15,10,.9);
};

const evidenceLog:Draw=(c,W,_H,r)=>{
    const L=18,Rt=W-18;
    box(c,L,24,124,28,INK,1.8);tx(c,'EVIDENCE LOG',L+7,43,`bold 13px ${MONO}`,INK,'left',112);
    tx(c,'CASE  RD-0047',Rt,34,`bold 8px ${MONO}`,INK2,'right');tx(c,'SHEET 2 OF 3',Rt,47,`8px ${MONO}`,INK2,'right');
    const top=64,row=17,rows=15,cols=[L,56,92,204,Rt],bot=top+16+rows*row,grid='#87907f';
    rect(c,L,top,Rt-L,16,'#97a08f');for(let i=0;i<rows;i+=2)rect(c,L,top+16+i*row,Rt-L,row,'rgba(112,134,106,.2)');
    ['DATE','TIME','ITEM','BY'].forEach((t,i)=>tx(c,t,cols[i]!+3,top+11,`bold 6.5px ${MONO}`,INK));
    for(let i=0;i<=rows;i++)ln(c,L,top+16+i*row,Rt,top+16+i*row,grid,i===0?1.4:.75);ln(c,L,top,Rt,top,grid,1.4);
    cols.forEach(x=>ln(c,x,top,x,bot,grid,.9));
    const e=[['6/10','23:55','Statement, Marlow','OH'],['6/10','00:20','Transfer book, Pier 9','OH'],['7/10','01:05','Receipt 0714','RK'],
        ['7/10','02:10','Photos x3 to the lab','RK'],['7/10','08:30','Guest check, diner','OH'],['7/10','09:15','Pawn ticket 3318','OH'],
        ['7/10','09:40','CASE: not logged!','OH'],['7/10','11:00','see custody sheet','RK']];
    e.forEach((row4,i)=>{const y=top+16+i*row+12.5,col=i>=6?PENCIL:INK;
        hand(c,row4[0]!,cols[0]!+5,y,10.5,col,r,32,0,'600 ');hand(c,row4[1]!,cols[1]!+4,y,10.5,col,r,30,0,'600 ');
        const w=hand(c,row4[2]!,cols[2]!+4,y,10.5,col,r,106,-.01,'600 ');hand(c,row4[3]!,cols[3]!+12,y,10.5,col,r,40,0,'600 ');
        if(i===6)ln(c,cols[2]!+4,y+2.5,cols[2]!+6+w,y+1.5,col,1.1);});
    paperClip(c,160,16);
};

const custody:Draw=(c,W,H,r)=>{
    [72,182,292].forEach(y=>punchHole(c,24,y));ln(c,40,15,40,H-15,'rgba(70,74,68,.38)',.8);
    tx(c,'CHAIN OF CUSTODY',(46+W-16)/2,42,`bold 15px ${SANS}`,INK,'center',W-70);ln(c,46,49,W-16,49,INK,2.6);
    typed(c,'ITEM 03 - ATTACHE CASE, BROWN LEATHER',48,63,7.5,r);typed(c,'CASE RD-0047      TAG 0047-03',48,75,7.5,r);
    const d=[['E. Voss','M. Dray','5 OCT 17:10','STORAGE'],['M. Dray','E. Voss','6 OCT 22:45','RETURN'],['E. Voss','','6 OCT 23:40','TRANSFER'],['','','',''],['','','','']];
    const top=84,step=50,L=46,M=154,Rt=W-16;
    d.forEach((row4,i)=>{const y=top+i*step;ln(c,L,y,Rt,y,INK,1.7);ln(c,M,y,M,y+33,INK2,.8);
        tx(c,'RELEASED BY',L+2,y+9,`bold 5.5px ${SANS}`,GREY);tx(c,'RECEIVED BY',M+4,y+9,`bold 5.5px ${SANS}`,GREY);
        ln(c,L+2,y+31,M-6,y+31,FAINT,.7);ln(c,M+4,y+31,Rt-2,y+31,FAINT,.7);
        tx(c,'DATE / TIME',L+2,y+43,`bold 5.5px ${SANS}`,GREY);tx(c,'PURPOSE',M+4,y+43,`bold 5.5px ${SANS}`,GREY);
        if(row4[0])hand(c,row4[0],L+10,y+28,15,INK,r,90,-.03,'600 ');if(row4[1])hand(c,row4[1],M+12,y+28,15,INK,r,90,-.03,'600 ');
        if(row4[2])typed(c,row4[2],L+40,y+43.5,7.5,r);if(row4[3])typed(c,row4[3],M+34,y+43.5,7.5,r);});
    ln(c,L,top+5*step,Rt,top+5*step,INK,1.7);
    hand(c,'? who',M+40,top+2*step+27,15,PENCIL,r,60,-.08,'600 ');
    // A bottom corner bent back and handled: a diagonal crease, the corner a shade darker beyond it.
    poly(c,[W-74,H,W,H-66,W,H],'rgba(70,66,56,.13)');
    crease(c,W-74,H,W,H-66,7,1.3);
    thumbprint(c,W-30,H-24,10,.6,.08);
};

// ---- family 2: strips (163 x 364) ----

const harbourReceipt:Draw=(c,W,H,r)=>{
    const L=13,Rt=W-13,mid=W/2;
    anchor(c,mid,37,1.15,INK);
    tx(c,'PIER 9',mid,74,`bold 25px ${MONO}`,INK,'center',Rt-L);tx(c,'HARBOUR OFFICE',mid,89,`bold 10px ${MONO}`,INK,'center',Rt-L);
    tx(c,'QUAY ROAD · KL 5-0147',mid,101,`6.5px ${MONO}`,INK2,'center');dashes(c,L,Rt,110,INK2);
    tx(c,'RECEIPT No. 0714',mid,126,`9px ${MONO}`,INK,'center');
    tx(c,'6 OCT',L,140,`9px ${MONO}`,INK);tx(c,'23:40',Rt,140,`9px ${MONO}`,INK,'right');dashes(c,L,Rt,149,INK2);
    [['STORAGE','12.00'],['TRANSFER','4.00'],['AFTER HRS','2.50']].forEach(([a,b],i)=>{
        typed(c,a!,L,167+i*16,10,r);tx(c,b!,Rt,167+i*16,`10px ${MONO}`,INK,'right');});
    dashes(c,L,Rt,210,INK2);
    tx(c,'TOTAL',L,229,`bold 12.5px ${MONO}`,INK);tx(c,'18.50',Rt,229,`bold 12.5px ${MONO}`,INK,'right');
    ln(c,L,236,Rt,236,INK,1);ln(c,L,239,Rt,239,INK,1);
    tx(c,'RECEIVED BY',L,258,`6.5px ${MONO}`,GREY);ln(c,L+50,259,Rt,259,INK2,.7);hand(c,'E.V.',L+70,256,13,INK,r,40,-.05,'600 ');
    hand(c,'Payment outstanding',L+3,284,12.5,PENCIL,r,Rt-L-6,-.05,'600 ');
    tag(c,L+1,298,-.05,64,r);
    const g=c.createLinearGradient(0,312,0,H-15);g.addColorStop(0,'rgba(40,36,28,0)');g.addColorStop(.6,'rgba(40,36,28,.05)');g.addColorStop(1,'rgba(40,36,28,.17)');
    rect(c,7,312,W-14,H-15-312,g);
};

const dinerCheck:Draw=(c,W,_H,r)=>{
    const L=12,Rt=W-12,mid=W/2,green='#8d998b';
    rect(c,L,22,Rt-L,32,'#30332f');tx(c,'ALL-NITE',mid,34.5,`bold 9px ${MONO}`,LIGHT,'center');
    tx(c,'DINER',mid,50,`bold 17px ${SERIF}`,LIGHT,'center');tx(c,'CANAL ST. · OPEN ALL NIGHT',mid,64,`6px ${MONO}`,INK2,'center');
    tx(c,'GUEST CHECK',L,79,`bold 8.5px ${MONO}`,INK);tx(c,'No 4471',Rt,79,`bold 8.5px ${MONO}`,INK2,'right');
    const cw=(Rt-L)/3;['TABLE','GUESTS','SERVER'].forEach((t,i)=>{box(c,L+i*cw,84,cw,20,INK2,.9);tx(c,t,L+i*cw+3,91,`5.5px ${SANS}`,GREY);});
    hand(c,'7',L+18,101,12,INK,r,20,0,'600 ');hand(c,'1',L+cw+18,101,12,INK,r,20,0,'600 ');hand(c,'Dot',L+2*cw+12,101,12,INK,r,30,0,'600 ');
    for(let y=122;y<=284;y+=18)ln(c,L,y,Rt,y,green,.8);ln(c,116,108,116,284,green,.9);
    [['Coffee','.05'],['Apple pie','.15'],['Coffee','.05'],['Coffee','.05'],['Coffee','.05'],['',''],['Tax','.01']].forEach(([a,b],i)=>{
        if(!a)return;hand(c,a,L+5,119+i*18,12,INK2,r,98,-.01,'600 ');hand(c,b!,122,119+i*18,12,INK2,r,26,0,'600 ');});
    box(c,L,292,Rt-L,26,INK,1.6);tx(c,'TOTAL',L+5,309,`bold 8.5px ${MONO}`,INK);hand(c,'.36',108,313,17,INK,r,34,-.03,'700 ');
    hand(c,'tip .10',L+3,336,11,PENCIL,r,50,-.04,'600 ');hand(c,'RD-0047',Rt-46,338,9,PENCIL,r,46,-.04,'600 ');
    grease(c,102,182,27,r);
};

const pawnTicket:Draw=(c,W,_H,r)=>{
    const L=13,Rt=W-13,mid=W/2,perf=(y:number)=>{for(let x=L;x<=Rt;x+=5.6)disc(c,x,y,1.35,'#3a3934');};
    rect(c,7,16,W-14,11,'rgba(60,50,30,.07)');perf(27);
    tx(c,'KESSLER',mid,48,`bold 14px ${MONO}`,INK,'center');tx(c,'LOANS · PAWN · JEWELRY',mid,59,`6.5px ${MONO}`,INK2,'center');
    tx(c,'41 CANAL STREET',mid,69,`6px ${MONO}`,GREY,'center');ln(c,L,76,Rt,76,INK,2);
    tx(c,'No.',L+1,92,`bold 8px ${MONO}`,INK2);tx(c,'3318',mid,126,`bold 40px ${SANS}`,INK,'center',Rt-L);ln(c,L,134,Rt,134,INK2,.8);
    tx(c,'ARTICLE',L,146,`bold 5.5px ${SANS}`,GREY);hand(c,'Key, brass. No. 9',L+3,161,12,INK,r,Rt-L-6,-.02,'600 ');
    tx(c,'LOAN',L,176,`bold 5.5px ${SANS}`,GREY);hand(c,'$ 4.00',L+3,192,14,INK,r,60,-.02,'600 ');
    tx(c,'DUE',L+76,176,`bold 5.5px ${SANS}`,GREY);hand(c,'6 Nov',L+79,192,13,INK,r,50,-.02,'600 ');
    typed(c,'PLEDGED 7 OCT',L,207,7,r,INK2);tx(c,'INTEREST 3% PER MONTH',L,218,`6px ${MONO}`,GREY);
    rect(c,L,226,Rt-L,20,INK);tx(c,'NOT TRANSFERABLE',mid,239.5,`bold 9.5px ${MONO}`,LIGHT,'center',Rt-L-6);
    ['Goods unredeemed in 30 days','will be sold. Bearer must','present this ticket.'].forEach((t,i)=>tx(c,t,L,257+i*8,`5.5px ${MONO}`,INK2,'left',Rt-L));
    perf(286);tx(c,'STUB',L,301,`bold 5.5px ${SANS}`,GREY);
    tx(c,'3318',mid,320,`bold 20px ${SANS}`,INK,'center');tx(c,'KEY, BRASS',mid,332,`6.5px ${MONO}`,INK2,'center');
    hand(c,'RD-0047',L+1,345,9,PENCIL,r,46,-.03,'600 ');
    crease(c,Rt-20,349,Rt+5,318,6,.9);
};

// ---- family 3: photographs (364 x 311) ----

/** Print with a white border, the night image, a vignette and a pencilled caption in the wide bottom border. */
function photo(scene:(c:C,w:number,h:number,r:R)=>void,caption:string,no:string,mark:(c:C,W:number,H:number,r:R)=>void):Draw {
    return (c,W,H,r)=>{
        const x=26,y=24,w=W-52,h=206;
        c.save();c.translate(x,y);c.beginPath();c.rect(0,0,w,h);c.clip();scene(c,w,h,r);
        const g=c.createRadialGradient(w/2,h/2,h*.32,w/2,h/2,w*.62);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.45)');
        rect(c,0,0,w,h,g);c.restore();box(c,x+.5,y+.5,w-1,h-1,'rgba(0,0,0,.4)',1);
        hand(c,caption,x+6,y+h+38,18,INK2,r,w-96,-.025,'600 ');tx(c,no,x+w,H-17,`7px ${MONO}`,GREY,'right');
        mark(c,W,H,r);
    };
}
const sky=(c:C,w:number,h:number,a:string,b:string)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,a);g.addColorStop(1,b);rect(c,0,0,w,h,g);};

function warehouse(c:C,w:number,h:number,r:R){
    sky(c,w,100,'#5a615e','#3a4240');
    c.strokeStyle='#2a3231';c.lineWidth=2.4;c.beginPath();c.moveTo(266,100);c.lineTo(266,16);c.lineTo(w,16);c.moveTo(266,16);c.lineTo(238,30);
    c.moveTo(266,44);c.lineTo(294,16);c.moveTo(266,72);c.lineTo(294,44);c.lineTo(294,16);c.stroke();
    rect(c,0,40,240,140,'#262d2e');rect(c,0,35,240,6,'#1b2122');
    tx(c,'PIER 9  ·  BONDED STORES',14,61,`bold 12px ${SANS}`,'rgba(154,160,152,.55)');
    for(let i=0;i<6;i++)rect(c,14+i*37,72,15,10,i===1||i===4?'#a7a99d':'#384040');
    const dx=72,dy=96,dw=100,dh=80;
    rect(c,dx-5,dy-5,dw+10,dh+5,'#181e1f');
    const inside=c.createLinearGradient(0,dy+50,0,dy+dh);inside.addColorStop(0,'#8f928a');inside.addColorStop(1,'#cbccc1');rect(c,dx,dy+50,dw,dh-50,inside);
    rect(c,dx+58,dy+60,24,20,'#555a54');rect(c,dx+63,dy+52,15,8,'#626760');
    rect(c,dx,dy,dw,50,'#3e4645');for(let yy=dy+4;yy<dy+50;yy+=5)ln(c,dx,yy,dx+dw,yy,'#29302f',1);rect(c,dx,dy+47,dw,3.5,'#1d2324');
    poly(c,[dx,dy+dh,dx+dw,dy+dh,dx+dw+40,h,dx-34,h],'rgba(205,206,192,.2)');
    poly(c,[dx+dw/2-3,dy-11,dx+dw/2+3,dy-11,dx+dw/2+30,dy+50,dx+dw/2-30,dy+50],'rgba(210,210,198,.09)');
    rect(c,dx+dw/2-6,dy-16,12,5,'#141819');disc(c,dx+dw/2,dy-10,2.2,'#d9d9cd');
    rect(c,24,148,36,28,'#1a2021');box(c,24.5,148.5,35,27,'#454d4c',.8);rect(c,31,126,25,22,'#1d2324');box(c,31.5,126.5,24,21,'#454d4c',.8);
    rect(c,240,98,w-240,80,'#1b2122');rect(c,240,94,w-240,5,'#141a1b');rect(c,256,116,18,12,'#3a4241');
    rect(c,0,176,w,9,'#3d4544');ln(c,0,185,w,185,'#5e6663',1.3);rect(c,208,167,8,10,'#111617');rect(c,276,167,8,10,'#111617');
    rect(c,0,186,w,h-186,'#131a1c');
    for(let i=0;i<26;i++){const x=58+r()*160,yy=189+r()*15,l=5+r()*22;c.fillStyle=`rgba(196,198,186,${.1+r()*.26})`;c.fillRect(x,yy,l,1.3);}
}
function alley(c:C,w:number,h:number,r:R){
    const mx0=w*.41,mx1=w*.63,my0=h*.2,my1=h*.78;
    rect(c,0,0,w,h,'#1b2124');
    const far=c.createLinearGradient(0,my0,0,my1);far.addColorStop(0,'#3a403e');far.addColorStop(.5,'#7c8079');far.addColorStop(1,'#b5b7ad');
    rect(c,mx0,my0,mx1-mx0,my1-my0,far);
    rect(c,mx0,my0,mx1-mx0,(my1-my0)*.4,'#2b3231');rect(c,mx0+8,my0+10,9,12,'#9b9d92');rect(c,mx0+40,my0+10,9,12,'#495050');rect(c,mx0+24,my0+28,9,10,'#5d6360');
    const glow=c.createRadialGradient(mx1-12,my0+52,2,mx1-12,my0+52,44);glow.addColorStop(0,'rgba(228,228,215,.85)');glow.addColorStop(1,'rgba(228,228,215,0)');
    rect(c,mx0,my0,mx1-mx0,my1-my0,glow);
    const lw=c.createLinearGradient(0,0,mx0,0);lw.addColorStop(0,'#121617');lw.addColorStop(1,'#2b3132');poly(c,[0,0,mx0,my0,mx0,my1,0,h],lw);
    const rw=c.createLinearGradient(w,0,mx1,0);rw.addColorStop(0,'#141819');rw.addColorStop(1,'#272d2e');poly(c,[w,0,mx1,my0,mx1,my1,w,h],rw);
    for(let k=1;k<9;k++){ln(c,0,k*h/9,mx0,my0+(my1-my0)*k/9,'rgba(0,0,0,.28)',.7);ln(c,w,k*h/9,mx1,my0+(my1-my0)*k/9,'rgba(0,0,0,.28)',.7);}
    poly(c,[0,h,mx0,my1,mx1,my1,w,h],'#242a2a');
    const wet=c.createLinearGradient(0,my1,0,h);wet.addColorStop(0,'rgba(205,206,194,.32)');wet.addColorStop(1,'rgba(205,206,194,.04)');
    poly(c,[mx0+8,my1,mx1-8,my1,mx1+34,h,mx0-36,h],wet);
    // Fire escape on the left wall: platforms, zig-zag stairs, a dropped ladder.
    const P=(t:number,s:number):[number,number]=>{const top=my0*t,b=h+(my1-h)*t;return [mx0*t,top+s*(b-top)];};
    const bar=(a:[number,number],b:[number,number],lwid:number)=>{ln(c,a[0],a[1],b[0],b[1],'#0a0e0f',lwid);ln(c,a[0]+.6,a[1]-.8,b[0]+.6,b[1]-.8,'rgba(110,118,114,.55)',.6);};
    const levels=[.17,.39,.61];
    levels.forEach(s=>{bar(P(.16,s),P(.8,s),2.6);bar(P(.16,s-.07),P(.8,s-.07),1.1);for(let t=.16;t<=.81;t+=.16)bar(P(t,s),P(t,s-.07),.9);});
    [[.26,.74],[.74,.26]].forEach(([a,b],i)=>{const s0=levels[i]!,s1=levels[i+1]!,p=P(a!,s0),q=P(b!,s1);bar(p,q,2.2);
        for(let k=1;k<8;k++){const m=P(a!+(b!-a!)*k/8,s0+(s1-s0)*k/8);ln(c,m[0]-2,m[1],m[0]+2,m[1],'#0a0e0f',1);}});
    bar(P(.42,.61),P(.42,.82),1.2);bar(P(.5,.61),P(.5,.82),1.2);for(let s=.65;s<.82;s+=.04)bar(P(.42,s),P(.5,s),.8);
    // Lit window on the right wall.
    const Q=(t:number,s:number):[number,number]=>{const top=my0*t,b=h+(my1-h)*t;return [w-(w-mx1)*t,top+s*(b-top)];};
    const wa=Q(.3,.22),wb=Q(.5,.22),wc=Q(.5,.44),wd=Q(.3,.44);poly(c,[...wa,...wb,...wc,...wd],'#d3d1c3');
    const sa=Q(.3,.3),sb=Q(.5,.3);poly(c,[...wa,...wb,...sb,...sa],'#8f9087');
    const m1=Q(.4,.22),m2=Q(.4,.44),h1=Q(.3,.36),h2=Q(.5,.36);ln(c,m1[0],m1[1],m2[0],m2[1],'#20272a',2);ln(c,h1[0],h1[1],h2[0],h2[1],'#20272a',1.6);
    // Trash cans by the right wall, then the watcher at the alley mouth with a long shadow toward us.
    rect(c,248,166,22,30,'#111617');c.fillStyle='#3a4241';c.beginPath();c.ellipse(259,166,12,3,0,0,Math.PI*2);c.fill();
    rect(c,274,172,18,28,'#0f1415');ln(c,250,178,268,178,'rgba(120,126,120,.35)',.8);
    const fx=mx0+(mx1-mx0)*.46;poly(c,[fx-7,my1,fx+7,my1,fx+34,h,fx-22,h],'rgba(6,8,9,.55)');
    ratSilhouette(c,fx,my1+.5,1.05,'#0a0d0e');
    for(let i=0;i<10;i++){const x=40+r()*230,yy=175+r()*28;c.fillStyle=`rgba(200,202,190,${.06+r()*.12})`;c.beginPath();c.ellipse(x,yy,6+r()*12,1,0,0,Math.PI*2);c.fill();}
}
function sedan(c:C,w:number,h:number,r:R){
    rect(c,0,0,w,h,'#1e2425');
    for(let i=0;i<6;i++){rect(c,12+i*50,14,18,24,i===2?'#7d8077':'#2a3132');rect(c,12+i*50,52,18,24,i===4?'#5c605a':'#272e2f');}
    rect(c,0,88,w,32,'#181d1e');rect(c,18,94,94,22,'#343b3a');tx(c,'HOTEL',65,110,`bold 11px ${SANS}`,'rgba(150,154,146,.5)','center');
    rect(c,0,120,w,22,'#383e3d');rect(c,0,142,w,5,'#5b615d');
    const st=c.createLinearGradient(0,147,0,h);st.addColorStop(0,'#191e1f');st.addColorStop(1,'#232a2b');rect(c,0,147,w,h-147,st);
    // Streetlamp, its cone and its pool.
    const lx=250;rect(c,lx,26,4,96,'#0c1011');rect(c,lx-3,116,10,6,'#0c1011');
    c.strokeStyle='#0c1011';c.lineWidth=3;c.beginPath();c.moveTo(lx+2,28);c.quadraticCurveTo(lx-4,18,lx-16,22);c.stroke();
    poly(c,[lx-24,21,lx-10,21,lx-12,30,lx-22,30],'#0c1011');
    poly(c,[lx-21,31,lx-13,31,lx+52,146,lx-86,146],'rgba(214,214,200,.14)');
    const bulb=c.createRadialGradient(lx-17,31,1,lx-17,31,26);bulb.addColorStop(0,'rgba(236,236,224,.95)');bulb.addColorStop(1,'rgba(236,236,224,0)');
    rect(c,lx-45,5,56,56,bulb);
    c.fillStyle='rgba(222,222,208,.24)';c.beginPath();c.ellipse(lx-17,145,70,7,0,0,Math.PI*2);c.fill();
    for(let i=0;i<16;i++){const k=1-i/16;c.fillStyle=`rgba(220,220,206,${(.1+r()*.26)*k})`;c.fillRect(lx-24+(r()-.5)*14*(1+i/8),151+i*3.4+r()*1.5,(4+r()*12)*(1+i/12),1.2+r()*.8);}
    // 1940s fastback sedan at the curb, nose left: long hood, separate pontoon fenders, running board.
    c.fillStyle='rgba(0,0,0,.42)';c.fillRect(28,170,200,10);
    const rim=(f:()=>void)=>{c.save();f();c.clip();c.translate(-1.2,1.6);f();c.lineWidth=3;c.strokeStyle='rgba(165,170,160,.55)';c.stroke();c.restore();};
    const body=()=>{c.beginPath();c.moveTo(34,157);c.lineTo(34,146);c.quadraticCurveTo(35,138,48,137);c.lineTo(110,131);
        c.quadraticCurveTo(117,114,130,108);c.quadraticCurveTo(152,101,172,106);c.quadraticCurveTo(200,117,216,141);
        c.quadraticCurveTo(222,149,221,157);c.closePath();};
    const front=()=>{c.beginPath();c.moveTo(36,154);c.quadraticCurveTo(38,133,66,131);c.quadraticCurveTo(94,131,108,152);c.lineTo(109,157);c.lineTo(36,157);c.closePath();};
    const rear=()=>{c.beginPath();c.moveTo(156,157);c.quadraticCurveTo(160,134,188,132);c.quadraticCurveTo(214,133,222,151);c.lineTo(222,157);c.closePath();};
    body();c.fillStyle='#0e1213';c.fill();rim(body);
    poly(c,[117,128,129,111,150,106.5,169,108.5,190,124,192,129],'#343b39');ln(c,151,106.5,151,129,'#0e1213',2.6);ln(c,129,111,129,128,'#0e1213',1.4);
    front();c.fillStyle='#121617';c.fill();rim(front);rear();c.fillStyle='#121617';c.fill();rim(rear);
    ln(c,48,142,214,140,'rgba(140,146,138,.5)',.9);rect(c,104,154,56,3,'#1c2122');
    rect(c,27,150,10,6,'#5d635d');rect(c,219,150,7,6,'#5d635d');disc(c,44,140,3.3,'#8c9088');
    [70,188].forEach(x=>{disc(c,x,160,15,'#060809');disc(c,x,160,12.5,'#0b0e0f');c.strokeStyle='#666c66';c.lineWidth=2.6;c.beginPath();c.arc(x,160,8.6,0,Math.PI*2);c.stroke();disc(c,x,160,4,'#4d534f');});
    rect(c,210,141,8,6,'rgba(172,174,164,.5)');for(let i=0;i<3;i++)ln(c,208,141.5+i*2,220,142.5+i*2,'rgba(28,32,32,.55)',.8);
    for(let i=0;i<120;i++){const x=r()*w,yy=r()*h,l=8+r()*12,inCone=x>lx-90&&x<lx+56&&yy<148;
        c.strokeStyle=`rgba(212,214,204,${(inCone?.28:.1)+r()*.14})`;c.lineWidth=.6+r()*.5;c.beginPath();c.moveTo(x,yy);c.lineTo(x-l*.22,yy+l);c.stroke();}
}

const photoCrack=(c:C)=>{ln(c,276,24,338,72,'rgba(236,236,226,.55)',1.1);ln(c,276.8,25.4,338,73.8,'rgba(0,0,0,.25)',.8);ln(c,304,46,300,60,'rgba(236,236,226,.4)',.7);};
const photoTape=(c:C)=>{c.save();c.translate(182,25);c.rotate(.05);rect(c,-33,-10,66,20,'rgba(222,220,206,.55)');
    ln(c,-33,-10,33,-10,'rgba(120,118,104,.25)',.8);ln(c,-33,10,33,10,'rgba(120,118,104,.25)',.8);c.restore();};
const photoPrint=(c:C,W:number)=>thumbprint(c,W-58,270,13,.5,.12);

// ---- backs ----

const statementBack:Draw=(c,W,_H,r)=>{
    c.save();c.translate(W,0);c.scale(-1,1);
    tx(c,'WITNESS STATEMENT',22,62,`bold 17px ${MONO}`,'rgba(40,42,38,.08)');rect(c,22,66,174,2.4,'rgba(40,42,38,.07)');
    ln(c,22,38,W-22,38,'rgba(40,42,38,.07)',1.3);bleed(c,22,85,W-44,3,12,r,.05);bleed(c,22,134,W-44,14,12,r,.065,[5,12]);
    ln(c,138,318,W-22,318,'rgba(40,42,38,.07)',1);c.restore();
    hand(c,'Voss says 11.40,',30,288,13,PENCIL,r,200,-.05,'600 ');const k=hand(c,'then who signed the book?',36,306,13,PENCIL,r,200,-.05,'600 ');
    ln(c,40,311,40+k*.5,309,PENCIL,.9);
};
const formBack:Draw=(c,W,_H,r)=>{
    c.save();c.translate(W,0);c.scale(-1,1);const a='rgba(40,42,38,.07)';
    rect(c,18,76,W-36,16,'rgba(40,42,38,.06)');for(let i=1;i<=13;i++)ln(c,18,92+i*18,W-18,92+i*18,a,.8);
    [18,46,176,222,W-18].forEach(x=>ln(c,x,76,x,326,a,.9));tx(c,'PROPERTY REGISTER',W/2,46,`bold 15px ${MONO}`,a,'center');c.restore();
    hand(c,'Case never logged in.',34,180,13,PENCIL,r,200,-.04,'600 ');hand(c,'Ask the night clerk (Kane?)',40,198,13,PENCIL,r,200,-.04,'600 ');
    c.strokeStyle=PENCIL;c.lineWidth=1.1;for(let i=0;i<6;i++){const x=40+i*6+(i>3?8:0);ln(c,x,232,x+1.5,248,PENCIL,1.1);}ln(c,36,244,66,236,PENCIL,1.1);
};
const receiptBack:Draw=(c,W,_H,r)=>{
    const mid=W/2;c.save();c.translate(W,0);c.scale(-1,1);tx(c,'PIER 9',mid,74,`bold 25px ${MONO}`,'rgba(40,42,38,.06)','center');
    bleed(c,13,167,W-26,3,16,r,.05);c.restore();
    tx(c,'THANK YOU',mid,176,`bold 9px ${MONO}`,'rgba(60,58,50,.42)','center');tx(c,'— CALL AGAIN —',mid,188,`7px ${MONO}`,'rgba(60,58,50,.38)','center');
    const k=hand(c,'KLondike 5-0147',18,254,14,PENCIL,r,W-34,-.12,'600 ');ln(c,18,262,18+k,247,PENCIL,1);
    hand(c,'ask for Dray',30,280,11.5,PENCIL,r,W-50,-.08,'600 ');
};
const photoBack:Draw=(c,W,H,r,stock)=>{
    c.save();c.beginPath();c.rect(16,14,W-32,H-28);c.clip();c.translate(W/2,H/2);c.rotate(-.52);
    c.font=`7.5px ${SANS}`;c.fillStyle='rgba(88,90,84,.11)';
    for(let y=-260;y<=260;y+=22)c.fillText('HALLIDAY BROMIDE · DOUBLE WEIGHT · HALLIDAY BROMIDE · DOUBLE WEIGHT · HALLIDAY BROMIDE ·',-300+(y/22%2)*30,y);
    c.restore();
    stamp(c,W*.42,H*.42,-.06,184,60,'PRECINCT PHOTO LAB',`bold 13px ${MONO}`,-6,'No. 47',`bold 19px ${MONO}`,19,'#686b68',stock,r);
    hand(c,'Pier 9 · 6/10 · neg. 12-14',40,H-46,13,PENCIL,r,220,-.03,'600 ');
};

const FRONT:readonly (readonly Draw[])[]=[[statement,continuation,report],[register,evidenceLog,custody],[harbourReceipt,dinerCheck,pawnTicket],[
    photo(warehouse,'Loading door — after closing','RD-0047 · PHOTO 1',photoCrack),
    photo(alley,'Who was watching?','RD-0047 · PHOTO 2',photoTape),
    photo(sedan,'Plate unreadable','RD-0047 · PHOTO 3',photoPrint)]];
const BACK:readonly Draw[]=[statementBack,formBack,receiptBack,photoBack];
