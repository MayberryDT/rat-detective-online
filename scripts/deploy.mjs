const target = process.argv[2];
if (target !== 'staging' && target !== 'production') {
  console.error('Refusing to deploy the default Worker config.');
  console.error('Use npm run deploy:staging or npm run deploy:production.');
  process.exit(2);
}

const { spawnSync } = await import('node:child_process');
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const deploy = spawnSync('npx', ['wrangler', 'deploy', '--env', target], { stdio: 'inherit' });
process.exit(deploy.status ?? 1);
