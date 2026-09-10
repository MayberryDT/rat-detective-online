import {expect,it} from 'vitest';
import {clearAimLabel} from '../../src/ui/aimClearance';
import {MunicipalQuips,MUNICIPAL_QUIPS} from '../../src/ui/municipalQuips';
it('keeps projected text above the aiming area at desktop and compact sizes',()=>{
 for(const [w,h] of [[1280,720],[800,600],[600,480]])for(const [width,height] of [[250,150],[190,90]]){
  for(const y of [h/2-50,h/2,h/2+50]){
   const label=clearAimLabel(w/2,y,width,height,w,h);expect(label.y+height/2).toBeLessThanOrEqual(h/2-80);
  }
  expect(clearAimLabel(130,h-100,180,80,w,h).x).toBe(130);
 }
});
it('rotates every contextual quip before reuse without consecutive repeats',()=>{
 const deck=new MunicipalQuips(()=>.4);
 for(const kind of Object.keys(MUNICIPAL_QUIPS) as (keyof typeof MUNICIPAL_QUIPS)[]){
  const n=MUNICIPAL_QUIPS[kind].length,phrases=Array.from({length:n*3},()=>deck.next(kind));
  for(let i=0;i<phrases.length;i+=n)expect(new Set(phrases.slice(i,i+n)).size).toBe(n);
  for(let i=1;i<phrases.length;i++)expect(phrases[i]).not.toBe(phrases[i-1]);
 }
});
it('names the actual victim in every case-death joke without interpreting name characters',()=>{
 const deck=new MunicipalQuips(()=>.4),name='Captain <$& Crawley>';
 const jokes=Array.from({length:MUNICIPAL_QUIPS.caseDeath.length},()=>deck.caseDeath(name));
 expect(new Set(jokes).size).toBe(MUNICIPAL_QUIPS.caseDeath.length);
 for(const joke of jokes){expect(joke).toContain(name);expect(joke).not.toContain('{name}');expect(joke).not.toContain('eliminated');}
});
