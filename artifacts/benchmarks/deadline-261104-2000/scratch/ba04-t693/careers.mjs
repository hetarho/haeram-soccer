// T693 driver: LEAGUE-13's reference careers, one process a career, at most JOBS at a time.
// node .tmp/ba04-t693/careers.mjs <outDir> <worldDir> <jobs> [extra owner-balance args...]
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';

const [outDir, worldDir, jobsArg, ...extra] = process.argv.slice(2);
// "7" runs the queue in order, "7r" from its end, so a second driver on the same directory meets
// the first in the middle; a job's lock file keeps two drivers from playing the same career.
const JOBS = Number(jobsArg.replace('r', ''));
const REVERSE = jobsArg.endsWith('r');
const root = new URL('../../', import.meta.url).pathname;
const tsx = `${root}node_modules/.bin/tsx`;
mkdirSync(outDir, { recursive: true });

function run(args, log) {
  return new Promise((resolve) => {
    const fd = openSync(log, 'w');
    const child = spawn(tsx, ['scripts/owner-balance.ts', ...args, ...extra], {
      cwd: root,
      stdio: ['ignore', fd, fd],
    });
    child.on('exit', (code) => resolve(code));
  });
}

const started = Date.now();
const stamp = () => `${((Date.now() - started) / 60000).toFixed(1)} min`;
// The seeds' 1950 worlds first, so the careers live them once.
const prepared = await run(
  ['--prepare', '--seeds', '2', '--world-dir', worldDir],
  `${outDir}/prepare.log`,
);
console.log(`prepare exit ${prepared} at ${stamp()}`);

// Longest careers first: 석유 재벌 references mostly end in their first seasons.
const tiers = ['local', 'selfmade', 'midsize', 'industrial', 'chaebol', 'oil'];
const queue = [];
for (const tier of tiers)
  for (const seed of [0, 1])
    for (const code of ['ENG', 'ESP', 'FRA', 'GER']) queue.push({ tier, seed, code });

if (REVERSE) queue.reverse();
const results = [];
async function worker() {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    const name = `${job.tier}-${job.code}-${job.seed}`;
    const out = `${outDir}/${name}.json`;
    if (existsSync(out)) continue;
    try {
      closeSync(openSync(`${outDir}/${name}.lock`, 'wx'));
    } catch {
      continue;
    }
    const t = Date.now();
    const code = await run(
      [
        '--tiers',
        job.tier,
        '--countries',
        job.code,
        '--first-seed',
        String(job.seed),
        '--seeds',
        '1',
        '--until',
        '1969',
        '--purse-apart',
        '--world-dir',
        worldDir,
        '--out',
        out,
      ],
      `${outDir}/${name}.log`,
    );
    results.push({ name, code, minutes: (Date.now() - t) / 60000 });
    console.log(`${name} exit ${code} in ${((Date.now() - t) / 60000).toFixed(1)} min (${stamp()})`);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));
writeFileSync(
  `${outDir}/driver${REVERSE ? '-r' : ''}.json`,
  JSON.stringify(results, null, 1),
);
console.log(`done at ${stamp()}`);
