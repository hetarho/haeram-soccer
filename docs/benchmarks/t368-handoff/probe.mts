/**
 * T368 scratch probe: plays core matches observed on the tree given by --root and reads, from the
 * trace, every open-play pass decision against the state it was decided in (the previous entry's
 * positions): passes completed to a receiver beyond the ball and the second-last opponent in the
 * opponent half, offside calls, and how many attackers stand offside at a decision. Also prints the
 * MATCH-30 counters and MATCH-23 core of those matches.
 *
 *   pnpm exec tsx probe.mts --root <tree> --partition calibration --round 41 --count 200 --jobs 4
 *     [--patch <json>] [--out file.json]
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
const { playGrid } = await imp('packages/engine/src/grid/engine.ts');
const { buildGridSetup } = await imp('packages/engine/src/grid/setup.ts');
const { rating } = await imp('packages/engine/src/index.ts');
const gb = await imp('scripts/grid-bands.ts');
const mp = await imp('scripts/lib/match-parity.ts');
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

const L = 105;
const W = 68;
function playJob(job: Job) {
  const c = mp.conditionOf(job.condition);
  const params = c.params;
  const r = gb.conditionClubs(c, job.partition, job.round);
  const tally = {
    teamMatches: 0,
    passes: 0,
    completed: 0,
    completedBeyond: 0,
    completedBeyondRun: 0,
    attemptsBeyondKnown: 0,
    offsides: 0,
    throughKind: 0,
    throughKindDone: 0,
    throughKindBeyond: 0,
    decisions: 0,
    attackersOffsideAtDecision: 0,
    runnersAtDecision: 0,
    runnersOffsideAtDecision: 0,
  };
  const samples: unknown[] = [];
  for (let i = 0; i < job.from + job.count; i++) {
    const { w, home, away, f } = gb.conditionFixture(c, job.partition, job.round, i, r);
    if (i < job.from) continue;
    const setup = buildGridSetup(w, f, {
      observe: true,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
      ...(c.family === 'tactics' ? { tactics: [params.home, params.away] } : {}),
    });
    if (c.family === 'tactics') gb.forceTacticRosters(w, f, setup, [home, away], params.fatigue);
    const result = playGrid(setup);
    const t = result.trace!;
    tally.teamMatches += 2;
    for (let k = 1; k < t.length; k++) {
      const e = t[k]!;
      const prev = t[k - 1]!;
      if (e.action !== 'pass' || !e.from || e.idx < 0) continue;
      const side = e.side as 0 | 1;
      const foe = (1 - side) as 0 | 1;
      const af = (x: number, y: number): [number, number] =>
        side === 0 ? [x, y] : [L - x, W - y];
      // Decision state: the previous entry's snapshot.
      const xs: number[] = [];
      for (let slot = 0; slot < 11; slot++) {
        const q = foe * 11 + slot;
        const x = prev.positions[q * 2]!;
        if (Number.isNaN(x) || prev.slots[q]! < 0) continue;
        xs.push(af(x, prev.positions[q * 2 + 1]!)[0]);
      }
      xs.sort((a, b) => b - a);
      const line = xs.length > 1 ? xs[1]! : (xs[0] ?? L);
      const ball = af(prev.ball[0], prev.ball[1])[0];
      const posOf = (idx: number) => {
        for (let slot = 0; slot < 11; slot++) {
          const q = side * 11 + slot;
          if (prev.slots[q] === idx)
            return { p: af(prev.positions[q * 2]!, prev.positions[q * 2 + 1]!), q };
        }
        return undefined;
      };
      const beyond = (x: number) => x > L / 2 && x > line && x > ball;
      tally.decisions++;
      for (let slot = 0; slot < 11; slot++) {
        const q = side * 11 + slot;
        const idx = prev.slots[q]!;
        if (idx < 0 || idx === e.idx) continue;
        const x = af(prev.positions[q * 2]!, prev.positions[q * 2 + 1]!)[0];
        const intent = prev.intentions?.[q] as { kind?: string; run?: string; end?: string } | null;
        const running = intent && !intent.end && intent.kind === 'run' && intent.run === 'behind';
        if (beyond(x)) tally.attackersOffsideAtDecision++;
        if (running) {
          tally.runnersAtDecision++;
          if (beyond(x)) tally.runnersOffsideAtDecision++;
        }
      }
      tally.passes++;
      if (e.kind === 'through') tally.throughKind++;
      if (e.outcome === 'offside') tally.offsides++;
      const recv = e.receiver;
      if (recv === undefined) continue;
      const at = posOf(recv);
      if (!at) continue;
      if (e.outcome === 'complete') {
        tally.completed++;
        if (e.kind === 'through') tally.throughKindDone++;
        if (beyond(at.p[0])) {
          tally.completedBeyond++;
          if (e.kind === 'through') tally.throughKindBeyond++;
          const intent = prev.intentions?.[at.q] as { kind?: string; run?: string; end?: string } | null;
          if (intent && !intent.end && intent.kind === 'run') tally.completedBeyondRun++;
        }
      }
    }
    samples.push({
      record: { ...result.record },
      diagnostics: result.diagnostics,
      incidentsTracked: true,
      condition: c.id,
      gap: rating(w, home, f) + 3 - rating(w, away, f),
      freshness: result.diagnostics.freshness,
    });
  }
  return { tally, samples };
}

if (args.includes('--child')) {
  process.on('message', (job: Job) => process.send!(playJob(job)));
} else {
  const partition = opt('partition', 'calibration');
  const round = Number(opt('round', '41'));
  const count = Number(opt('count', '200'));
  const jobs = Number(opt('jobs', '4'));
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
  const sum: Record<string, number> = {};
  for (const d of done) for (const [k, v] of Object.entries(d.tally)) sum[k] = (sum[k] ?? 0) + v;
  const tm = sum.teamMatches!;
  const per = (k: string) => (sum[k]! / tm).toFixed(2);
  console.log(`${condition} ${partition} r${round}: ${tm / 2} matches (${((performance.now() - started) / 1000).toFixed(0)} s), patch ${patch || 'none'}`);
  console.log(
    `  a team a match: open-play passes ${per('passes')}, completed ${per('completed')}, completed to a receiver beyond the line ${per('completedBeyond')} (of them on a run ${per('completedBeyondRun')}), offside calls ${per('offsides')} (calls ÷ (calls + beyond completions) ${(sum.offsides! / (sum.offsides! + sum.completedBeyond!)).toFixed(3)})`,
  );
  console.log(
    `  decision kind through ${per('throughKind')}, completed ${per('throughKindDone')}, completed beyond ${per('throughKindBeyond')}; per decision: attackers offside ${(sum.attackersOffsideAtDecision! / sum.decisions!).toFixed(3)}, behind runners ${(sum.runnersAtDecision! / sum.decisions!).toFixed(3)} (offside ${(sum.runnersOffsideAtDecision! / sum.decisions!).toFixed(3)})`,
  );
  const samples = done.flatMap((d) => d.samples);
  const adv = mp.advancedCounterVerdicts(samples);
  for (const line of mp.describeAdvancedCounters(adv)) console.log(line);
  const core = mp.buildTargetReport(samples);
  console.log(`core ${core.filter((x: { status: string }) => x.status === 'inside').length}/${core.length} inside`);
  for (const x of core)
    if (x.status !== 'inside' || /offside|goals|shots/i.test(x.id))
      console.log(`  ${x.status.padEnd(12)} ${x.id}: ${x.value?.toFixed(3)} [${x.interval?.[0].toFixed(3)}, ${x.interval?.[1].toFixed(3)}] band ${x.band.join('–')}`);
  const out = opt('out', '');
  if (out) writeFileSync(out, JSON.stringify({ sum, adv, core }));
}
