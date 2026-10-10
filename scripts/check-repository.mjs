// Maintained navigation check. Failure modes: a guide points to a missing source/document;
// a heading link no longer resolves; a source/fixture still imports the old prototype directory;
// or a moved subsystem guide disappears. Historical receipts intentionally retain original paths.
// Usage: node scripts/check-repository.mjs [--output /absolute/path/report.json]
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { output: { type: 'string' } } });
const entrances = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'docs/current-state.md',
  'docs/README.md', 'docs/code-map.md', 'docs/game-rules.md', 'scripts/README.md'];
const subsystemGuides = ['src/shared/README.md', 'src/shared/bots/README.md', 'src/shared/city/README.md',
  'src/worker/README.md', 'src/worker/bots/README.md', 'src/session/README.md',
  'src/presentation/README.md', 'src/rat/README.md', 'src/utils/README.md', 'src/audio/README.md', 'src/replay/README.md'];
const failures = [], links = [];
const slug = text => text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
function anchors(path) {
  const counts = new Map(), found = new Set();
  for (const match of readFileSync(path, 'utf8').matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(match[1]), count = counts.get(base) ?? 0;
    counts.set(base, count + 1); found.add(count ? `${base}-${count}` : base);
  }
  return found;
}
for (const guide of [...entrances, ...subsystemGuides]) {
  const path = resolve(root, guide);
  if (!existsSync(path)) { failures.push({ guide, reason: 'missing guide' }); continue; }
  // These guides use ordinary inline Markdown links; ignore web/mail/absolute external references.
  for (const match of readFileSync(path, 'utf8').matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const href = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('/')) continue;
    const [file, fragment] = href.split('#'), target = resolve(dirname(path), decodeURIComponent(file));
    let reason;
    if (!existsSync(target)) reason = 'missing target';
    else if (fragment && extname(target) === '.md' && !anchors(target).has(decodeURIComponent(fragment))) reason = 'missing heading';
    links.push({ guide, href, target: relative(root, target), pass: !reason });
    if (reason) failures.push({ guide, href, reason });
  }
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
for (const directory of ['src', 'test', 'scripts']) {
  for (const path of walk(resolve(root, directory))) {
    if (!['.ts', '.js', '.mjs', '.html', '.css'].includes(extname(path))) continue;
    // A mention in a guide or this check is allowed; an actual module/stylesheet import is not.
    const text = readFileSync(path, 'utf8');
    if (/(?:from\s*|import\s*(?:\(\s*)?|@import\s*)['"][^'"\n]*\bprototype\//.test(text))
      failures.push({ file: relative(root, path), reason: 'import still uses prototype directory' });
  }
}
const report = { kind: 'maintained repository navigation; not gameplay acceptance',
  guides: entrances.length + subsystemGuides.length, linksChecked: links.length,
  pass: failures.length === 0, failures, links };
if (values.output) {
  const output = resolve(values.output); mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ ...report, links: undefined, output: values.output }, null, 2));
process.exitCode = report.pass ? 0 : 1;
