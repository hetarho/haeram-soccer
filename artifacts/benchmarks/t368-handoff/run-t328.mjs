// node run-t328.mjs <tree> <partition> <round> <name> <jobs> [extra args...]: one t328 corpus run
// into <scratch>/<name>.json with its log, then <name>.done.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [tree, partition, round, name, jobs, ...extra] = process.argv.slice(2);
const dir = process.env.T368_SCRATCH ?? '/tmp/t368-scratch';
const args = [
  '--dir', tree, 'exec', 'tsx', `${tree}/scripts/t328-counter-roles.ts`,
  '--variant', 'base', '--partition', partition, '--round', round,
  '--set', 'all', '--jobs', jobs, '--out', `${dir}/${name}.json`, ...extra,
];
const started = Date.now();
const res = spawnSync('pnpm', args, { cwd: tree, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
writeFileSync(`${dir}/${name}.log`, `${args.join(' ')}\n${res.stdout}\n${res.stderr}\nexit ${res.status} after ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
writeFileSync(`${dir}/${name}.done`, `exit ${res.status}\n`);
