// T689 cv04-chc (from cv04-att's): node make-jobs.mjs OUT.json SPEC… — a runner job list (cv04's `analysis/run.mjs`).
// SPEC: origins:<name>:<start>:<matches> (scripts/scoring-shot-origins.ts, grid-bands seeds),
// bands:<name>[:N], conc1200:<name> (calibration), conc2400:<name> (held-out), stress:<name>,
// pc:<name>:<partition>:<scale>[:jobs]. Same scripts and arguments as cv04-ori and cv04-att.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const art = 'artifacts/benchmarks/scoring-261104-cv04-chc/';
const cand = (n) => art + 'candidates/' + n + '.json';
const VAL = 't689-val-1,t689-val-2,t689-val-3,t689-val-4';
const jobs = process.argv.slice(3).flatMap((spec) => {
  const [kind, n, a, b, c] = spec.split(':');
  if (kind === 'origins')
    return [{
      name: `origins-${n}-${a}-${b}`,
      patch: cand(n),
      script: 'scripts/scoring-shot-origins.ts',
      args: ['--start', a, '--matches', b, '--out', art + `origins/origins-${n}-${a}-${b}.json`],
    }];
  if (kind === 'bands') {
    const matches = a ? Number(a) : 400;
    return [{ name: `bands-${n}-${matches}`, patch: cand(n), script: 'scripts/grid-bands.ts', args: ['--candidate', '--matches', String(matches)] }];
  }
  if (kind === 'conc1200')
    return [{
      name: `conc-${n}-calibration1200`,
      patch: cand(n),
      script: 'scripts/scoring-concentration.ts',
      args: ['--matches', '1200', '--out', art + `conc-${n}-calibration1200.json`],
    }];
  if (kind === 'conc2400')
    return [{
      name: `conc-${n}-validation2400`,
      patch: cand(n),
      script: 'scripts/scoring-concentration.ts',
      args: ['--matches', '2400', '--seeds', VAL, '--out', art + `conc-${n}-validation2400.json`],
    }];
  if (kind === 'stress')
    return [1, 2, 3].map((k) => ({
      name: `stress-${n}-val-${k}`,
      patch: cand(n),
      script: 'scripts/scoring-striker-stress.ts',
      args: ['--seeds', `cf04-stress-val-${k}`, '--games', '38', '--out', art + `stress-${n}-val-${k}.json`],
    }));
  if (kind === 'pc')
    return [{
      name: `pc-${n}-${a}-${b}`,
      patch: cand(n),
      script: 'scripts/grid-bands.ts',
      args: ['--report', '--partition', a, '--scale', b, '--conditions', 'tactics:press-counter,tactics:counter-press', '--jobs', c ?? '3', '--out', art + `pc-${n}-${a}-${b}.json`],
    }];
  throw new Error(spec);
});
mkdirSync(dirname(process.argv[2]), { recursive: true });
mkdirSync(art + 'origins', { recursive: true });
writeFileSync(process.argv[2], JSON.stringify(jobs, null, 1));
console.log(jobs.map((j) => j.name).join(' '));
