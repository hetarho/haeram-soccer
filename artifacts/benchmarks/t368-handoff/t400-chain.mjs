// T400: runs scripts/match-parity.ts --report once per named setting, one after another, each into
// <dir>/<name>.json with its log, then <dir>/<spec name>.done. Each run plays in the tree (its
// source fingerprint and git head), the settings patched by `--patch`; runs sharing `cache` read one
// detailed reference (`--reference-cache`). The spec is a JSON file (no shell quoting of patches):
//   { "dir": "...", "tree": "...", "cache": "...", "partition": "calibration", "round": 60,
//     "jobs": 8, "args": ["--scale", "5", "--conditions", "…", "--reference", "…"],
//     "runs": [{ "name": "s1", "patch": { "aggregate": { … } } }] }
// node t400-chain.mjs <spec.json>
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const file = process.argv[2];
const spec = JSON.parse(readFileSync(file, 'utf8'));
mkdirSync(spec.dir, { recursive: true });
for (const run of spec.runs) {
  const args = [
    'exec', 'tsx', 'scripts/match-parity.ts', '--report',
    '--partition', spec.partition, '--round', String(spec.round), '--jobs', String(spec.jobs),
    '--out', `${spec.dir}/${run.name}.json`, ...spec.args,
    ...(spec.cache ? ['--reference-cache', spec.cache] : []),
    ...(run.patch ? ['--patch', JSON.stringify(run.patch)] : []),
  ];
  const started = Date.now();
  const res = spawnSync('pnpm', args, {
    cwd: spec.tree,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  writeFileSync(
    `${spec.dir}/${run.name}.log`,
    `${args.join(' ')}\n${res.stdout}\n${res.stderr}\nexit ${res.status} after ${((Date.now() - started) / 1000).toFixed(0)} s\n`,
  );
}
writeFileSync(`${spec.dir}/${basename(file, '.json')}.done`, 'done\n');
