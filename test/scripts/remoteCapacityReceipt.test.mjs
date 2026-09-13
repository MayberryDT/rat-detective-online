import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRemoteCapacityReceipt} from '../../scripts/lib/remote-capacity-receipt.mjs';

test('remote capacity receipts require fixed safe path inputs',()=>{
  const valid={hosted:true,fixtureId:'a'.repeat(64),validator:'/tmp/rat-capacity/validator.mjs'};
  assert.deepEqual(validateRemoteCapacityReceipt(valid),{fixtureId:valid.fixtureId,validator:valid.validator});
  for(const patch of [
    {fixtureId:`a;touch${'b'.repeat(57)}`},
    {fixtureId:'a'.repeat(63)},
    {validator:'relative/validator.mjs'},
    {validator:42},
    {hosted:false},
  ])assert.throws(()=>validateRemoteCapacityReceipt({...valid,...patch}),/Invalid hosted capacity/);
});
