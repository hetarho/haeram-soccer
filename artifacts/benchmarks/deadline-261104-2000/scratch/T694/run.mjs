// Lives T694's four worlds in parallel (T693's seeds, seasons and countries), one log each.
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const root = '/home/deep/haeram/haeram-soccor-balance';
const dir = `${root}/.tmp/T694`;
const candidate = `${root}/artifacts/benchmarks/T693/candidate.json`;
const cal = ['--years', '1950,1970,1990,2010', '--countries', 'ENG,ESP,FRA,GER'];
const held = ['--years', '1960,1980,2000', '--countries', 'ENG,ESP,GER,ITA,FRA,POR,NED,BEL'];
const jobs = [
  ['books-cal-0', 'owner-balance-0', cal],
  ['books-cal-1', 'owner-balance-1', cal],
  ['books-held-2', 'owner-balance-2', held],
  ['books-held-3', 'owner-balance-3', held],
];
const started = Date.now();
const runs = jobs.map(
  ([name, seed, extra]) =>
    new Promise((resolve) => {
      const log = openSync(`${dir}/${name}.log`, 'w');
      const child = spawn(
        'pnpm',
        [
          'exec',
          'tsx',
          'scripts/era-wage-spread.ts',
          '--seeds',
          seed,
          ...extra,
          '--spread',
          candidate,
          '--out',
          `${dir}/${name}.json`,
        ],
        { cwd: root, stdio: ['ignore', log, log] },
      );
      child.on('exit', (code) => resolve([name, code, (Date.now() - started) / 1000]));
    }),
);
for (const [name, code, seconds] of await Promise.all(runs))
  console.log(`${name}: exit ${code} at ${seconds.toFixed(0)} s`);
console.log(`started ${new Date(started).toISOString()}, ended ${new Date().toISOString()}`);
