// T689 cv04: node make-jobs.mjs OUT.json WAVE — writes a runner job list.
import { mkdirSync, writeFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const art = 'artifacts/benchmarks/scoring-261104-cv04/';
mkdirSync(root + art, { recursive: true });
const wave = process.argv[3];
const cand = (n) => art + 'candidates/' + n + '.json';
const conc = (n, seeds = 'grid-bands-1,grid-bands-2,grid-bands-3,grid-bands-4', part = 'calibration') => ({
  name: `conc-${n}-${part}`,
  patch: cand(n),
  script: 'scripts/scoring-concentration.ts',
  args: ['--matches', '1200', '--seeds', seeds, '--out', art + `conc-${n}-${part}.json`],
});
const bands = (n, matches = 400) => ({
  name: `bands-${n}-${matches}`,
  patch: cand(n),
  script: 'scripts/grid-bands.ts',
  args: ['--candidate', '--matches', String(matches)],
});
const waves = {
  w1: [
    ...['q10', 'q10s14', 'q15s20', 'q10s14L6', 'alone0', 'clr6'].map((n) => conc(n)),
    ...['ctl', 'q10', 'q10s14', 'q15s20', 'q10s14L6', 'alone0', 'clr6'].map((n) => bands(n)),
  ],
  w2: [
    ...['ks3', 'ks5', 'view5', 'view7', 'view5ks5'].map((n) => bands(n)),
    regain('ks5'),
  ],
};
function regain(n) {
  return {
    name: `regain-${n}`,
    patch: cand(n),
    script: 'scripts/scoring-regain-shots.ts',
    args: ['--start', '600', '--matches', '120', '--out', art + `regain-${n}-600-720.json`],
  };
}
// Generic waves from argv: conc:<name>[:validation], bands:<name>[:N], regain:<name>,
// stress:<name> (three seeds), report:<name>:<partition>[:scale].
const VAL = 't689-val-1,t689-val-2,t689-val-3,t689-val-4';
if (!waves[wave]) {
  waves[wave] = process.argv.slice(4).flatMap((spec) => {
    const [kind, n, a, b] = spec.split(':');
    if (kind === 'conc') return [a === 'validation' ? conc(n, VAL, 'validation') : conc(n)];
    if (kind === 'conc2400') {
      const part = a === 'validation' ? 'validation2400' : 'calibration2400';
      return [
        {
          name: `conc-${n}-${part}`,
          patch: cand(n),
          script: 'scripts/scoring-concentration.ts',
          args: [
            '--matches',
            '2400',
            '--seeds',
            a === 'validation' ? VAL : 'grid-bands-1,grid-bands-2,grid-bands-3,grid-bands-4',
            '--out',
            art + `conc-${n}-${part}.json`,
          ],
        },
      ];
    }
    if (kind === 'bands') return [bands(n, a ? Number(a) : 400)];
    if (kind === 'regain') return [regain(n)];
    if (kind === 'stress')
      return [1, 2, 3].map((k) => ({
        name: `stress-${n}-val-${k}`,
        patch: cand(n),
        script: 'scripts/scoring-striker-stress.ts',
        args: ['--seeds', `cf04-stress-val-${k}`, '--games', '38', '--out', art + `stress-${n}-val-${k}.json`],
      }));
    if (kind === 'report')
      return [
        {
          name: `report-${n}-${a}`,
          patch: cand(n),
          script: 'scripts/grid-bands.ts',
          args: [
            '--report',
            '--partition',
            a,
            '--scale',
            b ?? '0.25',
            '--only',
            'core,tactics',
            '--jobs',
            '4',
            '--out',
            art + `report-${n}-${a}.json`,
          ],
        },
      ];
    throw new Error(spec);
  });
}
writeFileSync(process.argv[2], JSON.stringify(waves[wave], null, 1));
console.log(waves[wave].map((j) => j.name).join(' '));
