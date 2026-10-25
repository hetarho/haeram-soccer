// T286 release measurements, one after another on a quiet machine, each command's output to its own
// log and its start/end/exit to steps.jsonl. A load sampler records the 1-minute load average and
// the busiest other processes every 30 s while each step runs.
// usage: node gates.mjs <step> [<step>…]   steps: baseline candidate storage
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync } from 'node:fs';
import { loadavg } from 'node:os';

const scratch = '/private/tmp/claude-501/-Users-ihaelam-project-haeram-soccer/a772394d-ffce-4be4-931f-8a6aaa41bb5c/scratchpad/t286';
const tree = '/Users/ihaelam/project/haeram-soccer/.claude/worktrees/agent-abeb76f2995c876f0';
const raw = `${tree}/docs/benchmarks/t286`;
const logs = `${scratch}/gates`;
mkdirSync(raw, { recursive: true });
mkdirSync(logs, { recursive: true });
const STEPS = {
  baseline: {
    cwd: `${scratch}/base9f`,
    cmd: ['pnpm', 'exec', 'tsx', 'scripts/match-model-baseline.ts', '--seasons', '100', '--out', `${raw}/baseline-9f69553-100.json`],
  },
  candidate: {
    cwd: tree,
    cmd: ['pnpm', 'exec', 'tsx', 'scripts/match-model-baseline.ts', '--model', 'candidate', '--release', '--paired-with', `${raw}/baseline-9f69553-100.json`, '--out', `${raw}/candidate-100.json`],
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
async function run(name) {
  const step = STEPS[name];
  if (!step) throw new Error(`unknown step ${name}`);
  const log = openSync(`${logs}/${name}.log`, 'w');
  const loadFile = `${logs}/${name}.load.jsonl`;
  const started = new Date();
  appendFileSync(`${logs}/steps.jsonl`, JSON.stringify({ step: name, event: 'start', at: started.toISOString(), cwd: step.cwd, command: step.cmd.join(' ') }) + '\n');
  const child = spawn(step.cmd[0], step.cmd.slice(1), { cwd: step.cwd, stdio: ['ignore', log, log] });
  const sample = () => appendFileSync(loadFile, JSON.stringify({ at: new Date().toISOString(), load1: loadavg()[0], busy: topOthers() }) + '\n');
  sample();
  const timer = setInterval(sample, 30_000);
  const status = await new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  clearInterval(timer);
  const ended = new Date();
  appendFileSync(`${logs}/steps.jsonl`, JSON.stringify({ step: name, event: 'end', at: ended.toISOString(), seconds: (ended - started) / 1000, status }) + '\n');
}
for (const name of process.argv.slice(2)) await run(name);
