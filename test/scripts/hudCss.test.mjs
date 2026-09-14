import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('no incident, assignment-reveal or responsive rule hides the score card in any mode',async()=>{
  for(const file of ['src/prototype/dispatchHud.css','src/ui/touchControls.css']){
    const css=await readFile(new URL('../../'+file,import.meta.url),'utf8');
    // Check declarations on the card itself, not intentionally hidden children.
    for(const [,selectors,declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
      if(!/\.assignment-ledger(?:\[[^\]]+\]|:[^\s,{}]+)*\s*$/.test(selectors))continue;
      assert.doesNotMatch(declarations,/(?:visibility\s*:\s*(?:hidden|collapse)|display\s*:\s*none|opacity\s*:\s*0(?:\D|$))/,`${file}: ${selectors}`);
    }
  }
});

test('roulette and broadcasts never hide destination guidance',async()=>{
 for(const file of ['src/prototype/dispatchHud.css','src/ui/touchControls.css']){
  const css=await readFile(new URL('../../'+file,import.meta.url),'utf8');
  for(const [,selectors,declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
   if(!selectors.split(',').some(s=>/\.assignment-destination\s*$/.test(s)))continue;
   assert.doesNotMatch(declarations,/(?:visibility\s*:\s*(?:hidden|collapse)|display\s*:\s*none|opacity\s*:\s*0(?:\D|$))/,`${file}: ${selectors}`);
  }
 }
});
