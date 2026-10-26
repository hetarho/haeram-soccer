// T375: runs scripts/t328-counter-roles.ts once per named setting, one after another, each into
// <dir>/<name>.json with its log, then <dir>/<spec name>.done. The tree's own script plays the
// matches and this checkout's tsx runs it, so a scratch tree needs no node_modules of its own.
// The spec is a JSON file (no shell quoting of patches):
//   { "dir": "...", "tree": "...", "partition": "calibration", "round": 50, "jobs": 5,
//     "args": ["--set", "all", "--per", "60"], "runs": [{ "name": "a2", "patch": { ... } }] }
// node t375-chain.mjs <spec.json>
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const file = process.argv[2];
const spec = JSON.parse(readFileSync(file, 'utf8'));
mkdirSync(spec.dir, { recursive: true });
for (const run of spec.runs) {
  const args = [
    'exec', 'tsx', `${spec.tree}/scripts/t328-counter-roles.ts`,
    '--variant', 'base', '--partition', spec.partition, '--round', String(spec.round),
    '--jobs', String(spec.jobs), '--out', `${spec.dir}/${run.name}.json`, ...spec.args,
    ...(run.patch ? ['--patch', JSON.stringify(run.patch)] : []),
  ];
  const started = Date.now();
  const res = spawnSync('pnpm', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(
    `${spec.dir}/${run.name}.log`,
    `${args.join(' ')}\n${res.stdout}\n${res.stderr}\nexit ${res.status} after ${((Date.now() - started) / 1000).toFixed(0)} s\n`,
  );
}
writeFileSync(`${spec.dir}/${basename(file, '.json')}.done`, 'done\n');
