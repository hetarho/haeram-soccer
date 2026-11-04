// T689 cv04-rec: node make-jobs.mjs OUT.json SPEC… — a runner job list (cv04's `analysis/run.mjs`).
// SPEC: conc2400:<name> (held-out), bands:<name>[:N], stress:<name> (three seeds),
// tactics:<name>:<partition>[:scale[:jobs]], core:<name>:<partition>:<scale>[:jobs],
// pc:<name>:<partition>:<scale>[:jobs] (press v counter only), pcd:<name>[:matches[:start]] (the
// press v counter shot diagnostic `scripts/scoring-press-counter.ts`). Same scripts and arguments
// as cv04, cv04-hold and cv04-sit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const art = 'artifacts/benchmarks/scoring-261104-cv04-rec/';
const cand = (n) => art + 'candidates/' + n + '.json';
const VAL = 't689-val-1,t689-val-2,t689-val-3,t689-val-4';
const jobs = process.argv.slice(3).flatMap((spec) => {
  const [kind, n, a, b, c] = spec.split(':');
  if (kind === 'conc2400')
    return [{
      name: `conc-${n}-validation2400`,
      patch: cand(n),
      script: 'scripts/scoring-concentration.ts',
      args: ['--matches', '2400', '--seeds', VAL, '--out', art + `conc-${n}-validation2400.json`],
    }];
  if (kind === 'bands') {
    const matches = a ? Number(a) : 400;
    return [{ name: `bands-${n}-${matches}`, patch: cand(n), script: 'scripts/grid-bands.ts', args: ['--candidate', '--matches', String(matches)] }];
  }
  if (kind === 'pcd') {
    const matches = a ?? '160';
    const from = b ?? '0';
    return [{
      name: `pcd-${n}-${from}-${matches}`,
      patch: cand(n),
      script: 'scripts/scoring-press-counter.ts',
      args: ['--start', from, '--matches', matches, '--out', art + `pcd-${n}-${from}-${matches}.json`],
    }];
  }
  if (kind === 'stress')
    return [1, 2, 3].map((k) => ({
      name: `stress-${n}-val-${k}`,
      patch: cand(n),
      script: 'scripts/scoring-striker-stress.ts',
      args: ['--seeds', `cf04-stress-val-${k}`, '--games', '38', '--out', art + `stress-${n}-val-${k}.json`],
    }));
  if (kind === 'core')
    return [{
      name: `core-${n}-${a}-${b}`,
      patch: cand(n),
      script: 'scripts/grid-bands.ts',
      args: ['--report', '--partition', a, '--scale', b, '--only', 'core', '--jobs', c ?? '2', '--out', art + `core-${n}-${a}-${b}.json`],
    }];
  if (kind === 'pc')
    return [{
      name: `pc-${n}-${a}-${b}`,
      patch: cand(n),
      script: 'scripts/grid-bands.ts',
      args: ['--report', '--partition', a, '--scale', b, '--conditions', 'tactics:press-counter,tactics:counter-press', '--jobs', c ?? '3', '--out', art + `pc-${n}-${a}-${b}.json`],
    }];
  if (kind === 'tactics')
    return [{
      name: `tactics-${n}-${a}`,
      patch: cand(n),
      script: 'scripts/grid-bands.ts',
      args: ['--report', '--partition', a, '--scale', b ?? '0.25', '--only', 'tactics', '--jobs', c ?? '4', '--out', art + `tactics-${n}-${a}.json`],
    }];
  throw new Error(spec);
});
mkdirSync(dirname(process.argv[2]), { recursive: true });
writeFileSync(process.argv[2], JSON.stringify(jobs, null, 1));
console.log(jobs.map((j) => j.name).join(' '));
