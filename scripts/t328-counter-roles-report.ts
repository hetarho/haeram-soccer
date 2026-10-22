/**
 * T328/T334 scratch report: reads scripts/t328-counter-roles.ts outputs, pools a run's pairings with
 * the base run's pairings the run did not play (`--others`, so no pairing counts twice), and prints
 * MATCH-29 (possession by time and by pass share, each tactic's points against each other), the
 * MATCH-23 core and the counter side's readings.
 *
 *   pnpm exec tsx scripts/t328-counter-roles-report.ts --variant <run.json> --others <base.json>
 *     [--rows]
 */
import { readFileSync } from 'node:fs';
import { M } from '../packages/engine/src/grid/record';
import {
  buildOutcomeTargetReport,
  buildTargetReport,
  describeTacticPairings,
  tacticPairingVerdicts,
  type MatchSample,
  type PairingReadout,
} from './lib/match-parity';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
interface Chunk {
  condition: string;
  samples: MatchSample[];
  roles: { shots: number; goals: number; xg: number; entries: number }[];
  counterSides: number;
  side: Record<string, number>;
  traced: {
    through: number;
    inBehind: number;
    box: number;
    shot: number;
    byRole: Record<string, number>;
    behindByRole: Record<string, number>;
  };
  invalid: number;
  invariants: number;
}
interface Run {
  variant: string;
  behaviour?: string;
  patch?: string;
  slots: [string, string][];
  chunks: Chunk[];
  seconds: number;
}
/** A readout's value, undefined when it is insufficient. */
const valueOf = (r: PairingReadout) => ('value' in r ? r.value : undefined);
const f3 = (x?: number, k = 1, d = 3) => (x === undefined ? 'n/a' : (k * x).toFixed(d));
const load = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Run;
const v = load(opt('variant')!);
const others = opt('others') ? load(opt('others')!) : undefined;
const withCounter = (id: string) => id.startsWith('tactics:') && id.includes('counter');
// The run's own pairings, and from `--others` only the pairings the run did not play.
const played = new Set(v.chunks.map((c) => c.condition));
const pairingChunks = [
  ...v.chunks.filter((c) => c.condition.startsWith('tactics:')),
  ...(others?.chunks.filter(
    (c) => c.condition.startsWith('tactics:') && !played.has(c.condition),
  ) ?? []),
];
const pairing = pairingChunks.flatMap((c) => c.samples);
const coreSamples = v.chunks
  .filter((c) => c.condition.startsWith('core:'))
  .flatMap((c) => c.samples);
const all = v.chunks;
console.log(
  `variant ${v.variant}${v.behaviour ? ` behaviour ${v.behaviour}` : ''}${v.patch ? ` patch ${v.patch}` : ''}: ${v.slots.map((s) => s[1]).join(', ')} (${v.seconds.toFixed(0)} s)`,
);
console.log(
  `matches: pairings ${pairing.length} (counter ${v.chunks.filter((c) => withCounter(c.condition)).reduce((a, c) => a + c.samples.length, 0)}), core ${coreSamples.length}; invalid records ${all.reduce((a, c) => a + c.invalid, 0)}, invariant failures ${all.reduce((a, c) => a + c.invariants, 0)}`,
);

if (pairing.length) {
  const report = tacticPairingVerdicts(pairing);
  const lines = describeTacticPairings(report);
  console.log(args.includes('--rows') ? lines.join('\n') : lines[0]);
  if (!args.includes('--rows'))
    for (const r of report.rows)
      if (r.status !== 'inside' || /counter|points|possession/.test(r.id)) {
        const val =
          r.kind === 'band'
            ? `${r.value?.toFixed(3)} [${r.interval?.[0].toFixed(3)}, ${r.interval?.[1].toFixed(3)}]`
            : r
                .differences!.map(
                  (d) =>
                    `${d.higher}−${d.lower} ${d.value?.toFixed(3)} [${d.interval?.[0].toFixed(3)}, ${d.interval?.[1].toFixed(3)}] ${d.status}`,
                )
                .join('; ');
        console.log(`  ${r.status.padEnd(12)} ${r.id}: ${val}`);
      }
  const pts = Object.entries(report.tactics).map(([t, x]) => `${t} ${f3(valueOf(x.points))}`);
  console.log(`  points a match: ${pts.join(', ')}`);
  // Each tactic's points a match against each other tactic, venues pooled.
  const tally: Record<string, [number, number]> = {};
  for (const s of pairing) {
    const [h, a] = s.record.tactics;
    const sc = s.record.regulation ?? s.record.score;
    const ph = sc.home > sc.away ? 3 : sc.home === sc.away ? 1 : 0;
    const pa = sc.away > sc.home ? 3 : sc.home === sc.away ? 1 : 0;
    for (const [me, foe, p] of [
      [h, a, ph],
      [a, h, pa],
    ] as const) {
      if (me === foe) continue;
      const t = (tally[`${me} v ${foe}`] ??= [0, 0]);
      t[0] += p;
      t[1]++;
    }
  }
  console.log(
    `  points v each: ${Object.entries(tally)
      .sort()
      .map(([k, [p, n]]) => `${k} ${(p / n).toFixed(2)}`)
      .join(', ')}`,
  );
  // Possession by pass share (MATCH-3 r19): the same ordering over attempted passes.
  const byPasses = pairing.map((s) => {
    const metrics = s.record.metrics.map((m) => {
      const copy = [...m];
      copy[M.possession] = m[M.passes]!;
      return copy;
    }) as typeof s.record.metrics;
    return { ...s, record: { ...s.record, metrics } };
  });
  const passReport = tacticPairingVerdicts(byPasses);
  const row = passReport.rows.find((r) => r.id === 'ordering:possession')!;
  console.log(
    `  pass-share possession ${row.status}: ${row.differences!.map((d) => `${d.higher}−${d.lower} ${f3(d.value, 1, 2)} [${f3(d.interval?.[0], 1, 2)}, ${f3(d.interval?.[1], 1, 2)}] ${d.status}`).join('; ')}`,
  );
  const timeRow = report.rows.find((r) => r.id === 'ordering:possession')!;
  console.log(`  time-share possession ${timeRow.status}`);
  const shares = Object.entries(passReport.tactics).map(
    ([t, x]) => `${t} ${f3(valueOf(x.possession), 1, 1)}%`,
  );
  console.log(`  pass shares: ${shares.join(', ')}`);
}

if (coreSamples.length) {
  const targets = buildTargetReport(coreSamples);
  const inside = targets.filter((t) => t.status === 'inside').length;
  console.log(`core ${coreSamples.length}: ${inside}/${targets.length} inside`);
  for (const t of targets)
    if (
      t.status !== 'inside' ||
      /goals|shots|xg|fw|mf|df|goalArea|goal-area|penalt|goalKick|goal kicks/i.test(t.id)
    )
      console.log(
        `  ${t.status.padEnd(12)} ${t.id}: ${t.value?.toFixed(3)} [${t.interval?.[0].toFixed(3)}, ${t.interval?.[1].toFixed(3)}] band ${t.band.join('–')}`,
      );
}

// MATCH-2's outcome curve from the run's gap conditions (T336), when it played them.
const gapSamples = v.chunks
  .filter((c) => c.condition.startsWith('gap:'))
  .flatMap((c) => c.samples);
if (gapSamples.length) {
  const curve = buildOutcomeTargetReport(gapSamples);
  console.log(
    `outcome curve ${gapSamples.length}: mean absolute error (−10…+40) ${f3(curve.meanAbsoluteError ?? undefined, 100, 2)} points`,
  );
  for (const r of curve.rows)
    console.log(
      `  gap ${String(r.bucket).padStart(3)} (${r.matches}, mean ${r.meanGap.toFixed(1)}): W/D/L ${(100 * r.observed.homeWin).toFixed(1)}/${(100 * r.observed.draw).toFixed(1)}/${(100 * r.observed.awayWin).toFixed(1)} v ${(100 * r.target.homeWin).toFixed(1)}/${(100 * r.target.draw).toFixed(1)}/${(100 * r.target.awayWin).toFixed(1)}, error ${(100 * r.error).toFixed(1)}`,
    );
}

// The counter side's readings in its pairing against press, and over every pairing.
const counterSide = (filter: (id: string) => boolean) => {
  const chunks = v.chunks.filter((c) => filter(c.condition));
  const sides = chunks.reduce((a, c) => a + c.counterSides, 0);
  if (!sides) return;
  const sum = (k: string) => chunks.reduce((a, c) => a + (c.side[k] ?? 0), 0) / sides;
  console.log(
    `  per counter side (${sides}): box entries ${sum('entries').toFixed(1)}, conceded ${sum('entriesConceded').toFixed(1)}, front-of-box ${sum('frontEntries').toFixed(1)}, through balls ${sum('through').toFixed(1)} / completed ${sum('throughDone').toFixed(1)}, shots ${sum('shots').toFixed(2)} v ${sum('shotsAgainst').toFixed(2)}, xG ${sum('xg').toFixed(2)} v ${sum('xgAgainst').toFixed(2)}, pass share ${((100 * sum('passes')) / (sum('passes') + sum('passesAgainst'))).toFixed(1)}%`,
  );
  const roles = Array.from({ length: 12 }, (_, i) =>
    chunks.reduce(
      (a, c) => ({
        shots: a.shots + c.roles[i]!.shots,
        goals: a.goals + c.roles[i]!.goals,
        xg: a.xg + c.roles[i]!.xg,
        entries: a.entries + c.roles[i]!.entries,
      }),
      { shots: 0, goals: 0, xg: 0, entries: 0 },
    ),
  );
  const totalGoals = roles.reduce((a, r) => a + r.goals, 0);
  console.log(
    '  by slot (shots / goals / xG / box entries a match; goal share): ' +
      roles
        .map(
          (r, i) =>
            (i < 11 ? `${v.slots[i]![0]} ${v.slots[i]![1]}` : 'subs') +
            ` ${(r.shots / sides).toFixed(2)}/${(r.goals / sides).toFixed(2)}/${(r.xg / 100 / sides).toFixed(2)}/${(r.entries / sides).toFixed(1)} ${((100 * r.goals) / Math.max(1, totalGoals)).toFixed(0)}%`,
        )
        .filter((_, i) => i > 0)
        .join('; '),
  );
  const t = chunks.reduce(
    (a, c) => ({
      through: a.through + c.traced.through,
      inBehind: a.inBehind + c.traced.inBehind,
      box: a.box + c.traced.box,
      shot: a.shot + c.traced.shot,
    }),
    { through: 0, inBehind: 0, box: 0, shot: 0 },
  );
  if (t.through) {
    const byRole: Record<string, [number, number]> = {};
    for (const c of chunks) {
      for (const [k, n] of Object.entries(c.traced.byRole)) (byRole[k] ??= [0, 0])[0] += n;
      for (const [k, n] of Object.entries(c.traced.behindByRole)) (byRole[k] ??= [0, 0])[1] += n;
    }
    console.log(
      `  traced completed through balls ${t.through}: receiver in behind at next touch ${((100 * t.inBehind) / t.through).toFixed(1)}%, reached the box ${((100 * t.box) / t.through).toFixed(1)}%, shot ${((100 * t.shot) / t.through).toFixed(1)}%; received by ${Object.entries(
        byRole,
      )
        .map(([k, [n, b]]) => `${k} ${n} (${b} in behind)`)
        .join(', ')}`,
    );
  }
};
console.log('counter v press (both venues):');
counterSide((id) => id === 'tactics:counter-press' || id === 'tactics:press-counter');
console.log('counter in every pairing:');
counterSide((id) => withCounter(id));
console.log('counter clubs in core:');
counterSide((id) => id.startsWith('core:'));
