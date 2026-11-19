/** Paired real-worker protocol benchmark. --base <ref> [--base-mode none|helpers --procs 8 --days 120 --warm 28 --json out] */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, loadavg, cpus, platform, arch } from 'node:os';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { median, verdict } from './stats.ts';
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../..');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? d : process.argv[i + 1];
};
const base = arg('--base'),
  candidate = arg('--cand', root),
  procs = Number(arg('--procs', 8)),
  days = Number(arg('--days', 120)),
  warm = Number(arg('--warm', 28));
if (!base) throw new Error('--base <git ref> required');
const scratch = join(tmpdir(), `haeram-helpers-${process.pid}`);
mkdirSync(scratch, { recursive: true });
async function bundle(spec, name) {
  const tree = join(scratch, name);
  mkdirSync(tree, { recursive: true });
  if (existsSync(join(spec, 'packages'))) {
    for (const path of ['packages', 'apps/web/src/runtime'])
      cpSync(join(spec, path), join(tree, path), { recursive: true });
  } else {
    const tar = execFileSync('git', ['archive', spec, 'packages', 'apps/web/src/runtime'], {
      cwd: root,
      maxBuffer: 1 << 27,
    });
    execFileSync('tar', ['-x', '-C', tree], { input: tar });
  }
  mkdirSync(join(tree, 'scripts/perf'), { recursive: true });
  cpSync(join(here, 'helper-workloads.ts'), join(tree, 'scripts/perf/helper-workloads.ts'));
  const file = join(scratch, name + '.mjs');
  await build({
    absWorkingDir: tree,
    entryPoints: ['scripts/perf/helper-workloads.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: file,
    nodePaths: [join(root, 'node_modules')],
    logLevel: 'error',
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });
  return file;
}
const files = await Promise.all([bundle(base, 'base'), bundle(candidate, 'candidate')]);
const modes = [arg('--base-mode', 'helpers'), arg('--cand-mode', 'helpers')];
if (modes.some((mode) => !['none', 'helpers'].includes(mode)))
  throw new Error('Modes must be none or helpers');
const pairFile = join(scratch, 'helper-pair.mjs');
const originalPair = readFileSync(join(here, 'helper-pair.mjs'), 'utf8');
if (
  !originalPair.includes('pool: new api.HelperPool(ports), workers') ||
  !originalPair.includes('      if (!s.pool.active)')
)
  throw new Error('Helper benchmark runner no longer matches the mode adapter');
const pairSource = originalPair
  .replace(
    'pool: new api.HelperPool(ports), workers',
    `pool: new api.HelperPool(${JSON.stringify(modes)}[i] === 'none' ? [] : ports), workers`,
  )
  .replace(
    '      if (!s.pool.active)',
    `      if (${JSON.stringify(modes)}[i] !== 'none' && !s.pool.active)`,
  );
writeFileSync(pairFile, pairSource);
const runs = [],
  loads = [loadavg()[0]];
for (let p = 0; p < procs; p++) {
  const r = spawnSync(
    process.execPath,
    [pairFile, ...files, arg('--seed', 'perf-261027'), days, warm, p % 2 ? 'BA' : 'AB'],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  runs.push(JSON.parse(r.stdout.trim().split('\n').at(-1)));
  loads.push(loadavg()[0]);
  console.error(`process ${p + 1}/${procs}`);
}
const sum = (ps, side, key) => ps.reduce((s, p) => s + p[side][key], 0);
const total = (key) =>
  verdict(runs.map((r) => Math.log(sum(r.pairs, 'b', key) / sum(r.pairs, 'a', key))));
const own = (key) =>
  verdict(
    runs.map((r) =>
      median(r.pairs.filter((p) => p.label === 'own').map((p) => Math.log(p.b[key] / p.a[key]))),
    ),
  );
const summary = {
  base,
  candidate,
  modes,
  procs,
  days,
  warm,
  seed: arg('--seed', 'perf-261027'),
  machine: { node: process.version, cpu: cpus()[0].model, platform: platform(), arch: arch() },
  bundles: files.map((f) => createHash('sha256').update(readFileSync(f)).digest('hex')),
  sameHash: runs.every((r) => r.hashes[0] === r.hashes[1]),
  hashes: [...new Set(runs.flatMap((r) => r.hashes))],
  total: { wall: total('wall'), processCpu: total('process'), mainCpu: total('main') },
  own: { wall: own('wall'), processCpu: own('process'), mainCpu: own('main') },
  load1: loads,
  rssMax: Math.max(...runs.map((r) => r.rss)),
};
console.log(JSON.stringify(summary, null, 2));
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ ...summary, runs }, null, 2));
