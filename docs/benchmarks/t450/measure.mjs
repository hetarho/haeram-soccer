// T450 measurements, one after another on a quiet machine (after T286's gates.mjs): each step's
// output goes to .tmp/t450/gates/<side>-<step>.log and its start, end, exit and the commit the
// tree's engine came from to .tmp/t450/gates/steps.jsonl; a sampler records the 1-minute load and
// the busiest other processes every 30 s while a step runs (<side>-<step>.load.jsonl).
// usage: node docs/benchmarks/t450/measure.mjs <side> <step> [<step>…]
//   side: before (the tree's engine checked out from 4a8c03dc) or after
//   steps: seasons active fixture series
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync } from 'node:fs';
import { loadavg } from 'node:os';

const [side, ...steps] = process.argv.slice(2);
if (side !== 'before' && side !== 'after') throw new Error('side is before or after');
const logs = '.tmp/t450/gates';
mkdirSync(logs, { recursive: true });
const tsx = ['pnpm', 'exec', 'tsx'];
const STEPS = {
  seasons: [
    ...tsx,
    'docs/benchmarks/t450/time-seasons.mts',
    '3',
    '.tmp/t450/before/season-1.world.json',
    '.tmp/t450/before/season-30.world.json',
    '.tmp/t450/before/season-60.world.json',
    '.tmp/t450/before/season-80.world.json',
  ],
  active: [
    ...tsx,
    'docs/benchmarks/t450/time-seasons.mts',
    '3',
    '.tmp/t450/active/season-30.world.json',
    '.tmp/t450/active/season-50.world.json',
  ],
  fixture: [
    ...tsx,
    'scripts/match-model-baseline.ts',
    '--model',
    'candidate',
    '--seasons',
    '1',
    '--pilot',
    '1',
    '--out',
    `.tmp/t450/mmb-${side}.json`,
  ],
  series: [...tsx, 'docs/benchmarks/t450/build-worlds.mts', '80', `.tmp/t450/series-${side}`, '30,60,80'],
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function busiest() {
  try {
    return execFileSync('ps', ['-Ao', 'pcpu=,comm='], { encoding: 'utf8' })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [cpu, ...rest] = l.split(/\s+/);
        return { cpu: Number(cpu), comm: rest.join(' ').split('/').pop() };
      })
      .filter((p) => p.cpu >= 20)
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 5);
  } catch {
    return [];
  }
}
async function run(step) {
  const cmd = STEPS[step];
  if (!cmd) throw new Error(`unknown step ${step}`);
  const name = `${side}-${step}`;
  const log = openSync(`${logs}/${name}.log`, 'w');
  const loads = `${logs}/${name}.load.jsonl`;
  const engine = side === 'before' ? '4a8c03dc' : git('rev-parse', 'HEAD');
  const dirty = git('status', '--porcelain', '--', 'packages', 'scripts', 'tests');
  const started = new Date();
  appendFileSync(
    `${logs}/steps.jsonl`,
    JSON.stringify({ step: name, event: 'start', at: started.toISOString(), engine, dirty, command: cmd.join(' ') }) + '\n',
  );
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', log, log] });
  const sample = () =>
    appendFileSync(loads, JSON.stringify({ at: new Date().toISOString(), load1: loadavg()[0], busy: busiest() }) + '\n');
  sample();
  const timer = setInterval(sample, 30_000);
  const status = await new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  clearInterval(timer);
  const ended = new Date();
  appendFileSync(
    `${logs}/steps.jsonl`,
    JSON.stringify({ step: name, event: 'end', at: ended.toISOString(), seconds: (ended - started) / 1000, status }) + '\n',
  );
}
for (const step of steps) await run(step);
