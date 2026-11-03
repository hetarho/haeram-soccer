/** Paired future-career forecasts from the owner's read-only export; never writes a game save. */
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../apps/web/src/adapters/persistence';
import { simulateSeason } from '../packages/engine/src/founding';
import { MARKET_CONFIG } from '../packages/engine/src/market-prices';
import { BALLON_DOR_CONFIG } from '../packages/engine/src/ballon-dor';
import { recentRevenue, wageBill } from '../packages/engine/src/finance';
import { overall } from '../packages/engine/src/player-state';
import { measurementIdentity } from './lib/measurement-identity';
const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const at = args.indexOf(`--${key}`);
  return at < 0 ? fallback : args[at + 1]!;
};
interface Job {
  seed: number;
  variant: 'baseline' | 'candidate';
}
const candidate = structuredClone({ star: MARKET_CONFIG.star, premium: BALLON_DOR_CONFIG.premium });
const source = option('save', '/tmp/haeram-2036.haeram-save.json');
const seasons = Number(option('seasons', '4'));
async function run(job: Job) {
  Object.assign(
    MARKET_CONFIG.star,
    job.variant === 'baseline'
      ? { from: 100, full: 101, maximum: 1, globalFrom: 100, globalFull: 101 }
      : candidate.star,
  );
  Object.assign(
    BALLON_DOR_CONFIG.premium,
    job.variant === 'baseline' ? { winner: 1.2, podium: 1.1, repeatWinner: 0 } : candidate.premium,
  );
  const { world: w } = await decode(readFileSync(source, 'utf8'));
  if (job.seed) w.seed = `${w.seed}:wage-forecast:${job.seed}`;
  const originalYears = w.history.length,
    startEvents = w.events.length;
  const rows = [];
  // Close the saved partial season, then measure the requested number of whole seasons.
  for (let i = 0; i <= seasons && !w.bankrupt; i++) {
    const year = w.year;
    simulateSeason(w);
    const last = w.history.at(-1);
    rows.push({
      year,
      partial: i === 0,
      nextYear: w.year,
      cash: w.cash,
      wageBill: wageBill(w),
      revenue: recentRevenue(w),
      wageShare: Number(wageBill(w)) / Math.max(1, Number(recentRevenue(w))),
      active: w.players.filter((p) => p.status === 'active').length,
      stars: w.players.filter((p) => p.status === 'active' && overall(p) >= 85).length,
      rank: last?.year === year ? last.rank : undefined,
      tier: last?.year === year ? last.tier : undefined,
      bankrupt: w.bankrupt,
    });
  }
  const events = w.events.slice(startEvents);
  const contracts = events.filter((e) => e.kind === 'contract' || e.kind === 'contract-decline');
  return {
    ...job,
    closedSeasons: w.history.length - originalYears,
    rows,
    bankrupt: w.bankrupt,
    contractAgreements: contracts.filter((e) => e.kind === 'contract').length,
    contractDeclines: contracts.filter((e) => e.kind === 'contract-decline').length,
    contractEvents: contracts.map((e) => ({ year: e.year, title: e.title, detail: e.detail })),
    departures: events.filter((e) => e.kind === 'transfer-out').length,
  };
}
if (args.includes('--child')) {
  process.on('message', async (job: Job | false) => {
    if (!job) {
      process.disconnect!();
      return;
    }
    try {
      process.send!({ result: await run(job) });
    } catch (error) {
      process.send!({ error: String(error) });
    }
  });
} else {
  const identity = measurementIdentity('scripts/star-wage-careers.ts');
  const jobs: Job[] = Array.from({ length: Number(option('seeds', '4')) }, (_, index) =>
    (['baseline', 'candidate'] as const).map((variant) => ({
      seed: index + Number(option('seed-offset', '0')),
      variant,
    })),
  ).flat();
  const results: Awaited<ReturnType<typeof run>>[] = [],
    started = Date.now();
  await Promise.all(
    Array.from(
      { length: Number(option('jobs', '2')) },
      () =>
        new Promise<void>((resolve, reject) => {
          const child = fork(fileURLToPath(import.meta.url), [...args, '--child'], {
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
          });
          const next = () => child.send(jobs.shift() ?? false);
          child.on('message', (m: { result?: Awaited<ReturnType<typeof run>>; error?: string }) => {
            if (m.error) {
              reject(new Error(m.error));
              child.disconnect();
              return;
            }
            results.push(m.result!);
            console.log(
              `${m.result!.variant} seed ${m.result!.seed}: ${m.result!.closedSeasons} closes, bankrupt ${!!m.result!.bankrupt}`,
            );
            next();
          });
          child.on('exit', (code) => (code ? reject(new Error(`worker exit ${code}`)) : resolve()));
          child.on('error', reject);
          next();
        }),
    ),
  );
  const out = option('out', 'artifacts/benchmarks/star-balance-261103/wage-careers.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        source,
        sourceSHA256: createHash('sha256').update(readFileSync(source)).digest('hex'),
        identity,
        command: ['pnpm exec tsx scripts/star-wage-careers.ts', ...args].join(' '),
        seasons,
        candidate,
        note: 'Paired independent future streams; saved contracts and history retained, partial first close excluded from whole-season counts. These are owner-career forecasts, not new-club economy calibration.',
        seconds: (Date.now() - started) / 1000,
        results: results.sort((a, b) => a.seed - b.seed || a.variant.localeCompare(b.variant)),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`wrote ${out}`);
}
