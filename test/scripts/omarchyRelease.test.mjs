import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPlugin, installPlugin, rollbackPlugin } from '../../scripts/omarchy-release.mjs';

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(),'rat-release-test-'));
  t.after(() => rm(base,{recursive:true,force:true}));
  const source = join(base,'source'); await mkdir(source);
  await writeFile(join(source,'manifest.json'),JSON.stringify({schemaVersion:1,id:'co.animasai.rat-detective',version:'1.0.0',kinds:['bar-widget'],entryPoints:{barWidget:'BarWidget.qml'}}));
  for (const name of ['BarWidget.qml','README.md','LICENSE']) await writeFile(join(source,name),name);
  return {base,source,target:join(base,'installed'),state:join(base,'state')};
}

test('exports deterministic content receipts and refuses destructive overwrite',async t => {
  const {base,source} = await fixture(t);
  const first = await exportPlugin(source,join(base,'first'));
  assert.deepEqual(await exportPlugin(source,join(base,'second')),first);
  await assert.rejects(exportPlugin(source,join(base,'first')),/already exists/);
  await assert.rejects(exportPlugin(source,join(source,'nested')),/outside source/);
});

test('refuses symlinks and path traversal entry points',async t => {
  const {base,source} = await fixture(t);
  await symlink('/etc/passwd',join(source,'outside'));
  await assert.rejects(exportPlugin(source,join(base,'export')),/symlink/);
  await rm(join(source,'outside'));
  const manifest=JSON.parse(await readFile(join(source,'manifest.json')));
  manifest.entryPoints.barWidget='../elsewhere.qml';
  await writeFile(join(source,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(exportPlugin(source,join(base,'export')),/Invalid entry point/);
});

test('legacy migration preserves user files and rollback restores earlier plugin',async t => {
  const {base,source,target,state} = await fixture(t);
  await mkdir(target);
  await writeFile(join(target,'BarWidget.qml'),'legacy widget');
  await writeFile(join(target,'user-note.txt'),'keep me');
  const out=join(base,'export'); await exportPlugin(source,out);
  const installed=await installPlugin(out,target,state);
  assert.equal(await readFile(join(target,'user-note.txt'),'utf8'),'keep me');
  assert.equal(await readFile(join(installed.backup,'BarWidget.qml'),'utf8'),'legacy widget');
  assert.equal((await installPlugin(out,target,state)).unchanged,true);
  await writeFile(join(target,'added-later.txt'),'new local file');
  await writeFile(join(target,'user-note.txt'),'edited after upgrade');
  await rollbackPlugin(state);
  assert.equal(await readFile(join(target,'BarWidget.qml'),'utf8'),'legacy widget');
  assert.equal(await readFile(join(target,'added-later.txt'),'utf8'),'new local file');
  assert.equal(await readFile(join(target,'user-note.txt'),'utf8'),'edited after upgrade');
});

test('rejects changed installed managed files instead of overwriting them',async t => {
  const {base,source,target,state} = await fixture(t);
  const one=join(base,'one'); await exportPlugin(source,one); await installPlugin(one,target,state);
  await writeFile(join(target,'BarWidget.qml'),'user custom widget');
  await writeFile(join(source,'BarWidget.qml'),'new release');
  const two=join(base,'two'); await exportPlugin(source,two);
  await assert.rejects(installPlugin(two,target,state),/Locally changed managed file/);
  assert.equal(await readFile(join(target,'BarWidget.qml'),'utf8'),'user custom widget');
});

test('validation failure leaves existing installation untouched',async t => {
  const {base,source,target,state} = await fixture(t);
  await mkdir(target); await writeFile(join(target,'old.txt'),'still here');
  const out=join(base,'export'); await exportPlugin(source,out);
  await assert.rejects(installPlugin(out,target,state,{validate(){throw new Error('shell rejected');}}),/shell rejected/);
  assert.equal(await readFile(join(target,'old.txt'),'utf8'),'still here');
});

test('tampered release payload does not install',async t => {
  const {base,source,target,state} = await fixture(t);
  const out=join(base,'export'); await exportPlugin(source,out);
  await writeFile(join(out,'BarWidget.qml'),'unexpected bytes');
  await assert.rejects(installPlugin(out,target,state),/does not match receipt/);
});

test('upgrades remove only old managed files and retain unrelated additions',async t => {
  const {base,source,target,state} = await fixture(t);
  await writeFile(join(source,'old.js'),'obsolete');
  const one=join(base,'one'); await exportPlugin(source,one); await installPlugin(one,target,state);
  await writeFile(join(target,'local.txt'),'user file');
  await rm(join(source,'old.js')); await writeFile(join(source,'new.js'),'new');
  const two=join(base,'two'); await exportPlugin(source,two); await installPlugin(two,target,state);
  await assert.rejects(readFile(join(target,'old.js')), {code:'ENOENT'});
  assert.equal(await readFile(join(target,'local.txt'),'utf8'),'user file');
  assert.equal(await readFile(join(target,'new.js'),'utf8'),'new');
});
