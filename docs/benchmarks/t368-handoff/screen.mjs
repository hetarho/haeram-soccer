// Runs probe.mts once per named patch, one after another, each into its own log; writes <tag>.done at the end.
// node screen.mjs <tag> <root> <count> <jobs> <name>=<json> ...
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [tag, root, count, jobs, ...specs] = process.argv.slice(2);
const dir = process.env.T368_SCRATCH ?? '/tmp/t368-scratch';
for (const spec of specs) {
  const i = spec.indexOf('=');
  const name = spec.slice(0, i);
  const patch = spec.slice(i + 1);
  const args = ['--dir', root, 'exec', 'tsx', `${dir}/probe.mts`, '--root', root, '--count', count, '--jobs', jobs, '--chunk', '50', ...(patch ? ['--patch', patch] : []), ...(process.env.PROBE_ARGS ? process.env.PROBE_ARGS.split(' ') : [])];
  const res = spawnSync('pnpm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${dir}/screen-${tag}-${name}.log`, `${res.stdout}\n${res.stderr}`);
}
writeFileSync(`${dir}/${tag}.done`, 'done\n');
