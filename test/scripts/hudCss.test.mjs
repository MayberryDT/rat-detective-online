import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Excessive Force ledger remains visible during the incident roulette',async()=>{
  const css=await readFile(new URL('../../src/prototype/dispatchHud.css',import.meta.url),'utf8');
  assert.match(css,/dispatch-roulette:not\(\[hidden\]\)\) \.assignment-ledger:not\(\[data-mode=excessive-force\]\)\{visibility:hidden\}/);
  assert.doesNotMatch(css,/dispatch-roulette:not\(\[hidden\]\)\) \.assignment-ledger\{visibility:hidden\}/);
});
