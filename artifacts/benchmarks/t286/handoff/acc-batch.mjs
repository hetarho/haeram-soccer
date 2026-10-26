// T286 accuracy reads on the f1400a8b content copy (scratch t286/acc): runs the named steps in order,
// each command's stdout/stderr to its own log, and records each step's start, end and exit code.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync } from 'node:fs';

const root = '/private/tmp/claude-501/-Users-ihaelam-project-haeram-soccer/a772394d-ffce-4be4-931f-8a6aaa41bb5c/scratchpad/t286';
const cwd = `${root}/acc`;
const out = `${root}/acc-out`;
mkdirSync(out, { recursive: true });
const ROUND = '71';
const B = {
  'core:equal-top-tier': 16927,
  'gap:0': 20884,
  'gap:20': 18698,
  'tier:tier1': 16679,
  'fatigue:0': 17412,
  'fatigue:20': 16155,
  'fatigue:32': 22028,
  'fatigue:50': 17433,
  'era:2024': 17107,
  'knockout:single-match': 16578,
};
const T = {
  'tactics:possession-possession': 20287,
  'tactics:possession-press': 20071,
  'tactics:possession-counter': 15612,
  'tactics:possession-balanced': 17448,
  'tactics:press-possession': 18572,
  'tactics:press-press': 22972,
  'tactics:press-counter': 17479,
  'tactics:press-balanced': 18918,
  'tactics:counter-possession': 16750,
  'tactics:counter-press': 16578,
  'tactics:counter-counter': 12000,
  'tactics:counter-balanced': 14485,
  'tactics:balanced-possession': 17479,
  'tactics:balanced-press': 18068,
  'tactics:balanced-counter': 15050,
  'tactics:balanced-balanced': 17291,
};
const parity = (sizes, file) => {
  const ids = Object.keys(sizes).join(',');
  const sized = Object.entries(sizes)
    .map(([id, n]) => `${id}=${n}`)
    .join(',');
  return ['scripts/match-parity.ts', '--report', '--partition', 'validation', '--round', ROUND,
    '--conditions', ids, '--reference', ids, '--sizes', sized, '--jobs', '8', '--out', `${out}/${file}`];
};
const STEPS = {
  detailed: ['scripts/grid-bands.ts', '--report', '--partition', 'validation', '--round', ROUND,
    '--jobs', '8', '--out', `${out}/detailed-model-calibration.json`],
  aggregate: ['scripts/match-parity.ts', '--report', '--partition', 'validation', '--round', ROUND,
    '--scale', '13.3334', '--rare-scale', '1', '--seasons', '40', '--stress', '10000', '--jobs', '8',
    '--out', `${out}/aggregate-model-calibration.json`],
  partB: parity(B, 'partB.json'),
  partT: parity(T, 'partT.json'),
};
const steps = process.argv.slice(2);
for (const name of steps) {
  const args = STEPS[name];
  if (!args) throw new Error(`unknown step ${name}`);
  const log = openSync(`${out}/${name}.log`, 'w');
  const started = new Date();
  appendFileSync(`${out}/steps.jsonl`, JSON.stringify({ step: name, event: 'start', at: started.toISOString(), command: `pnpm exec tsx ${args.join(' ')}` }) + '\n');
  const r = spawnSync('pnpm', ['exec', 'tsx', ...args], { cwd, stdio: ['ignore', log, log] });
  const ended = new Date();
  appendFileSync(`${out}/steps.jsonl`, JSON.stringify({ step: name, event: 'end', at: ended.toISOString(), seconds: (ended - started) / 1000, status: r.status }) + '\n');
}
