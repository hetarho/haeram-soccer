// T286 release measurements after T450 (session v9n4), one after another on a quiet machine: each
// command's output, each line stamped with its time, to its own log in artifacts/benchmarks/t286/gates/ and its start/end/exit to
// steps.jsonl. A sampler records the 1-minute load average, the busiest other processes and the
// free disk every 30 s while each step runs. Same runner as handoff/gates.mjs, logs kept in tree.
// usage: node gates-v9n4.mjs <step> [<step>…]   steps: candidate storage
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, statfsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { loadavg } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raw = dirname(fileURLToPath(import.meta.url));
const tree = resolve(raw, '../../..');
const logs = `${raw}/gates`;
mkdirSync(logs, { recursive: true });
const STEPS = {
  candidate: {
    cwd: tree,
    cmd: ['pnpm', 'exec', 'tsx', 'scripts/match-model-baseline.ts', '--model', 'candidate', '--release', '--paired-with', 'artifacts/benchmarks/t286/baseline-9f69553-100.json', '--out', 'artifacts/benchmarks/t286/candidate-100.json'],
  },
  storage: { cwd: tree, cmd: ['pnpm', 'run', 'benchmark'] },
};
function topOthers() {
  try {
    const out = execFileSync('ps', ['-Ao', 'pcpu=,comm='], { encoding: 'utf8' });
    return out
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
function freeGiB() {
  try {
    const s = statfsSync(tree);
    return +((s.bavail * s.bsize) / 2 ** 30).toFixed(2);
  } catch {
    return null;
  }
}
async function run(name) {
  const step = STEPS[name];
  if (!step) throw new Error(`unknown step ${name}`);
  const logFile = `${logs}/${name}.log`;
  writeFileSync(logFile, '');
  const loadFile = `${logs}/${name}.load.jsonl`;
  const started = new Date();
  appendFileSync(`${logs}/steps.jsonl`, JSON.stringify({ step: name, event: 'start', at: started.toISOString(), cwd: step.cwd, command: step.cmd.join(' ') }) + '\n');
  const child = spawn(step.cmd[0], step.cmd.slice(1), { cwd: step.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr])
    createInterface({ input: stream }).on('line', (line) => appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`));
  const sample = () =>
    appendFileSync(loadFile, JSON.stringify({ at: new Date().toISOString(), load1: loadavg()[0], freeGiB: freeGiB(), busy: topOthers() }) + '\n');
  sample();
  const timer = setInterval(sample, 30_000);
  const status = await new Promise((done) => child.on('close', (code) => done(code)));
  clearInterval(timer);
  const ended = new Date();
  appendFileSync(`${logs}/steps.jsonl`, JSON.stringify({ step: name, event: 'end', at: ended.toISOString(), seconds: (ended - started) / 1000, status }) + '\n');
}
for (const name of process.argv.slice(2)) await run(name);
