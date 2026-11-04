// Writes the T696 job list: four candidate worlds and four released worlds (books and champions),
// then the careers' 1950 worlds on the candidate and the 16 careers.
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = '/home/deep/haeram/haeram-soccor-balance/.tmp/t696';
const cand = 'artifacts/benchmarks/T696/candidate.json';
mkdirSync(`${dir}/logs`, { recursive: true });
mkdirSync(`${dir}/books`, { recursive: true });
mkdirSync(`${dir}/careers`, { recursive: true });
const jobs = [];
const prepare = (seed) => ({
  name: `prepare-${seed}`,
  log: `${dir}/logs/prepare-${seed}`,
  args: ['scripts/owner-balance.ts', '--spread', cand, '--means', '--world-dir', `${dir}/worlds`, '--prepare', '--seeds', '1', '--first-seed', String(seed)],
});
jobs.push(prepare(0), prepare(1));
const books = (seed, kind) => {
  const held = seed >= 2;
  const args = [
    'scripts/era-wage-spread.ts',
    '--seeds', `owner-balance-${seed}`,
    '--years', held ? '1960,1980,2000' : '1950,1970,1990,2010',
    '--countries', held ? 'ENG,ESP,GER,ITA,FRA,POR,NED,BEL' : 'ENG,ESP,FRA,GER',
    '--until', held ? '2009' : '2010',
    '--out', `${dir}/books/${kind}-${seed}.json`,
  ];
  if (kind === 'candidate') args.push('--spread', cand, '--means');
  return { name: `${kind}-${seed}`, log: `${dir}/logs/${kind}-${seed}`, args };
};
for (const seed of [0, 1, 2, 3]) jobs.push(books(seed, 'candidate'));
for (const seed of [0, 1, 2, 3]) jobs.push(books(seed, 'released'));
for (const tier of ['oil', 'midsize'])
  for (const code of ['ENG', 'ESP', 'FRA', 'GER'])
    for (const seed of [0, 1])
      jobs.push({
        name: `career-${tier}-${code}-${seed}`,
        log: `${dir}/logs/career-${tier}-${code}-${seed}`,
        after: [`prepare-${seed}`],
        args: [
          'scripts/owner-balance.ts', '--tiers', tier, '--countries', code, '--seeds', '1', '--first-seed', String(seed),
          '--until', '1969', '--purse-apart', '--spread', cand, '--means', '--world-dir', `${dir}/worlds`,
          '--out', `${dir}/careers/${tier}-${code}-${seed}.json`,
        ],
      });
writeFileSync(`${dir}/jobs.json`, JSON.stringify(jobs, null, 1));
console.log(`${jobs.length} jobs`);
