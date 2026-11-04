// T689 cv04-att (copied from cv04-box's): node make-jobs.mjs OUT.json SPEC… — a runner job list (cv04's `analysis/run.mjs`).
// SPEC: conc2400:<name> (held-out), conc1200:<name> (calibration), bands:<name>[:N],
// stress:<name> (three seeds), season:<name>[:seeds[:country]], core:<name>:<partition>:<scale>[:jobs],
// pc:<name>:<partition>:<scale>[:jobs] (press v counter only),
// entries:<name>:<start>:<matches> (cv04-box's box-entry diagnostic `scripts/scoring-box-entries.ts`,
// grid-bands seeds). Same scripts and arguments as cv04, cv04-hold, cv04-sit, cv04-sym, cv04-ori and cv04-box.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const art = 'artifacts/benchmarks/scoring-261104-cv04-att/';
const cand = (n) => art + 'candidates/' + n + '.json';
const VAL = 't689-val-1,t689-val-2,t689-val-3,t689-val-4';
const jobs = process.argv.slice(3).flatMap((spec) => {
  const [kind, n, a, b, c] = spec.split(':');
  if (kind === 'entries')
    return [{
      name: `entries-${n}-${a}-${b}`,
      patch: cand(n),
      script: 'scripts/scoring-box-entries.ts',
      args: ['--start', a, '--matches', b, '--out', art + `entries/entries-${n}-${a}-${b}.json`],
    }];
  if (kind === 'conc2400')
    return [{
      name: `conc-${n}-validation2400`,
      patch: cand(n),
      script: 'scripts/scoring-concentration.ts',
      args: ['--matches', '2400', '--seeds', VAL, '--out', art + `conc-${n}-validation2400.json`],
    }];
  if (kind === 'conc1200')
    return [{
      name: `conc-${n}-calibration1200`,
      patch: cand(n),
      script: 'scripts/scoring-concentration.ts',
      args: ['--matches', '1200', '--out', art + `conc-${n}-calibration1200.json`],
    }];
  if (kind === 'season') {
    const nums = (a ?? '12').split('');
    const country = b ?? 'ENG';
    const tag = country === 'ENG' ? '' : country.toLowerCase();
    return nums.map((k) => `t689-season-${k}`).flatMap((seed) =>
      [[0, 7], [7, 14], [14, 20]].map(([lo, hi]) => ({
        name: `season-${n}-${tag}${seed.slice(-1)}-${lo}`,
        patch: cand(n),
        script: 'scripts/scoring-season-share.ts',
        args: [
          '--country', country,
          '--clubs', Array.from({ length: hi - lo }, (_, i) => lo + i).join(','),
          '--seeds', seed, '--year', '2024',
          '--out', art + `season/season-${n}-${tag}${seed.slice(-1)}-${lo}.json`,
        ],
      })),
    );
  }
  if (kind === 'bands') {
    const matches = a ? Number(a) : 400;
    return [{ name: `bands-${n}-${matches}`, patch: cand(n), script: 'scripts/grid-bands.ts', args: ['--candidate', '--matches', String(matches)] }];
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
  throw new Error(spec);
});
mkdirSync(dirname(process.argv[2]), { recursive: true });
for (const d of ['entries', 'season']) mkdirSync(art + d, { recursive: true });
writeFileSync(process.argv[2], JSON.stringify(jobs, null, 1));
console.log(jobs.map((j) => j.name).join(' '));
