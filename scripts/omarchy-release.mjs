#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const id = 'co.animasai.rat-detective';
const receiptName = 'release.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

async function inventory(folder, prefix = '') {
  const result = {};
  for (const entry of (await readdir(join(folder, prefix), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git' || entry.name === '__pycache__') continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Plugin symlink refused: ${name}`);
    if (entry.isDirectory()) Object.assign(result, await inventory(folder, name));
    else if (entry.isFile() && name !== receiptName) {
      const path = join(folder, name);
      result[name] = { sha256: hash(await readFile(path)), executable: !!((await stat(path)).mode & 0o111) };
    } else if (!entry.isFile()) throw new Error(`Unsupported plugin entry: ${name}`);
  }
  return result;
}

function validPath(path) { return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.split('/').some(p => !p || p === '.' || p === '..') && !/[\x00-\x1f\\]/.test(path); }
export async function validatePackage(folder) {
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.id !== id || typeof manifest.version !== 'string' || !Array.isArray(manifest.kinds)) throw new Error('Invalid Rat Detective plugin manifest');
  const keys = { 'bar-widget':'barWidget', service:'service', panel:'panel', overlay:'overlay', menu:'menu' };
  for (const kind of manifest.kinds) if (!manifest.entryPoints?.[keys[kind]]) throw new Error(`Missing entry point: ${kind}`);
  const files = await inventory(folder);
  for (const path of Object.values(manifest.entryPoints)) if (!validPath(path) || !files[path]) throw new Error(`Invalid entry point: ${path}`);
  if (!files['README.md'] || !files.LICENSE) throw new Error('Plugin README and LICENSE are required');
  return { manifest, files };
}

export async function exportPlugin(source, destination, { validate = () => {} } = {}) {
  source = resolve(source); destination = resolve(destination);
  if (destination === source || destination.startsWith(source + '/')) throw new Error('Export destination must be outside source');
  if (await exists(destination)) throw new Error('Export destination already exists; choose a fresh directory');
  await validatePackage(source);
  await mkdir(dirname(destination), { recursive:true });
  const staging = await mkdtemp(join(dirname(destination), '.rat-export-'));
  try {
    await cp(source, staging, { recursive:true, filter: path => !['.git','__pycache__',receiptName].includes(path.split('/').at(-1)) });
    const { manifest, files } = await validatePackage(staging);
    const receipt = { schemaVersion:1, id, version:manifest.version, contentHash:hash(JSON.stringify(files)), files };
    await writeFile(join(staging, receiptName), JSON.stringify(receipt, null, 2) + '\n');
    await validate(staging);
    await rename(staging, destination);
    return receipt;
  } finally { await rm(staging, { recursive:true, force:true }); }
}

async function readReceipt(folder) {
  const receipt = JSON.parse(await readFile(join(folder, receiptName), 'utf8'));
  if (receipt.schemaVersion !== 1 || receipt.id !== id || !receipt.files || Object.keys(receipt.files).some(path => !validPath(path))) throw new Error('Invalid release receipt');
  return receipt;
}

async function verifyManaged(folder, receipt) {
  const current = await inventory(folder);
  for (const [name, record] of Object.entries(receipt.files)) {
    if (JSON.stringify(current[name]) !== JSON.stringify(record)) throw new Error(`Locally changed managed file: ${name}; preserve or reconcile it before upgrading`);
  }
}

export async function installPlugin(source, target, stateDir, { validate = () => {} } = {}) {
  source = resolve(source); target = resolve(target); stateDir = resolve(stateDir);
  if (source === target || source.startsWith(target + '/') || target.startsWith(source + '/') || stateDir === target || stateDir.startsWith(target + '/')) throw new Error('Source, target and backup state must be separate');
  const release = await readReceipt(source);
  const sourceInfo = await validatePackage(source);
  if (release.contentHash !== hash(JSON.stringify(sourceInfo.files))) throw new Error('Release content does not match receipt');
  await verifyManaged(source, release);
  const hadTarget = await exists(target);
  let previous;
  if (hadTarget && await exists(join(target, receiptName))) {
    previous = await readReceipt(target);
    await verifyManaged(target, previous);
    if (previous.contentHash === release.contentHash) return { unchanged:true, target, version:release.version };
  }
  await mkdir(dirname(target), { recursive:true });
  await mkdir(stateDir, { recursive:true });
  // Stage outside the plugins directory, where file watchers cannot load half a release.
  const staging = await mkdtemp(join(stateDir, 'stage-'));
  const backup = join(stateDir, `backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const displaced = join(stateDir, `displaced-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    if (hadTarget) {
      await inventory(target); // reject symlinks before copying user content
      await cp(target, staging, { recursive:true });
      await cp(target, backup, { recursive:true });
      for (const name of Object.keys(previous?.files ?? {})) if (!release.files[name]) await rm(join(staging,name));
    }
    await cp(source, staging, { recursive:true });
    await validatePackage(staging); await validate(staging);
    if (hadTarget) await rename(target, displaced);
    try { await rename(staging, target); } catch (error) { if (hadTarget) await rename(displaced, target); throw error; }
    const record = { schemaVersion:1, target, backup:hadTarget ? backup : null, version:release.version, contentHash:release.contentHash, installedAt:new Date().toISOString() };
    await writeFile(join(stateDir, 'latest.json'), JSON.stringify(record,null,2)+'\n');
    await rm(displaced, { recursive:true, force:true });
    return record;
  } finally { await rm(staging, { recursive:true, force:true }); }
}

export async function rollbackPlugin(stateDir, { validate = () => {} } = {}) {
  const record = JSON.parse(await readFile(join(stateDir,'latest.json'),'utf8'));
  if (record.schemaVersion !== 1 || !record.backup || !record.target) throw new Error('No previous plugin installation to restore');
  const current = await readReceipt(record.target);
  if (current.contentHash !== record.contentHash) throw new Error('Current plugin is not the release recorded by this installer');
  await verifyManaged(record.target, current);
  await validate(record.backup);
  const staging = await mkdtemp(join(stateDir,'rollback-'));
  const retained = join(stateDir, `replaced-${Date.now()}`);
  try {
    await cp(record.backup,staging,{recursive:true});
    // Preserve files added locally since installation, while restoring managed files.
    const now = await inventory(record.target);
    for (const name of Object.keys(now)) if (!current.files[name]) {
      await mkdir(dirname(join(staging,name)), {recursive:true});
      await cp(join(record.target,name),join(staging,name));
    }
    await rename(record.target,retained);
    try { await rename(staging,record.target); } catch (error) { await rename(retained,record.target); throw error; }
    await rename(join(stateDir,'latest.json'),join(stateDir,`rolled-back-${Date.now()}.json`));
    return { target:record.target, restoredFrom:record.backup, retained };
  } finally { await rm(staging,{recursive:true,force:true}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, ...args] = process.argv.slice(2);
    const options = {};
    for (const arg of args) {
      const match = /^--(source|out|target|state)=(.+)$/.exec(arg);
      if (!match) throw new Error(`Unknown argument: ${arg}`);
      options[match[1]] = match[2];
    }
    const state = options.state || join(homedir(),'.local/state/rat-detective/plugin-backups');
    const validate = folder => execFileSync('omarchy',['plugin','validate',folder],{stdio:'pipe'});
    let result;
    if (operation === 'export' && options.out) result = await exportPlugin(options.source || join(root,'omarchy/plugin'),options.out,{validate});
    else if (operation === 'install' && options.source) result = await installPlugin(options.source,options.target || join(homedir(),'.config/omarchy/plugins',id),state,{validate});
    else if (operation === 'rollback') result = await rollbackPlugin(state,{validate});
    else throw new Error('Usage: node scripts/omarchy-release.mjs export --out=PATH | install --source=EXPORT [--target=PATH] [--state=PATH] | rollback [--state=PATH]');
    console.log(JSON.stringify(result,null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
