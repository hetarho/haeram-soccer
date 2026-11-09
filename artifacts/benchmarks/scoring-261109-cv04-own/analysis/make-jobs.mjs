// T689 cv04-own (cv04-ent's, its paths moved): node make-jobs.mjs OUT.json SPEC… — a runner job list
// (`run.mjs` here). SPEC: chased:<name>:<start>:<matches> (scripts/scoring-chased-shots.ts, with this window's
// `own|…` rows), origins:<name>:<start>:<matches> (scripts/scoring-shot-origins.ts), bands:<name>[:N],
// entries:<name>:<start>:<matches> (scripts/scoring-box-entries.ts), conc1200:<name> (calibration),
// conc2400:<name> (held-out), stress:<name>, season:<name>:<seeds>:<country>, core:<name>:<partition>:<scale>[:jobs],
// pc:<name>:<partition>:<scale>[:jobs]. Same scripts and arguments as cv04-ent and cv04-kpr.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const art = 'artifacts/benchmarks/scoring-261109-cv04-own/';
const cand = (n) => art + 'candidates/' + n + '.json';
const VAL = 't689-val-1,t689-val-2,t689-val-3,t689-val-4';
const jobs = process.argv.slice(3).flatMap((spec) => {
  const [kind, n, a, b, c] = spec.split(':');
  const one = (name, script, args) => [{ name, patch: cand(n), script, args }];
  if (kind === 'chased')
    return one(`chased-${n}-${a}-${b}`, 'scripts/scoring-chased-shots.ts', [
      '--start', a, '--matches', b, '--out', art + `chased/chased-${n}-${a}-${b}.json`,
    ]);
  if (kind === 'entries')
    return one(`entries-${n}-${a}-${b}`, 'scripts/scoring-box-entries.ts', [
      '--start', a, '--matches', b, '--out', art + `entries/entries-${n}-${a}-${b}.json`,
    ]);
  if (kind === 'origins')
    return one(`origins-${n}-${a}-${b}`, 'scripts/scoring-shot-origins.ts', [
      '--start', a, '--matches', b, '--out', art + `origins/origins-${n}-${a}-${b}.json`,
    ]);
  if (kind === 'bands') {
    const matches = a ? Number(a) : 400;
    return one(`bands-${n}-${matches}`, 'scripts/grid-bands.ts', ['--candidate', '--matches', String(matches)]);
  }
  if (kind === 'conc1200')
    return one(`conc-${n}-calibration1200`, 'scripts/scoring-concentration.ts', [
      '--matches', '1200', '--out', art + `conc-${n}-calibration1200.json`,
    ]);
  if (kind === 'conc2400')
    return one(`conc-${n}-validation2400`, 'scripts/scoring-concentration.ts', [
      '--matches', '2400', '--seeds', VAL, '--out', art + `conc-${n}-validation2400.json`,
    ]);
  if (kind === 'stress')
    return [1, 2, 3].flatMap((k) =>
      one(`stress-${n}-val-${k}`, 'scripts/scoring-striker-stress.ts', [
        '--seeds', `cf04-stress-val-${k}`, '--games', '38', '--out', art + `stress-${n}-val-${k}.json`,
      ]),
    );
  if (kind === 'core')
    return one(`core-${n}-${a}-${b}`, 'scripts/grid-bands.ts', [
      '--report', '--partition', a, '--scale', b, '--only', 'core', '--jobs', c ?? '2',
      '--out', art + `core-${n}-${a}-${b}.json`,
    ]);
  if (kind === 'pc')
    return one(`pc-${n}-${a}-${b}`, 'scripts/grid-bands.ts', [
      '--report', '--partition', a, '--scale', b, '--conditions', 'tactics:press-counter,tactics:counter-press',
      '--jobs', c ?? '3', '--out', art + `pc-${n}-${a}-${b}.json`,
    ]);
  throw new Error(spec);
});
mkdirSync(dirname(process.argv[2]), { recursive: true });
for (const d of ['chased', 'origins', 'entries']) mkdirSync(art + d, { recursive: true });
writeFileSync(process.argv[2], JSON.stringify(jobs, null, 1));
console.log(jobs.map((j) => j.name).join(' '));
