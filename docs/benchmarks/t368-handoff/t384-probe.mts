/**
 * T384 probe: plays one condition's fixtures on the tree given by --root, on the candidate grid
 * (observed) and on the aggregate path, and reads offside by the receiver's 판단력 (raw attribute).
 * Grid: every pass to a receiver in an offside position, from the engine's own offside draws
 * (`GridSetup.offsideDraws`), with the call rate by 판단력 quarter (cutoffs from those receptions) and
 * by linebreaker. Aggregate: its
 * offsides a team and the share of calls by the same quarters. Also prints the MATCH-23 core.
 *
 *   pnpm exec tsx t384-probe.mts --root <tree> --partition calibration --round 55 --count 600
 *     --jobs 8 [--patch <json>] [--out file.json]
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const root = opt('root', '');
if (!root) throw new Error('--root');
const imp = (p: string) => import(`${root}/${p}`);

const { MATCH_MODEL_REVISION } = await imp('packages/contracts/src/match-model.ts');
const { PD } = await imp('packages/contracts/src/detail.ts');
const { playGrid } = await imp('packages/engine/src/grid/engine.ts');
const { buildGridSetup } = await imp('packages/engine/src/grid/setup.ts');
const gb = await imp('scripts/grid-bands.ts');
const mp = await imp('scripts/lib/match-parity.ts');
const agg = await imp('scripts/match-parity.ts');
const variants = await imp('scripts/t328-counter-roles-variants.ts');
const patch = opt('patch', '');
if (patch) for (const p of variants.behaviourOf('', patch)) variants.applyBehaviour(p);

interface Job {
  from: number;
  count: number;
  partition: string;
  round: number;
  condition: string;
}
/** A reception from an offside position: raw 판단력, linebreaker, called, chance, 판단력 at the draw. */
type Reception = [number, 0 | 1, 0 | 1, number, number];

function playJob(job: Job) {
  const c = mp.conditionOf(job.condition);
  const r = gb.conditionClubs(c, job.partition, job.round);
  const receptions: Reception[] = [];
  /** Aggregate calls: [raw 판단력, calls] per player and match. */
  const aggCalls: [number, number][] = [];
  let teamMatches = 0;
  let gridOffsides = 0;
  let aggOffsides = 0;
  const samples: unknown[] = [];
  for (let i = 0; i < job.from + job.count; i++) {
    const { w, f } = gb.conditionFixture(c, job.partition, job.round, i, r);
    if (i < job.from) continue;
    const setup = buildGridSetup(w, f, {
      observe: false,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
    });
    const judgement = new Map<string, number>();
    for (const side of [0, 1] as const)
      for (const p of setup.rosters[side]) judgement.set(p.id, p.attrs.decisions);
    const draws: [0 | 1, number, number, 0 | 1, number][] = [];
    setup.offsideDraws = draws;
    const result = playGrid(setup);
    teamMatches += 2;
    for (const [side, idx, chance, called, skillValue] of draws) {
      const p = setup.rosters[side][idx]!;
      receptions.push([
        p.attrs.decisions,
        p.traits.includes('linebreaker') ? 1 : 0,
        called,
        chance,
        skillValue,
      ]);
      gridOffsides += called;
    }
    samples.push({
      record: { ...result.record },
      diagnostics: result.diagnostics,
      incidentsTracked: true,
      condition: c.id,
      gap: 0,
      freshness: result.diagnostics.freshness,
    });
    // A fresh world for the aggregate path: the same fixture, untouched by the grid's match.
    const fresh = gb.conditionFixture(c, job.partition, job.round, i, r);
    const { sample } = agg.aggregateRun(fresh.w, fresh.f, c.id);
    for (const p of sample.record.players ?? []) {
      const calls = p.detail?.[PD.offsides] ?? 0;
      aggOffsides += calls;
      const d = judgement.get(p.id);
      if (calls > 0 && d !== undefined) aggCalls.push([d, calls]);
    }
  }
  return { teamMatches, gridOffsides, aggOffsides, receptions, aggCalls, samples };
}

const quantile = (sorted: number[], q: number) =>
  sorted.length ? sorted[Math.floor(q * (sorted.length - 1))]! : NaN;
const quarterOf = (cut: number[], d: number) => (d <= cut[0]! ? 0 : d <= cut[1]! ? 1 : d <= cut[2]! ? 2 : 3);
const ci = (k: number, n: number): string => {
  const p = k / n;
  const h = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return `${(100 * p).toFixed(2)}% [${(100 * (p - h)).toFixed(2)}, ${(100 * (p + h)).toFixed(2)}]`;
};

if (args.includes('--child')) {
  process.on('message', (job: Job) => process.send!(playJob(job)));
} else {
  const partition = opt('partition', 'calibration');
  const round = Number(opt('round', '55'));
  const count = Number(opt('count', '600'));
  const jobs = Number(opt('jobs', '8'));
  const chunk = Number(opt('chunk', '25'));
  const condition = opt('condition', 'core:equal-top-tier');
  const queue: Job[] = Array.from({ length: Math.ceil(count / chunk) }, (_, k) => ({
    from: k * chunk,
    count: Math.min(chunk, count - k * chunk),
    partition,
    round,
    condition,
  }));
  const started = performance.now();
  const done: ReturnType<typeof playJob>[] = [];
  await Promise.all(
    Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      const child = fork(fileURLToPath(import.meta.url), [...args, '--child'], {
        execArgv: process.execArgv,
      });
      for (let job = queue.shift(); job; job = queue.shift()) {
        const next = job;
        const res = await new Promise<ReturnType<typeof playJob>>((resolve, reject) => {
          child.once('message', (m) => resolve(m as ReturnType<typeof playJob>));
          child.once('exit', (code) => reject(new Error(`child exited ${code} at ${next.from}`)));
          child.send(next);
        });
        child.removeAllListeners('exit');
        done.push(res);
      }
      child.kill();
    }),
  );
  const tm = done.reduce((a, d) => a + d.teamMatches, 0);
  const receptions = done.flatMap((d) => d.receptions);
  const aggCalls = done.flatMap((d) => d.aggCalls);
  const gridOffsides = done.reduce((a, d) => a + d.gridOffsides, 0);
  const aggOffsides = done.reduce((a, d) => a + d.aggOffsides, 0);
  const sorted = receptions.map((x) => x[0]).sort((a, b) => a - b);
  const skillSorted = receptions.map((x) => x[4]).sort((a, b) => a - b);
  const skillCut = [0.25, 0.5, 0.75].map((q) => quantile(skillSorted, q));
  // `--cut a,b,c` sets the raw quarters when the tree records no draws (a baseline before T384).
  const cut = opt('cut', '')
    ? opt('cut', '').split(',').map(Number)
    : [0.25, 0.5, 0.75].map((q) => quantile(sorted, q));
  const byQ = [0, 1, 2, 3].map(() => ({ n: 0, called: 0, chance: 0 }));
  const byLb = [0, 1].map(() => ({ n: 0, called: 0 }));
  const rawQ = [0, 0, 0, 0];
  const byRawQ = [0, 1, 2, 3].map(() => ({ n: 0, called: 0 }));
  for (const [d, lb, called, chance, judged] of receptions) {
    rawQ[quarterOf(cut, d)]! += called;
    byRawQ[quarterOf(cut, d)]!.n++;
    byRawQ[quarterOf(cut, d)]!.called += called;
    const q = byQ[quarterOf(skillCut, judged)]!;
    q.n++;
    q.called += called;
    q.chance += chance;
    byLb[lb]!.n++;
    byLb[lb]!.called += called;
  }
  const aggQ = [0, 0, 0, 0];
  for (const [d, calls] of aggCalls) aggQ[quarterOf(cut, d)]! += calls;
  const aggTotal = aggQ.reduce((a, b) => a + b, 0);
  const gridQ = rawQ;
  const gridTotal = gridQ.reduce((a, b) => a + b, 0);
  const rate = (q: { n: number; called: number }) => q.called / q.n;
  console.log(
    `${condition} ${partition} r${round}: ${tm / 2} matches (${((performance.now() - started) / 1000).toFixed(0)} s), patch ${patch || 'none'}`,
  );
  console.log(
    `  grid: offsides a team ${(gridOffsides / tm).toFixed(3)}; receptions from an offside position a team ${(receptions.length / tm).toFixed(2)}, called ${ci(gridTotal, receptions.length)}`,
  );
  console.log(
    `  grid raw 판단력 quarters (cutoffs ${cut.join(' / ')}): ${byRawQ.map((q, k) => `Q${k + 1} ${ci(q.called, q.n)} of ${q.n}`).join('; ')}; lowest ÷ highest ${(rate(byRawQ[0]!) / rate(byRawQ[3]!)).toFixed(2)}`,
  );
  console.log(
    `  grid quarters of 판단력 at the draw (cutoffs ${skillCut.map((x) => x.toFixed(1)).join(' / ')}): ${byQ.map((q, k) => `Q${k + 1} ${ci(q.called, q.n)} of ${q.n}`).join('; ')}; lowest ÷ highest ${(rate(byQ[0]!) / rate(byQ[3]!)).toFixed(2)} (mean chance ${byQ.map((q) => (100 * q.chance / q.n).toFixed(2)).join(' / ')}%, ratio ${(byQ[0]!.chance / byQ[0]!.n / (byQ[3]!.chance / byQ[3]!.n)).toFixed(2)})`,
  );
  console.log(
    `  grid 판단력 on the duels' scale at the draw: ${[0.1, 0.25, 0.5, 0.75, 0.9].map((q) => quantile(skillSorted, q).toFixed(1)).join(' / ')} (10/25/50/75/90%)`,
  );
  console.log(
    `  grid linebreaker ${ci(byLb[1]!.called, byLb[1]!.n)} of ${byLb[1]!.n}, others ${ci(byLb[0]!.called, byLb[0]!.n)}; share of calls by raw 판단력 quarter (cutoffs ${cut.join(' / ')}) ${gridQ.map((x) => ((100 * x) / gridTotal).toFixed(1)).join(' / ')}%`,
  );
  console.log(
    `  aggregate: offsides a team ${(aggOffsides / tm).toFixed(3)}; share of calls by raw 판단력 quarter ${aggQ.map((x) => ((100 * x) / aggTotal).toFixed(1)).join(' / ')}%`,
  );
  const samples = done.flatMap((d) => d.samples);
  for (const line of mp.describeAdvancedCounters(mp.advancedCounterVerdicts(samples)))
    if (/through|box entr/i.test(line)) console.log(`  ${line.trim()}`);
  const core = mp.buildTargetReport(samples);
  console.log(
    `  grid core ${core.filter((x: { status: string }) => x.status === 'inside').length}/${core.length} inside`,
  );
  for (const x of core)
    if (x.status !== 'inside' || /offside/i.test(x.id))
      console.log(
        `    ${x.status.padEnd(12)} ${x.id}: ${x.value?.toFixed(3)} [${x.interval?.[0].toFixed(3)}, ${x.interval?.[1].toFixed(3)}] band ${x.band.join('–')}`,
      );
  const out = opt('out', '');
  if (out)
    writeFileSync(
      out,
      JSON.stringify({ tm, cut, skillCut, byQ, byRawQ, byLb, gridOffsides, aggOffsides, aggQ, gridQ, core }),
    );
}
