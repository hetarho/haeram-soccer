// T689 cv04-hold: node make-jobs.mjs OUT.json SPEC… — a runner job list (cv04's `analysis/run.mjs`).
// SPEC: conc:<name>[:validation], conc2400:<name>[:validation], bands:<name>[:N], regain:<name>,
// stress:<name> (three seeds), report:<name>:<partition>[:scale]. Same scripts and arguments as cv04.
import { writeFileSync } from 'node:fs';

const art = 'artifacts/benchmarks/scoring-261104-cv04-hold/';
const cand = (n) => art + 'candidates/' + n + '.json';
const CAL = 'grid-bands-1,grid-bands-2,grid-bands-3,grid-bands-4';
const VAL = 't689-val-1,t689-val-2,t689-val-3,t689-val-4';
const conc = (n, matches, validation) => {
  const part = (validation ? 'validation' : 'calibration') + (matches === 1200 ? '' : matches);
  return {
    name: `conc-${n}-${part}`,
    patch: cand(n),
    script: 'scripts/scoring-concentration.ts',
    args: ['--matches', String(matches), '--seeds', validation ? VAL : CAL, '--out', art + `conc-${n}-${part}.json`],
  };
};
const jobs = process.argv.slice(3).flatMap((spec) => {
  const [kind, n, a, b] = spec.split(':');
  if (kind === 'conc') return [conc(n, 1200, a === 'validation')];
  if (kind === 'conc2400') return [conc(n, 2400, a === 'validation')];
  if (kind === 'bands') {
    const matches = a ? Number(a) : 400;
    return [{ name: `bands-${n}-${matches}`, patch: cand(n), script: 'scripts/grid-bands.ts', args: ['--candidate', '--matches', String(matches)] }];
  }
  if (kind === 'regain')
    return [{ name: `regain-${n}`, patch: cand(n), script: 'scripts/scoring-regain-shots.ts', args: ['--start', '600', '--matches', '120', '--out', art + `regain-${n}-600-720.json`] }];
  if (kind === 'stress')
    return [1, 2, 3].map((k) => ({
      name: `stress-${n}-val-${k}`,
      patch: cand(n),
      script: 'scripts/scoring-striker-stress.ts',
      args: ['--seeds', `cf04-stress-val-${k}`, '--games', '38', '--out', art + `stress-${n}-val-${k}.json`],
    }));
  if (kind === 'report' || kind === 'tactics')
    return [{
      name: `${kind}-${n}-${a}`,
      patch: cand(n),
      script: 'scripts/grid-bands.ts',
      args: ['--report', '--partition', a, '--scale', b ?? '0.25', '--only', kind === 'report' ? 'core,tactics' : 'tactics', '--jobs', spec.split(':')[4] ?? '4', '--out', art + `${kind}-${n}-${a}.json`],
    }];
  throw new Error(spec);
});
writeFileSync(process.argv[2], JSON.stringify(jobs, null, 1));
console.log(jobs.map((j) => j.name).join(' '));
