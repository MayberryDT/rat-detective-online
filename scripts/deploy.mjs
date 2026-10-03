const target = process.argv[2];
if (target !== 'staging' && target !== 'production') {
  console.error('Refusing to deploy the default Worker config.');
  console.error('Use npm run deploy:staging or npm run deploy:production.');
  process.exit(2);
}

const { spawnSync } = await import('node:child_process');
// The release name every city fact and aggregate is stamped with (`BUILD`, docs/city-map.md):
// <env>-<YYYY-MM-DD>-<git short sha>, plus -dirty when the tree has uncommitted changes.
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const sha = git('rev-parse', '--short', 'HEAD').stdout?.trim();
const status = git('status', '--porcelain');
if (!sha || status.status !== 0) {
  console.error('Cannot name the build: git rev-parse or git status failed.');
  process.exit(1);
}
const name = `${target}-${new Date().toISOString().slice(0, 10)}-${sha}${status.stdout.trim() ? '-dirty' : ''}`;

const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`Deploying build ${name}`);
// Staging playtests only: `INCIDENTS=blackout,crossfire npm run deploy:staging` limits every room's incident rolls.
const incidents = target === 'staging' && process.env.INCIDENTS ? ['--var', `INCIDENTS:${process.env.INCIDENTS}`] : [];
if (incidents.length) console.log(`Incidents limited to ${process.env.INCIDENTS}`);
const deploy = spawnSync('npx', ['wrangler', 'deploy', '--env', target, '--var', `BUILD:${name}`, ...incidents], { stdio: 'inherit' });
process.exit(deploy.status ?? 1);
